import { loadEnv } from "./load-env";
loadEnv();
import { buildLiveDataset } from "../src/lib/data/dataset";

(async () => {
  const t = Date.now();
  const ds = await buildLiveDataset();
  console.log("built in", Date.now() - t, "ms; sources:", ds.sources.map((s) => `${s.id}:${s.ok ? "ok" : "FAIL " + s.error}`).join(" | "));
  for (const o of ds.opportunities) {
    console.log(o.id.padEnd(30), o.confidence.label.padEnd(9), o.risk.category.padEnd(24), "adv", o.advertised.value, "base", o.base.value?.toFixed?.(5), "inc", o.incentive.value, "tvl", o.tvlUsd.value?.toFixed(0), "fresh", o.freshness, "missing:", o.missing.join(","));
  }
  for (const d of [...ds.discrepancies, ...ds.opportunities.flatMap((o) => o.discrepancies)]) console.log("DISC", d.label, d.status, d.values.map((v) => `${v.label}=${v.value.toFixed(5)}`).join("; "));
  console.log("pools", Object.keys(ds.pools), "btc", ds.mainnet?.btcPrice, "musd", ds.mainnet?.musd, "testnet troves", ds.testnet?.troveCount);
})().catch((e) => { console.error(e); process.exit(1); });
