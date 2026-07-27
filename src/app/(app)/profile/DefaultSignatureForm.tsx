"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  setDefaultSignature,
  clearDefaultSignature,
  type SetDefaultSignatureState,
} from "./actions";

const initial: SetDefaultSignatureState = {};

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
 * Signature pad — mirror pattern SignatureBlock kontrak. Owner gores
 * TTD di canvas. Hasil di-encode PNG data URL & dikirim sebagai hidden
 * field "signature".
 */
function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [encoded, setEncoded] = useState<string>("");

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
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
  }
  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    setEncoded(dataUrl);
    onChange(dataUrl);
  }
  function clear() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setEncoded("");
    onChange(null);
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
        aria-label="Kotak tandatangan default"
      />
      <input type="hidden" name="signature" value={encoded} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Goreskan tandatangan Anda — jari di HP, mouse di desktop.
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={!encoded}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Hapus dan tanda tangan ulang"
        >
          ↻ Hapus &amp; ulang
        </button>
      </div>
    </div>
  );
}

/**
 * UI untuk set TTD default. Dua mode:
 *  - Draw:   gores di canvas (default)
 *  - Upload: pilih file PNG hasil scan/foto
 *
 * Kalau sudah ada default, tampilkan preview + tombol Hapus.
 */
export function DefaultSignatureForm({
  currentUrl,
}: {
  currentUrl: string | null;
}) {
  const [state, formAction] = useFormState(setDefaultSignature, initial);
  const [hasSig, setHasSig] = useState(false);
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [editing, setEditing] = useState(!currentUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [hasFile, setHasFile] = useState(false);

  if (!editing && currentUrl) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
          <div className="text-xs font-medium text-emerald-800">
            Tandatangan default aktif — akan otomatis muncul di kontrak baru.
          </div>
          <div className="mt-2 bg-white rounded border border-slate-200 p-2 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentUrl}
              alt="Tandatangan default"
              className="max-h-24 w-auto object-contain"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-secondary text-sm"
          >
            ✏️ Ganti tandatangan
          </button>
          <form action={clearDefaultSignature}>
            <button
              type="submit"
              className="btn-danger text-sm"
              onClick={(e) => {
                if (!confirm("Hapus tandatangan default? Kontrak baru harus ditandatangani manual.")) {
                  e.preventDefault();
                }
              }}
            >
              🗑 Hapus default
            </button>
          </form>
        </div>
      </div>
    );
  }

  const canSubmit = mode === "draw" ? hasSig : hasFile;

  return (
    <form action={formAction} className="space-y-3">
      <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setMode("draw")}
          className={`rounded px-3 py-1.5 font-medium transition ${
            mode === "draw" ? "bg-white shadow-sm text-slate-800" : "text-slate-600"
          }`}
        >
          ✍️ Gambar
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`rounded px-3 py-1.5 font-medium transition ${
            mode === "upload" ? "bg-white shadow-sm text-slate-800" : "text-slate-600"
          }`}
        >
          📎 Upload PNG
        </button>
      </div>

      {mode === "draw" ? (
        <SignaturePad onChange={(v) => setHasSig(!!v)} />
      ) : (
        <div>
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept="image/png"
            onChange={(e) => setHasFile(!!e.target.files?.[0])}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50"
          />
          <p className="mt-2 text-xs text-slate-500">
            File PNG saja (background transparan disarankan). Maks 100 KB.
          </p>
        </div>
      )}

      {state?.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.success}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <SubmitBtn disabled={!canSubmit} />
        {currentUrl && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm text-slate-500 hover:underline"
          >
            Batal
          </button>
        )}
      </div>
    </form>
  );
}
