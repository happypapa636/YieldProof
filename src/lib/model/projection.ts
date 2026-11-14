import { d, Decimal, ONE, ZERO } from "@/lib/engine/decimal";
import { analyzeMusdLeverage, genericLeverage, GenericLeverageResult, MusdLeverageResult } from "@/lib/engine/leverage";
import { impermanentLoss, lpExitToSingle, PoolState, poolValueIn, quoteSwap } from "@/lib/engine/liquidity";
import { CompoundingFrequency, RateInput, toSimpleApr } from "@/lib/engine/rates";
import { calculateNetReturn, EngineWarning, NetReturnInput, NetReturnResult } from "@/lib/engine/returns";
import { IncentiveScenarioId, incentiveFactorFor } from "@/lib/engine/scenarios";
import type { SourceType } from "@/lib/engine/types";
import type { Opportunity, RateMetric } from "./types";

export interface Assumptions {
  capital: number; // MUSD (≈ USD; peg assumption disclosed)
  days: number;
  compounding: CompoundingFrequency;
  incentiveScenario: IncentiveScenarioId;
  /** Optional custom incentive price factor (demo slider). Overrides the scenario. */
  incentivePriceFactor: number | null;
  /** Relative change applied to base yield (−0.5 = halves). */
  rateChangePct: number;
  /** Where the capital starts: already in the deposit asset, or in MUSD (adds conversion slippage). */
  startFrom: "deposit-asset" | "musd";
  /** Override modeled gas with a flat cost per transaction (MUSD). */
  txCostOverride: number | null;
  /** Multiplier on modeled exit slippage (1 = current liquidity, 3 = stressed). */
  exitStress: number;
  /** Override the borrowing APR for leveraged strategies (fraction). */
  borrowAprOverride: number | null;
  /** Borrowed amount as a fraction of collateral value for leveraged strategies. */
  leverageLtv: number | null;
  /** Hypothetical price move of the volatile asset in LP strategies (0.2 = ±20%). */
  lpPriceMovePct: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  capital: 10_000,
  days: 365,
  compounding: "none",
  incentiveScenario: "current",
  incentivePriceFactor: null,
  rateChangePct: 0,
  startFrom: "deposit-asset",
  txCostOverride: null,
  exitStress: 1,
  borrowAprOverride: null,
  leverageLtv: null,
  lpPriceMovePct: 0.2,
};

export interface LedgerItem {
  label: string;
  value: string;
  source: SourceType | "user";
  note?: string;
}

export interface ProjectionContext {
  pools: Record<string, PoolState>;
  /** BTC price in MUSD used to size BTC collateral (oracle). */
  btcPrice: number | null;
}

export interface Projection {
  opportunityId: string;
  dataKind: "live" | "demo";
  status: NetReturnResult["status"];
  capital: Decimal;
  days: number;
  baseEarnings: Decimal | null;
  incentiveEarnings: Decimal | null;
  grossEarnings: Decimal | null;
  transactionCosts: Decimal;
  borrowingCosts: Decimal;
  slippageCosts: Decimal;
  feeCosts: Decimal;
  ilCost: Decimal;
  reinvestCosts: Decimal;
  totalCosts: Decimal;
  netProfit: Decimal | null;
  endingValue: Decimal | null;
  netReturn: Decimal | null;
  annualized: Decimal | null;
  warnings: EngineWarning[];
  notes: string[];
  ledger: LedgerItem[];
  engine: NetReturnResult | null;
  musdLeverage: MusdLeverageResult | null;
  genericLeverage: GenericLeverageResult | null;
}

export const pct = (x: number | Decimal | null | undefined, dp = 2): string => {
  if (x === null || x === undefined) return "Unavailable";
  const v = typeof x === "number" ? x : x.toNumber();
  return `${(v * 100).toFixed(dp)}%`;
};

const musd = (x: number | Decimal, dp = 2): string =>
  `${(typeof x === "number" ? x : x.toNumber()).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })} MUSD`;

function rateInput(m: RateMetric): RateInput | null {
  if (m.value === null || m.status !== "ok") return null;
  return { value: m.value, basis: m.basis, compoundsPerYear: m.compoundsPerYear };
}

function sourceTypeOf(m: { source: { type: SourceType } | null }): SourceType {
  return m.source?.type ?? "modeled";
}

