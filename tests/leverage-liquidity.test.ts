import { describe, expect, it } from "vitest";
import { analyzeMusdLeverage, equitySensitivity, genericLeverage, musdStressTests } from "@/lib/engine/leverage";
import { getAmountOut, impermanentLoss, lpExitToSingle, PoolState, quoteSwap, slippageCurve, spotPrice } from "@/lib/engine/liquidity";

const MUSD = { mcr: "1.1", ccr: "1.5", issuanceFeePct: "0.001", gasCompensation: 200, minNetDebt: 1800, interestApr: "0.01" };

describe("MUSD leverage & health factor (Mezo parameters read on-chain)", () => {
  const input = { collateralBtc: 1, btcPrice: 80_000, borrowMusd: 20_000, params: MUSD, strategyApr: "0.0423", days: 365 };

  it("computes debt, ICR, health factor and liquidation price", () => {
    const r = analyzeMusdLeverage(input);
    expect(r.issuanceFee.toFixed(2)).toBe("20.00");
    expect(r.netDebt.toFixed(2)).toBe("20020.00");
    expect(r.recordedDebt.toFixed(2)).toBe("20220.00");
    expect(r.icr.toFixed(10)).toBe("3.9564787339");
    expect(r.healthFactor.toFixed(10)).toBe("3.5967988490");
    expect(r.liquidationPrice.toFixed(2)).toBe("22242.00");
    expect(r.distanceToLiquidation.toFixed(6)).toBe("0.721975");
    expect(r.maxBorrowAtMcr.toFixed(6)).toBe("72454.817909");
    expect(r.leverageRatio.toFixed(10)).toBe("1.2503125781");
  });

  it("nets yield against interest on the full recorded debt and the issuance fee", () => {
    // 20,000 × 4.23% = 846; interest 20,220 × 1% = 202.20; fee 20 → 623.80
    const r = analyzeMusdLeverage(input);
    expect(r.grossYield.toFixed(2)).toBe("846.00");
    expect(r.borrowInterest.toFixed(2)).toBe("202.20");
    expect(r.netYield.toFixed(2)).toBe("623.80");
    expect(r.warnings).toHaveLength(0);
  });

  it("break-even strategy APR makes net exactly zero", () => {
    const r = analyzeMusdLeverage({ ...input, txCosts: 5, exitSlippagePct: "0.002" });
    const z = analyzeMusdLeverage({ ...input, txCosts: 5, exitSlippagePct: "0.002", strategyApr: r.breakEvenStrategyApr });
    expect(z.netYield.abs().lessThan("0.000001")).toBe(true);
  });

  it("flags positions below MCR / CCR / min debt and negative carry", () => {
    expect(analyzeMusdLeverage({ ...input, borrowMusd: 1000 }).warnings.map((w) => w.code)).toContain("below_min_net_debt");
    const tight = analyzeMusdLeverage({ ...input, borrowMusd: 60_000 });
    expect(tight.icr.toFixed(6)).toBe("1.327580");
    expect(tight.warnings.map((w) => w.code)).toContain("below_ccr");
    expect(analyzeMusdLeverage({ ...input, borrowMusd: 75_000 }).warnings.map((w) => w.code)).toContain("below_mcr");
    expect(analyzeMusdLeverage({ ...input, strategyApr: "0.005" }).warnings.map((w) => w.code)).toContain("negative_carry");
  });

  it("stress tests: price, yield, borrow-rate and liquidity shocks", () => {
    const rows = musdStressTests({ ...input, borrowMusd: 60_000 });
    const price20 = rows.find((r) => r.kind === "price" && r.shock === "-0.2")!;
    expect(price20.result.icr.toFixed(6)).toBe("1.062064");
    expect(price20.liquidatable).toBe(true);
    expect(rows.find((r) => r.kind === "price" && r.shock === "-0.1")!.liquidatable).toBe(false);
    const yieldZero = rows.find((r) => r.kind === "yield" && r.shock === "-1")!;
    expect(yieldZero.result.grossYield.toFixed(2)).toBe("0.00");
    expect(yieldZero.result.netYield.isNegative()).toBe(true);
    const borrowUp = rows.find((r) => r.kind === "borrow" && r.shock === "0.04")!;
    expect(borrowUp.result.scenario.interestApr.toFixed(2)).toBe("0.05");
    const liq = rows.find((r) => r.kind === "liquidity" && r.shock === "0.05")!;
    expect(liq.result.exitSlippage.greaterThan(0)).toBe(true);
    expect(rows).toHaveLength(14);
  });

  it("leverage amplifies equity moves", () => {
    const s = equitySensitivity(1, 80_000, 60_060, 60_000, "-0.2");
    expect(s.unleveredChangePct.toFixed(2)).toBe("-0.20");
    expect(s.leveredChangePct!.lessThan(-0.2)).toBe(true);
  });

  it("generic lending-market health factor", () => {
    const r = genericLeverage({ collateralAmount: 10, collateralPrice: 2000, debt: 10_000, liquidationThreshold: "0.8" });
    expect(r.healthFactor!.toFixed(2)).toBe("1.60");
    expect(r.liquidationPrice!.toFixed(2)).toBe("1250.00");
    expect(r.loanToValue.toFixed(2)).toBe("0.50");
    expect(genericLeverage({ collateralAmount: 1, collateralPrice: 1, debt: 0, liquidationThreshold: "0.8" }).healthFactor).toBeNull();
  });
});

