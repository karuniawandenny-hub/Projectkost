# Kelola Kos — Manajemen Bisnis Kos

Aplikasi web (responsif mobile) untuk menghubungkan **pemilik kos** dan **penghuni**.
Pemilik bisa kelola data semua kos & penghuni; penghuni bisa upload KTP, foto diri,
bukti pembayaran bulanan, dan membuat komplain dengan foto — semua langsung dari HP.

## Fitur utama

- **Auth via nomor HP + OTP** (mode `dev` mencetak OTP di console; mode produksi siap
  integrasi gateway WhatsApp/SMS).
- **Onboarding wajib** untuk penghuni: foto/scan KTP + foto diri (selfie) — bisa
  langsung ambil dari kamera HP.
- **Manajemen kos & kamar** untuk pemilik (multi-kos), assign penghuni ke kamar.
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
- Auth: `jose` (JWT) + cookie HttpOnly
- File storage: local `public/uploads/` (siap migrasi ke S3/Supabase Storage)

## Menjalankan secara lokal

```bash
# 1) Install dependencies
npm install

# 2) Salin env example & sesuaikan
cp .env.example .env
# Edit .env: pastikan JWT_SECRET diisi string acak panjang.

# 3) Inisialisasi database
npx prisma db push

# 4) Jalankan dev server
npm run dev
# Buka http://localhost:3000
```

> **OTP dev**: pada mode `OTP_MODE=dev`, OTP **tidak dikirim ke nomor HP** —
> cek terminal server, OTP tercetak di sana untuk pengujian.

## Integrasi WhatsApp/SMS

Default `OTP_MODE=dev`: OTP tidak dikirim ke HP, tetapi otomatis ditampilkan
di halaman verifikasi dalam banner kuning (mudah untuk testing). Tidak perlu
buka terminal.

### Pakai Fonnte (paling cepat untuk Indonesia)

1. Daftar gratis di https://fonnte.com.
2. Pindai QR untuk menghubungkan WhatsApp device Anda.
3. Salin **Device Token** dari dashboard Fonnte.
4. Set di `.env`:
   ```
   OTP_MODE=fonnte
   WA_GATEWAY_TOKEN=<device-token-anda>
   ```
5. Restart `npm run dev`. Daftar/login → OTP akan benar-benar dikirim ke
   WhatsApp Anda.

### Pakai gateway lain (Twilio, WaSenderApi, dll)

Set:
```
OTP_MODE=generic
WA_GATEWAY_URL=<endpoint>
WA_GATEWAY_TOKEN=<token bearer>
```
Aplikasi akan POST JSON `{ phone, message }` dengan header
`Authorization: Bearer <token>`. Untuk gateway dengan skema berbeda,
edit fungsi di `src/lib/otp.ts`.

## Migrasi ke produksi

- Ganti SQLite → PostgreSQL: ubah `provider` & `DATABASE_URL` di `prisma/schema.prisma`,
  lalu `npx prisma migrate deploy`.
- File upload local → S3/Supabase Storage: ganti implementasi `saveUploadedFile` di
  `src/lib/upload.ts`.
- Set cookie `secure` (sudah otomatis di production).
- Tambahkan rate-limit di endpoint OTP & cron untuk reminder jatuh tempo.

## Struktur folder

```
src/
  app/
    (auth)/        # login, register, verify OTP, logout
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
  lib/             # prisma, session, otp, phone, upload, notify
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
