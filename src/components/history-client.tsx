"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { coverage, filterRange, HISTORY_RANGES, HistoryRangeId, rangeAvailable } from "@/lib/engine/history";
import type { HistoryPoint } from "@/lib/data/history";
import { fmtPct } from "@/lib/format";
import { SeriesLegend, TimeLines, YIELD_SERIES } from "./charts";
import { PALETTE } from "@/lib/palette";
import { Chip, Select } from "./ui";

export function HistoryClient({ options, selected, points, now }: { options: { id: string; name: string }[]; selected: string; points: HistoryPoint[]; now: string }) {
  const router = useRouter();
  const nowD = new Date(now);
  const [range, setRange] = useState<HistoryRangeId>(rangeAvailable(points, 90, nowD) ? "90d" : "30d");
  const days = HISTORY_RANGES.find((r) => r.id === range)!.days;
  const inRange = filterRange(points, days, nowD);
  const cov = coverage(points, days, nowD);
  const hasTvl = inRange.some((p) => p.tvl !== null);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm">
          <Select ariaLabel="Strategy" value={selected} onChange={(v) => router.push(`/history?id=${v}`)} options={options.map((o) => ({ value: o.id, label: o.name }))} />
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Time range">
          {HISTORY_RANGES.map((r) => {
            const ok = rangeAvailable(points, r.days, nowD);
            return (
              <Chip key={r.id} on={range === r.id} disabled={!ok} onClick={() => setRange(r.id)} title={ok ? undefined : "Not enough real history for this range"} className="h-9">
                {r.label}
              </Chip>
            );
          })}
        </div>
      </div>
      <dl className="panel-sunk flex flex-wrap gap-x-8 gap-y-2 px-4 py-3 text-[12.5px]">
        <div><dt className="inline text-muted">Samples: </dt><dd className="figure inline text-ink">{cov.samples}</dd></div>
        <div><dt className="inline text-muted">Days covered: </dt><dd className="figure inline text-ink">{cov.distinctDays} / {cov.expectedDays} ({fmtPct(cov.coveragePct, 0)})</dd></div>
        <div><dt className="inline text-muted">Longest gap: </dt><dd className="figure inline text-ink">{cov.longestGapDays} days</dd></div>
        <div><dt className="inline text-muted">First / last: </dt><dd className="figure inline text-ink">{cov.first?.slice(0, 10) ?? "none"} / {cov.last?.slice(0, 10) ?? "none"}</dd></div>
      </dl>
      {inRange.length >= 2 ? (
        <>
          <div>
            <p className="mb-1 text-[12.5px] text-ink-2">Yield rates</p>
            <TimeLines data={inRange} unit="rate" series={YIELD_SERIES} />
            <SeriesLegend series={YIELD_SERIES.map((x) => (x.key === "net" ? { ...x, label: "YieldProof est. net (own snapshots)" } : x))} />
          </div>
          {hasTvl ? (
            <div>
              <p className="mb-1 text-[12.5px] text-ink-2">Liquidity (TVL, USD)</p>
              <TimeLines data={inRange} unit="usd" height={200} series={[{ key: "tvl", label: "TVL", color: PALETTE.ink2 }]} />
            </div>
          ) : null}
          <details>
            <summary className="cursor-pointer text-[13px] text-ink-2">Table view ({inRange.length} rows)</summary>
            <div className="mt-2 max-h-72 overflow-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="text-left text-faint"><th className="py-1 font-normal">Day</th><th className="font-normal">Advertised</th><th className="font-normal">Base</th><th className="font-normal">Incentive</th><th className="font-normal">Est. net</th><th className="font-normal">TVL</th></tr></thead>
                <tbody>{inRange.map((p) => <tr key={p.t} className="figure border-t border-line"><td className="py-1">{p.t.slice(0, 10)}</td><td>{p.advertised === null ? "–" : fmtPct(p.advertised)}</td><td>{p.base === null ? "–" : fmtPct(p.base)}</td><td>{p.incentive === null ? "–" : fmtPct(p.incentive)}</td><td>{p.net === null ? "–" : fmtPct(p.net)}</td><td>{p.tvl === null ? "–" : Math.round(p.tvl).toLocaleString("en-US")}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="rounded-[10px] border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-muted">
          {inRange.length === 1 ? "Only one real observation exists in this window, so there is no line to draw." : "No real observations in this window."} YieldProof does not fabricate or interpolate history. Its daily snapshots will fill this chart over time.
        </p>
      )}
    </div>
  );
}
