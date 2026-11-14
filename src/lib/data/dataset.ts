import { unstable_cache } from "next/cache";
import { LIVE_DEFINITIONS } from "./registry";
import { assembleOpportunities, COIN, serializePools } from "./assemble";
import { SourceStatus, track } from "./clients";
import { fetchMezoPools, fetchPoolChart, fetchPrices, LlamaChartPoint, LlamaPool } from "./defillama";
import type { FeeWindow } from "./fees";
import { MainnetState, readMainnetState, readTestnetState, TestnetState } from "./onchain";
import { dbConfigured, sql } from "@/lib/db/client";
import { median } from "@/lib/engine/stats";
import { assertLiveOnly } from "@/lib/model/separation";
import type { Discrepancy, Opportunity } from "@/lib/model/types";

export interface LiveDataset {
  generatedAt: string;
  opportunities: Opportunity[];
  discrepancies: Discrepancy[];
  pools: ReturnType<typeof serializePools>;
  mainnet: MainnetState | null;
  testnet: TestnetState | null;
  prices: Record<string, { price: number; observedAt: string }>;
  llama: { method: "full" | "per-pool"; poolCount: number } | null;
  feeWindows: Record<string, FeeWindow | null>;
  sources: SourceStatus[];
  lastCronSuccess: string | null;
}

export async function readFeeWindows(): Promise<Record<string, FeeWindow | null>> {
  if (!dbConfigured()) return {};
  const rows = (await sql()`SELECT pool_id, window_days, data FROM yieldproof.fee_windows WHERE window_days = 7`) as { pool_id: string; data: FeeWindow }[];
  const out: Record<string, FeeWindow | null> = {};
  for (const r of rows) out[r.pool_id] = r.data;
  return out;
}

export async function readLastCronSuccess(): Promise<string | null> {
  if (!dbConfigured()) return null;
  const rows = (await sql()`SELECT finished_at FROM yieldproof.cron_runs WHERE job = 'snapshot' AND status IN ('success','partial') ORDER BY finished_at DESC LIMIT 1`) as { finished_at: string | Date }[];
  const v = rows[0]?.finished_at;
  return v ? new Date(v).toISOString() : null;
}

export async function buildLiveDataset(opts: { discoveryBudgetMs?: number } = {}): Promise<LiveDataset> {
  const now = new Date();
  const sources: SourceStatus[] = [];
  const knownIds = LIVE_DEFINITIONS.map((d) => d.defillamaPoolId).filter((x): x is string => !!x);
  // Charts for known pools start immediately, in parallel with everything else.
  const charts: Record<string, LlamaChartPoint[]> = {};
  const loadChart = async (id: string) => {
    try {
      charts[id] = await fetchPoolChart(id);
    } catch {
      /* volatility unavailable */
    }
  };
  const knownCharts = Promise.all(knownIds.map(loadChart));

  const [llama, mainnet, testnet, prices, feeWindows, lastCron] = await Promise.all([
    track("defillama-yields", "DefiLlama yields API", sources, () => fetchMezoPools(knownIds, { discoveryBudgetMs: opts.discoveryBudgetMs })),
    track("mezo-mainnet", "Mezo mainnet RPC", sources, readMainnetState),
    track("mezo-testnet", "Mezo testnet RPC", sources, readTestnetState),
    track("defillama-coins", "DefiLlama coins API", sources, () => fetchPrices([COIN.BTC, COIN.MUSD, COIN.MEZO])),
    track("database", "YieldProof database (fee windows)", sources, readFeeWindows),
    readLastCronSuccess().catch(() => null),
  ]);

  const llamaPools: LlamaPool[] | null = llama?.pools ?? null;
  await Promise.all([knownCharts, ...(llamaPools ?? []).filter((p) => !knownIds.includes(p.pool)).map((p) => loadChart(p.pool))]);

  const { opportunities, discrepancies } = assembleOpportunities({
    now,
    llamaPools,
    llamaCharts: charts,
    prices,
    mainnet,
    testnet,
    feeWindows: feeWindows ?? {},
  });

  return {
    generatedAt: now.toISOString(),
    opportunities: assertLiveOnly(opportunities),
    discrepancies,
    pools: serializePools(mainnet),
    mainnet,
    testnet,
    prices: prices ?? {},
    llama: llama ? { method: llama.method, poolCount: llama.pools.length } : null,
    feeWindows: feeWindows ?? {},
    sources,
    lastCronSuccess: lastCron,
  };
}

/** Cached for 10 minutes across requests (Vercel data cache); the cron forces fresh reads. */
export const getLiveDataset = unstable_cache(() => buildLiveDataset({ discoveryBudgetMs: 6_000 }), ["yieldproof-live-dataset-v1"], { revalidate: 600, tags: ["live-dataset"] });

export const getPoolChart = unstable_cache(
  async (poolId: string) => {
    try {
      return await fetchPoolChart(poolId);
    } catch {
      return null;
    }
  },
  ["yieldproof-pool-chart-v1"],
  { revalidate: 3600 },
);

export interface MarketOverview {
  opportunityCount: number;
  verifiedSources: number;
  musdCount: number;
  medianAdvertised: number | null;
  medianAdvertisedN: number;
  lastRefresh: string;
}

export function marketOverview(ds: LiveDataset): MarketOverview {
  const adv = ds.opportunities.map((o) => o.advertised.value).filter((v): v is number => v !== null);
  return {
    opportunityCount: ds.opportunities.length,
    verifiedSources: ds.sources.filter((s) => s.ok).length,
    musdCount: ds.opportunities.filter((o) => o.tags.musd).length,
    medianAdvertised: median(adv)?.toNumber() ?? null,
    medianAdvertisedN: adv.length,
    lastRefresh: ds.generatedAt,
  };
}
