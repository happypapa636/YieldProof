import {
  assertFraction,
  assertNonNegative,
  assertPositive,
  d,
  Decimal,
  DecimalInput,
  EngineInputError,
  ONE,
  ZERO,
} from "./decimal";
import {
  annualizeCompound,
  annualizeSimple,
  COMPOUNDING_PERIODS,
  CompoundingFrequency,
  RateInput,
  toSimpleApr,
} from "./rates";

/**
 * YieldProof net-return engine.
 *
 *   Net Profit = Gross Base Yield + Realised Incentive Value − Estimated Costs
 *
 * Costs = entry tx + exit tx + deposit fee + entry slippage + exit slippage
 *       + withdrawal fee + performance fee + borrow interest + borrow fee
 *       + reinvestment (compounding) fees + modeled impermanent loss
 *
 * Protocol fees flagged `includedInQuotedRate` are NOT subtracted again (no
 * double counting); they are listed in the assumption ledger instead.
 * Unavailable rates are never treated as zero: the affected component is
 * returned as `null` and the result is marked partial.
 */

export interface ProtocolFeeInput {
  /** Fee on deposit, fraction of deposited amount. */
  depositFeePct?: DecimalInput;
  /** Fee on withdrawal, fraction of position value at exit. */
  withdrawalFeePct?: DecimalInput;
  /** Fee on earnings, fraction of gross yield. */
  performanceFeePct?: DecimalInput;
  /** True when the quoted rate is already net of these fees. */
  includedInQuotedRate: boolean;
}

export interface BorrowInput {
  /** Amount borrowed and deployed into the strategy alongside capital (asset units). */
  amount: DecimalInput;
  rate: RateInput;
  /** One-time origination/issuance fee, fraction of the borrowed amount. */
  oneTimeFeePct?: DecimalInput;
  /** Interest-bearing debt if it differs from `amount` (e.g. MUSD adds fee + 200 gas deposit). */
  interestBearingDebt?: DecimalInput;
}

export interface NetReturnInput {
  capital: DecimalInput;
  days: number;
  baseRate: RateInput | null;
  incentiveRate: RateInput | null;
  /** Incentive token price relative to the current reference price (1 = current, 0 = worthless). */
  incentivePriceFactor?: DecimalInput;
  /** Relative change applied to the base rate for the whole horizon (−0.25 = rates fall 25%). */
  rateChangePct?: DecimalInput;
  /** Relative change applied to the incentive emission rate (independent of price). */
  incentiveRateChangePct?: DecimalInput;
  compounding?: CompoundingFrequency;
  /** Strategy-level realism flag. Compounding is ignored (with a warning) when false. */
  compoundingSupported?: boolean;
  /** Cost per reinvestment action (claim + swap + redeposit), asset units. */
  reinvestCost?: DecimalInput;
  entryCost?: DecimalInput;
  exitCost?: DecimalInput;
  entrySlippagePct?: DecimalInput;
  exitSlippagePct?: DecimalInput;
  protocolFees?: ProtocolFeeInput;
  borrow?: BorrowInput;
  /** Modeled impermanent loss as a fraction of deployed principal (LP strategies only). */
  impermanentLossPct?: DecimalInput;
}

export type WarningCode =
  | "base_rate_unavailable"
  | "incentive_rate_unavailable"
  | "no_rates_available"
  | "compounding_unsupported"
  | "compounding_cost_exceeds_earnings"
  | "fees_included_in_rate"
  | "negative_net_return"
  | "costs_exceed_yield"
  | "short_horizon_annualization";

export interface EngineWarning {
  code: WarningCode;
  message: string;
}

export interface CostBreakdown {
  entryTx: Decimal;
  exitTx: Decimal;
  depositFee: Decimal;
  entrySlippage: Decimal;
  exitSlippage: Decimal;
  withdrawalFee: Decimal;
  performanceFee: Decimal;
  borrowInterest: Decimal;
  borrowFee: Decimal;
  reinvestment: Decimal;
  impermanentLoss: Decimal;
}

