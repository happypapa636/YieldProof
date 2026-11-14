import type { Metadata } from "next";
import Link from "next/link";
import { DataError } from "@/components/data-error";
import { LevelText } from "@/components/risk-profile";
import { PageHeader } from "@/components/shell";
import { H2, Panel, RiskBadge } from "@/components/ui";
import { loadDataset } from "@/lib/data/load";
import { MIN_KNOWN_CORE, riskRank, RISK_THRESHOLDS } from "@/lib/engine/risk";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Risk analysis" };
export const dynamic = "force-dynamic";

export default async function RiskPage() {
  const { ds, error } = await loadDataset();
  if (!ds) return <DataError error={error} />;
  const opps = [...ds.opportunities].sort((a, b) => riskRank(a.risk.category) - riskRank(b.risk.category));
  const componentIds = opps[0]?.risk.components.map((c) => ({ id: c.id, label: c.label, core: c.core })) ?? [];
  const T = RISK_THRESHOLDS;
  return (
    <>
      <PageHeader
        title="Risk analysis"
        lede="A transparent, evidence-based risk model. Each component has a documented threshold; anything without evidence reads “insufficient data” and is never scored. These are product assessments, not official ratings or guarantees of safety."
      />
      <Panel className="mb-6">
        <H2 sub={`Assessed ${fmtDateTime(ds.generatedAt)}. Click a strategy for the evidence behind each cell.`}>Component matrix</H2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12.5px]">
            <thead>
              <tr className="text-left text-faint">
                <th className="sticky left-0 bg-surface py-2 pr-3 font-normal">Strategy</th>
                <th className="py-2 pr-3 font-normal">Overall</th>
                {componentIds.map((c) => (
                  <th key={c.id} className="py-2 pr-3 font-normal">{c.label}{c.core ? " *" : ""}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {opps.map((o) => (
                <tr key={o.id} className="border-t border-line align-top">
                  <td className="sticky left-0 bg-surface py-2 pr-3"><Link href={`/opportunities/${o.id}`} className="text-ink hover:underline">{o.name}</Link></td>
                  <td className="py-2 pr-3"><RiskBadge category={o.risk.category} compact /></td>
                  {o.risk.components.map((c) => (
                    <td key={c.id} className="py-2 pr-3" title={c.rationale}><LevelText level={c.level} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11.5px] text-faint">* Core component. Overall category = the most severe known component; “Insufficient data” when fewer than {MIN_KNOWN_CORE} core components have evidence. Protocols without a verified audit are never rated below Elevated.</p>
      </Panel>
      <Panel>
        <H2 sub="Applied identically to every strategy.">Thresholds</H2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-faint">
                <th className="py-2 pr-4 font-normal">Component</th>
                <th className="py-2 pr-4 font-normal">Lower</th>
                <th className="py-2 pr-4 font-normal">Moderate</th>
                <th className="py-2 pr-4 font-normal">Elevated</th>
                <th className="py-2 font-normal">High</th>
              </tr>
            </thead>
            <tbody className="text-ink-2">
              <tr className="border-t border-line"><td className="py-2 pr-4">Liquidity depth (USD)</td><td>≥ $10M</td><td>≥ $1M</td><td>≥ $100k</td><td>below $100k</td></tr>
              <tr className="border-t border-line"><td className="py-2 pr-4">Withdrawal lock (days)</td><td>{T.lockDays.lower}</td><td>≤ {T.lockDays.moderate}</td><td>≤ {T.lockDays.elevated}</td><td>longer</td></tr>
              <tr className="border-t border-line"><td className="py-2 pr-4">Yield volatility (σ, pts, 30d)</td><td>≤ {T.apyVolatilityPts.lower}</td><td>≤ {T.apyVolatilityPts.moderate}</td><td>≤ {T.apyVolatilityPts.elevated}</td><td>higher</td></tr>
              <tr className="border-t border-line"><td className="py-2 pr-4">Incentive share of yield</td><td>≤ 20%</td><td>≤ 50%</td><td>≤ 80%</td><td>higher</td></tr>
              <tr className="border-t border-line"><td className="py-2 pr-4">Contract age (audited)</td><td>≥ 2 years</td><td>≥ 1 year</td><td>≥ 90 days</td><td>younger (capped at Elevated when audited)</td></tr>
              <tr className="border-t border-line"><td className="py-2 pr-4">Health factor (leveraged)</td><td>≥ {T.healthFactor.lower}</td><td>≥ {T.healthFactor.moderate}</td><td>≥ {T.healthFactor.elevated}</td><td>lower</td></tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