/** Entry/exit slippage for a single-sided MUSD entry into a two-sided pool. */
export function lpSlippage(pool: PoolState, capitalMusd: Decimal, musdIsToken0: boolean) {
  const half = capitalMusd.dividedBy(2);
  const q = quoteSwap(pool, half, musdIsToken0);
  const entryLoss = half.times(q.totalSlippagePct);
  const entryPct = entryLoss.dividedBy(capitalMusd);
  const poolValue = poolValueIn(pool, musdIsToken0);
  const share = capitalMusd.minus(entryLoss).dividedBy(poolValue.plus(capitalMusd));
  const exit = lpExitToSingle(pool, share, musdIsToken0);
  return { entryPct, exitPct: exit.slippagePct, share, drainsPool: exit.drainsPool };
}

export function projectOpportunity(opp: Opportunity, a: Assumptions, ctx: ProjectionContext): Projection {
  const ledger: LedgerItem[] = [];
  const notes: string[] = [];
  const capital = d(a.capital, "capital");
  const e = opp.economics;

  ledger.push({ label: "Initial capital", value: musd(capital), source: "user" });
  ledger.push({ label: "Horizon", value: `${a.days} days`, source: "user" });
  if (opp.dataKind === "live") {
    ledger.push({ label: "Valuation unit", value: "1 MUSD = 1 USD", source: "modeled", note: "Peg assumption; see Sources for the latest market price of MUSD." });
  }

  // ---- transaction costs ----
  const perTx = a.txCostOverride;
  const entryCost = perTx !== null ? d(perTx).times(2) : e.entryCostMusd.value !== null ? d(e.entryCostMusd.value) : null;
  const exitCost = perTx !== null ? d(perTx).times(2) : e.exitCostMusd.value !== null ? d(e.exitCostMusd.value) : null;
  const reinvestCost = perTx !== null ? d(perTx).times(2) : e.reinvestCostMusd.value !== null ? d(e.reinvestCostMusd.value) : null;
  ledger.push({
    label: "Entry transactions",
    value: entryCost !== null ? musd(entryCost, 4) : "Unavailable",
    source: perTx !== null ? "user" : sourceTypeOf(e.entryCostMusd),
    note: perTx !== null ? "User override: 2 transactions (approve + deposit)." : e.entryCostMusd.note,
  });
  ledger.push({
    label: "Exit transactions",
    value: exitCost !== null ? musd(exitCost, 4) : "Unavailable",
    source: perTx !== null ? "user" : sourceTypeOf(e.exitCostMusd),
    note: perTx !== null ? "User override: 2 transactions." : e.exitCostMusd.note,
  });

  // ---- slippage (size-dependent, from on-chain reserves where available) ----
  let entrySlip: Decimal | null = e.entrySlippagePct.value !== null ? d(e.entrySlippagePct.value) : null;
  let exitSlip: Decimal | null = e.exitSlippagePct.value !== null ? d(e.exitSlippagePct.value) : null;
  let slipSource: SourceType = sourceTypeOf(e.exitSlippagePct);
  if (opp.tags.lp && opp.poolAddress) {
    const pool = ctx.pools[opp.id];
    if (pool) {
      try {
        const musdIsToken0 = opp.economics.musdRoute?.depositAssetIsToken0 ?? false;
        const s = lpSlippage(pool, capital, musdIsToken0);
        entrySlip = s.entryPct;
        exitSlip = s.exitPct;
        slipSource = "on-chain";
        notes.push(`Your position would be ~${pct(s.share, 2)} of the pool.`);
        if (s.drainsPool) notes.push("Position is too large relative to the pool to exit through it.");
      } catch {
        entrySlip = null;
        exitSlip = null;
      }
    }
  } else if (a.startFrom === "musd" && opp.depositAsset !== "MUSD") {
    if (e.musdRoute && ctx.pools[e.musdRoute.poolId]) {
      const pool = ctx.pools[e.musdRoute.poolId]!;
      try {
        // MUSD → deposit asset on entry, deposit asset → MUSD on exit.
        const musdIn = quoteSwap(pool, capital, !e.musdRoute.depositAssetIsToken0);
        entrySlip = musdIn.totalSlippagePct;
        const back = quoteSwap(pool, musdIn.amountOut, e.musdRoute.depositAssetIsToken0);
        exitSlip = back.totalSlippagePct;
        slipSource = "on-chain";
        notes.push(`Converts MUSD ↔ ${opp.depositAsset} through ${e.musdRoute.label} at current on-chain reserves.`);
      } catch {
        entrySlip = null;
        exitSlip = null;
        notes.push(`Conversion through ${e.musdRoute.label} could not be quoted at this size.`);
      }
    } else {
      entrySlip = null;
      exitSlip = null;
      notes.push(`No verified MUSD → ${opp.depositAsset} route on Mezo Pools; conversion cost is excluded (not assumed zero).`);
    }
  } else if (a.startFrom === "deposit-asset" && opp.depositAsset !== "MUSD" && !opp.tags.lp) {
    entrySlip = entrySlip ?? ZERO;
    exitSlip = exitSlip ?? ZERO;
    ledger.push({ label: "Starting asset", value: `Already holds ${opp.depositAsset}`, source: "user", note: `${opp.depositAsset} price held constant over the horizon.` });
  }
  const stress = d(a.exitStress);
  if (exitSlip !== null && !stress.equals(1)) {
    exitSlip = Decimal.min(exitSlip.times(stress), new Decimal("0.95"));
  }
  ledger.push({
    label: "Entry slippage",
    value: entrySlip !== null ? pct(entrySlip, 3) : "Unavailable",
    source: entrySlip !== null ? slipSource : "modeled",
    note: entrySlip === null ? "Excluded from totals — not assumed zero." : undefined,
  });
  ledger.push({
    label: "Exit slippage",
    value: exitSlip !== null ? pct(exitSlip, 3) : "Unavailable",
    source: exitSlip !== null ? slipSource : "modeled",
    note: !stress.equals(1) ? `Stressed ×${a.exitStress} vs current liquidity.` : exitSlip === null ? "Excluded from totals — not assumed zero." : undefined,
  });

  // ---- rates ----
  const base = rateInput(opp.base);
  const inc = rateInput(opp.incentive);
  ledger.push({
    label: "Base yield",
    value: base ? `${pct(Number(base.value), 2)} ${base.basis}` : "Unavailable",
    source: sourceTypeOf(opp.base),
    note: base && base.basis === "APY" ? `Converted to ${pct(toSimpleApr(base), 3)} simple APR (daily-compounding basis) before projecting.` : opp.base.note,
  });
  ledger.push({
    label: "Incentive yield",
    value: inc ? `${pct(Number(inc.value), 2)} ${inc.basis}` : "Unavailable / not verified",
    source: sourceTypeOf(opp.incentive),
    note: inc ? opp.incentive.note : "Excluded from the estimate — not assumed to be zero.",
  });
  const priceFactor = a.incentivePriceFactor ?? Number(incentiveFactorFor(a.incentiveScenario));
  if (inc && Number(inc.value) > 0) {
    ledger.push({
      label: "Incentive token price",
      value: `${Math.round(priceFactor * 100)}% of reference`,
      source: "user",
      note: "Hypothetical sensitivity, not a forecast.",
    });
  }
  if (e.incentiveScheduleChangePct) {
    ledger.push({
      label: "Incentive emission schedule",
      value: `${Math.round(e.incentiveScheduleChangePct * 100)}% average vs today`,
      source: opp.dataKind === "demo" ? "demo" : "documentation",
    });
  }
  if (a.rateChangePct !== 0) {
    ledger.push({ label: "Rate scenario", value: `${a.rateChangePct > 0 ? "+" : ""}${Math.round(a.rateChangePct * 100)}% on base yield`, source: "user", note: "Scenario, not a forecast." });
  }
  ledger.push({
    label: "Protocol fees",
    value: e.protocolFees.includedInQuotedRate
      ? "Included in quoted rate"
      : `deposit ${pct(e.protocolFees.depositFeePct)}, withdrawal ${pct(e.protocolFees.withdrawalFeePct)}, performance ${pct(e.protocolFees.performanceFeePct)}`,
    source: opp.dataKind === "demo" ? "demo" : "documentation",
    note: e.protocolFees.note,
  });

  // ---- IL ----
  let ilPct: Decimal = ZERO;
  if (e.ilModel === "volatile-cp") {
    const move = d(a.lpPriceMovePct);
    ilPct = impermanentLoss(ONE.plus(move)).abs();
    ledger.push({ label: "Impermanent loss", value: pct(ilPct, 3), source: "modeled", note: `50/50 constant-product IL if the volatile asset moves ±${Math.round(a.lpPriceMovePct * 100)}%: IL = 2√r/(1+r) − 1.` });
  } else if (e.ilModel === "stable-pair") {
    ledger.push({ label: "Impermanent loss", value: "Not modeled", source: "modeled", note: "Stable pair: IL only arises if a stablecoin de-pegs; see depeg exposure in Liquidity." });
  }

  // ---- compounding realism ----
  if (a.compounding !== "none") {
    ledger.push({
      label: "Compounding",
      value: e.compoundingSupported ? a.compounding : `${a.compounding} requested → not applied`,
      source: "user",
      note: e.compoundingNote,
    });
  }

  // ---- leveraged MUSD loop: dedicated CDP model ----
  if (e.borrow && opp.strategyType === "leveraged" && opp.dataKind === "live") {
    const b = e.borrow;
    const ltv = a.leverageLtv ?? b.defaultLtv;
    const interest = a.borrowAprOverride ?? b.apr.value;
    const strategyApr = base ? toSimpleApr(base).times(ONE.plus(a.rateChangePct)) : null;
    const missing = [b.mcr, b.ccr, b.oneTimeFeePct, b.gasCompensation, b.minNetDebt].some((m) => m.value === null) || interest === null || strategyApr === null;
    if (missing) {
      return emptyProjection(opp, capital, a.days, ledger, notes, "Borrow parameters or strategy yield unavailable.");
    }
    const btcPrice = ctxBtcPrice(ctx);
    const collateralBtc = btcPrice ? capital.dividedBy(btcPrice) : capital; // capital = collateral value in MUSD
    const tx = (entryCost ?? ZERO).plus(exitCost ?? ZERO);
    const lev = analyzeMusdLeverage({
      collateralBtc,
      btcPrice: btcPrice ?? 1,
      borrowMusd: capital.times(ltv),
      params: {
        mcr: b.mcr.value!,
        ccr: b.ccr.value!,
        issuanceFeePct: b.oneTimeFeePct.value!,
        gasCompensation: b.gasCompensation.value!,
        minNetDebt: b.minNetDebt.value!,
        interestApr: interest!,
      },
      strategyApr: strategyApr!,
      days: a.days,
      txCosts: tx,
      exitSlippagePct: exitSlip ?? 0,
    });
    ledger.push({ label: "Collateral", value: `${collateralBtc.toFixed(6)} BTC (= capital)`, source: "user", note: "BTC price held constant; see stress tests for price moves." });
    ledger.push({ label: "Borrowed MUSD", value: `${musd(capital.times(ltv))} (${Math.round(ltv * 100)}% of collateral value)`, source: "user" });
    ledger.push({ label: "Borrow APR", value: pct(interest, 2), source: a.borrowAprOverride !== null ? "user" : sourceTypeOf(b.apr), note: "Simple interest, fixed at open, on recorded debt incl. issuance fee and 200 MUSD gas deposit." });
    ledger.push({ label: "Issuance fee", value: pct(b.oneTimeFeePct.value, 2), source: sourceTypeOf(b.oneTimeFeePct) });
    ledger.push({ label: "Minimum collateral ratio", value: pct(b.mcr.value, 0), source: sourceTypeOf(b.mcr) });
    const warnings: EngineWarning[] = lev.warnings.map((w) => ({ code: "negative_net_return", message: w.message }) as EngineWarning);
    const totalCosts = lev.borrowInterest.plus(lev.issuanceFee).plus(lev.txCosts).plus(lev.exitSlippage);
    return {
      opportunityId: opp.id,
      dataKind: opp.dataKind,
      status: "complete",
      capital,
      days: a.days,
      baseEarnings: lev.grossYield,
      incentiveEarnings: ZERO,
      grossEarnings: lev.grossYield,
      transactionCosts: lev.txCosts,
      borrowingCosts: lev.borrowInterest.plus(lev.issuanceFee),
      slippageCosts: lev.exitSlippage,
      feeCosts: ZERO,
      ilCost: ZERO,
      reinvestCosts: ZERO,
      totalCosts,
      netProfit: lev.netYield,
      endingValue: capital.plus(lev.netYield),
      netReturn: lev.netYield.dividedBy(capital),
      annualized: lev.netYield.dividedBy(capital).times(365).dividedBy(a.days),
      warnings,
      notes,
      ledger,
      engine: null,
      musdLeverage: lev,
      genericLeverage: null,
    };
  }

  // ---- generic engine path ----
  const input: NetReturnInput = {
    capital,
    days: a.days,
    baseRate: base,
    incentiveRate: inc,
    incentivePriceFactor: priceFactor,
    rateChangePct: a.rateChangePct,
    incentiveRateChangePct: e.incentiveScheduleChangePct ?? 0,
    compounding: a.compounding,
    compoundingSupported: e.compoundingSupported,
    reinvestCost: reinvestCost ?? ZERO,
    entryCost: entryCost ?? ZERO,
    exitCost: exitCost ?? ZERO,
    entrySlippagePct: entrySlip ?? ZERO,
    exitSlippagePct: exitSlip ?? ZERO,
    impermanentLossPct: ilPct,
    protocolFees: {
      depositFeePct: e.protocolFees.depositFeePct,
      withdrawalFeePct: e.protocolFees.withdrawalFeePct,
      performanceFeePct: e.protocolFees.performanceFeePct,
      includedInQuotedRate: e.protocolFees.includedInQuotedRate,
    },
  };
  let gen: GenericLeverageResult | null = null;
  if (e.borrow) {
    const ltv = a.leverageLtv ?? e.borrow.defaultLtv;
    const borrowAmount = capital.times(ltv);
    const apr = a.borrowAprOverride ?? e.borrow.apr.value ?? 0;
    input.borrow = {
      amount: borrowAmount,
      rate: { value: apr, basis: "APR" },
      oneTimeFeePct: e.borrow.oneTimeFeePct.value ?? 0,
    };
    ledger.push({ label: "Borrowed", value: `${musd(borrowAmount)} (${(ltv * 100).toFixed(0)}% of capital)`, source: opp.dataKind === "demo" ? "demo" : "user" });
    ledger.push({ label: "Borrow APR", value: pct(apr, 2), source: a.borrowAprOverride !== null ? "user" : sourceTypeOf(e.borrow.apr) });
    const lt = e.borrow.mcr.value ? 1 / e.borrow.mcr.value : 0.8;
    gen = genericLeverage({
      collateralAmount: capital.plus(borrowAmount),
      collateralPrice: 1,
      debt: borrowAmount.times(ONE.plus(d(e.borrow.oneTimeFeePct.value ?? 0))),
      liquidationThreshold: lt,
    });
  }
  const r = calculateNetReturn(input);
  if (entryCost === null || exitCost === null) notes.push("Transaction costs unavailable — excluded, not assumed zero.");
  const c = r.costs;
  return {
    opportunityId: opp.id,
    dataKind: opp.dataKind,
    status: r.status === "complete" && (entrySlip === null || exitSlip === null || entryCost === null) ? "partial" : r.status,
    capital,
    days: a.days,
    baseEarnings: r.baseEarnings,
    incentiveEarnings: r.incentiveEarnings,
    grossEarnings: r.grossEarnings,
    transactionCosts: c.entryTx.plus(c.exitTx),
    borrowingCosts: r.borrowingCosts,
    slippageCosts: c.entrySlippage.plus(c.exitSlippage),
    feeCosts: c.depositFee.plus(c.withdrawalFee).plus(c.performanceFee),
    ilCost: c.impermanentLoss,
    reinvestCosts: c.reinvestment,
    totalCosts: r.totalCosts,
    netProfit: r.netProfit,
    endingValue: r.endingValue,
    netReturn: r.netReturn,
    annualized: r.annualizedSimple,
    warnings: r.warnings,
    notes,
    ledger,
    engine: r,
    musdLeverage: null,
    genericLeverage: gen,
  };
}

