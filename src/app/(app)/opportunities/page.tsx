import type { Metadata } from "next";
import { DataError } from "@/components/data-error";
import { OpportunityTable } from "@/components/opportunity-table";
import { PageHeader } from "@/components/shell";
import { loadDataset } from "@/lib/data/load";
import { fmtAge } from "@/lib/format";

export const metadata: Metadata = { title: "Opportunities" };
export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const { ds, error } = await loadDataset();
  if (!ds) return <DataError error={error} />;
  return (
    <>
      <PageHeader
        title="Yield opportunities"
        lede={
          <>
            {ds.opportunities.length} strategies on Mezo, from DefiLlama ({ds.llama ? `${ds.llama.poolCount} pools` : "unavailable"}) and direct contract reads. Refreshed {fmtAge(ds.generatedAt)}. Anything DefiLlama lists that YieldProof has not reviewed is shown as discovered and unverified.
          </>
        }
      />
      <OpportunityTable opportunities={ds.opportunities} pools={ds.pools} btcPrice={ds.mainnet?.btcPrice ?? null} />
    </>
  );
}
