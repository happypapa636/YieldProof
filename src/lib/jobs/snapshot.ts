import { MAINNET_POOLS } from "@/config/contracts";
import { poolStateOf } from "@/lib/data/assemble";
import { buildLiveDataset, LiveDataset } from "@/lib/data/dataset";
import { computeFeeWindow } from "@/lib/data/fees";
import {
  AlertRow,
  finishCron,
  getSettings,
  listAlerts,
  listAllEnabledAlerts,
  recordAlertResult,
  SnapshotRow,
  startCron,
  upsertFeeWindow,
  upsertSnapshots,
} from "@/lib/db/repo";
import { evaluateAlert } from "@/lib/model/alerts";
import { assumptionsSchema } from "@/lib/model/comparison";
import { Assumptions, DEFAULT_ASSUMPTIONS, projectOpportunity, ProjectionContext } from "@/lib/model/projection";

export function projectionContext(ds: LiveDataset): ProjectionContext {
  const pools: ProjectionContext["pools"] = {};
  for (const [id, p] of Object.entries(ds.pools)) pools[id] = poolStateOf(p);
  return { pools, btcPrice: ds.mainnet?.btcPrice ?? null };
}

export async function userAssumptions(address: string): Promise<Assumptions> {
  const s = await getSettings(address).catch(() => null);
  const parsed = assumptionsSchema.safeParse({ ...DEFAULT_ASSUMPTIONS, ...((s?.assumptions as object) ?? {}) });
  return parsed.success ? parsed.data : DEFAULT_ASSUMPTIONS;
}

/** Evaluate alerts (all users, or one user) against a dataset. Returns counts. */
export async function evaluateAlerts(ds: LiveDataset, only?: string): Promise<{ checked: number; triggered: number; unavailable: number }> {
  const alerts: AlertRow[] = only ? (await listAlerts(only)).filter((a) => a.enabled) : await listAllEnabledAlerts();
  const ctx = projectionContext(ds);
  const assumptionCache = new Map<string, Assumptions>();
  let triggered = 0;
  let unavailable = 0;
  for (const a of alerts) {
    const opp = ds.opportunities.find((o) => o.id === a.opportunity_id);
    let projection = null;
    if (a.kind === "net_negative" && opp) {
      if (!assumptionCache.has(a.address)) assumptionCache.set(a.address, await userAssumptions(a.address));
      try {
        projection = projectOpportunity(opp, assumptionCache.get(a.address)!, ctx);
      } catch {
        projection = null;
      }
    }
    const r = evaluateAlert(a.kind, a.threshold === null ? null : Number(a.threshold), opp, { projection, baseline: a.baseline });
    if (await recordAlertResult(a, r.state, r.value, r.message)) triggered++;
    if (r.state === "unavailable") unavailable++;
  }
  return { checked: alerts.length, triggered, unavailable };
}

