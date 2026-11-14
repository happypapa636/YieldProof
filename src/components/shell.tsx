"use client";

import { Command } from "cmdk";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpenText,
  Coins,
  Columns3,
  FlaskConical,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Scale,
  Search,
  Settings,
  ShieldHalf,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog, Popover } from "radix-ui";
import { ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWalletClient } from "wagmi";
import { MEZO_TESTNET_FAUCET, mezoMainnet, mezoTestnet } from "@/config/chains";
import { TESTNET } from "@/config/contracts";
import { fmtAge, shortAddr } from "@/lib/format";
import { useSession } from "./providers";
import { Button, cn } from "./ui";

export const NAV = [
  { group: "Markets", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/opportunities", label: "Opportunities", icon: BarChart3 },
    { href: "/compare", label: "Compare", icon: Columns3 },
    { href: "/musd", label: "MUSD explorer", icon: Coins },
    { href: "/risk", label: "Risk", icon: ShieldHalf },
    { href: "/history", label: "History", icon: History },
  ] },
  { group: "Evidence", items: [
    { href: "/sources", label: "Sources & discrepancies", icon: Scale },
    { href: "/methodology", label: "Methodology", icon: BookOpenText },
  ] },
  { group: "Yours", items: [
    { href: "/watchlist", label: "Watchlist & alerts", icon: ListChecks },
    { href: "/portfolio", label: "Portfolio", icon: Wallet },
    { href: "/settings", label: "Settings", icon: Settings },
  ] },
  { group: "Try it", items: [{ href: "/demo", label: "Interactive demo", icon: FlaskConical }] },
] as const;

export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="3" y="4" width="7" height="24" rx="1" fill="none" stroke="#9a9c9b" strokeWidth="1.5" strokeDasharray="2.5 2" />
      <rect x="12.5" y="11" width="7" height="17" rx="1" fill="#9a9c9b" />
      <rect x="22" y="16" width="7" height="12" rx="1" fill="#3fb68b" />
    </svg>
  );
}

export function Logo({ className, wordmarkClassName }: { className?: string; wordmarkClassName?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2", className)} aria-label="YieldProof home">
      <LogoMark />
      <span className={cn("font-display text-[19px] tracking-tight text-ink", wordmarkClassName)}>YieldProof</span>
    </Link>
  );
}

