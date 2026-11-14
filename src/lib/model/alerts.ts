import type { Projection } from "./projection";
import type { Opportunity } from "./types";

/**
 * Alert rules. Evaluated by the daily cron and whenever the owner opens the
 * app ("check now"). An alert whose input is unavailable is reported as
 * "unavailable" — it is never silently treated as passing.
 */

export const ALERT_KINDS = ["yield_below", "incentive_below", "liquidity_below", "borrow_above", "stale_data", "param_change", "net_negative"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_LABEL: Record<AlertKind, string> = {
  yield_below: "Advertised yield falls below",
  incentive_below: "Incentive yield falls below",
  liquidity_below: "Liquidity falls below (USD)",
  borrow_above: "Borrowing cost rises above",
  stale_data: "Data source becomes stale",
  param_change: "A protocol parameter changes",
  net_negative: "Estimated net return turns negative",
};

export const ALERT_NEEDS_THRESHOLD: Record<AlertKind, "rate" | "usd" | null> = {
  yield_below: "rate",
  incentive_below: "rate",
  liquidity_below: "usd",
  borrow_above: "rate",
  stale_data: null,
  param_change: null,
  net_negative: null,
};

export interface AlertEvaluation {
  state: "ok" | "triggered" | "unavailable";
  value: number | null;
  message: string;
}

/** Fingerprint of parameters whose change should notify the user. */
export function paramFingerprint(o: Opportunity): Record<string, string | number | null> {
  const e = o.economics;
  return {
    depositFee: e.protocolFees.depositFeePct,
    withdrawalFee: e.protocolFees.withdrawalFeePct,
    performanceFee: e.protocolFees.performanceFeePct,
    lockDays: e.lockDays,
    borrowApr: e.borrow?.apr.value ?? null,
    issuanceFee: e.borrow?.oneTimeFeePct.value ?? null,
    mcr: e.borrow?.mcr.value ?? null,
    ccr: e.borrow?.ccr.value ?? null,
    minNetDebt: e.borrow?.minNetDebt.value ?? null,
  };
}

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

export function evaluateAlert(
  kind: AlertKind,
  threshold: number | null,
  opp: Opportunity | undefined,
  ctx: { projection?: Projection | null; baseline?: Record<string, unknown> | null },
): AlertEvaluation {
  if (!opp) return { state: "unavailable", value: null, message: "Opportunity is no longer listed." };
  switch (kind) {
    case "yield_below": {
      const v = opp.advertised.value ?? opp.base.value;
      if (v === null || threshold === null) return { state: "unavailable", value: null, message: "Yield unavailable — cannot evaluate." };
      return v < threshold
        ? { state: "triggered", value: v, message: `${opp.name}: yield ${pct(v)} is below your ${pct(threshold)} threshold.` }
        : { state: "ok", value: v, message: `Yield ${pct(v)} ≥ ${pct(threshold)}.` };
    }
    case "incentive_below": {
      const v = opp.incentive.value;
      if (v === null || threshold === null) return { state: "unavailable", value: null, message: "Incentive yield unavailable or unverified." };
      return v < threshold
        ? { state: "triggered", value: v, message: `${opp.name}: incentives ${pct(v)} fell below ${pct(threshold)}.` }
        : { state: "ok", value: v, message: `Incentives ${pct(v)} ≥ ${pct(threshold)}.` };
    }
    case "liquidity_below": {
      const v = opp.availableLiquidityUsd.value ?? opp.tvlUsd.value;
      if (v === null || threshold === null) return { state: "unavailable", value: null, message: "Liquidity unavailable." };
      return v < threshold
        ? { state: "triggered", value: v, message: `${opp.name}: liquidity ${usd(v)} is below ${usd(threshold)}.` }
        : { state: "ok", value: v, message: `Liquidity ${usd(v)} ≥ ${usd(threshold)}.` };
    }
    case "borrow_above": {
      const v = opp.economics.borrow?.apr.value ?? null;
      if (!opp.economics.borrow) return { state: "unavailable", value: null, message: "This strategy has no borrowing leg." };
      if (v === null || threshold === null) return { state: "unavailable", value: null, message: "Borrow rate unavailable." };
      return v > threshold
        ? { state: "triggered", value: v, message: `${opp.name}: borrow APR ${pct(v)} exceeds ${pct(threshold)}.` }
        : { state: "ok", value: v, message: `Borrow APR ${pct(v)} ≤ ${pct(threshold)}.` };
    }
    case "stale_data": {
      const stale = opp.freshness === "stale" || opp.freshness === "unknown";
      return stale
        ? { state: "triggered", value: null, message: `${opp.name}: source data is ${opp.freshness} (last update ${opp.lastUpdated ?? "unknown"}).` }
        : { state: "ok", value: null, message: `Data ${opp.freshness}.` };
    }
    case "param_change": {
      const now = paramFingerprint(opp);
      const base = ctx.baseline ?? null;
      if (!base) return { state: "ok", value: null, message: "Baseline recorded." };
      const changed = Object.keys(now).filter((k) => JSON.stringify(now[k]) !== JSON.stringify(base[k]));
      return changed.length
        ? { state: "triggered", value: null, message: `${opp.name}: parameter change detected (${changed.join(", ")}).` }
        : { state: "ok", value: null, message: "No parameter changes." };
    }
    case "net_negative": {
      const p = ctx.projection;
      if (!p || p.netProfit === null) return { state: "unavailable", value: null, message: "Net return cannot be estimated with available data." };
      const v = p.netReturn!.toNumber();
      return p.netProfit.isNegative()
        ? { state: "triggered", value: v, message: `${opp.name}: estimated net return is negative (${pct(v)}) under your assumptions.` }
        : { state: "ok", value: v, message: `Estimated net ${pct(v)}.` };
    }
  }
}
