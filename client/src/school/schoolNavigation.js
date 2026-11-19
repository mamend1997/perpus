import {
  BookOpen, Building2, FileBarChart2, FileText, LayoutDashboard, MessageSquare,
  Activity, CalendarDays, PackagePlus, QrCode, Repeat2, Settings, Star, Tags, Ticket, Palette,
  Trash2, Users, Wallet, LifeBuoy, CreditCard, Receipt
} from 'lucide-react';

const allRoles = ['admin', 'kepsek', 'kapus', 'member'];
const staffRoles = ['admin', 'kepsek', 'kapus'];

export const masterCategoryTypes = {
  Bahasa: 'bahasa',
  Jenis: 'jenis',
  Koleksi: 'koleksi',
  Klasifikasi: 'klasifikasi',
  Topik: 'topik',
  Rak: 'rak',
  Pengarang: 'pengarang',
  Penerbit: 'penerbit',
  Agen: 'agen'
};

export const schoolNavigation = [
  {
    section: 'RINGKASAN',
    items: [{ label: 'Dashboard', icon: LayoutDashboard, roles: allRoles, permission: 'dashboard' }]
  },
  {
    section: 'PENGELOLAAN PERPUSTAKAAN',
    items: [
      {
        label: 'Data Buku',
        icon: BookOpen,
        children: [
          { label: 'Daftar Pustaka', icon: BookOpen, roles: allRoles, permission: 'books.catalog' },
          { label: 'Tambah Stok Buku', icon: PackagePlus, roles: allRoles, permission: 'books.stock' },
          { label: 'Pindah Rak', icon: Repeat2, roles: staffRoles, permission: 'books.stock' },
          { label: 'Pemusnahan Buku', icon: Trash2, roles: staffRoles, permission: 'books.stock' },
          { label: 'Log Aktivitas', icon: Activity, roles: staffRoles, permission: 'books.stock' },
          { label: 'Eksemplar', icon: BookOpen, roles: allRoles, permission: 'books.items' },
          { label: 'Pengadaan Buku', icon: PackagePlus, roles: allRoles, permission: 'procurements' }
        ]
      },
      {
        label: 'Sirkulasi Buku',
        icon: Repeat2,
        children: [
          { label: 'Analitik Sirkulasi', icon: FileBarChart2, roles: allRoles, permission: 'circulation.analytics' },
          { label: 'Peminjaman', icon: Repeat2, roles: allRoles, permission: 'circulation.loans' },
          { label: 'Denda', icon: Wallet, roles: allRoles, permission: 'circulation.fines' }
        ]
      }
    ]
  },
  {
    section: 'MASTER DATA',
    items: [
      {
        label: 'Master Data',
        icon: Tags,
        children: [
          { label: 'Identitas Sekolah', icon: Building2, roles: allRoles, permission: 'master.identity' },
          { label: 'Kop Sekolah', icon: FileText, roles: staffRoles, permission: 'master.identity' },
          { label: 'Tahun Pelajaran', icon: CalendarDays, roles: allRoles, permission: 'master.academic-years' },
          { label: 'Data Siswa & Rombel', icon: Users, roles: staffRoles, permission: 'master.students' },
          { label: 'Member', icon: Users, roles: staffRoles, permission: 'master.students' },
          ...Object.entries(masterCategoryTypes)
            .map(([label, type]) => ({ label, icon: Tags, roles: allRoles, permission: `master.${type}` }))
        ]
      }
    ]
  },
  {
    section: 'LAYANAN PERPUSTAKAAN',
    items: [
      { label: 'Buku Tamu Digital', icon: Users, roles: allRoles, permission: 'visitors' },
      { label: 'Booking Buku', icon: Ticket, roles: allRoles, permission: 'reservations' },
      { label: 'Ulasan & Rating', icon: Star, roles: allRoles, permission: 'reviews' },
      { label: 'Portal Publik', icon: QrCode, roles: staffRoles, permission: 'master.identity' },
      { label: 'Pengumuman', icon: MessageSquare, roles: allRoles, permission: 'announcements' }
    ]
  },
  {
    section: 'ANALISIS',
    items: [{ label: 'Laporan', icon: FileBarChart2, roles: allRoles, permission: 'reports.monthly' }]
  },
  {
    section: 'BANTUAN',
    items: [
      { label: 'Bantuan & Tiket Kendala', icon: LifeBuoy, roles: allRoles, permission: 'support' },
      { label: 'Petunjuk Pengguna', icon: BookOpen, roles: allRoles, permission: 'platform.documents' },
      { label: 'Syarat & SLA', icon: FileText, roles: allRoles, permission: 'platform.documents' }
    ]
  },
  {
    section: 'AKUN',
    items: [
      { label: 'Layanan', icon: Receipt, roles: ['admin'] },
      { label: 'Perpanjangan', icon: CreditCard, roles: ['admin'] },
      { label: 'Pengaturan', icon: Settings, roles: ['admin'] },
      { label: 'Tema & Branding', icon: Palette, roles: ['admin'] }
    ]
  }
];

