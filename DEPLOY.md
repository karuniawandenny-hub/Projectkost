# 🚀 Deploy Kelola Kos — Panduan Pemula

> Buat aplikasi Anda online dengan URL HTTPS sendiri dalam **±10 menit**, tanpa perlu paham teknis. Hanya **4 klik utama** di Railway.

---

## Yang Anda butuhkan

- Akun GitHub (sudah ada — repo Anda sudah di GitHub)
- ±10 menit
- Tidak perlu setup env vars, tidak perlu sentuh code

---

## Langkah 1 — Buat akun Railway (1 menit)

1. Buka **https://railway.com** di browser
2. Klik **Login** (kanan atas)
3. Pilih **Login with GitHub**
4. Klik **Authorize Railway** saat diminta

---

## Langkah 2 — Deploy aplikasi (3 menit)

1. Di Dashboard Railway, klik tombol ungu **+ New Project**
2. Pilih **Deploy from GitHub repo**
3. Pertama kali pakai mungkin diminta install Railway GitHub App → klik **Configure** → pilih repository `Projectkost` saja → **Save**
4. Setelah balik ke Railway, pilih **`karuniawandenny-hub/Projectkost`**
5. Railway akan tampilkan halaman setup → **biarkan default** → klik **Deploy**

Railway mulai build (±5 menit). Tunggu sampai status **Success** (warna hijau).

> Aplikasi sudah ter-konfigurasi otomatis — **JWT_SECRET, CRON_SECRET, dll di-generate sendiri saat startup**. Anda tidak perlu set env var apapun!

---

## Langkah 3 — Pilih branch yang benar (1 menit)

Railway secara default ambil branch `main`. Anda perlu ganti ke branch yang ada code-nya:

1. Klik service yang baru saja dibuat (kotak di canvas)
2. Tab **Settings**
3. Scroll ke section **Source**
4. Di field **Branch**, ganti dari `main` → **`claude/boarding-house-app-8gMh5`**
5. Railway otomatis rebuild dengan branch yang benar

---

## Langkah 4 — Tambah Volume + Generate Domain (2 menit)

### Tambah Volume (supaya data tidak hilang saat restart)

1. Masih di service Anda, tab **Settings**
2. Scroll cari section **Volumes** → klik **+ Add Volume**
3. **Mount path**: ketik `/data`
4. **Size**: `1` GB
5. Klik **Add Volume** → Railway rebuild sebentar

### Generate URL publik

1. Tab **Settings** → scroll ke section **Networking**
2. Klik **Generate Domain**
3. Railway kasih URL seperti `kelolakos-production-xxxx.up.railway.app`
4. Klik URL itu di browser

---

## Langkah 5 — Login pertama (10 detik)

1. Browser akan tampilkan halaman aplikasi Anda
2. Klik **Masuk**
3. Username: **`admin`**
4. Password: **`d111284k`**
5. ✅ Anda di dashboard admin!

---

## 🔴 SEGERA ganti password admin

Password `d111284k` adalah default — orang lain yang tahu repository Anda bisa login juga. **Segera ganti**:

1. Login admin
2. Klik menu **Pengguna**
3. Cari user **Administrator** → klik
4. Scroll ke **Reset password**
5. Isi password baru yang kuat (mis. `KosKu#2026Aman!`)
6. **Simpan**

---

## ✅ Selesai!

Aplikasi Anda sekarang online di URL Railway Anda. Anda bisa:
- Bagikan URL ke pemilik kos & penghuni untuk daftar
- Tambah kos & kamar via UI pemilik
- Penghuni daftar lewat URL Anda, owner approve, mulai transaksi

---

## Kalau ada error saat deploy

1. Tab **Deployments** → klik deployment yang error → tab **Logs**
2. Screenshot bagian error → kirimkan ke developer Anda
3. Atau gunakan tombol **Continue in Chat** di Railway untuk tanya AI Railway

---

## Fitur opsional (bisa diaktifkan kapan saja nanti)

Login admin → menu **Sistem** → ada panduan klik-demi-klik untuk aktivasi:

| Fitur | Provider | Biaya |
|-------|----------|-------|
| Reminder pembayaran via email | Resend | Gratis 3000/bulan |
| Reminder pembayaran via WhatsApp | Fonnte | Gratis trial |
| Pembayaran online QRIS/VA/e-wallet | Midtrans | Gratis sandbox, ~2% per transaksi prod |

Untuk aktivasi, ikuti panduan di /admin/system. Hanya butuh tambah env var di Railway → otomatis redeploy.

---

## Custom domain (opsional)

Mau pakai `kosanda.com` bukan URL Railway?

1. Beli domain (Niagahoster / Domainesia / Cloudflare ~Rp 150rb/tahun)
2. Railway → Settings → Networking → **+ Custom Domain**
3. Masukkan domain Anda
4. Railway kasih CNAME record → copy ke DNS panel domain Anda
5. Tunggu ±10 menit → HTTPS otomatis aktif

---

## Biaya

- **Railway**: trial 30 hari gratis (tanpa kartu kredit), lalu $5/bulan (~Rp 80rb/bulan) untuk plan Hobby
- **Custom domain** (opsional): ~Rp 150rb/tahun
- **Gateway opsional** (Resend/Fonnte/Midtrans): gratis untuk pemakaian wajar

Total biaya untuk mulai: **Rp 0** (gunakan trial Railway), lalu **±Rp 80rb/bulan** setelah trial habis.