function NetworkStatus() {
  const q = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await (await fetch("/api/health", { cache: "no-store" })).json()) as { rpc: string; blockNumber: string | null; mainnetBlock: string | null; mainnetRpc?: string; db: string },
    refetchInterval: 30_000,
  });
  const ok = q.data?.rpc === "ok";
  return (
    <div className="hidden items-center gap-4 text-[12px] text-muted md:flex" aria-live="polite">
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", q.isLoading ? "bg-faint" : q.data?.mainnetBlock ? "bg-pos" : "bg-neg")} aria-hidden />
        Mainnet {q.data?.mainnetBlock ? <span className="figure text-ink-2">#{Number(q.data.mainnetBlock).toLocaleString("en-US")}</span> : q.isLoading ? "…" : "unreachable"}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", q.isLoading ? "bg-faint" : ok ? "bg-pos" : "bg-neg")} aria-hidden />
        Testnet {q.data?.blockNumber ? <span className="figure text-ink-2">#{Number(q.data.blockNumber).toLocaleString("en-US")}</span> : q.isLoading ? "…" : "unreachable"}
      </span>
    </div>
  );
}

interface NotificationItem {
  id: number;
  message: string;
  created_at: string;
  read_at: string | null;
  opportunity_id: string | null;
}

function NotificationBell() {
  const session = useSession();
  const qc = useQueryClient();
  const notes = useQuery({
    queryKey: ["notifications"],
    enabled: !!session.address,
    queryFn: async () => {
      const r = await fetch("/api/notifications");
      if (!r.ok) return [] as NotificationItem[];
      return ((await r.json()) as { items: NotificationItem[] }).items;
    },
    refetchInterval: 120_000,
  });
  const markRead = useMutation({
    mutationFn: async () => void (await fetch("/api/notifications", { method: "POST" })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  if (!session.address) return null;
  const items = notes.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="relative inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-line text-muted hover:border-line-strong hover:text-ink" aria-label={unread ? `${unread} unread notifications` : "Notifications"}>
          <Bell size={15} aria-hidden />
          {unread ? <span className="figure absolute -right-1.5 -top-1.5 min-w-[17px] rounded-full bg-pos px-1 text-center text-[10px] leading-[17px] text-sunk">{unread > 9 ? "9+" : unread}</span> : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[min(360px,calc(100vw-24px))] rounded-[10px] border border-line-strong bg-surface p-0 text-[13px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="font-medium text-ink">Notifications</p>
            {unread ? (
              <button type="button" className="text-[12px] text-muted hover:text-ink" onClick={() => markRead.mutate()}>
                Mark all read
              </button>
            ) : null}
          </div>
          {items.length ? (
            <ul className="max-h-[320px] overflow-y-auto">
              {items.slice(0, 8).map((n) => (
                <li key={n.id} className={cn("border-b border-line px-4 py-2.5 last:border-0", n.read_at ? "text-muted" : "text-ink")}>
                  <p className="flex gap-2">
                    {!n.read_at ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pos" aria-label="unread" /> : null}
                    <span>{n.message}</span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-faint">{fmtAge(n.created_at)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-muted">No notifications. Alerts you set on a strategy report here.</p>
          )}
          <div className="border-t border-line px-4 py-2.5">
            <Popover.Close asChild>
              <Link href="/watchlist" className="text-[12.5px] text-pos hover:underline">
                Watchlist & alerts
              </Link>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const session = useSession();
  const [open, setOpen] = useState(false);
  return (
    <>
      {isConnected ? (
        <div className="flex items-center gap-2">
          {chainId !== mezoTestnet.id && chainId !== mezoMainnet.id ? <span className="hidden rounded-full border border-neg/50 px-2 py-0.5 text-[11px] text-neg sm:inline">Wrong network</span> : null}
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)} aria-label="Wallet details">
            <span className={cn("h-1.5 w-1.5 rounded-full", session.address ? "bg-pos" : "bg-muted")} aria-hidden />
            <span className="figure">{shortAddr(address)}</span>
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
          <Wallet size={14} aria-hidden /> <span>Connect<span className="hidden sm:inline"> wallet</span></span>
        </Button>
      )}
      <WalletDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function WalletDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { address, isConnected, chainId, connector } = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { data: wallet } = useWalletClient();
  const session = useSession();
  const unique = connectors.filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i);

  const addMusd = async () => {
    try {
      if (!wallet) throw new Error("Connect a wallet first");
      if (chainId !== mezoTestnet.id) await switchChainAsync({ chainId: mezoTestnet.id });
      await wallet.watchAsset({ type: "ERC20", options: { address: TESTNET.MUSD, symbol: "MUSD", decimals: 18 } });
      toast.success("MUSD (testnet) added to your wallet.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message.split("\n")[0]! : "Could not add MUSD.");
    }
  };
  const addNetwork = async () => {
    try {
      await switchChainAsync({ chainId: mezoTestnet.id });
      toast.success("Switched to Mezo Testnet.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message.split("\n")[0]! : "Could not switch network.");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content className="panel fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 p-6">
          <div className="flex items-start justify-between">
            <Dialog.Title className="font-display text-xl">{isConnected ? "Your wallet" : "Connect a wallet"}</Dialog.Title>
            <Dialog.Close className="rounded p-1 text-muted hover:text-ink" aria-label="Close">
              <X size={16} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-[13px] leading-relaxed text-muted">
            Browsing, comparing and the demo never need a wallet. Connecting lets YieldProof read your MUSD positions; signing in saves your watchlist. YieldProof never asks for a private key or seed phrase and never holds funds.
          </Dialog.Description>

          {!isConnected ? (
            <div className="mt-5 flex flex-col gap-2">
              {unique.length === 0 ? (
                <p className="text-[13px] text-muted">No browser wallet detected. Install MetaMask, Rabby or another EIP-6963 wallet, then reload.</p>
              ) : (
                unique.map((c) => (
                  <button
                    key={c.uid}
                    type="button"
                    disabled={isPending}
                    onClick={async () => {
                      try {
                        await connectAsync({ connector: c, chainId: mezoTestnet.id });
                        toast.success(`Connected with ${c.name}.`);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message.split("\n")[0]! : "Connection failed.");
                      }
                    }}
                    className="flex items-center gap-3 rounded-[8px] border border-line-strong bg-raised px-3 py-2.5 text-left text-sm hover:border-muted"
                  >
                    {c.icon ? <img src={c.icon} alt="" width={22} height={22} className="rounded" /> : <Wallet size={18} aria-hidden />}
                    {c.name}
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="panel-sunk px-3 py-2.5 text-[13px]">
                <p className="figure break-all text-ink">{address}</p>
                <p className="mt-1 text-muted">
                  {connector?.name} on {chainId === mezoTestnet.id ? "Mezo Testnet" : chainId === mezoMainnet.id ? "Mezo Mainnet (read-only here)" : `unsupported chain ${chainId}`}
                  {" · "}
                  {session.address ? <span className="text-pos">signed in</span> : "not signed in"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {session.address ? (
                  <Button size="sm" variant="secondary" onClick={() => session.signOut()}>
                    <LogOut size={14} aria-hidden /> Sign out
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" disabled={session.signingIn} onClick={() => session.signIn()}>
                    {session.signingIn ? "Waiting for signature…" : "Sign in with Ethereum"}
                  </Button>
                )}
                <Button size="sm" onClick={addNetwork}>Switch to Mezo Testnet</Button>
                <Button size="sm" onClick={addMusd}>Add MUSD to wallet</Button>
                <a className="inline-flex h-8 items-center rounded-[6px] px-3 text-[13px] text-ink-2 hover:bg-raised" href={MEZO_TESTNET_FAUCET} target="_blank" rel="noreferrer">
                  Testnet faucet
                </a>
                <Button size="sm" variant="ghost" onClick={() => { disconnect(); onOpenChange(false); }}>
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const opps = useQuery({
    queryKey: ["opp-index"],
    queryFn: async () => (await (await fetch("/api/opportunities?index=1")).json()) as { items: { id: string; name: string; protocol: string }[]; lastCronSuccess: string | null },
    enabled: open,
    staleTime: 300_000,
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const itemCls = "flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-2 text-[13.5px] text-ink-2 data-[selected=true]:bg-raised data-[selected=true]:text-ink";
  const groupCls = "px-1 text-[11px] text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-8 items-center gap-2 rounded-[6px] border border-line px-2.5 text-[12.5px] text-faint hover:border-line-strong hover:text-ink-2" aria-label="Search pages and strategies">
        <Search size={13} aria-hidden /> <span className="hidden sm:inline">Search</span>
        <kbd className="figure hidden rounded-[3px] border border-line px-1 text-[10.5px] sm:inline">Ctrl K</kbd>
      </button>
      <Command.Dialog open={open} onOpenChange={setOpen} label="Search pages and strategies" overlayClassName="fixed inset-0 z-50 bg-black/60" className="panel fixed left-1/2 top-[16vh] z-50 w-[min(560px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden p-0">
        <Command.Input placeholder="Jump to a page or strategy…" className="h-12 w-full border-b border-line bg-transparent px-4 text-sm text-ink outline-none placeholder:text-faint" />
        <Command.List className="max-h-[360px] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted">No match.</Command.Empty>
          <Command.Group heading="Strategies" className={groupCls}>
            {(opps.data?.items ?? []).map((o) => (
              <Command.Item key={o.id} value={`${o.name} ${o.protocol}`} onSelect={() => go(`/opportunities/${o.id}`)} className={cn(itemCls, "justify-between")}>
                <span>{o.name}</span>
                <span className="text-[11.5px] text-faint">{o.protocol}</span>
              </Command.Item>
            ))}
          </Command.Group>
          {NAV.map((g) => (
            <Command.Group key={g.group} heading={g.group} className={groupCls}>
              {g.items.map((i) => (
                <Command.Item key={i.href} value={i.label} onSelect={() => go(i.href)} className={itemCls}>
                  <i.icon size={14} aria-hidden /> {i.label}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
    </>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-6">
      {NAV.map((g) => (
        <div key={g.group}>
          <p className="eyebrow mb-2 px-2">{g.group}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => {
              const active = path === i.href || path.startsWith(i.href + "/");
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-[13.5px] transition-colors",
                      active ? "bg-raised text-ink before:absolute before:inset-y-1.5 before:left-0 before:w-[2px] before:rounded-full before:bg-pos" : "text-muted hover:bg-raised/60 hover:text-ink",
                    )}
                  >
                    <i.icon size={15} aria-hidden className={active ? "text-pos" : undefined} /> {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawer = drawerPath === path;
  const setDrawer = (open: boolean) => setDrawerPath(open ? path : null);
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-raised focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col overflow-y-auto border-r border-line bg-sunk px-4 py-5 lg:flex">
        <Logo className="mb-8 px-2" />
        <SideNav />
        <div className="mt-auto border-t border-line px-2 pt-4 text-[11.5px] leading-relaxed text-faint">
          Analytics only. Estimates are not guarantees; YieldProof never holds your funds.
        </div>
      </aside>
      <div className="lg:pl-[236px]">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-ground px-4 md:px-6">
          <Dialog.Root open={drawer} onOpenChange={setDrawer}>
            <Dialog.Trigger asChild>
              <button type="button" className="rounded p-1.5 text-muted hover:text-ink lg:hidden" aria-label="Open navigation">
                <Menu size={18} />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 lg:hidden" />
              <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[272px] overflow-y-auto border-r border-line bg-sunk px-4 py-5 lg:hidden" aria-describedby={undefined}>
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <div className="mb-6 flex items-center justify-between">
                  <Logo />
                  <Dialog.Close className="p-1 text-muted hover:text-ink" aria-label="Close navigation">
                    <X size={18} />
                  </Dialog.Close>
                </div>
                <SideNav onNavigate={() => setDrawer(false)} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <Logo className="lg:hidden" wordmarkClassName="hidden min-[420px]:inline" />
          <NetworkStatus />
          <div className="ml-auto flex items-center gap-2">
            <CommandPalette />
            <NotificationBell />
            <WalletButton />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1240px] px-4 py-8 md:px-8 md:py-10">
          {children}
        </main>
        <footer className="no-print border-t border-line px-4 py-6 text-[12px] text-faint md:px-8">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3">
            <span>YieldProof is an analytics tool. Projections are estimates from visible assumptions, not guarantees or advice.</span>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/methodology" className="hover:text-ink-2">Methodology</Link>
              <Link href="/legal" className="hover:text-ink-2">Terms, privacy & risk</Link>
              <span className="inline-flex items-center gap-1"><Activity size={12} aria-hidden /> Live data cached 10 min; snapshots daily</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function PageHeader({ title, lede, right, eyebrow }: { title: string; lede?: ReactNode; right?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="font-display text-[32px] leading-[1.1] tracking-tight text-ink md:text-[40px]">{title}</h1>
        {lede ? <div className="mt-3 max-w-[70ch] text-[14.5px] leading-relaxed text-muted">{lede}</div> : null}
      </div>
      {right}
    </div>
  );
}
