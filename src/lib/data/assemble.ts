import { MAINNET_POOLS } from "@/config/contracts";
import { assessConfidence, Freshness, freshness } from "@/lib/engine/confidence";
import { compareSources } from "@/lib/engine/discrepancy";
import { d } from "@/lib/engine/decimal";
import { dailyLast, filterRange } from "@/lib/engine/history";
import { PoolState, poolValueIn, spotPrice } from "@/lib/engine/liquidity";
import { apyToApr, trailingIndexApr } from "@/lib/engine/rates";
import { assessRisk } from "@/lib/engine/risk";
import { stdev } from "@/lib/engine/stats";
import { Metric, metric, notVerified, SourceRef, unavailable } from "@/lib/engine/types";
import { Discrepancy, Opportunity, RateMetric, serializeDiscrepancy } from "@/lib/model/types";
import type { LlamaChartPoint, LlamaPool, LlamaPrice } from "./defillama";
import { DEFILLAMA_POOL_PAGE } from "./defillama";
import type { FeeWindow } from "./fees";
import type { MainnetState, PoolSnapshot, TestnetState } from "./onchain";
import { LIVE_DEFINITIONS, LiveDefinition } from "./registry";

/**
 * Pure assembly of live opportunities from raw source data. No I/O here, so
 * the honesty rules (unavailable ≠ 0, stale → Partial, discrepancies surfaced,
 * no demo rows) are unit-testable with fixtures.
 */

export const SRC = {
  llama: (poolId: string): SourceRef => ({ id: "defillama-yields", name: "DefiLlama yields API", type: "API", url: DEFILLAMA_POOL_PAGE(poolId) }),
  llamaCoins: { id: "defillama-coins", name: "DefiLlama coins API", type: "API", url: "https://coins.llama.fi" } as SourceRef,
  mainnet: (what: string, url?: string): SourceRef => ({ id: "mezo-mainnet", name: `Mezo mainnet · ${what}`, type: "on-chain", url }),
  testnet: (what: string, url?: string): SourceRef => ({ id: "mezo-testnet", name: `Mezo testnet · ${what}`, type: "on-chain", url }),
  modeled: (what: string): SourceRef => ({ id: "yieldproof-model", name: `YieldProof model · ${what}`, type: "modeled" }),
  docs: (what: string, url: string): SourceRef => ({ id: "mezo-docs", name: `Mezo docs · ${what}`, type: "documentation", url }),
};

export interface RawInputs {
  now: Date;
  llamaPools: LlamaPool[] | null;
  llamaCharts: Record<string, LlamaChartPoint[]>;
  prices: Record<string, LlamaPrice> | null;
  mainnet: MainnetState | null;
  testnet: TestnetState | null;
  feeWindows: Record<string, FeeWindow | null>;
  staleHours?: number;
}

export const COIN = {
  BTC: "mezo:0x7b7c000000000000000000000000000000000000",
  MUSD: "mezo:0xdd468a1ddc392dcdbef6db6e34e89aa338f9f186",
  MEZO: "mezo:0x7b7c000000000000000000000000000000000001",
};

export function poolStateOf(p: PoolSnapshot): PoolState {
  return {
    reserve0: BigInt(p.reserve0),
    reserve1: BigInt(p.reserve1),
    scale0: BigInt(p.scale0),
    scale1: BigInt(p.scale1),
    stable: p.stable,
    feeBps: BigInt(p.feeBps),
  };
}

function rateMetric(value: number | null | undefined, source: SourceRef | null, basis: "APR" | "APY", opts: { observedAt?: string | null; fetchedAt?: string | null; note?: string; status?: Metric["status"] } = {}): RateMetric {
  return { ...metric(value ?? null, source, opts), basis, compoundsPerYear: basis === "APY" ? 365 : undefined };
}

const pctToFrac = (v: number | null | undefined) => (v === null || v === undefined ? null : v / 100);

/** USD value of each pool token: BTC from the Mezo oracle, stablecoins at the $1 peg (disclosed). */
function tokenUsd(symbol: string, btcPrice: number | null): number | null {
  if (symbol === "BTC") return btcPrice;
  if (["MUSD", "mUSDC", "mUSDT"].includes(symbol)) return 1;
  return null;
}

