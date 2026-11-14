import { describe, expect, it } from "vitest";
import { calculateNetReturn, NetReturnInput } from "@/lib/engine/returns";
import { incentiveDependence, incentiveSensitivity, rateChangeSensitivity } from "@/lib/engine/scenarios";

const base: NetReturnInput = {
  capital: 10_000,
  days: 365,
  baseRate: { value: "0.05", basis: "APR" },
  incentiveRate: { value: 0, basis: "APR" },
};

describe("net return calculation", () => {
  it("A: 10,000 at 5% APR for a year with 10 + 10 tx costs → net 480 (4.8%)", () => {
    const r = calculateNetReturn({ ...base, entryCost: 10, exitCost: 10 });
    expect(r.grossEarnings!.toFixed(2)).toBe("500.00");
    expect(r.totalCosts.toFixed(2)).toBe("20.00");
    expect(r.netProfit!.toFixed(2)).toBe("480.00");
    expect(r.endingValue!.toFixed(2)).toBe("10480.00");
    expect(r.netReturn!.toFixed(4)).toBe("0.0480");
    expect(r.annualizedSimple!.toFixed(4)).toBe("0.0480");
    expect(r.status).toBe("complete");
  });

  it("B: an APY quote is converted to APR before a non-compounded projection (no overstatement)", () => {
    const r = calculateNetReturn({ ...base, baseRate: { value: "0.0512674964674", basis: "APY" } });
    expect(r.grossEarnings!.toFixed(2)).toBe("500.00"); // not 512.67
  });

  it("D: costs larger than yield produce an honest negative return", () => {
    // 1,000 at 3% APR for 30 days = 2.465753…; costs 10 → net −7.534246575342
    const r = calculateNetReturn({ capital: 1000, days: 30, baseRate: { value: "0.03", basis: "APR" }, incentiveRate: { value: 0, basis: "APR" }, entryCost: 5, exitCost: 5 });
    expect(r.netProfit!.toFixed(12)).toBe("-7.534246575342");
    expect(r.netReturn!.isNegative()).toBe(true);
    expect(r.annualizedSimple!.toFixed(6)).toBe("-0.091667");
    expect(r.warnings.map((w) => w.code)).toContain("negative_net_return");
    expect(r.warnings.map((w) => w.code)).toContain("costs_exceed_yield");
  });

  it("I: protocol fees already inside the quoted rate are not subtracted twice", () => {
    const fees = { performanceFeePct: "0.1", withdrawalFeePct: "0.01" };
    const included = calculateNetReturn({ capital: 1000, days: 365, baseRate: { value: "0.1", basis: "APR" }, incentiveRate: { value: 0, basis: "APR" }, protocolFees: { ...fees, includedInQuotedRate: true } });
    expect(included.netProfit!.toFixed(2)).toBe("100.00");
    expect(included.warnings.map((w) => w.code)).toContain("fees_included_in_rate");
    // Not included: perf 10% of 100 = 10; value before exit 1,090 → withdrawal 1% = 10.90 → net 79.10
    const excluded = calculateNetReturn({ capital: 1000, days: 365, baseRate: { value: "0.1", basis: "APR" }, incentiveRate: { value: 0, basis: "APR" }, protocolFees: { ...fees, includedInQuotedRate: false } });
    expect(excluded.costs.performanceFee.toFixed(2)).toBe("10.00");
    expect(excluded.costs.withdrawalFee.toFixed(2)).toBe("10.90");
    expect(excluded.netProfit!.toFixed(2)).toBe("79.10");
  });

  it("J: entry and exit slippage reduce the deployed amount and the exit value", () => {
    // deployed 9,900; gross 495; value before exit 10,395 → exit slip 103.95; entry slip 100 → net 291.05
    const r = calculateNetReturn({ ...base, entrySlippagePct: "0.01", exitSlippagePct: "0.01" });
    expect(r.deployed.toFixed(2)).toBe("9900.00");
    expect(r.costs.entrySlippage.toFixed(2)).toBe("100.00");
    expect(r.costs.exitSlippage.toFixed(2)).toBe("103.95");
    expect(r.netProfit!.toFixed(2)).toBe("291.05");
  });

  it("entry & exit tx costs scale independently of capital", () => {
    const small = calculateNetReturn({ ...base, capital: 100, entryCost: 2, exitCost: 2 });
    const big = calculateNetReturn({ ...base, capital: 100_000, entryCost: 2, exitCost: 2 });
    expect(small.netReturn!.toFixed(4)).toBe("0.0100"); // 5 − 4 = 1 on 100
    expect(big.netReturn!.toFixed(6)).toBe("0.049960");
  });

  it("K: borrowing cost — 1,000 own + 1,000 borrowed at 4% + 0.5% fee into a 6% strategy → net 75", () => {
    const r = calculateNetReturn({
      capital: 1000,
      days: 365,
      baseRate: { value: "0.06", basis: "APR" },
      incentiveRate: { value: 0, basis: "APR" },
      borrow: { amount: 1000, rate: { value: "0.04", basis: "APR" }, oneTimeFeePct: "0.005" },
    });
    expect(r.deployed.toFixed(2)).toBe("2000.00");
    expect(r.grossEarnings!.toFixed(2)).toBe("120.00");
    expect(r.costs.borrowInterest.toFixed(2)).toBe("40.00");
    expect(r.costs.borrowFee.toFixed(2)).toBe("5.00");
    expect(r.borrowingCosts.toFixed(2)).toBe("45.00");
    expect(r.netProfit!.toFixed(2)).toBe("75.00");
    expect(r.netReturn!.toFixed(3)).toBe("0.075");
  });

  it("borrowing interest can accrue on a larger recorded debt (MUSD gas deposit)", () => {
    const r = calculateNetReturn({
      capital: 1000,
      days: 365,
      baseRate: { value: "0.05", basis: "APR" },
      incentiveRate: { value: 0, basis: "APR" },
      borrow: { amount: 2000, rate: { value: "0.01", basis: "APR" }, oneTimeFeePct: "0.001", interestBearingDebt: 2202 },
    });
    expect(r.costs.borrowInterest.toFixed(2)).toBe("22.02");
    expect(r.costs.borrowFee.toFixed(2)).toBe("2.00");
  });

  it("M: modeled impermanent loss is a cost line", () => {
    const r = calculateNetReturn({ ...base, capital: 1000, impermanentLossPct: "0.02" });
    expect(r.costs.impermanentLoss.toFixed(2)).toBe("20.00");
    expect(r.netProfit!.toFixed(2)).toBe("30.00");
  });

  it("validates inputs", () => {
    expect(() => calculateNetReturn({ ...base, capital: 0 })).toThrow();
    expect(() => calculateNetReturn({ ...base, capital: -5 })).toThrow();
    expect(() => calculateNetReturn({ ...base, days: 0 })).toThrow();
    expect(() => calculateNetReturn({ ...base, days: 1.5 })).toThrow();
    expect(() => calculateNetReturn({ ...base, exitSlippagePct: "1.2" })).toThrow();
    expect(() => calculateNetReturn({ ...base, entryCost: -1 })).toThrow();
    expect(() => calculateNetReturn({ ...base, rateChangePct: "-1.5" })).toThrow();
  });
});

