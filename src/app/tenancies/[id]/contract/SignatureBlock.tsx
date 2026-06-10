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
}: {
  inputName: string;
  onChange?: (dataUrl: string | null) => void;
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
  }, []);

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
}: {
  tenancyId: string;
  role: "TENANT" | "OWNER";
  signedUrl: string | null;
  signedAt: Date | null;
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
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-1 text-xs text-slate-500 hover:underline no-print"
        >
          Tandatangan ulang
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="text-sm no-print">
      <div className="mb-1 text-center text-slate-500">
        {role === "OWNER" ? "PIHAK PERTAMA" : "PIHAK KEDUA"} — belum
        ditandatangani
      </div>
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <SignaturePad
        inputName="signature"
        onChange={(v) => setHasSig(!!v)}
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
