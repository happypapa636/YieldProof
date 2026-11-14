import type { Metadata } from "next";
import { DataError } from "@/components/data-error";
import { DiscrepancyCard } from "@/components/discrepancy";
import { PageHeader } from "@/components/shell";
import { H2, Panel } from "@/components/ui";
import { MAINNET, MAINNET_POOLS, TESTNET } from "@/config/contracts";
import { loadDataset } from "@/lib/data/load";
import { recentCronRuns, snapshotStats } from "@/lib/db/repo";
import { fmtAge, fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Sources & discrepancies" };
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const { ds, error } = await loadDataset();
  if (!ds) return <DataError error={error} />;
  const [runs, stats] = await Promise.all([recentCronRuns(8).catch(() => []), snapshotStats().catch(() => null)]);
  const all = [...ds.discrepancies, ...ds.opportunities.flatMap((o) => o.discrepancies)];
  const contracts: [string, string, number][] = [
    ["MUSD (mainnet)", MAINNET.MUSD, 31612],
    ["BorrowerOperations (mainnet)", MAINNET.BorrowerOperations, 31612],
    ["InterestRateManager (mainnet)", MAINNET.InterestRateManager, 31612],
    ["PriceFeed (mainnet)", MAINNET.PriceFeed, 31612],
    ["sMUSD / MUSDSavingsRate", MAINNET.sMUSD, 31612],
    ["sMUSD VaultGauge", MAINNET.sMUSDGauge, 31612],
    ["PoolFactory", MAINNET.PoolFactory, 31612],
    ...MAINNET_POOLS.map((p) => [p.label, p.address, 31612] as [string, string, number]),
    ["MUSD (testnet)", TESTNET.MUSD, 31611],
    ["TroveManager (testnet)", TESTNET.TroveManager, 31611],
    ["StabilityPool (testnet)", TESTNET.StabilityPool, 31611],
    ["PriceFeed (testnet)", TESTNET.PriceFeed, 31611],
  ];
  return (
    <>
      <PageHeader title="Sources & discrepancies" lede="When sources disagree, YieldProof shows every value, the spread, and which one the engine uses. Nothing is averaged away." />
      <Panel className="mb-6">
        <H2 sub={`${all.filter((d) => d.flagged).length} of ${all.length} cross-checks currently disagree beyond tolerance.`}>Cross-checks</H2>
        <div className="grid gap-4 lg:grid-cols-2">{all.map((d) => <DiscrepancyCard key={d.id} d={d} />)}</div>
        <div className="mt-4 panel-sunk p-4 text-[13px]">
          <p className="font-medium text-ink">Audit coverage (qualitative)</p>
          <p className="mt-1 text-muted">DefiLlama lists “0 audits” for Mezo Earn and Mezo Vaults, while Mezo&apos;s own audits page lists Thesis Defense and Halborn reports for Mezo Earn and a Cantina report for MUSD. YieldProof uses the primary source (Mezo docs) and links it; it does not claim the audits cover every contract.</p>
        </div>
      </Panel>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel>
          <H2 sub={`Dataset built ${fmtAge(ds.generatedAt)}.`}>Live source status</H2>
          <ul className="space-y-2 text-[13px]">
            {ds.sources.map((s) => (
              <li key={s.id} className="flex justify-between gap-3">
                <span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${s.ok ? "bg-pos" : "bg-neg"}`} aria-hidden />{s.name}</span>
                <span className="text-[12px] text-faint">{s.ok ? `ok, ${s.latencyMs} ms` : s.error}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-faint">DefiLlama method: {ds.llama?.method ?? "unavailable"} ({ds.llama?.poolCount ?? 0} Mezo pools). Fee windows: {Object.values(ds.feeWindows).filter(Boolean).length} pools, computed {Object.values(ds.feeWindows)[0]?.computedAt ? fmtDateTime(Object.values(ds.feeWindows)[0]!.computedAt) : "never"}.</p>
        </Panel>
        <Panel>
          <H2 sub="Vercel Cron runs once a day (Hobby plan limit); the app also refreshes live data on visit.">Daily snapshot job</H2>
          {stats ? <p className="mb-3 text-[13px] text-ink-2">{stats.rows} stored observations across {stats.days} day(s){stats.first ? `, ${stats.first} → ${stats.last}` : ""}.</p> : <p className="mb-3 text-[13px] text-ink-2">Snapshot store unavailable.</p>}
          {runs.length ? (
            <ul className="space-y-1.5 text-[12.5px]">
              {runs.map((r) => (
                <li key={r.id} className="flex justify-between gap-3">
                  <span className="text-ink-2">{fmtDateTime(typeof r.started_at === "string" ? r.started_at : new Date(r.started_at).toISOString())}</span>
                  <span className={r.status === "success" ? "text-pos" : r.status === "partial" ? "text-ink" : "text-neg"}>{r.status}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-faint">No runs recorded yet.</p>}
        </Panel>
      </div>
      <Panel>
        <H2 sub="Every contract YieldProof reads. YieldProof deploys no contract and never holds funds.">Contracts</H2>
        <ul className="grid gap-x-8 gap-y-1.5 text-[12.5px] md:grid-cols-2">
          {contracts.map(([label, addr, chain]) => (
            <li key={addr} className="flex justify-between gap-3">
              <span className="text-ink-2">{label}</span>
              <a className="figure text-faint hover:text-ink-2" href={`${chain === 31612 ? "https://explorer.mezo.org" : "https://explorer.test.mezo.org"}/address/${addr}`} target="_blank" rel="noreferrer">{addr.slice(0, 10)}…{addr.slice(-6)}</a>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