export function poolTvlUsd(snapshot: PoolSnapshot, btcPrice: number | null): number | null {
  const cfg = MAINNET_POOLS.find((p) => p.id === snapshot.id);
  if (!cfg) return null;
  const p0 = tokenUsd(cfg.token0.symbol, btcPrice);
  const p1 = tokenUsd(cfg.token1.symbol, btcPrice);
  if (p0 === null || p1 === null) return null;
  const r0 = d(snapshot.reserve0).dividedBy(snapshot.scale0);
  const r1 = d(snapshot.reserve1).dividedBy(snapshot.scale1);
  return r0.times(p0).plus(r1.times(p1)).toNumber();
}

/** Realised fee APR from a trailing window of on-chain Fees events. */
export function feeAprFromWindow(w: FeeWindow, snapshot: PoolSnapshot, btcPrice: number | null): number | null {
  const cfg = MAINNET_POOLS.find((p) => p.id === snapshot.id);
  const tvl = poolTvlUsd(snapshot, btcPrice);
  if (!cfg || !tvl || tvl <= 0) return null;
  const p0 = tokenUsd(cfg.token0.symbol, btcPrice);
  const p1 = tokenUsd(cfg.token1.symbol, btcPrice);
  if (p0 === null || p1 === null) return null;
  const seconds = (Date.parse(w.toTime) - Date.parse(w.fromTime)) / 1000;
  if (!(seconds > 0)) return null;
  const fees = d(w.fees0).times(p0).plus(d(w.fees1).times(p1));
  return fees.dividedBy(tvl).times(365 * 86400).dividedBy(seconds).toNumber();
}

export function apyVolatility(chart: LlamaChartPoint[] | undefined, now: Date, days = 30): number | null {
  if (!chart || chart.length === 0) return null;
  const pts = filterRange(dailyLast(chart.map((c) => ({ t: c.timestamp, apy: c.apy }))), days, now)
    .map((p) => p.apy)
    .filter((v): v is number => v !== null);
  const s = stdev(pts);
  return s === null ? null : s.toNumber();
}

function gasCostMusd(gasUnits: number, gasPriceWei: string | null | undefined, btcPrice: number | null, source: SourceRef): Metric<number> {
  if (!gasPriceWei || !btcPrice) return unavailable("Gas price or BTC price unavailable", source);
  const btc = d(gasUnits).times(gasPriceWei).dividedBy("1e18");
  return metric(btc.times(btcPrice).toNumber(), source, {
    note: `${gasUnits.toLocaleString("en-US")} gas (modeled) × ${(Number(gasPriceWei) / 1e9).toFixed(6)} gwei × oracle BTC price.`,
  });
}

function emptyMetric<T = number>(note: string): Metric<T> {
  return unavailable<T>(note);
}

