/**
 * Transparent risk model. Each component is assessed from evidence with
 * documented thresholds. Missing evidence yields "unknown" — never a guessed
 * level — and when too many core components are unknown the overall category
 * is "Insufficient data". These are product assessments, not ratings, and the
 * model never labels anything "safe".
 */

export type RiskLevel = "lower" | "moderate" | "elevated" | "high" | "unknown" | "n/a";

export type RiskCategory =
  | "Lower modeled risk"
  | "Moderate modeled risk"
  | "Elevated modeled risk"
  | "High modeled risk"
  | "Insufficient data";

export const RISK_ORDER: Record<Exclude<RiskLevel, "unknown" | "n/a">, number> = {
  lower: 0,
  moderate: 1,
  elevated: 2,
  high: 3,
};

export interface EvidenceLink {
  label: string;
  url: string;
}

export interface RiskEvidence {
  audits: { status: "audited" | "unaudited" | "unknown"; links: EvidenceLink[] };
  /** Days since the protocol/contract went live, if known. */
  ageDays: number | null;
  dependencies: { items: string[]; level: "few" | "several" | "many" } | null;
  /** Liquidity available to absorb exits, USD (pool reserves or TVL). */
  liquidityUsd: number | null;
  /** Days before funds can be withdrawn. 0 = instant. null = unknown. */
  lockDays: number | null;
  /** Standard deviation of the advertised APY in percentage points (history). */
  apyVolatilityPts: number | null;
  /** Share of the advertised yield that comes from incentive tokens (0..1). */
  incentiveShare: number | null;
  /** Largest holder share of the position token or pool (0..1). */
  topHolderShare: number | null;
  leverage: { ratio: number; healthFactor: number | null } | null;
  /** True when the strategy carries collateral liquidation risk. */
  liquidationExposure: boolean;
  dataFreshness: "fresh" | "aging" | "stale" | "unknown";
  confidence: "Verified" | "Partial" | "Demo";
  incidents: { status: "none_found" | "reported" | "unknown"; links: EvidenceLink[] };
  /** Evidence date for the assessment (ISO). */
  assessedAt: string;
}

export interface RiskComponent {
  id:
    | "contract"
    | "dependencies"
    | "liquidity"
    | "withdrawal"
    | "volatility"
    | "incentives"
    | "concentration"
    | "liquidation"
    | "leverage"
    | "data"
    | "incidents";
  label: string;
  level: RiskLevel;
  rationale: string;
  core: boolean;
}

export interface RiskProfile {
  category: RiskCategory;
  components: RiskComponent[];
  missing: string[];
  assessedAt: string;
  rule: string;
}

export const RISK_THRESHOLDS = {
  liquidityUsd: { lower: 10_000_000, moderate: 1_000_000, elevated: 100_000 },
  lockDays: { lower: 0, moderate: 7, elevated: 30 },
  apyVolatilityPts: { lower: 1, moderate: 3, elevated: 10 },
  incentiveShare: { lower: 0.2, moderate: 0.5, elevated: 0.8 },
  topHolderShare: { lower: 0.1, moderate: 0.25, elevated: 0.5 },
  healthFactor: { lower: 2, moderate: 1.5, elevated: 1.2 },
  ageDays: { lower: 730, moderate: 365, elevated: 90 },
} as const;

/** Minimum number of core components that must be known for an overall category. */
export const MIN_KNOWN_CORE = 4;

function byUpperBound(value: number, t: { lower: number; moderate: number; elevated: number }): RiskLevel {
  if (value <= t.lower) return "lower";
  if (value <= t.moderate) return "moderate";
  if (value <= t.elevated) return "elevated";
  return "high";
}

function byLowerBound(value: number, t: { lower: number; moderate: number; elevated: number }): RiskLevel {
  if (value >= t.lower) return "lower";
  if (value >= t.moderate) return "moderate";
  if (value >= t.elevated) return "elevated";
  return "high";
}

