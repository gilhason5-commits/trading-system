import type { PortfolioSnapshot } from "@trading/core";

// Dependency-free SVG equity curve from portfolio snapshots (spec §5).
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
  if (pts.length < 2) {
    return <div className="text-sm text-[var(--muted)]">אין מספיק נתונים לגרף</div>;
  }

  const values = pts.map((p) => p.total_value_usd);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 6;

  const coords = pts.map((p, i) => {
    const x = pad + (i / (pts.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (p.total_value_usd - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = values[values.length - 1]! >= values[0]!;
  const stroke = up ? "var(--pos)" : "var(--neg)";
  const area = `${line} L${coords[coords.length - 1]![0].toFixed(1)},${height - pad} L${coords[0]![0].toFixed(1)},${height - pad} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img">
      <path d={area} fill={stroke} fillOpacity={0.12} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2} />
    </svg>
  );
}