describe("compounding", () => {
  const c = { capital: 1000, days: 365, baseRate: { value: "0.1", basis: "APR" as const }, incentiveRate: { value: 0, basis: "APR" as const } };
  it("E: daily compounding of 10% APR for a year → 1,105.15578162", () => {
    const r = calculateNetReturn({ ...c, compounding: "daily", compoundingSupported: true });
    expect(r.endingValue!.toFixed(8)).toBe("1105.15578162");
    expect(r.compoundingEvents).toBe(365);
  });
  it("F: weekly → 1,105.06479278 and monthly 12% → 1,126.82503013", () => {
    expect(calculateNetReturn({ ...c, compounding: "weekly", compoundingSupported: true }).endingValue!.toFixed(8)).toBe("1105.06479278");
    expect(calculateNetReturn({ ...c, baseRate: { value: "0.12", basis: "APR" }, compounding: "monthly", compoundingSupported: true }).endingValue!.toFixed(8)).toBe("1126.82503013");
  });
  it("G: skips reinvestments whose cost exceeds the period's earnings", () => {
    const r = calculateNetReturn({ ...c, capital: 100, compounding: "daily", compoundingSupported: true, reinvestCost: "0.05" });
    expect(r.compoundingEvents).toBe(0);
    expect(r.grossEarnings!.toFixed(8)).toBe("10.00000000");
    expect(r.warnings.map((w) => w.code)).toContain("compounding_cost_exceeds_earnings");
  });
  it("reinvestment fees are charged per event and reduce net", () => {
    const r = calculateNetReturn({ ...c, capital: 100_000, compounding: "monthly", compoundingSupported: true, reinvestCost: 5 });
    expect(r.compoundingEvents).toBe(12);
    expect(r.costs.reinvestment.toFixed(2)).toBe("60.00");
  });
  it("H: compounding is refused when the strategy cannot realistically reinvest", () => {
    const r = calculateNetReturn({ ...c, compounding: "daily", compoundingSupported: false });
    expect(r.compoundingApplied).toBe("none");
    expect(r.endingValue!.toFixed(2)).toBe("1100.00");
    expect(r.warnings.map((w) => w.code)).toContain("compounding_unsupported");
  });
});

