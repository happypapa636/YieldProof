import type { ConfidenceResult, Freshness } from "@/lib/engine/confidence";
import type { DiscrepancyResult } from "@/lib/engine/discrepancy";
import type { RateBasis } from "@/lib/engine/rates";
import type { RiskEvidence, RiskProfile } from "@/lib/engine/risk";
import type { DataKind, Metric, SourceRef } from "@/lib/engine/types";

export type StrategyType = "vault" | "lock" | "staking" | "liquidity" | "leveraged" | "stability" | "lending";

export const STRATEGY_TYPE_LABEL: Record<StrategyType, string> = {
  vault: "Savings vault",
  lock: "Vote-escrow lock",
  staking: "Liquid staking / relay",
  liquidity: "Liquidity provision",
  leveraged: "Leveraged",
  stability: "Stability pool",
  lending: "Lending",
};

export type MusdUseCase = "lending" | "liquidity" | "borrowing" | "stablecoin" | "other";

export interface RateMetric extends Metric<number> {
  /** Fraction (0.05 = 5%). */
  basis: RateBasis;
  /** Compounding assumed by the quote, for APY → APR conversion. */
  compoundsPerYear?: number;
}

export interface ExitRoute {
  /** Pool id in the live pool registry used to convert in/out of the deposit asset. */
  poolId: string;
  label: string;
  /** Which side of the pool the deposit asset is on. */
  depositAssetIsToken0: boolean;
}

export interface Economics {
  compoundingSupported: boolean;
  compoundingNote: string;
  /** Known/announced change in the incentive emission rate over the horizon (−0.4 = 40% lower on average). */
  incentiveScheduleChangePct: number | null;
  /** Modeled cost of one entry (approve + deposit), MUSD. */
  entryCostMusd: Metric<number>;
  exitCostMusd: Metric<number>;
  reinvestCostMusd: Metric<number>;
  protocolFees: {
    depositFeePct: number;
    withdrawalFeePct: number;
    performanceFeePct: number;
    includedInQuotedRate: boolean;
    note: string;
  };
  /** Days before funds can be withdrawn. 0 = instant, null = unknown. */
  lockDays: number | null;
  withdrawalNote: string;
  /** "volatile-cp" = 50/50 constant-product LP with IL exposure. */
  ilModel: "none" | "volatile-cp" | "stable-pair";
  /** Entry/exit slippage for LP or swap legs, as a fraction at the reference size (null = unknown). */
  entrySlippagePct: Metric<number>;
  exitSlippagePct: Metric<number>;
  /** Convert from MUSD into the deposit asset (if the deposit asset is not MUSD). */
  musdRoute: ExitRoute | null;
  /** Leveraged strategies: borrowing leg. */
  borrow: null | {
    asset: string;
    apr: RateMetric;
    oneTimeFeePct: Metric<number>;
    gasCompensation: Metric<number>;
    mcr: Metric<number>;
    ccr: Metric<number>;
    minNetDebt: Metric<number>;
    /** Default borrow as a fraction of collateral value. */
    defaultLtv: number;
  };
}

export interface Explainer {
  howReturnIsGenerated: string;
  assetsToSupply: string;
  variableReturns: string;
  incentivesIncluded: string;
  borrowingOrLeverage: string;
  withdrawal: string;
  lossCauses: string[];
  unavailableData: string[];
}

export interface Opportunity {
  id: string;
  dataKind: DataKind;
  name: string;
  protocol: { name: string; url: string };
  network: "Mezo Mainnet" | "Mezo Testnet" | "Fictional";
  chainId: number | null;
  depositAsset: string;
  strategyType: StrategyType;
  musdUseCase: MusdUseCase | null;
  tags: { musd: boolean; stablecoin: boolean; leveraged: boolean; lp: boolean; lending: boolean };
  summary: string;
  advertised: RateMetric;
  base: RateMetric;
  incentive: RateMetric;
  incentiveToken: { symbol: string; address?: string; priceUsd: Metric<number> } | null;
  tvlUsd: Metric<number>;
  availableLiquidityUsd: Metric<number>;
  economics: Economics;
  explainer: Explainer;
  riskEvidence: RiskEvidence;
  risk: RiskProfile;
  confidence: ConfidenceResult;
  freshness: Freshness;
  lastUpdated: string | null;
  sources: SourceRef[];
  missing: string[];
  discrepancies: Discrepancy[];
  defillamaPoolId: string | null;
  poolAddress: string | null;
  explorerUrl: string | null;
}

/** JSON-safe discrepancy record (Decimals converted to numbers at the boundary). */
export interface Discrepancy {
  id: string;
  label: string;
  unit: "rate" | "usd" | "price" | "text";
  explanation: string;
  status: DiscrepancyResult["status"];
  flagged: boolean;
  primarySourceId: string;
  values: { sourceId: string; label: string; value: number; observedAt?: string | null }[];
  missing: string[];
  maxRelativeDiff: number | null;
  maxAbsoluteDiff: number | null;
}

export function serializeDiscrepancy(id: string, label: string, unit: Discrepancy["unit"], explanation: string, r: DiscrepancyResult): Discrepancy {
  return {
    id,
    label,
    unit,
    explanation,
    status: r.status,
    flagged: r.flagged,
    primarySourceId: r.primarySourceId,
    values: r.values.map((v) => ({ sourceId: v.sourceId, label: v.label, value: v.value.toNumber(), observedAt: v.observedAt ?? null })),
    missing: r.missing,
    maxRelativeDiff: r.maxRelativeDiff ? r.maxRelativeDiff.toNumber() : null,
    maxAbsoluteDiff: r.maxAbsoluteDiff ? r.maxAbsoluteDiff.toNumber() : null,
  };
}
