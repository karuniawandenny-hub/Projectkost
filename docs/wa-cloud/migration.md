# Migrasi Fonnte → WhatsApp Cloud API Meta

Dokumen ini panduan **EKSEKUSI** cutover setelah:
- ✅ Setup Meta Business + Phone ID + Access Token (`setup.md`)
- ✅ 9 template di-approve di Meta Manager (`templates.md`)
- ✅ Env `META_WA_PHONE_ID`, `META_WA_TOKEN` sudah di-set di Railway

Estimasi waktu eksekusi: ~30 menit (asumsi semua di atas done).

---

## Strategi cutover

Aplikasi punya **5 jenis pesan WA outbound**:
1. Welcome tenant assignment (tenants/actions.ts, kos/actions.ts)
2. Reminder pembayaran H-7/H-3/H-1/Overdue (lib/reminders.ts cron)
3. Konfirmasi pembayaran lunas (lib/payment-confirmation.ts)
4. Komplain ditandai selesai (complaints/actions.ts)
5. Reminder maintenance ke pemilik (lib/reminders.ts cron)
6. Notif perawatan ke tenant (maintenance/actions.ts)

Semua sekarang lewat fungsi `sendWhatsAppGeneric()` yang mengirim text
generik via Fonnte. Untuk Cloud API, **caller harus dirubah** —
panggil `sendKosBaitiTemplate()` dengan nama template + body params.

**Pendekatan migrasi:** refactor satu-per-satu caller, bisa rollback
ke Fonnte kapan saja via env `OTP_MODE=fonnte`.

---

## Step 1 — Verifikasi setup Meta (5 menit)

Login ke admin app → menu **Sistem** → klik **Cek setup Cloud API**
(akan ada di action `pingCloudApi()` saat eksekusi).

Output harus berisi: display phone number + verified name + quality
rating GREEN.

Kalau gagal:
- Token expired / wrong → regen di Meta Business Settings
- Phone ID salah → cek di WhatsApp Manager → API Setup

---

## Step 2 — Test kirim 1 template ke nomor sendiri (5 menit)

Sebelum cutover production, kirim test:

```ts
import { sendKosBaitiTemplate } from "@/lib/wa-templates";

await sendKosBaitiTemplate("628xxxxxxxxxx", "tenant_assigned", [
  "Test User",
  "A1",
  "Kos Test",
  "01 Juni 2026",
  "Rp 800.000",
]);
```

Hasil yang Anda lihat di WA recipient:
- **Image header**: logo Kos Baiti (di-cache Meta saat approval)
- **Body**: text yang sudah di-substitusi sample params
- **Footer**: "— Kos Baiti"
- **Button**: "Buka Aplikasi" → kosbaiti.com

Kalau muncul lengkap → API works, template approved benar.

---

## Step 3 — Refactor caller satu-per-satu

### 3.1 Welcome tenant assignment

**File:** `src/app/(app)/tenants/actions.ts` (sekitar line 163),
`src/app/(app)/kos/actions.ts` (sekitar line 222).

**Sebelum:**
```ts
await sendWhatsAppGeneric(target.phone, buildTenantAssignedWaText(welcomeParams));
```

**Sesudah:**
```ts
import { sendKosBaitiTemplate } from "@/lib/wa-templates";

await sendKosBaitiTemplate(target.phone, "tenant_assigned", [
  target.name,                              // {{1}}
  room.name,                                // {{2}}
  room.kos.name,                            // {{3}}
  formatTanggalId(startDate),               // {{4}}
  formatRupiah(room.monthlyPrice),          // {{5}}
]);
```

### 3.2 Reminder pembayaran (4 type)

**File:** `src/lib/reminders.ts` (sekitar line 290, di dalam processReminders).

Refactor `sendWhatsAppGeneric(tenant.phone, body)` jadi:

```ts
const templateMap = {
  H7: "payment_reminder_h7",
  H3: "payment_reminder_h3",
  H1: "payment_reminder_h1",
  OVERDUE: "payment_overdue",
};

const params: Record<string, string[]> = {
  H7: [tenant.name, periodLabel, p.tenancy.room.kos.name,
       p.tenancy.room.name, amountFmt, dueStr],
  H3: [tenant.name, periodLabel, amountFmt, dueStr],
  H1: [tenant.name, periodLabel, amountFmt],
  OVERDUE: [tenant.name, periodLabel, String(Math.abs(dayDiff)), amountFmt],
};

await sendKosBaitiTemplate(tenant.phone, templateMap[type], params[type]);
```

