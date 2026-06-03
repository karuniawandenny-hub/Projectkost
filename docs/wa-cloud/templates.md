# Templates yang perlu di-approve Meta

Sebelum cutover dari Fonnte ke Cloud API, **semua template ini wajib
sudah di-approve** Meta. Tanpa template approved, outbound message
(business-initiated) akan di-tolak.

Total: **9 template UTILITY**. Approval Meta biasanya 30 menit-2 jam
(kategori UTILITY cepat karena fungsi essensial). Submit semua
sekaligus di awal.

---

## Cara submit template di Meta Business Manager

1. Buka [business.facebook.com](https://business.facebook.com)
2. Sidebar kiri → **WhatsApp Manager** → **Message Templates**
3. Klik **Create Template** di pojok kanan atas
4. Untuk **tiap template di bawah**, ulangi:

### Setup tiap template

5. **Category**: pilih **Utility** (untuk semua template Kos Baiti)
6. **Name**: copy persis dari list di bawah (lowercase + underscore)
7. **Languages**: pilih **Indonesian (id)**
8. Klik **Continue**

### Isi struktur

9. **Header** (untuk semua template kita): pilih **Media** → **Image**
   - Upload file `og-image.jpg` dari `public/og-image.jpg` di repo
     (atau download dari `https://www.kosbaiti.com/og-image.jpg`)
   - File ini akan jadi logo yang muncul di setiap pesan template
10. **Body**: copy text dari "Body" di bawah, persis termasuk
    placeholder `{{1}}`, `{{2}}`, dst
    - Saat ditanya "sample values", isi dari "Sample params"
11. **Footer**: copy dari "Footer" di bawah (sama untuk semua: `— Kos Baiti`)
12. **Buttons**: tambah URL button dengan text + URL dari "Buttons"
13. Klik **Submit**
14. Status akan jadi **In Review** lalu **Approved** (cek email)

---

## Template List

### 1. `tenant_assigned` (welcome saat tenant ditempatkan)

**Body:**
```
Halo {{1}},

Anda sudah ditempatkan di Kamar {{2}} - {{3}}.
Mulai sewa: {{4}}
Tagihan: {{5}}/bulan

Selamat datang di Kos Baiti. Mohon simpan nomor ini agar update tagihan & komunikasi pemilik tidak terlewat.
```
**Sample params:** `Budi` `A1` `Kos Baiti Pusat` `01 Juni 2026` `Rp 800.000`
**Footer:** `— Kos Baiti`
**Buttons:** URL `Buka Aplikasi` → `https://www.kosbaiti.com`

---

### 2. `payment_reminder_h7` (reminder tagihan H-7)

**Body:**
```
Halo {{1}},

Pengingat 7 hari lagi: tagihan kos periode {{2}}
  Kos: {{3}}
  Kamar: {{4}}
  Nominal: {{5}}
  Jatuh tempo: {{6}}

Mohon disiapkan pembayarannya sebelum jatuh tempo.
```
**Sample params:** `Budi` `Mei 2026` `Kos Baiti Pusat` `A1` `Rp 800.000` `01 Juni 2026`
**Footer:** `— Kos Baiti`
**Buttons:** URL `Lihat Tagihan` → `https://www.kosbaiti.com/payments`

---

### 3. `payment_reminder_h3` (reminder tagihan H-3)

**Body:**
```
Halo {{1}},

Pengingat 3 hari lagi: tagihan kos periode {{2}}
  Nominal: {{3}}
  Jatuh tempo: {{4}}

Mohon selesaikan pembayaran sebelum jatuh tempo, ya.
```
**Sample params:** `Budi` `Mei 2026` `Rp 800.000` `01 Juni 2026`
**Footer:** `— Kos Baiti`
**Buttons:** URL `Bayar Sekarang` → `https://www.kosbaiti.com/payments`

---

### 4. `payment_reminder_h1` (reminder tagihan H-1 / besok)

**Body:**
```
Halo {{1}},

Pengingat BESOK: tagihan kos periode {{2}} jatuh tempo.
Nominal: {{3}}

Silakan upload bukti transfer di aplikasi setelah membayar.
```
**Sample params:** `Budi` `Mei 2026` `Rp 800.000`
**Footer:** `— Kos Baiti`
**Buttons:** URL `Upload Bukti` → `https://www.kosbaiti.com/payments`

---

### 5. `payment_overdue` (tagihan sudah lewat)

**Body:**
```
Halo {{1}},

Tagihan periode {{2}} sudah lewat {{3}} hari.
Nominal: {{4}}

Mohon segera upload bukti pembayaran agar tidak menambah keterlambatan. Bila ada kendala, silakan hubungi pemilik kos.
```
**Sample params:** `Budi` `April 2026` `5` `Rp 800.000`
**Footer:** `— Kos Baiti`
**Buttons:** URL `Bayar Sekarang` → `https://www.kosbaiti.com/payments`

---

### 6. `payment_verified` (konfirmasi pembayaran lunas)

**Body:**
```
Halo {{1}},

Terima kasih, pembayaran Anda sudah kami verifikasi.
  Periode: {{2}}
  Nominal: {{3}}
  Tanggal verifikasi: {{4}}

Tagihan periode ini sudah lunas. Sampai jumpa di periode berikutnya!
```
**Sample params:** `Budi` `Mei 2026` `Rp 800.000` `03 Juni 2026 10:30`
**Footer:** `— Kos Baiti`
**Buttons:** URL `Lihat Kuitansi` → `https://www.kosbaiti.com/payments`

---

### 7. `complaint_resolved` (komplain ditandai selesai)

**Body:**
```
Halo {{1}},

Komplain Anda sudah selesai ditangani oleh pemilik kos.
Judul: {{2}}

Catatan pemilik: {{3}}

Bila masih ada kendala, silakan buka kembali komplain melalui aplikasi.
```
**Sample params:** `Budi` `AC kamar bocor` `Sudah diperbaiki, freon ditambah`
**Footer:** `— Kos Baiti`
**Buttons:** URL `Lihat Komplain` → `https://www.kosbaiti.com/complaints`

---

### 8. `maintenance_reminder_owner` (reminder perawatan ke pemilik)

**Body:**
```
Halo {{1}},

Pengingat jadwal perawatan {{2}}:
  {{3}}
  Lokasi: {{4}}
  Tanggal: {{5}}

Buka aplikasi untuk tandai sudah dikerjakan atau atur ulang jadwal.
```
**Sample params:** `Bapak Denny` `besok` `Service AC` `Kos Baiti Pusat - Kamar A1` `06 Juni 2026`
**Footer:** `— Kos Baiti`
**Buttons:** URL `Buka Perawatan` → `https://www.kosbaiti.com/maintenance`

---

### 9. `maintenance_notify_tenant` (notif perawatan ke penghuni)

**Body:**
```
Halo {{1}},

Pemilik kos memberitahu akan ada perawatan kamar Anda.
Judul: {{2}}
Kamar: {{3}}
Tanggal rencana: {{4}}

Akses ke kamar mungkin terbatas selama perawatan berlangsung. Mohon kerja samanya.
```
**Sample params:** `Budi` `Cat ulang dinding` `Kos Baiti Pusat - Kamar A1` `10 Juni 2026`
**Footer:** `— Kos Baiti`
**Buttons:** URL `Buka Aplikasi` → `https://www.kosbaiti.com`

---

## Status check

Setelah submit semua 9 template:

1. **Email notification**: Meta kirim email ke admin Business Account
   saat tiap template selesai review (approved / rejected).
2. **Dashboard check**: WhatsApp Manager → Message Templates →
   filter Status = **All**. Lihat kolom Status.

| Status | Arti | Action |
|---|---|---|
| 🟡 **In Review** | Lagi di-review Meta (~30 menit - 2 jam) | Tunggu |
| 🟢 **Approved** | Siap dipakai | OK lanjut cutover |
| 🔴 **Rejected** | Ditolak — lihat alasan di kolom Reason | Edit & resubmit |

Kalau rejected: alasan umum termasuk:
- Body terlalu menyerupai marketing (UTILITY harus pure transaksional)
- URL button mengarah ke domain yang belum diverifikasi
- Sample params tidak masuk akal

Edit text → submit ulang. Approval biasanya cepat di iterasi 2.

---

## Setelah SEMUA approved

Lanjut ke **`migration.md`** untuk eksekusi cutover dari Fonnte ke
Cloud API.

## Source of truth template

File `src/lib/wa-templates.ts` di codebase adalah source of truth.
Kalau Anda ubah template di Meta (mis. perbaiki typo) atau ubah text
di kode, pastikan keduanya sync — kalau text berbeda Meta tolak
saat send.
