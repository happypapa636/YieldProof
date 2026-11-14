import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeriesLegend, TimeLines, YIELD_SERIES } from "@/components/charts";
import { DataError } from "@/components/data-error";
import { DiscrepancyCard } from "@/components/discrepancy";
import { Calculator, ExitAnalysis, LeverageAnalyzer, WatchControls } from "@/components/opportunity-detail";
import { RiskProfile } from "@/components/risk-profile";
import { StabilityPoolPanel } from "@/components/testnet-actions";
import { ConfidenceBadge, FreshnessBadge, H2, MetricText, Panel, RiskBadge, SourceLine, Callout } from "@/components/ui";
import { loadHistory } from "@/lib/data/history";
import { loadDataset } from "@/lib/data/load";
import { filterRange } from "@/lib/engine/history";
import { STRATEGY_TYPE_LABEL } from "@/lib/model/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: id.replace(/-/g, " ") };
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ds, error } = await loadDataset();
  if (!ds) return <DataError error={error} />;
  const opp = ds.opportunities.find((o) => o.id === id);
  if (!opp) notFound();
  const history = await loadHistory(opp);
  const recent = filterRange(history.points, 90);
  const btc = ds.mainnet?.btcPrice ?? null;
  const metrics = [
    { label: `Advertised (${opp.advertised.basis})`, m: opp.advertised, fmt: "pct" as const },
    { label: "Base yield", m: opp.base, fmt: opp.base.basis === "APR" ? ("pct-APR" as const) : ("pct-APY" as const) },
    { label: "Incentive yield", m: opp.incentive, fmt: "pct" as const },
    { label: "TVL", m: opp.tvlUsd, fmt: (opp.network === "Mezo Testnet" ? "test-musd" : "usd") as "usd" | "test-musd" },
    { label: "Available liquidity", m: opp.availableLiquidityUsd, fmt: (opp.network === "Mezo Testnet" ? "test-musd" : "usd") as "usd" | "test-musd" },
  ];
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-[12.5px] text-faint">
        <Link href="/opportunities" className="hover:text-ink-2">Opportunities</Link> / <span className="text-ink-2">{opp.name}</span>
      </nav>
      <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <h1 className="font-display text-[34px] leading-[1.1] tracking-tight md:text-[40px]">{opp.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <a href={opp.protocol.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">{opp.protocol.name}<ExternalLink size={11} aria-hidden /></a>
            <span>{opp.network}</span>
            <span>{STRATEGY_TYPE_LABEL[opp.strategyType]}</span>
            <span>Deposit: {opp.depositAsset}</span>
            {opp.explorerUrl ? <a href={opp.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">Contract<ExternalLink size={11} aria-hidden /></a> : null}
          </p>
          <p className="mt-4 max-w-[68ch] text-[15px] leading-relaxed text-ink-2">{opp.summary}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ConfidenceBadge label={opp.confidence.label} reasons={opp.confidence.reasons} />
            <RiskBadge category={opp.risk.category} />
            <FreshnessBadge freshness={opp.freshness} at={opp.lastUpdated} />
          </div>
        </div>
        <Panel className="self-start">
          <WatchControls opp={opp} />
        </Panel>
      </div>

      {opp.network === "Mezo Testnet" ? (
        <div className="mb-6 space-y-6">
          <Callout tone="warn" title="Testnet">Testnet MUSD has no market value. This entry exists so you can practise with the real contracts; it is excluded from market statistics that imply value.</Callout>
          {opp.id === "musd-stability-pool-testnet" ? <StabilityPoolPanel /> : null}
        </div>
      ) : null}

      <Panel className="mb-6">
        <H2 sub="Each figure names its source and when that source observed it.">Current metrics</H2>
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((x) => (
            <div key={x.label}>
              <dt className="text-[12px] text-muted">{x.label}</dt>
              <dd className="mt-1 text-[20px]"><MetricText m={x.m} format={x.fmt} /></dd>
              <dd className="mt-1"><SourceLine m={x.m} /></dd>
              {x.m.note ? <dd className="mt-1 text-[11.5px] leading-snug text-faint">{x.m.note}</dd> : null}
            </div>
          ))}
          <div>
            <dt className="text-[12px] text-muted">Withdrawal</dt>
            <dd className="mt-1 text-[14px] text-ink-2">{opp.economics.lockDays === null ? "Unknown" : opp.economics.lockDays === 0 ? "No lock-up" : `Locked up to ${opp.economics.lockDays} days`}</dd>
            <dd className="mt-1 text-[11.5px] leading-snug text-faint">{opp.economics.withdrawalNote}</dd>
          </div>
        </dl>
        {opp.missing.length ? <p className="mt-5 text-[12.5px] text-ink-2">Missing or uncertain: {opp.missing.join(", ")}.</p> : null}
      </Panel>

      <div className="mb-6">
        <Calculator opp={opp} pools={ds.pools} btcPrice={btc} />
      </div>

      {opp.strategyType === "leveraged" ? (
        <Panel className="mb-6">
          <H2 sub="Borrow MUSD against BTC with live MUSD parameters (MCR, CCR, issuance fee, gas deposit, rate).">Leveraged strategy analyzer</H2>
          <LeverageAnalyzer opp={opp} btcPrice={btc} />
        </Panel>
      ) : null}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel>
          <H2 sub="Can you get out, and at what cost?">Liquidity and exit</H2>
          <ExitAnalysis opp={opp} pools={ds.pools} />
        </Panel>
        <Panel>
          <H2 sub="Component indicators from evidence; unknowns are never scored.">Risk profile</H2>
          <RiskProfile opp={opp} />
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel>
          <H2
            sub={`${history.llamaSamples} DefiLlama daily observations${history.llamaFirst ? ` since ${history.llamaFirst.slice(0, 10)}` : ""}; ${history.ownSamples} YieldProof snapshot day(s).`}
            right={<Link href={`/history?id=${opp.id}`} className="text-[12.5px] text-pos hover:underline">Full history</Link>}
          >
            Last 90 days
          </H2>
          {recent.length >= 2 ? (
            <>
              <TimeLines data={recent} unit="rate" series={YIELD_SERIES} />
              <SeriesLegend series={YIELD_SERIES} />
            </>
          ) : (
            <p className="text-[13px] text-muted">
              Not enough real observations to draw a chart yet ({recent.length} point{recent.length === 1 ? "" : "s"}). YieldProof never interpolates or back-fills history; its own daily snapshots will accumulate here.
            </p>
          )}
          {history.notes.map((n) => <p key={n} className="mt-2 text-[12px] text-ink-2">{n}</p>)}
        </Panel>
        <Panel>
          <H2>How this strategy works</H2>
          <dl className="space-y-3 text-[13px]">
            {([
              ["How the return is generated", opp.explainer.howReturnIsGenerated],
              ["What you supply", opp.explainer.assetsToSupply],
              ["Variable returns?", opp.explainer.variableReturns],
              ["Incentives included?", opp.explainer.incentivesIncluded],
              ["Borrowing or leverage?", opp.explainer.borrowingOrLeverage],
              ["Withdrawal", opp.explainer.withdrawal],
            ] as const).map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12px] text-muted">{k}</dt>
                <dd className="text-ink-2">{v}</dd>
              </div>
            ))}
            <div>
              <dt className="text-[12px] text-muted">What can cause losses</dt>
              <dd><ul className="list-disc pl-5 text-ink-2">{opp.explainer.lossCauses.map((l) => <li key={l}>{l}</li>)}</ul></dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Data that is unavailable</dt>
              <dd className="text-ink-2">{opp.explainer.unavailableData.join(", ") || "None noted"}</dd>
            </div>
          </dl>
        </Panel>
      </div>

      {opp.discrepancies.length ? (
        <Panel className="mb-6">
          <H2 sub="Where two sources report the same thing, both are shown with the one the engine uses.">Source cross-checks</H2>
          <div className="grid gap-4 lg:grid-cols-2">{opp.discrepancies.map((d) => <DiscrepancyCard key={d.id} d={d} />)}</div>
        </Panel>
      ) : null}

      <Panel>
        <H2>Sources</H2>
        <ul className="space-y-1.5 text-[13px]">
          {opp.sources.map((s) => (
            <li key={s.name} className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-line px-1 text-[10.5px] text-muted">{s.type}</span>
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-ink-2 hover:underline">{s.name}</a> : <span className="text-ink-2">{s.name}</span>}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