// Live Mezo mainnet pool state & Pool.getAmountOut results captured at block 12,768,754.
const MUSDC_MUSD: PoolState = {
  reserve0: 4_801_656_325n,
  reserve1: 6_849_312_119_280_502_311_246n,
  scale0: 1_000_000n,
  scale1: 10n ** 18n,
  stable: true,
  feeBps: 2n,
};
const BTC_MUSD: PoolState = {
  reserve0: 744_816_351_348_002_701n,
  reserve1: 60_028_551_708_285_583_041_860n,
  scale0: 10n ** 18n,
  scale1: 10n ** 18n,
  stable: false,
  feeBps: 30n,
};

describe("liquidity & slippage — exact match with on-chain Pool.getAmountOut", () => {
  it("stable pool: 1,000 MUSD → 961.917158 mUSDC (on-chain: 961917158)", () => {
    expect(getAmountOut(MUSDC_MUSD, 1000n * 10n ** 18n, false)).toBe(961_917_158n);
  });
  it("stable pool: 1,000 mUSDC → 1,002.579950635998451157 MUSD (on-chain)", () => {
    expect(getAmountOut(MUSDC_MUSD, 1000n * 10n ** 6n, true)).toBe(1_002_579_950_635_998_451_157n);
  });
  it("volatile pool: 5,000 MUSD → 0.057109778098719157 BTC (on-chain)", () => {
    expect(getAmountOut(BTC_MUSD, 5000n * 10n ** 18n, false)).toBe(57_109_778_098_719_157n);
  });
  it("volatile pool: 0.1 BTC → 7,086.714893990106658039 MUSD (on-chain)", () => {
    expect(getAmountOut(BTC_MUSD, 10n ** 17n, true)).toBe(7_086_714_893_990_106_658_039n);
  });
  it("decomposes slippage into fee and price impact", () => {
    const q = quoteSwap(BTC_MUSD, 5000, false);
    expect(q.feePaid.toFixed(2)).toBe("15.00");
    expect(q.totalSlippagePct.greaterThan(q.priceImpactPct)).toBe(true);
    expect(q.totalSlippagePct.toNumber()).toBeGreaterThan(0.003);
    // spot = reserve1/reserve0 for volatile pools
    expect(spotPrice(BTC_MUSD, true).toFixed(2)).toBe("80595.10");
  });
  it("slippage grows with size", () => {
    const curve = slippageCurve(MUSDC_MUSD, [10, 1000, 5000], false);
    const s = curve.map((c) => c.quote!.totalSlippagePct.toNumber());
    expect(s[0]!).toBeLessThan(s[1]!);
    expect(s[1]!).toBeLessThan(s[2]!);
  });
  it("LP exit to a single asset: tiny share ≈ fee-only, large share is expensive", () => {
    const small = lpExitToSingle(BTC_MUSD, "0.0001", false);
    const large = lpExitToSingle(BTC_MUSD, "0.3", false);
    expect(small.slippagePct!.toNumber()).toBeLessThan(0.002);
    expect(large.slippagePct!.toNumber()).toBeGreaterThan(small.slippagePct!.toNumber());
    expect(lpExitToSingle(BTC_MUSD, 1, false).drainsPool).toBe(true);
  });
  it("rejects empty pools and bad fees", () => {
    expect(() => getAmountOut({ ...BTC_MUSD, reserve0: 0n }, 1n, true)).toThrow();
    expect(() => getAmountOut({ ...BTC_MUSD, feeBps: 301n }, 1n, true)).toThrow();
  });
  it("impermanent loss for a 50/50 constant-product position", () => {
    expect(impermanentLoss(4).toFixed(6)).toBe("-0.200000");
    expect(impermanentLoss("0.25").toFixed(6)).toBe("-0.200000");
    expect(impermanentLoss(1).toFixed(6)).toBe("0.000000");
    expect(impermanentLoss(2).toFixed(12)).toBe("-0.057190958418");
  });
});
