import DecimalBase from "decimal.js";

/**
 * Engine-wide decimal type. 40 significant digits, banker's rounding.
 * Every financial calculation in YieldProof goes through this clone so that
 * no JS float arithmetic touches money. Floats only appear at the UI edge
 * (chart coordinates, formatted labels).
 */
export const Decimal = DecimalBase.clone({
  precision: 40,
  rounding: DecimalBase.ROUND_HALF_EVEN,
  toExpNeg: -30,
  toExpPos: 40,
});
export type Decimal = InstanceType<typeof Decimal>;
export type DecimalInput = Decimal | string | number | bigint;

export class EngineInputError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(`${field}: ${message}`);
    this.name = "EngineInputError";
  }
}

/** Convert any supported input into an engine Decimal. Rejects NaN / Infinity. */
export function d(value: DecimalInput, field = "value"): Decimal {
  let out: Decimal;
  try {
    out = typeof value === "bigint" ? new Decimal(value.toString()) : new Decimal(value as string | number | Decimal);
  } catch {
    throw new EngineInputError(field, `not a number (${String(value)})`);
  }
  if (!out.isFinite()) throw new EngineInputError(field, "must be finite");
  return out;
}

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);
export const DAYS_PER_YEAR = new Decimal(365);

export function assertNonNegative(x: Decimal, field: string): Decimal {
  if (x.isNegative()) throw new EngineInputError(field, "must be ≥ 0");
  return x;
}

export function assertPositive(x: Decimal, field: string): Decimal {
  if (!x.greaterThan(0)) throw new EngineInputError(field, "must be > 0");
  return x;
}

/** A fraction in [0, 1) — used for fees, slippage, haircuts. */
export function assertFraction(x: Decimal, field: string, { allowOne = false } = {}): Decimal {
  if (x.isNegative() || (allowOne ? x.greaterThan(1) : x.greaterThanOrEqualTo(1))) {
    throw new EngineInputError(field, allowOne ? "must be between 0 and 1" : "must be between 0 and 1 (exclusive)");
  }
  return x;
}

export function maxD(a: Decimal, b: Decimal): Decimal {
  return a.greaterThan(b) ? a : b;
}

export function minD(a: Decimal, b: Decimal): Decimal {
  return a.lessThan(b) ? a : b;
}

/** UI edge only: convert to a JS number for charts/formatting. */
export function toNum(x: Decimal | null | undefined): number | null {
  if (x === null || x === undefined) return null;
  return x.toNumber();
}

/** Round to a fixed number of decimals as a string (for CSV/exports). */
export function fixed(x: Decimal | null | undefined, dp = 2): string {
  if (x === null || x === undefined) return "";
  return x.toDecimalPlaces(dp, Decimal.ROUND_HALF_EVEN).toFixed(dp);
}