export function assembleOpportunities(raw: RawInputs): { opportunities: Opportunity[]; discrepancies: Discrepancy[] } {
  const now = raw.now;
  const policy = { freshHours: 6, staleHours: raw.staleHours ?? 30 };
  const m = raw.mainnet;
  const btcOracle = m?.btcPrice ?? null;
  const prices = raw.prices ?? {};
  const out: Opportunity[] = [];

  const llamaById = new Map((raw.llamaPools ?? []).map((p) => [p.pool, p]));
  const knownLlamaIds = new Set(LIVE_DEFINITIONS.map((d) => d.defillamaPoolId).filter(Boolean));

  const mainnetGasSrc = SRC.modeled("gas cost at live Mezo mainnet gas price");

  for (const def of LIVE_DEFINITIONS) {
    out.push(buildFromDefinition(def));
  }

  // Discovery: any Mezo pool DefiLlama lists that YieldProof has no definition for.
  for (const p of raw.llamaPools ?? []) {
    if (knownLlamaIds.has(p.pool)) continue;
    out.push(buildDiscovered(p));
  }

  function baseFields(def: LiveDefinition) {
    const isTestnet = def.network === "Mezo Testnet";
    const gasPrice = isTestnet ? raw.testnet?.gasPriceWei : m?.gasPriceWei;
    const price = isTestnet ? raw.testnet?.btcPrice ?? null : btcOracle;
    return {
      entry: gasCostMusd(def.gas.entry, gasPrice, price, mainnetGasSrc),
      exit: gasCostMusd(def.gas.exit, gasPrice, price, mainnetGasSrc),
      reinvest: gasCostMusd(def.gas.reinvest, gasPrice, price, mainnetGasSrc),
    };
  }

  function buildFromDefinition(def: LiveDefinition): Opportunity {
    const llama = def.defillamaPoolId ? llamaById.get(def.defillamaPoolId) ?? null : null;
    const llamaSrc = def.defillamaPoolId ? SRC.llama(def.defillamaPoolId) : null;
    const observed = llama?.timestamp ?? null;
    const fetchedAt = now.toISOString();
    const missing: string[] = [];
    const discrepancies: Discrepancy[] = [];
    let crossChecked = false;
    let primaryOnChain = false;
    let lastUpdated: string | null = observed;

    let advertised: RateMetric = rateMetric(null, null, "APY", { note: "No advertised rate is published for this strategy." });
    let base: RateMetric = rateMetric(null, null, "APY");
    let incentive: RateMetric = rateMetric(null, null, "APY");
    let tvl: Metric<number> = emptyMetric("TVL not available");
    let liquidity: Metric<number> = emptyMetric("Available liquidity could not be verified");
    let incentiveToken: Opportunity["incentiveToken"] = null;
    let poolAddress: string | null = null;
    const entrySlip: Metric<number> = metric(0, SRC.modeled("no swap leg"), { note: "Deposit asset goes in directly." });
    const exitSlip: Metric<number> = metric(0, SRC.modeled("no swap leg"), { note: "Withdrawal returns the deposit asset directly." });

    if (def.defillamaPoolId) {
      if (!llama) {
        missing.push("DefiLlama pool data");
      } else {
        const opts = { observedAt: observed, fetchedAt };
        advertised = rateMetric(pctToFrac(llama.apy), llamaSrc, "APY", { ...opts, note: "API-reported, backward-looking. Not a guaranteed future rate." });
        base = rateMetric(pctToFrac(llama.apyBase), llamaSrc, "APY", opts);
        const reward = pctToFrac(llama.apyReward);
        incentive =
          reward !== null
            ? rateMetric(reward, llamaSrc, "APY", { ...opts, note: llama.rewardTokens?.length ? `Reward token(s): ${llama.rewardTokens.join(", ")}` : undefined })
            : def.incentiveWhenUnreported === 0
              ? rateMetric(0, SRC.docs("no incentive programme", def.evidence[0]?.url ?? ""), "APR", { ...opts, note: "Verified absent: this position has no token incentives." })
              : rateMetric(null, llamaSrc, "APY", { status: "not_verified", note: "Incentives not reported by the API; excluded, not assumed zero." });
        if (base.value === null) missing.push("base yield");
        if (incentive.value === null && incentive.status !== "ok") missing.push("incentive yield");
        tvl = metric(llama.tvlUsd ?? null, llamaSrc, opts);
      }
    }

    // ---- per-strategy on-chain enrichment ----
    if (def.id === "mezo-smusd-savings" && m) {
      primaryOnChain = false;
      const idxNow = m.smusd.now;
      const idx7 = m.smusd.d7;
      if (idxNow && idx7) {
        const seconds = (Date.parse(idxNow.at) - Date.parse(idx7.at)) / 1000;
        const onchainApr = trailingIndexApr({ indexStart: BigInt(idx7.index), indexEnd: BigInt(idxNow.index), indexScale: 10n ** 18n, unitValue: 1, seconds }).toNumber();
        const llamaApr = base.value !== null ? apyToApr(base.value, 365).toNumber() : null;
        const r = compareSources(
          [
            { sourceId: "defillama", label: "DefiLlama apyBase (as APR)", value: llamaApr, observedAt: observed },
            { sourceId: "onchain-7d", label: "On-chain yieldIndex, trailing 7d (APR)", value: onchainApr, observedAt: idxNow.at },
          ],
          { primarySourceId: "defillama", relTolerance: "0.15", absTolerance: "0.005" },
        );
        crossChecked = r.status === "agree";
        discrepancies.push(serializeDiscrepancy(`${def.id}-apy`, "sMUSD base yield", "rate", "YieldProof recomputes realised yield from the MUSDSavingsRate yieldIndex at two archived blocks. The engine uses DefiLlama's rate (converted APY→APR); the on-chain figure is the independent check.", r));
        if (m.smusd.d30) {
          const s30 = (Date.parse(idxNow.at) - Date.parse(m.smusd.d30.at)) / 1000;
          const apr30 = trailingIndexApr({ indexStart: BigInt(m.smusd.d30.index), indexEnd: BigInt(idxNow.index), indexScale: 10n ** 18n, unitValue: 1, seconds: s30 }).toNumber();
          base = { ...base, note: `On-chain realised: ${(onchainApr * 100).toFixed(2)}% (7d), ${(apr30 * 100).toFixed(2)}% (30d) APR.` };
        }
      } else {
        missing.push("on-chain yieldIndex history");
      }
      liquidity = metric(m.smusd.totalSupply, SRC.mainnet("sMUSD totalSupply (redeemable 1:1)", `https://explorer.mezo.org/address/${def.contract}`), { observedAt: m.blockTime, fetchedAt, note: "sMUSD is redeemable 1:1 for MUSD with no lock; total supply bounds what can exit." });
      lastUpdated = observed ?? m.blockTime;
    }

    if (def.id === "mezo-smusd-gauge" && m) {
      incentiveToken = { symbol: "MEZO", address: def.incentiveToken?.address, priceUsd: prices[COIN.MEZO] ? metric(prices[COIN.MEZO]!.price, SRC.llamaCoins, { observedAt: prices[COIN.MEZO]!.observedAt, fetchedAt }) : unavailable("MEZO price unavailable") };
      const rr = m.gauge.rewardRatePerSec;
      const staked = m.gauge.totalStaked;
      const mezoPx = prices[COIN.MEZO]?.price ?? null;
      const musdPx = prices[COIN.MUSD]?.price ?? null;
      const active = m.gauge.periodFinish ? Date.parse(m.gauge.periodFinish) > now.getTime() : false;
      if (rr !== null && staked && mezoPx && musdPx) {
        const onchainApr = active ? (rr * 31_536_000 * mezoPx) / (staked * musdPx) : 0;
        const llamaApr = incentive.value !== null ? apyToApr(incentive.value, 365).toNumber() : null;
        const r = compareSources(
          [
            { sourceId: "defillama", label: "DefiLlama apyReward (as APR)", value: llamaApr, observedAt: observed },
            { sourceId: "onchain", label: "VaultGauge rewardRate × MEZO price ÷ staked", value: onchainApr, observedAt: m.blockTime },
          ],
          { primarySourceId: "defillama", relTolerance: "0.15", absTolerance: "0.003" },
        );
        crossChecked = r.status === "agree";
        discrepancies.push(serializeDiscrepancy(`${def.id}-apr`, "sMUSD gauge emissions APR", "rate", `Recomputed from the gauge's live rewardRate (${rr.toFixed(4)} MEZO/s, period ends ${m.gauge.periodFinish?.slice(0, 10) ?? "?"}) and DefiLlama MEZO/MUSD prices. Price inputs are API-sourced.`, r));
        if (!active) incentive = { ...incentive, note: "Gauge reward period has ended — no emissions currently streaming." };
      } else {
        missing.push("gauge reward cross-check");
      }
      liquidity = metric(staked, SRC.mainnet("VaultGauge totalSupply", `https://explorer.mezo.org/address/${def.contract}`), { observedAt: m.blockTime, fetchedAt });
    }

    if (def.id === "mezo-vebtc-lock") {
      incentiveToken = { symbol: "MUSD", address: def.incentiveToken?.address, priceUsd: prices[COIN.MUSD] ? metric(prices[COIN.MUSD]!.price, SRC.llamaCoins, { observedAt: prices[COIN.MUSD]!.observedAt, fetchedAt }) : unavailable("MUSD price unavailable") };
      liquidity = unavailable("Locked until expiry (≤ 28 days); no secondary market verified.");
    }
    if (def.id === "mezo-vemezo-lock") {
      liquidity = unavailable("Locked until expiry (up to 4 years).");
    }
    if (def.id === "boar-finance-btc") {
      liquidity = unavailable("28-day unstake lock; relay liquidity not published.");
    }

    // ---- AMM pools: reserves + realised fees, all on-chain ----
    if (def.poolId) {
      const snap = m?.pools[def.poolId];
      const cfg = MAINNET_POOLS.find((p) => p.id === def.poolId)!;
      poolAddress = cfg.address;
      if (!snap) {
        missing.push("on-chain pool reserves");
      } else {
        primaryOnChain = true;
        const src = SRC.mainnet(`${cfg.label} getReserves`, `https://explorer.mezo.org/address/${cfg.address}`);
        const tvlUsd = poolTvlUsd(snap, btcOracle);
        tvl = metric(tvlUsd, src, { observedAt: m!.blockTime, fetchedAt, note: "Reserves valued at the Mezo BTC oracle and a $1 stablecoin peg." });
        liquidity = tvl;
        const w = raw.feeWindows[def.poolId] ?? null;
        if (w) {
          const apr = feeAprFromWindow(w, snap, btcOracle);
          const wSrc = SRC.mainnet(`${cfg.label} Fees events (${w.windowDays}d)`, `https://explorer.mezo.org/address/${cfg.address}?tab=logs`);
          base = rateMetric(apr, wSrc, "APR", {
            observedAt: w.toTime,
            fetchedAt: w.computedAt,
            note: `Realised over ${w.windowDays} days: ${Number(w.fees0).toPrecision(4)} ${cfg.token0.symbol} + ${Number(w.fees1).toPrecision(4)} ${cfg.token1.symbol} in fees from ${w.swaps} swaps.`,
          });
          if (freshness(w.toTime, now, policy) === "stale") missing.push("recent fee window");
        } else {
          base = rateMetric(null, null, "APR", { note: "Awaiting the first on-chain fee scan (runs daily)." });
          missing.push("realised fee APR");
        }
        incentive = { ...notVerified("Gauge emissions for this pool could not be verified on-chain (factory voter is a multisig)."), basis: "APR" };
        missing.push("gauge incentive APR");
        advertised = rateMetric(null, null, "APR", { note: "No advertised rate is published by a verifiable source." });
        lastUpdated = m!.blockTime;
      }
    }

    // ---- MUSD loop: borrow params on-chain, yield from sMUSD ----
    let borrow: Opportunity["economics"]["borrow"] = null;
    if (def.strategyType === "leveraged") {
      const savings = out.find((o) => o.id === "mezo-smusd-savings");
      const boSrc = SRC.mainnet("BorrowerOperations / InterestRateManager", `https://explorer.mezo.org/address/${def.contract}`);
      const p = m?.musd;
      const mm = (v: number | null | undefined, note?: string) => (v === null || v === undefined ? unavailable("not readable on-chain", boSrc) : metric(v, boSrc, { observedAt: m?.blockTime, fetchedAt, note }));
      borrow = {
        asset: "MUSD",
        apr: rateMetric(p?.interestApr ?? null, boSrc, "APR", { observedAt: m?.blockTime, fetchedAt, note: "Rate offered to new troves; fixed for the life of the loan (docs: 1–5%)." }),
        oneTimeFeePct: mm(p?.issuanceFeePct),
        gasCompensation: mm(p?.gasCompensation, "Escrowed and refunded on close; interest accrues on it."),
        mcr: mm(p?.mcr),
        ccr: mm(p?.ccr),
        minNetDebt: mm(p?.minNetDebt),
        defaultLtv: 0.3,
      };
      if (savings) {
        base = { ...savings.base, note: "Strategy yield = MUSD Savings Vault base yield." };
        advertised = rateMetric(null, null, "APR", { note: "Modeled strategy — no advertised rate exists." });
        incentive = rateMetric(0, SRC.modeled("no incentives"), "APR");
        crossChecked = savings.confidence.label === "Verified";
        lastUpdated = savings.lastUpdated;
      }
      primaryOnChain = p?.interestApr !== null && p?.interestApr !== undefined;
      missing.push("composite strategy is modeled, not a single on-chain product");
    }

    if (def.id === "musd-stability-pool-testnet") {
      const t = raw.testnet;
      if (t) {
        primaryOnChain = true;
        tvl = metric(t.stabilityPoolMusd, SRC.testnet("StabilityPool.getTotalMUSDDeposits", `https://explorer.test.mezo.org/address/${def.contract}`), { observedAt: t.blockTime, fetchedAt, note: "Testnet MUSD — not real value." });
        liquidity = tvl;
        lastUpdated = t.blockTime;
      }
      advertised = rateMetric(null, null, "APR", { note: "No yield rate is published; liquidation gains are event-driven." });
      base = rateMetric(null, null, "APR", { note: "Unpredictable — depends on liquidations." });
      incentive = rateMetric(null, null, "APR", { status: "not_verified" });
      missing.push("yield rate");
    }

    const fresh: Freshness = freshness(lastUpdated, now, policy);
    const confidence = assessConfidence({
      dataKind: "live",
      crossCheckedOnChain: crossChecked,
      primaryOnChain,
      missingCritical: missing,
      freshness: fresh,
      unresolvedDiscrepancy: discrepancies.some((x) => x.flagged),
    });

    const incentiveShare = advertised.value && advertised.value > 0 && incentive.value !== null ? Math.min(1, incentive.value / advertised.value) : base.value !== null && incentive.value === 0 ? 0 : null;
    const ageDays = def.deployedAt ? (now.getTime() - Date.parse(def.deployedAt)) / 86_400_000 : llama ? null : null;
    const gas = baseFields(def);

    const leverage = def.strategyType === "leveraged" && borrow?.mcr.value ? { ratio: 1 + borrow.defaultLtv, healthFactor: 1 / borrow.defaultLtv / borrow.mcr.value } : null;

    const riskEvidence = {
      audits: { status: def.audits.status, links: def.audits.links },
      ageDays,
      dependencies: def.dependencies,
      // Testnet balances are not real value and never count as liquidity depth.
      liquidityUsd: def.network === "Mezo Testnet" ? null : def.lockDays && def.lockDays > 0 ? (tvl.value ?? null) : (liquidity.value ?? tvl.value ?? null),
      lockDays: def.lockDays,
      apyVolatilityPts: def.defillamaPoolId ? apyVolatility(raw.llamaCharts[def.defillamaPoolId], now) : def.strategyType === "leveraged" ? apyVolatility(raw.llamaCharts["515e257a-3a9c-418b-93fc-acabf4021905"], now) : null,
      incentiveShare,
      topHolderShare: null,
      leverage,
      liquidationExposure: def.strategyType === "leveraged",
      dataFreshness: fresh,
      confidence: confidence.label,
      incidents: { status: "none_found" as const, links: [] },
      assessedAt: now.toISOString(),
    };

    const sources: SourceRef[] = [];
    const pushSrc = (s: SourceRef | null | undefined) => {
      if (s && !sources.some((x) => x.name === s.name)) sources.push(s);
    };
    [advertised.source, base.source, incentive.source, tvl.source, liquidity.source, gas.entry.source].forEach(pushSrc);
    def.evidence.forEach((e) => pushSrc({ id: "mezo-docs", name: e.label, type: "documentation", url: e.url }));

    return {
      id: def.id,
      dataKind: "live",
      name: def.name,
      protocol: def.protocol,
      network: def.network,
      chainId: def.network === "Mezo Testnet" ? 31611 : 31612,
      depositAsset: def.depositAsset,
      strategyType: def.strategyType,
      musdUseCase: def.musdUseCase,
      tags: def.tags,
      summary: def.summary,
      advertised,
      base,
      incentive,
      incentiveToken,
      tvlUsd: tvl,
      availableLiquidityUsd: liquidity,
      economics: {
        compoundingSupported: def.compoundingSupported,
        compoundingNote: def.compoundingNote,
        incentiveScheduleChangePct: null,
        entryCostMusd: gas.entry,
        exitCostMusd: gas.exit,
        reinvestCostMusd: gas.reinvest,
        protocolFees: def.fees,
        lockDays: def.lockDays,
        withdrawalNote: def.withdrawalNote,
        ilModel: def.ilModel,
        entrySlippagePct: def.tags.lp ? unavailable("Computed per position size from live reserves.") : entrySlip,
        exitSlippagePct: def.tags.lp ? unavailable("Computed per position size from live reserves.") : exitSlip,
        musdRoute: def.poolId
          ? { poolId: def.poolId, label: MAINNET_POOLS.find((p) => p.id === def.poolId)!.label, depositAssetIsToken0: MAINNET_POOLS.find((p) => p.id === def.poolId)!.token0.symbol === "MUSD" }
          : def.depositAsset === "BTC"
            ? { poolId: "pool-btc-musd", label: "BTC/MUSD (volatile)", depositAssetIsToken0: true }
            : null,
        borrow,
      },
      explainer: def.explainer,
      riskEvidence,
      risk: assessRisk(riskEvidence),
      confidence,
      freshness: fresh,
      lastUpdated,
      sources,
      missing,
      discrepancies,
      defillamaPoolId: def.defillamaPoolId,
      poolAddress,
      explorerUrl: def.contract ? `${def.network === "Mezo Testnet" ? "https://explorer.test.mezo.org" : "https://explorer.mezo.org"}/address/${def.contract}` : poolAddress ? `https://explorer.mezo.org/address/${poolAddress}` : null,
    };
  }

  function buildDiscovered(p: LlamaPool): Opportunity {
    const src = SRC.llama(p.pool);
    const opts = { observedAt: p.timestamp ?? null, fetchedAt: now.toISOString() };
    const fresh = freshness(p.timestamp ?? null, now, policy);
    const missing = ["protocol documentation review", "withdrawal terms", "audit status"];
    const confidence = assessConfidence({ dataKind: "live", crossCheckedOnChain: false, primaryOnChain: false, missingCritical: missing, freshness: fresh });
    const riskEvidence = {
      audits: { status: "unknown" as const, links: [] },
      ageDays: null,
      dependencies: null,
      liquidityUsd: p.tvlUsd ?? null,
      lockDays: null,
      apyVolatilityPts: apyVolatility(raw.llamaCharts[p.pool], now),
      incentiveShare: p.apy && p.apyReward !== null ? Math.min(1, (p.apyReward ?? 0) / p.apy) : null,
      topHolderShare: null,
      leverage: null,
      liquidationExposure: false,
      dataFreshness: fresh,
      confidence: confidence.label,
      incidents: { status: "unknown" as const, links: [] },
      assessedAt: now.toISOString(),
    };
    const unknownCost = unavailable<number>("Not modeled for discovered pools.");
    return {
      id: `llama-${p.pool}`,
      dataKind: "live",
      name: `${p.project} · ${p.symbol}${p.poolMeta ? ` (${p.poolMeta})` : ""}`,
      protocol: { name: p.project, url: p.url ?? DEFILLAMA_POOL_PAGE(p.pool) },
      network: "Mezo Mainnet",
      chainId: 31612,
      depositAsset: p.symbol,
      strategyType: "vault",
      musdUseCase: null,
      tags: { musd: /musd/i.test(p.symbol), stablecoin: !!p.stablecoin, leveraged: false, lp: p.exposure === "multi", lending: false },
      summary: "Discovered automatically on DefiLlama. YieldProof has not yet reviewed this protocol's documentation — treat every figure as unverified.",
      advertised: rateMetric(pctToFrac(p.apy), src, "APY", opts),
      base: rateMetric(pctToFrac(p.apyBase), src, "APY", opts),
      incentive: p.apyReward !== null ? rateMetric(pctToFrac(p.apyReward), src, "APY", opts) : rateMetric(null, src, "APY", { status: "not_verified" }),
      incentiveToken: null,
      tvlUsd: metric(p.tvlUsd ?? null, src, opts),
      availableLiquidityUsd: unavailable("Not verified"),
      economics: {
        compoundingSupported: false,
        compoundingNote: "Unknown mechanics — compounding not assumed.",
        incentiveScheduleChangePct: null,
        entryCostMusd: unknownCost,
        exitCostMusd: unknownCost,
        reinvestCostMusd: unknownCost,
        protocolFees: { depositFeePct: 0, withdrawalFeePct: 0, performanceFeePct: 0, includedInQuotedRate: true, note: "Fees unknown." },
        lockDays: null,
        withdrawalNote: "Not reviewed.",
        ilModel: "none",
        entrySlippagePct: unknownCost,
        exitSlippagePct: unknownCost,
        musdRoute: null,
        borrow: null,
      },
      explainer: {
        howReturnIsGenerated: "Not reviewed.",
        assetsToSupply: p.symbol,
        variableReturns: "Assume yes.",
        incentivesIncluded: p.apyReward ? "Yes (API-reported)." : "Unknown.",
        borrowingOrLeverage: "Unknown.",
        withdrawal: "Unknown.",
        lossCauses: ["Unreviewed protocol"],
        unavailableData: missing,
      },
      riskEvidence,
      risk: assessRisk(riskEvidence),
      confidence,
      freshness: fresh,
      lastUpdated: p.timestamp ?? null,
      sources: [src],
      missing,
      discrepancies: [],
      defillamaPoolId: p.pool,
      poolAddress: null,
      explorerUrl: null,
    };
  }

  // ---- global (market-level) discrepancies ----
  const discrepancies: Discrepancy[] = [];
  const btcPool = m?.pools["pool-btc-musd"];
  const btcSpot = btcPool ? spotPrice(poolStateOf(btcPool), true).toNumber() : null;
  discrepancies.push(
    serializeDiscrepancy(
      "btc-price",
      "BTC price",
      "price",
      "YieldProof values BTC with the Mezo mainnet PriceFeed (the price MUSD itself uses for collateral ratios). Other venues are shown for transparency; the AMM spot reflects a thin pool and is not used for valuation.",
      compareSources(
        [
          { sourceId: "oracle-mainnet", label: "Mezo mainnet PriceFeed", value: m?.btcPrice ?? null, observedAt: m?.blockTime },
          { sourceId: "oracle-testnet", label: "Mezo testnet PriceFeed", value: raw.testnet?.btcPrice ?? null, observedAt: raw.testnet?.blockTime },
          { sourceId: "llama", label: "DefiLlama coins (BTC on Mezo)", value: prices[COIN.BTC]?.price ?? null, observedAt: prices[COIN.BTC]?.observedAt },
          { sourceId: "pool", label: "BTC/MUSD pool spot (MUSD per BTC)", value: btcSpot, observedAt: m?.blockTime },
        ],
        { primarySourceId: "oracle-mainnet", relTolerance: "0.01" },
      ),
    ),
  );
  const stableSpots = (["pool-musdc-musd", "pool-musd-musdt"] as const).map((id) => {
    const s = m?.pools[id];
    if (!s) return null;
    const cfg = MAINNET_POOLS.find((p) => p.id === id)!;
    const musdIs0 = cfg.token0.symbol === "MUSD";
    return spotPrice(poolStateOf(s), musdIs0).toNumber(); // MUSD priced in the other stablecoin
  });
  discrepancies.push(
    serializeDiscrepancy(
      "musd-price",
      "MUSD price (USD)",
      "price",
      "Projections assume 1 MUSD = 1 USD (peg). Market sources below show how far MUSD currently trades from that assumption.",
      compareSources(
        [
          { sourceId: "peg", label: "Peg assumption", value: 1 },
          { sourceId: "llama", label: "DefiLlama coins", value: prices[COIN.MUSD]?.price ?? null, observedAt: prices[COIN.MUSD]?.observedAt },
          { sourceId: "musdc-pool", label: "mUSDC/MUSD pool spot", value: stableSpots[0] ?? null, observedAt: m?.blockTime },
          { sourceId: "musdt-pool", label: "MUSD/mUSDT pool spot", value: stableSpots[1] ?? null, observedAt: m?.blockTime },
        ],
        { primarySourceId: "peg", relTolerance: "0.005" },
      ),
    ),
  );

  return { opportunities: out, discrepancies };
}

/** Pool registry for client-side size-dependent slippage maths. */
export function serializePools(m: MainnetState | null) {
  const pools: Record<string, PoolSnapshot & { label: string; token0: string; token1: string; valueInMusd: number | null }> = {};
  if (!m) return pools;
  for (const cfg of MAINNET_POOLS) {
    const s = m.pools[cfg.id];
    if (!s) continue;
    let valueInMusd: number | null = null;
    try {
      valueInMusd = poolValueIn(poolStateOf(s), cfg.token0.symbol === "MUSD").toNumber();
    } catch {
      valueInMusd = null;
    }
    pools[cfg.id] = { ...s, label: cfg.label, token0: cfg.token0.symbol, token1: cfg.token1.symbol, valueInMusd };
  }
  return pools;
}
