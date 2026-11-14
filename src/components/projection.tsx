"use client";

import { useEffect, useState } from "react";
import type { Assumptions, Projection } from "@/lib/model/projection";
import { DEFAULT_ASSUMPTIONS } from "@/lib/model/projection";
import { assumptionsSchema } from "@/lib/model/comparison";
import type { Opportunity } from "@/lib/model/types";
import { fmtMusd, fmtPct } from "@/lib/format";
import { Waterfall } from "./charts";
import { verdictFor, waterfallSteps } from "@/lib/model/explain";

export { verdictFor, waterfallSteps };
import { Callout, Chip, cn, Field, inputCls, Select, signTone, Stat, Tip } from "./ui";

const LS_KEY = "yp-assumptions-v1";

export function loadStoredAssumptions(): Assumptions {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_ASSUMPTIONS;
    const p = assumptionsSchema.safeParse({ ...DEFAULT_ASSUMPTIONS, ...JSON.parse(raw) });
    return p.success ? p.data : DEFAULT_ASSUMPTIONS;
  } catch {
    return DEFAULT_ASSUMPTIONS;
  }
}

export function storeAssumptions(a: Assumptions) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(a));
  } catch {
    /* storage unavailable: defaults still work */
  }
}

/** User assumptions: defaults ← saved settings (local) ← explicit initial values (e.g. from a share link). */
export function useAssumptions(initial?: Assumptions): [Assumptions, (a: Assumptions) => void] {
  const [a, setA] = useState<Assumptions>(initial ?? DEFAULT_ASSUMPTIONS);
  useEffect(() => {
    // Hydrate saved defaults from browser storage after mount (not available during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initial) setA(loadStoredAssumptions());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [a, setA];
}

export function NumInput({ id, value, onChange, min, max, step, suffix, ariaLabel }: { id: string; value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; suffix?: string; ariaLabel?: string }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // Adjust state while rendering when the controlled value changes from outside.
    setSeen(value);
    if (Number(text) !== value) setText(value === null ? "" : String(value));
  }
  const invalid = text !== "" && (!Number.isFinite(Number(text)) || (min !== undefined && Number(text) < min) || (max !== undefined && Number(text) > max));
  return (
    <div className="relative">
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="decimal"
        className={cn(inputCls, "figure", suffix ? "pr-14" : "pr-2")}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim() === "") return onChange(null);
          const v = Number(e.target.value);
          if (Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max)) onChange(v);
        }}
        aria-invalid={invalid}
        step={step}
      />
      {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-faint">{suffix}</span> : null}
    </div>
  );
}

