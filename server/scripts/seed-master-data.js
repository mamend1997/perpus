import 'dotenv/config';
import { pool } from '../src/config/database.js';

const schoolCode = (process.argv[2] || process.env.SCHOOL_CODE || '').trim().toUpperCase();
if (!/^[A-Z0-9]{4}$/.test(schoolCode)) {
  throw new Error('Provide the 4-character school code: npm run seed:master-data -- 6GPJ');
}

const samples = [
  { type: 'bahasa', code: 'ID', name: 'Bahasa Indonesia', description: 'Bahasa utama koleksi perpustakaan.' },
  { type: 'bahasa', code: 'EN', name: 'Bahasa Inggris', description: 'Koleksi berbahasa Inggris.' },
  { type: 'bahasa', code: 'AR', name: 'Bahasa Arab', description: 'Koleksi berbahasa Arab.' },

  { type: 'jenis', code: 'BUKU-TEKS', name: 'Buku Teks', description: 'Buku bahan pembelajaran.' },
  { type: 'jenis', code: 'REFERENSI', name: 'Buku Referensi', description: 'Kamus, ensiklopedia, dan sumber rujukan.' },
  { type: 'jenis', code: 'FIKSI', name: 'Buku Fiksi', description: 'Novel, cerita pendek, dan karya fiksi.' },

  { type: 'koleksi', code: 'UMUM', name: 'Koleksi Umum', description: 'Koleksi untuk dibaca oleh seluruh anggota.' },
  { type: 'koleksi', code: 'PELAJARAN', name: 'Buku Pelajaran', description: 'Buku pendukung kegiatan belajar.' },
  { type: 'koleksi', code: 'REFERENSI', name: 'Koleksi Referensi', description: 'Bahan rujukan yang digunakan di perpustakaan.' },

  { type: 'klasifikasi', code: '000', name: 'Karya Umum', description: 'Karya umum dan informasi.' },
  { type: 'klasifikasi', code: '300', name: 'Ilmu Sosial', description: 'Koleksi ilmu sosial dan kemasyarakatan.' },
  { type: 'klasifikasi', code: '500', name: 'Ilmu Pengetahuan', description: 'Koleksi sains dan ilmu pengetahuan alam.' },
  { type: 'klasifikasi', code: '800', name: 'Kesusastraan', description: 'Koleksi sastra dan karya fiksi.' },

  { type: 'topik', code: 'SAINS', name: 'Sains', description: 'Ilmu pengetahuan dan eksperimen.' },
  { type: 'topik', code: 'SEJARAH', name: 'Sejarah', description: 'Sejarah Indonesia dan dunia.' },
  { type: 'topik', code: 'LITERASI', name: 'Literasi', description: 'Kegiatan membaca dan keterampilan literasi.' },

  { type: 'rak', code: 'RAK-A1', name: 'Rak A1', description: 'Ruang baca - rak A1.' },
  { type: 'rak', code: 'RAK-A2', name: 'Rak A2', description: 'Ruang baca - rak A2.' },
  { type: 'rak', code: 'RAK-B1', name: 'Rak B1', description: 'Ruang referensi - rak B1.' },

  { type: 'pengarang', code: 'AUTH-001', name: 'A. K. Pratama', description: 'Penulis cerita dan bacaan anak.' },
  { type: 'pengarang', code: 'AUTH-002', name: 'Dewi Pustaka', description: 'Penulis bahan bacaan pendidikan.' },
  { type: 'pengarang', code: 'AUTH-003', name: 'R. Wibowo', description: 'Penulis buku pengetahuan umum.' },

  { type: 'penerbit', code: 'PUB-001', name: 'Penerbit Nusantara', description: 'Penerbit buku pendidikan.' },
  { type: 'penerbit', code: 'PUB-002', name: 'Pustaka Cendekia', description: 'Penerbit buku pengetahuan.' },
  { type: 'penerbit', code: 'PUB-003', name: 'Media Aksara', description: 'Penerbit bacaan umum.' },

  { type: 'agen', code: 'AG-001', name: 'Agen Buku Nusantara', email: 'pesanan@agen-nusantara.test', phone: '+62 21 5550001', address: 'Jl. Pustaka No. 10, Jakarta' },
  { type: 'agen', code: 'AG-002', name: 'Mitra Literasi', email: 'halo@mitra-literasi.test', phone: '+62 22 5550002', address: 'Jl. Pendidikan No. 5, Bandung' }
];

let connection;
let transactionStarted = false;
try {
  const [schools] = await pool.execute(
    'SELECT id FROM tenants_schools WHERE school_code = ? LIMIT 1',
    [schoolCode]
  );
  if (!schools.length) throw new Error(`School code ${schoolCode} was not found.`);

  connection = await pool.getConnection();
  await connection.beginTransaction();
  transactionStarted = true;
  let inserted = 0;
  for (const sample of samples) {
    const [existing] = await connection.execute(
      'SELECT id FROM master_categories WHERE school_id = ? AND type = ? AND code = ? LIMIT 1',
      [schools[0].id, sample.type, sample.code]
    );
    if (existing.length) continue;

    await connection.execute(
      `INSERT INTO master_categories
       (school_id, type, code, name, description, email, phone, address, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        schools[0].id, sample.type, sample.code, sample.name, sample.description || null,
        sample.email || null, sample.phone || null, sample.address || null
      ]
    );
    inserted += 1;
  }
  await connection.commit();
  transactionStarted = false;
  console.log(`Seeded ${inserted} master data rows for school ${schoolCode}; existing sample codes were left unchanged.`);
} catch (error) {
  if (transactionStarted) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      throw rollbackError;
    }
  }
  throw error;
} finally {
  if (connection) connection.release();
  await pool.end();
}
