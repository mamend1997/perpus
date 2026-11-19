import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';
import JsBarcode from 'jsbarcode';
import {
  Camera, Download, FileSpreadsheet, LoaderCircle, Pencil, Plus, Printer, Search, Trash2, Upload, Users, X
} from 'lucide-react';
import SchoolConfirmDialog from './SchoolConfirmDialog.jsx';
import SchoolPrintHeader from './SchoolPrintHeader.jsx';
import {
  assignClassStudents, createStudent, createStudentClass, deleteStudent, deleteStudentClasses, deleteStudents,
  fetchClassStudents, fetchInactiveStudents, fetchStudentClasses, fetchStudents, importStudents,
  updateStudent, updateStudentClass
} from './schoolStudentApi.js';
import { resizeSchoolImage } from './schoolImageUtils.js';

const studentPageSize = 100;
const templateHeaders = ['NIS/NISN', 'Nama Lengkap', 'Kelas/Rombel', 'Jenis Kelamin', 'No. WhatsApp', 'Status'];
const emptyStudent = { nis_nisn: '', name: '', rombel: '', gender: '', phone: '', status: 'active', photo: null };

function normalizePagination(value) {
  const page = Number(value?.page);
  const total = Number(value?.total);
  const totalPages = Number(value?.totalPages);
  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    total: Number.isSafeInteger(total) && total >= 0 ? total : 0,
    totalPages: Number.isSafeInteger(totalPages) && totalPages >= 0 ? totalPages : 0
  };
}

function studentStatusLabel(status) {
  return status === 'active' ? 'Aktif' : 'Nonaktif';
}

function genderLabel(gender) {
  return ({ male: 'Laki-laki', female: 'Perempuan', other: 'Lainnya' })[gender] || '—';
}

function cellText(cell) {
  if (cell?.text != null) return String(cell.text).trim();
  if (cell?.value == null) return '';
  if (typeof cell.value === 'object' && cell.value.text) return String(cell.value.text).trim();
  return String(cell.value).trim();
}

function StudentForm({ student, classes, classesLoading, classesError, onRetryClasses, onClose, onSave }) {
  const [form, setForm] = useState(student ? { ...emptyStudent, ...student } : emptyStudent);
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const classOptions = classes.filter((item) => item.id && !item.isUnassigned);
  const hasSavedClass = classOptions.some((item) => item.className === form.rombel);

  async function choosePhoto(file) {
    if (!file) return;
    setPhotoLoading(true);
    setPhotoError('');
    try {
      const photo = await resizeSchoolImage(file);
      setForm((value) => ({ ...value, photo }));
    } catch (photoLoadError) {
      setPhotoError(photoLoadError.message);
    } finally {
      setPhotoLoading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal((
    <div className="master-modal-backdrop student-form-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="master-modal student-form-modal" role="dialog" aria-modal="true" aria-labelledby="student-form-title">
        <header className="master-modal-heading"><div><span className="library-eyebrow">DATA ANGGOTA</span><h2 id="student-form-title">{student ? 'Edit Data Siswa' : 'Tambah Siswa'}</h2></div><button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form">×</button></header>
        {error && <div className="library-error" role="alert">{error}</div>}
        <form className="student-form-grid" onSubmit={submit}>
          <label>NIS / NISN<input value={form.nis_nisn || ''} onChange={(event) => setForm((value) => ({ ...value, nis_nisn: event.target.value }))} maxLength={40} required /></label>
          <label>Nama Lengkap<input value={form.name || ''} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} maxLength={180} required /></label>
          <div className="student-class-field">
            <label htmlFor="student-rombel">Kelas / Rombel</label>
            <select id="student-rombel" value={form.rombel || ''} onChange={(event) => setForm((value) => ({ ...value, rombel: event.target.value }))} disabled={classesLoading}>
              <option value="">{classesLoading ? 'Memuat data kelas...' : 'Pilih kelas / rombel'}</option>
              {form.rombel && !hasSavedClass && <option value={form.rombel}>{form.rombel} (kelas lama)</option>}
              {classOptions.map((item) => <option value={item.className} key={item.id}>{item.className}</option>)}
            </select>
            {classesError
              ? <small className="master-form-error" role="alert">Data kelas tidak dapat dimuat: {classesError} <button type="button" onClick={onRetryClasses}>Coba lagi</button></small>
              : !classesLoading && classOptions.length === 0 && <small>Belum ada kelas. Tambahkan kelas di tab Data Rombel terlebih dahulu.</small>}
          </div>
          <label>Jenis Kelamin<select value={form.gender || ''} onChange={(event) => setForm((value) => ({ ...value, gender: event.target.value }))}><option value="">Pilih</option><option value="male">Laki-laki</option><option value="female">Perempuan</option><option value="other">Lainnya</option></select></label>
          <label>Kontak WhatsApp<input type="tel" value={form.phone || ''} onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))} maxLength={30} /></label>
          <label>Status Siswa<select value={form.status || 'active'} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value }))}><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
          <div className="student-photo-field">
            <span>Foto Siswa <small>(opsional)</small></span>
            <div className="student-photo-control">
              {form.photo
                ? <img src={form.photo} alt="Pratinjau foto siswa" />
                : <div className="student-photo-placeholder"><Camera size={22} /><span>Belum ada foto</span></div>}
              <div>
                <label className="master-button master-button-light">{photoLoading ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Upload size={15} />}Pilih Foto
                  <input type="file" accept="image/jpeg,image/png,image/webp" disabled={photoLoading || saving} onChange={(event) => { void choosePhoto(event.target.files?.[0]); event.target.value = ''; }} />
                </label>
                {form.photo && <button type="button" className="master-button master-button-muted" onClick={() => setForm((value) => ({ ...value, photo: null }))} disabled={photoLoading || saving}><X size={15} />Hapus Foto</button>}
                <small>JPG, PNG, atau WebP; maksimal 5 MB.</small>
              </div>
            </div>
            {photoError && <small className="library-error" role="alert">{photoError}</small>}
          </div>
          <footer className="master-modal-actions student-form-wide">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving || photoLoading}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving || photoLoading}>{saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Plus size={15} />}{saving ? 'Menyimpan...' : photoLoading ? 'Memproses Foto...' : 'Simpan Data'}</button>
          </footer>
        </form>
      </section>
    </div>
  ), document.body);
}

