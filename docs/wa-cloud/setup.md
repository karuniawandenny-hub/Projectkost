# Setup WhatsApp Business Cloud API Meta

Panduan step-by-step ke dashboard Meta untuk persiapan migrasi dari
Fonnte ke Cloud API resmi.

**Estimasi waktu:** 1-2 jam (termasuk verifikasi domain & WA Business).
**Biaya:** Gratis 1000 conversation/bulan selamanya (tier Meta free).

---

## Prasyarat

- 1 nomor HP yang BELUM terdaftar di WhatsApp Business app
  (atau bersedia un-register dari WA Business app dulu)
- Akun Facebook (untuk Meta Business Manager)
- Akses domain `kosbaiti.com` untuk verifikasi (opsional, untuk
  Verified Business badge)

---

## Langkah 1 — Buat Meta Business Account (10 menit)

1. Buka [business.facebook.com](https://business.facebook.com)
2. Klik **Create Account**
3. Isi nama bisnis: `Kos Baiti`
4. Email & nama Anda
5. Klik **Submit**
6. Verifikasi email yang dikirim ke inbox Anda

---

## Langkah 2 — Setup WhatsApp Business (15 menit)

1. Di Business Manager, sidebar kiri → **WhatsApp Accounts**
2. Klik **Get Started** atau **Add WhatsApp Account**
3. Pilih **Create a new WhatsApp Business Account**
4. Isi:
   - **WhatsApp Business Account Name**: `Kos Baiti`
   - **Timezone**: Asia/Jakarta
   - **Currency**: IDR
5. Klik **Continue**

### Tambah nomor telepon

6. Klik **Add Phone Number**
7. Pilih cara verifikasi: **SMS** atau **Voice call**
8. Masukkan nomor HP yang akan jadi nomor business (mis. `+62 812-xxxx-xxxx`)
   - ⚠️ Pastikan nomor ini belum terdaftar di WA Business app
   - ⚠️ Jika sudah, uninstall WA Business app dulu di HP itu
9. Masukkan kode OTP yang Meta kirim
10. **Nomor sekarang terdaftar di Cloud API.** Akan muncul info:
    - Display phone number (yang dilihat penerima)
    - **Phone Number ID** (penting — copy ini)

---

## Langkah 3 — Dapatkan Access Token (10 menit)

Meta kasih 2 jenis token. Kita pakai **System User Token** karena
permanent (tidak expire), beda dengan User Token yang expire 60 hari.

1. Sidebar kiri Business Manager → **Business Settings**
2. Cari section **Users** → **System Users**
3. Klik **Add** → bikin system user baru:
   - Name: `kos-baiti-api`
   - Role: **Admin**
4. Klik **Add Assets** → pilih **Apps** → pilih WhatsApp Business App
   Anda (yang baru di-create) → centang **Full Control**
5. Klik **Generate New Token**:
   - **App**: pilih WhatsApp Business app
   - **Token expiration**: pilih **Never**
   - **Permissions**: centang
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
6. Klik **Generate Token**
7. **COPY token yang muncul** — ini terlihat sekali aja!
   - Token format: `EAAxxxxxxxxxxxxxxxxxxx...` (panjang ~200 karakter)

⚠️ **JANGAN bagikan token ini ke siapa pun.** Token ini setara dengan
password.

---

## Langkah 4 — Set env di Railway (3 menit)

1. Buka Railway → project Anda → service Projectkost
2. Tab **Variables** → klik **+ New Variable**
3. Tambah 3 variable:

| Name | Value |
|---|---|
| `META_WA_PHONE_ID` | (Phone Number ID dari langkah 2.10) |
| `META_WA_TOKEN` | (Token panjang dari langkah 3.7) |
| `META_WA_API_VERSION` | `v18.0` |

4. ⚠️ **JANGAN langsung set `OTP_MODE=cloud`** — itu baru di lakukan
   setelah template di-approve (langkah selanjutnya).

5. Railway auto-redeploy.

---

## Langkah 5 — Verifikasi setup berhasil

Setelah deploy selesai, login admin di kosbaiti.com → menu Sistem →
**Test Cloud API** (akan ditambah saat eksekusi migrasi).

ATAU: dari terminal lokal, jalankan:

```bash
curl -X GET "https://graph.facebook.com/v18.0/<PHONE_ID>?fields=display_phone_number,verified_name,quality_rating" \
  -H "Authorization: Bearer <YOUR_TOKEN>"
```

Response yang OK:
```json
{
  "display_phone_number": "+62 812-XXXX-XXXX",
  "verified_name": "Kos Baiti",
  "quality_rating": "GREEN",
  "id": "<PHONE_ID>"
}
```

Kalau dapat ini → setup Meta side **OK**. Lanjut ke template approval.

---

## Langkah berikutnya

Setelah setup OK, lanjut ke **`templates.md`** untuk submit template
yang perlu di-approve Meta sebelum cutover dari Fonnte.
