import type { Metadata } from "next";
import { PortfolioClient } from "@/components/personal";
import { PageHeader } from "@/components/shell";

export const metadata: Metadata = { title: "Portfolio" };

export default function Page() {
  return (
    <>
      <PageHeader title="Portfolio" lede="Balances and positions read directly from Mezo contracts for the protocols listed below." />
      <PortfolioClient />
    </>
  );
}
