import { assessConfidence } from "@/lib/engine/confidence";
import { assessRisk, RiskEvidence } from "@/lib/engine/risk";
import { metric, SourceRef } from "@/lib/engine/types";
import type { Opportunity, RateMetric } from "@/lib/model/types";

/**
 * FICTIONAL demo dataset (spec §22). None of these protocols, tokens or rates
 * exist. They are deliberately shaped to demonstrate one insight: the highest
 * advertised APY is not the highest estimated net return once costs, borrowing,
 * impermanent loss and incentive-price risk are counted.
 *
 * These objects are tagged `dataKind: "demo"` and are never merged into live
 * analytics (enforced by `assertLiveOnly` and covered by tests).
 */

export const DEMO_SOURCE: SourceRef = { id: "demo", name: "YieldProof synthetic demo dataset (fictional)", type: "demo" };
const AS_OF = "2026-01-01T00:00:00.000Z";

const rate = (value: number | null, basis: "APR" | "APY" = "APR", note?: string): RateMetric => ({
  ...metric(value, DEMO_SOURCE, { observedAt: AS_OF, fetchedAt: AS_OF, note }),
  basis,
});
const num = (value: number | null, note?: string) => metric(value, DEMO_SOURCE, { observedAt: AS_OF, fetchedAt: AS_OF, note });

function demoRisk(partial: Partial<RiskEvidence>): RiskEvidence {
  return {
    audits: { status: "audited", links: [] },
    ageDays: null,
    dependencies: null,
    liquidityUsd: null,
    lockDays: 0,
    apyVolatilityPts: null,
    incentiveShare: null,
    topHolderShare: null,
    leverage: null,
    liquidationExposure: false,
    dataFreshness: "fresh",
    confidence: "Demo",
    incidents: { status: "unknown", links: [] },
    assessedAt: AS_OF,
    ...partial,
  };
}

function build(o: Omit<Opportunity, "risk" | "confidence" | "freshness" | "dataKind" | "network" | "chainId" | "sources" | "lastUpdated" | "discrepancies" | "defillamaPoolId" | "poolAddress" | "explorerUrl">): Opportunity {
  return {
    ...o,
    dataKind: "demo",
    network: "Fictional",
    chainId: null,
    risk: assessRisk(o.riskEvidence),
    confidence: assessConfidence({ dataKind: "demo", crossCheckedOnChain: false, primaryOnChain: false, missingCritical: [], freshness: "fresh" }),
    freshness: "fresh",
    lastUpdated: AS_OF,
    sources: [DEMO_SOURCE],
    discrepancies: [],
    defillamaPoolId: null,
    poolAddress: null,
    explorerUrl: null,
  };
}

const noFees = { depositFeePct: 0, withdrawalFeePct: 0, performanceFeePct: 0, includedInQuotedRate: true, note: "Fictional: no protocol fees." };

