"use client";

import { Bell, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { analyzeMusdLeverage, musdStressTests } from "@/lib/engine/leverage";
import { lpExitToSingle, poolValueIn, quoteSwap, reserveBalance, spotPrice } from "@/lib/engine/liquidity";
import { INCENTIVE_PRICE_SCENARIOS, RATE_CHANGE_SCENARIOS } from "@/lib/engine/scenarios";
import { toSimpleApr } from "@/lib/engine/rates";
import { fmtDateTime, fmtMusd, fmtNum, fmtPct, fmtUsdCompact } from "@/lib/format";
import { ALERT_KINDS, ALERT_LABEL, ALERT_NEEDS_THRESHOLD, AlertKind } from "@/lib/model/alerts";
import { encodeComparison } from "@/lib/model/comparison";
import { Assumptions, projectOpportunity } from "@/lib/model/projection";
import { buildContext, SerializedPool, toPoolState } from "@/lib/model/pools";
import type { Opportunity } from "@/lib/model/types";
import { SlippageCurve } from "./charts";
import { AssumptionsPanel, NumInput, ProjectionView, useAssumptions } from "./projection";
import { useSession } from "./providers";
import { Button, Callout, cn, Field, H2, inputCls, Panel, Select, Stat } from "./ui";

export function Calculator({ opp, pools, btcPrice }: { opp: Opportunity; pools: Record<string, SerializedPool>; btcPrice: number | null }) {
  const [a, setA] = useAssumptions();
  const ctx = useMemo(() => buildContext(pools, btcPrice), [pools, btcPrice]);
  const run = (x: Assumptions) => {
    try {
      return projectOpportunity(opp, x, ctx);
    } catch (e) {
      return e instanceof Error ? e.message : "Invalid input";
    }
  };
  const p = run(a);
  const hasIncentive = (opp.incentive.value ?? 0) > 0;
  return (
    <div className="space-y-6">
      <Panel>
        <H2 sub="Every input is visible below in the assumption ledger. Changing them recalculates instantly.">Estimate your net return</H2>
        <AssumptionsPanel a={a} onChange={setA} show={{ borrow: !!opp.economics.borrow, lp: opp.economics.ilModel === "volatile-cp", startFrom: opp.depositAsset !== "MUSD" && !opp.tags.lp && !opp.tags.leveraged, incentives: hasIncentive }} />
        <div className="mt-6">{typeof p === "string" ? <Callout tone="neg">{p}</Callout> : <ProjectionView opp={opp} p={p} />}</div>
        <div className="mt-4 flex flex-wrap gap-3 text-[12.5px]">
          <Link className="text-pos hover:underline" href={`/compare?${encodeComparison({ ids: [opp.id], assumptions: a })}`}>Compare with other strategies</Link>
        </div>
      </Panel>
      {typeof p !== "string" && p.status !== "insufficient_data" ? (
        <div className={cn("grid gap-6", hasIncentive && "lg:grid-cols-2")}>
          {hasIncentive ? (
            <Panel>
              <H2 sub="What if the incentive token is worth less when you sell it? Hypothetical, not a forecast.">Incentive price sensitivity</H2>
              <ScenarioTable rows={INCENTIVE_PRICE_SCENARIOS.map((s) => ({ label: s.label, p: run({ ...a, incentiveScenario: s.id, incentivePriceFactor: null }) }))} />
            </Panel>
          ) : null}
          <Panel>
            <H2 sub="Variable rates move. These scenarios hold the change for the whole horizon.">Rate-change scenarios</H2>
            <ScenarioTable rows={RATE_CHANGE_SCENARIOS.map((s) => ({ label: s.label, p: run({ ...a, rateChangePct: Number(s.change) }) }))} />
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

function ScenarioTable({ rows }: { rows: { label: string; p: ReturnType<typeof projectOpportunity> | string }[] }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-left text-[12px] text-faint">
          <th className="py-1.5 font-normal">Scenario</th>
          <th className="py-1.5 text-right font-normal">Net result</th>
          <th className="py-1.5 text-right font-normal">Annualised</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, p }) => {
          const net = typeof p === "string" ? null : p.netProfit?.toNumber() ?? null;
          return (
            <tr key={label} className="border-t border-line">
              <td className="py-2 text-ink-2">{label}</td>
              <td className={cn("figure py-2 text-right", net === null ? "text-faint" : net >= 0 ? "text-pos" : "text-neg")}>{fmtMusd(net, 2, true)}</td>
              <td className="figure py-2 text-right text-ink-2">{typeof p === "string" ? "n/a" : fmtPct(p.annualized?.toNumber() ?? null, 2, true)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const SIZES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];

export function ExitAnalysis({ opp, pools }: { opp: Opportunity; pools: Record<string, SerializedPool> }) {
  const route = opp.economics.musdRoute;
  const pool = route ? pools[route.poolId] : undefined;
  const [amount, setAmount] = useState(5000);
  if (opp.economics.lockDays && opp.economics.lockDays > 0 && !pool) {
    return (
      <Callout tone="warn" title={`Locked: up to ${opp.economics.lockDays} days`}>
        {opp.economics.withdrawalNote} Exit value before expiry cannot be estimated because no exit market is verified.
      </Callout>
    );
  }
  if (!pool) {
    return (
      <div className="space-y-2 text-[13px] text-ink-2">
        <p>{opp.economics.withdrawalNote}</p>
        <p className="text-faint">
          No swap is needed to exit into the deposit asset, so exit slippage is zero by construction. Available liquidity: {opp.availableLiquidityUsd.value === null ? "not verified" : fmtUsdCompact(opp.availableLiquidityUsd.value)}. This does not account for contract pauses or extreme market conditions.
        </p>
      </div>
    );
  }
  const state = toPoolState(pool);
  const isLp = opp.tags.lp;
  const musdIsToken0 = pool.token0 === "MUSD";
  const poolValue = poolValueIn(state, musdIsToken0).toNumber();
  const quote = (size: number): number | null => {
    try {
      if (isLp) {
        const share = Math.min(1, size / (poolValue + size));
        return lpExitToSingle(state, share, musdIsToken0).slippagePct?.toNumber() ?? null;
      }
      // Sell the deposit asset for MUSD through the route pool; size converted from MUSD at spot.
      const depIs0 = route!.depositAssetIsToken0;
      const amountIn = size / spotPrice(state, depIs0).toNumber();
      return quoteSwap(state, amountIn, depIs0).totalSlippagePct.toNumber();
    } catch {
      return null;
    }
  };
  const s = quote(amount);
  const balance = reserveBalance(state).toNumber();
  return (
    <div className="space-y-4">
      <div className="max-w-[260px]">
        <Field label="Hypothetical exit amount" htmlFor="exit-amt" hint="MUSD value of the position you exit.">
          <NumInput id="exit-amt" value={amount} min={1} max={1e9} onChange={(v) => v !== null && v > 0 && setAmount(v)} suffix="MUSD" />
        </Field>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Stat size="sm" label="Estimated slippage" value={s === null ? "Cannot exit" : fmtPct(s, 2)} tone={s === null || s > 0.02 ? "neg" : undefined} note={s !== null && s > 0.02 ? "Above 2%: thin liquidity for this size" : undefined} />
        <Stat size="sm" label="Estimated exit value" value={s === null ? "Unavailable" : fmtMusd(amount * (1 - s))} />
        <Stat size="sm" label="Pool depth (MUSD)" value={fmtNum(poolValue, 0)} />
        <Stat size="sm" label={`${pool.token0} share of reserves`} value={fmtPct(balance, 1)} note={balance < 0.4 || balance > 0.6 ? "Imbalanced" : undefined} />
      </dl>
      <div>
        <p className="mb-1 text-[12.5px] text-ink-2">Exit slippage by size through {pool.label} ({isLp ? "burn LP, swap the other leg to MUSD" : `${opp.depositAsset} → MUSD`})</p>
        <SlippageCurve points={SIZES.map((size) => ({ size, slippage: quote(size) }))} />
      </div>
      <p className="text-[11.5px] leading-relaxed text-faint">
        Source: on-chain reserves of <a className="underline" href={`https://explorer.mezo.org/address/${pool.address}`} target="_blank" rel="noreferrer">{pool.label}</a>, fee {Number(pool.feeBps) / 100}% (PoolFactory.getFee), last swap {fmtDateTime(pool.lastSwapAt)}. Quotes use YieldProof&apos;s exact port of Pool.getAmountOut ({state.stable ? "x³y + xy³ stable curve" : "x·y = k"}). They assume current reserves and do not account for other traders, MEV, or reserves moving before you exit.
        {balance < 0.4 || balance > 0.6 ? " Reserves are imbalanced, a sign of temporary price deviation exposure." : ""}
      </p>
    </div>
  );
}

export function LeverageAnalyzer({ opp, btcPrice }: { opp: Opportunity; btcPrice: number | null }) {
  const b = opp.economics.borrow;
  const strategy = opp.base.value !== null ? toSimpleApr({ value: opp.base.value, basis: opp.base.basis }).toNumber() : null;
  const [collateral, setCollateral] = useState(0.5);
  const [borrow, setBorrow] = useState(10_000);
  const [days, setDays] = useState(365);
  const [shock, setShock] = useState(0);
  if (!b || btcPrice === null || strategy === null || [b.apr, b.mcr, b.ccr, b.oneTimeFeePct, b.gasCompensation, b.minNetDebt].some((m) => m.value === null)) {
    return <Callout tone="warn" title="Leverage analysis unavailable">A required on-chain parameter or the strategy yield is missing, so YieldProof will not model this position.</Callout>;
  }
  const params = { mcr: b.mcr.value!, ccr: b.ccr.value!, issuanceFeePct: b.oneTimeFeePct.value!, gasCompensation: b.gasCompensation.value!, minNetDebt: b.minNetDebt.value!, interestApr: b.apr.value! };
  let r: ReturnType<typeof analyzeMusdLeverage> | null = null;
  let err: string | null = null;
  let stress: ReturnType<typeof musdStressTests> = [];
  try {
    const input = { collateralBtc: collateral, btcPrice, borrowMusd: borrow, params, strategyApr: strategy, days, priceShockPct: shock };
    r = analyzeMusdLeverage(input);
    stress = musdStressTests({ ...input, priceShockPct: 0 });
  } catch (e) {
    err = e instanceof Error ? e.message : "Invalid input";
  }
  return (
    <div className="space-y-5">
      <Callout tone="info">YieldProof does not recommend leverage. Borrowing amplifies both gains and losses and adds liquidation and redemption risk. Parameters below are read live from the MUSD contracts; this tool never sends a transaction.</Callout>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="BTC collateral" htmlFor="lev-coll" hint={`≈ ${fmtMusd(collateral * btcPrice, 0)} at the oracle price`}>
          <NumInput id="lev-coll" value={collateral} min={0.0001} max={10_000} onChange={(v) => v !== null && v > 0 && setCollateral(v)} suffix="BTC" />
        </Field>
        <Field label="MUSD borrowed and deposited" htmlFor="lev-borrow" hint={`Minimum net debt ${fmtNum(params.minNetDebt, 0)} MUSD`}>
          <NumInput id="lev-borrow" value={borrow} min={1} max={1e9} onChange={(v) => v !== null && v > 0 && setBorrow(v)} suffix="MUSD" />
        </Field>
        <Field label="Horizon" htmlFor="lev-days">
          <NumInput id="lev-days" value={days} min={1} max={3650} onChange={(v) => v !== null && Number.isInteger(v) && setDays(v)} suffix="days" />
        </Field>
        <Field label={<>BTC price shock <span className="figure text-ink">{shock > 0 ? "+" : ""}{Math.round(shock * 100)}%</span></>} htmlFor="lev-shock">
          <input id="lev-shock" type="range" min={-0.8} max={0.5} step={0.05} value={shock} onChange={(e) => setShock(Number(e.target.value))} className="h-9" />
        </Field>
      </div>
      {err ? <Callout tone="neg">{err}</Callout> : null}
      {r ? (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {([
              ["Collateral ratio (ICR)", fmtPct(r.icr.toNumber(), 1), r.icr.lessThan(params.mcr) ? "neg" : r.icr.lessThan(params.ccr) ? "caution" : ""],
              ["Health factor (ICR ÷ MCR)", fmtNum(r.healthFactor.toNumber(), 2), r.healthFactor.lessThan(1) ? "neg" : r.healthFactor.lessThan(1.36) ? "caution" : ""],
              ["Liquidation price (BTC)", `$${fmtNum(r.liquidationPrice.toNumber(), 0)}`, ""],
              ["Distance to liquidation", fmtPct(r.distanceToLiquidation.toNumber(), 1), r.distanceToLiquidation.lessThan(0.2) ? "caution" : ""],
              ["Leverage (gross ÷ equity)", `${fmtNum(r.leverageRatio.toNumber(), 2)}×`, ""],
              ["Recorded debt", fmtMusd(r.recordedDebt.toNumber()), ""],
              ["Net yield on equity", fmtPct(r.annualizedOnEquity.toNumber(), 2, true), r.netYield.isNegative() ? "neg" : "pos"],
              ["Break-even sMUSD APR", fmtPct(r.breakEvenStrategyApr.toNumber(), 2), ""],
            ] as const).map(([label, value, tone]) => (
              <Stat key={label} size="sm" label={label} value={value} tone={tone === "neg" ? "neg" : tone === "pos" ? "pos" : undefined} note={tone === "caution" ? "Close to the limit" : undefined} />
            ))}
          </dl>
          <p className="text-[12.5px] text-muted">
            Over {days} days: gross yield {fmtMusd(r.grossYield.toNumber())}, interest {fmtMusd(r.borrowInterest.toNumber())} ({fmtPct(params.interestApr)} on {fmtMusd(r.recordedDebt.toNumber(), 0)} incl. 200 MUSD gas deposit), issuance fee {fmtMusd(r.issuanceFee.toNumber())}, net {fmtMusd(r.netYield.toNumber(), 2, true)}. Maximum borrow at the 110% minimum ratio: {fmtMusd(r.maxBorrowAtMcr.toNumber(), 0)} MUSD.
          </p>
          {r.warnings.map((w) => (
            <Callout key={w.code} tone={w.code === "below_ccr" || w.code === "negative_carry" ? "warn" : "neg"}>{w.message}</Callout>
          ))}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <caption className="mb-2 text-left text-[12.5px] text-ink-2">Stress tests (each shock applied alone to the position above)</caption>
              <thead>
                <tr className="text-left text-[12px] text-faint">
                  <th className="py-1.5 font-normal">Scenario</th>
                  <th className="py-1.5 text-right font-normal">ICR</th>
                  <th className="py-1.5 text-right font-normal">Net over horizon</th>
                  <th className="py-1.5 text-right font-normal">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {stress.map((s) => (
                  <tr key={s.label} className="border-t border-line">
                    <td className="py-1.5 text-ink-2">{s.label}</td>
                    <td className="figure py-1.5 text-right">{fmtPct(s.result.icr.toNumber(), 0)}</td>
                    <td className={cn("figure py-1.5 text-right", s.result.netYield.isNegative() ? "text-neg" : "text-pos")}>{fmtMusd(s.result.netYield.toNumber(), 2, true)}</td>
                    <td className={cn("py-1.5 text-right text-[12px]", s.liquidatable ? "text-neg" : s.result.icr.lessThan(params.ccr) ? "text-ink" : "text-muted")}>{s.liquidatable ? "Liquidatable" : s.result.icr.lessThan(params.ccr) ? "Below 150% CCR" : "Holds"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11.5px] text-faint">Price shocks use the Mezo oracle price of ${fmtNum(btcPrice, 0)} as the base. A liquidated trove loses its collateral; redemptions can also close low-ratio troves above 110%. Liquidity stress raises the slippage on unwinding the sMUSD leg.</p>
        </>
      ) : null}
    </div>
  );
}

export function WatchControls({ opp }: { opp: Opportunity }) {
  const session = useSession();
  const qc = useQueryClient();
  const watch = useQuery({
    queryKey: ["watchlist"],
    enabled: !!session.address,
    queryFn: async () => ((await (await fetch("/api/watchlist")).json()) as { items: { opportunity_id: string }[] }).items,
  });
  const watched = !!watch.data?.some((w) => w.opportunity_id === opp.id);
  const toggle = useMutation({
    mutationFn: async () => {
      const r = watched
        ? await fetch(`/api/watchlist?opportunityId=${opp.id}`, { method: "DELETE" })
        : await fetch("/api/watchlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opportunityId: opp.id }) });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Request failed");
    },
    onSuccess: () => {
      toast.success(watched ? "Removed from watchlist." : "Added to watchlist.");
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const [kind, setKind] = useState<AlertKind>("yield_below");
  const [threshold, setThreshold] = useState("");
  const createAlert = useMutation({
    mutationFn: async () => {
      const needs = ALERT_NEEDS_THRESHOLD[kind];
      const t = needs ? Number(threshold) : null;
      if (needs && (!Number.isFinite(t) || t === null || t < 0)) throw new Error("Enter a threshold.");
      const r = await fetch("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opportunityId: opp.id, kind, threshold: needs === "rate" ? t! / 100 : t }) });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Request failed");
    },
    onSuccess: () => {
      toast.success("Alert saved. It is checked daily and whenever you open your watchlist.");
      qc.invalidateQueries({ queryKey: ["alerts"] });
      setThreshold("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  if (opp.dataKind === "demo") return null;
  if (!session.address) {
    return (
      <p className="text-[12.5px] text-muted">
        Connect and sign in with your wallet to watch this strategy and set alerts.
      </p>
    );
  }
  const needs = ALERT_NEEDS_THRESHOLD[kind];
  return (
    <div className="space-y-3">
      <Button size="sm" variant={watched ? "secondary" : "primary"} onClick={() => toggle.mutate()} disabled={toggle.isPending || watch.isLoading}>
        {watched ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
        {watched ? "Remove from watchlist" : "Add to watchlist"}
      </Button>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-60">
          <Select ariaLabel="Alert type" value={kind} onChange={(v) => setKind(v as AlertKind)} options={ALERT_KINDS.map((k) => ({ value: k, label: ALERT_LABEL[k] }))} />
        </div>
        {needs ? (
          <input aria-label="Alert threshold" className={cn(inputCls, "figure w-28")} placeholder={needs === "rate" ? "% e.g. 3" : "USD"} value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" />
        ) : null}
        <Button size="sm" onClick={() => createAlert.mutate()} disabled={createAlert.isPending}>
          <Bell size={14} aria-hidden /> Set alert
        </Button>
      </div>
    </div>
  );
}
