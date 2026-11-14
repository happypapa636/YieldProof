"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { fmtMusd, fmtPct } from "@/lib/format";
import { PALETTE } from "@/lib/palette";
import { waterfallRanges, type WaterfallStep } from "@/lib/model/explain";

const AXIS = { stroke: PALETTE.lineStrong, tick: { fill: PALETTE.muted, fontSize: 11.5 }, tickLine: false } as const;
const GRID = { stroke: PALETTE.line, strokeDasharray: "0", vertical: false } as const;

function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; swatch?: React.ReactNode }[] }) {
  return (
    <div className="rounded-[6px] border border-line-strong bg-raised px-3 py-2 text-[12px]">
      <p className="mb-1 font-medium text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-ink-2">
          {r.swatch}
          <span className="text-muted">{r.label}</span>
          <span className="figure ml-auto pl-3 text-ink">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export type { WaterfallStep };

/**
 * Horizontal waterfall: advertised (outline) → gains (green) → costs (red) → net.
 * Each row positions its own bar from the running total, so labels can never
 * drift away from their bars. Works at any width.
 */
export function Waterfall({ steps, unit = "MUSD" }: { steps: WaterfallStep[]; unit?: string }) {
  const rows = waterfallRanges(steps);
  const lo = Math.min(0, ...rows.map((r) => Math.min(r.from, r.to)));
  const hi = Math.max(0, ...rows.map((r) => Math.max(r.from, r.to)));
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;
  const zero = pct(0);

  return (
    <figure aria-label={`Waterfall in ${unit}: ${rows.map((r) => `${r.label} ${r.unavailable ? "unavailable" : fmtMusd(r.value, 2, r.kind !== "advertised")}`).join(", ")}`}>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const left = pct(Math.min(r.from, r.to));
          const width = Math.max(0.6, pct(Math.max(r.from, r.to)) - left);
          const isNet = r.kind === "net";
          const color = r.unavailable
            ? ""
            : r.kind === "advertised"
              ? "border border-dashed border-muted bg-transparent"
              : r.kind === "gain"
                ? "bg-pos/85"
                : r.kind === "cost"
                  ? "bg-neg/85"
                  : r.value >= 0
                    ? "bg-pos"
                    : "bg-neg";
          return (
            <li key={r.label} className={cn("grid grid-cols-[minmax(92px,150px)_1fr_minmax(72px,auto)] items-center gap-3 text-[12.5px]", isNet && "mt-2 border-t border-line pt-3")}>
              <span className={cn("truncate", isNet ? "font-medium text-ink" : "text-muted")}>{r.label}</span>
              <span className="relative h-[18px]">
                <span className="absolute inset-y-[-3px] w-px bg-line-strong" style={{ left: `${zero}%` }} aria-hidden />
                {r.unavailable ? (
                  <span className="absolute inset-y-[7px] border-t border-dotted border-faint" style={{ left: `${Math.max(0, zero - 6)}%`, width: "12%" }} aria-hidden />
                ) : (
                  <span className={cn("absolute inset-y-0 rounded-[2px]", color)} style={{ left: `${left}%`, width: `${width}%` }} aria-hidden />
                )}
              </span>
              <span className={cn("figure text-right", r.unavailable ? "text-faint" : isNet ? (r.value >= 0 ? "font-medium text-pos" : "font-medium text-neg") : r.kind === "cost" ? "text-ink-2" : "text-ink")}>
                {r.unavailable ? "n/a" : fmtMusd(r.value, Math.abs(r.value) < 1 && r.value !== 0 ? 3 : 2, r.kind === "gain" || r.kind === "cost" || r.kind === "net")}
              </span>
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-faint">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-[1px] border border-dashed border-muted" aria-hidden />Advertised rate at face value</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-[1px] bg-pos" aria-hidden />Earned</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-[1px] bg-neg" aria-hidden />Cost</span>
        <span>Values in {unit}</span>
      </figcaption>
    </figure>
  );
}

/** One bar per strategy, coloured by sign (green keeps, red loses). Labels sit in their own column. */
export function ComparisonBars({ rows, format }: { rows: { id: string; name: string; value: number | null; index?: number }[]; format: "musd-signed" | "musd" | "pct" }) {
  const vals = rows.map((r) => r.value).filter((v): v is number => v !== null);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;
  const zero = pct(0);
  const fmt = (v: number) => (format === "pct" ? fmtPct(v, 2, true) : format === "musd-signed" ? fmtMusd(v, 0, true) : fmtMusd(v, 0));
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const v = r.value;
        const left = v === null ? zero : pct(Math.min(0, v));
        const width = v === null ? 0 : Math.max(0.8, Math.abs(pct(v) - zero));
        return (
          <li key={r.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="min-w-0 truncate text-ink-2">
                {r.index !== undefined ? <span className="figure mr-1.5 text-faint">{r.index + 1}</span> : null}
                {r.name}
              </span>
              <span className={cn("figure shrink-0", v === null ? "text-faint" : v >= 0 ? "text-pos" : "text-neg")}>{v === null ? "Unavailable" : fmt(v)}</span>
            </div>
            <div className="relative h-2.5 rounded-[2px] bg-sunk">
              {lo < 0 ? <span className="absolute inset-y-[-3px] w-px bg-line-strong" style={{ left: `${zero}%` }} aria-hidden /> : null}
              {v !== null ? <span className={cn("absolute inset-y-0 rounded-[2px]", v >= 0 ? "bg-pos" : "bg-neg")} style={{ left: `${left}%`, width: `${width}%` }} aria-hidden /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  dash?: string;
  width?: number;
}

/** The standard yield series, styled by role rather than by hue. */
export const YIELD_SERIES: LineSeries[] = [
  { key: "advertised", label: "Advertised", color: PALETTE.muted, dash: "5 4", width: 1.5 },
  { key: "base", label: "Base", color: PALETTE.ink, width: 1.75 },
  { key: "incentive", label: "Incentive", color: PALETTE.faint, dash: "2 3", width: 1.5 },
  { key: "net", label: "YieldProof est. net", color: PALETTE.pos, width: 2.25 },
];

export function SeriesLegend({ series }: { series: LineSeries[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted" aria-label="Legend">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" x2="18" y1="3" y2="3" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} />
          </svg>
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Time series with crosshair tooltip. Values are fractions (rates) or USD depending on `unit`. */
export function TimeLines({ data, series, unit, height = 300 }: { data: Record<string, number | string | null>[]; series: LineSeries[]; unit: "rate" | "usd"; height?: number }) {
  const fmt = (v: number) => (unit === "rate" ? fmtPct(v, 2) : `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v)}`);
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="t" {...AXIS} minTickGap={36} tickFormatter={(v: string) => v.slice(5, 10)} />
          <YAxis {...AXIS} width={58} tickFormatter={fmt} domain={["auto", "auto"]} />
          <Tooltip
            cursor={{ stroke: PALETTE.lineStrong }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <TipBox
                  title={String(label).slice(0, 10)}
                  rows={series.map((s) => {
                    const v = payload.find((p) => p.dataKey === s.key)?.value;
                    return {
                      label: s.label,
                      value: typeof v === "number" ? fmt(v) : "No observation",
                      swatch: (
                        <svg width="14" height="6" aria-hidden>
                          <line x1="0" x2="14" y1="3" y2="3" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} />
                        </svg>
                      ),
                    };
                  })}
                />
              );
            }}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={s.width ?? 2}
              strokeDasharray={s.dash}
              dot={data.length < 20 ? { r: 3, strokeWidth: 0, fill: s.color } : false}
              activeDot={{ r: 4, stroke: PALETTE.surface, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Exit size → total slippage (single series; the title names it, so no legend). */
export function SlippageCurve({ points, height = 220 }: { points: { size: number; slippage: number | null }[]; height?: number }) {
  const data = points.map((p) => ({ size: p.size, s: p.slippage }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="size" {...AXIS} tickFormatter={(v: number) => Intl.NumberFormat("en-US", { notation: "compact" }).format(v)} />
          <YAxis {...AXIS} width={52} tickFormatter={(v: number) => fmtPct(v, 1)} />
          <Tooltip
            cursor={{ stroke: PALETTE.lineStrong }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return <TipBox title={`Exit ${p.size.toLocaleString("en-US")} MUSD`} rows={[{ label: "Total slippage incl. fee", value: p.s === null ? "Cannot exit" : fmtPct(p.s, 2) }]} />;
            }}
          />
          <Line type="monotone" dataKey="s" stroke={PALETTE.neg} strokeWidth={2} dot={{ r: 3.5, strokeWidth: 0, fill: PALETTE.neg }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
