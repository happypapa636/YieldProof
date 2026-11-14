import { Decimal, EngineInputError } from "./decimal";

/**
 * Token-amount handling. Token amounts are ALWAYS bigint base units inside the
 * app; conversion to human decimals happens only here, with explicit decimals.
 */

export function assertDecimals(decimals: number, field = "decimals"): number {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new EngineInputError(field, `invalid token decimals ${decimals} (expected integer 0–36)`);
  }
  return decimals;
}

/** Convert an on-chain `10 ** decimals` scale (as Aerodrome-style pools report it) into a decimals count. */
export function scaleToDecimals(scale: bigint): number {
  if (scale <= 0n) throw new EngineInputError("scale", "must be positive");
  const s = scale.toString();
  if (!/^10*$/.test(s)) throw new EngineInputError("scale", `not a power of ten (${s})`);
  return assertDecimals(s.length - 1, "scale");
}

/** bigint base units → exact Decimal in whole-token units. */
export function fromBaseUnits(amount: bigint, decimals: number): Decimal {
  assertDecimals(decimals);
  return new Decimal(amount.toString()).dividedBy(new Decimal(10).pow(decimals));
}

/**
 * Human decimal string → bigint base units. Rejects more fractional digits than
 * the token supports instead of silently truncating (silent truncation hides value).
 */
export function toBaseUnits(value: string, decimals: number): bigint {
  assertDecimals(decimals);
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new EngineInputError("amount", `"${value}" is not a non-negative decimal number`);
  const [whole, frac = ""] = trimmed.split(".") as [string, string?];
  if ((frac ?? "").length > decimals) {
    throw new EngineInputError("amount", `more than ${decimals} decimal places for this token`);
  }
  const padded = (frac ?? "").padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + (padded ? BigInt(padded) : 0n);
}

/** Format bigint base units for display without float conversion. */
export function formatBaseUnits(amount: bigint, decimals: number, maxFractionDigits = 4): string {
  assertDecimals(decimals);
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  let fracStr = decimals > 0 ? frac.toString().padStart(decimals, "0").slice(0, maxFractionDigits) : "";
  fracStr = fracStr.replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${wholeStr}${fracStr ? "." + fracStr : ""}`;
}

/** Normalise an amount between two decimal scales exactly (floor when scaling down). */
export function rescale(amount: bigint, fromDecimals: number, toDecimals: number): bigint {
  assertDecimals(fromDecimals);
  assertDecimals(toDecimals);
  if (toDecimals === fromDecimals) return amount;
  if (toDecimals > fromDecimals) return amount * 10n ** BigInt(toDecimals - fromDecimals);
  return amount / 10n ** BigInt(fromDecimals - toDecimals);
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export function isAddressLike(value: string): boolean {
  return ADDRESS_RE.test(value);
}
