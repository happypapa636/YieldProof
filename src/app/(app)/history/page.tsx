import type { Metadata } from "next";
import { DataError } from "@/components/data-error";
import { HistoryClient } from "@/components/history-client";
import { PageHeader } from "@/components/shell";
import { Callout, Panel } from "@/components/ui";
import { loadHistory } from "@/lib/data/history";
import { loadDataset } from "@/lib/data/load";

export const metadata: Metadata = { title: "Yield history" };
export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { ds, error } = await loadDataset();
  if (!ds) return <DataError error={error} />;
  const { id } = await searchParams;
  const opp = ds.opportunities.find((o) => o.id === id) ?? ds.opportunities.find((o) => o.id === "mezo-smusd-savings") ?? ds.opportunities[0];
  if (!opp) return <DataError error="No opportunities available" />;
  const h = await loadHistory(opp);
  return (
    <>
      <PageHeader
        title="Yield history"
        lede="Only real observations: DefiLlama's archived daily series and YieldProof's own daily snapshots (which also record the engine's estimated net). Gaps stay gaps."
      />
      <Panel>
        <HistoryClient options={ds.opportunities.map((o) => ({ id: o.id, name: o.name }))} selected={opp.id} points={h.points} now={ds.generatedAt} />
        <p className="mt-4 text-[12px] leading-relaxed text-faint">
          {opp.defillamaPoolId ? `DefiLlama: ${h.llamaSamples} daily points since ${h.llamaFirst?.slice(0, 10) ?? "n/a"}. ` : "DefiLlama does not track this strategy; history comes only from YieldProof's own snapshots. "}
          YieldProof snapshots: {h.ownSamples} day(s){h.ownFirst ? ` since ${h.ownFirst}` : ""}. Past yields are not a forecast.
        </p>
        {h.notes.map((n) => (
          <div key={n} className="mt-3"><Callout tone="warn">{n}</Callout></div>
        ))}
      </Panel>
    </>
  );
}
