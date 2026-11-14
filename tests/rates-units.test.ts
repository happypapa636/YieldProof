import { describe, expect, it } from "vitest";
import { Decimal, EngineInputError } from "@/lib/engine/decimal";
import { annualizeCompound, annualizeSimple, aprToApy, apyToApr, toSimpleApr, trailingIndexApr } from "@/lib/engine/rates";
import { formatBaseUnits, fromBaseUnits, rescale, scaleToDecimals, toBaseUnits } from "@/lib/engine/units";

describe("APR ↔ APY (manually verified)", () => {
  it("12% APR compounded monthly = 12.6825030132% APY  [(1.01)^12 − 1]", () => {
    expect(aprToApy("0.12", 12).toFixed(10)).toBe("0.1268250301");
  });
  it("5% APR compounded daily = 5.1267496467% APY", () => {
    expect(aprToApy("0.05", 365).toFixed(10)).toBe("0.0512674965");
  });
  it("round-trips APY → APR with the same basis", () => {
    expect(apyToApr(aprToApy("0.12", 12), 12).toFixed(12)).toBe("0.120000000000");
    expect(apyToApr("0.0512674964674", 365).toFixed(6)).toBe("0.050000");
  });
  it("APR basis passes through untouched; APY basis is converted (defaults to daily)", () => {
    expect(toSimpleApr({ value: "0.07", basis: "APR" }).toString()).toBe("0.07");
    expect(toSimpleApr({ value: "0.126825030131969720661201", basis: "APY", compoundsPerYear: 12 }).toFixed(10)).toBe("0.1200000000");
    expect(toSimpleApr({ value: "0.0512674964674", basis: "APY" }).toFixed(6)).toBe("0.050000");
  });
  it("an APY is always ≥ its APR for positive rates (never mixes them silently)", () => {
    const apr = new Decimal("0.2");
    expect(aprToApy(apr, 365).greaterThan(apr)).toBe(true);
    expect(apyToApr(apr, 365).lessThan(apr)).toBe(true);
  });
  it("rejects nonsensical rates", () => {
    expect(() => aprToApy("-1", 12)).toThrow(EngineInputError);
    expect(() => aprToApy("2000", 12)).toThrow(EngineInputError);
    expect(() => aprToApy("0.1", 0)).toThrow(EngineInputError);
    expect(() => toSimpleApr({ value: Number.NaN, basis: "APR" })).toThrow(EngineInputError);
  });
  it("annualises simply and by compounding", () => {
    expect(annualizeSimple("0.01", 30).toFixed(10)).toBe("0.1216666667");
    expect(annualizeCompound("0.01", 365)!.toFixed(10)).toBe("0.0100000000");
    expect(annualizeCompound("-1", 30)).toBeNull();
  });
  it("trailing index APR reproduces the sMUSD on-chain yieldIndex example", () => {
    // Mezo mainnet sMUSD yieldIndex: 215055813201967573 @ 2026-10-18T23:46:35Z → 215867387405979216 @ 2026-10-26T02:32:35Z
    const apr = trailingIndexApr({
      indexStart: 215055813201967573n,
      indexEnd: 215867387405979216n,
      indexScale: 10n ** 18n,
      unitValue: 1,
      seconds: 614_760,
    });
    expect(apr.toFixed(8)).toBe("0.04163219");
    expect(() => trailingIndexApr({ indexStart: 2n, indexEnd: 1n, indexScale: 1n, unitValue: 1, seconds: 1 })).toThrow();
  });
});

describe("token decimal handling (bigint base units)", () => {
  it("parses human amounts exactly", () => {
    expect(toBaseUnits("1.5", 18)).toBe(1_500_000_000_000_000_000n);
    expect(toBaseUnits("50", 18)).toBe(50n * 10n ** 18n);
    expect(toBaseUnits("1000.123456", 6)).toBe(1_000_123_456n);
    expect(toBaseUnits("0", 0)).toBe(0n);
  });
  it("rejects excess precision instead of silently truncating", () => {
    expect(() => toBaseUnits("1.1234567", 6)).toThrow(/decimal places/);
    expect(() => toBaseUnits("-1", 18)).toThrow();
    expect(() => toBaseUnits("1e18", 18)).toThrow();
    expect(() => toBaseUnits("abc", 18)).toThrow();
  });
  it("validates decimals", () => {
    expect(() => toBaseUnits("1", 37)).toThrow();
    expect(() => fromBaseUnits(1n, -1)).toThrow();
    expect(() => fromBaseUnits(1n, 1.5)).toThrow();
  });
  it("converts base units to exact decimals and formats without floats", () => {
    expect(fromBaseUnits(961_917_158n, 6).toString()).toBe("961.917158");
    expect(fromBaseUnits(1n, 18).toString()).toBe("0.000000000000000001");
    expect(formatBaseUnits(1_234_567_890_000_000_000_000n, 18, 2)).toBe("1,234.56");
    expect(formatBaseUnits(-5_000_000n, 6)).toBe("-5");
  });
  it("maps on-chain 10**decimals scales to decimals", () => {
    expect(scaleToDecimals(1_000_000n)).toBe(6);
    expect(scaleToDecimals(10n ** 18n)).toBe(18);
    expect(() => scaleToDecimals(1_000_001n)).toThrow();
  });
  it("rescales between token decimals (floor when scaling down)", () => {
    expect(rescale(1_999_999_999_999_999_999n, 18, 6)).toBe(1_999_999n);
    expect(rescale(5n, 6, 18)).toBe(5_000_000_000_000n);
  });
});
