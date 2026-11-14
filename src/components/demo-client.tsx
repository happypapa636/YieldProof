"use client";

import { Download, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { fmtMusd, fmtNum, fmtPct } from "@/lib/format";
import { encodeComparison } from "@/lib/model/comparison";
import { Assumptions, DEFAULT_ASSUMPTIONS, projectOpportunity } from "@/lib/model/projection";
import type { Opportunity } from "@/lib/model/types";
import { Waterfall } from "./charts";
import { NumInput, waterfallSteps } from "./projection";
import { btnCls, Button, Callout, cn, Field, H2, Panel, RiskBadge, Select } from "./ui";

const START: Assumptions = { ...DEFAULT_ASSUMPTIONS, incentivePriceFactor: 1, borrowAprOverride: 0.095, txCostOverride: null };

export function DemoClient({ strategies }: { strategies: Opportunity[] }) {
  const [a, setA] = useState<Assumptions>(START);
  const [txScale, setTxScale] = useState(1);
  const set = <K extends keyof Assumptions>(k: K, v: Assumptions[K]) => setA((s) => ({ ...s, [k]: v }));
  const ctx = useMemo(() => ({ pools: {}, btcPrice: null }), []);

  const results = strategies.map((o, i) => {
    // Scale each fictional strategy's own gas assumptions by the fee knob.
    const scaled: Opportunity = {
      ...o,
      economics: {
        ...o.economics,
        entryCostMusd: { ...o.economics.entryCostMusd, value: (o.economics.entryCostMusd.value ?? 0) * txScale },
        exitCostMusd: { ...o.economics.exitCostMusd, value: (o.economics.exitCostMusd.value ?? 0) * txScale },
        reinvestCostMusd: { ...o.economics.reinvestCostMusd, value: (o.economics.reinvestCostMusd.value ?? 0) * txScale },
      },
    };
    const p = projectOpportunity(scaled, a, ctx);
    return { o: scaled, p, i };
  });
  const byAdv = [...results].sort((x, y) => (y.o.advertised.value ?? 0) - (x.o.advertised.value ?? 0));
  const byNet = [...results].sort((x, y) => (y.p.netProfit?.toNumber() ?? -Infinity) - (x.p.netProfit?.toNumber() ?? -Infinity));
  const topAdv = byAdv[0]!;
  const topNet = byNet[0]!;
  const advRankOfTopNet = byAdv.findIndex((r) => r.o.id === topNet.o.id) + 1;
  const maxPct = Math.max(...results.map((r) => Math.max(r.o.advertised.value ?? 0, Math.abs(r.p.annualized?.toNumber() ?? 0))), 0.01);
  const changed = JSON.stringify(a) !== JSON.stringify(START) || txScale !== 1;

  return (
    <div className="space-y-6">
      <Callout tone="demo" title="Fictional demo data">
        Harbor, Comet, Aurora and LeverLoop do not exist. Their rates, tokens and fees are invented to show how the engine works. Nothing on this page is a real Mezo opportunity or a real market return. Live data lives on the <a className="text-pos underline-offset-2 hover:underline" href="/dashboard">dashboard</a>.
      </Callout>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Panel className="xl:sticky xl:top-20 xl:self-start">
          <H2 sub="Every change recalculates all four strategies." right={changed ? <Button size="sm" variant="ghost" onClick={() => { setA(START); setTxScale(1); }}><RotateCcw size={13} aria-hidden /> Reset</Button> : undefined}>
            Assumptions
          </H2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Field label="Initial investment" htmlFor="d-cap">
              <NumInput id="d-cap" value={a.capital} min={1} max={1e8} onChange={(v) => v !== null && set("capital", v)} suffix="MUSD" />
            </Field>
            <Field label={<>Duration <span className="figure text-ink">{a.days} days</span></>} htmlFor="d-days">
              <input id="d-days" type="range" min={7} max={730} step={1} value={a.days} onChange={(e) => set("days", Number(e.target.value))} className="h-9" />
            </Field>
            <Field label={<>Incentive token price <span className="figure text-ink">{Math.round((a.incentivePriceFactor ?? 1) * 100)}%</span> of today</>} htmlFor="d-inc">
              <input id="d-inc" type="range" min={0} max={1.5} step={0.05} value={a.incentivePriceFactor ?? 1} onChange={(e) => set("incentivePriceFactor", Number(e.target.value))} className="h-9" />
            </Field>
            <Field label={<>Borrowing cost <span className="figure text-ink">{fmtPct(a.borrowAprOverride ?? 0, 1)}</span> APR</>} htmlFor="d-borrow" hint="Applies to the leveraged strategy.">
              <input id="d-borrow" type="range" min={0} max={0.2} step={0.005} value={a.borrowAprOverride ?? 0.095} onChange={(e) => set("borrowAprOverride", Number(e.target.value))} className="h-9" />
            </Field>
            <Field label={<>Transaction fees <span className="figure text-ink">×{fmtNum(txScale, 1)}</span></>} htmlFor="d-tx" hint="Scales every strategy's gas assumptions.">
              <input id="d-tx" type="range" min={0} max={10} step={0.5} value={txScale} onChange={(e) => setTxScale(Number(e.target.value))} className="h-9" />
            </Field>
            <Field label={<>Yield rate change <span className="figure text-ink">{a.rateChangePct > 0 ? "+" : ""}{Math.round(a.rateChangePct * 100)}%</span></>} htmlFor="d-rate">
              <input id="d-rate" type="range" min={-0.75} max={0.5} step={0.05} value={a.rateChangePct} onChange={(e) => set("rateChangePct", Number(e.target.value))} className="h-9" />
            </Field>
            <Field label="Liquidity when exiting" htmlFor="d-exit">
              <Select id="d-exit" value={String(a.exitStress)} onChange={(v) => set("exitStress", Number(v))} options={[{ value: "1", label: "Normal" }, { value: "3", label: "Stressed (×3 slippage)" }, { value: "8", label: "Crisis (×8 slippage)" }]} />
            </Field>
            <Field label={<>LP price move <span className="figure text-ink">±{Math.round(a.lpPriceMovePct * 100)}%</span></>} htmlFor="d-lpm" hint="Drives Aurora's impermanent loss.">
              <input id="d-lpm" type="range" min={0} max={1} step={0.05} value={a.lpPriceMovePct} onChange={(e) => set("lpPriceMovePct", Number(e.target.value))} className="h-9" />
            </Field>
          </div>
        </Panel>

        <div className="min-w-0 space-y-6">
          <Panel>
            <H2 sub="Dashed outline: the headline rate. Solid bar: YieldProof's annualised estimate after costs.">Advertised versus estimated net</H2>
            <div aria-live="polite" className="mb-6 border-l-2 border-pos py-1 pl-4">
              {topAdv.o.id !== topNet.o.id ? (
                <p className="max-w-[72ch] text-[15.5px] leading-relaxed text-ink">
                  <span className="font-medium">{topAdv.o.name}</span> advertises the most ({fmtPct(topAdv.o.advertised.value)}) but nets an estimated {fmtPct(topAdv.p.annualized?.toNumber() ?? null, 2, true)} a year. <span className="font-medium">{topNet.o.name}</span>, only #{advRankOfTopNet} by headline, keeps the most: {fmtMusd(topNet.p.netProfit?.toNumber() ?? null, 2, true)} MUSD over {a.days} days.
                </p>
              ) : (
                <p className="max-w-[72ch] text-[15.5px] leading-relaxed text-ink">With these assumptions the highest headline, {topAdv.o.name}, also nets the most. Move the incentive price, borrowing cost or exit liquidity to see how fragile that ranking is.</p>
              )}
            </div>
            <ul className="space-y-5">
              {byAdv.map((r) => {
                const adv = r.o.advertised.value ?? 0;
                const net = r.p.annualized?.toNumber() ?? 0;
                return (
                  <li key={r.o.id}>
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                      <span className="text-ink">{r.o.name}</span>
                      <span className="figure text-[12.5px] text-muted">
                        {fmtPct(adv)} <span aria-hidden>→</span> <span className={net >= 0 ? "text-pos" : "text-neg"}>{fmtPct(net, 2, true)}</span>
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="h-2.5 rounded-[2px] border border-dashed border-muted" style={{ width: `${Math.max(1, (adv / maxPct) * 100)}%` }} aria-hidden />
                      <div className={cn("h-2.5 rounded-[2px]", net >= 0 ? "bg-pos" : "bg-neg")} style={{ width: `${Math.max(1, (Math.abs(net) / maxPct) * 100)}%` }} aria-hidden />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <div className="grid gap-6 2xl:grid-cols-2">
            {results.map((r) => (
              <Panel key={r.o.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-[19px]">{r.o.name}</h3>
                  <RiskBadge category={r.o.risk.category} compact />
                </div>
                <p className="mb-4 text-[13px] leading-relaxed text-muted">{r.o.summary}</p>
                <Waterfall steps={waterfallSteps(r.o, r.p)} />
                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-[12.5px]">
                  <div><dt className="text-muted">Net</dt><dd className={cn("figure", (r.p.netProfit?.toNumber() ?? 0) >= 0 ? "text-pos" : "text-neg")}>{fmtMusd(r.p.netProfit?.toNumber() ?? null, 2, true)}</dd></div>
                  <div><dt className="text-muted">Costs</dt><dd className="figure">{fmtMusd(r.p.totalCosts.toNumber())}</dd></div>
                  <div><dt className="text-muted">{r.p.genericLeverage ? "Health factor" : "Ending value"}</dt><dd className={cn("figure", r.p.genericLeverage && (r.p.genericLeverage.healthFactor?.toNumber() ?? 9) < 1.3 ? "text-neg" : "")}>{r.p.genericLeverage ? fmtNum(r.p.genericLeverage.healthFactor?.toNumber() ?? null, 2) : fmtMusd(r.p.endingValue?.toNumber() ?? null)}</dd></div>
                </dl>
                {r.p.genericLeverage ? <p className="mt-3 text-[12px] text-ink-2">Liquidated if the looped collateral loses {fmtPct(r.p.genericLeverage.distanceToLiquidation?.toNumber() ?? null, 1)} of its value; leverage amplifies losses as much as gains.</p> : null}
              </Panel>
            ))}
          </div>

          <a href={`/api/export/csv?demo=1&${encodeComparison({ ids: strategies.map((s) => s.id), assumptions: a })}`} className={btnCls("secondary", "md")} download>
            <Download size={14} aria-hidden /> Export this demo as CSV (rows labeled fictional)
          </a>
        </div>
      </div>
    </div>
  );
}
