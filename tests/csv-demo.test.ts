import { describe, expect, it } from "vitest";
import { COMPARISON_CSV_HEADER, comparisonCsv, escapeCsvCell, toCsv } from "@/lib/engine/csv";
import { DEMO_STRATEGIES } from "@/lib/demo/strategies";
import { DEFAULT_ASSUMPTIONS, projectOpportunity } from "@/lib/model/projection";
import { assertDemoOnly, assertLiveOnly, DataSeparationError, isDemoId } from "@/lib/model/separation";

describe("CSV export", () => {
  it("escapes commas, quotes and newlines (RFC 4180)", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(Number.NaN)).toBe("");
  });
  it("neutralises spreadsheet formulas but keeps negative numbers intact", () => {
    expect(escapeCsvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell("-12.50")).toBe("-12.50");
    expect(escapeCsvCell(-3.5)).toBe("-3.5");
  });
  it("rejects ragged rows", () => {
    expect(() => toCsv(["a", "b"], [["1"]])).toThrow();
  });
  it("produces every column required by spec §19, labels demo rows and contains no wallet data", () => {
    const csv = comparisonCsv([
      {
        strategy: "MUSD Savings Vault (sMUSD)",
        protocol: "Mezo Vaults",
        network: "Mezo Mainnet",
        dataKind: "live",
        capital: "10000.00",
        days: 365,
        baseEarnings: "416.32",
        incentiveEarnings: "0.00",
        costs: "0.06",
        netResult: "416.26",
        netReturnPct: "4.16",
        annualizedPct: "4.16",
        riskCategory: "Moderate modeled risk",
        riskIndicators: ["Liquidity depth: lower", "Withdrawal: lower"],
        confidence: "Verified",
        assumptions: ["1 MUSD = 1 USD", "No compounding"],
        dataSource: "DefiLlama yields API; Mezo mainnet sMUSD yieldIndex",
        dataTimestamp: "2026-10-26T02:01:33.069Z",
      },
      {
        strategy: "Lever Loop",
        protocol: "LeverLoop (fictional)",
        network: "Fictional",
        dataKind: "demo",
        capital: "10000.00",
        days: 365,
        baseEarnings: null,
        incentiveEarnings: null,
        costs: "54.00",
        netResult: null,
        netReturnPct: null,
        annualizedPct: null,
        riskCategory: "High modeled risk",
        riskIndicators: [],
        confidence: "Demo",
        assumptions: [],
        dataSource: "YieldProof synthetic demo dataset",
        dataTimestamp: null,
      },
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(COMPARISON_CSV_HEADER.join(","));
    for (const col of ["Strategy", "Protocol", "Network", "Initial capital", "Time horizon", "base earnings", "Incentive earnings", "costs", "net result", "Risk indicators", "Assumptions", "Data source", "Data timestamp"]) {
      expect(lines[0]).toContain(col);
    }
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Liquidity depth: lower; Withdrawal: lower");
    expect(lines[2]).toContain("Lever Loop (FICTIONAL DEMO)");
    expect(lines[2]).toContain("DEMO — synthetic");
    expect(lines[2]).toContain("Unavailable");
    expect(csv).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(csv.toLowerCase()).not.toMatch(/private|seed|signature|session/);
  });
});

describe("demo vs live data separation", () => {
  it("demo dataset has exactly the four fictional strategies of spec §22, all labeled", () => {
    expect(DEMO_STRATEGIES).toHaveLength(4);
    assertDemoOnly(DEMO_STRATEGIES);
    for (const s of DEMO_STRATEGIES) {
      expect(s.dataKind).toBe("demo");
      expect(s.network).toBe("Fictional");
      expect(s.confidence.label).toBe("Demo");
      expect(s.protocol.name).toMatch(/fictional/i);
      expect(isDemoId(s.id)).toBe(true);
      expect(s.sources.every((src) => src.type === "demo")).toBe(true);
    }
    const kinds = DEMO_STRATEGIES.map((s) => s.strategyType);
    expect(kinds).toEqual(expect.arrayContaining(["lending", "liquidity", "leveraged"]));
    expect(DEMO_STRATEGIES.some((s) => (s.incentive.value ?? 0) > (s.base.value ?? 0))).toBe(true);
    expect(DEMO_STRATEGIES.find((s) => s.strategyType === "liquidity")!.economics.ilModel).toBe("volatile-cp");
    expect(DEMO_STRATEGIES.find((s) => s.strategyType === "leveraged")!.economics.borrow).not.toBeNull();
  });
  it("live guards reject demo rows and vice versa", () => {
    expect(() => assertLiveOnly(DEMO_STRATEGIES)).toThrow(DataSeparationError);
    const fakeLive = { ...DEMO_STRATEGIES[0]!, dataKind: "live" as const };
    expect(() => assertDemoOnly([fakeLive])).toThrow(DataSeparationError);
  });
  it("reveals the key insight: the highest advertised APY is not the highest estimated net", () => {
    const ctx = { pools: {}, btcPrice: null };
    const results = DEMO_STRATEGIES.map((s) => ({ s, p: projectOpportunity(s, DEFAULT_ASSUMPTIONS, ctx) }));
    const byAdvertised = [...results].sort((a, b) => b.s.advertised.value! - a.s.advertised.value!);
    const byNet = [...results].sort((a, b) => b.p.netProfit!.comparedTo(a.p.netProfit!));
    expect(byAdvertised[0]!.s.id).toBe("demo-lever-loop");
    expect(byNet[0]!.s.id).not.toBe(byAdvertised[0]!.s.id);
    // and incentive dependence matters: at zero incentive value the incentive farm is worst
    const zero = DEMO_STRATEGIES.map((s) => ({ s, p: projectOpportunity(s, { ...DEFAULT_ASSUMPTIONS, incentiveScenario: "zero" }, ctx) }));
    const comet = zero.find((z) => z.s.id === "demo-comet-farm")!;
    expect(comet.p.netProfit!.isNegative() || comet.p.netProfit!.lessThan(zero.find((z) => z.s.id === "demo-harbor-lending")!.p.netProfit!)).toBe(true);
  });
  it("leveraged demo exposes a health factor and borrowing costs", () => {
    const lever = DEMO_STRATEGIES.find((s) => s.id === "demo-lever-loop")!;
    const p = projectOpportunity(lever, DEFAULT_ASSUMPTIONS, { pools: {}, btcPrice: null });
    expect(p.genericLeverage!.healthFactor!.toFixed(3)).toBe("1.194");
    expect(p.borrowingCosts.toFixed(2)).toBe("2000.00"); // 20,000 × 9.5% + 0.5% × 20,000
  });
});
