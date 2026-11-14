import { d, Decimal, DecimalInput, EngineInputError, ONE } from "./decimal";

/**
 * APR vs APY handling.
 *
 *   APY = (1 + APR / n)^n − 1          (n = compounding periods per year)
 *   APR = n · ((1 + APY)^(1/n) − 1)
 *
 * Rates are fractions (0.05 = 5%). A rate is never used without its basis.
 * Mixing APR and APY values directly is the bug this module exists to prevent:
 * every projection first converts the quoted rate to a *simple* APR with an
 * explicit compounding assumption, then applies the user's own compounding.
 */

export type RateBasis = "APR" | "APY";

export interface RateInput {
  value: DecimalInput;
  basis: RateBasis;
  /** For APY inputs: the compounding frequency the quote assumes. Default 365 (daily). */
  compoundsPerYear?: number;
}

export const COMPOUNDING_PERIODS = {
  none: 0,
  daily: 365,
  weekly: 52,
  monthly: 12,
} as const;
export type CompoundingFrequency = keyof typeof COMPOUNDING_PERIODS;

function assertPeriods(n: number, field = "compoundsPerYear"): number {
  if (!Number.isInteger(n) || n < 1 || n > 366 * 24) throw new EngineInputError(field, `invalid compounding periods ${n}`);
  return n;
}

function assertRateBounds(r: Decimal, field: string): Decimal {
  // A rate below −100% is meaningless; above 100,000% is almost certainly a data error.
  if (r.lessThanOrEqualTo(-1)) throw new EngineInputError(field, "rate must be greater than −100%");
  if (r.greaterThan(1000)) throw new EngineInputError(field, "rate above 100,000% rejected as a likely data error");
  return r;
}

export function aprToApy(apr: DecimalInput, compoundsPerYear: number): Decimal {
  const n = assertPeriods(compoundsPerYear);
  const r = assertRateBounds(d(apr, "apr"), "apr");
  return ONE.plus(r.dividedBy(n)).pow(n).minus(1);
}

export function apyToApr(apy: DecimalInput, compoundsPerYear: number): Decimal {
  const n = assertPeriods(compoundsPerYear);
  const y = assertRateBounds(d(apy, "apy"), "apy");
  return ONE.plus(y).pow(ONE.dividedBy(n)).minus(1).times(n);
}

/** Convert any quoted rate to an equivalent simple (non-compounded) APR. */
export function toSimpleApr(rate: RateInput): Decimal {
  const v = assertRateBounds(d(rate.value, "rate"), "rate");
  if (rate.basis === "APR") return v;
  return apyToApr(v, rate.compoundsPerYear ?? 365);
}

/** Rate for a single compounding period, from a simple APR. */
export function periodicRate(apr: DecimalInput, periodsPerYear: number): Decimal {
  return d(apr, "apr").dividedBy(assertPeriods(periodsPerYear, "periodsPerYear"));
}

/** Simple annualisation of a period return: r · 365 / days. Labeled "simple" in the UI. */
export function annualizeSimple(periodReturn: DecimalInput, days: number): Decimal {
  if (!(days > 0)) throw new EngineInputError("days", "must be > 0");
  return d(periodReturn, "periodReturn").times(365).dividedBy(days);
}

/**
 * Compound annualisation (1 + r)^(365/days) − 1. Only meaningful when the
 * period return could realistically be repeated; returns null for total loss.
 */
export function annualizeCompound(periodReturn: DecimalInput, days: number): Decimal | null {
  if (!(days > 0)) throw new EngineInputError("days", "must be > 0");
  const r = d(periodReturn, "periodReturn");
  if (r.lessThanOrEqualTo(-1)) return null;
  return ONE.plus(r).pow(new Decimal(365).dividedBy(days)).minus(1);
}

/**
 * Realised trailing yield from an index that accrues "yield per unit" (e.g. the
 * sMUSD yieldIndex or an AMM fee index). Returns a simple APR.
 */
export function trailingIndexApr(params: {
  indexStart: bigint;
  indexEnd: bigint;
  /** Scale of the index (1e18 for most contracts). */
  indexScale: bigint;
  /** Value of one unit of the underlying, expressed in the same unit as the accrued yield. */
  unitValue: DecimalInput;
  seconds: number;
}): Decimal {
  const { indexStart, indexEnd, indexScale, seconds } = params;
  if (indexEnd < indexStart) throw new EngineInputError("index", "index decreased — not a monotonic yield index");
  if (!(seconds > 0)) throw new EngineInputError("seconds", "must be > 0");
  const accrued = new Decimal((indexEnd - indexStart).toString()).dividedBy(indexScale.toString());
  const unit = d(params.unitValue, "unitValue");
  if (!unit.greaterThan(0)) throw new EngineInputError("unitValue", "must be > 0");
  return accrued.dividedBy(unit).times(365 * 86400).dividedBy(seconds);
}
