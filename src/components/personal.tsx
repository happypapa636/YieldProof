"use client";

import { Bell, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { fmtAge, fmtDateTime, fmtNum, fmtPct } from "@/lib/format";
import { ALERT_LABEL, ALERT_NEEDS_THRESHOLD, AlertKind } from "@/lib/model/alerts";
import { Assumptions, DEFAULT_ASSUMPTIONS } from "@/lib/model/projection";
import { assumptionsSchema } from "@/lib/model/comparison";
import { AssumptionsPanel, loadStoredAssumptions, storeAssumptions } from "./projection";
import { useSession } from "./providers";
import { WalletButton } from "./shell";
import { StabilityPoolPanel } from "./testnet-actions";
import { Button, Callout, cn, EmptyState, H2, inputCls, Panel } from "./ui";

function SignInGate({ what }: { what: string }) {
  const { isConnected } = useAccount();
  const session = useSession();
  return (
    <EmptyState title={`Sign in to see your ${what}`} action={isConnected ? <Button variant="primary" onClick={() => session.signIn()} disabled={session.signingIn}>{session.signingIn ? "Waiting for signature…" : "Sign in with Ethereum"}</Button> : <WalletButton />}>
      Your {what} is stored against your wallet address after a free signature (Sign-In with Ethereum). No transaction, no gas, no private keys.
    </EmptyState>
  );
}

interface AlertItem {
  id: number;
  opportunity_id: string;
  kind: AlertKind;
  threshold: string | null;
  state: string;
  last_value: string | null;
  last_checked_at: string | null;
  last_triggered_at: string | null;
}

export function WatchlistClient() {
  const session = useSession();
  const qc = useQueryClient();
  const enabled = !!session.address;
  const index = useQuery({ queryKey: ["opp-index"], queryFn: async () => ((await (await fetch("/api/opportunities?index=1")).json()) as { items: { id: string; name: string }[]; lastCronSuccess: string | null }) });
  const watch = useQuery({ queryKey: ["watchlist"], enabled, queryFn: async () => ((await (await fetch("/api/watchlist")).json()) as { items: { opportunity_id: string; created_at: string }[] }).items });
  const alerts = useQuery({ queryKey: ["alerts"], enabled, queryFn: async () => ((await (await fetch("/api/alerts")).json()) as { items: AlertItem[] }).items });
  const notes = useQuery({ queryKey: ["notifications"], enabled, queryFn: async () => ((await (await fetch("/api/notifications")).json()) as { items: { id: number; message: string; created_at: string; read_at: string | null; opportunity_id: string | null }[] }).items });
  const check = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/alerts/check", { method: "POST" });
      if (!r.ok) throw new Error("Check failed");
      return (await r.json()) as { checked: number; triggered: number; unavailable: number };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      if (r.checked) toast(`Checked ${r.checked} alert${r.checked === 1 ? "" : "s"}: ${r.triggered} newly triggered, ${r.unavailable} unavailable.`);
    },
  });
  const ranOnce = useRef(false);
  useEffect(() => {
    if (enabled && !ranOnce.current) {
      ranOnce.current = true;
      check.mutate();
    }
  }, [enabled, check]);
  const name = (id: string) => index.data?.items.find((i) => i.id === id)?.name ?? id;
  const unwatch = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/watchlist?opportunityId=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
  const delAlert = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const markRead = useMutation({ mutationFn: async () => void (await fetch("/api/notifications", { method: "POST" })), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });

  if (session.loading) return null;
  if (!enabled) return <SignInGate what="watchlist" />;
  const lastChecked = alerts.data?.map((a) => a.last_checked_at).filter(Boolean).sort().at(-1) ?? null;
  return (
    <div className="space-y-6">
      <Callout tone="info" title="How monitoring works">
        Alerts are checked once a day by a scheduled job{index.data?.lastCronSuccess ? ` (last run ${fmtDateTime(index.data.lastCronSuccess)})` : ""} and every time you open this page. This is not continuous monitoring. Notifications appear in the app only; no email is sent.
      </Callout>
      <Panel>
        <H2 sub={`${watch.data?.length ?? 0} saved. Add strategies from any opportunity page.`}>Watchlist</H2>
        {watch.data?.length ? (
          <ul className="divide-y divide-line text-[13.5px]">
            {watch.data.map((w) => (
              <li key={w.opportunity_id} className="flex items-center justify-between gap-3 py-2.5">
                <Link href={`/opportunities/${w.opportunity_id}`} className="text-ink hover:underline">{name(w.opportunity_id)}</Link>
                <span className="flex items-center gap-3 text-[12px] text-faint">added {fmtAge(w.created_at)}
                  <Button size="sm" variant="ghost" aria-label={`Remove ${name(w.opportunity_id)}`} onClick={() => unwatch.mutate(w.opportunity_id)}><Trash2 size={14} aria-hidden /></Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing watched yet" action={<Link href="/opportunities" className="text-[13px] text-pos hover:underline">Browse opportunities</Link>}>Open any opportunity and choose “Add to watchlist”.</EmptyState>
        )}
      </Panel>
      <Panel>
        <H2 sub={lastChecked ? `Last checked ${fmtAge(lastChecked)} (${fmtDateTime(lastChecked)}).` : "Not checked yet."} right={<Button size="sm" onClick={() => check.mutate()} disabled={check.isPending}><RefreshCw size={14} className={check.isPending ? "animate-spin" : ""} aria-hidden /> Check now</Button>}>
          Alerts
        </H2>
        {alerts.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead><tr className="text-left text-[12px] text-faint"><th className="py-1.5 font-normal">Strategy</th><th className="font-normal">Condition</th><th className="font-normal">Status</th><th className="font-normal">Last value</th><th className="font-normal">Last checked</th><th /></tr></thead>
              <tbody>
                {alerts.data.map((a) => {
                  const needs = ALERT_NEEDS_THRESHOLD[a.kind];
                  const thr = a.threshold === null ? "" : needs === "rate" ? ` ${fmtPct(Number(a.threshold))}` : ` $${fmtNum(Number(a.threshold), 0)}`;
                  const lv = a.last_value === null ? "–" : needs === "usd" ? `$${fmtNum(Number(a.last_value), 0)}` : fmtPct(Number(a.last_value));
                  return (
                    <tr key={a.id} className="border-t border-line">
                      <td className="py-2 pr-3"><Link className="text-ink hover:underline" href={`/opportunities/${a.opportunity_id}`}>{name(a.opportunity_id)}</Link></td>
                      <td className="pr-3 text-ink-2">{ALERT_LABEL[a.kind]}{thr}</td>
                      <td className={cn("pr-3", a.state === "triggered" ? "text-neg" : a.state === "ok" ? "text-pos" : "text-ink")}>{a.state === "unknown" ? "Not yet checked" : a.state}</td>
                      <td className="figure pr-3">{lv}</td>
                      <td className="pr-3 text-[12px] text-faint">{a.last_checked_at ? fmtAge(a.last_checked_at) : "never"}</td>
                      <td><Button size="sm" variant="ghost" aria-label="Delete alert" onClick={() => delAlert.mutate(a.id)}><Trash2 size={14} aria-hidden /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-muted">No alerts. Set one from an opportunity page: yield below a threshold, incentives falling, liquidity dropping, borrowing costs rising, stale data, parameter changes, or estimated net turning negative.</p>
        )}
      </Panel>
      <Panel>
        <H2 right={notes.data?.some((n) => !n.read_at) ? <Button size="sm" variant="ghost" onClick={() => markRead.mutate()}>Mark all read</Button> : undefined}>Notifications</H2>
        {notes.data?.length ? (
          <ul className="space-y-2 text-[13px]">
            {notes.data.map((n) => (
              <li key={n.id} className={cn("flex gap-3 rounded-[8px] px-3 py-2", n.read_at ? "text-muted" : "bg-raised text-ink")}>
                <Bell size={14} className="mt-0.5 shrink-0" aria-hidden />
                <span className="flex-1">{n.message}</span>
                <span className="text-[11.5px] text-faint">{fmtAge(n.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-faint">No notifications yet.</p>
        )}
      </Panel>
    </div>
  );
}

interface PortfolioData {
  address: string;
  readAt: string;
  testnet: null | { block: string | null; btc: number | null; musd: number | null; stabilityPool: { deposit: number | null; collateralGainBtc: number | null }; trove: { status: string | null; collateralBtc?: number | null; debtMusd?: number | null; icr?: number | null; interestRateBps?: number | null } };
  mainnet: null | { block: string | null; btc: number | null; musd: number | null; sMusd: number | null; sMusdClaimableYield: number | null; sMusdStakedInGauge: number | null; troveStatus: string | null };
}

export function PortfolioClient() {
  const { address: connected } = useAccount();
  const [manual, setManual] = useState("");
  const target = manual && isAddress(manual) ? manual : connected;
  const q = useQuery({
    queryKey: ["portfolio", target],
    enabled: !!target,
    queryFn: async () => {
      const r = await fetch(`/api/portfolio?address=${target}`);
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Read failed");
      return (await r.json()) as PortfolioData;
    },
    refetchInterval: 60_000,
  });
  const v = (x: number | null | undefined, dp = 4) => (x === null || x === undefined ? <span className="italic text-faint">Unavailable</span> : <span className="figure">{fmtNum(x, dp)}</span>);
  return (
    <div className="space-y-6">
      <Panel>
        <H2 sub="Read-only. Use your connected wallet or paste any address; nothing is stored.">Address</H2>
        <div className="flex flex-wrap items-center gap-3">
          <input aria-label="Address to inspect" className={cn(inputCls, "figure max-w-md")} placeholder={connected ?? "0x… (or connect a wallet)"} value={manual} onChange={(e) => setManual(e.target.value.trim())} />
          {!connected ? <WalletButton /> : null}
          {manual && !isAddress(manual) ? <span className="text-[12px] text-neg">Not a valid address</span> : null}
        </div>
      </Panel>
      {!target ? (
        <EmptyState title="Connect a wallet or paste an address">Portfolio reads balances and positions straight from Mezo contracts.</EmptyState>
      ) : q.isLoading ? (
        <p className="text-[13px] text-muted">Reading Mezo testnet and mainnet…</p>
      ) : q.error ? (
        <Callout tone="neg">{(q.error as Error).message}</Callout>
      ) : q.data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <H2 sub={`Block ${q.data.testnet?.block ?? "?"}, read ${fmtAge(q.data.readAt)}.`}>Mezo Testnet</H2>
            {q.data.testnet ? (
              <dl className="grid grid-cols-[1fr_auto] text-[13px] [&>*]:border-t [&>*]:border-line [&>*]:py-2 [&>dd]:pl-4 [&>dd]:text-right [&>dd]:text-ink">
                <dt className="text-muted">BTC (gas)</dt><dd className="text-right">{v(q.data.testnet.btc, 6)}</dd>
                <dt className="text-muted">MUSD</dt><dd className="text-right">{v(q.data.testnet.musd, 2)}</dd>
                <dt className="text-muted">Stability Pool deposit</dt><dd className="text-right">{v(q.data.testnet.stabilityPool.deposit, 2)} MUSD</dd>
                <dt className="text-muted">Stability Pool BTC gain</dt><dd className="text-right">{v(q.data.testnet.stabilityPool.collateralGainBtc, 8)}</dd>
                <dt className="text-muted">MUSD trove</dt><dd className="text-right">{q.data.testnet.trove.status ?? "Unavailable"}</dd>
                {q.data.testnet.trove.status === "active" ? (
                  <>
                    <dt className="text-muted">Collateral / debt</dt><dd className="text-right">{v(q.data.testnet.trove.collateralBtc, 4)} BTC / {v(q.data.testnet.trove.debtMusd, 2)}</dd>
                    <dt className="text-muted">Collateral ratio</dt><dd className="text-right">{q.data.testnet.trove.icr ? <span className={cn("figure", q.data.testnet.trove.icr < 1.1 ? "text-neg" : "")}>{fmtPct(q.data.testnet.trove.icr, 1)}{q.data.testnet.trove.icr < 1.5 ? <span className="ml-1 font-sans text-[11px] text-faint">below 150% CCR</span> : null}</span> : "Unavailable"}</dd>
                    <dt className="text-muted">Trove interest rate</dt><dd className="text-right figure">{q.data.testnet.trove.interestRateBps === null || q.data.testnet.trove.interestRateBps === undefined ? "?" : `${(q.data.testnet.trove.interestRateBps / 100).toFixed(2)}%`}</dd>
                  </>
                ) : null}
              </dl>
            ) : <Callout tone="warn">Testnet RPC unavailable.</Callout>}
          </Panel>
          <Panel>
            <H2 sub={`Block ${q.data.mainnet?.block ?? "?"}. Read-only analytics.`}>Mezo Mainnet</H2>
            {q.data.mainnet ? (
              <dl className="grid grid-cols-[1fr_auto] text-[13px] [&>*]:border-t [&>*]:border-line [&>*]:py-2 [&>dd]:pl-4 [&>dd]:text-right [&>dd]:text-ink">
                <dt className="text-muted">BTC</dt><dd className="text-right">{v(q.data.mainnet.btc, 6)}</dd>
                <dt className="text-muted">MUSD</dt><dd className="text-right">{v(q.data.mainnet.musd, 2)}</dd>
                <dt className="text-muted">sMUSD (savings vault)</dt><dd className="text-right">{v(q.data.mainnet.sMusd, 2)}</dd>
                <dt className="text-muted">sMUSD claimable yield</dt><dd className="text-right">{v(q.data.mainnet.sMusdClaimableYield, 4)} MUSD</dd>
                <dt className="text-muted">sMUSD staked in gauge</dt><dd className="text-right">{v(q.data.mainnet.sMusdStakedInGauge, 2)}</dd>
                <dt className="text-muted">MUSD trove</dt><dd className="text-right">{q.data.mainnet.troveStatus ?? "Unavailable"}</dd>
              </dl>
            ) : <Callout tone="warn">Mainnet RPC unavailable.</Callout>}
          </Panel>
        </div>
      ) : null}
      <StabilityPoolPanel />
      <Panel>
        <H2>What YieldProof can and cannot see</H2>
        <div className="grid gap-6 text-[13px] md:grid-cols-2">
          <div>
            <p className="mb-2 font-medium text-ink">Supported (verified reads)</p>
            <ul className="list-disc space-y-1 pl-5 text-ink-2">
              <li>MUSD and BTC balances on Mezo Testnet and Mainnet</li>
              <li>MUSD Stability Pool deposit and BTC gains (testnet)</li>
              <li>MUSD trove status, collateral, debt, ratio and rate (testnet); trove status (mainnet)</li>
              <li>sMUSD balance, claimable yield and gauge stake (mainnet)</li>
              <li>Testnet only: deposit to and withdraw from the MUSD Stability Pool, with explorer links for every transaction</li>
            </ul>
          </div>
          <div>
            <p className="mb-2 font-medium text-ink">Not supported</p>
            <ul className="list-disc space-y-1 pl-5 text-ink-2">
              <li>veBTC / veMEZO locks, Mezo Pools LP positions, Boar Finance</li>
              <li>Any other chain or protocol</li>
              <li>Holding a protocol token is not treated as holding a position</li>
            </ul>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function SettingsClient() {
  const session = useSession();
  const [a, setA] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);
  const [loadedRemote, setLoadedRemote] = useState(false);
  // Hydrate from browser storage after mount (not available during SSR).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setA(loadStoredAssumptions()), []);
  useEffect(() => {
    if (!session.address || loadedRemote) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((j: { settings: { assumptions?: unknown } | null }) => {
        const p = assumptionsSchema.safeParse({ ...DEFAULT_ASSUMPTIONS, ...((j.settings?.assumptions as object) ?? {}) });
        if (j.settings && p.success) setA(p.data);
        setLoadedRemote(true);
      })
      .catch(() => setLoadedRemote(true));
  }, [session.address, loadedRemote]);
  const save = async () => {
    storeAssumptions(a);
    if (session.address) {
      const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ assumptions: a, staleHours: 30 }) });
      if (!r.ok) return toast.error("Saved on this device, but the server save failed.");
      return toast.success("Saved to this device and your wallet profile. Net-return alerts use these assumptions.");
    }
    toast.success("Saved on this device.");
  };
  return (
    <div className="space-y-6">
      <Panel>
        <H2 sub="Used by the opportunity table, calculators and your “net turns negative” alerts.">Default investment assumptions</H2>
        <AssumptionsPanel a={a} onChange={setA} show={{ borrow: true, lp: true, startFrom: true }} />
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" onClick={save}>Save assumptions</Button>
          <Button variant="ghost" onClick={() => setA(DEFAULT_ASSUMPTIONS)}>Reset to defaults</Button>
        </div>
        <p className="mt-3 text-[12px] text-faint">{session.address ? "Signed in: settings sync to your wallet profile." : "Not signed in: settings stay in this browser only."}</p>
      </Panel>
      <Panel>
        <H2>Data freshness policy</H2>
        <p className="text-[13px] leading-relaxed text-muted">Values observed within 6 hours are fresh, up to 30 hours aging, older stale. Stale sources downgrade an opportunity to Partial confidence and raise its data-quality risk. Live data is cached for at most 10 minutes; daily snapshots build YieldProof&apos;s own history.</p>
      </Panel>
    </div>
  );
}
