import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSchoolPermission } from '../middleware/require-school-permission.js';
import {
  buildPromotionPlan, promotionToken, validEducationLevels
} from '../utils/school-year-promotion.js';

const router = Router();
const validId = (value) => /^[1-9]\d*$/.test(String(value ?? ''));

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function readInput(body) {
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  const startDate = body?.startDate;
  const endDate = body?.endDate;
  if (!label || label.length > 40 || !validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    return { error: 'Nama tahun pelajaran dan rentang tanggal harus diisi dengan format yang valid.' };
  }
  if (body.copyPreviousYearData != null && typeof body.copyPreviousYearData !== 'boolean') {
    return { error: 'Pilihan salin data tahun sebelumnya tidak valid.' };
  }
  if (body.isActive != null && typeof body.isActive !== 'boolean') {
    return { error: 'Pilihan tahun pelajaran aktif tidak valid.' };
  }
  return {
    value: {
      label,
      startDate,
      endDate,
      isActive: body.isActive === true,
      copyPreviousYearData: body.copyPreviousYearData === true,
      previewToken: typeof body.previewToken === 'string' ? body.previewToken : ''
    }
  };
}

function promotionResponse(sourceYear, educationLevel, plan, token) {
  const counts = {
    total: plan.length,
    promoted: plan.filter((student) => student.promotion.action === 'promoted').length,
    graduated: plan.filter((student) => student.promotion.action === 'graduated').length,
    unmapped: plan.filter((student) => student.promotion.action === 'unmapped').length
  };
  return {
    sourceYear: { id: String(sourceYear.id), label: sourceYear.label },
    educationLevel,
    counts,
    students: plan.slice(0, 250).map((student) => ({
      id: String(student.id),
      name: student.name,
      nis_nisn: student.nis_nisn,
      rombel: student.rombel,
      promotionStatus: student.promotion.action,
      nextRombel: student.promotion.nextRombel
    })),
    truncated: plan.length > 250,
    previewToken: token
  };
}

async function loadPromotionData(connection, schoolId, lock = false) {
  const lockSql = lock ? ' FOR UPDATE' : '';
  const [years] = await connection.execute(
    `SELECT id, label, DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date, students_archived_at FROM school_years
     WHERE school_id = ? AND is_active = 1 LIMIT 1${lockSql}`,
    [schoolId]
  );
  if (!years[0]) return { error: 'Tidak ada tahun pelajaran aktif untuk disalin.' };
  const [schools] = await connection.execute(
    `SELECT education_level FROM tenants_schools WHERE id = ? LIMIT 1${lockSql}`,
    [schoolId]
  );
  const educationLevel = schools[0]?.education_level;
  if (!validEducationLevels.has(educationLevel)) {
    return { error: 'Pilih jenjang pendidikan pada menu Identitas Sekolah sebelum menaikkan kelas.' };
  }
  const [archived] = await connection.execute(
    `SELECT id FROM school_years
     WHERE id = ? AND school_id = ? AND students_archived_at IS NOT NULL
     UNION ALL
     SELECT id FROM school_year_student_archives WHERE school_id = ? AND school_year_id = ? LIMIT 1`,
    [years[0].id, schoolId, schoolId, years[0].id]
  );
  if (archived.length) return { error: 'Data tahun pelajaran ini sudah pernah diarsipkan.' };
  const [students] = await connection.execute(
    `SELECT id, nis_nisn, name, email, rombel, phone, gender, status
     FROM users
     WHERE school_id = ? AND role = 'member' AND status = 'active'
     ORDER BY id ASC${lockSql}`,
    [schoolId]
  );
  const plan = buildPromotionPlan(students, educationLevel);
  return {
    sourceYear: years[0],
    educationLevel,
    students,
    plan,
    previewToken: promotionToken(years[0].id, educationLevel, students)
  };
}

