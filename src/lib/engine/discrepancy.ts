import { d, Decimal, DecimalInput } from "./decimal";

/**
 * Source discrepancy detection. When several sources report the same quantity,
 * YieldProof shows all of them, the spread, and which one it uses — it never
 * silently averages or picks the most flattering value.
 */

export interface SourceValue {
  sourceId: string;
  label: string;
  value: DecimalInput | null;
  observedAt?: string | null;
}

export interface DiscrepancyResult {
  /** Values that were actually available. */
  values: { sourceId: string; label: string; value: Decimal; observedAt?: string | null }[];
  missing: string[];
  primarySourceId: string;
  primaryValue: Decimal | null;
  /** max |v − primary| / |primary| */
  maxRelativeDiff: Decimal | null;
  /** max |v − primary| in absolute units (useful for rates in percentage points) */
  maxAbsoluteDiff: Decimal | null;
  flagged: boolean;
  status: "agree" | "disagree" | "single_source" | "no_data";
}

export function compareSources(
  inputs: SourceValue[],
  opts: { primarySourceId: string; relTolerance?: DecimalInput; absTolerance?: DecimalInput },
): DiscrepancyResult {
  const values = inputs
    .filter((i) => i.value !== null && i.value !== undefined)
    .map((i) => ({ sourceId: i.sourceId, label: i.label, value: d(i.value as DecimalInput), observedAt: i.observedAt }));
  const missing = inputs.filter((i) => i.value === null || i.value === undefined).map((i) => i.label);
  const primary = values.find((v) => v.sourceId === opts.primarySourceId) ?? null;
  if (values.length === 0) {
    return { values, missing, primarySourceId: opts.primarySourceId, primaryValue: null, maxRelativeDiff: null, maxAbsoluteDiff: null, flagged: false, status: "no_data" };
  }
  if (!primary || values.length === 1) {
    return {
      values,
      missing,
      primarySourceId: opts.primarySourceId,
      primaryValue: primary?.value ?? null,
      maxRelativeDiff: null,
      maxAbsoluteDiff: null,
      flagged: false,
      status: "single_source",
    };
  }
  let maxAbs = new Decimal(0);
  for (const v of values) {
    const diff = v.value.minus(primary.value).abs();
    if (diff.greaterThan(maxAbs)) maxAbs = diff;
  }
  const maxRel = primary.value.isZero() ? null : maxAbs.dividedBy(primary.value.abs());
  const relTol = d(opts.relTolerance ?? "0.05");
  const absTol = opts.absTolerance !== undefined ? d(opts.absTolerance) : null;
  // Within tolerance if EITHER the relative or (when given) the absolute tolerance holds.
  const withinRel = maxRel !== null && maxRel.lessThanOrEqualTo(relTol);
  const withinAbs = absTol !== null && maxAbs.lessThanOrEqualTo(absTol);
  const flagged = !(withinRel || withinAbs);
  return {
    values,
    missing,
    primarySourceId: opts.primarySourceId,
    primaryValue: primary.value,
    maxRelativeDiff: maxRel,
    maxAbsoluteDiff: maxAbs,
    flagged,
    status: flagged ? "disagree" : "agree",
  };
}
