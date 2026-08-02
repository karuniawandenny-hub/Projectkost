"use client";

import { useState, useMemo } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { ownerRegisterTenant, type OwnerRegisterTenantState } from "../actions";

export type KosOption = {
  id: string;
  name: string;
  rooms: { id: string; name: string; monthlyPrice: number }[];
};

const initialState: OwnerRegisterTenantState = {};

const DEFAULT_PASSWORD = "baitikos";

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

/**
 * Bangun pesan welcome untuk WhatsApp — sengaja text tebal & readable
 * di WA (line breaks, spacing, bullets pakai •). Isi mengikuti brief
 * pemilik: identitas akun, kamar, ubah password/email, save contact
 * untuk Asisten AI, dan fitur aplikasi yang bisa dipakai.
 */
function buildWelcomeWaText(r: {
  tenantName: string;
  phone: string;
  kosName: string;
  roomName: string;
  startDate: string;
  monthlyPrice: number;
  password: string;
}): string {
  const startStr = new Date(r.startDate).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return [
    `Halo ${r.tenantName}, saat ini akun Anda telah dibuat oleh pemilik.`,
    "",
    `Anda telah di-assign di *${r.kosName}* — *Kamar ${r.roomName}*.`,
    `Mulai sewa: ${startStr}`,
    `Tagihan: Rp ${r.monthlyPrice.toLocaleString("id-ID")}/bulan`,
    "",
    "*Cara login aplikasi:*",
    `• Nomor HP: ${r.phone}`,
    `• Password: ${r.password}`,
    "",
    "Silahkan ubah password dan email Anda setelah login pertama (menu Profil).",
    "",
    "*Simpan nomor ini dengan nama \"Kos Baiti\"* untuk mengaktifkan Asisten AI.",
    "",
    "Gunakan aplikasi untuk:",
    "• Mengajukan komplain",
    "• Mendapatkan kuitansi pembayaran",
    "• Mendapatkan kontrak sewa",
    "• dan lain-lain.",
    "",
    "Terima kasih 🙏",
  ].join("\n");
}

/**
 * Bikin URL wa.me — format wa.me menerima nomor tanpa "+", jadi kita
 * strip semua non-digit. Pesan di-encode ke URL.
 */
