export const schoolPermissionRoles = ['kepsek', 'kapus', 'member'];

export const schoolPermissionFeatures = [
  { key: 'dashboard', label: 'Dashboard', section: 'Ringkasan' },
  { key: 'books.catalog', label: 'Daftar Pustaka', section: 'Data Buku' },
  { key: 'books.stock', label: 'Tambah Stok Buku', section: 'Data Buku' },
  { key: 'books.items', label: 'Eksemplar', section: 'Data Buku' },
  { key: 'procurements', label: 'Pengadaan Buku', section: 'Data Buku' },
  { key: 'circulation.analytics', label: 'Analitik Sirkulasi', section: 'Sirkulasi Buku' },
  { key: 'circulation.loans', label: 'Peminjaman', section: 'Sirkulasi Buku' },
  { key: 'circulation.fines', label: 'Denda', section: 'Sirkulasi Buku' },
  { key: 'master.identity', label: 'Identitas Sekolah', section: 'Master Data' },
  { key: 'master.academic-years', label: 'Tahun Pelajaran', section: 'Master Data' },
  { key: 'master.students', label: 'Data Siswa & Rombel', section: 'Master Data' },
  { key: 'master.bahasa', label: 'Bahasa', section: 'Master Data' },
  { key: 'master.jenis', label: 'Jenis', section: 'Master Data' },
  { key: 'master.koleksi', label: 'Koleksi', section: 'Master Data' },
  { key: 'master.klasifikasi', label: 'Klasifikasi', section: 'Master Data' },
  { key: 'master.topik', label: 'Topik', section: 'Master Data' },
  { key: 'master.rak', label: 'Rak', section: 'Master Data' },
  { key: 'master.pengarang', label: 'Pengarang', section: 'Master Data' },
  { key: 'master.penerbit', label: 'Penerbit', section: 'Master Data' },
  { key: 'master.agen', label: 'Agen', section: 'Master Data' },
  { key: 'visitors', label: 'Buku Tamu Digital', section: 'Layanan Perpustakaan' },
  { key: 'reservations', label: 'Booking Buku', section: 'Layanan Perpustakaan' },
  { key: 'reviews', label: 'Ulasan & Rating', section: 'Layanan Perpustakaan' },
  { key: 'announcements', label: 'Pengumuman', section: 'Layanan Perpustakaan' },
  { key: 'reports.monthly', label: 'Laporan Bulanan', section: 'Analisis' }
];

export const schoolPermissionFeatureKeys = new Set(schoolPermissionFeatures.map(({ key }) => key));

export function defaultSchoolPermissions() {
  const memberEditable = new Set(['visitors', 'reservations', 'reviews']);
  const viewable = new Set([
    'dashboard', 'visitors', 'reservations', 'reviews', 'announcements',
    'master.academic-years', 'master.students'
  ]);
  return Object.fromEntries(schoolPermissionFeatures.map(({ key }) => [
    key,
    { view: viewable.has(key), edit: memberEditable.has(key), delete: false }
  ]));
}
