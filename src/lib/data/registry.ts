import type { EvidenceLink } from "@/lib/engine/risk";
import type { Explainer, MusdUseCase, StrategyType } from "@/lib/model/types";

/**
 * Static, documented facts about each live opportunity (fees, locks, audits,
 * how the return is produced). Every claim links to its source. Market numbers
 * are NOT stored here — they are fetched live.
 */

export const DOCS = {
  audits: { label: "Mezo audits (docs)", url: "https://mezo.org/docs/users/resources/audits/" },
  contracts: { label: "Mezo contracts reference", url: "https://mezo.org/docs/users/resources/contracts-reference" },
  savingsVault: { label: "MUSD Savings Vault (docs)", url: "https://mezo.org/docs/users/mezo-earn/vaults/musd-savings-vault/" },
  vaults: { label: "Mezo Vaults overview (docs)", url: "https://mezo.org/docs/users/mezo-earn/vaults/" },
  vebtc: { label: "veBTC overview (docs)", url: "https://mezo.org/docs/users/mezo-earn/lock/vebtc/" },
  vebtcFaq: { label: "veBTC FAQ (docs)", url: "https://mezo.org/docs/users/mezo-earn/lock/vebtc/faqs-and-resources/" },
  vemezo: { label: "veMEZO overview (docs)", url: "https://mezo.org/docs/users/mezo-earn/lock/vemezo/" },
  poolFees: { label: "Mezo Pools fees (docs)", url: "https://mezo.org/docs/users/mezo-earn/pools/pools-fees/" },
  musdFees: { label: "MUSD fees & costs (docs)", url: "https://mezo.org/docs/users/borrow/fees/" },
  liquidation: { label: "MUSD liquidations & redemptions (docs)", url: "https://mezo.org/docs/users/borrow/liquidation-mechanics/" },
} satisfies Record<string, EvidenceLink>;

export const AUDIT_LINKS = {
  musd: [{ label: "Cantina — MUSD audit (listed on Mezo docs)", url: DOCS.audits.url }],
  earn: [
    { label: "Thesis Defense — Mezo Earn audit (listed on Mezo docs)", url: DOCS.audits.url },
    { label: "Halborn — Mezo Earn audit (listed on Mezo docs)", url: DOCS.audits.url },
  ],
};

/** Contract creation dates read from explorer.mezo.org (creation tx timestamps). */
export const DEPLOYED_AT = {
  sMUSD: "2025-12-02T18:20:46Z",
  veBTC: "2025-12-02T16:29:33Z",
  veMEZO: "2025-12-08T13:49:28Z",
  poolFactory: "2025-05-13T13:10:01Z",
  musdBorrowerOperations: "2025-05-12T16:19:00Z",
} as const;

/** Modeled gas units per action (documented assumptions, priced at the live gas price × oracle BTC price). */
export const GAS_UNITS = {
  vaultEntry: 250_000, // approve + deposit
  vaultExit: 200_000,
  gaugeEntry: 500_000, // vault entry + approve + stake
  gaugeExit: 500_000, // claim + unstake + withdraw
  gaugeReinvest: 550_000, // claim MEZO + swap + deposit + stake
  lockEntry: 450_000, // approve + create lock
  lockExit: 200_000,
  lockClaim: 250_000,
  lpEntry: 500_000, // 2× approve + swap half + add liquidity
  lpExit: 400_000, // remove liquidity + swap
  lpReinvest: 550_000,
  troveOpen: 850_000, // openTrove (~600k observed on testnet) + approve + deposit
  troveClose: 600_000,
} as const;

export interface LiveDefinition {
  id: string;
  name: string;
  protocol: { name: string; url: string };
  depositAsset: string;
  strategyType: StrategyType;
  musdUseCase: MusdUseCase | null;
  tags: { musd: boolean; stablecoin: boolean; leveraged: boolean; lp: boolean; lending: boolean };
  summary: string;
  defillamaPoolId: string | null;
  poolId: string | null;
  contract: string | null;
  network: "Mezo Mainnet" | "Mezo Testnet";
  audits: { status: "audited" | "unaudited" | "unknown"; links: EvidenceLink[]; note: string };
  deployedAt: string | null;
  dependencies: { items: string[]; level: "few" | "several" | "many" };
  lockDays: number | null;
  withdrawalNote: string;
  fees: { depositFeePct: number; withdrawalFeePct: number; performanceFeePct: number; includedInQuotedRate: boolean; note: string };
  compoundingSupported: boolean;
  compoundingNote: string;
  gas: { entry: number; exit: number; reinvest: number };
  ilModel: "none" | "volatile-cp" | "stable-pair";
  /** Incentives verified absent (0), or unknown (null) when the API reports none. */
  incentiveWhenUnreported: 0 | null;
  incentiveToken: { symbol: string; address: string } | null;
  explainer: Explainer;
  evidence: EvidenceLink[];
}