export const mobileNavbarOptions = schoolNavigation.flatMap((section) => section.items
  .flatMap((item) => item.children || [item])
  .map(({ label }) => label));

export const defaultMobileNavbarSettings = {
  items: ['Dashboard', 'Daftar Pustaka', 'Buku Tamu Digital', 'Peminjaman', 'Denda'],
  highlight: 'Buku Tamu Digital'
};

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
    features: ['Scan atau isi kode barcode', 'Cari nama buku setelah mengetik 3 huruf', 'Tanggal stok otomatis', 'Input jumlah dan keterangan']
  },
  'Pemusnahan Buku': {
    description: 'Catat pemusnahan eksemplar rusak dan kurangi stok buku secara otomatis.',
    features: ['Pilih buku rusak melalui barcode atau pencarian', 'Validasi jumlah per rak', 'Alasan dan tanggal otomatis', 'Riwayat pemusnahan']
  },
  'Log Aktivitas': {
    description: 'Telusuri perubahan data, login, dan pembukaan halaman sesuai hak akses.',
    features: ['Aktivitas akun sekolah', 'Log perubahan data', 'Riwayat login dan halaman', 'Filter dan pagination']
  },
  'Pindah Rak': {
    description: 'Pindahkan sejumlah eksemplar antar rak, periksa kapasitas, dan telusuri riwayatnya.',
    features: ['Scan barcode atau cari buku', 'Rak asal dan tujuan', 'Validasi stok dan kapasitas', 'Riwayat pindah rak']
  },
  Eksemplar: {
    description: 'Pantau setiap salinan fisik menggunakan nomor serial dan status terkini.',
    features: ['Nomor serial salinan', 'Status tersedia/dipinjam/rusak', 'Filter berdasarkan judul', 'Riwayat perubahan']
  },
  'Analitik Sirkulasi': {
    description: 'Pantau tren peminjaman, pengembalian, dan denda perpustakaan.',
    features: ['Ringkasan transaksi sirkulasi', 'Tren peminjaman dan pengembalian', 'Filter periode laporan', 'Rekap aktivitas anggota']
  },
  Peminjaman: {
    description: 'Lihat dan kelola transaksi peminjaman buku sesuai peran pengguna.',
    features: ['Daftar peminjaman', 'Tanggal pinjam dan jatuh tempo', 'Status pengembalian', 'Riwayat transaksi']
  },
  Denda: {
    description: 'Tinjau dan kelola denda keterlambatan pengembalian buku.',
    features: ['Daftar denda', 'Nominal dan status pembayaran', 'Filter anggota dan periode', 'Riwayat pelunasan']
  },
  'Tahun Pelajaran': {
    description: 'Atur periode tahun pelajaran untuk membantu penyaringan laporan perpustakaan.',
    features: ['Nama tahun pelajaran', 'Tanggal mulai dan akhir', 'Periode aktif', 'Riwayat periode']
  },
  'Data Siswa & Rombel': {
    description: 'Kelola data siswa dan ringkasan siswa berdasarkan kelas.',
    features: ['Pencarian nama dan NIS/NISN', 'Filter kelas / rombel', 'Import dan export Excel', 'Aksi massal siswa']
  },
  Member: {
    description: 'Pilih siswa yang menjadi anggota perpustakaan dan atur kredensial akun loginnya.',
    features: ['Daftar member terpilih', 'Tambah siswa sebagai member', 'Atur username, email, telepon, dan kata sandi']
  },
  'Pengadaan Buku': {
    description: 'Tinjau usulan buku dan kelola tindak lanjut pengadaan.',
    features: ['Data buku, kebutuhan, dan estimasi harga', 'Tanggal pengajuan dan pemohon', 'Status serta alasan pengajuan', 'Masukkan usulan diterima ke Daftar Pustaka']
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
  Laporan: {
    description: 'Tinjau rekap layanan berdasarkan rentang tanggal dan peran pengguna.',
    features: ['Rekap anggota', 'Rekap koleksi judul dan satuan', 'Rekap pengunjung', 'Rekap peminjam aktif dan unduh laporan']
  }
};