const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function assessRisk(e: RiskEvidence): RiskProfile {
  const c: RiskComponent[] = [];
  const T = RISK_THRESHOLDS;

  // Smart-contract maturity & audits
  {
    let level: RiskLevel = "unknown";
    let rationale = "No audit or deployment-age evidence found.";
    if (e.audits.status === "unaudited") {
      level = "high";
      rationale = "No public audit found for these contracts.";
    } else if (e.audits.status === "audited") {
      const ageLevel = e.ageDays === null ? "moderate" : byLowerBound(e.ageDays, T.ageDays);
      // An audit lowers risk but never below "moderate" for contracts younger than two years.
      level = ageLevel === "lower" ? "lower" : ageLevel === "high" ? "elevated" : ageLevel;
      rationale = `${e.audits.links.length} public audit report(s)${e.ageDays !== null ? `; live for ~${Math.round(e.ageDays)} days` : "; deployment age unknown"}.`;
    } else if (e.ageDays !== null) {
      level = "elevated";
      rationale = `Audit status unknown; live for ~${Math.round(e.ageDays)} days.`;
    }
    c.push({ id: "contract", label: "Smart-contract maturity & audits", level, rationale, core: true });
  }

  // Protocol & oracle dependencies
  {
    const level: RiskLevel = !e.dependencies ? "unknown" : e.dependencies.level === "few" ? "lower" : e.dependencies.level === "several" ? "moderate" : "elevated";
    const rationale = e.dependencies ? `Depends on: ${e.dependencies.items.join(", ")}.` : "Dependencies not documented.";
    c.push({ id: "dependencies", label: "Protocol & oracle dependencies", level, rationale, core: false });
  }

  // Liquidity depth
  {
    const level = e.liquidityUsd === null ? "unknown" : byLowerBound(e.liquidityUsd, T.liquidityUsd);
    const rationale = e.liquidityUsd === null ? "Available liquidity could not be verified." : `${fmtUsd(e.liquidityUsd)} of liquidity/TVL backing exits.`;
    c.push({ id: "liquidity", label: "Liquidity depth", level, rationale, core: true });
  }

  // Withdrawal restrictions
  {
    const level = e.lockDays === null ? "unknown" : byUpperBound(e.lockDays, T.lockDays);
    const rationale = e.lockDays === null ? "Withdrawal terms not verified." : e.lockDays === 0 ? "Withdrawable without a lock-up." : `Funds locked for up to ${e.lockDays} days.`;
    c.push({ id: "withdrawal", label: "Withdrawal restrictions", level, rationale, core: true });
  }

  // Historical volatility of the yield
  {
    const level = e.apyVolatilityPts === null ? "unknown" : byUpperBound(e.apyVolatilityPts, T.apyVolatilityPts);
    const rationale = e.apyVolatilityPts === null ? "Not enough history to measure yield volatility." : `Advertised yield varied by ±${e.apyVolatilityPts.toFixed(2)} pts (1σ).`;
    c.push({ id: "volatility", label: "Historical yield volatility", level, rationale, core: true });
  }

  // Incentive dependence
  {
    const level = e.incentiveShare === null ? "unknown" : byUpperBound(e.incentiveShare, T.incentiveShare);
    const rationale = e.incentiveShare === null ? "Base vs incentive split unknown." : `${Math.round(e.incentiveShare * 100)}% of the advertised yield comes from incentive tokens.`;
    c.push({ id: "incentives", label: "Incentive dependence", level, rationale, core: true });
  }

  // Token / holder concentration
  {
    const level = e.topHolderShare === null ? "unknown" : byUpperBound(e.topHolderShare, T.topHolderShare);
    const rationale = e.topHolderShare === null ? "Holder concentration not measured." : `Largest holder controls ${Math.round(e.topHolderShare * 100)}%.`;
    c.push({ id: "concentration", label: "Token concentration", level, rationale, core: false });
  }

  // Liquidation & leverage
  if (e.leverage) {
    const hf = e.leverage.healthFactor;
    const level = hf === null ? "unknown" : byLowerBound(hf, T.healthFactor);
    c.push({
      id: "liquidation",
      label: "Borrowing & liquidation",
      level: e.liquidationExposure ? level : "n/a",
      rationale: hf === null ? "Health factor unknown." : `Health factor ${hf.toFixed(2)} under the configured position.`,
      core: false,
    });
    const lr = e.leverage.ratio;
    c.push({
      id: "leverage",
      label: "Leverage",
      level: lr <= 1.05 ? "lower" : lr <= 1.5 ? "moderate" : lr <= 2.5 ? "elevated" : "high",
      rationale: `${lr.toFixed(2)}× gross exposure on equity — amplifies gains and losses.`,
      core: false,
    });
  } else {
    c.push({ id: "liquidation", label: "Borrowing & liquidation", level: "n/a", rationale: "No borrowing involved.", core: false });
    c.push({ id: "leverage", label: "Leverage", level: "n/a", rationale: "Unleveraged.", core: false });
  }

  // Data quality & freshness
  {
    let level: RiskLevel;
    if (e.confidence === "Demo") level = "unknown";
    else if (e.dataFreshness === "stale" || e.dataFreshness === "unknown") level = "elevated";
    else if (e.confidence === "Partial") level = "moderate";
    else level = e.dataFreshness === "fresh" ? "lower" : "moderate";
    const rationale = `Confidence: ${e.confidence}; data ${e.dataFreshness}.`;
    c.push({ id: "data", label: "Data quality & freshness", level, rationale, core: true });
  }

  // Incidents
  {
    const level: RiskLevel = e.incidents.status === "reported" ? "high" : "unknown";
    const rationale =
      e.incidents.status === "reported"
        ? "Verified incident(s) on record."
        : e.incidents.status === "none_found"
          ? "No verified incidents found — absence of evidence is not evidence of safety."
          : "Incident history not reviewed.";
    c.push({ id: "incidents", label: "Protocol incidents", level, rationale, core: false });
  }

  const core = c.filter((x) => x.core);
  const knownCore = core.filter((x) => x.level !== "unknown" && x.level !== "n/a");
  const missing = c.filter((x) => x.level === "unknown").map((x) => x.label);
  const rule = `Overall = most severe known component; "Insufficient data" when fewer than ${MIN_KNOWN_CORE} of ${core.length} core components are known. Unaudited/unknown-audit protocols are never rated below Elevated.`;

  if (knownCore.length < MIN_KNOWN_CORE) {
    return { category: "Insufficient data", components: c, missing, assessedAt: e.assessedAt, rule };
  }

  let worst = 0;
  for (const x of c) {
    if (x.level === "unknown" || x.level === "n/a") continue;
    worst = Math.max(worst, RISK_ORDER[x.level]);
  }
  if (e.audits.status !== "audited") worst = Math.max(worst, RISK_ORDER.elevated);

  const category: RiskCategory = (["Lower modeled risk", "Moderate modeled risk", "Elevated modeled risk", "High modeled risk"] as const)[worst]!;
  return { category, components: c, missing, assessedAt: e.assessedAt, rule };
}

export function riskRank(category: RiskCategory): number {
  switch (category) {
    case "Lower modeled risk":
      return 0;
    case "Moderate modeled risk":
      return 1;
    case "Elevated modeled risk":
      return 2;
    case "High modeled risk":
      return 3;
    default:
      return 4; // Insufficient data sorts last
  }
}