export function snapshotRows(ds: LiveDataset): SnapshotRow[] {
  const rows: SnapshotRow[] = [];
  const ctx = projectionContext(ds);
  for (const o of ds.opportunities) {
    const push = (metric: string, m: { value: number | null; source: { name: string; type: string } | null; observedAt: string | null }) => {
      if (m.value === null) return; // never write a fabricated value for an unavailable metric
      rows.push({ opportunity_id: o.id, metric, value: m.value, source: m.source?.name ?? "unknown", source_type: m.source?.type ?? "modeled", observed_at: m.observedAt });
    };
    push("advertised_apy", o.advertised);
    push("base_rate", o.base);
    push("incentive_rate", o.incentive);
    push("tvl_usd", o.tvlUsd);
    push("liquidity_usd", o.availableLiquidityUsd);
    try {
      const p = projectOpportunity(o, DEFAULT_ASSUMPTIONS, ctx);
      if (p.annualized !== null)
        rows.push({ opportunity_id: o.id, metric: "net_apr_default", value: p.annualized.toNumber(), source: "YieldProof engine (10,000 MUSD, 365d, defaults)", source_type: "modeled", observed_at: o.lastUpdated });
    } catch {
      /* skip */
    }
  }
  const m = ds.mainnet;
  if (m) {
    const at = m.blockTime;
    const add = (metric: string, value: number | null, source: string) => value !== null && rows.push({ opportunity_id: "protocol:mainnet", metric, value, source, source_type: "on-chain", observed_at: at });
    add("btc_price_oracle", m.btcPrice, "Mezo mainnet PriceFeed");
    add("musd_interest_apr", m.musd.interestApr, "InterestRateManager.interestRate");
    add("musd_supply", m.musdSupply, "MUSD.totalSupply");
    add("smusd_supply", m.smusd.totalSupply, "sMUSD.totalSupply");
    add("gauge_reward_rate", m.gauge.rewardRatePerSec, "VaultGauge.rewardRate");
    for (const cfg of MAINNET_POOLS) {
      const p = ds.pools[cfg.id];
      if (p?.valueInMusd) add(`${cfg.id}_value_musd`, p.valueInMusd, `${cfg.label} reserves`);
    }
  }
  const t = ds.testnet;
  if (t) {
    const at = t.blockTime;
    const add = (metric: string, value: number | null, source: string) => value !== null && rows.push({ opportunity_id: "protocol:testnet", metric, value, source, source_type: "on-chain", observed_at: at });
    add("btc_price_oracle", t.btcPrice, "Mezo testnet PriceFeed");
    add("stability_pool_musd", t.stabilityPoolMusd, "StabilityPool.getTotalMUSDDeposits");
    add("trove_count", t.troveCount, "TroveManager.getTroveOwnersCount");
    add("tcr", t.tcr, "TroveManager.getTCR");
  }
  for (const [k, v] of Object.entries(ds.prices)) {
    rows.push({ opportunity_id: "prices", metric: k, value: v.price, source: "DefiLlama coins", source_type: "API", observed_at: v.observedAt });
  }
  return rows;
}

export interface SnapshotReport {
  status: "success" | "partial" | "failed";
  feeWindows: { poolId: string; ok: boolean; swaps?: number; error?: string }[];
  snapshotRows: number;
  sources: { id: string; ok: boolean; error?: string }[];
  alerts: { checked: number; triggered: number; unavailable: number } | null;
  durationMs: number;
}

/** The daily job: on-chain fee scans → fresh dataset → snapshots → alerts. */
export async function runSnapshotJob(): Promise<SnapshotReport> {
  const t0 = Date.now();
  const runId = await startCron("snapshot");
  const feeResults: SnapshotReport["feeWindows"] = [];
  try {
    await Promise.all(
      MAINNET_POOLS.map(async (p) => {
        try {
          const w = await computeFeeWindow(p.id, 7);
          await upsertFeeWindow(p.id, 7, w);
          feeResults.push({ poolId: p.id, ok: true, swaps: w.swaps });
        } catch (e) {
          feeResults.push({ poolId: p.id, ok: false, error: e instanceof Error ? e.message.slice(0, 160) : String(e) });
        }
      }),
    );
    const ds = await buildLiveDataset();
    const rows = snapshotRows(ds);
    const written = await upsertSnapshots(rows);
    let alerts: SnapshotReport["alerts"] = null;
    try {
      alerts = await evaluateAlerts(ds);
    } catch {
      alerts = null;
    }
    const allOk = ds.sources.every((s) => s.ok) && feeResults.every((f) => f.ok) && alerts !== null;
    const report: SnapshotReport = {
      status: allOk ? "success" : "partial",
      feeWindows: feeResults,
      snapshotRows: written,
      sources: ds.sources.map((s) => ({ id: s.id, ok: s.ok, error: s.error })),
      alerts,
      durationMs: Date.now() - t0,
    };
    await finishCron(runId, report.status, report);
    return report;
  } catch (e) {
    const report: SnapshotReport = { status: "failed", feeWindows: feeResults, snapshotRows: 0, sources: [], alerts: null, durationMs: Date.now() - t0 };
    await finishCron(runId, "failed", { ...report, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
