import { describe, expect, it } from "vitest";
import { assessConfidence, freshness } from "@/lib/engine/confidence";
import { compareSources } from "@/lib/engine/discrepancy";
import { coverage, dailyLast, rangeAvailable } from "@/lib/engine/history";
import { assessRisk, RiskEvidence } from "@/lib/engine/risk";
import { median, stdev } from "@/lib/engine/stats";
import { metric, unavailable, hasValue } from "@/lib/engine/types";

const NOW = new Date("2026-10-26T12:00:00Z");

describe("stale data", () => {
  it("classifies freshness by age", () => {
    expect(freshness("2026-10-26T09:00:00Z", NOW)).toBe("fresh");
    expect(freshness("2026-10-25T20:00:00Z", NOW)).toBe("aging");
    expect(freshness("2026-10-24T12:00:00Z", NOW)).toBe("stale");
    expect(freshness(null, NOW)).toBe("unknown");
    expect(freshness("not a date", NOW)).toBe("unknown");
    expect(freshness("2026-10-26T09:00:00Z", NOW, { freshHours: 1, staleHours: 2 })).toBe("stale");
  });
  it("stale or untimestamped sources cannot be Verified", () => {
    const ok = { dataKind: "live" as const, crossCheckedOnChain: true, primaryOnChain: false, missingCritical: [] };
    expect(assessConfidence({ ...ok, freshness: "fresh" }).label).toBe("Verified");
    expect(assessConfidence({ ...ok, freshness: "stale" }).label).toBe("Partial");
    expect(assessConfidence({ ...ok, freshness: "unknown" }).label).toBe("Partial");
  });
});

describe("confidence labels", () => {
  it("Demo for synthetic data regardless of other fields", () => {
    expect(assessConfidence({ dataKind: "demo", crossCheckedOnChain: true, primaryOnChain: true, missingCritical: [], freshness: "fresh" }).label).toBe("Demo");
  });
  it("API-only values are Partial with a stated reason", () => {
    const r = assessConfidence({ dataKind: "live", crossCheckedOnChain: false, primaryOnChain: false, missingCritical: [], freshness: "fresh" });
    expect(r.label).toBe("Partial");
    expect(r.reasons.join(" ")).toMatch(/not independently verified/);
  });
  it("missing critical fields force Partial", () => {
    const r = assessConfidence({ dataKind: "live", crossCheckedOnChain: false, primaryOnChain: true, missingCritical: ["incentive APR"], freshness: "fresh" });
    expect(r.label).toBe("Partial");
    expect(r.reasons[0]).toMatch(/incentive APR/);
  });
});

describe("missing data", () => {
  it("unavailable metrics carry null, never 0", () => {
    const m = unavailable("RPC timeout");
    expect(m.value).toBeNull();
    expect(m.status).toBe("unavailable");
    expect(hasValue(m)).toBe(false);
    expect(metric(undefined, null).value).toBeNull();
    expect(hasValue(metric(0, null))).toBe(true); // a real zero is still a value
  });
  it("summary statistics refuse to summarise tiny datasets", () => {
    expect(median([0.05, null, 0.07])).toBeNull();
    expect(median([0.01, 0.03, 0.02])!.toString()).toBe("0.02");
    expect(median([1, 2, 3, 4])!.toString()).toBe("2.5");
    expect(median([1, 2], 2)!.toString()).toBe("1.5");
    expect(stdev([1])).toBeNull();
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])!.toFixed(4)).toBe("2.1381");
  });
});

describe("inconsistent sources", () => {
  it("agree within tolerance", () => {
    const r = compareSources(
      [
        { sourceId: "defillama", label: "DefiLlama", value: "0.0423157" },
        { sourceId: "onchain", label: "On-chain yieldIndex (7d)", value: "0.0416322" },
      ],
      { primarySourceId: "defillama", relTolerance: "0.05" },
    );
    expect(r.status).toBe("agree");
    expect(r.flagged).toBe(false);
    expect(r.maxRelativeDiff!.toFixed(4)).toBe("0.0162");
  });
  it("flags disagreement and keeps every value visible", () => {
    const r = compareSources(
      [
        { sourceId: "oracle", label: "Mezo PriceFeed", value: 79551.89 },
        { sourceId: "llama", label: "DefiLlama coins", value: 77118.87 },
        { sourceId: "pool", label: "BTC/MUSD pool spot", value: 81028 },
      ],
      { primarySourceId: "oracle", relTolerance: "0.01" },
    );
    expect(r.status).toBe("disagree");
    expect(r.values).toHaveLength(3);
    expect(r.primaryValue!.toString()).toBe("79551.89");
    expect(r.maxRelativeDiff!.toNumber()).toBeGreaterThan(0.03);
  });
  it("absolute tolerance for rates in percentage points", () => {
    const r = compareSources(
      [
        { sourceId: "a", label: "A", value: "0.0165" },
        { sourceId: "b", label: "B", value: "0.0157" },
      ],
      { primarySourceId: "a", relTolerance: "0.01", absTolerance: "0.002" },
    );
    expect(r.flagged).toBe(false);
  });
  it("single source / no data are reported as such", () => {
    expect(compareSources([{ sourceId: "a", label: "A", value: 1 }, { sourceId: "b", label: "B", value: null }], { primarySourceId: "a" }).status).toBe("single_source");
    expect(compareSources([{ sourceId: "a", label: "A", value: null }], { primarySourceId: "a" }).status).toBe("no_data");
  });
});

