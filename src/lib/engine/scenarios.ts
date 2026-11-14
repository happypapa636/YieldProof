import { Decimal } from "./decimal";
import { calculateNetReturn, NetReturnInput, NetReturnResult } from "./returns";

/**
 * Hypothetical sensitivity tests — explicitly NOT price or rate forecasts.
 */

export const INCENTIVE_PRICE_SCENARIOS = [
  { id: "current", label: "Current reference price", factor: "1" },
  { id: "minus25", label: "Incentive token −25%", factor: "0.75" },
  { id: "minus50", label: "Incentive token −50%", factor: "0.5" },
  { id: "zero", label: "Incentives worth nothing", factor: "0" },
] as const;
export type IncentiveScenarioId = (typeof INCENTIVE_PRICE_SCENARIOS)[number]["id"];

export const RATE_CHANGE_SCENARIOS = [
  { id: "down50", label: "Rates fall 50%", change: "-0.5" },
  { id: "down25", label: "Rates fall 25%", change: "-0.25" },
  { id: "flat", label: "Rates unchanged", change: "0" },
  { id: "up25", label: "Rates rise 25%", change: "0.25" },
] as const;
export type RateScenarioId = (typeof RATE_CHANGE_SCENARIOS)[number]["id"];

export interface ScenarioRow {
  id: string;
  label: string;
  result: NetReturnResult;
}

export function incentiveSensitivity(input: Omit<NetReturnInput, "incentivePriceFactor">): ScenarioRow[] {
  return INCENTIVE_PRICE_SCENARIOS.map((s) => ({
    id: s.id,
    label: s.label,
    result: calculateNetReturn({ ...input, incentivePriceFactor: s.factor }),
  }));
}

export function rateChangeSensitivity(input: Omit<NetReturnInput, "rateChangePct">): ScenarioRow[] {
  return RATE_CHANGE_SCENARIOS.map((s) => ({
    id: s.id,
    label: s.label,
    result: calculateNetReturn({ ...input, rateChangePct: s.change }),
  }));
}

/**
 * The share of gross earnings that comes from incentives. High dependence means
 * the result is fragile to incentive-token price moves or emission cuts.
 */
export function incentiveDependence(result: NetReturnResult): Decimal | null {
  if (result.grossEarnings === null || result.incentiveEarnings === null) return null;
  if (result.grossEarnings.isZero()) return null;
  return result.incentiveEarnings.dividedBy(result.grossEarnings);
}

export function incentiveFactorFor(id: IncentiveScenarioId): string {
  return INCENTIVE_PRICE_SCENARIOS.find((s) => s.id === id)?.factor ?? "1";
}

export function rateChangeFor(id: RateScenarioId): string {
  return RATE_CHANGE_SCENARIOS.find((s) => s.id === id)?.change ?? "0";
}
