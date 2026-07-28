"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { signContract, type SignState } from "./actions";

const initial: SignState = {};

function SubmitBtn({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="btn-primary text-sm disabled:opacity-50"
    >
      {pending ? "Menyimpan…" : "Simpan tandatangan"}
    </button>
  );
}

/**
 * Tandatangan elektronik via canvas. Mendukung mouse + touch (jari di
 * HP) + stylus. Hasil di-encode jadi PNG data URL, dikirim ke server
 * action via hidden field.
 *
 * Cara kerja:
 *  - canvas render putih, garis gelap, lebar 2.5px.
 *  - Pointer events terunifikasi (mouse, touch, pen).
 *  - Empty detection: kalau user tap submit tanpa coret apa pun, server
 *    side menolak via length check.
 */
function SignaturePad({
  inputName,
  onChange,
  defaultSignatureUrl,
}: {
  inputName: string;
  onChange?: (dataUrl: string | null) => void;
  /** Kalau di-set, canvas auto-populated dengan gambar ini saat mount.
   *  Owner tinggal klik "Simpan tandatangan" tanpa gores manual, atau
   *  "Hapus & ulang" untuk mulai dari kanvas kosong. */
  defaultSignatureUrl?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const dirtyRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [encoded, setEncoded] = useState<string>("");

  // Setup canvas saat mount + scale untuk crispness di high-DPI.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;

    // Preload default signature ke canvas (contain-fit, center).
    if (defaultSignatureUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const cw = rect.width;
        const ch = rect.height;
        // Fit gambar ke canvas dengan preserved aspect ratio (contain).
        const scale = Math.min(cw / img.width, ch / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        const dx = (cw - w) / 2;
        const dy = (ch - h) / 2;
        ctx.drawImage(img, dx, dy, w, h);
        const dataUrl = canvas.toDataURL("image/png");
        setEncoded(dataUrl);
        onChange?.(dataUrl);
      };
      img.src = defaultSignatureUrl;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSignatureUrl]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = pos(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !ctxRef.current) return;
    const p = pos(e);
    const last = lastRef.current;
    if (last) {
      ctxRef.current.beginPath();
      ctxRef.current.moveTo(last.x, last.y);
      ctxRef.current.lineTo(p.x, p.y);
      ctxRef.current.stroke();
    }
    lastRef.current = p;
    dirtyRef.current = true;
  }

  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    setEncoded(dataUrl);
    onChange?.(dataUrl);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setEncoded("");
    dirtyRef.current = false;
    onChange?.(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        className="block w-full touch-none rounded border-2 border-dashed border-slate-300 bg-white"
        style={{ height: 160 }}
        aria-label="Kotak tandatangan"
      />
      <input type="hidden" name={inputName} value={encoded} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Goreskan tanda tangan Anda di kotak — jari di HP, mouse di desktop.
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={!encoded}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Hapus dan tanda tangan ulang"
        >
          ↻ Hapus & ulang
        </button>
      </div>
    </div>
  );
}

/**
 * Wrapper form: jika belum tertandatangani, tampilkan kanvas + tombol.
 * Kalau sudah, tampilkan tandatangan + tanggal + tombol "tandatangan
 * ulang" yang membuka form lagi.
 */
export function SignatureBlock({
  tenancyId,
  role,
  signedUrl,
  signedAt,
  canSign = true,
  defaultSignatureUrl,
}: {
  tenancyId: string;
  role: "TENANT" | "OWNER";
  signedUrl: string | null;
  signedAt: Date | null;
  /** Apakah viewer saat ini berhak tandatangan di kolom ini.
   *  - role=OWNER: true kalau viewer = pemilik ASLI kos. MANAGER (anggota
   *    tim) & ADMIN dapat false — mereka hanya melihat.
   *  - role=TENANT: true kalau viewer = penghuni pemilik tenancy.
   *  Kalau false, komponen tampil read-only tanpa kanvas & tombol. */
  canSign?: boolean;
  /** TTD default owner. Hanya di-pass dari page ketika viewer adalah
   *  owner sendiri (bukan tenant/admin) dan role="OWNER". */
  defaultSignatureUrl?: string | null;
}) {
  const [state, formAction] = useFormState(signContract, initial);
  const [hasSig, setHasSig] = useState(false);
  const [editing, setEditing] = useState(!signedUrl);

  if (!editing && signedUrl) {
    return (
      <div className="text-center text-sm">
        <div className="text-slate-500">
          {role === "OWNER" ? "PIHAK PERTAMA" : "PIHAK KEDUA"}
        </div>
        <div className="mx-auto my-3 max-w-[200px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signedUrl}
            alt="Tandatangan"
            className="mx-auto h-20 w-auto object-contain"
          />
          <div className="mt-1 border-b border-slate-400" />
        </div>
        {signedAt && (
          <div className="text-xs text-slate-500">
            Ditandatangani {signedAt.toLocaleString("id-ID", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
        {canSign && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-1 text-xs text-slate-500 hover:underline no-print"
          >
            Tandatangan ulang
          </button>
        )}
      </div>
    );
  }

  // Viewer tidak berhak tandatangan (mis. MANAGER / ADMIN / tenant lihat
  // kolom owner). Tampil placeholder read-only tanpa kanvas & tombol —
  // agar tidak ada risiko MANAGER mengklik tandatangan atas nama owner.
  if (!canSign) {
    return (
      <div className="text-sm">
        <div className="mb-1 text-center text-slate-500">
          {role === "OWNER" ? "PIHAK PERTAMA" : "PIHAK KEDUA"}
        </div>
        <div
          className="mx-auto flex h-[80px] w-full max-w-[240px] items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-400 no-print"
          aria-label="Belum ditandatangani"
        >
          Menunggu tandatangan
          <br />
          {role === "OWNER" ? "pemilik kos" : "penghuni"}
        </div>
        <div className="mt-1 hidden border-b border-slate-400 print:block" />
      </div>
    );
  }

  return (
    <form action={formAction} className="text-sm no-print">
      <div className="mb-1 text-center text-slate-500">
        {role === "OWNER" ? "PIHAK PERTAMA" : "PIHAK KEDUA"} — belum
        ditandatangani
      </div>
      {defaultSignatureUrl && (
        <div className="mb-2 rounded-md border border-brand-200 bg-brand-50/50 px-2 py-1 text-center text-[11px] text-brand-800">
          ✍️ Tandatangan default sudah dimuat — klik <em>Simpan tandatangan</em>
          {" "}untuk pakai, atau <em>Hapus &amp; ulang</em> untuk gambar manual.
        </div>
      )}
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <SignaturePad
        inputName="signature"
        onChange={(v) => setHasSig(!!v)}
        defaultSignatureUrl={defaultSignatureUrl ?? null}
      />
      <div className="mt-2 flex items-center justify-between">
        <SubmitBtn disabled={!hasSig} />
        {signedUrl && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-slate-500 hover:underline"
          >
            Batal
          </button>
        )}
      </div>
      {state.error && (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Tandatangan tersimpan.
        </div>
      )}
    </form>
  );
}
