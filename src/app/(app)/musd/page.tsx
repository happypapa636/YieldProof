import type { Metadata } from "next";
import Link from "next/link";
import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/shell";
import { ConfidenceBadge, EmptyState, H2, MetricText, Panel, RiskBadge } from "@/components/ui";
import { TESTNET, MAINNET } from "@/config/contracts";
import { loadDataset } from "@/lib/data/load";
import { fmtCompact, fmtNum, fmtPct } from "@/lib/format";
import type { MusdUseCase, Opportunity } from "@/lib/model/types";

export const metadata: Metadata = { title: "MUSD strategy explorer" };
export const dynamic = "force-dynamic";

const GROUPS: { id: MusdUseCase; title: string; blurb: string; empty: string }[] = [
  { id: "lending", title: "Lending and savings", blurb: "Supply MUSD and earn from borrowers or protocol fees.", empty: "No verified MUSD lending market is live on Mezo yet." },
  { id: "liquidity", title: "Liquidity provision", blurb: "Pair MUSD with a volatile asset and earn swap fees.", empty: "No verified MUSD liquidity pool found." },
  { id: "stablecoin", title: "Stablecoin market activity", blurb: "MUSD against other dollar stablecoins.", empty: "No verified stable pool found." },
  { id: "borrowing", title: "Borrowing", blurb: "Mint MUSD against BTC, optionally deploying it elsewhere.", empty: "MUSD borrowing parameters could not be read." },
  { id: "other", title: "Other verified strategies", blurb: "Incentive staking, the stability pool and more.", empty: "Nothing else verified." },
];

function Card({ o }: { o: Opportunity }) {
  const rows: [string, string][] = [
    ["How the return is generated", o.explainer.howReturnIsGenerated],
    ["You supply", o.explainer.assetsToSupply],
    ["Variable?", o.explainer.variableReturns],
    ["Incentives?", o.explainer.incentivesIncluded],
    ["Borrowing / leverage?", o.explainer.borrowingOrLeverage],
    ["Withdraw immediately?", o.explainer.withdrawal],
  ];
  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/opportunities/${o.id}`} className="font-display text-[19px] text-ink hover:underline">{o.name}</Link>
          <p className="text-[12px] text-faint">{o.protocol.name}, {o.network}</p>
        </div>
        <div className="flex gap-2"><ConfidenceBadge label={o.confidence.label} reasons={o.confidence.reasons} /><RiskBadge category={o.risk.category} compact /></div>
      </div>
      <p className="mt-3 text-[13px] text-ink-2">
        Advertised <MetricText m={o.advertised} format="pct" />, base <MetricText m={o.base} format="pct" />, incentives <MetricText m={o.incentive} format="pct" />.
      </p>
      <dl className="mt-3 grid gap-2 text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[150px_1fr]">
            <dt className="text-muted">{k}</dt>
            <dd className="text-ink-2">{v}</dd>
          </div>
        ))}
        <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[150px_1fr]"><dt className="text-muted">What can cause losses</dt><dd className="text-ink-2">{o.explainer.lossCauses.join("; ")}</dd></div>
        <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[150px_1fr]"><dt className="text-muted">Unavailable data</dt><dd className="text-ink-2">{o.explainer.unavailableData.join("; ") || "None noted"}</dd></div>
      </dl>
    </article>
  );
}

export default async function MusdPage() {
  const { ds, error } = await loadDataset();
  if (!ds) return <DataError error={error} />;
  const m = ds.mainnet;
  const t = ds.testnet;
  return (
    <>
      <PageHeader
        title="MUSD strategy explorer"
        lede="What you can actually do with MUSD on Mezo today, grouped by use case and explained in plain terms. Only verified opportunities appear; empty categories say so."
      />
      <Panel className="mb-6">
        <H2 sub="Read live from the MUSD contracts.">MUSD at a glance</H2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-[13px] md:grid-cols-4">
          <div><dt className="text-muted">Mainnet supply</dt><dd className="figure text-[18px]">{fmtCompact(m?.musdSupply ?? null)}</dd></div>
          <div><dt className="text-muted">Borrow rate (new loans)</dt><dd className="figure text-[18px]">{fmtPct(m?.musd.interestApr ?? null)} APR</dd></div>
          <div><dt className="text-muted">Issuance fee / min. ratio</dt><dd className="figure text-[18px]">{fmtPct(m?.musd.issuanceFeePct ?? null)} / {fmtPct(m?.musd.mcr ?? null, 0)}</dd></div>
          <div><dt className="text-muted">Gas deposit / min. debt</dt><dd className="figure text-[18px]">{fmtNum(m?.musd.gasCompensation ?? null, 0)} / {fmtNum(m?.musd.minNetDebt ?? null, 0)}</dd></div>
          <div><dt className="text-muted">sMUSD supply</dt><dd className="figure text-[18px]">{fmtCompact(m?.smusd.totalSupply ?? null)}</dd></div>
          <div><dt className="text-muted">Testnet stability pool</dt><dd className="figure text-[18px]">{fmtCompact(t?.stabilityPoolMusd ?? null)}</dd></div>
          <div><dt className="text-muted">Testnet troves</dt><dd className="figure text-[18px]">{t?.troveCount ?? "Unavailable"}</dd></div>
          <div><dt className="text-muted">Testnet recovery mode</dt><dd className="figure text-[18px]">{t?.recoveryMode === null || t?.recoveryMode === undefined ? "Unavailable" : t.recoveryMode ? "Yes" : "No"}</dd></div>
        </dl>
        <p className="mt-4 text-[11.5px] text-faint">
          MUSD mainnet <a className="underline" href={`https://explorer.mezo.org/token/${MAINNET.MUSD}`} target="_blank" rel="noreferrer">{MAINNET.MUSD}</a>; testnet <a className="underline" href={`https://explorer.test.mezo.org/token/${TESTNET.MUSD}`} target="_blank" rel="noreferrer">{TESTNET.MUSD}</a>. Interest is fixed at open (1–5% range per Mezo docs); a 200 MUSD gas deposit is added to debt and refunded on close.
        </p>
      </Panel>
      <div className="space-y-10">
        {GROUPS.map((g) => {
          const items = ds.opportunities.filter((o) => o.tags.musd && o.musdUseCase === g.id);
          return (
            <section key={g.id} aria-labelledby={`g-${g.id}`}>
              <h2 id={`g-${g.id}`} className="font-display text-[24px]">{g.title}</h2>
              <p className="mb-4 text-[13px] text-muted">{g.blurb}</p>
              {items.length ? (
                <div className="grid gap-5 lg:grid-cols-2">{items.map((o) => <Card key={o.id} o={o} />)}</div>
              ) : (
                <EmptyState title={g.empty}>YieldProof does not invent opportunities. When a verified source lists one, it appears here automatically.</EmptyState>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
