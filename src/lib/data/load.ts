import { getLiveDataset, LiveDataset } from "./dataset";
import { median } from "@/lib/engine/stats";
import { DEFAULT_ASSUMPTIONS, projectOpportunity } from "@/lib/model/projection";
import { buildContext } from "@/lib/model/pools";

/** Page-level loader: never throws; pages render an error state instead. */
export async function loadDataset(): Promise<{ ds: LiveDataset | null; error: string | null }> {
  try {
    return { ds: await getLiveDataset(), error: null };
  } catch (e) {
    console.error("dataset failed", e);
    return { ds: null, error: e instanceof Error ? e.message : "Data sources unavailable" };
  }
}

/** Median estimated net (annualised) across opportunities with a COMPLETE projection; null when < 3. */
export function medianNet(ds: LiveDataset): { value: number | null; n: number } {
  const ctx = buildContext(ds.pools, ds.mainnet?.btcPrice ?? null);
  const vals: number[] = [];
  for (const o of ds.opportunities) {
    try {
      const p = projectOpportunity(o, DEFAULT_ASSUMPTIONS, ctx);
      if (p.status === "complete" && p.annualized) vals.push(p.annualized.toNumber());
    } catch {
      /* skip */
    }
  }
  return { value: median(vals)?.toNumber() ?? null, n: vals.length };
}