function ctxBtcPrice(ctx: ProjectionContext): Decimal | null {
  return ctx.btcPrice ? d(ctx.btcPrice) : null;
}

function emptyProjection(opp: Opportunity, capital: Decimal, days: number, ledger: LedgerItem[], notes: string[], why: string): Projection {
  return {
    opportunityId: opp.id,
    dataKind: opp.dataKind,
    status: "insufficient_data",
    capital,
    days,
    baseEarnings: null,
    incentiveEarnings: null,
    grossEarnings: null,
    transactionCosts: ZERO,
    borrowingCosts: ZERO,
    slippageCosts: ZERO,
    feeCosts: ZERO,
    ilCost: ZERO,
    reinvestCosts: ZERO,
    totalCosts: ZERO,
    netProfit: null,
    endingValue: null,
    netReturn: null,
    annualized: null,
    warnings: [{ code: "no_rates_available", message: why }],
    notes,
    ledger,
    engine: null,
    musdLeverage: null,
    genericLeverage: null,
  };
}

/** Serialise a projection for client components / JSON. */
export function projectionSummary(p: Projection) {
  const n = (x: Decimal | null) => (x === null ? null : x.toNumber());
  return {
    id: p.opportunityId,
    status: p.status,
    base: n(p.baseEarnings),
    incentive: n(p.incentiveEarnings),
    gross: n(p.grossEarnings),
    tx: p.transactionCosts.toNumber(),
    borrowing: p.borrowingCosts.toNumber(),
    slippage: p.slippageCosts.toNumber(),
    fees: p.feeCosts.toNumber(),
    il: p.ilCost.toNumber(),
    reinvest: p.reinvestCosts.toNumber(),
    costs: p.totalCosts.toNumber(),
    net: n(p.netProfit),
    ending: n(p.endingValue),
    netReturn: n(p.netReturn),
    annualized: n(p.annualized),
  };
}