### 3.3 Konfirmasi pembayaran lunas

**File:** `src/lib/payment-confirmation.ts` (sekitar line 132).

```ts
await sendKosBaitiTemplate(tenant.phone, "payment_verified", [
  tenant.name,
  periodLabel,
  amountFmt,
  verifiedAt.toLocaleString("id-ID", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }),
]);
```

### 3.4 Komplain selesai

**File:** `src/app/(app)/complaints/actions.ts` (sekitar line 170).

```ts
await sendKosBaitiTemplate(tenant.phone, "complaint_resolved", [
  tenant.name,
  complaint.title,
  finalReply ?? "(tidak ada catatan)",  // template harus selalu punya {{3}}
]);
```

### 3.5 Reminder maintenance

**File:** `src/lib/reminders.ts` (di processReminders untuk maintenance).

```ts
const horizon = kind === "H7" ? "7 hari lagi" : kind === "H3" ? "3 hari lagi" : "besok";
await sendKosBaitiTemplate(owner.phone, "maintenance_reminder_owner", [
  owner.name.split(/\s+/)[0],
  horizon,
  m.title,
  `${m.kos.name}${m.room ? ` - Kamar ${m.room.name}` : ""}`,
  dueStr,
]);
```

### 3.6 Notif perawatan ke tenant

**File:** `src/app/(app)/maintenance/actions.ts` `notifyAffectedTenant()`.

```ts
if (event === "SCHEDULED") {
  await sendKosBaitiTemplate(tenant.phone, "maintenance_notify_tenant", [
    tenant.name,
    m.title,
    `${m.kos.name} - Kamar ${m.room.name}`,
    formatDateID(m.scheduledDate),
  ]);
}
// Untuk IN_PROGRESS & COMPLETED: bisa pakai template baru ATAU
// kirim free-text (kalau tenant lagi dalam 24h session window).
```

---

## Step 4 — Cutover env (1 menit)

Di Railway → Variables:

| Env | Sebelum | Sesudah |
|---|---|---|
| `OTP_MODE` | `fonnte` | `cloud` |
| `WA_GATEWAY_TOKEN` | (Fonnte token) | (boleh kosongkan, tidak dipakai) |
| `WA_INLINE_PREVIEW` | `false` | (tidak dipakai) |
| `META_WA_PHONE_ID` | (kosong) | (sudah diisi dari setup.md) |
| `META_WA_TOKEN` | (kosong) | (sudah diisi dari setup.md) |

Railway auto-redeploy ~3 menit.

---

## Step 5 — Monitor cutover

Setelah deploy, monitor Railway logs untuk 24 jam pertama. Cari:
- `[wa][cloud-template]` — template terkirim sukses
- `[wa][cloud-response] http=200` — Meta accept
- `[wa][cloud-response] http=400` + body → ada error, periksa

Jenis error umum Meta Cloud API:
| Code | Arti | Fix |
|---|---|---|
| 131047 | No 24h session, butuh template | Pastikan caller pakai sendKosBaitiTemplate, bukan sendFreeText |
| 131026 | Recipient nomor invalid | Cek format nomor (e164 tanpa +) |
| 131056 | Template name typo | Sync nama di `wa-templates.ts` dengan yang di-approve Meta |
| 132001 | Template not found in language | Cek language code di-set "id" |
| 80007 | Rate limit | Tunggu, atau upgrade tier |

---

## Step 6 — Rollback plan

Kalau ada masalah serius setelah cutover, rollback dengan **1 baris**:

```
Railway → Variables → OTP_MODE = fonnte
```

Aplikasi kembali pakai Fonnte. Tidak ada perubahan kode lain
diperlukan, karena `sendWhatsAppGeneric` mendukung kedua mode.

---

## Pasca-migrasi: Quota monitoring

Meta Cloud API tier free: **1000 conversation/bulan**.

1 conversation = 24-jam window dengan 1 nomor. Berarti:
- Kirim 10 pesan ke 100 nomor berbeda = 100 conversation (1 per nomor)
- Kirim 1 reminder ke 1 nomor per bulan = 1 conversation
- Reply tenant masih dalam 24h dari pesan kita = same conversation

**Pemakaian Kos Baiti estimasi:**
- 50 tenant × 4 reminder/bulan = 200 conversation
- 50 tenant × ~2 notif lain/bulan = 100 conversation
- Total: ~300 conversation/bulan → MASIH FREE

Untuk skala >200 tenant, perlu monitor lebih ketat. Cek pemakaian:
WhatsApp Manager → Insights → Conversations.
