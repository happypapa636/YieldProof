import { ExternalLink } from "lucide-react";
import type { RiskLevel } from "@/lib/engine/risk";
import type { Opportunity } from "@/lib/model/types";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { RiskBadge } from "./ui";

const LEVEL_STEPS: Record<RiskLevel, number> = { lower: 1, moderate: 2, elevated: 3, high: 4, unknown: 0, "n/a": -1 };

/** Component risk level as a small meter + word. Only "high" uses red; unknown is never scored. */
export function LevelText({ level }: { level: RiskLevel }) {
  const steps = LEVEL_STEPS[level];
  if (steps < 0) return <span className="text-[12.5px] text-faint">n/a</span>;
  const fill = steps === 4 ? "bg-neg" : steps === 1 ? "bg-pos" : "bg-ink-2";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px]", steps === 4 ? "text-neg" : steps === 0 ? "italic text-faint" : steps === 1 ? "text-pos" : "text-ink-2")}>
      <span className="inline-flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("w-[3px] rounded-[1px]", i < steps ? fill : "bg-line-strong", ["h-[5px]", "h-[7px]", "h-[9px]", "h-[11px]"][i])} />
        ))}
      </span>
      {level === "unknown" ? "insufficient data" : level}
    </span>
  );
}

export function RiskProfile({ opp }: { opp: Opportunity }) {
  const r = opp.risk;
  const links = [...opp.riskEvidence.audits.links];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <RiskBadge category={r.category} />
        <span className="text-[12px] text-faint">Assessed {fmtDateTime(r.assessedAt)}. A product assessment, not a rating; nothing here means safe.</span>
      </div>
      <ul className="divide-y divide-line border-y border-line text-[13px]">
        {r.components.map((c) => (
          <li key={c.id} className="grid gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_150px]">
            <div className="min-w-0">
              <p className="text-ink-2">
                {c.label}
                {c.core ? <span className="ml-1.5 text-[11px] text-faint">core</span> : null}
              </p>
              <p className="text-[12px] leading-snug text-muted">{c.rationale}</p>
            </div>
            <div className="sm:text-right">
              <LevelText level={c.level} />
            </div>
          </li>
        ))}
      </ul>
      {r.missing.length ? <p className="text-[12.5px] text-muted">Missing information: {r.missing.join(", ")}.</p> : null}
      {links.length ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
          {links.map((l) => (
            <li key={l.label}>
              <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-pos hover:underline">
                {l.label}
                <ExternalLink size={11} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-[11.5px] leading-relaxed text-faint">Rule: {r.rule}</p>
    </div>
  );
}
