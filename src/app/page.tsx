import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Logo, WalletButton } from "@/components/shell";
import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { btnCls } from "@/lib/styles";
import { MAINNET, MAINNET_POOLS, TESTNET } from "@/config/contracts";
import { loadDataset } from "@/lib/data/load";
import { fmtAge, fmtCompact, fmtPct } from "@/lib/format";
import { DEFAULT_ASSUMPTIONS, projectOpportunity } from "@/lib/model/projection";
import { buildContext } from "@/lib/model/pools";

export const dynamic = "force-dynamic";

/** Hero chart: live advertised rate (dashed outline) against YieldProof's estimated net (solid). */
async function LiveGap() {
  const { ds } = await loadDataset();
  if (!ds) {
    return (
      <p className="text-[13px] text-muted">
        Live data is temporarily unavailable. The <Link href="/demo" className="text-pos hover:underline">fictional demo</Link> works offline.
      </p>
    );
  }
  const ctx = buildContext(ds.pools, ds.mainnet?.btcPrice ?? null);
  const rows = ds.opportunities
    .filter((o) => o.advertised.value !== null && o.network === "Mezo Mainnet")
    .map((o) => {
      let net: number | null = null;
      let partial = false;
      try {
        const p = projectOpportunity(o, DEFAULT_ASSUMPTIONS, ctx);
        net = p.annualized?.toNumber() ?? null;
        partial = p.status !== "complete";
      } catch {
        net = null;
      }
      const adv = o.advertised.value ?? 0;
      const incShare = (o.incentive.value ?? 0) / (adv || 1);
      const why = [
        incShare >= 0.5 ? `${Math.round(incShare * 100)}% paid in incentive tokens` : null,
        o.economics.lockDays && o.economics.lockDays > 0 ? `locked up to ${o.economics.lockDays} days` : null,
        o.advertised.basis === "APY" ? "quoted as APY" : null,
      ].filter(Boolean);
      return { o, adv, net, partial, why: why.join(" · ") };
    })
    .sort((a, b) => b.adv - a.adv)
    .slice(0, 5);
  const max = Math.max(0.01, ...rows.map((r) => Math.max(r.adv, Math.abs(r.net ?? 0))));

  return (
    <div>
      <ul className="space-y-5">
        {rows.map(({ o, adv, net, partial, why }) => (
          <li key={o.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <Link href={`/opportunities/${o.id}`} className="min-w-0 truncate text-[13.5px] text-ink hover:underline">
                {o.name}
              </Link>
              <span className="figure shrink-0 text-[12.5px] text-muted">
                {fmtPct(adv)} <span aria-hidden>→</span>{" "}
                <span className={net === null ? "text-faint" : net >= 0 ? "text-pos" : "text-neg"}>{net === null ? "n/a" : fmtPct(net, 2, true)}</span>
              </span>
            </div>
            <div className="space-y-1" aria-hidden>
              <div className="h-2 rounded-[2px] border border-dashed border-muted" style={{ width: `${Math.max(1, (adv / max) * 100)}%` }} />
              <div className={cn("h-2 rounded-[2px]", net === null ? "bg-line-strong" : net >= 0 ? "bg-pos" : "bg-neg")} style={{ width: `${Math.max(1, (Math.abs(net ?? 0) / max) * 100)}%` }} />
            </div>
            <p className="mt-1 text-[11.5px] text-faint">
              {why || " "}
              {partial && net !== null ? `${why ? " · " : ""}partial estimate` : ""}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[11.5px] text-faint">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-[1px] border border-dashed border-muted" aria-hidden />Advertised</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-[1px] bg-pos" aria-hidden />Estimated net</span>
        <span>10,000 MUSD, 1 year, no compounding · refreshed {fmtAge(ds.generatedAt)}</span>
      </div>
    </div>
  );
}

async function MezoStrip() {
  const { ds } = await loadDataset();
  const contracts = Object.keys(MAINNET).length + MAINNET_POOLS.length + Object.keys(TESTNET).length;
  const items: [string, string][] = [
    ["MUSD supply (mainnet)", ds ? fmtCompact(ds.mainnet?.musdSupply ?? null) : "–"],
    ["BTC oracle price", ds?.mainnet?.btcPrice ? `$${fmtCompact(ds.mainnet.btcPrice)}` : "–"],
    ["Strategies priced", ds ? String(ds.opportunities.length) : "–"],
    ["Live sources responding", ds ? `${ds.sources.filter((s) => s.ok).length} / ${ds.sources.length}` : "–"],
    ["Contracts read", String(contracts)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
      {items.map(([k, v]) => (
        <div key={k} className="border-l border-line pl-4">
          <dt className="text-[12px] text-muted">{k}</dt>
          <dd className="figure mt-1 text-[22px] text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const BENEFITS = [
  ["Calculate net yield after estimated costs.", "Gas at the live Mezo gas price, slippage quoted from on-chain pool reserves at your size, borrowing at the MUSD contract rate, protocol fees only where they are not already in the quote."],
  ["Separate base yield from token incentives.", "See how much of a headline is paid in reward tokens, then test it at 25%, 50% and zero of today's price."],
  ["Understand risks before committing funds.", "Lock-ups, liquidity depth, liquidation distance and audit evidence, with “Insufficient data” wherever evidence is missing."],
] as const;

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 md:px-8">
          <Logo />
          <nav aria-label="Primary" className="hidden gap-6 text-[13.5px] text-muted md:flex">
            <Link href="/dashboard" className="hover:text-ink">Dashboard</Link>
            <Link href="/opportunities" className="hover:text-ink">Opportunities</Link>
            <Link href="/compare" className="hover:text-ink">Compare</Link>
            <Link href="/musd" className="hover:text-ink">MUSD</Link>
            <Link href="/methodology" className="hover:text-ink">Methodology</Link>
            <Link href="/demo" className="hover:text-ink">Demo</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/dashboard" className={cn(btnCls("ghost", "sm"), "hidden sm:inline-flex")}>Open app</Link>
            <WalletButton />
          </div>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-[1200px] gap-12 px-4 pb-16 pt-14 md:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:pt-20">
          <div>
            <p className="eyebrow mb-5">Net-yield analytics for MUSD on Mezo</p>
            <h1 className="font-display text-[54px] leading-[0.98] tracking-[-0.02em] text-ink md:text-[76px]">See Beyond APY.</h1>
            <p className="mt-6 max-w-[34ch] text-[19px] leading-relaxed text-ink-2">Compare DeFi strategies using estimated net returns, transparent costs, and risk-aware analytics.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/opportunities" className={cn(btnCls("primary"), "h-11 px-5 text-[14.5px]")}>
                Explore Yield Opportunities <ArrowRight size={15} aria-hidden />
              </Link>
              <Link href="/compare" className={cn(btnCls("secondary"), "h-11 px-5 text-[14.5px]")}>
                Compare Strategies
              </Link>
            </div>
            <p className="mt-6 max-w-[52ch] text-[12.5px] leading-relaxed text-faint">Projected returns are estimates built from visible assumptions and backward-looking data. They are not guarantees of future returns and not financial advice.</p>
          </div>
          <div className="panel p-5 md:p-6">
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[20px] leading-tight">The gap, measured live</h2>
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-pos" aria-hidden />Mezo mainnet</span>
            </div>
            <Suspense
              fallback={
                <div className="space-y-5" aria-label="Reading live sources">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="space-y-1.5"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-2" /><Skeleton className="h-2 w-1/2" /></div>
                  ))}
                  <p className="text-[12px] text-faint">Reading DefiLlama and Mezo contracts…</p>
                </div>
              }
            >
              <LiveGap />
            </Suspense>
          </div>
        </section>

        <section className="border-y border-line bg-sunk">
          <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 md:grid-cols-3 md:px-8">
            {BENEFITS.map(([t, d], i) => (
              <div key={t}>
                <p className="figure text-[12px] text-pos">0{i + 1}</p>
                <h3 className="mt-3 font-display text-[21px] leading-snug text-ink">{t}</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-16 md:px-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-2">Built on Mezo</p>
              <h2 className="font-display text-[30px] leading-tight">Every number traces to a source</h2>
              <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-muted">YieldProof reads MUSD, the sMUSD savings vault, Mezo Pools and the BTC oracle directly from chain, cross-checks DefiLlama against those reads, and shows you where they disagree.</p>
            </div>
            <Link href="/sources" className="inline-flex items-center gap-1 text-[13.5px] text-pos hover:underline">
              Sources & discrepancies <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          <Suspense fallback={<Skeleton className="h-16" />}>
            <MezoStrip />
          </Suspense>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 pb-20 md:px-8">
          <div className="panel grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
            <div>
              <h2 className="font-display text-[24px]">No wallet needed to start</h2>
              <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-muted">Try the interactive demo with four clearly fictional strategies, or read exactly how every number is computed. Connect a wallet only when you want to read your MUSD positions, save a watchlist or practise on Mezo testnet.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/demo" className={btnCls("secondary")}>Open the demo</Link>
              <Link href="/methodology" className={btnCls("ghost")}>Read the methodology</Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-line px-4 py-6 text-[12px] text-faint md:px-8">
        <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-3">
          <span>YieldProof shows you where the yield comes from, what it costs, what could go wrong, and what you might actually keep.</span>
          <span className="flex gap-4">
            <Link href="/methodology" className="hover:text-ink-2">Methodology</Link>
            <Link href="/legal" className="hover:text-ink-2">Terms, privacy & risk</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
