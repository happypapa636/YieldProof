import { d, Decimal, DecimalInput } from "./decimal";

/**
 * Summary statistics that refuse to mislead: below `minSamples` they return
 * null (rendered as "Not enough comparable data") instead of a number.
 */

export const MIN_SUMMARY_SAMPLES = 3;

export function median(values: (DecimalInput | null | undefined)[], minSamples = MIN_SUMMARY_SAMPLES): Decimal | null {
  const xs = values.filter((v): v is DecimalInput => v !== null && v !== undefined).map((v) => d(v));
  if (xs.length < minSamples || xs.length === 0) return null;
  xs.sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(xs.length / 2);
  if (xs.length % 2 === 1) return xs[mid]!;
  return xs[mid - 1]!.plus(xs[mid]!).dividedBy(2);
}

export function mean(values: DecimalInput[]): Decimal | null {
  if (values.length === 0) return null;
  return values.map((v) => d(v)).reduce((a, b) => a.plus(b), new Decimal(0)).dividedBy(values.length);
}

/** Sample standard deviation (n − 1). Null with fewer than 2 points. */
export function stdev(values: DecimalInput[]): Decimal | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  const ss = values.map((v) => d(v).minus(m).pow(2)).reduce((a, b) => a.plus(b), new Decimal(0));
  return ss.dividedBy(values.length - 1).sqrt();
}
