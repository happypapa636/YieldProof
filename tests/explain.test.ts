import { describe, expect, it } from "vitest";
import { DEMO_STRATEGIES } from "@/lib/demo/strategies";
import { verdictFor, waterfallRanges, waterfallSteps, type WaterfallStep } from "@/lib/model/explain";
import { DEFAULT_ASSUMPTIONS, projectOpportunity } from "@/lib/model/projection";

const ctx = { pools: {}, btcPrice: null };
const project = (i: number, over: Partial<typeof DEFAULT_ASSUMPTIONS> = {}) => {
  const o = DEMO_STRATEGIES[i]!;
  return { o, p: projectOpportunity(o, { ...DEFAULT_ASSUMPTIONS, borrowAprOverride: 0.095, ...over }, ctx) };
};

describe("waterfall", () => {
  it("gains and costs walk from zero to exactly the estimated net", () => {
    for (let i = 0; i < DEMO_STRATEGIES.length; i++) {
      const { o, p } = project(i);
      const ranges = waterfallRanges(waterfallSteps(o, p));
      const net = ranges.at(-1)!;
      expect(net.kind).toBe("net");
      const lastFloating = ranges.filter((r) => r.kind === "gain" || r.kind === "cost").at(-1)!;
      expect(lastFloating.to).toBeCloseTo(net.value, 6);
      expect(net.value).toBeCloseTo(p.netProfit!.toNumber(), 6);
    }
  });

  it("every range keeps the label and value of its own step (no index drift)", () => {
    const steps: WaterfallStep[] = [
      { label: "Advertised", value: 800, kind: "advertised" },
      { label: "Base yield", value: 745.7, kind: "gain" },
      { label: "Incentives", value: 0, kind: "gain", unavailable: true },
      { label: "Transactions", value: -0.09, kind: "cost" },
      { label: "Slippage", value: -1270.18, kind: "cost" },
      { label: "Impermanent loss", value: -38.7, kind: "cost" },
      { label: "Estimated net", value: -563.27, kind: "net" },
    ];
    const r = waterfallRanges(steps);
    expect(r.map((x) => x.label)).toEqual(steps.map((s) => s.label));
    expect(r.find((x) => x.label === "Slippage")).toMatchObject({ from: 745.61, value: -1270.18 });
    expect(r.find((x) => x.label === "Slippage")!.to).toBeCloseTo(-524.57, 2);
    expect(r.find((x) => x.label === "Estimated net")).toMatchObject({ from: 0, to: -563.27 });
    // An unavailable step is zero-width and does not move the running total.
    const inc = r.find((x) => x.label === "Incentives")!;
    expect(inc.from).toBe(inc.to);
    expect(inc.from).toBeCloseTo(745.7, 6);
  });

  it("omits the advertised bar when no rate is published", () => {
    const { o, p } = project(0);
    const steps = waterfallSteps({ ...o, advertised: { ...o.advertised, value: null, status: "unavailable" } }, p);
    expect(steps.some((s) => s.kind === "advertised")).toBe(false);
  });
});

describe("verdict", () => {
  it("states a loss as a loss", () => {
    // Small capital, short horizon and expensive gas: fixed costs dominate.
    const { o, p } = project(0, { capital: 100, days: 7, txCostOverride: 50 });
    expect(p.netProfit!.toNumber()).toBeLessThan(0);
    const v = verdictFor(o, p);
    expect(v.tone).toBe("neg");
    expect(v.headline).toMatch(/you would lose about/);
    expect(v.detail ?? "").toMatch(/biggest cost is transactions/);
  });

  it("names the incentive dependence when most earnings are incentives", () => {
    const i = DEMO_STRATEGIES.findIndex((s) => (s.incentive.value ?? 0) > (s.base.value ?? 0));
    expect(i).toBeGreaterThanOrEqual(0);
    const { o, p } = project(i);
    const v = verdictFor(o, p);
    expect(v.detail ?? "").toMatch(/incentive token/);
  });

  it("refuses to guess when there is no estimate", () => {
    const { o, p } = project(0);
    const v = verdictFor(o, { ...p, netProfit: null });
    expect(v.tone).toBe("muted");
    expect(v.headline).toMatch(/Not enough verified data/);
  });
});