export interface NetReturnResult {
  status: "complete" | "partial" | "insufficient_data";
  capital: Decimal;
  days: number;
  deployed: Decimal;
  /** Simple APRs actually applied after conversions and scenarios (null = unavailable). */
  appliedBaseApr: Decimal | null;
  appliedIncentiveApr: Decimal | null;
  baseEarnings: Decimal | null;
  incentiveEarnings: Decimal | null;
  grossEarnings: Decimal | null;
  costs: CostBreakdown;
  totalCosts: Decimal;
  transactionCosts: Decimal;
  borrowingCosts: Decimal;
  netProfit: Decimal | null;
  endingValue: Decimal | null;
  /** Net profit / capital over the horizon. */
  netReturn: Decimal | null;
  /** netReturn × 365 / days. */
  annualizedSimple: Decimal | null;
  /** (1 + netReturn)^(365/days) − 1, null when not meaningful. */
  annualizedCompound: Decimal | null;
  compoundingApplied: CompoundingFrequency;
  compoundingEvents: number;
  warnings: EngineWarning[];
}

function opt(x: DecimalInput | undefined, field: string, fallback: Decimal = ZERO): Decimal {
  return x === undefined ? fallback : d(x, field);
}

function emptyCosts(): CostBreakdown {
  return {
    entryTx: ZERO,
    exitTx: ZERO,
    depositFee: ZERO,
    entrySlippage: ZERO,
    exitSlippage: ZERO,
    withdrawalFee: ZERO,
    performanceFee: ZERO,
    borrowInterest: ZERO,
    borrowFee: ZERO,
    reinvestment: ZERO,
    impermanentLoss: ZERO,
  };
}

export function sumCosts(c: CostBreakdown): Decimal {
  return Object.values(c).reduce((acc: Decimal, v: Decimal) => acc.plus(v), ZERO);
}

export function validateHorizon(days: number): number {
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new EngineInputError("days", "horizon must be a whole number of days between 1 and 3650");
  }
  return days;
}

