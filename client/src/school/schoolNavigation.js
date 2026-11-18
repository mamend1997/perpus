import {
  BookOpen, ClipboardList, FileBarChart2, LayoutDashboard, MessageSquare,
  PackagePlus, Repeat2, Star, Tags, Ticket, Users
} from 'lucide-react';

const staffRoles = ['admin', 'kepsek', 'kapus'];
const allRoles = [...staffRoles, 'member'];

export const schoolNavigation = [
  {
    section: 'RINGKASAN',
    items: [{ label: 'Dashboard', icon: LayoutDashboard, roles: allRoles }]
  },
  {
    section: 'PENGELOLAAN KOLEKSI',
    items: [
      {
        label: 'Master Data',
        icon: Tags,
        children: ['Bahasa', 'Jenis', 'Koleksi', 'Klasifikasi', 'Topik', 'Rak', 'Pengarang', 'Penerbit', 'Agen']
          .map((label) => ({ label, icon: Tags, roles: staffRoles }))
      },
      {
        label: 'Data Buku & Inventaris',
        icon: BookOpen,
        children: [
          { label: 'Daftar Pustaka', icon: BookOpen, roles: allRoles },
          { label: 'Tambah Stok Buku', icon: PackagePlus, roles: staffRoles },
          { label: 'Eksemplar', icon: ClipboardList, roles: staffRoles }
        ]
      }
    ]
  },
  {
    section: 'LAYANAN PERPUSTAKAAN',
    items: [
      {
        label: 'Sirkulasi & Peminjaman',
        icon: Repeat2,
        children: [
          { label: 'Peminjaman Saya', icon: BookOpen, roles: ['member'] },
          { label: 'Manajemen Sirkulasi', icon: Repeat2, roles: staffRoles }
        ]
      },
      { label: 'Pengadaan Buku', icon: PackagePlus, roles: allRoles },
      { label: 'Buku Tamu Digital', icon: Users, roles: allRoles },
      { label: 'Booking Buku', icon: Ticket, roles: allRoles },
      { label: 'Ulasan & Rating', icon: Star, roles: allRoles },
      { label: 'Pengumuman', icon: MessageSquare, roles: allRoles }
    ]
  },
  {
    section: 'ANALISIS',
    items: [{ label: 'Laporan Bulanan', icon: FileBarChart2, roles: staffRoles }]
  }
];

export const schoolModuleDetails = {
  Bahasa: {
    description: 'Kelola pilihan bahasa yang digunakan pada katalog dan data bibliografi.',
    features: ['Pencarian data', 'Status aktif/nonaktif', 'Tambah dan edit referensi', 'Import dan export']
  },
  Jenis: {
    description: 'Atur jenis bahan pustaka seperti buku teks, referensi, dan bahan nonbuku.',
    features: ['Pencarian data', 'Status aktif/nonaktif', 'Tambah dan edit referensi', 'Import dan export']
  },
  Koleksi: {
    description: 'Kelola kategori koleksi yang digunakan pada ringkasan ketersediaan buku.',
    features: ['Pencarian data', 'Status aktif/nonaktif', 'Tambah dan edit referensi', 'Import dan export']
  },
  Klasifikasi: {
    description: 'Simpan kode klasifikasi agar pengelompokan katalog konsisten.',
    features: ['Kode klasifikasi', 'Status aktif/nonaktif', 'Tambah dan edit referensi', 'Import dan export']
  },
  Topik: {
    description: 'Kelola kata kunci topik untuk membantu pencarian koleksi.',
    features: ['Pencarian topik', 'Status aktif/nonaktif', 'Tambah dan edit referensi', 'Import dan export']
  },
  Rak: {
    description: 'Atur lokasi rak dan kode penempatan buku di perpustakaan.',
    features: ['Kode dan nama rak', 'Status aktif/nonaktif', 'Tambah dan edit lokasi', 'Import dan export']
  },
  Pengarang: {
    description: 'Kelola data pengarang yang terhubung ke katalog buku.',
    features: ['Pencarian pengarang', 'Status aktif/nonaktif', 'Tambah dan edit data', 'Import dan export']
  },
  Penerbit: {
    description: 'Kelola data penerbit yang terhubung ke katalog buku.',
    features: ['Pencarian penerbit', 'Status aktif/nonaktif', 'Tambah dan edit data', 'Import dan export']
  },
  Agen: {
    description: 'Simpan data agen atau pemasok untuk pencatatan sumber koleksi.',
    features: ['Pencarian agen', 'Status aktif/nonaktif', 'Tambah dan edit data', 'Import dan export']
  },
  'Daftar Pustaka': {
    description: 'Kelola katalog, metadata buku, dan status koleksi sekolah.',
    features: ['Filter dan pencarian katalog', 'Import Excel dan unduh template', 'Cetak barcode massal', 'Lihat detail buku']
  },
  'Tambah Stok Buku': {
    description: 'Tambahkan eksemplar pada judul buku yang sudah terdaftar.',
    features: ['Cari judul buku', 'Input jumlah stok', 'Buat nomor serial otomatis', 'Perbarui jumlah inventaris']
  },
  Eksemplar: {
    description: 'Pantau setiap salinan fisik menggunakan nomor serial dan status terkini.',
    features: ['Nomor serial S00, S01, dan seterusnya', 'Status tersedia/dipinjam/rusak', 'Filter berdasarkan judul', 'Riwayat perubahan']
  },
  'Peminjaman Saya': {
    description: 'Lihat status peminjaman, tanggal jatuh tempo, dan riwayat pengembalian.',
    features: ['Daftar peminjaman aktif', 'Informasi jatuh tempo', 'Rincian denda', 'Riwayat peminjaman']
  },
  'Manajemen Sirkulasi': {
    description: 'Kelola transaksi peminjaman, pengembalian, persetujuan, dan denda.',
    features: ['Profil anggota dan rombel', 'Peminjaman dan pengembalian', 'Perhitungan denda otomatis', 'Kartu anggota digital']
  },
  'Pengadaan Buku': {
    description: 'Tinjau usulan buku dan kelola tindak lanjut pengadaan.',
    features: ['Usulan dari anggota', 'Status pending/diterima/ditolak', 'Catatan keputusan', 'Riwayat usulan']
  },
  'Buku Tamu Digital': {
    description: 'Catat kunjungan perpustakaan melalui pencarian anggota atau pemindaian kartu.',
    features: ['Pencatatan kunjungan', 'Pencarian NIS/NISN', 'Tujuan kunjungan', 'Rekap pengunjung']
  },
  'Booking Buku': {
    description: 'Sediakan antrean reservasi ketika koleksi yang dicari sedang dipinjam.',
    features: ['Buat reservasi', 'Antrean per judul', 'Status aktif/terpenuhi/dibatalkan', 'Riwayat reservasi']
  },
  'Ulasan & Rating': {
    description: 'Tampilkan ulasan pembaca dan rating buku dari satu sampai lima bintang.',
    features: ['Rating 1–5', 'Ulasan pembaca', 'Filter berdasarkan judul', 'Moderasi ulasan']
  },
  Pengumuman: {
    description: 'Sampaikan informasi layanan perpustakaan kepada anggota sekolah.',
    features: ['Buat pengumuman', 'Tanggal publikasi', 'Informasi tenggat pengembalian', 'Integrasi notifikasi WhatsApp']
  },
  'Laporan Bulanan': {
    description: 'Tinjau rekap layanan berdasarkan rentang tanggal dan peran pengguna.',
    features: ['Rekap anggota', 'Rekap koleksi judul dan satuan', 'Rekap pengunjung', 'Rekap peminjam aktif dan unduh laporan']
  }
};