function SchoolClassForm({ schoolClass, gradeLevels, onClose, onSave }) {
  const [name, setName] = useState(schoolClass?.name || '');
  const [gradeLevel, setGradeLevel] = useState(schoolClass ? schoolClass.gradeLevel || '' : gradeLevels[0] || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({ name, gradeLevel });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal((
    <div className="master-modal-backdrop student-form-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="master-modal school-class-modal" role="dialog" aria-modal="true" aria-labelledby="school-class-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">MASTER KELAS</span><h2 id="school-class-title">{schoolClass ? 'Edit Kelas' : 'Tambah Kelas'}</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form kelas">×</button>
        </header>
        {error && <div className="library-error" role="alert">{error}</div>}
        <form className="school-class-form" onSubmit={submit}>
          <label>Nama Kelas
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={70} placeholder="Contoh: RPL 1" required autoFocus />
            <small>Nama lengkap akan digabung dengan tingkat kelas.</small>
          </label>
          <label>Tingkat Kelas
            <select value={gradeLevel} onChange={(event) => setGradeLevel(event.target.value)} required>
              <option value="" disabled>Pilih tingkat kelas</option>
              {gradeLevels.map((level) => <option value={level} key={level}>{level}</option>)}
            </select>
          </label>
          <footer className="master-modal-actions">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving || !gradeLevels.length}>
              {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Plus size={15} />}
              {saving ? 'Menyimpan...' : 'Simpan Kelas'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  ), document.body);
}

function ClassStudentsModal({ schoolClass, onClose, onSave }) {
  const [students, setStudents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [original, setOriginal] = useState({});
  const [selection, setSelection] = useState({});

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchClassStudents(schoolClass.id, { page, limit: 25, search, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        const nextStudents = result.students || [];
        setStudents(nextStudents);
        setPagination(normalizePagination(result.pagination));
        setOriginal((current) => {
          const next = { ...current };
          nextStudents.forEach((student) => {
            const id = String(student.id);
            if (!Object.prototype.hasOwnProperty.call(next, id)) next[id] = Boolean(student.assigned);
          });
          return next;
        });
      })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [schoolClass.id, page, search]);

  function isSelected(student) {
    const id = String(student.id);
    return Object.prototype.hasOwnProperty.call(selection, id) ? selection[id] : Boolean(student.assigned);
  }

  function togglePage(checked) {
    setSelection((current) => {
      const next = { ...current };
      students.forEach((student) => { next[String(student.id)] = checked; });
      return next;
    });
  }

  const changes = Object.keys(selection)
    .filter((id) => Object.prototype.hasOwnProperty.call(original, id) && selection[id] !== original[id]);
  const assignIds = changes.filter((id) => selection[id]);
  const unassignIds = changes.filter((id) => !selection[id]);
  const allPageSelected = students.length > 0 && students.every(isSelected);

  async function submit() {
    if (!changes.length || changes.length > 500) return;
    setSaving(true);
    setError('');
    try {
      await onSave({ assignIds, unassignIds });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal((
    <div className="master-modal-backdrop student-form-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="master-modal class-students-modal" role="dialog" aria-modal="true" aria-labelledby="class-students-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">PENETAPAN SISWA</span><h2 id="class-students-title">{schoolClass.className}</h2><p>Pilih siswa untuk ditambahkan ke kelas atau lepaskan centang untuk mengeluarkannya.</p></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup penetapan siswa">×</button>
        </header>
        {error && <div className="library-error" role="alert">{error}</div>}
        <label className="master-search class-students-search"><Search size={16} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cari nama atau NIS/NISN..." maxLength={100} /></label>
        <div className="class-students-toolbar">
          <span>{pagination.total.toLocaleString('id-ID')} siswa · halaman ini {students.length}</span>
          <label><input type="checkbox" checked={allPageSelected} onChange={(event) => togglePage(event.target.checked)} disabled={loading || !students.length} /> Pilih semua di halaman</label>
        </div>
        <div className="class-students-list">
          {loading ? <div className="class-students-empty"><LoaderCircle size={18} className="book-stock-spinner" />Memuat data siswa...</div>
            : students.length ? students.map((student) => (
              <label className={`class-student-option ${isSelected(student) ? 'is-selected' : ''}`} key={student.id}>
                <input type="checkbox" checked={isSelected(student)} onChange={(event) => setSelection((current) => ({ ...current, [String(student.id)]: event.target.checked }))} />
                <span><b>{student.name}</b><small>{student.nis_nisn || 'Tanpa NIS/NISN'} <i /> {student.rombel || 'Belum diatur'}</small></span>
                <span className="class-student-assigned">{isSelected(student) ? 'Dipilih' : 'Tidak dipilih'}</span>
              </label>
            )) : <div className="class-students-empty">Tidak ada siswa yang cocok dengan pencarian.</div>}
        </div>
        <div className="class-students-footer">
          <span>{assignIds.length} ditambahkan · {unassignIds.length} dilepas</span>
          <div>
            <button type="button" className="master-icon-button" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Halaman siswa sebelumnya">‹</button>
            <small>Halaman {pagination.totalPages ? page : 0} / {Math.max(1, pagination.totalPages)}</small>
            <button type="button" className="master-icon-button" disabled={loading || page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)} aria-label="Halaman siswa berikutnya">›</button>
          </div>
        </div>
        {changes.length > 500 && <div className="library-error" role="alert">Maksimal 500 perubahan siswa dapat disimpan sekaligus.</div>}
        <footer className="master-modal-actions">
          <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
          <button type="button" className="master-button master-button-primary" onClick={submit} disabled={saving || !changes.length || changes.length > 500}>
            {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Users size={15} />}
            {saving ? 'Menyimpan...' : `Simpan Penetapan${changes.length ? ` (${changes.length})` : ''}`}
          </button>
        </footer>
      </section>
    </div>
  ), document.body);
}

function ImportStudentsModal({ onClose, onImport }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function parseFile(file) {
    setError('');
    setRows([]);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 5 * 1024 * 1024) {
      setError('Pilih file .xlsx dengan ukuran maksimal 5 MB.');
      return;
    }
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet || sheet.rowCount < 2) throw new Error('File belum memiliki baris data siswa.');
      const headers = sheet.getRow(1).values.slice(1).map((value) => String(value || '').trim().toLocaleLowerCase('id-ID'));
      const requiredHeaders = ['nis/nisn', 'nama lengkap', 'kelas/rombel', 'jenis kelamin', 'no. whatsapp', 'status'];
      const indexes = Object.fromEntries(requiredHeaders.map((header) => [header, headers.indexOf(header)]));
      const missingHeaders = requiredHeaders.filter((header) => indexes[header] < 0);
      if (missingHeaders.length) throw new Error(`Kolom wajib tidak ditemukan: ${missingHeaders.join(', ')}.`);
      const importedRows = [];
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const values = row.values.slice(1);
        if (values.every((value) => value == null || value === '')) continue;
        const genderRaw = cellText(row.getCell(indexes['jenis kelamin'] + 1)).toLocaleLowerCase('id-ID');
        const statusRaw = cellText(row.getCell(indexes.status + 1)).toLocaleLowerCase('id-ID');
        const gender = genderRaw === 'laki-laki' || genderRaw === 'male' ? 'male'
          : genderRaw === 'perempuan' || genderRaw === 'female' ? 'female'
            : genderRaw === 'lainnya' || genderRaw === 'other' ? 'other' : '';
        const status = !statusRaw || statusRaw === 'aktif' || statusRaw === 'active' ? 'active'
          : statusRaw === 'nonaktif' || statusRaw === 'inactive' ? 'inactive' : '';
        if (genderRaw && !gender) throw new Error(`Baris ${rowNumber}: jenis kelamin tidak dikenali.`);
        if (!status) throw new Error(`Baris ${rowNumber}: status harus Aktif atau Nonaktif.`);
        importedRows.push({
          nis_nisn: cellText(row.getCell(indexes['nis/nisn'] + 1)),
          name: cellText(row.getCell(indexes['nama lengkap'] + 1)),
          rombel: cellText(row.getCell(indexes['kelas/rombel'] + 1)),
          gender,
          phone: cellText(row.getCell(indexes['no. whatsapp'] + 1)),
          status
        });
      }
      if (!importedRows.length || importedRows.length > 500) throw new Error('Jumlah baris data harus antara 1 sampai 500 siswa.');
      setRows(importedRows);
      setFileName(file.name);
    } catch (parseError) {
      setError(parseError.message || 'File Excel tidak dapat dibaca.');
    }
  }

  async function downloadTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data Siswa');
    sheet.addRow(templateHeaders);
    sheet.columns = templateHeaders.map(() => ({ width: 22 }));
    const output = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'template-data-siswa.xlsx';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await onImport(rows);
    } catch (importError) {
      setError(importError.message);
    } finally {
      setBusy(false);
    }
  }

  return createPortal((
    <div className="master-modal-backdrop student-form-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="master-modal student-import-modal" role="dialog" aria-modal="true" aria-labelledby="student-import-title">
        <header className="master-modal-heading"><div><span className="library-eyebrow">IMPORT SISWA</span><h2 id="student-import-title">Import Data Siswa</h2></div><button type="button" className="master-icon-button" onClick={onClose} disabled={busy} aria-label="Tutup import">×</button></header>
        <div className="student-import-content">
          <button type="button" className="master-button master-button-light" onClick={downloadTemplate}><Download size={15} />Unduh Template Excel (.xlsx)</button>
          <label className={`student-import-drop ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void parseFile(event.dataTransfer.files?.[0]); }}>
            <Upload size={23} /><b>Seret file ke sini atau klik untuk mencari</b><span>{fileName || 'Format .xlsx, maksimal 5 MB; data akan ditinjau sebelum diimpor.'}</span>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { void parseFile(event.target.files?.[0]); event.target.value = ''; }} />
          </label>
          {error && <div className="library-error" role="alert">{error}</div>}
          {rows.length > 0 && <div className="student-import-preview">
            <div className="catalog-table-heading"><div><h3>Pratinjau {rows.length} siswa</h3><p>Periksa kolom sebelum menekan tombol import.</p></div></div>
            <div className="master-table-scroll"><table className="master-table"><thead><tr>{templateHeaders.map((header) => <th key={header}>{header}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 10).map((row, index) => <tr key={`${row.nis_nisn}-${index}`}><td>{row.nis_nisn}</td><td>{row.name}</td><td>{row.rombel || '—'}</td><td>{genderLabel(row.gender)}</td><td>{row.phone || '—'}</td><td>{studentStatusLabel(row.status)}</td></tr>)}</tbody>
            </table></div>
            {rows.length > 10 && <small>Menampilkan 10 baris pertama; total {rows.length} siswa akan diimpor.</small>}
          </div>}
        </div>
        <footer className="master-modal-actions">
          <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={busy}>Batal</button>
          <button type="button" className="master-button master-button-primary" onClick={submit} disabled={busy || !rows.length}>{busy ? <LoaderCircle size={15} className="book-stock-spinner" /> : <FileSpreadsheet size={15} />}{busy ? 'Mengimpor...' : `Import ${rows.length || ''} Siswa`}</button>
        </footer>
      </section>
    </div>
  ), document.body);
}

export default function SchoolStudentsPage({ rights, schoolIdentity }) {
  const canEdit = Boolean(rights?.edit);
  const canDelete = Boolean(rights?.delete);
  const [tab, setTab] = useState('students');
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [classesError, setClassesError] = useState('');
  const [inactiveStudents, setInactiveStudents] = useState([]);
  const [inactivePagination, setInactivePagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [inactivePage, setInactivePage] = useState(1);
  const [inactiveQueryInput, setInactiveQueryInput] = useState('');
  const [inactiveSearch, setInactiveSearch] = useState('');
  const [inactiveLoading, setInactiveLoading] = useState(false);
  const [inactiveError, setInactiveError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState({});
  const [editor, setEditor] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [classEditor, setClassEditor] = useState(null);
  const [classAssignment, setClassAssignment] = useState(null);
  const [selectedClasses, setSelectedClasses] = useState({});
  const [classDeleteTarget, setClassDeleteTarget] = useState(null);
  const [classDeleting, setClassDeleting] = useState(false);
  const [classDeleteError, setClassDeleteError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [pdfRows, setPdfRows] = useState(null);
  const [memberCards, setMemberCards] = useState(null);
  const selectedIds = Object.keys(selected);
  const allVisibleSelected = students.length > 0 && students.every((student) => Boolean(selected[String(student.id)]));
  const classStudentCount = classes.reduce((total, item) => total + Number(item.studentCount || 0), 0);
  const loadedStudentCount = (page - 1) * studentPageSize + students.length;
  const studentCountFallback = search || classFilter || statusFilter
    ? loadedStudentCount
    : Math.max(classStudentCount, loadedStudentCount);
  const studentCount = Math.max(pagination.total, studentCountFallback);
  const studentTotalPages = Math.max(pagination.totalPages, Math.ceil(studentCount / studentPageSize));
  const managedClasses = classes.filter((item) => item.id && !item.isUnassigned);
  const selectedClassIds = Object.keys(selectedClasses);
  const allClassesSelected = managedClasses.length > 0
    && managedClasses.every((item) => Boolean(selectedClasses[String(item.id)]));
  const classColumnCount = 6 + (canDelete ? 1 : 0);
  const columnCount = 9 + (canDelete ? 1 : 0);

  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(queryInput.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timeout);
  }, [queryInput]);

  useEffect(() => {
    setSelected({});
  }, [page, search, classFilter, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    setClassesLoading(true);
    setClassesError('');
    fetchStudentClasses(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setClasses(result.classes || []);
        setGradeLevels(result.gradeLevels || []);
      })
      .catch((loadError) => { if (!controller.signal.aborted) setClassesError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setClassesLoading(false); });
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setInactiveSearch(inactiveQueryInput.trim());
      setInactivePage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [inactiveQueryInput]);

  useEffect(() => {
    const controller = new AbortController();
    setInactiveLoading(true);
    setInactiveError('');
    fetchInactiveStudents({
      page: inactivePage,
      limit: studentPageSize,
      search: inactiveSearch,
      signal: controller.signal
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setInactiveStudents(result.students || []);
        setInactivePagination(normalizePagination(result.pagination));
      })
      .catch((loadError) => { if (!controller.signal.aborted) setInactiveError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setInactiveLoading(false); });
    return () => controller.abort();
  }, [inactivePage, inactiveSearch, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchStudents({ page, limit: studentPageSize, search, rombel: classFilter, status: statusFilter, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setStudents(result.students || []);
        const nextPagination = normalizePagination(result.pagination);
        setPagination(nextPagination);
        if (nextPagination.totalPages && page > nextPagination.totalPages) setPage(nextPagination.totalPages);
      })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, search, classFilter, statusFilter, refreshKey]);

  useEffect(() => {
    if (!pdfRows && !memberCards) return undefined;
    const timer = window.setTimeout(() => window.print(), 100);
    return () => window.clearTimeout(timer);
  }, [pdfRows, memberCards]);

  useEffect(() => {
    function clearPrintRows() {
      setPdfRows(null);
      setMemberCards(null);
    }
    window.addEventListener('afterprint', clearPrintRows);
    return () => window.removeEventListener('afterprint', clearPrintRows);
  }, []);

  async function saveStudent(data) {
    if (editor?.id) await updateStudent(editor.id, data);
    else await createStudent(data);
    setEditor(null);
    setNotice(editor?.id ? 'Data siswa berhasil diperbarui.' : 'Data siswa berhasil ditambahkan.');
    setRefreshKey((value) => value + 1);
  }

  async function runImport(rows) {
    const result = await importStudents(rows);
    setImportOpen(false);
    setNotice(result.message);
    setQueryInput('');
    setSearch('');
    setClassFilter('');
    setStatusFilter('');
    setSelected({});
    setPage(1);
    setRefreshKey((value) => value + 1);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const result = deleteTarget === 'selected'
        ? await deleteStudents(selectedIds)
        : await deleteStudent(deleteTarget.id);
      setNotice(result.message);
      setDeleteTarget(null);
      setSelected({});
      setRefreshKey((value) => value + 1);
    } catch (failure) {
      setDeleteError(failure.message);
    } finally {
      setDeleting(false);
    }
  }

  async function saveSchoolClass(data) {
    const result = classEditor?.id
      ? await updateStudentClass(classEditor.id, data)
      : await createStudentClass(data);
    if (classEditor?.id && classFilter === classEditor.className) setClassFilter(result.class.className);
    setClassEditor(null);
    setSelectedClasses({});
    setNotice(result.message);
    setRefreshKey((value) => value + 1);
  }

  async function saveClassAssignments(changes) {
    const result = await assignClassStudents(classAssignment.id, changes);
    setClassAssignment(null);
    setNotice(result.message);
    setRefreshKey((value) => value + 1);
  }

  function toggleVisibleClasses(checked) {
    setSelectedClasses((current) => {
      const next = { ...current };
      managedClasses.forEach((item) => {
        const id = String(item.id);
        if (checked) next[id] = true;
        else delete next[id];
      });
      return next;
    });
  }

  async function confirmDeleteClasses() {
    if (!classDeleteTarget) return;
    const targets = classDeleteTarget === 'selected'
      ? managedClasses.filter((item) => selectedClasses[String(item.id)])
      : [classDeleteTarget];
    if (!targets.length) return;
    setClassDeleting(true);
    setClassDeleteError('');
    try {
      const result = await deleteStudentClasses(targets.map((item) => item.id));
      if (targets.some((item) => item.className === classFilter)) setClassFilter('');
      setClassDeleteTarget(null);
      setSelectedClasses({});
      setNotice(result.message);
      setPage(1);
      setRefreshKey((value) => value + 1);
    } catch (failure) {
      setClassDeleteError(failure.message);
    } finally {
      setClassDeleting(false);
    }
  }

  async function exportExcel() {
    setExporting(true);
    setError('');
    try {
      const first = await fetchStudents({ page: 1, limit: 100, search, rombel: classFilter, status: statusFilter });
      const allStudents = [...(first.students || [])];
      for (let currentPage = 2; currentPage <= (first.pagination?.totalPages || 0); currentPage += 1) {
        const result = await fetchStudents({ page: currentPage, limit: 100, search, rombel: classFilter, status: statusFilter });
        allStudents.push(...(result.students || []));
      }
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Data Siswa');
      sheet.addRow(['NIS/NISN', 'Nama Lengkap', 'Kelas/Rombel', 'Jenis Kelamin', 'No. WhatsApp', 'Status Siswa']);
      allStudents.forEach((student) => sheet.addRow([
        student.nis_nisn, student.name, student.rombel, genderLabel(student.gender), student.phone, studentStatusLabel(student.status)
      ]));
      sheet.columns = [18, 30, 18, 18, 20, 16].map((width) => ({ width }));
      const output = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'data-siswa.xlsx';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(`Export Excel gagal: ${exportError.message}`);
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    setExporting(true);
    setError('');
    try {
      const first = await fetchStudents({ page: 1, limit: 100, search, rombel: classFilter, status: statusFilter });
      const allStudents = [...(first.students || [])];
      for (let currentPage = 2; currentPage <= (first.pagination?.totalPages || 0); currentPage += 1) {
        const result = await fetchStudents({ page: currentPage, limit: 100, search, rombel: classFilter, status: statusFilter });
        allStudents.push(...(result.students || []));
      }
      setPdfRows(allStudents);
    } catch (exportError) {
      setError(`Export PDF gagal: ${exportError.message}`);
    } finally {
      setExporting(false);
    }
  }

  function toggleVisibleStudents(checked) {
    setSelected((current) => {
      const next = { ...current };
      students.forEach((student) => {
        const id = String(student.id);
        if (checked) next[id] = student;
        else delete next[id];
      });
      return next;
    });
  }

  const selectedClass = useMemo(() => classes.find((item) => item.className === classFilter), [classes, classFilter]);

  return (
    <div className="library-module-page school-students-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">MASTER DATA</span>
        <h1>Data Siswa &amp; Rombel</h1>
        <p>Kelola data siswa dan kelompokkan berdasarkan kelas. Siswa dapat ditambahkan sebagai member secara terpisah.</p>
      </header>
      {notice && <div className="master-message master-message-success" role="status">{notice}</div>}
      {error && <div className="library-error" role="alert">{error}</div>}

      <div className="school-student-tabs" role="tablist" aria-label="Data siswa dan rombel">
        <button type="button" role="tab" aria-selected={tab === 'students'} className={tab === 'students' ? 'selected' : ''} onClick={() => setTab('students')}><Users size={16} />Data Siswa <span>{studentCount.toLocaleString('id-ID')}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'classes'} className={tab === 'classes' ? 'selected' : ''} onClick={() => setTab('classes')}>Data Rombel / Kelas <span>{classes.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'inactive'} className={tab === 'inactive' ? 'selected' : ''} onClick={() => setTab('inactive')}>Siswa Nonaktif <span>{inactivePagination.total.toLocaleString('id-ID')}</span></button>
      </div>

      {tab === 'students' ? (
        <>
          <section className="catalog-toolbar-panel student-toolbar">
            <label className="master-search student-search"><Search size={16} /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Cari Siswa..." maxLength={100} /></label>
            <label>Kelas / Rombel
              <select value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setPage(1); }}>
                <option value="">Semua Kelas</option>{classes.map((item) => <option key={item.className} value={item.className}>{item.className}</option>)}
              </select>
            </label>
            <label>Status
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">Semua Status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select>
            </label>
            <div className="student-toolbar-actions">
              <button type="button" className="master-button master-button-light" onClick={exportExcel} disabled={exporting}><Download size={15} />{exporting ? 'Mengekspor...' : 'Export Excel'}</button>
              <button type="button" className="master-button master-button-light" onClick={exportPdf} disabled={exporting}><Printer size={15} />Export PDF</button>
              {canEdit && <button type="button" className="master-button master-button-light" onClick={() => setImportOpen(true)}><FileSpreadsheet size={15} />Import Excel</button>}
              {canEdit && <button type="button" className="master-button master-button-primary" onClick={() => setEditor({ ...emptyStudent })}><Plus size={15} />Tambah Siswa</button>}
              {canDelete && selectedIds.length > 0 && <button type="button" className="master-button master-button-danger" onClick={() => { setDeleteError(''); setDeleteTarget('selected'); }}><Trash2 size={15} />Hapus Terpilih ({selectedIds.length})</button>}
            </div>
          </section>
          {selectedIds.length > 0 && <div className="student-selection-summary" role="status">{selectedIds.length.toLocaleString('id-ID')} siswa dipilih pada halaman ini.</div>}

          <section className="master-data-panel student-table-panel">
            <div className="school-settings-panel-heading"><div><h2>Daftar Siswa</h2><p>{studentCount.toLocaleString('id-ID')} siswa</p></div></div>
            <div className="master-table-scroll">
              <table className="master-table student-table">
                <thead><tr>{canDelete && <th className="student-checkbox"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleVisibleStudents(event.target.checked)} aria-label="Pilih semua siswa di halaman ini" /></th>}
                  <th>No</th><th>Foto</th><th>NIS / NISN</th><th>Nama Lengkap</th><th>Kelas / Rombel</th><th>Jenis Kelamin</th><th>Kontak WhatsApp</th><th>Status Akun</th><th>Kartu / Aksi</th>
                </tr></thead>
                <tbody>
                  {loading ? <tr><td className="master-empty-cell" colSpan={columnCount}>Memuat data siswa...</td></tr>
                    : students.length === 0 ? <tr><td className="master-empty-cell" colSpan={columnCount}>Tidak ada data siswa yang cocok.</td></tr>
                      : students.map((student, index) => <tr key={student.id}>
                        {canDelete && <td className="student-checkbox"><input type="checkbox" checked={Boolean(selected[String(student.id)])} onChange={(event) => setSelected((current) => {
                          const next = { ...current };
                          if (event.target.checked) next[String(student.id)] = student;
                          else delete next[String(student.id)];
                          return next;
                        })} aria-label={`Pilih ${student.name}`} /></td>}
                        <td>{(page - 1) * studentPageSize + index + 1}</td><td>{student.photo ? <img className="student-table-photo" src={student.photo} alt={`Foto ${student.name}`} /> : <span className="student-table-photo-empty">—</span>}</td><td>{student.nis_nisn}</td><td><b>{student.name}</b></td><td>{student.rombel || 'Belum diatur'}</td>
                        <td>{genderLabel(student.gender)}</td><td>{student.phone || '—'}</td><td><span className={`master-status ${student.status === 'active' ? 'is-active' : 'is-inactive'}`}>{studentStatusLabel(student.status)}</span></td>
                        <td><div className="student-row-actions"><button type="button" className="master-icon-button" title="Cetak kartu member" onClick={() => setMemberCards([student])}><Printer size={15} /></button>{canEdit && <button type="button" className="master-icon-button" title="Edit siswa" onClick={() => setEditor(student)}><Pencil size={15} /></button>}{canDelete && <button type="button" className="master-icon-button" title="Hapus siswa" onClick={() => { setDeleteError(''); setDeleteTarget(student); }}><Trash2 size={15} /></button>}</div></td>
                      </tr>)}
                </tbody>
              </table>
            </div>
            <footer className="catalog-pagination"><span>Halaman {studentTotalPages ? page : 0} dari {Math.max(1, studentTotalPages)}</span><div>
              <button type="button" className="master-icon-button" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Halaman sebelumnya">‹</button>
              <button type="button" className="master-icon-button" disabled={loading || page >= studentTotalPages} onClick={() => setPage((value) => value + 1)} aria-label="Halaman berikutnya">›</button>
            </div></footer>
          </section>
        </>
      ) : tab === 'classes' ? (
        <section className="master-data-panel student-classes-panel">
          <div className="school-settings-panel-heading school-class-panel-heading">
            <div><h2>Data Rombel / Kelas</h2><p>Atur kelas dan penetapan siswa sesuai jenjang sekolah.</p></div>
            <div className="school-class-toolbar-actions">
              {canDelete && selectedClassIds.length > 0 && <button type="button" className="master-button procurement-delete-selected" onClick={() => { setClassDeleteError(''); setClassDeleteTarget('selected'); }}><Trash2 size={15} />Hapus Terpilih ({selectedClassIds.length})</button>}
              {canEdit && <button type="button" className="master-button master-button-primary" onClick={() => setClassEditor({})} disabled={!gradeLevels.length}><Plus size={15} />Tambah Kelas</button>}
            </div>
          </div>
          {classesError && <div className="library-error" role="alert">{classesError}<button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Coba lagi</button></div>}
          {!gradeLevels.length && <div className="school-class-level-warning">Atur jenjang pendidikan terlebih dahulu melalui menu Identitas Sekolah agar pilihan tingkat kelas sesuai.</div>}
          <div className="master-table-scroll"><table className="master-table school-class-table"><thead><tr>
            {canDelete && <th className="school-class-checkbox"><input type="checkbox" checked={allClassesSelected} onChange={(event) => toggleVisibleClasses(event.target.checked)} disabled={!managedClasses.length} aria-label="Pilih semua kelas" /></th>}
            <th>No</th><th>Tingkat</th><th>Nama Kelas</th><th>Jumlah Siswa</th><th>Akun Aktif</th><th>Aksi</th>
          </tr></thead>
            <tbody>{classes.length ? classes.map((item, index) => <tr key={item.id || `unassigned-${index}`}>
              {canDelete && <td className="school-class-checkbox">{item.id && !item.isUnassigned ? <input type="checkbox" checked={Boolean(selectedClasses[String(item.id)])} onChange={(event) => setSelectedClasses((current) => {
                const next = { ...current };
                if (event.target.checked) next[String(item.id)] = true;
                else delete next[String(item.id)];
                return next;
              })} aria-label={`Pilih kelas ${item.className}`} /> : null}</td>}
              <td>{index + 1}</td><td>{item.gradeLevel || '—'}</td><td><b>{item.name || item.className}</b>{item.isUnassigned && <small className="school-class-unassigned-label">Belum ada kelas</small>}</td>
              <td>{item.studentCount.toLocaleString('id-ID')}</td><td>{item.activeCount.toLocaleString('id-ID')}</td>
              <td><div className="school-class-row-actions">
                {item.isUnassigned
                  ? <button type="button" className="master-button master-button-light" onClick={() => { setClassFilter(item.className); setPage(1); setTab('students'); }}>Lihat Siswa</button>
                  : <>
                    {canEdit && <button type="button" className="master-button master-button-light" onClick={() => setClassEditor(item)} disabled={!gradeLevels.length} title={`Edit ${item.className}`}><Pencil size={14} />Edit</button>}
                    {canEdit && <button type="button" className="master-button master-button-light" onClick={() => setClassAssignment(item)}><Users size={14} />Penetapan Siswa</button>}
                    {canDelete && <button type="button" className="master-icon-button school-class-delete-button" onClick={() => { setClassDeleteError(''); setClassDeleteTarget(item); }} title={`Hapus ${item.className}`} aria-label={`Hapus ${item.className}`}><Trash2 size={15} /></button>}
                    {!canEdit && !canDelete && <button type="button" className="master-button master-button-light" onClick={() => { setClassFilter(item.className); setPage(1); setTab('students'); }}>Lihat Siswa</button>}
                  </>}
              </div></td>
            </tr>)
              : <tr><td className="master-empty-cell" colSpan={classColumnCount}>Belum ada data rombel.</td></tr>}</tbody>
          </table></div>
        </section>
      ) : (
        <>
          {inactiveError && <div className="library-error" role="alert"><span>{inactiveError}</span><button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Coba lagi</button></div>}
          <section className="catalog-toolbar-panel student-toolbar student-inactive-toolbar">
            <label className="master-search student-search"><Search size={16} /><input value={inactiveQueryInput} onChange={(event) => setInactiveQueryInput(event.target.value)} placeholder="Cari nama, NIS/NISN, atau rombel..." maxLength={100} /></label>
          </section>
          <section className="master-data-panel student-table-panel">
            <div className="school-settings-panel-heading"><div><h2>Daftar Siswa Nonaktif</h2><p>{inactivePagination.total.toLocaleString('id-ID')} siswa lulus atau berstatus nonaktif.</p></div></div>
            <div className="master-table-scroll">
              <table className="master-table student-table">
                <thead><tr><th>No</th><th>NIS / NISN</th><th>Nama Lengkap</th><th>Rombel Terakhir</th><th>Status Akun</th><th>Keterangan</th></tr></thead>
                <tbody>{inactiveLoading ? <tr><td className="master-empty-cell" colSpan={6}>Memuat siswa nonaktif...</td></tr>
                  : inactiveStudents.length === 0 ? <tr><td className="master-empty-cell" colSpan={6}>{inactiveSearch ? 'Tidak ada siswa nonaktif yang cocok.' : 'Belum ada siswa lulus atau nonaktif.'}</td></tr>
                    : inactiveStudents.map((student, index) => <tr key={student.id}>
                      <td>{(inactivePage - 1) * studentPageSize + index + 1}</td>
                      <td>{student.nis_nisn || '—'}</td>
                      <td><b>{student.name}</b></td>
                      <td>{student.rombel || 'Belum diatur'}</td>
                      <td><span className="master-status is-inactive">{studentStatusLabel(student.status)}</span></td>
                      <td>{student.inactive_reason === 'graduated' ? `Lulus${student.graduation_year ? ` · ${student.graduation_year}` : ''}` : 'Nonaktif'}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>
            <footer className="catalog-pagination"><span>Halaman {inactivePagination.totalPages ? inactivePage : 0} dari {Math.max(1, inactivePagination.totalPages)}</span><div>
              <button type="button" className="master-icon-button" disabled={inactiveLoading || inactivePage <= 1} onClick={() => setInactivePage((value) => Math.max(1, value - 1))} aria-label="Siswa nonaktif halaman sebelumnya">‹</button>
              <button type="button" className="master-icon-button" disabled={inactiveLoading || inactivePage >= inactivePagination.totalPages} onClick={() => setInactivePage((value) => value + 1)} aria-label="Siswa nonaktif halaman berikutnya">›</button>
            </div></footer>
          </section>
        </>
      )}

      <section className="school-student-print-heading"><h1>Data Siswa {selectedClass ? `· ${selectedClass.className}` : ''}</h1><p>PerpusKita · Rekapitulasi siswa</p></section>
      {pdfRows && <section className="school-student-print-sheet">
        <SchoolPrintHeader
          identity={schoolIdentity}
          title="Rekapitulasi Data Siswa"
          subtitle={`${classFilter || 'Semua Kelas'} · ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`}
        />
        <table className="master-table"><thead><tr><th>No</th><th>NIS / NISN</th><th>Nama Lengkap</th><th>Kelas / Rombel</th><th>Jenis Kelamin</th><th>Kontak WhatsApp</th><th>Status Akun</th></tr></thead>
          <tbody>{pdfRows.length ? pdfRows.map((student, index) => <tr key={student.id}><td>{index + 1}</td><td>{student.nis_nisn}</td><td>{student.name}</td><td>{student.rombel || 'Belum diatur'}</td><td>{genderLabel(student.gender)}</td><td>{student.phone || '—'}</td><td>{studentStatusLabel(student.status)}</td></tr>)
            : <tr><td colSpan={7}>Tidak ada data siswa yang cocok.</td></tr>}</tbody>
        </table>
      </section>}
      {memberCards && <section className="school-member-card-print-sheet" aria-label="Kartu member siswa">
        {memberCards.map((student) => {
          const code = student.member_code || `MBR-${student.id}`;
          return <article className="school-member-card" key={student.id}>
            <header>
              {schoolIdentity?.logo && <img src={schoolIdentity.logo} alt="" />}
              <div><b>{schoolIdentity?.name || 'Perpustakaan Sekolah'}</b><span>KARTU MEMBER PERPUSTAKAAN</span></div>
            </header>
            <main>
              {student.photo ? <img className="school-member-card-photo" src={student.photo} alt={`Foto ${student.name}`} />
                : <div className="school-member-card-photo school-member-card-photo-empty">{student.name.slice(0, 1).toUpperCase()}</div>}
              <div className="school-member-card-details"><b>{student.name}</b><span>NIS/NISN: {student.nis_nisn}</span><span>Kelas: {student.rombel || '—'}</span></div>
            </main>
            <div className="school-member-card-barcode">
              <svg ref={(element) => {
                if (element) JsBarcode(element, code, { format: 'CODE128', displayValue: false, height: 38, width: 1.5, margin: 0 });
              }} aria-label={`Barcode member ${code}`} />
              <strong>{code}</strong>
            </div>
          </article>;
        })}
      </section>}
      {editor && <StudentForm
        student={editor.id ? editor : null}
        classes={classes}
        classesLoading={classesLoading}
        classesError={classesError}
        onRetryClasses={() => setRefreshKey((value) => value + 1)}
        onClose={() => setEditor(null)}
        onSave={saveStudent}
      />}
      {importOpen && <ImportStudentsModal onClose={() => setImportOpen(false)} onImport={runImport} />}
      {classEditor && <SchoolClassForm schoolClass={classEditor.id ? classEditor : null} gradeLevels={gradeLevels} onClose={() => setClassEditor(null)} onSave={saveSchoolClass} />}
      {classAssignment && <ClassStudentsModal schoolClass={classAssignment} onClose={() => setClassAssignment(null)} onSave={saveClassAssignments} />}
      {deleteTarget && <SchoolConfirmDialog
        title={deleteTarget === 'selected' ? 'Hapus siswa terpilih?' : 'Hapus data siswa?'}
        message={deleteTarget === 'selected' ? `${selectedIds.length} siswa akan dihapus permanen.` : 'Data siswa akan dihapus permanen jika tidak terikat pada riwayat transaksi.'}
        itemName={deleteTarget === 'selected' ? `${selectedIds.length} siswa terpilih` : deleteTarget.name}
        loading={deleting}
        error={deleteError}
        onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }}
        onConfirm={confirmDelete}
      />}
      {classDeleteTarget && <SchoolConfirmDialog
        title={classDeleteTarget === 'selected' ? 'Hapus kelas terpilih?' : 'Hapus kelas?'}
        message="Siswa pada kelas yang dihapus tetap tersimpan dan akan menjadi belum diatur."
        itemName={classDeleteTarget === 'selected'
          ? `${selectedClassIds.length} kelas terpilih`
          : classDeleteTarget.className}
        loading={classDeleting}
        error={classDeleteError}
        onClose={() => { if (!classDeleting) { setClassDeleteTarget(null); setClassDeleteError(''); } }}
        onConfirm={confirmDeleteClasses}
      />}
    </div>
  );
}
