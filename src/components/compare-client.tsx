"use client";

import { Check, Download, Link2, Printer, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fmtMusd, fmtPct } from "@/lib/format";
import { ComparisonParams, encodeComparison } from "@/lib/model/comparison";
import { Assumptions, projectOpportunity, Projection } from "@/lib/model/projection";
import { buildContext, SerializedPool } from "@/lib/model/pools";
import type { Opportunity } from "@/lib/model/types";
import { ComparisonBars } from "./charts";
import { AssumptionsPanel } from "./projection";
import { useSession } from "./providers";
import { btnCls, Button, Callout, Chip, cn, ConfidenceBadge, FreshnessBadge, H2, inputCls, Panel, RiskBadge } from "./ui";

export function CompareClient({
  opportunities,
  pools,
  btcPrice,
  initial,
  demo = false,
}: {
  opportunities: Opportunity[];
  pools: Record<string, SerializedPool>;
  btcPrice: number | null;
  initial: ComparisonParams;
  demo?: boolean;
}) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>(initial.ids.filter((id) => opportunities.some((o) => o.id === id)));
  const [a, setA] = useState<Assumptions>(initial.assumptions);
  const ctx = useMemo(() => buildContext(pools, btcPrice), [pools, btcPrice]);
  const params: ComparisonParams = { ids, assumptions: a };
  const query = encodeComparison(params);

  useEffect(() => {
    if (demo) return;
    const t = setTimeout(() => router.replace(`/compare?${query}`, { scroll: false }), 400);
    return () => clearTimeout(t);
  }, [query, router, demo]);

  const selected = ids.map((id) => opportunities.find((o) => o.id === id)).filter((o): o is Opportunity => !!o);
  const results = selected.map((o, i) => {
    let p: Projection | null = null;
    let err: string | null = null;
    try {
      p = projectOpportunity(o, a, ctx);
    } catch (e) {
      err = e instanceof Error ? e.message : "Invalid input";
    }
    return { o, p, err, color: i };
  });
  const toggle = (id: string) => setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));

  const showBorrow = selected.some((o) => o.economics.borrow);
  const showLp = selected.some((o) => o.economics.ilModel === "volatile-cp");
  const showFrom = selected.some((o) => o.depositAsset !== "MUSD" && !o.tags.lp && !o.tags.leveraged);
  const risky = results.filter((r) => r.o.risk.category === "High modeled risk" || r.o.risk.category === "Elevated modeled risk");

  const row = (label: string, f: (r: (typeof results)[number]) => React.ReactNode, emphasis?: boolean) => (
    <tr className="border-t border-line align-top">
      <th scope="row" className={cn("sticky left-0 z-[1] bg-surface py-2 pr-4 text-left font-normal", emphasis ? "text-ink" : "text-muted")}>{label}</th>
      {results.map((r) => (
        <td key={r.o.id} className={cn("figure py-2 pl-3 text-right", emphasis && "font-medium")}>{r.err ? <span className="text-neg">error</span> : f(r)}</td>
      ))}
    </tr>
  );
  const signed = (v: number | null | undefined) => <span className={v === null || v === undefined ? "text-faint" : v >= 0 ? "text-pos" : "text-neg"}>{fmtMusd(v ?? null, 2, true)}</span>;
  const cost = (v: number) => <span className={v > 0 ? "text-ink-2" : "text-faint"}>{v > 0 ? `−${fmtMusd(v, v < 1 ? 3 : 2)}` : "0.00"}</span>;

  return (
    <div className="space-y-6">
      <Panel>
        <H2 sub={`Pick 2 to 4 strategies (${ids.length} selected). Every strategy is priced with the same capital, horizon and cost assumptions.`}>Strategies</H2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Select strategies">
          {opportunities.map((o) => {
            const on = ids.includes(o.id);
            const i = ids.indexOf(o.id);
            return (
              <Chip key={o.id} on={on} onClick={() => toggle(o.id)} disabled={!on && ids.length >= 4} className="h-auto min-h-8 py-1 text-left">
                {on ? <span className="figure inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-pos text-[10.5px] text-sunk" aria-hidden>{i + 1}</span> : null}
                {o.name}
              </Chip>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <H2 sub="Shared by every selected strategy.">Assumptions</H2>
        <AssumptionsPanel a={a} onChange={setA} show={{ borrow: showBorrow, lp: showLp, startFrom: showFrom }} />
      </Panel>

      {selected.length < 2 ? (
        <Callout tone="info" title="Select at least two strategies">A comparison needs two to four strategies. {selected.length === 1 ? `${selected[0]!.name} is selected.` : ""}</Callout>
      ) : (
        <>
          <Panel>
            <H2 sub="Green keeps money, red loses it. Unavailable results are labeled, never drawn as zero.">Estimated net result</H2>
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-[12.5px] text-ink-2">Net profit or loss, MUSD over {a.days} days</p>
                <ComparisonBars format="musd-signed" rows={results.map((r) => ({ id: r.o.id, name: r.o.name, value: r.p?.netProfit?.toNumber() ?? null, index: r.color }))} />
              </div>
              <div>
                <p className="mb-3 text-[12.5px] text-ink-2">Estimated net return over {a.days} days</p>
                <ComparisonBars format="pct" rows={results.map((r) => ({ id: r.o.id + "-ret", name: r.o.name, value: r.p?.netReturn?.toNumber() ?? null, index: r.color }))} />
              </div>
            </div>
          </Panel>

          <Panel>
            <H2
              sub={`${fmtMusd(a.capital, 0)} MUSD, ${a.days} days, ${a.compounding === "none" ? "no compounding" : `${a.compounding} compounding where realistic`}.`}
              right={
                <div className="no-print flex flex-wrap gap-2">
                  <a href={`/api/export/csv?${query}${demo ? "&demo=1" : ""}`} className={btnCls("secondary", "sm")} download>
                    <Download size={14} aria-hidden /> Export CSV
                  </a>
                  {!demo ? (
                    <Button size="sm" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/compare?${query}`).then(() => toast.success("Share link copied. It contains strategy ids and assumptions only.")); }}>
                      <Link2 size={14} aria-hidden /> Copy share link
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={() => window.print()}>
                    <Printer size={14} aria-hidden /> Print report
                  </Button>
                </div>
              }
            >
              Side by side
            </H2>
            <p className="mb-2 text-[11.5px] text-faint md:hidden">Swipe sideways to see all {results.length} strategies.</p>
            <div className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
              <table className="w-full min-w-[620px] text-[13px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[1] w-44 bg-surface" />
                    {results.map((r) => (
                      <th key={r.o.id} className="min-w-[140px] py-2 pl-3 text-right align-bottom font-normal">
                        <span className="inline-flex items-start gap-1.5 text-ink">
                          <span className="figure mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-pos text-[10.5px] text-sunk" aria-hidden>{r.color + 1}</span>
                          {r.o.name}
                        </span>
                        <span className="block text-[11.5px] text-faint">{r.o.protocol.name} · {r.o.network}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {row("Advertised", (r) => <span className="text-muted">{r.o.advertised.value === null ? "Not published" : `${fmtPct(r.o.advertised.value)} ${r.o.advertised.basis}`}</span>)}
                  {row("Gross earnings", (r) => fmtMusd(r.p?.grossEarnings?.toNumber() ?? null))}
                  {row("of which base yield", (r) => fmtMusd(r.p?.baseEarnings?.toNumber() ?? null))}
                  {row("of which incentives", (r) => fmtMusd(r.p?.incentiveEarnings?.toNumber() ?? null))}
                  {row("Transaction costs", (r) => cost(r.p?.transactionCosts.toNumber() ?? 0))}
                  {row("Slippage", (r) => cost(r.p?.slippageCosts.toNumber() ?? 0))}
                  {row("Protocol fees", (r) => cost(r.p?.feeCosts.toNumber() ?? 0))}
                  {row("Borrowing costs", (r) => cost(r.p?.borrowingCosts.toNumber() ?? 0))}
                  {row("Impermanent loss (modeled)", (r) => cost(r.p?.ilCost.toNumber() ?? 0))}
                  {row("Estimated net profit / loss", (r) => signed(r.p?.netProfit?.toNumber()), true)}
                  {row("Estimated ending value", (r) => fmtMusd(r.p?.endingValue?.toNumber() ?? null), true)}
                  {row("Estimated net return", (r) => <span className={(r.p?.netReturn?.toNumber() ?? 0) >= 0 ? "text-pos" : "text-neg"}>{fmtPct(r.p?.netReturn?.toNumber() ?? null, 2, true)}</span>, true)}
                  {row("Annualised (simple)", (r) => fmtPct(r.p?.annualized?.toNumber() ?? null, 2, true))}
                  {row("Estimate status", (r) => <span className={r.p?.status === "complete" ? "text-muted" : "text-ink"}>{r.p?.status === "complete" ? "Complete" : r.p?.status === "partial" ? "Partial" : "Insufficient data"}</span>)}
                  <tr className="border-t border-line align-top">
                    <th scope="row" className="sticky left-0 z-[1] bg-surface py-2 pr-4 text-left font-normal text-muted">Risk</th>
                    {results.map((r) => <td key={r.o.id} className="py-2 pl-3 text-right"><RiskBadge category={r.o.risk.category} compact /></td>)}
                  </tr>
                  <tr className="border-t border-line align-top">
                    <th scope="row" className="sticky left-0 z-[1] bg-surface py-2 pr-4 text-left font-normal text-muted">Key risks</th>
                    {results.map((r) => (
                      <td key={r.o.id} className="py-2 pl-3 text-right text-[12px] text-ink-2">
                        {r.o.risk.components.filter((c) => c.level === "high" || c.level === "elevated").map((c) => c.label).join(", ") || "None above moderate"}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-line align-top">
                    <th scope="row" className="sticky left-0 z-[1] bg-surface py-2 pr-4 text-left font-normal text-muted">Liquidity limits</th>
                    {results.map((r) => <td key={r.o.id} className="py-2 pl-3 text-right text-[12px] text-ink-2">{r.o.economics.lockDays === null ? "Unknown" : r.o.economics.lockDays === 0 ? "No lock-up" : `Locked up to ${r.o.economics.lockDays} days`}</td>)}
                  </tr>
                  <tr className="border-t border-line align-top">
                    <th scope="row" className="sticky left-0 z-[1] bg-surface py-2 pr-4 text-left font-normal text-muted">Data</th>
                    {results.map((r) => (
                      <td key={r.o.id} className="space-y-1 py-2 pl-3 text-right">
                        <ConfidenceBadge label={r.o.confidence.label} reasons={r.o.confidence.reasons} />
                        <div><FreshnessBadge freshness={r.o.freshness} at={r.o.lastUpdated} /></div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {risky.length && risky.length < results.length ? (
              <div className="mt-4"><Callout tone="warn" title="Similar returns do not mean similar risk">{risky.map((r) => r.o.name).join(", ")} carr{risky.length === 1 ? "ies" : "y"} elevated or high modeled risk. Read each risk profile before treating these as interchangeable.</Callout></div>
            ) : null}
            <details className="mt-4">
              <summary className="cursor-pointer text-[13px] text-ink-2">Assumptions and warnings per strategy</summary>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                {results.map((r) => (
                  <div key={r.o.id} className="panel-sunk p-3 text-[12px]">
                    <p className="mb-1 font-medium text-ink">{r.o.name}</p>
                    {r.err ? <p className="text-neg">{r.err}</p> : null}
                    <ul className="space-y-0.5 text-muted">
                      {r.p?.ledger.map((l) => <li key={l.label}><span className="text-ink-2">{l.label}:</span> {l.value} <span className="text-faint">[{l.source}]</span></li>)}
                      {r.p?.warnings.map((w) => <li key={w.code} className="text-ink">{w.message}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          </Panel>
          {!demo ? <SaveComparison params={params} onLoad={(p) => { setIds(p.ids); setA(p.assumptions); }} /> : null}
        </>
      )}
    </div>
  );
}

function SaveComparison({ params, onLoad }: { params: ComparisonParams; onLoad: (p: ComparisonParams) => void }) {
  const session = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const list = useQuery({
    queryKey: ["comparisons"],
    enabled: !!session.address,
    queryFn: async () => ((await (await fetch("/api/comparisons")).json()) as { items: { id: string; name: string; params: ComparisonParams; created_at: string }[] }).items,
  });
  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/comparisons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() || "Untitled comparison", params }) });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Save failed");
    },
    onSuccess: () => {
      toast.success("Comparison saved.");
      setName("");
      qc.invalidateQueries({ queryKey: ["comparisons"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/comparisons?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comparisons"] }),
  });
  return (
    <Panel className="no-print">
      <H2 sub="Saved to your wallet address after Sign-In with Ethereum. Contains strategy ids and assumptions only.">Saved comparisons</H2>
      {!session.address ? (
        <p className="text-[13px] text-muted">Connect your wallet and sign in to save comparisons. The share link above works without signing in.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input aria-label="Comparison name" className={cn(inputCls, "max-w-xs")} placeholder="Name this comparison" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <Button size="md" variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save size={14} aria-hidden /> Save comparison
            </Button>
          </div>
          {list.data?.length ? (
            <ul className="divide-y divide-line text-[13px]">
              {list.data.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <button className="inline-flex items-center gap-2 text-left text-ink hover:underline" onClick={() => onLoad(c.params)}>
                    <Check size={13} className="text-faint" aria-hidden /> {c.name}
                    <span className="text-[11.5px] text-faint">{c.params.ids.length} strategies, {new Date(c.created_at).toISOString().slice(0, 10)}</span>
                  </button>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => del.mutate(c.id)}>
                    <Trash2 size={14} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-faint">No saved comparisons yet.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
