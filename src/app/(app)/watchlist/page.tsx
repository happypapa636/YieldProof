import type { Metadata } from "next";
import { WatchlistClient } from "@/components/personal";
import { PageHeader } from "@/components/shell";

export const metadata: Metadata = { title: "Watchlist & alerts", robots: { index: false } };

export default function Page() {
  return (
    <>
      <PageHeader title="Watchlist & alerts" lede="Strategies you follow, the alerts on them, and what triggered." />
      <WatchlistClient />
    </>
  );
}
