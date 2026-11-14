import { z } from "zod";
import { fixed } from "@/lib/engine/decimal";
import { ComparisonCsvRow, comparisonCsv } from "@/lib/engine/csv";
import { Assumptions, DEFAULT_ASSUMPTIONS, Projection, projectOpportunity, ProjectionContext } from "./projection";
import type { Opportunity } from "./types";

/**
 * Comparison parameters — the single schema used by share links, saved
 * comparisons, CSV export and OG cards. Contains no wallet or personal data.
 */

const idRe = /^[a-z0-9-]{3,80}$/;

export const assumptionsSchema = z.object({
  capital: z.number().finite().min(1).max(100_000_000),
  days: z.number().int().min(1).max(3650),
  compounding: z.enum(["none", "daily", "weekly", "monthly"]),
  incentiveScenario: z.enum(["current", "minus25", "minus50", "zero"]),
  incentivePriceFactor: z.number().finite().min(0).max(5).nullable(),
  rateChangePct: z.number().finite().min(-1).max(5),
  startFrom: z.enum(["deposit-asset", "musd"]),
  txCostOverride: z.number().finite().min(0).max(10_000).nullable(),
  exitStress: z.number().finite().min(1).max(20),
  borrowAprOverride: z.number().finite().min(0).max(2).nullable(),
  leverageLtv: z.number().finite().min(0.05).max(0.9).nullable(),
  lpPriceMovePct: z.number().finite().min(0).max(3),
});

export const comparisonSchema = z.object({
  ids: z.array(z.string().regex(idRe)).min(1).max(4),
  assumptions: assumptionsSchema,
});
export type ComparisonParams = z.infer<typeof comparisonSchema>;

const KEYS: Record<keyof Assumptions, string> = {
  capital: "cap",
  days: "d",
  compounding: "c",
  incentiveScenario: "inc",
  incentivePriceFactor: "ipf",
  rateChangePct: "rate",
  startFrom: "from",
  txCostOverride: "tx",
  exitStress: "stress",
  borrowAprOverride: "bapr",
  leverageLtv: "ltv",
  lpPriceMovePct: "lpm",
};

export function encodeComparison(p: ComparisonParams): string {
  const q = new URLSearchParams();
  q.set("ids", p.ids.join(","));
  for (const [k, short] of Object.entries(KEYS) as [keyof Assumptions, string][]) {
    const v = p.assumptions[k];
    if (v === null || v === DEFAULT_ASSUMPTIONS[k]) continue;
    q.set(short, String(v));
  }
  return q.toString();
}

/** Lenient decoder for URLs: invalid values fall back to defaults instead of erroring. */
export function decodeComparison(search: URLSearchParams | Record<string, string | string[] | undefined>): ComparisonParams {
  const get = (k: string): string | undefined => {
    if (search instanceof URLSearchParams) return search.get(k) ?? undefined;
    const v = search[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const ids = (get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => idRe.test(s))
    .slice(0, 4);
  const a: Assumptions = { ...DEFAULT_ASSUMPTIONS };
  const num = (s: string | undefined) => (s === undefined || s === "" ? undefined : Number(s));
  const set = <K extends keyof Assumptions>(k: K, v: Assumptions[K] | undefined) => {
    if (v === undefined) return;
    const trial = { ...a, [k]: v };
    if (assumptionsSchema.safeParse(trial).success) a[k] = v;
  };
  set("capital", num(get("cap")));
  set("days", num(get("d")));
  set("compounding", get("c") as Assumptions["compounding"] | undefined);
  set("incentiveScenario", get("inc") as Assumptions["incentiveScenario"] | undefined);
  set("incentivePriceFactor", num(get("ipf")) ?? undefined);
  set("rateChangePct", num(get("rate")));
  set("startFrom", get("from") as Assumptions["startFrom"] | undefined);
  set("txCostOverride", num(get("tx")) ?? undefined);
  set("exitStress", num(get("stress")));
  set("borrowAprOverride", num(get("bapr")) ?? undefined);
  set("leverageLtv", num(get("ltv")) ?? undefined);
  set("lpPriceMovePct", num(get("lpm")));
  return { ids, assumptions: a };
}

export function projectAll(opps: Opportunity[], ids: string[], a: Assumptions, ctx: ProjectionContext) {
  const out: { opp: Opportunity; projection: Projection | null; error: string | null }[] = [];
  for (const id of ids) {
    const opp = opps.find((o) => o.id === id);
    if (!opp) continue;
    try {
      out.push({ opp, projection: projectOpportunity(opp, a, ctx), error: null });
    } catch (e) {
      out.push({ opp, projection: null, error: e instanceof Error ? e.message : "projection failed" });
    }
  }
  return out;
}

export function comparisonCsvFor(rows: { opp: Opportunity; projection: Projection | null }[], a: Assumptions): string {
  const csvRows: ComparisonCsvRow[] = rows.map(({ opp, projection: p }) => ({
    strategy: opp.name,
    protocol: opp.protocol.name,
    network: opp.network,
    dataKind: opp.dataKind,
    capital: a.capital.toFixed(2),
    days: a.days,
    baseEarnings: p?.baseEarnings ? fixed(p.baseEarnings) : null,
    incentiveEarnings: p?.incentiveEarnings ? fixed(p.incentiveEarnings) : null,
    costs: p ? fixed(p.totalCosts) : "Unavailable",
    netResult: p?.netProfit ? fixed(p.netProfit) : null,
    netReturnPct: p?.netReturn ? fixed(p.netReturn.times(100)) : null,
    annualizedPct: p?.annualized ? fixed(p.annualized.times(100)) : null,
    riskCategory: opp.risk.category,
    riskIndicators: opp.risk.components.filter((c) => c.level !== "n/a").map((c) => `${c.label}: ${c.level}`),
    confidence: opp.confidence.label,
    assumptions: p ? p.ledger.map((l) => `${l.label}=${l.value} [${l.source}]`) : [],
    dataSource: opp.sources.map((s) => `${s.name}${s.url ? ` <${s.url}>` : ""}`).join(" | "),
    dataTimestamp: opp.lastUpdated,
  }));
  return comparisonCsv(csvRows);
}
