import { z } from "zod";
import { withTimeout } from "./clients";

/**
 * DefiLlama yields & coins adapters. Every response is shape-validated with zod;
 * values that fail validation are dropped (reported as unavailable), never coerced.
 * DefiLlama APYs are API-reported, backward-looking estimates — never a
 * guaranteed future rate.
 */

export const DEFILLAMA_POOLS_URL = "https://yields.llama.fi/pools";
export const DEFILLAMA_POOL_URL = (id: string) => `https://yields.llama.fi/poolsEnriched?pool=${id}`;
export const DEFILLAMA_CHART_URL = (id: string) => `https://yields.llama.fi/chart/${id}`;
export const DEFILLAMA_PRICES_URL = (coins: string[]) => `https://coins.llama.fi/prices/current/${coins.join(",")}`;
export const DEFILLAMA_POOL_PAGE = (id: string) => `https://defillama.com/yields/pool/${id}`;

const num = z.number().finite();
const nullableNum = z.union([num, z.null()]).optional().transform((v) => (v === undefined ? null : v));

export const llamaPoolSchema = z.object({
  pool: z.string().min(8),
  chain: z.string(),
  project: z.string(),
  symbol: z.string(),
  tvlUsd: nullableNum,
  apyBase: nullableNum,
  apyReward: nullableNum,
  apy: nullableNum,
  rewardTokens: z.array(z.string()).nullable().optional(),
  underlyingTokens: z.array(z.string()).nullable().optional(),
  poolMeta: z.string().nullable().optional(),
  stablecoin: z.boolean().optional(),
  ilRisk: z.string().optional(),
  exposure: z.string().optional(),
  apyMean30d: nullableNum,
  apyPct7D: nullableNum,
  count: nullableNum,
  outlier: z.boolean().optional(),
  timestamp: z.string().optional(),
  url: z.string().optional(),
});
export type LlamaPool = z.infer<typeof llamaPoolSchema>;

export const llamaChartPointSchema = z.object({
  timestamp: z.string(),
  tvlUsd: nullableNum,
  apy: nullableNum,
  apyBase: nullableNum,
  apyReward: nullableNum,
});
export type LlamaChartPoint = z.infer<typeof llamaChartPointSchema>;

async function getJson(url: string, ms = 15_000): Promise<unknown> {
  const res = await withTimeout(fetch(url, { cache: "no-store", headers: { accept: "application/json" } }), ms, url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

function parsePools(raw: unknown): LlamaPool[] {
  const data = (raw as { status?: string; data?: unknown[] })?.data;
  if (!Array.isArray(data)) throw new Error("DefiLlama: unexpected response shape");
  const out: LlamaPool[] = [];
  for (const row of data) {
    if ((row as { chain?: string })?.chain !== "Mezo") continue;
    const p = llamaPoolSchema.safeParse(row);
    if (p.success) out.push(p.data);
  }
  return out;
}

/**
 * Discovery of every Mezo pool needs DefiLlama's full pool list (~10 MB). It is
 * kept per server instance for 6 hours and shared by concurrent requests, so a
 * slow download never runs twice at once.
 */
const DISCOVERY_TTL_MS = 6 * 3_600_000;
let discovered: { pools: LlamaPool[]; at: number } | null = null;
let discoveryInFlight: Promise<LlamaPool[]> | null = null;

function discoverMezoPools(): Promise<LlamaPool[]> {
  if (discovered && Date.now() - discovered.at < DISCOVERY_TTL_MS) return Promise.resolve(discovered.pools);
  discoveryInFlight ??= getJson(DEFILLAMA_POOLS_URL, 45_000)
    .then((raw) => {
      const pools = parsePools(raw);
      if (pools.length === 0) throw new Error("DefiLlama returned no Mezo pools");
      discovered = { pools, at: Date.now() };
      return pools;
    })
    .finally(() => {
      discoveryInFlight = null;
    });
  return discoveryInFlight;
}

async function fetchEnriched(ids: string[], fallbackRows: LlamaPool[] = []): Promise<LlamaPool[]> {
  const rows = await Promise.all(
    ids.map(async (id) => {
      try {
        return parsePools(await getJson(DEFILLAMA_POOL_URL(id), 10_000))[0] ?? fallbackRows.find((p) => p.pool === id) ?? null;
      } catch {
        return fallbackRows.find((p) => p.pool === id) ?? null;
      }
    }),
  );
  return rows.filter((p): p is LlamaPool => p !== null);
}

/**
 * Mezo pools from DefiLlama. Known pools are fetched individually (small, fast,
 * and they carry timestamps). Discovery of pools YieldProof has not reviewed runs
 * in parallel; with `discoveryBudgetMs`, a page request waits at most that long
 * for it and otherwise proceeds with the known pools (the download keeps going
 * and serves the next request). The daily cron passes no budget and always waits.
 */
export async function fetchMezoPools(knownIds: string[], opts: { discoveryBudgetMs?: number } = {}): Promise<{ pools: LlamaPool[]; method: "full" | "per-pool" }> {
  const discovery = discoverMezoPools().catch(() => null);
  const budget = opts.discoveryBudgetMs;
  const timedDiscovery = budget === undefined ? discovery : Promise.race([discovery, new Promise<undefined>((r) => setTimeout(() => r(undefined), budget))]);
  const [found, known] = await Promise.all([timedDiscovery, fetchEnriched(knownIds)]);
  const bulk = found ?? [];
  // Re-try known pools that failed individually from the bulk rows, then add newly discovered ones.
  const missingKnown = knownIds.filter((id) => !known.some((p) => p.pool === id));
  const knownFromBulk = bulk.filter((p) => missingKnown.includes(p.pool));
  const extraIds = bulk.map((p) => p.pool).filter((id) => !knownIds.includes(id));
  const extra = extraIds.length ? await fetchEnriched(extraIds, bulk) : [];
  const pools = [...known, ...knownFromBulk, ...extra];
  if (pools.length === 0) throw new Error("DefiLlama unavailable");
  return { pools, method: found ? "full" : "per-pool" };
}

export async function fetchPoolChart(id: string): Promise<LlamaChartPoint[]> {
  const raw = (await getJson(DEFILLAMA_CHART_URL(id), 15_000)) as { data?: unknown[] };
  if (!Array.isArray(raw?.data)) throw new Error("DefiLlama chart: unexpected shape");
  const out: LlamaChartPoint[] = [];
  for (const row of raw.data) {
    const p = llamaChartPointSchema.safeParse(row);
    if (p.success && Number.isFinite(Date.parse(p.data.timestamp))) out.push(p.data);
  }
  return out.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

const priceSchema = z.object({
  coins: z.record(
    z.string(),
    z.object({ price: num, symbol: z.string().optional(), timestamp: num, confidence: num.optional(), decimals: num.optional() }),
  ),
});

export interface LlamaPrice {
  price: number;
  observedAt: string;
  confidence: number | null;
}

export async function fetchPrices(coins: string[]): Promise<Record<string, LlamaPrice>> {
  const parsed = priceSchema.parse(await getJson(DEFILLAMA_PRICES_URL(coins), 12_000));
  const out: Record<string, LlamaPrice> = {};
  for (const [k, v] of Object.entries(parsed.coins)) {
    if (v.price <= 0) continue;
    out[k.toLowerCase()] = { price: v.price, observedAt: new Date(v.timestamp * 1000).toISOString(), confidence: v.confidence ?? null };
  }
  return out;
}
