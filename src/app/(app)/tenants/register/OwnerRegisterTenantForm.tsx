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

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export function OwnerRegisterTenantForm({
  kosOptions,
}: {
  kosOptions: KosOption[];
}) {
  const router = useRouter();
  const [state, action] = useFormState(ownerRegisterTenant, initialState);

  // Kalau sukses, tampilkan panel success + tombol "Daftarkan lagi" / "Ke daftar".
  if (state.success) {
    return (
      <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <span className="text-3xl">✓</span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-emerald-800">
              Penghuni berhasil didaftarkan
            </h2>
            <p className="mt-1 text-sm text-emerald-800">{state.success}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.refresh()}
                className="btn-primary"
              >
                Daftarkan penghuni lain
              </button>
              <button
                type="button"
                onClick={() => router.push("/tenants")}
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
  const [ktpFileName, setKtpFileName] = useState<string>("");
  const [selfieFileName, setSelfieFileName] = useState<string>("");

  const rooms = useMemo(
    () => kosOptions.find((k) => k.id === selectedKosId)?.rooms ?? [],
    [kosOptions, selectedKosId]
  );
  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId),
    [rooms, selectedRoomId]
  );

  // Default tanggal hari ini (YYYY-MM-DD).
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Email login <span className="text-red-600">*</span>
            </label>
            <input
              name="email"
              type="email"
              required
              className="input mt-1 h-10 w-full"
              placeholder="penghuni@contoh.com"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-slate-500">
              Kalau penghuni tidak punya email, buatkan email fiktif (mis.
              nama.hpxxx@kosbaiti.local) — yang penting unik.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Nomor HP <span className="text-red-600">*</span>
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
              Dipakai untuk reminder pembayaran via WhatsApp.
            </p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Password login <span className="text-red-600">*</span>
          </label>
          <input
            name="password"
            type="text"
            required
            minLength={8}
            className="input mt-1 h-10 w-full font-mono"
            placeholder="min 8 karakter"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-slate-500">
            Anda yang tentukan. Beritahu penghuni secara langsung/verbal supaya
            mereka bisa login. Penghuni bisa ganti password nanti di /profile.
          </p>
        </div>
      </fieldset>

      {/* ===== Dokumen ===== */}
      <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-2 text-sm font-semibold text-slate-700">
          Dokumen (wajib)
        </legend>
        <p className="text-xs text-slate-600">
          Foto KTP fisik penghuni + foto selfie penghuni saat mereka datang.
          Anda bisa langsung ambil foto pakai kamera HP di form ini.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Foto KTP <span className="text-red-600">*</span>
            </label>
            <input
              name="ktp"
              type="file"
              accept="image/*"
              capture="environment"
              required
              onChange={(e) => setKtpFileName(e.target.files?.[0]?.name ?? "")}
              className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            {ktpFileName && (
              <p className="mt-1 text-xs text-emerald-700">✓ {ktpFileName}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Foto selfie <span className="text-red-600">*</span>
            </label>
            <input
              name="selfie"
              type="file"
              accept="image/*"
              capture="user"
              required
              onChange={(e) =>
                setSelfieFileName(e.target.files?.[0]?.name ?? "")
              }
              className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            {selfieFileName && (
              <p className="mt-1 text-xs text-emerald-700">
                ✓ {selfieFileName}
              </p>
            )}
          </div>
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
              Tagihan bulanan otomatis dibuat mulai tanggal ini. Jatuh tempo
              tiap bulan ikut hari yang sama.
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