export function calculateNetReturn(input: NetReturnInput): NetReturnResult {
  const warnings: EngineWarning[] = [];
  const capital = assertPositive(d(input.capital, "capital"), "capital");
  const days = validateHorizon(input.days);
  const t = new Decimal(days).dividedBy(365);

  const entryCost = assertNonNegative(opt(input.entryCost, "entryCost"), "entryCost");
  const exitCost = assertNonNegative(opt(input.exitCost, "exitCost"), "exitCost");
  const entrySlip = assertFraction(opt(input.entrySlippagePct, "entrySlippagePct"), "entrySlippagePct");
  const exitSlip = assertFraction(opt(input.exitSlippagePct, "exitSlippagePct"), "exitSlippagePct");
  const ilPct = assertFraction(opt(input.impermanentLossPct, "impermanentLossPct"), "impermanentLossPct");
  const priceFactor = assertNonNegative(opt(input.incentivePriceFactor, "incentivePriceFactor", ONE), "incentivePriceFactor");
  const rateChange = opt(input.rateChangePct, "rateChangePct");
  const incRateChange = opt(input.incentiveRateChangePct, "incentiveRateChangePct");
  if (rateChange.lessThan(-1) || incRateChange.lessThan(-1)) {
    throw new EngineInputError("rateChangePct", "a rate cannot fall by more than 100%");
  }
  const reinvestCost = assertNonNegative(opt(input.reinvestCost, "reinvestCost"), "reinvestCost");

  // ---- protocol fees (skip when already inside the quoted rate) ----
  const fees = input.protocolFees;
  let depositFeePct = ZERO;
  let withdrawalFeePct = ZERO;
  let performanceFeePct = ZERO;
  if (fees) {
    const dep = assertFraction(opt(fees.depositFeePct, "depositFeePct"), "depositFeePct");
    const wd = assertFraction(opt(fees.withdrawalFeePct, "withdrawalFeePct"), "withdrawalFeePct");
    const perf = assertFraction(opt(fees.performanceFeePct, "performanceFeePct"), "performanceFeePct");
    if (fees.includedInQuotedRate) {
      if (!dep.isZero() || !wd.isZero() || !perf.isZero()) {
        warnings.push({
          code: "fees_included_in_rate",
          message: "Protocol fees are already reflected in the quoted rate and are not subtracted again.",
        });
      }
    } else {
      depositFeePct = dep;
      withdrawalFeePct = wd;
      performanceFeePct = perf;
    }
  }

  // ---- borrowing ----
  let borrowAmount = ZERO;
  let borrowApr = ZERO;
  let borrowFeePct = ZERO;
  let interestBearing = ZERO;
  if (input.borrow) {
    borrowAmount = assertNonNegative(d(input.borrow.amount, "borrow.amount"), "borrow.amount");
    borrowApr = toSimpleApr(input.borrow.rate);
    if (borrowApr.isNegative()) throw new EngineInputError("borrow.rate", "borrow rate cannot be negative");
    borrowFeePct = assertFraction(opt(input.borrow.oneTimeFeePct, "borrow.oneTimeFeePct"), "borrow.oneTimeFeePct");
    interestBearing =
      input.borrow.interestBearingDebt !== undefined
        ? assertNonNegative(d(input.borrow.interestBearingDebt, "borrow.interestBearingDebt"), "borrow.interestBearingDebt")
        : borrowAmount;
  }

  const costs = emptyCosts();
  costs.entryTx = entryCost;
  costs.exitTx = exitCost;

  const gross = capital.plus(borrowAmount);
  costs.depositFee = gross.times(depositFeePct);
  costs.entrySlippage = gross.minus(costs.depositFee).times(entrySlip);
  const deployed = gross.minus(costs.depositFee).minus(costs.entrySlippage);

  costs.borrowInterest = interestBearing.times(borrowApr).times(t);
  costs.borrowFee = borrowAmount.times(borrowFeePct);

  // ---- rates (never default an unavailable rate to zero) ----
  const baseApr = input.baseRate ? toSimpleApr(input.baseRate).times(ONE.plus(rateChange)) : null;
  const incApr = input.incentiveRate
    ? toSimpleApr(input.incentiveRate).times(ONE.plus(incRateChange)).times(priceFactor)
    : null;

  if (!baseApr && !incApr) {
    warnings.push({
      code: "no_rates_available",
      message: "No verified yield rate is available, so no return can be estimated.",
    });
    const totalCosts = sumCosts(costs);
    return {
      status: "insufficient_data",
      capital,
      days,
      deployed,
      appliedBaseApr: null,
      appliedIncentiveApr: null,
      baseEarnings: null,
      incentiveEarnings: null,
      grossEarnings: null,
      costs,
      totalCosts,
      transactionCosts: totalCosts.minus(costs.borrowInterest).minus(costs.borrowFee),
      borrowingCosts: costs.borrowInterest.plus(costs.borrowFee),
      netProfit: null,
      endingValue: null,
      netReturn: null,
      annualizedSimple: null,
      annualizedCompound: null,
      compoundingApplied: "none",
      compoundingEvents: 0,
      warnings,
    };
  }
  if (!baseApr) {
    warnings.push({
      code: "base_rate_unavailable",
      message: "Base yield is unavailable; it is excluded from the estimate, not assumed to be zero.",
    });
  }
  if (!incApr) {
    warnings.push({
      code: "incentive_rate_unavailable",
      message: "Incentive yield is unavailable or unverified; it is excluded from the estimate, not assumed to be zero.",
    });
  }

  const bApr = baseApr ?? ZERO;
  const iApr = incApr ?? ZERO;
  const totalApr = bApr.plus(iApr);

  // ---- earnings: simple or compounded ----
  let requested: CompoundingFrequency = input.compounding ?? "none";
  if (requested !== "none" && input.compoundingSupported === false) {
    warnings.push({
      code: "compounding_unsupported",
      message: "This strategy cannot realistically reinvest at the chosen frequency, so earnings are projected without compounding.",
    });
    requested = "none";
  }

  let grossEarnings: Decimal;
  let events = 0;
  let skipped = 0;
  if (requested === "none" || totalApr.isZero()) {
    grossEarnings = deployed.times(totalApr).times(t);
  } else {
    const ppy = COMPOUNDING_PERIODS[requested];
    const periodDays = new Decimal(365).dividedBy(ppy);
    const fullPeriods = new Decimal(days).dividedBy(periodDays).floor().toNumber();
    const remainderDays = new Decimal(days).minus(periodDays.times(fullPeriods));
    const perPeriod = totalApr.dividedBy(ppy);
    let balance = deployed;
    grossEarnings = ZERO;
    for (let i = 0; i < fullPeriods; i++) {
      const earned = balance.times(perPeriod);
      grossEarnings = grossEarnings.plus(earned);
      // Reinvest only when it pays for itself; otherwise the earnings are held, not compounded.
      if (earned.greaterThan(reinvestCost)) {
        balance = balance.plus(earned).minus(reinvestCost);
        costs.reinvestment = costs.reinvestment.plus(reinvestCost);
        events++;
      } else {
        skipped++;
      }
    }
    const tail = balance.times(totalApr).times(remainderDays).dividedBy(365);
    grossEarnings = grossEarnings.plus(tail);
    if (skipped > 0) {
      warnings.push({
        code: "compounding_cost_exceeds_earnings",
        message: `${skipped} of ${fullPeriods} reinvestments were skipped because the reinvestment cost exceeded the period's earnings.`,
      });
    }
  }

  // Split gross earnings between base and incentive in proportion to their rates.
  const baseEarnings = baseApr === null ? null : totalApr.isZero() ? ZERO : grossEarnings.times(bApr).dividedBy(totalApr);
  const incentiveEarnings = incApr === null ? null : totalApr.isZero() ? ZERO : grossEarnings.times(iApr).dividedBy(totalApr);

  costs.performanceFee = Decimal.max(grossEarnings, ZERO).times(performanceFeePct);
  costs.impermanentLoss = deployed.times(ilPct);
  const valueBeforeExit = deployed
    .plus(grossEarnings)
    .minus(costs.reinvestment)
    .minus(costs.performanceFee)
    .minus(costs.impermanentLoss);
  costs.exitSlippage = Decimal.max(valueBeforeExit, ZERO).times(exitSlip);
  costs.withdrawalFee = Decimal.max(valueBeforeExit.minus(costs.exitSlippage), ZERO).times(withdrawalFeePct);

  const totalCosts = sumCosts(costs);
  const netProfit = grossEarnings.minus(totalCosts);
  const endingValue = capital.plus(netProfit);
  const netReturn = netProfit.dividedBy(capital);

  if (netProfit.isNegative()) {
    warnings.push({
      code: "negative_net_return",
      message: "Estimated costs exceed estimated earnings: this strategy is projected to lose money under these assumptions.",
    });
  }
  if (totalCosts.greaterThan(grossEarnings)) {
    warnings.push({ code: "costs_exceed_yield", message: "Costs are larger than gross yield over this horizon." });
  }
  if (days < 30) {
    warnings.push({
      code: "short_horizon_annualization",
      message: "Annualising a horizon under 30 days magnifies one-off costs; read the annualised figure with care.",
    });
  }

  // Callers pass an explicit zero rate when a component is verified to be absent
  // (e.g. a vault with no incentive programme) and `null` when it is unknown.
  const status: NetReturnResult["status"] = baseApr !== null && incApr !== null ? "complete" : "partial";

  return {
    status,
    capital,
    days,
    deployed,
    appliedBaseApr: baseApr,
    appliedIncentiveApr: incApr,
    baseEarnings,
    incentiveEarnings,
    grossEarnings,
    costs,
    totalCosts,
    transactionCosts: totalCosts.minus(costs.borrowInterest).minus(costs.borrowFee),
    borrowingCosts: costs.borrowInterest.plus(costs.borrowFee),
    netProfit,
    endingValue,
    netReturn,
    annualizedSimple: annualizeSimple(netReturn, days),
    annualizedCompound: annualizeCompound(netReturn, days),
    compoundingApplied: requested,
    compoundingEvents: events,
    warnings,
  };
}
