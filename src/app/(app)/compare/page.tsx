import type { Metadata } from "next";
import { CompareClient } from "@/components/compare-client";
import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/shell";
import { loadDataset } from "@/lib/data/load";
import { decodeComparison, encodeComparison } from "@/lib/model/comparison";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const params = decodeComparison(await searchParams);
  const q = params.ids.length ? encodeComparison(params) : "";
  return {
    title: "Compare strategies",
    openGraph: { images: [{ url: `/api/og${q ? `?${q}` : ""}`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [`/api/og${q ? `?${q}` : ""}`] },
  };
}

export default async function ComparePage({ searchParams }: { searchParams: SP }) {
  const { ds, error } = await loadDataset();
  if (!ds) return <DataError error={error} />;
  const decoded = decodeComparison(await searchParams);
  const defaults = ["mezo-smusd-savings", "mezo-smusd-gauge", "pool-btc-musd"].filter((id) => ds.opportunities.some((o) => o.id === id));
  const initial = { ...decoded, ids: decoded.ids.length ? decoded.ids : defaults };
  return (
    <>
      <PageHeader
        title="Compare strategies"
        lede="Same capital, same horizon, same cost model. The share link carries only strategy ids and assumptions, never wallet data."
      />
      <CompareClient opportunities={ds.opportunities} pools={ds.pools} btcPrice={ds.mainnet?.btcPrice ?? null} initial={initial} />
    </>
  );
}