describe("history coverage (no fabrication)", () => {
  const pts = Array.from({ length: 20 }, (_, i) => ({ t: new Date(NOW.getTime() - i * 86_400_000).toISOString(), v: i }));
  it("counts samples and coverage within a window", () => {
    const c = coverage(pts, 30, NOW);
    expect(c.samples).toBe(20);
    expect(c.distinctDays).toBe(20);
    expect(c.coveragePct).toBeCloseTo(20 / 30, 6);
    expect(c.longestGapDays).toBe(10);
  });
  it("offers a range only when real data reaches back that far", () => {
    expect(rangeAvailable(pts, 7, NOW)).toBe(true);
    expect(rangeAvailable(pts, 30, NOW)).toBe(false);
    expect(rangeAvailable(pts.slice(0, 1), 7, NOW)).toBe(false);
  });
  it("collapses intraday duplicates to the latest daily observation", () => {
    const d = dailyLast([
      { t: "2026-10-25T01:00:00Z", v: 1 },
      { t: "2026-10-25T23:00:00Z", v: 2 },
      { t: "2026-10-26T02:00:00Z", v: 3 },
    ]);
    expect(d.map((p) => p.v)).toEqual([2, 3]);
  });
});

describe("risk profile", () => {
  const ev: RiskEvidence = {
    audits: { status: "audited", links: [{ label: "Audit", url: "https://example.org" }] },
    ageDays: 400,
    dependencies: { items: ["MUSD"], level: "few" },
    liquidityUsd: 5_000_000,
    lockDays: 0,
    apyVolatilityPts: 0.5,
    incentiveShare: 0,
    topHolderShare: null,
    leverage: null,
    liquidationExposure: false,
    dataFreshness: "fresh",
    confidence: "Verified",
    incidents: { status: "none_found", links: [] },
    assessedAt: NOW.toISOString(),
  };
  it("overall = most severe known component", () => {
    const r = assessRisk(ev);
    expect(r.category).toBe("Moderate modeled risk"); // liquidity $5M + age 400d
    expect(assessRisk({ ...ev, lockDays: 28 }).category).toBe("Elevated modeled risk");
    expect(assessRisk({ ...ev, incentiveShare: 0.97 }).category).toBe("High modeled risk");
  });
  it("does not score missing evidence: too many unknowns → Insufficient data", () => {
    const r = assessRisk({ ...ev, liquidityUsd: null, apyVolatilityPts: null, incentiveShare: null, audits: { status: "unknown", links: [] }, ageDays: null });
    expect(r.category).toBe("Insufficient data");
    expect(r.missing.length).toBeGreaterThan(3);
  });
  it("never rates an unaudited or unknown-audit protocol below Elevated", () => {
    const r = assessRisk({ ...ev, audits: { status: "unknown", links: [] }, liquidityUsd: 50_000_000, ageDays: 1000 });
    expect(r.category).toBe("Elevated modeled risk");
    expect(assessRisk({ ...ev, audits: { status: "unaudited", links: [] } }).category).toBe("High modeled risk");
  });
  it("leverage with a thin health factor is high risk", () => {
    const r = assessRisk({ ...ev, leverage: { ratio: 3, healthFactor: 1.1 }, liquidationExposure: true });
    expect(r.components.find((c) => c.id === "liquidation")!.level).toBe("high");
    expect(r.category).toBe("High modeled risk");
  });
  it("never uses the word safe", () => {
    const text = JSON.stringify(assessRisk(ev));
    expect(/\bsafe\b/i.test(text.replace(/safety/gi, ""))).toBe(false);
  });
});
