/**
 * Shared metric vocabulary. A metric value of `null` means UNAVAILABLE — it is
 * never coerced to zero anywhere in the app.
 */

export type SourceType = "on-chain" | "API" | "modeled" | "documentation" | "demo";
export type DataKind = "live" | "demo";
export type Confidence = "Verified" | "Partial" | "Demo";
export type MetricStatus = "ok" | "unavailable" | "not_verified";

export interface SourceRef {
  id: string;
  name: string;
  type: SourceType;
  url?: string;
}

export interface Metric<T = number> {
  value: T | null;
  status: MetricStatus;
  source: SourceRef | null;
  /** When the upstream source observed / published the value (ISO). */
  observedAt: string | null;
  /** When YieldProof fetched it (ISO). */
  fetchedAt: string | null;
  note?: string;
}

export function metric<T>(
  value: T | null | undefined,
  source: SourceRef | null,
  opts: { observedAt?: string | null; fetchedAt?: string | null; note?: string; status?: MetricStatus } = {},
): Metric<T> {
  const v = value === undefined ? null : value;
  return {
    value: v,
    status: opts.status ?? (v === null ? "unavailable" : "ok"),
    source,
    observedAt: opts.observedAt ?? null,
    fetchedAt: opts.fetchedAt ?? null,
    note: opts.note,
  };
}

export function unavailable<T = number>(note: string, source: SourceRef | null = null): Metric<T> {
  return { value: null, status: "unavailable", source, observedAt: null, fetchedAt: null, note };
}

export function notVerified<T = number>(note: string, source: SourceRef | null = null): Metric<T> {
  return { value: null, status: "not_verified", source, observedAt: null, fetchedAt: null, note };
}

export function hasValue<T>(m: Metric<T> | null | undefined): m is Metric<T> & { value: T } {
  return !!m && m.value !== null && m.status === "ok";
}
