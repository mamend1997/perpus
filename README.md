# MACA — SaaS e-Perpustakaan

Starter multi-tenant untuk panel Super Admin, menggunakan Express, SQLite, React, Vite, dan Tailwind CSS. Data sekolah memakai `tenants_schools` sebagai tabel tenant kanonis; seluruh tabel operasional sekolah mereferensikan `school_id`.

## Prasyarat

- Node.js 20+

## Menjalankan lokal

```powershell
Copy-Item .env.example .env
npm install
npm install --prefix server
npm install --prefix client
```

Database SQLite dibuat otomatis di `server/storage/database.sqlite`; atur `DB_PATH` untuk memilih lokasi lain. Ganti `SCHOOL_SETTINGS_ENCRYPTION_KEY` dengan secret acak minimal 32 karakter dan pertahankan nilainya; key ini digunakan untuk mengenkripsi token integrasi yang tersimpan.

Untuk mengaktifkan pembayaran langganan Kasera Pay, pastikan `SCHOOL_SETTINGS_ENCRYPTION_KEY` sudah diatur, lalu masukkan API key (`kp_test_...` untuk Sandbox atau `kp_live_...` untuk Live) dan webhook secret dari mode yang sama pada menu Super Admin → QRIS & Harga. Kredensial disimpan terenkripsi di database dan tidak dikirim kembali ke browser. Atur `PUBLIC_API_URL` ke URL publik API, lalu tambahkan `${PUBLIC_API_URL}/api/payments/kasera/webhook` di Developer → Webhook Kasera dan pilih event `payment.paid`, `payment.expired`, serta `payment.failed`. Kredensial `KASERA_API_KEY` dan `KASERA_WEBHOOK_SECRET` di environment tetap didukung sebagai fallback. Checkout sekolah menggunakan QRIS dengan masa berlaku 60 menit; tarif transaksi mengikuti akun Kasera dan dipotong dari penerimaan merchant. Referensi: [Dokumentasi API Kasera Pay](https://pay.kasera.id/docs/api).

Set `JWT_SECRET` dengan string acak minimal 32 karakter dan isi `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, serta `SUPER_ADMIN_PASSWORD` (minimal 12 karakter). Lalu jalankan:

```powershell
npm run db:setup
npm run seed:admin
npm run seed:master-data -- 6GPJ
npm run dev
```

Buka `http://localhost:5173` untuk portal sekolah. Perintah seed Master Data mengisi contoh data untuk satu sekolah berdasarkan kode sekolah dan aman dijalankan ulang tanpa menggandakan contoh. Login Super Admin terpisah di `/super-admin/login`; pendaftaran dan login akun sekolah tersedia di `/school/register` dan `/school/login`. Pendaftaran meminta nomor WhatsApp Indonesia dan kata sandi minimal 8 karakter yang berisi huruf besar, angka, serta simbol. Setelah pendaftaran, aplikasi menampilkan ringkasan sekolah, kode 4 karakter yang bisa disalin, dan tombol untuk masuk ke dashboard. API berjalan di `http://localhost:4000`; pemeriksaan koneksi tersedia di `/api/health`.

## Deploy ke Railway

1. Tambahkan persistent volume ke layanan aplikasi dan mount pada `/data`. SQLite menyimpan database dan lampiran buku di volume tersebut; tanpa volume, data dapat hilang saat deploy atau restart. Gunakan satu replica aplikasi karena SQLite tidak cocok untuk beberapa instance yang menulis file database yang sama.
2. Tambahkan layanan dari repo GitHub ini (`mamend1997/perpus`, branch `main`). Konfigurasi build, start, dan health check dibaca dari `railway.json`; frontend dan API berjalan di satu layanan/domain.
3. Tambahkan environment variables layanan aplikasi:
   - `DB_PATH=/data/database.sqlite`.
   - `JWT_SECRET`: string acak kuat minimal 32 karakter.
   - `SCHOOL_SETTINGS_ENCRYPTION_KEY`: secret acak minimal 32 karakter untuk enkripsi token WhatsApp dan integrasi lain; pertahankan nilainya agar token tersimpan tetap dapat dibaca.
   - `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`: kredensial bootstrap admin; password minimal 12 karakter.
   - `CLIENT_ORIGIN`: URL publik layanan aplikasi, misalnya `https://nama-layanan.up.railway.app`.
   - `PUBLIC_API_URL`: URL publik API (umumnya sama dengan `CLIENT_ORIGIN` saat frontend dan API satu domain).
   - `KASERA_API_KEY` dan `KASERA_WEBHOOK_SECRET`: opsional, sebagai fallback kredensial Kasera mode Sandbox/Live yang sama. Kredensial juga dapat diatur di menu Super Admin → QRIS & Harga; jangan masukkan kredensial live ke repo.
4. Deploy. Skema database SQLite dijalankan otomatis sebelum API mulai. Jalankan `npm run seed:admin` sekali dari Railway service shell untuk membuat akun admin.
5. Generate domain publik Railway, lalu buka domain tersebut. `/api/health` adalah health check deployment.

Build command root `npm run build` memasang dependency server/client dengan devDependencies sebelum membangun Vite, sehingga berhasil walaupun Railway memakai mode production untuk instalasi awal.

Jangan simpan kredensial produksi di GitHub atau di `railway.json`; atur semuanya melalui Railway Variables.

### Mulai ulang penyimpanan dari kosong

Deployment SQLite membuat skema baru secara otomatis saat startup, tetapi seluruh akun, sekolah, transaksi, dan data MySQL lama tidak ikut dipindahkan. Di Railway, gunakan persistent volume pada `/data`, atur `DB_PATH=/data/database.sqlite`, dan pastikan variabel MySQL tidak lagi dipakai oleh layanan aplikasi. Jangan hapus layanan MySQL sampai aplikasi SQLite baru berhasil dicek; layanan itu dapat dihentikan atau dihapus setelah Anda yakin data lama memang tidak diperlukan.

## Struktur

```text
client/
  src/App.jsx                 # Login dan dashboard Super Admin
  src/school/                 # Portal sekolah, navigasi, dashboard, dan API client
  src/styles.css              # Tema responsif oranye-biru
  vite.config.js              # Proxy API lokal
server/
  sql/schema.sql              # Skema SQLite multi-tenant
  scripts/                    # Setup skema dan seed admin
  src/config/                 # Pool koneksi database
  src/middleware/             # Proteksi akses Super Admin dan sekolah
  src/routes/                 # Autentikasi, dashboard Super Admin, dan sekolah
.env.example
```

## Catatan keamanan dan batas starter

- API Super Admin dan akun sekolah menggunakan JWT berumur 8 jam; pendaftaran sekolah membuat tenant trial aktif dan administrator pertamanya dalam satu transaksi.
- Kode sekolah berisi 4 huruf/angka uppercase, dibuat secara acak oleh server, dan dijaga indeks unik di SQLite. Admin sekolah memerlukan kode sekolah, email, serta kata sandi untuk login.
- Endpoint pemeriksaan billing bersifat **read-only** terhadap invoice dan tenant; setiap pemeriksaan disimpan pada `billing_check_runs` dan dicatat di audit log. Admin sekolah dapat membuat tagihan perpanjangan Kasera; cron H-7, suspend tenant, dan notifikasi WhatsApp otomatis belum aktif.
- Dashboard sekolah mengambil statistik pengunjung, eksemplar aktif, peminjaman, pengajuan, pengadaan terbaru, dan ketersediaan koleksi dari API ber-tenant.
- Skema operasional mencakup katalog, eksemplar, peminjaman, pengadaan, kunjungan, ulasan, reservasi, dan pengumuman. Tabel `tenants_schools` adalah tabel sekolah/tenant kanonis agar kompatibel dengan data SaaS yang sudah ada.
- Menu operasional lain sudah memiliki navigasi dan kerangka modul; alur CRUD, import/export Excel, cetak barcode, laporan, dan notifikasi WhatsApp masih perlu dihubungkan ke API sebelum digunakan untuk transaksi.
- Pada deployment, layani frontend melalui HTTPS, simpan rahasia di environment platform, gunakan migrasi database terkelola, dan batasi CORS ke domain frontend produksi.