const VAULT_FEES = { depositFeePct: 0, withdrawalFeePct: 0, performanceFeePct: 0, includedInQuotedRate: true, note: "Docs: no withdrawal fee, 0h time-lock; yield is distributed net of the protocol fee split." };

export const LIVE_DEFINITIONS: LiveDefinition[] = [
  {
    id: "mezo-smusd-savings",
    name: "MUSD Savings Vault (sMUSD, unstaked)",
    protocol: { name: "Mezo Vaults", url: "https://mezo.org/earn/vaults" },
    depositAsset: "MUSD",
    strategyType: "vault",
    musdUseCase: "lending",
    tags: { musd: true, stablecoin: true, leveraged: false, lp: false, lending: false },
    summary: "Deposit MUSD, hold sMUSD, and receive a share of MUSD protocol fees (borrow interest, issuance & refinance fees), distributed weekly.",
    defillamaPoolId: "515e257a-3a9c-418b-93fc-acabf4021905",
    poolId: null,
    contract: "0xb4D498029af77680cD1eF828b967f010d06C51CC",
    network: "Mezo Mainnet",
    audits: { status: "audited", links: AUDIT_LINKS.earn.concat(AUDIT_LINKS.musd), note: "Mezo docs: \"Mezo vaults are audited\"; audits page lists Mezo Earn and MUSD reports." },
    deployedAt: DEPLOYED_AT.sMUSD,
    dependencies: { items: ["MUSD protocol fee flow", "MUSD fee splitter (governable)"], level: "few" },
    lockDays: 0,
    withdrawalNote: "No withdrawal fee and a 0h time-lock (docs). Yield accrues to the index weekly — withdrawing mid-week forfeits nothing already distributed.",
    fees: VAULT_FEES,
    compoundingSupported: false,
    compoundingNote: "Claimed yield is MUSD; reinvesting means redepositing. Weekly distribution makes daily compounding unrealistic.",
    gas: { entry: GAS_UNITS.vaultEntry, exit: GAS_UNITS.vaultExit, reinvest: GAS_UNITS.vaultEntry },
    ilModel: "none",
    incentiveWhenUnreported: 0,
    incentiveToken: null,
    explainer: {
      howReturnIsGenerated: "MUSD borrowers pay interest and fees; 50% (governable, until the bootstrap loan is repaid) flows to the Savings Vault and is distributed to unstaked sMUSD weekly.",
      assetsToSupply: "MUSD",
      variableReturns: "Yes — depends on MUSD borrowing activity and the fee split.",
      incentivesIncluded: "No token incentives for unstaked sMUSD.",
      borrowingOrLeverage: "No.",
      withdrawal: "Immediate; no fee, no lock (per docs).",
      lossCauses: ["Smart-contract failure", "Fee split changed by governance", "MUSD de-peg", "Falling MUSD borrow demand"],
      unavailableData: ["Holder concentration", "Strategy liquidity buffer composition"],
    },
    evidence: [DOCS.savingsVault, DOCS.musdFees, DOCS.audits],
  },
  {
    id: "mezo-smusd-gauge",
    name: "sMUSD staked in gauge (MEZO emissions)",
    protocol: { name: "Mezo Vaults", url: "https://mezo.org/earn/vaults" },
    depositAsset: "MUSD",
    strategyType: "vault",
    musdUseCase: "other",
    tags: { musd: true, stablecoin: true, leveraged: false, lp: false, lending: false },
    summary: "Stake sMUSD in the MUSD Savings gauge: give up direct fee yield (redirected to veBTC voters) in exchange for MEZO emissions.",
    defillamaPoolId: "3331548c-0ff8-40b6-8502-8260623a37df",
    poolId: null,
    contract: "0x677817bF3e44b90E8F95222F75e2950b7904a401",
    network: "Mezo Mainnet",
    audits: { status: "audited", links: AUDIT_LINKS.earn, note: "Gauges are part of Mezo Earn (audits listed on Mezo docs)." },
    deployedAt: DEPLOYED_AT.sMUSD,
    dependencies: { items: ["sMUSD vault", "MEZO emissions & gauge votes", "MEZO market price"], level: "several" },
    lockDays: 0,
    withdrawalNote: "Unstake, then withdraw sMUSD → MUSD; no lock documented.",
    fees: VAULT_FEES,
    compoundingSupported: true,
    compoundingNote: "MEZO rewards must be claimed and sold for MUSD to compound — each cycle costs gas and swap slippage.",
    gas: { entry: GAS_UNITS.gaugeEntry, exit: GAS_UNITS.gaugeExit, reinvest: GAS_UNITS.gaugeReinvest },
    ilModel: "none",
    incentiveWhenUnreported: null,
    incentiveToken: { symbol: "MEZO", address: "0x7B7c000000000000000000000000000000000001" },
    explainer: {
      howReturnIsGenerated: "MEZO emissions directed to the gauge by veBTC votes are streamed to stakers (rewardRate on the VaultGauge contract).",
      assetsToSupply: "MUSD (deposited to sMUSD, then staked)",
      variableReturns: "Yes — emissions follow weekly votes and MEZO's price.",
      incentivesIncluded: "Yes — the entire yield is MEZO incentives; the fee yield is forfeited while staked.",
      borrowingOrLeverage: "No.",
      withdrawal: "Unstake and withdraw any time.",
      lossCauses: ["MEZO price decline", "Gauge votes moving elsewhere", "Smart-contract failure"],
      unavailableData: ["Next epoch's emission rate", "MEZO/MUSD exit liquidity on Mezo Pools"],
    },
    evidence: [DOCS.savingsVault, DOCS.audits],
  },
  {
    id: "mezo-vebtc-lock",
    name: "veBTC lock (Mezo Earn)",
    protocol: { name: "Mezo Earn", url: "https://mezo.org/earn/lock" },
    depositAsset: "BTC",
    strategyType: "lock",
    musdUseCase: null,
    tags: { musd: false, stablecoin: false, leveraged: false, lp: false, lending: false },
    summary: "Lock BTC for up to 28 days as veBTC to earn chain/bridging fees and, if you vote, swap fees, MUSD fees and incentives (paid in MUSD).",
    defillamaPoolId: "0d03f7c5-938c-4038-8483-aa3cf58c088c",
    poolId: null,
    contract: "0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279",
    network: "Mezo Mainnet",
    audits: { status: "audited", links: AUDIT_LINKS.earn, note: "Mezo Earn audits listed on Mezo docs." },
    deployedAt: DEPLOYED_AT.veBTC,
    dependencies: { items: ["Weekly gauge votes", "Chain & bridge fee flow"], level: "several" },
    lockDays: 28,
    withdrawalNote: "Lock 1–28 days, rounded down to epoch boundaries (Thursday 00:00 UTC). No early unlock (docs FAQ).",
    fees: { depositFeePct: 0, withdrawalFeePct: 0, performanceFeePct: 0, includedInQuotedRate: true, note: "No deposit/withdrawal fee documented." },
    compoundingSupported: false,
    compoundingNote: "Rewards arrive in MUSD per epoch; re-locking requires buying BTC — not modeled as compounding.",
    gas: { entry: GAS_UNITS.lockEntry, exit: GAS_UNITS.lockExit, reinvest: GAS_UNITS.lockClaim },
    ilModel: "none",
    incentiveWhenUnreported: null,
    incentiveToken: { symbol: "MUSD", address: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186" },
    explainer: {
      howReturnIsGenerated: "Passive share of chain and bridging fees; active voters additionally earn fees and incentives from the gauges they vote for.",
      assetsToSupply: "BTC",
      variableReturns: "Yes — depends on fee volume, votes and incentives.",
      incentivesIncluded: "Yes — DefiLlama reports most of the APY as MUSD rewards, which require active voting.",
      borrowingOrLeverage: "No. veBTC cannot be used as MUSD collateral (docs FAQ).",
      withdrawal: "Only at lock expiry (≤ 28 days).",
      lossCauses: ["BTC price exposure during the lock", "Not voting (forfeits active rewards)", "Smart-contract failure"],
      unavailableData: ["Reward split between passive and voting income", "Per-voter incentive rates"],
    },
    evidence: [DOCS.vebtc, DOCS.vebtcFaq, DOCS.audits],
  },
  {
    id: "mezo-vemezo-lock",
    name: "veMEZO lock (Mezo Earn)",
    protocol: { name: "Mezo Earn", url: "https://mezo.org/earn/lock" },
    depositAsset: "MEZO",
    strategyType: "lock",
    musdUseCase: null,
    tags: { musd: false, stablecoin: false, leveraged: false, lp: false, lending: false },
    summary: "Lock MEZO (1 week – 4 years) for rebases that offset emission dilution, plus boost-market incentives.",
    defillamaPoolId: "ca019988-a0e9-47ae-b5cc-3b48554376fe",
    poolId: null,
    contract: "0xb90fdAd3DFD180458D62Cc6acedc983D78E20122",
    network: "Mezo Mainnet",
    audits: { status: "audited", links: AUDIT_LINKS.earn, note: "Mezo Earn audits listed on Mezo docs." },
    deployedAt: DEPLOYED_AT.veMEZO,
    dependencies: { items: ["MEZO emissions schedule", "Boost matching market"], level: "several" },
    lockDays: 1456,
    withdrawalNote: "Locks from 1 week up to 4 years (1,456 days); weight decays linearly. Early-exit terms not documented — assume locked to expiry.",
    fees: { depositFeePct: 0, withdrawalFeePct: 0, performanceFeePct: 0, includedInQuotedRate: true, note: "No fees documented." },
    compoundingSupported: false,
    compoundingNote: "Rebases are added to the lock; projections use simple accrual.",
    gas: { entry: GAS_UNITS.lockEntry, exit: GAS_UNITS.lockExit, reinvest: GAS_UNITS.lockClaim },
    ilModel: "none",
    incentiveWhenUnreported: null,
    incentiveToken: null,
    explainer: {
      howReturnIsGenerated: "Weekly MEZO rebases (anti-dilution) proportional to locked weight. Rebases are new MEZO, so their value depends on MEZO's price.",
      assetsToSupply: "MEZO",
      variableReturns: "Yes — the rebase share falls as more MEZO is locked.",
      incentivesIncluded: "Matching-market incentives are not included in the API APY and are not modeled.",
      borrowingOrLeverage: "No.",
      withdrawal: "Only at lock expiry (up to 4 years).",
      lossCauses: ["MEZO price decline (rebases are paid in MEZO)", "Very long lock-up", "Rebases only offset dilution — real value can fall"],
      unavailableData: ["MEZO/MUSD conversion liquidity on official pools", "Matching-market incentive rates"],
    },
    evidence: [DOCS.vemezo, DOCS.audits],
  },
  {
    id: "boar-finance-btc",
    name: "Boar Finance BTC relay (managed veBTC)",
    protocol: { name: "Boar Finance", url: "https://boar.finance/" },
    depositAsset: "BTC",
    strategyType: "staking",
    musdUseCase: null,
    tags: { musd: false, stablecoin: false, leveraged: false, lp: false, lending: false },
    summary: "Third-party relay that pools user BTC into a single managed veBTC position and passes through its earnings. 28-day unstake lock (per DefiLlama).",
    defillamaPoolId: "8f836e02-e284-5e9d-af8c-e0919d8c975f",
    poolId: null,
    contract: null,
    network: "Mezo Mainnet",
    audits: { status: "unknown", links: [], note: "No public audit found by YieldProof; DefiLlama lists 0 audits." },
    deployedAt: null,
    dependencies: { items: ["Boar relay contracts (third party)", "Mezo veBTC", "Boar operator"], level: "many" },
    lockDays: 28,
    withdrawalNote: "28-day unstake lock (DefiLlama pool metadata); not independently verified.",
    fees: { depositFeePct: 0, withdrawalFeePct: 0, performanceFeePct: 0, includedInQuotedRate: true, note: "Operator fees not documented; assumed already reflected in the reported APY." },
    compoundingSupported: false,
    compoundingNote: "Compounding mechanics not documented.",
    gas: { entry: GAS_UNITS.lockEntry, exit: GAS_UNITS.lockExit, reinvest: GAS_UNITS.lockClaim },
    ilModel: "none",
    incentiveWhenUnreported: null,
    incentiveToken: null,
    explainer: {
      howReturnIsGenerated: "Per DefiLlama's methodology: BTC is aggregated into one managed veNFT earning Mezo chain-fee distributions.",
      assetsToSupply: "BTC",
      variableReturns: "Yes.",
      incentivesIncluded: "Not reported.",
      borrowingOrLeverage: "No.",
      withdrawal: "28-day unstake lock.",
      lossCauses: ["Third-party operator / custody-of-position risk", "No verified audit", "BTC price exposure during the lock"],
      unavailableData: ["Audit reports", "Fee schedule", "Contract addresses (not published in Mezo docs)"],
    },
    evidence: [{ label: "DefiLlama protocol page", url: "https://defillama.com/protocol/boar-finance" }],
  },
  ...(
    [
      ["pool-btc-musd", "BTC/MUSD liquidity (volatile pool)", "BTC + MUSD", false, "volatile-cp"],
      ["pool-musdc-musd", "mUSDC/MUSD liquidity (stable pool)", "mUSDC + MUSD", true, "stable-pair"],
      ["pool-musd-musdt", "MUSD/mUSDT liquidity (stable pool)", "MUSD + mUSDT", true, "stable-pair"],
    ] as const
  ).map(
    ([id, name, asset, stable, il]): LiveDefinition => ({
      id,
      name,
      protocol: { name: "Mezo Pools", url: "https://mezo.org/earn/pools" },
      depositAsset: asset,
      strategyType: "liquidity",
      musdUseCase: stable ? "stablecoin" : "liquidity",
      tags: { musd: true, stablecoin: stable, leveraged: false, lp: true, lending: false },
      summary: stable
        ? "Provide liquidity to an official MUSD stable pool (x³y + xy³ curve, 0.02% fee). Earn swap fees; staked LP forfeits fees for MEZO emissions."
        : "Provide liquidity to the official BTC/MUSD volatile pool (x·y = k, 0.30% fee). Earn swap fees and carry impermanent loss.",
      defillamaPoolId: null,
      poolId: id,
      contract: null,
      network: "Mezo Mainnet",
      audits: { status: "unknown", links: AUDIT_LINKS.earn, note: "Mezo Earn audits may cover pool contracts; scope not verified by YieldProof." },
      deployedAt: DEPLOYED_AT.poolFactory,
      dependencies: { items: ["Mezo Pools AMM", stable ? "Stablecoin pegs (bridged mUSDC/mUSDT)" : "BTC price"], level: "few" },
      lockDays: 0,
      withdrawalNote: "Remove liquidity any time; exiting to a single asset swaps through the same pool.",
      fees: { depositFeePct: 0, withdrawalFeePct: 0, performanceFeePct: 0, includedInQuotedRate: true, note: "Swap fees are the yield; no protocol fee on LPs documented." },
      compoundingSupported: true,
      compoundingNote: "Fees do not auto-compound; claim and re-add manually (docs).",
      gas: { entry: GAS_UNITS.lpEntry, exit: GAS_UNITS.lpExit, reinvest: GAS_UNITS.lpReinvest },
      ilModel: il,
      incentiveWhenUnreported: null,
      incentiveToken: null,
      explainer: {
        howReturnIsGenerated: "Traders pay a fee on each swap (0.30% volatile / 0.02% stable), collected in the input token and claimable by unstaked LPs.",
        assetsToSupply: stable ? asset.replace(" + ", " and ") + " in balance" : "BTC and MUSD in equal value",
        variableReturns: "Yes — fees follow trading volume, which is lumpy.",
        incentivesIncluded: "Gauge emissions for these pools could not be verified on-chain; excluded, not assumed zero.",
        borrowingOrLeverage: "No.",
        withdrawal: "Immediate; single-asset exits pay slippage through a thin pool.",
        lossCauses: stable ? ["A stablecoin de-pegging", "Thin liquidity on exit", "Low volume"] : ["Impermanent loss when BTC moves", "Thin liquidity on exit", "Low volume"],
        unavailableData: ["Gauge emission APR", "Historical fee APR before YieldProof's first snapshot"],
      },
      evidence: [DOCS.poolFees, DOCS.contracts],
    }),
  ),
  {
    id: "musd-loop-smusd",
    name: "Borrow MUSD against BTC → sMUSD",
    protocol: { name: "MUSD + Mezo Vaults", url: "https://mezo.org/borrow" },
    depositAsset: "BTC (collateral)",
    strategyType: "leveraged",
    musdUseCase: "borrowing",
    tags: { musd: true, stablecoin: false, leveraged: true, lp: false, lending: false },
    summary: "Open an MUSD trove with BTC collateral, deposit the borrowed MUSD into the Savings Vault. Earns the carry between sMUSD yield and the fixed MUSD rate — and adds liquidation risk.",
    defillamaPoolId: null,
    poolId: null,
    contract: "0x44b1bac67dDA612a41a58AAf779143B181dEe031",
    network: "Mezo Mainnet",
    audits: { status: "audited", links: AUDIT_LINKS.musd.concat(AUDIT_LINKS.earn), note: "MUSD (Cantina) and Mezo Earn audits listed on Mezo docs." },
    // Youngest component governs maturity: the sMUSD vault (Dec 2025), not BorrowerOperations (May 2025).
    deployedAt: DEPLOYED_AT.sMUSD,
    dependencies: { items: ["MUSD CDP & price oracle", "sMUSD vault", "Liquidation & redemption mechanics"], level: "several" },
    lockDays: 0,
    withdrawalNote: "Withdraw sMUSD, repay MUSD, close the trove. Redemptions can close low-ratio troves at any time.",
    fees: { depositFeePct: 0, withdrawalFeePct: 0, performanceFeePct: 0, includedInQuotedRate: true, note: "Issuance fee, interest and gas deposit are modeled as borrowing costs." },
    compoundingSupported: false,
    compoundingNote: "Not modeled: re-borrowing to compound changes the collateral ratio.",
    gas: { entry: GAS_UNITS.troveOpen, exit: GAS_UNITS.troveClose, reinvest: GAS_UNITS.vaultEntry },
    ilModel: "none",
    incentiveWhenUnreported: 0,
    incentiveToken: null,
    explainer: {
      howReturnIsGenerated: "sMUSD fee yield on borrowed MUSD, minus MUSD interest (fixed at open) and the 0.1% issuance fee.",
      assetsToSupply: "BTC as collateral",
      variableReturns: "sMUSD yield is variable; the MUSD rate is fixed at open (1–5% range per docs).",
      incentivesIncluded: "No.",
      borrowingOrLeverage: "Yes — borrowing against BTC; liquidation below 110% collateral ratio.",
      withdrawal: "Requires repaying the loan to release collateral.",
      lossCauses: ["Liquidation if BTC falls far enough", "Redemption against low-ratio troves", "sMUSD yield falling below the borrow rate"],
      unavailableData: ["Your trove's redemption-queue position", "Future sMUSD yield"],
    },
    evidence: [DOCS.musdFees, DOCS.liquidation, DOCS.savingsVault],
  },
  {
    id: "musd-stability-pool-testnet",
    name: "MUSD Stability Pool (testnet)",
    protocol: { name: "MUSD", url: "https://mezo.org/docs/users/borrow/liquidation-mechanics/" },
    depositAsset: "MUSD",
    strategyType: "stability",
    musdUseCase: "other",
    tags: { musd: true, stablecoin: true, leveraged: false, lp: false, lending: false },
    summary: "Testnet only. Deposit MUSD to absorb liquidated debt in exchange for discounted BTC collateral. No yield rate is published.",
    defillamaPoolId: null,
    poolId: null,
    contract: "0x1CCA7E410eE41739792eA0A24e00349Dd247680e",
    network: "Mezo Testnet",
    audits: { status: "audited", links: AUDIT_LINKS.musd, note: "MUSD audited (Cantina); testnet deployment." },
    deployedAt: null,
    dependencies: { items: ["MUSD liquidations", "Price oracle"], level: "few" },
    lockDays: 0,
    withdrawalNote: "Withdraw any time (provideToSP / withdrawFromSP).",
    fees: { depositFeePct: 0, withdrawalFeePct: 0, performanceFeePct: 0, includedInQuotedRate: true, note: "No fees." },
    compoundingSupported: false,
    compoundingNote: "Gains arrive as BTC collateral, not MUSD.",
    gas: { entry: 400_000, exit: 400_000, reinvest: 400_000 },
    ilModel: "none",
    incentiveWhenUnreported: null,
    incentiveToken: null,
    explainer: {
      howReturnIsGenerated: "When troves are liquidated, their debt is burned against pool deposits and their BTC collateral (bought at a discount) is distributed to depositors.",
      assetsToSupply: "MUSD (testnet)",
      variableReturns: "Entirely event-driven — no liquidations, no return.",
      incentivesIncluded: "No.",
      borrowingOrLeverage: "No.",
      withdrawal: "Immediate.",
      lossCauses: ["Collateral received worth less than the MUSD burned (if BTC keeps falling)"],
      unavailableData: ["Any yield rate — liquidation gains are unpredictable, so no APY is shown"],
    },
    evidence: [DOCS.liquidation],
  },
];

export function getDefinition(id: string): LiveDefinition | undefined {
  return LIVE_DEFINITIONS.find((d) => d.id === id);
}
