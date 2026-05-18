# Panduan Deploy ke Produksi — Kelola Kos

> **Untuk pengguna awam.** Ikuti langkah ini berurutan, mengklik link & tombol persis seperti dijelaskan. Total ±15 menit, hasilnya aplikasi Anda online dengan URL HTTPS sendiri.

---

## Pilihan platform

Saya rekomendasikan **Railway** karena paling sederhana untuk pemula:
- ✅ 1-klik deploy dari GitHub
- ✅ Penyimpanan data (SQLite + foto upload) otomatis tersimpan
- ✅ HTTPS otomatis
- ✅ Custom domain gratis
- 💰 **Biaya: $5/bulan** (ada trial 30 hari gratis tanpa kartu kredit)

Kalau mau coba gratis dulu, scroll ke section **Render** atau **Fly.io** di bawah.

---

## Deploy ke Railway (Recommended)

### 1) Buat akun Railway

1. Buka https://railway.app
2. Klik **Login** → **Login with GitHub**
3. Authorize Railway membaca repository Anda

### 2) Deploy project

1. Di dashboard Railway, klik **New Project**
2. Pilih **Deploy from GitHub repo**
3. Pilih repository **`karuniawandenny-hub/Projectkost`**
4. Pilih branch **`claude/boarding-house-app-8gMh5`**
5. Railway otomatis mendeteksi `Dockerfile` dan mulai build (±5 menit)

### 3) Tambahkan Volume untuk simpan data

> Tanpa volume, **semua data hilang saat aplikasi restart**.

1. Di project Railway, klik service yang baru dibuat
2. Tab **Settings** → scroll ke **Volumes**
3. Klik **Add Volume**
   - **Mount path**: `/data`
   - **Size**: 1 GB (cukup untuk ratusan kos & ribuan foto)
4. Save

### 4) Set environment variables (env vars)

1. Tab **Variables** → **+ New Variable** untuk masing-masing:

```
JWT_SECRET            (klik "Generate" → pilih 64 karakter)
CRON_SECRET           (klik "Generate" → pilih 64 karakter)
NODE_ENV              production
EMAIL_MODE            dev
OTP_MODE              dev
PAYMENT_GATEWAY       mock
```

> `JWT_SECRET` dan `CRON_SECRET` **wajib** diisi dengan string acak panjang. `Generate` di Railway membuatkan otomatis.

> Sisanya **dev/mock** dulu — aplikasi tetap berjalan, hanya reminder email/WA & gateway pembayaran belum aktif. Bisa ditambah belakangan (lihat bagian **Aktifkan gateway** di bawah).

### 5) Set port

Masih di **Variables**, tambah satu lagi:
```
PORT                  3000
```

### 6) Get URL publik

1. Tab **Settings** → scroll ke **Networking** → klik **Generate Domain**
2. Railway membuat URL seperti `kelolakos-production.up.railway.app`
3. Buka URL itu → aplikasi Anda online! 🎉

### 7) Login pertama kali

1. Buka URL Railway Anda
2. Klik **Masuk** → username `admin` password `d111284k`
3. **WAJIB**: ganti password admin segera (menu Profil → atau via `/admin/users`)

---

## Aktifkan gateway (opsional, setelah app online)

Login admin → menu **Sistem** → ada panduan langkah-demi-langkah untuk:
- **Resend** (email pengingat) — gratis 3000 email/bulan
- **Fonnte** (WhatsApp pengingat) — gratis trial
- **Midtrans** (auto-verify pembayaran via QRIS/VA) — gratis sandbox, ada biaya per transaksi di produksi

Setiap kali Anda ubah env var di Railway, klik **Deploy** lagi (atau Redeploy) agar perubahan aktif.

---

## Custom domain (kos-anda.com)

1. Beli domain di Niagahoster / Domainesia / Cloudflare Registrar
2. Di Railway: **Settings** → **Networking** → **Custom Domain** → masukkan domain Anda
3. Railway memberikan CNAME record → masukkan di DNS panel domain Anda
4. Tunggu ±10 menit → HTTPS otomatis aktif

---

## Alternatif gratis: Render

> ⚠️ Render Free tier **tidak** punya persistent storage di Web Service. Data akan hilang saat redeploy. Hanya untuk demo singkat.

1. Buat akun di https://render.com
2. New → **Web Service** → connect GitHub repo
3. Branch: `claude/boarding-house-app-8gMh5`
4. Runtime: **Docker**
5. Plan: Free
6. Env vars sama seperti Railway di atas
7. Klik Deploy

Untuk produksi, upgrade ke plan Starter ($7/mo) yang punya persistent disk.

---

## Alternatif: VPS sendiri (Hostinger / DigitalOcean)

Kalau Anda sudah punya VPS:

```bash
# Di VPS:
git clone https://github.com/karuniawandenny-hub/projectkost.git
cd projectkost
git checkout claude/boarding-house-app-8gMh5

# Build & run Docker
docker build -t kelolakos .
docker run -d -p 3000:3000 \
  -v /var/data/kelolakos:/data \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e CRON_SECRET="$(openssl rand -hex 32)" \
  --restart unless-stopped \
  --name kelolakos kelolakos
```

Lalu pasang **nginx** sebagai reverse proxy + **certbot** untuk HTTPS.

---

## Troubleshooting

### "Application failed to respond"
- Tunggu ±2 menit untuk build pertama selesai
- Cek **Deployments** tab di Railway → klik deployment terbaru → tab **Logs** → cari error

### "500 Internal Server Error" saat akses
- Pastikan `JWT_SECRET` ter-set (panjang min 16 karakter)
- Pastikan Volume sudah ter-mount di `/data`

### Login admin tidak bisa
- Cek logs: cari baris `[seed] Admin dibuat`. Kalau tidak ada, volume belum ter-mount → tambahkan Volume + Redeploy
- Pastikan akses `https://<your-domain>/api/health` mengembalikan `{"ok":true}`

### Saya butuh bantuan
Ambil screenshot **Logs** dari Railway → kirimkan ke developer Anda untuk dianalisis.

---

## Setelah deploy berhasil

Cek halaman **`/admin/system`** secara berkala untuk:
- Memastikan reminder berjalan setiap hari
- Memantau jumlah transaksi gateway
- Test koneksi email/WA

Selamat menggunakan Kelola Kos! 🏠