describe("incentive price sensitivity", () => {
  it("C: 2% base + 10% incentives on 1,000 for a year with 10 of costs → 110 / 85 / 60 / 10", () => {
    const rows = incentiveSensitivity({
      capital: 1000,
      days: 365,
      baseRate: { value: "0.02", basis: "APR" },
      incentiveRate: { value: "0.1", basis: "APR" },
      entryCost: 5,
      exitCost: 5,
    });
    expect(rows.map((r) => r.id)).toEqual(["current", "minus25", "minus50", "zero"]);
    expect(rows.map((r) => r.result.netProfit!.toFixed(2))).toEqual(["110.00", "85.00", "60.00", "10.00"]);
    expect(rows[3]!.result.incentiveEarnings!.toFixed(2)).toBe("0.00");
    expect(incentiveDependence(rows[0]!.result)!.toFixed(4)).toBe("0.8333");
  });
});

describe("variable-rate scenarios", () => {
  it("N: rate changes apply to the base yield for the whole horizon", () => {
    const rows = rateChangeSensitivity({ capital: 1000, days: 365, baseRate: { value: "0.1", basis: "APR" }, incentiveRate: { value: 0, basis: "APR" } });
    expect(rows.map((r) => r.result.appliedBaseApr!.toFixed(3))).toEqual(["0.050", "0.075", "0.100", "0.125"]);
    expect(rows.map((r) => r.result.netProfit!.toFixed(2))).toEqual(["50.00", "75.00", "100.00", "125.00"]);
  });
});

describe("missing data is never treated as zero", () => {
  it("L1: unavailable base rate → partial result with base excluded, not zero", () => {
    const r = calculateNetReturn({ capital: 1000, days: 365, baseRate: null, incentiveRate: { value: "0.1", basis: "APR" } });
    expect(r.status).toBe("partial");
    expect(r.baseEarnings).toBeNull();
    expect(r.incentiveEarnings!.toFixed(2)).toBe("100.00");
    expect(r.warnings.map((w) => w.code)).toContain("base_rate_unavailable");
  });
  it("L2: unknown incentives are flagged, distinct from a verified zero", () => {
    const unknown = calculateNetReturn({ capital: 1000, days: 365, baseRate: { value: "0.05", basis: "APR" }, incentiveRate: null });
    const zero = calculateNetReturn({ capital: 1000, days: 365, baseRate: { value: "0.05", basis: "APR" }, incentiveRate: { value: 0, basis: "APR" } });
    expect(unknown.status).toBe("partial");
    expect(unknown.incentiveEarnings).toBeNull();
    expect(zero.status).toBe("complete");
    expect(zero.incentiveEarnings!.toFixed(2)).toBe("0.00");
  });
  it("L3: no rates at all → insufficient data with null net, never 0", () => {
    const r = calculateNetReturn({ capital: 1000, days: 365, baseRate: null, incentiveRate: null, entryCost: 3 });
    expect(r.status).toBe("insufficient_data");
    expect(r.netProfit).toBeNull();
    expect(r.netReturn).toBeNull();
    expect(r.annualizedSimple).toBeNull();
  });
});