export const DEMO_STRATEGIES: Opportunity[] = [
  build({
    id: "demo-harbor-lending",
    name: "Harbor Lending · MUSD supply",
    protocol: { name: "Harbor (fictional)", url: "#" },
    depositAsset: "MUSD",
    strategyType: "lending",
    musdUseCase: "lending",
    tags: { musd: true, stablecoin: true, leveraged: false, lp: false, lending: true },
    summary: "Supply a stablecoin to an over-collateralised lending market and earn borrower interest. Low headline, few moving parts.",
    advertised: rate(0.051, "APY", "Fictional quote, daily compounding basis."),
    base: rate(0.051, "APY", "Fictional variable supply rate."),
    incentive: rate(0, "APR", "No incentive programme."),
    incentiveToken: null,
    tvlUsd: num(240_000_000),
    availableLiquidityUsd: num(38_000_000),
    economics: {
      compoundingSupported: true,
      compoundingNote: "Interest accrues into the supply balance automatically.",
      incentiveScheduleChangePct: null,
      entryCostMusd: num(2, "Fictional gas: 2 tx."),
      exitCostMusd: num(2, "Fictional gas: 2 tx."),
      reinvestCostMusd: num(0, "Auto-compounding: no claim needed."),
      protocolFees: { ...noFees, note: "Reserve factor already netted out of the supply rate." },
      lockDays: 0,
      withdrawalNote: "Withdraw any time while utilisation is below 100%.",
      ilModel: "none",
      entrySlippagePct: num(0),
      exitSlippagePct: num(0.0005, "Fictional: withdrawal queue rarely binds."),
      musdRoute: null,
      borrow: null,
    },
    explainer: {
      howReturnIsGenerated: "Borrowers pay interest on loans; suppliers receive it pro-rata.",
      assetsToSupply: "MUSD",
      variableReturns: "Yes — the rate floats with utilisation.",
      incentivesIncluded: "No.",
      borrowingOrLeverage: "No.",
      withdrawal: "Immediate unless the market is fully utilised.",
      lossCauses: ["Bad debt after a sharp collateral crash", "Smart-contract failure"],
      unavailableData: [],
    },
    riskEvidence: demoRisk({ liquidityUsd: 38_000_000, apyVolatilityPts: 0.8, incentiveShare: 0, ageDays: 900, dependencies: { items: ["price oracle"], level: "few" } }),
    missing: [],
  }),
  build({
    id: "demo-comet-farm",
    name: "Comet Farm · MUSD + COMET emissions",
    protocol: { name: "Comet (fictional)", url: "#" },
    depositAsset: "MUSD",
    strategyType: "vault",
    musdUseCase: "other",
    tags: { musd: true, stablecoin: true, leveraged: false, lp: false, lending: false },
    summary: "A farm that pays most of its headline in its own COMET token. Emissions are scheduled to halve, and rewards must be claimed and sold.",
    advertised: rate(0.24, "APR"),
    base: rate(0.02, "APR", "Fictional base yield from a stablecoin strategy."),
    incentive: rate(0.22, "APR", "Paid in COMET at the current reference price. Emissions halve after ~60 days (modeled as −40% average)."),
    incentiveToken: { symbol: "COMET", priceUsd: num(0.42) },
    tvlUsd: num(9_500_000),
    availableLiquidityUsd: num(2_100_000),
    economics: {
      compoundingSupported: true,
      compoundingNote: "Rewards must be claimed, sold and redeposited (cost per reinvestment applies).",
      incentiveScheduleChangePct: -0.4,
      entryCostMusd: num(8, "Fictional: approve + deposit."),
      exitCostMusd: num(8, "Fictional: withdraw + sell residual rewards."),
      reinvestCostMusd: num(6, "Fictional: claim + swap + redeposit."),
      protocolFees: { depositFeePct: 0.005, withdrawalFeePct: 0, performanceFeePct: 0.1, includedInQuotedRate: false, note: "Fictional: 0.5% deposit fee and 10% performance fee NOT included in the headline." },
      lockDays: 0,
      withdrawalNote: "Withdraw any time.",
      ilModel: "none",
      entrySlippagePct: num(0),
      exitSlippagePct: num(0.004, "Fictional: selling COMET into a thin pool."),
      musdRoute: null,
      borrow: null,
    },
    explainer: {
      howReturnIsGenerated: "A small base yield plus COMET token emissions that must be sold to realise value.",
      assetsToSupply: "MUSD",
      variableReturns: "Yes — emissions decline on a schedule and COMET's price floats.",
      incentivesIncluded: "Yes — 92% of the headline.",
      borrowingOrLeverage: "No.",
      withdrawal: "Immediate.",
      lossCauses: ["COMET price collapse", "Emission cuts", "Fees not shown in headline"],
      unavailableData: [],
    },
    riskEvidence: demoRisk({ liquidityUsd: 2_100_000, apyVolatilityPts: 9, incentiveShare: 0.92, ageDays: 120, dependencies: { items: ["COMET token", "DEX liquidity"], level: "several" } }),
    missing: [],
  }),
  build({
    id: "demo-aurora-lp",
    name: "Aurora LP · BTC/MUSD",
    protocol: { name: "Aurora DEX (fictional)", url: "#" },
    depositAsset: "BTC/MUSD LP",
    strategyType: "liquidity",
    musdUseCase: "liquidity",
    tags: { musd: true, stablecoin: false, leveraged: false, lp: true, lending: false },
    summary: "Provide BTC and MUSD liquidity: earn swap fees and AUR incentives, but carry impermanent loss when BTC moves.",
    advertised: rate(0.14, "APR"),
    base: rate(0.09, "APR", "Fictional swap-fee APR."),
    incentive: rate(0.05, "APR", "Fictional AUR gauge emissions."),
    incentiveToken: { symbol: "AUR", priceUsd: num(1.8) },
    tvlUsd: num(14_000_000),
    availableLiquidityUsd: num(14_000_000),
    economics: {
      compoundingSupported: true,
      compoundingNote: "Fees and rewards must be claimed and re-added manually.",
      incentiveScheduleChangePct: null,
      entryCostMusd: num(5, "Fictional: swap half + add liquidity."),
      exitCostMusd: num(5),
      reinvestCostMusd: num(5),
      protocolFees: { ...noFees, note: "Swap fees accrue to LPs; nothing extra charged." },
      lockDays: 0,
      withdrawalNote: "Remove liquidity any time.",
      ilModel: "volatile-cp",
      entrySlippagePct: num(0.004, "Fictional: swapping half of the deposit."),
      exitSlippagePct: num(0.004),
      musdRoute: null,
      borrow: null,
    },
    explainer: {
      howReturnIsGenerated: "Traders pay a fee on every swap; LPs share it. AUR emissions are added on top.",
      assetsToSupply: "BTC and MUSD in equal value",
      variableReturns: "Yes — fees follow trading volume.",
      incentivesIncluded: "Yes — about a third of the headline.",
      borrowingOrLeverage: "No.",
      withdrawal: "Immediate, but exiting to one asset costs slippage.",
      lossCauses: ["Impermanent loss when BTC moves", "Volume drying up", "AUR price falls"],
      unavailableData: [],
    },
    riskEvidence: demoRisk({ liquidityUsd: 14_000_000, apyVolatilityPts: 4, incentiveShare: 0.36, ageDays: 400, dependencies: { items: ["AMM"], level: "few" } }),
    missing: [],
  }),
  build({
    id: "demo-lever-loop",
    name: "Lever Loop · 3× looped yield",
    protocol: { name: "LeverLoop (fictional)", url: "#" },
    depositAsset: "MUSD",
    strategyType: "leveraged",
    musdUseCase: "borrowing",
    tags: { musd: true, stablecoin: false, leveraged: true, lp: false, lending: false },
    summary: "Deposits capital, borrows twice as much against it and redeploys — advertising the gross yield on 3× exposure.",
    advertised: rate(0.315, "APR", "Headline = 3 × 10.5% strategy yield, before borrowing costs."),
    base: rate(0.105, "APR", "Fictional yield on the looped collateral."),
    incentive: rate(0, "APR", "No incentive programme."),
    incentiveToken: null,
    tvlUsd: num(31_000_000),
    availableLiquidityUsd: num(4_000_000),
    economics: {
      compoundingSupported: false,
      compoundingNote: "Rebalancing the loop each period is too costly to assume compounding.",
      incentiveScheduleChangePct: null,
      entryCostMusd: num(27, "Fictional: 3 loop transactions."),
      exitCostMusd: num(27, "Fictional: 3 unwind transactions."),
      reinvestCostMusd: num(27),
      protocolFees: { ...noFees, note: "No vault fee; borrowing costs are modeled separately." },
      lockDays: 0,
      withdrawalNote: "Unwinding needs enough market liquidity to repay the loan.",
      ilModel: "none",
      entrySlippagePct: num(0),
      exitSlippagePct: num(0.005, "Fictional: unwinding 3× size through the market."),
      musdRoute: null,
      borrow: {
        asset: "MUSD",
        apr: rate(0.095, "APR", "Fictional variable borrow rate."),
        oneTimeFeePct: num(0.005),
        gasCompensation: num(0),
        mcr: num(1.25, "Fictional liquidation threshold 80% (= 125% collateral ratio)."),
        ccr: num(1.5),
        minNetDebt: num(0),
        defaultLtv: 2,
      },
    },
    explainer: {
      howReturnIsGenerated: "Earns a yield on 3× the capital and pays interest on the borrowed 2×.",
      assetsToSupply: "MUSD",
      variableReturns: "Yes — both the strategy yield and the borrow rate float.",
      incentivesIncluded: "No.",
      borrowingOrLeverage: "Yes — 3× gross exposure.",
      withdrawal: "Requires unwinding the loan.",
      lossCauses: ["Borrow rate rising above strategy yield", "Liquidation if collateral value drops ~17%", "Exit slippage at 3× size"],
      unavailableData: [],
    },
    riskEvidence: demoRisk({ liquidityUsd: 4_000_000, apyVolatilityPts: 6, incentiveShare: 0, ageDays: 200, leverage: { ratio: 3, healthFactor: 1.19 }, liquidationExposure: true, dependencies: { items: ["lending market", "oracle", "DEX"], level: "many" } }),
    missing: [],
  }),
];

export function getDemoStrategies(): Opportunity[] {
  return DEMO_STRATEGIES;
}
