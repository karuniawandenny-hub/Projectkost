# Kelola Kos — Manajemen Bisnis Kos

Aplikasi web (responsif mobile) untuk menghubungkan **pemilik kos** dan **penghuni**.
Pemilik bisa kelola data semua kos & penghuni; penghuni bisa upload KTP, foto diri,
bukti pembayaran bulanan, dan membuat komplain dengan foto — semua langsung dari HP.

## Fitur utama

- **Auth email + password** — sederhana, langsung jalan tanpa setup eksternal.
- **Onboarding wajib** untuk penghuni: foto/scan KTP + foto diri (selfie) — bisa
  langsung ambil dari kamera HP.
- **Manajemen kos & kamar** untuk pemilik (multi-kos), assign penghuni ke kamar
  via email.
- **Pembayaran bulanan**: penghuni upload bukti transfer (file atau foto kamera);
  pemilik verifikasi / tolak dengan catatan.
- **Komplain dengan foto**: penghuni lampirkan foto (file atau kamera);
  pemilik membalas & mengubah status (terbuka → diproses → selesai).
- **Notifikasi internal** untuk setiap event penting.
- **Dashboard** ringkas untuk pemilik & penghuni.

## Tech stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Prisma + SQLite (mudah migrasi ke PostgreSQL untuk produksi)
- Auth: `bcryptjs` (password hashing) + `jose` (JWT cookie HttpOnly)
- File storage: local `public/uploads/` (siap migrasi ke S3/Supabase Storage)

## Menjalankan secara lokal

```bash
# 1) Install dependencies
npm install

# 2) Salin env example & sesuaikan
cp .env.example .env
# Edit .env: pastikan JWT_SECRET diisi string acak panjang.
# Generate cepat: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3) Inisialisasi database + seed akun admin
npm run db:setup

# 4) Jalankan dev server
npm run dev
# Buka http://localhost:3000
```

### Akun admin default

Saat `npm run db:setup` (atau `npm run db:seed`) dijalankan, akun admin
otomatis dibuat:

| Field    | Nilai                 |
|----------|-----------------------|
| Username | `admin`               |
| Password | `d111284k`            |
| Email    | `admin@kelolakos.local` |

Login sebagai admin dari halaman `/login` (boleh isi username atau email) →
otomatis diarahkan ke modul admin `/admin`. **Segera ganti password admin
default ini sebelum deploy ke produksi.**

## Peran & hak akses

- **Admin** (`/admin`): kelola seluruh user (approve pemilik, ubah peran,
  nonaktifkan akun, reset password), lihat semua kos / pembayaran / komplain
  di sistem.
- **Pemilik kos**: kelola kos & kamar miliknya, verifikasi pembayaran,
  tanggapi komplain. **Pendaftaran pemilik membutuhkan persetujuan admin**
  (status `PENDING` saat baru daftar, tidak bisa login sampai disetujui).
- **Penghuni**: daftar langsung aktif, wajib onboarding KTP + selfie,
  bisa upload bukti pembayaran & komplain di kamar yang di-assign.

## Reset password (Lupa password)

User mengeklik "Lupa password?" di halaman login → masukkan email → terima
link reset 1 jam → buat password baru → otomatis diarahkan ke login.

### Mode dev (default, `EMAIL_MODE=dev`)

Tidak benar-benar mengirim email. Setelah submit, link reset ditampilkan
langsung di halaman dalam banner kuning untuk testing.

### Mode produksi (`EMAIL_MODE=resend`)

Pakai [Resend](https://resend.com) — paling cepat (gratis 3000 email/bulan
tanpa kartu kredit):

1. Daftar di https://resend.com → buat API Key.
2. (Opsional, untuk domain custom) verifikasi domain Anda di dashboard.
3. Set di `.env`:
   ```
   EMAIL_MODE=resend
   RESEND_API_KEY=re_xxxxxxxxxxxxxxx
   EMAIL_FROM="Kelola Kos <noreply@yourdomain.com>"
   ```
   Tanpa domain verified, Resend hanya mengizinkan kirim ke email yang
   sama dengan akun Anda — cukup untuk testing.

## Flow pendaftaran

1. Buka `/register` → isi nama, email, password (min 8 karakter), pilih peran
   (Pemilik atau Penghuni). Nomor HP opsional.
2. Setelah submit → otomatis masuk dashboard. Tidak ada OTP, tidak ada verifikasi
   email eksternal — auth sepenuhnya internal.
3. **Penghuni** akan diarahkan ke halaman onboarding (upload KTP + selfie) sebelum
   bisa mengakses fitur lain.
4. **Pemilik** bisa langsung tambah kos & kamar, lalu assign penghuni ke kamar
   menggunakan email penghuni yang sudah terdaftar.

## Migrasi ke produksi

- Ganti SQLite → PostgreSQL: ubah `provider` & `DATABASE_URL` di `prisma/schema.prisma`,
  lalu `npx prisma migrate deploy`.
- File upload local → S3/Supabase Storage: ganti implementasi `saveUploadedFile` di
  `src/lib/upload.ts`.
- Cookie `secure=true` sudah otomatis aktif saat `NODE_ENV=production`.
- Tambahkan rate-limit di endpoint login/register untuk mencegah brute force.
- Pertimbangkan email verification atau 2FA bila dibutuhkan keamanan ekstra.

## Struktur folder

```
src/
  app/
    (auth)/        # login, register, logout
    (app)/         # halaman dengan layout aplikasi (butuh login)
      dashboard/
      kos/
      tenants/
      payments/
      complaints/
      notifications/
      profile/
    onboarding/    # wajib untuk penghuni baru (KTP + selfie)
  components/      # Shell, NotifBell, CameraInput
  lib/             # prisma, session, password, phone, upload, notify
prisma/
  schema.prisma
public/uploads/    # disimpan di sini (di-gitignore)
```

## Catatan

- Penghuni baru wajib menyelesaikan onboarding sebelum bisa akses dashboard.
- Penghuni bisa upload bukti pembayaran hanya jika sudah di-assign ke kamar
  oleh pemilik.
- Tombol "Ambil foto" memicu kamera HP langsung (atribut `capture` HTML5);
  "Pilih dari file" untuk upload file biasa.

---

Lisensi: untuk penggunaan internal/perorangan.