export function AssumptionsPanel({
  a,
  onChange,
  show = {},
  compact,
}: {
  a: Assumptions;
  onChange: (a: Assumptions) => void;
  show?: { borrow?: boolean; lp?: boolean; startFrom?: boolean; incentives?: boolean };
  compact?: boolean;
}) {
  const set = <K extends keyof Assumptions>(k: K, v: Assumptions[K]) => onChange({ ...a, [k]: v });
  return (
    <div className={cn("grid gap-x-5 gap-y-4", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
      <Field label="Initial investment" htmlFor="as-capital" hint="Valued in MUSD (≈ USD).">
        <NumInput id="as-capital" value={a.capital} min={1} max={100_000_000} onChange={(v) => v !== null && set("capital", v)} suffix="MUSD" />
      </Field>
      <Field label="Horizon" htmlFor="as-days">
        <div className="flex gap-1.5">
          {[30, 90, 180, 365].map((d) => (
            <Chip key={d} on={a.days === d} onClick={() => set("days", d)} className="h-9 flex-1 justify-center px-0">
              {d === 365 ? "1y" : `${d}d`}
            </Chip>
          ))}
          <div className="w-[72px] shrink-0">
            <NumInput id="as-days" ariaLabel="Horizon in days" value={a.days} min={1} max={3650} onChange={(v) => v !== null && Number.isInteger(v) && set("days", v)} />
          </div>
        </div>
      </Field>
      <Field label="Compounding" htmlFor="as-comp" hint="Applied only where the strategy can realistically reinvest.">
        <Select id="as-comp" value={a.compounding} onChange={(v) => set("compounding", v as Assumptions["compounding"])} options={[{ value: "none", label: "None (simple)" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />
      </Field>
      {show.incentives !== false ? (
        <Field label="Incentive token price" htmlFor="as-inc" hint="Hypothetical sensitivity, not a forecast.">
          <Select id="as-inc" value={a.incentiveScenario} onChange={(v) => onChange({ ...a, incentiveScenario: v as Assumptions["incentiveScenario"], incentivePriceFactor: null })} options={[{ value: "current", label: "Current reference price" }, { value: "minus25", label: "25% lower" }, { value: "minus50", label: "50% lower" }, { value: "zero", label: "Worth nothing" }]} />
        </Field>
      ) : null}
      <Field label={<>Base-rate change <span className="figure text-ink">{a.rateChangePct > 0 ? "+" : ""}{Math.round(a.rateChangePct * 100)}%</span></>} htmlFor="as-rate" hint="Scenario applied for the whole horizon.">
        <input id="as-rate" type="range" min={-0.75} max={0.5} step={0.05} value={a.rateChangePct} onChange={(e) => set("rateChangePct", Number(e.target.value))} className="h-9" />
      </Field>
      <Field label="Exit liquidity" htmlFor="as-stress" hint="Multiplies modeled exit slippage.">
        <Select id="as-stress" value={String(a.exitStress)} onChange={(v) => set("exitStress", Number(v))} options={[{ value: "1", label: "As today" }, { value: "3", label: "Stressed (×3 slippage)" }, { value: "8", label: "Crisis (×8 slippage)" }]} />
      </Field>
      {show.startFrom ? (
        <Field label="Starting asset" htmlFor="as-from" hint="Starting in MUSD adds a real on-chain swap quote.">
          <Select id="as-from" value={a.startFrom} onChange={(v) => set("startFrom", v as Assumptions["startFrom"])} options={[{ value: "deposit-asset", label: "I already hold the deposit asset" }, { value: "musd", label: "I start from MUSD" }]} />
        </Field>
      ) : null}
      <Field label="Gas per transaction" htmlFor="as-tx" hint="Leave empty to use the live Mezo gas price.">
        <NumInput id="as-tx" value={a.txCostOverride} min={0} max={10_000} onChange={(v) => set("txCostOverride", v)} suffix="MUSD" />
      </Field>
      {show.lp ? (
        <Field label={<>LP price move <span className="figure text-ink">±{Math.round(a.lpPriceMovePct * 100)}%</span></>} htmlFor="as-lpm" hint="Drives modeled impermanent loss.">
          <input id="as-lpm" type="range" min={0} max={1} step={0.05} value={a.lpPriceMovePct} onChange={(e) => set("lpPriceMovePct", Number(e.target.value))} className="h-9" />
        </Field>
      ) : null}
      {show.borrow ? (
        <>
          <Field label="Borrow APR override" htmlFor="as-bapr" hint="Empty = live on-chain rate.">
            <NumInput id="as-bapr" value={a.borrowAprOverride === null ? null : Math.round(a.borrowAprOverride * 10000) / 100} min={0} max={200} onChange={(v) => set("borrowAprOverride", v === null ? null : v / 100)} suffix="%" />
          </Field>
          <Field label={<>Borrowed vs collateral <span className="figure text-ink">{a.leverageLtv === null ? "default" : `${Math.round(a.leverageLtv * 100)}%`}</span></>} htmlFor="as-ltv">
            <input id="as-ltv" type="range" min={0.05} max={0.9} step={0.05} value={a.leverageLtv ?? 0.3} onChange={(e) => set("leverageLtv", Number(e.target.value))} className="h-9" />
          </Field>
        </>
      ) : null}
    </div>
  );
}

export function Verdict({ opp, p }: { opp: Opportunity; p: Projection }) {
  const v = verdictFor(opp, p);
  return (
    <div className={cn("border-l-2 py-1 pl-4", v.tone === "pos" ? "border-pos" : v.tone === "neg" ? "border-neg" : "border-line-strong")} aria-live="polite">
      <p className="text-[15.5px] leading-relaxed text-ink">{v.headline}</p>
      {v.detail ? <p className="mt-1 text-[13px] leading-relaxed text-muted">{v.detail}</p> : null}
    </div>
  );
}

export function ProjectionView({ opp, p, showLedger = true }: { opp: Opportunity; p: Projection; showLedger?: boolean }) {
  const net = p.netProfit?.toNumber() ?? null;
  const tone = signTone(net);
  const negative = net !== null && net < 0;
  return (
    <div className="space-y-6">
      <Verdict opp={opp} p={p} />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat size="sm" label="Gross earnings" value={fmtMusd(p.grossEarnings?.toNumber() ?? null)} tone={p.grossEarnings === null ? "muted" : undefined} />
        <Stat size="sm" label="Estimated costs" value={fmtMusd(p.totalCosts.toNumber())} />
        <Stat size="sm" label="Net profit / loss" value={fmtMusd(net, 2, true)} tone={tone} />
        <Stat size="sm" label="Ending value" value={fmtMusd(p.endingValue?.toNumber() ?? null)} />
        <Stat size="sm" label={`Net return (${p.days}d)`} value={fmtPct(p.netReturn?.toNumber() ?? null, 2, true)} tone={tone} />
        <Tip content="Net return × 365 / days. An estimate from the assumptions below, not an APY.">
          <div tabIndex={0}>
            <Stat size="sm" label="Annualised (simple)" value={fmtPct(p.annualized?.toNumber() ?? null, 2, true)} tone={tone} />
          </div>
        </Tip>
      </dl>
      {p.status === "insufficient_data" ? (
        <Callout tone="warn" title="Not enough verified data to estimate a return">
          {p.warnings[0]?.message ?? "No verified rate is available."} YieldProof does not substitute a guessed rate.
        </Callout>
      ) : (
        <div className="panel-sunk p-4">
          <p className="mb-3 text-[12.5px] text-ink-2">From advertised to estimated net, MUSD over {p.days} days</p>
          <Waterfall steps={waterfallSteps(opp, p)} />
        </div>
      )}
      {negative ? (
        <Callout tone="neg" title="Projected loss under these assumptions">
          Costs exceed earnings over {p.days} days. It is shown as a loss rather than hidden; try a longer horizon or a different position size to see how fixed costs amortise.
        </Callout>
      ) : null}
      {p.status === "partial" ? (
        <Callout tone="warn" title="Partial estimate">
          Some components are unavailable and are excluded, not counted as zero: {[p.baseEarnings === null && "base yield", p.incentiveEarnings === null && "incentives", ...p.notes.filter((n) => /excluded|not assumed/.test(n))].filter(Boolean).join("; ")}.
        </Callout>
      ) : null}
      {p.warnings.filter((w) => !["negative_net_return", "costs_exceed_yield", "base_rate_unavailable", "incentive_rate_unavailable"].includes(w.code)).map((w) => (
        <Callout key={w.code + w.message} tone="info">{w.message}</Callout>
      ))}
      {p.notes.filter((n) => !/excluded|not assumed/.test(n)).length ? (
        <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-muted">
          {p.notes.filter((n) => !/excluded|not assumed/.test(n)).map((n) => <li key={n}>{n}</li>)}
        </ul>
      ) : null}
      {showLedger ? <Ledger p={p} /> : null}
    </div>
  );
}

export function Ledger({ p }: { p: Projection }) {
  return (
    <details className="panel-sunk group" open>
      <summary className="cursor-pointer select-none px-4 py-3 text-[13px] font-medium text-ink-2 hover:text-ink">
        Assumption ledger <span className="font-normal text-faint">({p.ledger.length} inputs; every number above is reproducible from these)</span>
      </summary>
      <div className="overflow-x-auto px-4 pb-3">
        <table className="w-full min-w-[560px] text-[12.5px]">
          <thead>
            <tr className="text-left text-faint">
              <th className="py-1.5 pr-4 font-normal">Input</th>
              <th className="py-1.5 pr-4 font-normal">Value used</th>
              <th className="py-1.5 pr-4 font-normal">Source</th>
              <th className="py-1.5 font-normal">Note</th>
            </tr>
          </thead>
          <tbody>
            {p.ledger.map((l) => (
              <tr key={l.label} className="border-t border-line align-top">
                <td className="py-1.5 pr-4 text-ink-2">{l.label}</td>
                <td className="figure py-1.5 pr-4 text-ink">{l.value}</td>
                <td className="py-1.5 pr-4 text-muted">{l.source}</td>
                <td className="py-1.5 text-faint">{l.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
