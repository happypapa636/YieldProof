import type { Discrepancy } from "@/lib/model/types";
import { fmtDateTime, fmtNum, fmtPct } from "@/lib/format";
import { cn } from "@/lib/cn";

function fmtValue(unit: Discrepancy["unit"], v: number) {
  if (unit === "rate") return fmtPct(v, 2);
  if (unit === "usd") return `$${fmtNum(v, 0)}`;
  return v >= 1000 ? fmtNum(v, 2) : fmtNum(v, 4);
}

export function DiscrepancyCard({ d }: { d: Discrepancy }) {
  return (
    <div className="panel-sunk p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-ink">{d.label}</p>
        <span className={cn("rounded-full border px-2 py-0.5 text-[11.5px]", d.flagged ? "border-ink-2/60 text-ink" : d.status === "agree" ? "border-pos/40 text-pos" : "border-line-strong text-muted")}>
          {d.status === "agree" ? "Sources agree" : d.status === "disagree" ? "Sources disagree" : d.status === "single_source" ? "Single source" : "No data"}
          {d.maxRelativeDiff !== null ? ` (max ${fmtPct(d.maxRelativeDiff, 2)} apart)` : ""}
        </span>
      </div>
      <table className="mt-3 w-full text-[13px]">
        <tbody>
          {d.values.map((v) => (
            <tr key={v.sourceId} className="border-t border-line">
              <td className="py-1.5 pr-3 text-ink-2">
                {v.label}
                {v.sourceId === d.primarySourceId ? <span className="ml-2 rounded border border-pos/40 px-1 text-[10.5px] text-pos">used</span> : null}
              </td>
              <td className="figure py-1.5 pr-3 text-right text-ink">{fmtValue(d.unit, v.value)}</td>
              <td className="py-1.5 text-right text-[11.5px] text-faint">{v.observedAt ? fmtDateTime(v.observedAt) : ""}</td>
            </tr>
          ))}
          {d.missing.map((m) => (
            <tr key={m} className="border-t border-line">
              <td className="py-1.5 text-ink-2">{m}</td>
              <td className="py-1.5 text-right text-[12.5px] italic text-faint" colSpan={2}>Unavailable</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">{d.explanation}</p>
    </div>
  );
}