function buildWaMeUrl(phone: string, text: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function SuccessPanel({
  registered,
  message,
  onRegisterAnother,
  onGoToList,
}: {
  registered: NonNullable<OwnerRegisterTenantState["registered"]>;
  message: string;
  onRegisterAnother: () => void;
  onGoToList: () => void;
}) {
  const waText = useMemo(() => buildWelcomeWaText(registered), [registered]);
  const waUrl = useMemo(
    () => buildWaMeUrl(registered.phone, waText),
    [registered.phone, waText]
  );
  const [waClicked, setWaClicked] = useState(false);

  return (
    <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <span className="text-3xl">✓</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-emerald-800">
            Penghuni berhasil didaftarkan
          </h2>
          <p className="mt-1 text-sm text-emerald-800">{message}</p>

          {/* ===== Panel utama: kirim WA ===== */}
          <div className="mt-4 rounded-md border-2 border-emerald-400 bg-white p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="text-lg">📱</span> Kirim pesan welcome ke penghuni
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Klik tombol di bawah untuk membuka WhatsApp dengan pesan sudah
              disiapkan. Tinggal tekan kirim di aplikasi WA Anda. Pesan
              berisi info login, cara pakai aplikasi, dan saran simpan
              kontak.
            </p>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setWaClicked(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-600"
            >
              <span className="text-base">💬</span>
              Kirim via WhatsApp ke {registered.phone}
            </a>
            {waClicked && (
              <p className="mt-2 text-xs text-emerald-700">
                ✓ WhatsApp dibuka. Kalau chat tidak muncul, cek: nomor
                sudah aktif WhatsApp?
              </p>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                Lihat/salin pesan
              </summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                {waText}
              </pre>
            </details>
          </div>

          {/* ===== Info dokumen ===== */}
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold">Catatan:</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>
                Foto KTP + selfie belum ada — bisa upload nanti dari /tenants
                (oleh Anda) atau penghuni sendiri via /onboarding setelah
                login.
              </li>
              <li>
                Password default:{" "}
                <code className="rounded bg-white px-1 font-mono">
                  {DEFAULT_PASSWORD}
                </code>
                . Sarankan penghuni ganti sendiri di menu Profil.
              </li>
            </ul>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRegisterAnother}
              className="btn-primary"
            >
              Daftarkan penghuni lain
            </button>
            <button
              type="button"
              onClick={onGoToList}
              className="btn-secondary"
            >
              Ke daftar penghuni
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OwnerRegisterTenantForm({
  kosOptions,
}: {
  kosOptions: KosOption[];
}) {
  const router = useRouter();
  const [state, action] = useFormState(ownerRegisterTenant, initialState);

  if (state.success && state.registered) {
    return (
      <SuccessPanel
        registered={state.registered}
        message={state.success}
        onRegisterAnother={() => router.refresh()}
        onGoToList={() => router.push("/tenants")}
      />
    );
  }

  return <RegisterFormFields action={action} error={state.error} kosOptions={kosOptions} />;
}

function RegisterFormFields({
  action,
  error,
  kosOptions,
}: {
  action: (formData: FormData) => void;
  error?: string;
  kosOptions: KosOption[];
}) {
  const [selectedKosId, setSelectedKosId] = useState<string>(
    kosOptions[0]?.id ?? ""
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");

  const rooms = useMemo(
    () => kosOptions.find((k) => k.id === selectedKosId)?.rooms ?? [],
    [kosOptions, selectedKosId]
  );
  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId),
    [rooms, selectedRoomId]
  );

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ===== Data penghuni ===== */}
      <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-2 text-sm font-semibold text-slate-700">
          Data penghuni
        </legend>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Nama lengkap <span className="text-red-600">*</span>
          </label>
          <input
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={100}
            className="input mt-1 h-10 w-full"
            placeholder="Nama sesuai KTP"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Nomor HP (WhatsApp aktif) <span className="text-red-600">*</span>
          </label>
          <input
            name="phone"
            type="tel"
            required
            className="input mt-1 h-10 w-full"
            placeholder="08xxxxxxxxxx"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-slate-500">
            Nomor ini dipakai untuk login penghuni & reminder pembayaran via
            WhatsApp. Wajib nomor aktif.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Password login
          </label>
          <input
            name="password"
            type="text"
            required
            minLength={4}
            defaultValue={DEFAULT_PASSWORD}
            className="input mt-1 h-10 w-full font-mono"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-slate-500">
            Default: <code className="rounded bg-slate-100 px-1">
              {DEFAULT_PASSWORD}
            </code>{" "}
            (bisa Anda ubah). Sarankan penghuni untuk mengganti password
            sendiri di /profile setelah login pertama.
          </p>
        </div>
      </fieldset>

      {/* ===== Kamar & mulai sewa ===== */}
      <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-2 text-sm font-semibold text-slate-700">
          Kamar & mulai sewa
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Kos <span className="text-red-600">*</span>
            </label>
            <select
              value={selectedKosId}
              onChange={(e) => {
                setSelectedKosId(e.target.value);
                setSelectedRoomId("");
              }}
              className="input mt-1 h-10 w-full"
            >
              {kosOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} ({k.rooms.length} kamar kosong)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Kamar <span className="text-red-600">*</span>
            </label>
            <select
              name="roomId"
              required
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="input mt-1 h-10 w-full"
            >
              <option value="">— Pilih kamar —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  Kamar {r.name} — {rupiah(r.monthlyPrice)}/bulan
                </option>
              ))}
            </select>
            {rooms.length === 0 && (
              <p className="mt-1 text-xs text-amber-700">
                Tidak ada kamar kosong di kos ini.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Tanggal mulai sewa <span className="text-red-600">*</span>
            </label>
            <input
              name="startDate"
              type="date"
              required
              defaultValue={todayIso}
              className="input mt-1 h-10 w-full"
            />
            <p className="mt-1 text-xs text-slate-500">
              Tagihan bulanan otomatis dibuat mulai tanggal ini.
            </p>
          </div>

          {selectedRoom && (
            <div className="rounded-md bg-slate-50 p-3 text-sm">
              <div className="font-medium text-slate-700">Ringkasan:</div>
              <div className="text-slate-600">
                Kamar {selectedRoom.name} • {rupiah(selectedRoom.monthlyPrice)}
                /bulan
              </div>
            </div>
          )}
        </div>
      </fieldset>

      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <div className="font-semibold">Catatan tentang dokumen:</div>
        <p className="mt-1">
          Foto KTP + selfie <strong>tidak wajib</strong> saat mendaftarkan.
          Bisa dilengkapi nanti — oleh Anda di halaman /tenants, atau oleh
          penghuni sendiri via halaman /onboarding.
        </p>
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary w-full sm:w-auto"
    >
      {pending ? "Mendaftarkan..." : "Daftarkan & assign kamar"}
    </button>
  );
}
