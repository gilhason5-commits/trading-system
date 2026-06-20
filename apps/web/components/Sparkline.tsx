"use client";

import { useState } from "react";
import { formatUsd, type PortfolioSnapshot } from "@trading/core";

// Dependency-free SVG equity curve from portfolio snapshots (spec §5).
// Interactive: hovering shows the date + portfolio value at that point.
export function Sparkline({
  snapshots,
  width = 600,
  height = 120,
}: {
  snapshots: PortfolioSnapshot[];
  width?: number;
  height?: number;
}) {
  const pts = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const [hover, setHover] = useState<number | null>(null);

  if (pts.length < 2) {
    return <div className="text-sm text-[var(--muted)]">אין מספיק נתונים לגרף</div>;
  }

  const values = pts.map((p) => p.total_value_usd);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 6;
  const n = pts.length;

  const coords = pts.map((p, i) => {
    const x = pad + (i / (n - 1)) * (width - pad * 2);
    const y = pad + (1 - (p.total_value_usd - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = values[n - 1]! >= values[0]!;
  const stroke = up ? "var(--pos)" : "var(--neg)";
  const area = `${line} L${coords[n - 1]![0].toFixed(1)},${height - pad} L${coords[0]![0].toFixed(1)},${height - pad} Z`;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(frac * (n - 1)));
  }

  const hp = hover !== null ? pts[hover] : null;
  const hc = hover !== null ? coords[hover] : null;
  const leftPct = hc ? (hc[0] / width) * 100 : 0;
  const topPct = hc ? (hc[1] / height) * 100 : 0;

  return (
    <div className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" className="block">
        <path d={area} fill={stroke} fillOpacity={0.12} />
        <path d={line} fill="none" stroke={stroke} strokeWidth={2} />
        {hc && (
          <line x1={hc[0]} y1={pad} x2={hc[0]} y2={height - pad} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
        )}
      </svg>
      {hc && (
        <div
          className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${leftPct}%`, top: `${topPct}%`, background: up ? "var(--pos)" : "var(--neg)" }}
        />
      )}
      {hp && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-center text-xs shadow-lg"
          style={{ left: `${Math.min(88, Math.max(12, leftPct))}%` }}
        >
          <div className="text-[var(--muted)]">{hp.date}</div>
          <div className="font-semibold text-[var(--text)]">{formatUsd(hp.total_value_usd)}</div>
          <div className="text-[var(--muted)]">‏{hp.total_value_ils.toLocaleString()} ₪</div>
        </div>
      )}
    </div>
  );
}
