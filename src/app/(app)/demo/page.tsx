import type { Metadata } from "next";
import { DemoClient } from "@/components/demo-client";
import { PageHeader } from "@/components/shell";
import { getDemoStrategies } from "@/lib/demo/strategies";
import { assertDemoOnly } from "@/lib/model/separation";

export const metadata: Metadata = { title: "Interactive demo" };

export default function DemoPage() {
  const strategies = assertDemoOnly(getDemoStrategies());
  return (
    <>
      <PageHeader
        title="Why the biggest headline loses"
        lede="Four fictional strategies: a plain lending market, an incentive farm, a BTC/MUSD liquidity pool with impermanent loss, and a 3× leveraged loop. No wallet needed. Drag the assumptions and watch the ranking change."
      />
      <DemoClient strategies={strategies} />
    </>
  );
}
