import type { Metadata } from "next";
import Link from "next/link";
import { DataError } from "@/components/data-error";
import { OpportunityTable } from "@/components/opportunity-table";
import { PageHeader } from "@/components/shell";
import { Callout, H2, Panel } from "@/components/ui";
import { loadDataset, medianNet } from "@/lib/data/load";
import { marketOverview } from "@/lib/data/dataset";
import { fmtAge, fmtCompact, fmtDateTime, fmtPct } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-l border-line pl-4">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="figure mt-1 text-[22px] text-ink">{value}</dd>
      {note ? <dd className="mt-0.5 text-[11.5px] leading-snug text-faint">{note}</dd> : null}
    </div>
  );
}

export default async function DashboardPage() {
  const { ds, error } = await loadDataset();
  if (!ds) return <DataError error={error} />;
  const ov = marketOverview(ds);
  const mn = medianNet(ds);
  const failed = ds.sources.filter((s) => !s.ok);
  const flagged = ds.discrepancies.filter((d) => d.flagged);
  return (
    <>
      <PageHeader
        title="Market overview"
        lede="Every Mezo yield source YieldProof can verify, priced with the same cost model. Advertised rates are shown for contrast; the estimated net column is what the engine thinks you might keep."
      />
      <Panel className="mb-6">
        <dl className="grid grid-cols-2 gap-y-6 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Opportunities tracked" value={String(ov.opportunityCount)} note={`${ds.opportunities.filter((o) => o.network === "Mezo Mainnet").length} mainnet, ${ds.opportunities.filter((o) => o.network === "Mezo Testnet").length} testnet`} />
          <Stat label="Live sources responding" value={`${ov.verifiedSources} / ${ds.sources.length}`} note={failed.length ? `Down: ${failed.map((f) => f.name).join(", ")}` : "DefiLlama, Mezo RPCs, database"} />
          <Stat label="Involving MUSD" value={String(ov.musdCount)} />
          <Stat label="Median advertised APY" value={ov.medianAdvertised === null ? "Too few" : fmtPct(ov.medianAdvertised)} note={`${ov.medianAdvertisedN} strategies publish a rate`} />
          <Stat label="Median estimated net" value={mn.value === null ? "Too few" : fmtPct(mn.value, 2, true)} note={mn.value === null ? `Only ${mn.n} complete estimates; need 3` : `${mn.n} complete estimates, 10k MUSD, 1y`} />
          <Stat label="Last refresh" value={fmtAge(ds.generatedAt)} note={ds.lastCronSuccess ? `Daily snapshot ${fmtDateTime(ds.lastCronSuccess)}` : "No daily snapshot yet"} />
        </dl>
      </Panel>

      {flagged.length ? (
        <div className="mb-6">
          <Callout tone="warn" title={`${flagged.length} source discrepanc${flagged.length === 1 ? "y" : "ies"} right now`}>
            {flagged.map((f) => f.label).join(", ")} differ between sources beyond tolerance. <Link href="/sources" className="underline">See every value and which one YieldProof uses.</Link>
          </Callout>
        </div>
      ) : null}

      <Panel className="mb-6">
        <H2 sub="Sorted by estimated net with your default assumptions. Unavailable values are labeled, never treated as zero.">Yield opportunities</H2>
        <OpportunityTable opportunities={ds.opportunities} pools={ds.pools} btcPrice={ds.mainnet?.btcPrice ?? null} limit={7} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <H2 sub="Read directly from MUSD contracts.">MUSD protocol vitals</H2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
            <dt className="text-muted">Borrow rate for new loans (mainnet)</dt>
            <dd className="figure text-right">{fmtPct(ds.mainnet?.musd.interestApr ?? null)} APR</dd>
            <dt className="text-muted">Issuance fee</dt>
            <dd className="figure text-right">{fmtPct(ds.mainnet?.musd.issuanceFeePct ?? null)}</dd>
            <dt className="text-muted">Minimum collateral ratio</dt>
            <dd className="figure text-right">{fmtPct(ds.mainnet?.musd.mcr ?? null, 0)}</dd>
            <dt className="text-muted">MUSD supply (mainnet)</dt>
            <dd className="figure text-right">{fmtCompact(ds.mainnet?.musdSupply ?? null)}</dd>
            <dt className="text-muted">BTC oracle price (mainnet)</dt>
            <dd className="figure text-right">${fmtCompact(ds.mainnet?.btcPrice ?? null)}</dd>
            <dt className="text-muted">Testnet troves / TCR</dt>
            <dd className="figure text-right">{ds.testnet?.troveCount ?? "?"} / {fmtPct(ds.testnet?.tcr ?? null, 0)}</dd>
          </dl>
          <p className="mt-3 text-[11.5px] text-faint">Mainnet block {ds.mainnet?.blockNumber ?? "unavailable"}, testnet block {ds.testnet?.blockNumber ?? "unavailable"}.</p>
        </Panel>
        <Panel>
          <H2 sub="Each refresh records which sources answered.">Source health</H2>
          <ul className="space-y-2 text-[13px]">
            {ds.sources.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.ok ? "bg-pos" : "bg-neg"}`} aria-hidden />
                  {s.name}
                </span>
                <span className="text-[12px] text-faint">{s.ok ? `${s.latencyMs} ms` : `failed: ${s.error}`}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] text-faint">Live data is cached for up to 10 minutes. A daily job snapshots every metric so YieldProof builds its own history.</p>
        </Panel>
      </div>
    </>
  );
}
