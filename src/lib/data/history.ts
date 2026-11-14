import { dailyLast } from "@/lib/engine/history";
import { readSnapshots } from "@/lib/db/repo";
import type { Opportunity } from "@/lib/model/types";
import { getPoolChart } from "./dataset";

export interface HistoryPoint {
  t: string;
  advertised: number | null;
  base: number | null;
  incentive: number | null;
  net: number | null;
  tvl: number | null;
  [k: string]: string | number | null;
}

export interface HistoryResult {
  points: HistoryPoint[];
  llamaSamples: number;
  ownSamples: number;
  ownFirst: string | null;
  llamaFirst: string | null;
  notes: string[];
}

/**
 * Real observations only: DefiLlama's archived daily series (advertised/base/
 * incentive/TVL) plus YieldProof's own daily snapshots (including its estimated
 * net under default assumptions). Days without an observation stay empty.
 */
export async function loadHistory(opp: Opportunity): Promise<HistoryResult> {
  const byDay = new Map<string, HistoryPoint>();
  const day = (iso: string) => iso.slice(0, 10);
  const get = (d: string) => {
    let p = byDay.get(d);
    if (!p) {
      p = { t: `${d}T00:00:00.000Z`, advertised: null, base: null, incentive: null, net: null, tvl: null };
      byDay.set(d, p);
    }
    return p;
  };
  const notes: string[] = [];
  let llamaSamples = 0;
  let llamaFirst: string | null = null;
  if (opp.defillamaPoolId) {
    const chart = await getPoolChart(opp.defillamaPoolId);
    if (chart) {
      const daily = dailyLast(chart.map((c) => ({ ...c, t: c.timestamp })));
      llamaSamples = daily.length;
      llamaFirst = daily[0]?.t ?? null;
      for (const c of daily) {
        const p = get(day(c.t));
        p.advertised = c.apy === null ? null : c.apy / 100;
        p.base = c.apyBase === null ? null : c.apyBase / 100;
        p.incentive = c.apyReward === null ? null : c.apyReward / 100;
        p.tvl = c.tvlUsd;
      }
    } else {
      notes.push("DefiLlama history could not be loaded right now.");
    }
  }
  let ownSamples = 0;
  let ownFirst: string | null = null;
  try {
    const rows = await readSnapshots(opp.id);
    const days = new Set<string>();
    for (const r of rows) {
      if (r.value === null) continue;
      const p = get(r.snapshot_day);
      const v = Number(r.value);
      days.add(r.snapshot_day);
      if (r.metric === "net_apr_default") p.net = v;
      // Own observations fill gaps only; DefiLlama's archive stays the primary series where it exists.
      if (r.metric === "advertised_apy" && p.advertised === null) p.advertised = v;
      if (r.metric === "base_rate" && p.base === null) p.base = v;
      if (r.metric === "incentive_rate" && p.incentive === null) p.incentive = v;
      if (r.metric === "tvl_usd" && p.tvl === null) p.tvl = v;
    }
    ownSamples = days.size;
    ownFirst = [...days].sort()[0] ?? null;
  } catch {
    notes.push("YieldProof's own snapshots are unavailable (database unreachable).");
  }
  const points = [...byDay.values()].sort((a, b) => a.t.localeCompare(b.t));
  return { points, llamaSamples, ownSamples, ownFirst, llamaFirst, notes };
}
