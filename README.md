# PerpusKita — SaaS e-Perpustakaan

Starter multi-tenant untuk panel Super Admin, menggunakan Express, MySQL, React, Vite, dan Tailwind CSS. Data sekolah memakai `tenants_schools` sebagai tabel tenant kanonis; seluruh tabel operasional sekolah mereferensikan `school_id`.

## Prasyarat

- Node.js 20+
- MySQL 8+ (Railway MySQL juga didukung)

## Menjalankan lokal

```powershell
Copy-Item .env.example .env
npm install
npm install --prefix server
npm install --prefix client
```

Isi konfigurasi database di `.env`. Untuk Railway, salin connection URL MySQL ke `DATABASE_URL`; untuk MySQL lokal, isi `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, dan `DB_PASSWORD`. Buat database lokal `e_perpustakaan` terlebih dahulu.

Set `JWT_SECRET` dengan string acak minimal 32 karakter dan isi `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, serta `SUPER_ADMIN_PASSWORD` (minimal 12 karakter). Lalu jalankan:

```powershell
npm run db:setup
npm run seed:admin
npm run dev
```

Buka `http://localhost:5173` untuk portal sekolah. Login Super Admin terpisah di `/super-admin/login`; pendaftaran dan login administrator sekolah tersedia di `/school/register` dan `/school/login`. Pendaftaran meminta nomor WhatsApp Indonesia dan kata sandi minimal 8 karakter yang berisi huruf besar, angka, serta simbol. Setelah pendaftaran, aplikasi menampilkan ringkasan sekolah, kode 4 karakter yang bisa disalin, dan tombol untuk masuk ke dashboard. API berjalan di `http://localhost:4000`; pemeriksaan koneksi tersedia di `/api/health`.

## Deploy ke Railway

1. Buat project Railway dan tambahkan layanan **MySQL**.
2. Tambahkan layanan dari repo GitHub ini (`mamend1997/perpus`, branch `main`). Konfigurasi build, start, dan health check dibaca dari `railway.json`; frontend dan API berjalan di satu layanan/domain.
3. Tambahkan environment variables layanan aplikasi:
   - Hubungkan variabel MySQL service ke layanan aplikasi. Pilih reference variable `MYSQL_URL` sebagai `DATABASE_URL`, atau reference variabel `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, dan `MYSQLDATABASE` secara langsung; backend mendukung keduanya.
   - `JWT_SECRET`: string acak kuat minimal 32 karakter.
   - `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`: kredensial bootstrap admin; password minimal 12 karakter.
   - `CLIENT_ORIGIN`: URL publik layanan aplikasi, misalnya `https://nama-layanan.up.railway.app`.
4. Deploy. Jalankan `npm run db:setup` lalu `npm run seed:admin` sekali dari Railway service shell untuk menyiapkan tabel/migrasi dan akun admin.
5. Generate domain publik Railway, lalu buka domain tersebut. `/api/health` adalah health check deployment.

Build command root `npm run build` memasang dependency server/client dengan devDependencies sebelum membangun Vite, sehingga berhasil walaupun Railway memakai mode production untuk instalasi awal.

Jangan simpan kredensial produksi di GitHub atau di `railway.json`; atur semuanya melalui Railway Variables.

## Struktur

```text
client/
  src/App.jsx                 # Login dan dashboard Super Admin
  src/styles.css              # Tema responsif oranye-biru
  vite.config.js              # Proxy API lokal
server/
  sql/schema.sql              # Skema MySQL multi-tenant
  scripts/                    # Setup skema dan seed admin
  src/config/                 # Pool koneksi database
  src/middleware/             # Proteksi akses Super Admin
  src/routes/                 # Autentikasi dan API dashboard
.env.example
```

## Catatan keamanan dan batas starter

- API Super Admin dan akun sekolah menggunakan JWT berumur 8 jam; pendaftaran sekolah membuat tenant trial aktif dan administrator pertamanya dalam satu transaksi.
- Kode sekolah berisi 4 huruf/angka uppercase, dibuat secara acak oleh server, dan dijaga indeks unik di MySQL. Admin sekolah memerlukan kode sekolah, email, serta kata sandi untuk login.
- Endpoint pemeriksaan billing bersifat **read-only**. Ia merangkum tagihan yang terbuka/terlambat; pembuatan invoice, suspend tenant, scheduler, dan pengiriman notifikasi belum dijalankan sampai aturan bisnis dan kebijakan penagihan dikonfirmasi.
- Data dashboard akan menampilkan status kosong sampai sekolah, invoice, tiket, atau audit log diisikan.
- Menu lain ditampilkan sebagai navigasi awal/placeholder UI. Login, ringkasan dashboard, dan pemeriksaan billing terhubung ke API.
- Pada deployment, layani frontend melalui HTTPS, simpan rahasia di environment platform, gunakan migrasi database terkelola, dan batasi CORS ke domain frontend produksi.