router.get('/', requireSchoolPermission('master.academic-years', 'view'), async (req, res, next) => {
  try {
    const [years] = await pool.execute(
      `SELECT y.id, y.label, y.start_date, y.end_date, y.is_active, y.created_at,
              (y.students_archived_at IS NOT NULL OR EXISTS (
                SELECT 1 FROM school_year_student_archives a
                WHERE a.school_id = y.school_id AND a.school_year_id = y.id
              )) AS has_archive
       FROM school_years y WHERE y.school_id = ?
       ORDER BY y.start_date DESC, y.id DESC`,
      [req.school.id]
    );
    return res.json({
      years: years.map((year) => ({
        id: String(year.id),
        label: year.label,
        startDate: year.start_date,
        endDate: year.end_date,
        isActive: Boolean(year.is_active),
        hasArchive: Boolean(year.has_archive),
        createdAt: year.created_at
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/promotion-preview', requireSchoolPermission('master.academic-years', 'edit'), async (req, res, next) => {
  try {
    const data = await loadPromotionData(pool, req.school.id);
    if (data.error) return res.status(409).json({ message: data.error });
    return res.json(promotionResponse(data.sourceYear, data.educationLevel, data.plan, data.previewToken));
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireSchoolPermission('master.academic-years', 'edit'), async (req, res, next) => {
  const { value, error } = readInput(req.body);
  if (error) return res.status(400).json({ message: error });
  if (value.copyPreviousYearData && !/^[a-f0-9]{64}$/.test(value.previewToken)) {
    return res.status(400).json({ message: 'Tampilkan dan konfirmasi pratinjau kenaikan kelas terlebih dahulu.' });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [overlaps] = await connection.execute(
      `SELECT id FROM school_years
       WHERE school_id = ? AND start_date <= ? AND end_date >= ?
       LIMIT 1 FOR UPDATE`,
      [req.school.id, value.endDate, value.startDate]
    );
    if (overlaps.length) {
      await connection.rollback();
      return res.status(409).json({ message: 'Rentang tanggal bertabrakan dengan tahun pelajaran yang sudah ada.' });
    }

    let promotionData = null;
    if (value.copyPreviousYearData) {
      promotionData = await loadPromotionData(connection, req.school.id, true);
      if (promotionData.error) {
        await connection.rollback();
        return res.status(409).json({ message: promotionData.error });
      }
      if (promotionData.sourceYear.end_date >= value.startDate) {
        await connection.rollback();
        return res.status(400).json({ message: 'Tanggal mulai tahun baru harus setelah tanggal akhir tahun pelajaran sumber.' });
      }
      if (promotionData.previewToken !== value.previewToken) {
        await connection.rollback();
        return res.status(409).json({ message: 'Data siswa berubah setelah pratinjau dibuat. Perbarui pratinjau sebelum melanjutkan.' });
      }
      if (promotionData.plan.some((student) => student.promotion.action === 'unmapped')) {
        await connection.rollback();
        return res.status(409).json({ message: 'Ada rombel siswa yang belum dikenali. Perbaiki rombel tersebut sebelum kenaikan kelas.' });
      }
    }

    const activateNewYear = value.isActive || value.copyPreviousYearData;
    if (promotionData) {
      await connection.execute(
        `UPDATE school_years SET is_active = 0, students_archived_at = NOW()
         WHERE id = ? AND school_id = ?`,
        [promotionData.sourceYear.id, req.school.id]
      );
    } else if (activateNewYear) {
      await connection.execute('UPDATE school_years SET is_active = 0 WHERE school_id = ?', [req.school.id]);
    }
    const [result] = await connection.execute(
      `INSERT INTO school_years (school_id, label, start_date, end_date, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.school.id, value.label, value.startDate, value.endDate, activateNewYear ? 1 : 0, req.school.userId]
    );

    if (promotionData) {
      const archiveColumns = [
        'school_id', 'school_year_id', 'student_id', 'nis_nisn', 'name', 'email',
        'rombel', 'phone', 'gender', 'status', 'promotion_status', 'next_rombel'
      ];
      for (let offset = 0; offset < promotionData.plan.length; offset += 200) {
        const batch = promotionData.plan.slice(offset, offset + 200);
        const placeholders = batch.map(() => `(${archiveColumns.map(() => '?').join(', ')})`).join(', ');
        const values = batch.flatMap((student) => [
          req.school.id,
          promotionData.sourceYear.id,
          student.id,
          student.nis_nisn,
          student.name,
          student.email,
          student.rombel,
          student.phone,
          student.gender,
          student.status,
          student.promotion.action,
          student.promotion.nextRombel
        ]);
        if (batch.length) {
          await connection.execute(
            `INSERT INTO school_year_student_archives (${archiveColumns.join(', ')})
             VALUES ${placeholders}`,
            values
          );
        }
      }

      const promoted = promotionData.plan.filter((student) => student.promotion.action === 'promoted');
      for (let offset = 0; offset < promoted.length; offset += 200) {
        const batch = promoted.slice(offset, offset + 200);
        const caseSql = batch.map(() => 'WHEN ? THEN ?').join(' ');
        const idSql = batch.map(() => '?').join(', ');
        const values = [
          ...batch.flatMap((student) => [student.id, student.promotion.nextRombel]),
          req.school.id,
          ...batch.map((student) => student.id)
        ];
        await connection.execute(
          `UPDATE users SET rombel = CASE id ${caseSql} ELSE rombel END
           WHERE school_id = ? AND role = 'member' AND status = 'active' AND id IN (${idSql})`,
          values
        );
      }

      const graduates = promotionData.plan
        .filter((student) => student.promotion.action === 'graduated')
        .map((student) => student.id);
      for (let offset = 0; offset < graduates.length; offset += 500) {
        const batch = graduates.slice(offset, offset + 500);
        const idSql = batch.map(() => '?').join(', ');
        await connection.execute(
          `UPDATE users SET status = 'inactive'
           WHERE school_id = ? AND role = 'member' AND status = 'active' AND id IN (${idSql})`,
          [req.school.id, ...batch]
        );
      }
    }

    await connection.commit();
    return res.status(201).json({
      year: {
        id: String(result.insertId),
        label: value.label,
        startDate: value.startDate,
        endDate: value.endDate,
        isActive: activateNewYear
      },
      promotion: promotionData ? {
        sourceYear: promotionData.sourceYear.label,
        ...promotionResponse(
          promotionData.sourceYear,
          promotionData.educationLevel,
          promotionData.plan,
          promotionData.previewToken
        ).counts
      } : null,
      message: promotionData
        ? `Tahun pelajaran berhasil dibuat. ${promotionData.plan.filter((student) => student.promotion.action === 'promoted').length} siswa naik kelas dan ${promotionData.plan.filter((student) => student.promotion.action === 'graduated').length} siswa lulus menjadi nonaktif.`
        : 'Tahun pelajaran berhasil ditambahkan.'
    });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Nama tahun pelajaran sudah digunakan.' });
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/:id/activate', requireSchoolPermission('master.academic-years', 'edit'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID tahun pelajaran tidak valid.' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [years] = await connection.execute(
      'SELECT id FROM school_years WHERE id = ? AND school_id = ? FOR UPDATE',
      [id, req.school.id]
    );
    if (!years[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Tahun pelajaran tidak ditemukan.' });
    }
    const [archives] = await connection.execute(
      `SELECT id FROM school_years
       WHERE id = ? AND school_id = ? AND students_archived_at IS NOT NULL
       UNION ALL
       SELECT id FROM school_year_student_archives WHERE school_id = ? AND school_year_id = ? LIMIT 1`,
      [id, req.school.id, req.school.id, id]
    );
    if (archives.length) {
      await connection.rollback();
      return res.status(409).json({ message: 'Tahun pelajaran arsip tidak dapat diaktifkan kembali.' });
    }
    await connection.execute('UPDATE school_years SET is_active = 0 WHERE school_id = ?', [req.school.id]);
    await connection.execute(
      'UPDATE school_years SET is_active = 1 WHERE id = ? AND school_id = ?',
      [id, req.school.id]
    );
    await connection.commit();
    return res.json({ message: 'Tahun pelajaran aktif berhasil diperbarui.' });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.delete('/:id', requireSchoolPermission('master.academic-years', 'delete'), async (req, res, next) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(400).json({ message: 'ID tahun pelajaran tidak valid.' });
  try {
    const [archivedStudents] = await pool.execute(
      `SELECT id FROM school_years
       WHERE id = ? AND school_id = ? AND students_archived_at IS NOT NULL
       UNION ALL
       SELECT id FROM school_year_student_archives WHERE school_id = ? AND school_year_id = ? LIMIT 1`,
      [id, req.school.id, req.school.id, id]
    );
    if (archivedStudents.length) {
      return res.status(409).json({ message: 'Tahun pelajaran yang memiliki arsip siswa tidak dapat dihapus.' });
    }
    const [result] = await pool.execute(
      'DELETE FROM school_years WHERE id = ? AND school_id = ? AND is_active = 0',
      [id, req.school.id]
    );
    if (!result.affectedRows) {
      const [years] = await pool.execute(
        'SELECT id, is_active FROM school_years WHERE id = ? AND school_id = ? LIMIT 1',
        [id, req.school.id]
      );
      if (!years[0]) return res.status(404).json({ message: 'Tahun pelajaran tidak ditemukan.' });
      return res.status(409).json({ message: 'Tahun pelajaran aktif tidak dapat dihapus.' });
    }
    return res.json({ message: 'Tahun pelajaran berhasil dihapus.' });
  } catch (error) {
    return next(error);
  }
});

export default router;
