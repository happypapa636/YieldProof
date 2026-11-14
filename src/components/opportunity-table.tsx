"use client";

import { ArrowDown, ArrowUp, ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { riskRank } from "@/lib/engine/risk";
import { fmtMusd, fmtPct } from "@/lib/format";
import { projectOpportunity } from "@/lib/model/projection";
import { buildContext, SerializedPool } from "@/lib/model/pools";
import { STRATEGY_TYPE_LABEL, type Opportunity } from "@/lib/model/types";
import { useAssumptions } from "./projection";
import { Chip, ConfidenceBadge, FreshnessBadge, inputCls, MetricText, RiskBadge, Select, cn } from "./ui";

type SortKey = "net" | "cost" | "liquidity" | "risk" | "recent" | "advertised" | "name";

const SORTS: { value: SortKey; label: string; desc: boolean }[] = [
  { value: "net", label: "Highest estimated net", desc: true },
  { value: "cost", label: "Lowest transaction cost", desc: false },
  { value: "liquidity", label: "Highest available liquidity", desc: true },
  { value: "risk", label: "Lowest modeled risk", desc: false },
  { value: "recent", label: "Most recent data", desc: true },
  { value: "advertised", label: "Highest advertised (for contrast)", desc: true },
];

const TOGGLES = [
  { key: "musd", label: "MUSD-related" },
  { key: "stablecoin", label: "Stablecoin" },
  { key: "lending", label: "Lending / savings" },
  { key: "lp", label: "Liquidity provision" },
  { key: "leveraged", label: "Leveraged" },
] as const;

const RISKS = ["Lower modeled risk", "Moderate modeled risk", "Elevated modeled risk", "High modeled risk", "Insufficient data"];

export function OpportunityTable({ opportunities, pools, btcPrice, limit }: { opportunities: Opportunity[]; pools: Record<string, SerializedPool>; btcPrice: number | null; limit?: number }) {
  const [a] = useAssumptions();
  const [sort, setSort] = useState<SortKey>("net");
  const [desc, setDesc] = useState(true);
  const [q, setQ] = useState("");
  const [network, setNetwork] = useState("all");
  const [asset, setAsset] = useState("all");
  const [type, setType] = useState("all");
  const [confidence, setConfidence] = useState("all");
  const [risk, setRisk] = useState("all");
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const ctx = useMemo(() => buildContext(pools, btcPrice), [pools, btcPrice]);

  const rows = useMemo(() => {
    return opportunities.map((o) => {
      let p = null;
      try {
        p = projectOpportunity(o, a, ctx);
      } catch {
        p = null;
      }
      return {
        o,
        net: p?.annualized?.toNumber() ?? null,
        costs: p ? p.totalCosts.minus(p.borrowingCosts).toNumber() : null,
        partial: p?.status !== "complete",
      };
    });
  }, [opportunities, a, ctx]);

  const assets = useMemo(() => [...new Set(opportunities.map((o) => o.depositAsset))].sort(), [opportunities]);
  const types = useMemo(() => [...new Set(opportunities.map((o) => o.strategyType))], [opportunities]);
  const needle = q.trim().toLowerCase();

  const filtered = rows
    .filter(({ o }) => !needle || `${o.name} ${o.protocol.name} ${o.depositAsset} ${o.network}`.toLowerCase().includes(needle))
    .filter(({ o }) => network === "all" || o.network === network)
    .filter(({ o }) => asset === "all" || o.depositAsset === asset)
    .filter(({ o }) => type === "all" || o.strategyType === type)
    .filter(({ o }) => confidence === "all" || o.confidence.label === confidence)
    .filter(({ o }) => risk === "all" || o.risk.category === risk)
    .filter(({ o }) => TOGGLES.every((t) => !toggles[t.key] || (t.key === "lending" ? o.tags.lending || o.strategyType === "vault" : o.tags[t.key as keyof Opportunity["tags"]])));

  // Missing values always sort last, whatever the direction: unavailable is never treated as zero.
  const cmp = (x: number | null, y: number | null) => {
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return desc ? y - x : x - y;
  };
  const sorted = [...filtered].sort((x, y) => {
    switch (sort) {
      case "net":
        return cmp(x.net, y.net);
      case "cost":
        return cmp(x.costs, y.costs);
      case "liquidity":
        return cmp(x.o.availableLiquidityUsd.value ?? x.o.tvlUsd.value, y.o.availableLiquidityUsd.value ?? y.o.tvlUsd.value);
      case "risk": {
        const rx = x.o.risk.category === "Insufficient data" ? null : riskRank(x.o.risk.category);
        const ry = y.o.risk.category === "Insufficient data" ? null : riskRank(y.o.risk.category);
        return cmp(rx, ry);
      }
      case "recent":
        return cmp(x.o.lastUpdated ? Date.parse(x.o.lastUpdated) : null, y.o.lastUpdated ? Date.parse(y.o.lastUpdated) : null);
      case "advertised":
        return cmp(x.o.advertised.value, y.o.advertised.value);
      case "name":
        return desc ? y.o.name.localeCompare(x.o.name) : x.o.name.localeCompare(y.o.name);
    }
  });
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const activeFilters = [network, asset, type, confidence, risk].filter((v) => v !== "all").length + Object.values(toggles).filter(Boolean).length + (needle ? 1 : 0);
  const reset = () => {
    setQ("");
    setNetwork("all");
    setAsset("all");
    setType("all");
    setConfidence("all");
    setRisk("all");
    setToggles({});
  };

  const sortBy = (k: SortKey) => {
    if (sort === k) setDesc((d) => !d);
    else {
      setSort(k);
      setDesc(SORTS.find((s) => s.value === k)?.desc ?? false);
    }
  };
  const th = (children: React.ReactNode, k?: SortKey, right?: boolean) => (
    <th key={String(children)} scope="col" className={cn("px-3 py-2.5 font-normal", right && "text-right")} aria-sort={k && sort === k ? (desc ? "descending" : "ascending") : undefined}>
      {k ? (
        <button type="button" onClick={() => sortBy(k)} className={cn("inline-flex items-center gap-1 hover:text-ink", sort === k ? "text-ink" : "", right && "flex-row-reverse")}>
          {children}
          {sort === k ? (desc ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />) : <span className="w-3" aria-hidden />}
        </button>
      ) : (
        children
      )}
    </th>
  );

  return (
    <div>
      {!limit ? (
        <div className="mb-5 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
              <input type="search" aria-label="Search strategies" placeholder="Search strategy, protocol or asset" value={q} onChange={(e) => setQ(e.target.value)} className={cn(inputCls, "pl-9")} />
            </div>
            <Select ariaLabel="Sort by" value={sort} onChange={(v) => { setSort(v as SortKey); setDesc(SORTS.find((s) => s.value === v)?.desc ?? true); }} options={SORTS.map((s) => ({ value: s.value, label: s.label }))} />
            <Select ariaLabel="Network" value={network} onChange={setNetwork} options={[{ value: "all", label: "All networks" }, { value: "Mezo Mainnet", label: "Mezo Mainnet" }, { value: "Mezo Testnet", label: "Mezo Testnet" }]} />
            <Select ariaLabel="Deposit asset" value={asset} onChange={setAsset} options={[{ value: "all", label: "Any asset" }, ...assets.map((x) => ({ value: x, label: x }))]} />
            <Select ariaLabel="Strategy type" value={type} onChange={setType} options={[{ value: "all", label: "Any strategy type" }, ...types.map((x) => ({ value: x, label: STRATEGY_TYPE_LABEL[x] }))]} />
            <Select ariaLabel="Data confidence" value={confidence} onChange={setConfidence} options={[{ value: "all", label: "Any confidence" }, { value: "Verified", label: "Verified" }, { value: "Partial", label: "Partial" }]} />
            <Select ariaLabel="Risk category" value={risk} onChange={setRisk} options={[{ value: "all", label: "Any risk category" }, ...RISKS.map((x) => ({ value: x, label: x }))]} />
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick filters">
            {TOGGLES.map((t) => (
              <Chip key={t.key} on={!!toggles[t.key]} onClick={() => setToggles((s) => ({ ...s, [t.key]: !s[t.key] }))}>
                {t.label}
              </Chip>
            ))}
            {activeFilters ? (
              <button type="button" onClick={reset} className="ml-1 text-[12.5px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink">
                Clear {activeFilters} filter{activeFilters === 1 ? "" : "s"}
              </button>
            ) : null}
          </div>
          <p className="text-[12px] text-faint" aria-live="polite">
            Showing {sorted.length} of {rows.length}. Net estimates use {fmtMusd(a.capital, 0)} MUSD over {a.days} days ({a.compounding === "none" ? "no compounding" : `${a.compounding} compounding`}). Change defaults in <Link className="underline decoration-dotted underline-offset-2 hover:text-ink-2" href="/settings">Settings</Link>.
          </p>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line-strong px-4 py-10 text-center text-[13px] text-muted">
          No opportunities match these filters.{" "}
          <button type="button" onClick={reset} className="text-pos underline-offset-2 hover:underline">
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-[10px] border border-line md:block">
            <table className="w-full min-w-[1040px] border-collapse text-[13px]">
              <thead className="bg-sunk text-left text-[12px] text-muted">
                <tr>
                  {th("Strategy", "name")}
                  {th("Asset")}
                  {th("Advertised", "advertised", true)}
                  {th("Base", undefined, true)}
                  {th("Incentives", undefined, true)}
                  {th("Est. costs", "cost", true)}
                  {th("Est. net / yr", "net", true)}
                  {th("Liquidity", "liquidity", true)}
                  {th("Risk", "risk")}
                  {th("Data", "recent")}
                </tr>
              </thead>
              <tbody>
                {shown.map(({ o, net, costs, partial }) => (
                  <tr key={o.id} className="border-t border-line align-top transition-colors hover:bg-raised/50">
                    <td className="px-3 py-3">
                      <Link href={`/opportunities/${o.id}`} className="font-medium text-ink hover:underline">{o.name}</Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-faint">
                        <a href={o.protocol.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-ink-2">{o.protocol.name}<ExternalLink size={10} aria-hidden /></a>
                        <span aria-hidden>·</span>
                        <span>{o.network}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink-2">{o.depositAsset}</td>
                    <td className="px-3 py-3 text-right"><MetricText m={o.advertised} format={o.advertised.basis === "APR" ? "pct-APR" : "pct-APY"} className="text-muted" /></td>
                    <td className="px-3 py-3 text-right"><MetricText m={o.base} format="pct" className="text-ink-2" /></td>
                    <td className="px-3 py-3 text-right"><MetricText m={o.incentive} format="pct" className="text-ink-2" /></td>
                    <td className="figure px-3 py-3 text-right text-ink-2">{costs === null ? <span className="text-faint">Unavailable</span> : fmtMusd(costs, costs < 1 ? 3 : 2)}</td>
                    <td className={cn("figure px-3 py-3 text-right text-[14px] font-medium", net === null ? "text-faint" : net >= 0 ? "text-pos" : "text-neg")}>
                      {net === null ? <span className="text-[12.5px] font-normal">Insufficient data</span> : fmtPct(net, 2, true)}
                      {net !== null && partial ? <span className="block font-sans text-[11px] font-normal text-faint">partial</span> : null}
                    </td>
                    <td className="px-3 py-3 text-right"><MetricText m={o.availableLiquidityUsd.value !== null ? o.availableLiquidityUsd : o.tvlUsd} format="usd" className="text-ink-2" /></td>
                    <td className="px-3 py-3"><RiskBadge category={o.risk.category} compact /></td>
                    <td className="space-y-1.5 px-3 py-3"><ConfidenceBadge label={o.confidence.label} reasons={o.confidence.reasons} /><div><FreshnessBadge freshness={o.freshness} at={o.lastUpdated} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {shown.map(({ o, net, partial }) => (
              <li key={o.id}>
                <Link href={`/opportunities/${o.id}`} className="panel block p-4 transition-colors hover:border-line-strong">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{o.name}</p>
                      <p className="text-[12px] text-faint">{o.protocol.name} · {o.network}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("figure text-[17px]", net === null ? "text-faint" : net >= 0 ? "text-pos" : "text-neg")}>{net === null ? "n/a" : fmtPct(net, 2, true)}</p>
                      <p className="text-[11px] text-faint">est. net / yr{partial && net !== null ? " · partial" : ""}</p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
                    <dt className="text-muted">Advertised</dt>
                    <dd className="text-right"><MetricText m={o.advertised} format="pct" className="text-ink-2" /></dd>
                    <dt className="text-muted">Liquidity</dt>
                    <dd className="text-right"><MetricText m={o.availableLiquidityUsd.value !== null ? o.availableLiquidityUsd : o.tvlUsd} format="usd" className="text-ink-2" /></dd>
                  </dl>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2"><RiskBadge category={o.risk.category} compact /><ConfidenceBadge label={o.confidence.label} /><FreshnessBadge freshness={o.freshness} at={o.lastUpdated} /></div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {limit && sorted.length > limit ? (
        <Link href="/opportunities" className="mt-4 inline-flex items-center gap-1 text-[13px] text-pos hover:underline">
          See all {sorted.length} opportunities with filters
        </Link>
      ) : null}
    </div>
  );
}
