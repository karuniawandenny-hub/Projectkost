/**
 * Komponen chart sederhana berbasis SVG inline.
 * Tidak butuh library eksternal; bisa di-render server-side oleh Next.js
 * (cocok untuk dashboard server component).
 */

export type Segment = {
  label: string;
  value: number;
  color: string;
};

export type StackedBarPoint = {
  label: string;        // sumbu X (mis. "Mar 2026")
  segments: Segment[];  // satu kolom = beberapa segmen warna
  total?: number;       // optional override total
};

const PALETTE = {
  emerald: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  slate: "#94a3b8",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  brand: "#2563eb",
};
export { PALETTE };

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
) {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const large = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${end.x} ${end.y} A ${r} ${r} 0 ${large} 0 ${start.x} ${start.y} Z`;
}
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function PieChart({
  data,
  size = 180,
  emptyLabel = "Tidak ada data",
  variant = "donut",
  showSliceLabel = true,
}: {
  data: Segment[];
  size?: number;
  emptyLabel?: string;
  /** "donut" tampilkan lubang dengan total di tengah; "pie" potongan solid. */
  variant?: "donut" | "pie";
  /** Tampilkan label persentase langsung di tiap potongan (untuk variant pie). */
  showSliceLabel?: boolean;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className="grid place-items-center" style={{ minHeight: size }}>
        <div className="text-sm text-slate-400">{emptyLabel}</div>
      </div>
    );
  }
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  // Untuk posisi label, gunakan jari-jari sedikit lebih dalam.
  const labelR = r * 0.62;
  let cur = 0;

  // Pre-compute angle & posisi label per segmen sebelum render (karena
  // `cur` di-mutasi di dalam map).
  const segmentsCalc = data.map((d) => {
    if (d.value <= 0) return null;
    const startAngle = cur;
    const angle = (d.value / total) * 360;
    const endAngle = startAngle + angle;
    cur += angle;
    const mid = startAngle + angle / 2;
    const labelPos = polar(cx, cy, labelR, mid);
    return { d, startAngle, endAngle, angle, mid, labelPos };
  });

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="shrink-0"
        role="img"
        aria-label="Pie chart"
      >
        {segmentsCalc.map((seg, i) => {
          if (!seg) return null;
          const { d, startAngle, endAngle, angle } = seg;
          // SVG arcs tidak handle full circle 360 — kalau hanya 1 segmen,
          // gambar lingkaran penuh saja.
          if (angle >= 359.99) {
            return <circle key={i} cx={cx} cy={cy} r={r} fill={d.color} />;
          }
          const path = describeArc(cx, cy, r, startAngle, endAngle);
          return (
            <path
              key={i}
              d={path}
              fill={d.color}
              stroke="#fff"
              strokeWidth="1.5"
            />
          );
        })}

        {variant === "donut" ? (
          <>
            {/* Donut hole */}
            <circle cx={cx} cy={cy} r={r * 0.55} fill="#fff" />
            <text
              x={cx}
              y={cy - 2}
              textAnchor="middle"
              className="fill-slate-900"
              style={{ fontSize: 18, fontWeight: 700 }}
            >
              {total}
            </text>
            <text
              x={cx}
              y={cy + 14}
              textAnchor="middle"
              className="fill-slate-500"
              style={{ fontSize: 10 }}
            >
              total
            </text>
          </>
        ) : (
          // Variant: pie murni — opsional label persentase di tiap potongan.
          showSliceLabel &&
          segmentsCalc.map((seg, i) => {
            if (!seg) return null;
            const pct = (seg.d.value / total) * 100;
            // Hanya tampilkan label di potongan yang cukup besar (>7%).
            if (pct < 7) return null;
            return (
              <text
                key={`l-${i}`}
                x={seg.labelPos.x}
                y={seg.labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  paintOrder: "stroke",
                  stroke: "rgba(0,0,0,0.25)",
                  strokeWidth: 2,
                }}
              >
                {Math.round(pct)}%
              </text>
            );
          })
        )}
      </svg>
      <ul className="space-y-1.5 text-sm">
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <li key={i} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-slate-700">{d.label}</span>
              <span className="text-slate-500 text-xs">
                {d.value} ({pct}%)
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function BarChart({
  data,
  height = 180,
  formatValue = (n) => String(n),
  emptyLabel = "Tidak ada data",
}: {
  data: Segment[];
  height?: number;
  formatValue?: (n: number) => string;
  emptyLabel?: string;
}) {
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div className="grid place-items-center" style={{ minHeight: height }}>
        <div className="text-sm text-slate-400">{emptyLabel}</div>
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const barAreaH = height - 32; // ruang untuk label di bawah
  return (
    <div
      className="flex items-end gap-2 overflow-x-auto"
      style={{ minHeight: height }}
      role="img"
      aria-label="Bar chart"
    >
      {data.map((d, i) => {
        const h = max > 0 ? (d.value / max) * barAreaH : 0;
        return (
          <div
            key={i}
            className="flex flex-1 min-w-[40px] flex-col items-center"
          >
            <div className="text-[10px] text-slate-600 font-medium mb-0.5">
              {formatValue(d.value)}
            </div>
            <div className="w-full grid items-end" style={{ height: barAreaH }}>
              <div
                className="rounded-t-md w-full"
                style={{
                  height: Math.max(2, h),
                  backgroundColor: d.color,
                }}
                title={`${d.label}: ${formatValue(d.value)}`}
              />
            </div>
            <div className="text-[10px] text-slate-600 mt-1 text-center break-words">
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StackedBarChart({
  data,
  height = 200,
  formatValue = (n) => String(n),
  legend,
  emptyLabel = "Tidak ada data",
}: {
  data: StackedBarPoint[];
  height?: number;
  formatValue?: (n: number) => string;
  legend?: Segment[];
  emptyLabel?: string;
}) {
  if (data.length === 0 || data.every((p) => p.segments.every((s) => s.value === 0))) {
    return (
      <div className="grid place-items-center" style={{ minHeight: height }}>
        <div className="text-sm text-slate-400">{emptyLabel}</div>
      </div>
    );
  }
  const maxTotal = Math.max(
    ...data.map((p) => p.total ?? p.segments.reduce((s, x) => s + x.value, 0)),
    1
  );
  const barAreaH = height - 48;
  return (
    <div>
      <div
        className="flex items-end gap-2 overflow-x-auto"
        style={{ minHeight: height - 24 }}
        role="img"
        aria-label="Stacked bar chart"
      >
        {data.map((p, i) => {
          const total = p.total ?? p.segments.reduce((s, x) => s + x.value, 0);
          const barH = maxTotal > 0 ? (total / maxTotal) * barAreaH : 0;
          return (
            <div
              key={i}
              className="flex flex-1 min-w-[48px] flex-col items-center"
            >
              <div className="text-[10px] text-slate-600 font-medium mb-0.5">
                {formatValue(total)}
              </div>
              <div
                className="w-full flex flex-col-reverse overflow-hidden rounded-t-md"
                style={{ height: Math.max(2, barH) }}
                title={`${p.label}: ${formatValue(total)}`}
              >
                {p.segments.map((s, j) => {
                  if (s.value <= 0) return null;
                  const segH = (s.value / total) * barH;
                  return (
                    <div
                      key={j}
                      style={{
                        height: segH,
                        backgroundColor: s.color,
                      }}
                      title={`${s.label}: ${formatValue(s.value)}`}
                    />
                  );
                })}
              </div>
              <div className="text-[10px] text-slate-600 mt-1 text-center">
                {p.label}
              </div>
            </div>
          );
        })}
      </div>
      {legend && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {legend.map((s, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-slate-700">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
