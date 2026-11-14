import type { Confidence, DataKind } from "./types";

/**
 * Freshness and confidence labelling.
 *
 *  fresh  : observed within `freshHours`
 *  aging  : between `freshHours` and `staleHours`
 *  stale  : older than `staleHours`  → the metric is shown but flagged, and
 *           opportunities relying on it drop to "Partial"
 *  unknown: no timestamp            → treated like stale (cannot be trusted as current)
 */

export type Freshness = "fresh" | "aging" | "stale" | "unknown";

export interface FreshnessPolicy {
  freshHours: number;
  staleHours: number;
}

export const DEFAULT_FRESHNESS: FreshnessPolicy = { freshHours: 6, staleHours: 30 };

export function ageHours(observedAt: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!observedAt) return null;
  const t = observedAt instanceof Date ? observedAt.getTime() : Date.parse(observedAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (now.getTime() - t) / 3_600_000);
}

export function freshness(
  observedAt: string | Date | null | undefined,
  now: Date = new Date(),
  policy: FreshnessPolicy = DEFAULT_FRESHNESS,
): Freshness {
  if (policy.freshHours <= 0 || policy.staleHours < policy.freshHours) throw new Error("invalid freshness policy");
  const age = ageHours(observedAt, now);
  if (age === null) return "unknown";
  if (age <= policy.freshHours) return "fresh";
  if (age <= policy.staleHours) return "aging";
  return "stale";
}

export interface ConfidenceInput {
  dataKind: DataKind;
  /** The headline rate was independently recomputed from chain state and agrees with the API within tolerance. */
  crossCheckedOnChain: boolean;
  /** The headline values come directly from on-chain reads (not an API). */
  primaryOnChain: boolean;
  /** Names of important fields that are missing. */
  missingCritical: string[];
  freshness: Freshness;
  /** Sources disagree beyond tolerance. */
  unresolvedDiscrepancy?: boolean;
}

export interface ConfidenceResult {
  label: Confidence;
  reasons: string[];
}

export function assessConfidence(input: ConfidenceInput): ConfidenceResult {
  if (input.dataKind === "demo") return { label: "Demo", reasons: ["Synthetic data for demonstration only."] };
  const reasons: string[] = [];
  if (input.missingCritical.length > 0) reasons.push(`Missing: ${input.missingCritical.join(", ")}.`);
  if (input.freshness === "stale") reasons.push("Source data is stale.");
  if (input.freshness === "unknown") reasons.push("Source timestamp unknown.");
  if (input.unresolvedDiscrepancy) reasons.push("Sources disagree beyond tolerance.");
  const verifiedBasis = input.crossCheckedOnChain || input.primaryOnChain;
  if (!verifiedBasis) reasons.push("API-reported; not independently verified on-chain.");
  if (reasons.length === 0) {
    return {
      label: "Verified",
      reasons: [input.primaryOnChain ? "Read directly from Mezo on-chain state." : "API value independently reproduced from on-chain state."],
    };
  }
  return { label: "Partial", reasons };
}
