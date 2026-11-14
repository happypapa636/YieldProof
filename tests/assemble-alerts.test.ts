import { describe, expect, it } from "vitest";
import { assembleOpportunities, feeAprFromWindow } from "@/lib/data/assemble";
import type { LlamaPool } from "@/lib/data/defillama";
import type { MainnetState } from "@/lib/data/onchain";
import { evaluateAlert, paramFingerprint } from "@/lib/model/alerts";
import { assertLiveOnly } from "@/lib/model/separation";

const NOW = new Date("2026-10-26T12:00:00Z");

const llama = (over: Partial<LlamaPool>): LlamaPool => ({
  pool: "515e257a-3a9c-418b-93fc-acabf4021905",
  chain: "Mezo",
  project: "mezo-vaults",
  symbol: "SMUSD",
  tvlUsd: 2_065_884,
  apyBase: 4.23157,
  apyReward: null,
  apy: 4.23157,
  apyMean30d: null,
  apyPct7D: null,
  count: null,
  timestamp: "2026-10-26T10:00:00.000Z",
  ...over,
});

const mainnet: MainnetState = {
  fetchedAt: NOW.toISOString(),
  blockNumber: "1",
  blockTime: "2026-10-26T11:59:00.000Z",
  gasPriceWei: "1462500",
  btcPrice: 80_000,
  musd: { interestApr: 0.01, issuanceFeePct: 0.001, mcr: 1.1, ccr: 1.5, minNetDebt: 1800, gasCompensation: 200 },
  musdSupply: 29_000_000,
  stabilityPoolMusd: 14_000_000,
  pools: {
    "pool-btc-musd": {
      id: "pool-btc-musd",
      address: "0x52e604c44417233b6CcEDDDc0d640A405Caacefb",
      reserve0: "744816351348002701",
      reserve1: "60028551708285583041860",
      scale0: "1000000000000000000",
      scale1: "1000000000000000000",
      stable: false,
      feeBps: "30",
      totalSupply: "1",
      lastSwapAt: null,
      isFactoryPool: true,
    },
  },
  smusd: {
    totalSupply: 7_382_555,
    now: { index: "215867387405979216", at: "2026-10-26T02:32:35.000Z" },
    d7: { index: "215055813201967573", at: "2026-10-18T23:46:35.000Z" },
    d30: null,
  },
  gauge: { rewardRatePerSec: null, totalStaked: null, periodFinish: null },
};

const base = { now: NOW, llamaCharts: {}, prices: {}, testnet: null, feeWindows: {} };

describe("live dataset assembly (honesty rules)", () => {
  it("cross-checks sMUSD against the on-chain yieldIndex and labels it Verified when they agree", () => {
    const { opportunities } = assembleOpportunities({ ...base, llamaPools: [llama({})], mainnet });
    const s = opportunities.find((o) => o.id === "mezo-smusd-savings")!;
    expect(s.discrepancies[0]!.status).toBe("agree");
    expect(s.confidence.label).toBe("Verified");
    expect(s.incentive.value).toBe(0); // verified absent, not unknown
    assertLiveOnly(opportunities);
  });
  it("a stale API timestamp downgrades to Partial", () => {
    const { opportunities } = assembleOpportunities({ ...base, llamaPools: [llama({ timestamp: "2026-10-23T00:00:00.000Z" })], mainnet });
    const s = opportunities.find((o) => o.id === "mezo-smusd-savings")!;
    expect(s.freshness).toBe("stale");
    expect(s.confidence.label).toBe("Partial");
  });
  it("missing sources yield Unavailable metrics, never zeros", () => {
    const { opportunities } = assembleOpportunities({ ...base, llamaPools: null, mainnet: null });
    const pool = opportunities.find((o) => o.id === "pool-btc-musd")!;
    expect(pool.tvlUsd.value).toBeNull();
    expect(pool.base.value).toBeNull();
    const vault = opportunities.find((o) => o.id === "mezo-smusd-savings")!;
    expect(vault.advertised.value).toBeNull();
    expect(vault.missing).toContain("DefiLlama pool data");
    expect(vault.confidence.label).toBe("Partial");
  });
  it("pool incentives are 'not verified' and the pool is Partial even with on-chain reserves", () => {
    const { opportunities } = assembleOpportunities({ ...base, llamaPools: [], mainnet });
    const pool = opportunities.find((o) => o.id === "pool-btc-musd")!;
    expect(pool.incentive.status).toBe("not_verified");
    expect(pool.tvlUsd.value).toBeGreaterThan(100_000);
    expect(pool.confidence.label).toBe("Partial");
  });
  it("realised fee APR: fees over the window / TVL, annualised", () => {
    // 7 days, 0.000667 BTC + 54.45 MUSD fees ≈ $107.8 on ≈ $119.6k TVL → ≈ 4.7% APR
    const apr = feeAprFromWindow(
      { poolId: "pool-btc-musd", windowDays: 7, fromBlock: "0", toBlock: "1", fromTime: "2026-10-19T12:00:00Z", toTime: "2026-10-26T12:00:00Z", fees0: "0.000666871229578126", fees1: "54.453941870859062098", volume0In: "0", volume1In: "0", swaps: 387, computedAt: NOW.toISOString() },
      mainnet.pools["pool-btc-musd"]!,
      80_000,
    )!;
    expect(apr).toBeGreaterThan(0.046);
    expect(apr).toBeLessThan(0.048);
  });
  it("flags market-level discrepancies (BTC oracle vs pool spot)", () => {
    const { discrepancies } = assembleOpportunities({ ...base, llamaPools: [], mainnet });
    const btc = discrepancies.find((d) => d.id === "btc-price")!;
    expect(btc.primarySourceId).toBe("oracle-mainnet");
    expect(btc.values.length).toBe(2);
    expect(btc.flagged).toBe(false); // 80,000 vs 80,595 is within 1%
  });
});

describe("alerts", () => {
  const { opportunities } = assembleOpportunities({ ...base, llamaPools: [llama({})], mainnet });
  const s = opportunities.find((o) => o.id === "mezo-smusd-savings")!;
  const loop = opportunities.find((o) => o.id === "musd-loop-smusd")!;
  it("yield below threshold triggers; above passes", () => {
    expect(evaluateAlert("yield_below", 0.05, s, {}).state).toBe("triggered");
    expect(evaluateAlert("yield_below", 0.01, s, {}).state).toBe("ok");
  });
  it("missing inputs are 'unavailable', never a silent pass", () => {
    expect(evaluateAlert("borrow_above", 0.02, s, {}).state).toBe("unavailable");
    expect(evaluateAlert("yield_below", 0.05, undefined, {}).state).toBe("unavailable");
    expect(evaluateAlert("net_negative", null, s, { projection: null }).state).toBe("unavailable");
  });
  it("borrow cost above threshold and parameter changes", () => {
    expect(evaluateAlert("borrow_above", 0.005, loop, {}).state).toBe("triggered");
    const baseline = { ...paramFingerprint(loop), mcr: 1.2 };
    expect(evaluateAlert("param_change", null, loop, { baseline }).state).toBe("triggered");
    expect(evaluateAlert("param_change", null, loop, { baseline: paramFingerprint(loop) }).state).toBe("ok");
  });
});
