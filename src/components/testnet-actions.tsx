"use client";

import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, Loader2 } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BaseError, ContractFunctionRevertedError, formatUnits, parseUnits, UserRejectedRequestError } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { explorerAddress, explorerTx, MEZO_TESTNET_FAUCET, mezoTestnet } from "@/config/chains";
import { erc20Abi, GAS_FLOORS, priceFeedAbi, sortedTrovesAbi, stabilityPoolAbi, TESTNET, troveManagerAbi } from "@/config/contracts";
import { fmtAge, fmtNum, shortAddr } from "@/lib/format";
import { NumInput } from "./projection";
import { WalletButton } from "./shell";
import { Button, Callout, Chip, cn, Field, H2, Panel, Stat } from "./ui";

type Mode = "deposit" | "withdraw";
interface TxRecord {
  hash: `0x${string}`;
  label: string;
  at: string;
  status: "pending" | "success" | "reverted";
}

const TX_KEY = (addr: string) => `yp-testnet-txs-v1:${addr.toLowerCase()}`;

function loadTxs(addr: string): TxRecord[] {
  try {
    return JSON.parse(window.localStorage.getItem(TX_KEY(addr)) ?? "[]") as TxRecord[];
  } catch {
    return [];
  }
}
function saveTxs(addr: string, txs: TxRecord[]) {
  try {
    window.localStorage.setItem(TX_KEY(addr), JSON.stringify(txs.slice(0, 20)));
  } catch {
    /* storage unavailable: history is a convenience only */
  }
}

/** Human message for a failed simulation or transaction. Never shows a raw stack. */
function explain(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "You rejected the request in your wallet. Nothing was sent.";
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return `The contract refused: ${revert.reason ?? revert.shortMessage}`;
    return e.shortMessage;
  }
  return e instanceof Error ? e.message.split("\n")[0]! : "Transaction failed.";
}

/**
 * Practise with the real MUSD Stability Pool on Mezo TESTNET: deposit or withdraw
 * test MUSD. Every write is simulated first, summarised in a confirmation dialog,
 * and only then sent to the user's wallet for signature. Test MUSD has no value.
 */
export function StabilityPoolPanel() {
  const { address, isConnected, chainId } = useAccount();
  const client = usePublicClient({ chainId: mezoTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState<number | null>(10);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [txs, setTxs] = useState<TxRecord[]>([]);
  const [txOwner, setTxOwner] = useState<string | null>(null);
  if (address && txOwner !== address) {
    // Load this wallet's local tx history when the connected address changes.
    setTxOwner(address);
    setTxs(typeof window === "undefined" ? [] : loadTxs(address));
  }

  const state = useQuery({
    queryKey: ["sp-state", address],
    enabled: !!address && !!client,
    refetchInterval: 30_000,
    queryFn: async () => {
      const c = client!;
      const a = address!;
      const r = await c.multicall({
        allowFailure: true,
        contracts: [
          { address: TESTNET.MUSD, abi: erc20Abi, functionName: "balanceOf", args: [a] },
          { address: TESTNET.MUSD, abi: erc20Abi, functionName: "allowance", args: [a, TESTNET.StabilityPool] },
          { address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "getCompoundedMUSDDeposit", args: [a] },
          { address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "getDepositorCollateralGain", args: [a] },
          { address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "getTotalMUSDDeposits" },
          { address: TESTNET.PriceFeed, abi: priceFeedAbi, functionName: "fetchPrice" },
          { address: TESTNET.SortedTroves, abi: sortedTrovesAbi, functionName: "getLast" },
        ],
      });
      const big = (i: number) => (r[i]?.status === "success" ? (r[i]!.result as bigint) : null);
      const btc = await c.getBalance({ address: a }).catch(() => null);
      let lowestIcr: bigint | null = null;
      const price = big(5);
      const last = r[6]?.status === "success" ? (r[6].result as `0x${string}`) : null;
      if (price && last && last !== "0x0000000000000000000000000000000000000000") {
        lowestIcr = await c.readContract({ address: TESTNET.TroveManager, abi: troveManagerAbi, functionName: "getCurrentICR", args: [last, price] }).catch(() => null);
      }
      return { musd: big(0), allowance: big(1), deposit: big(2), gainBtc: big(3), total: big(4), btc, lowestIcr };
    },
  });

  const s = state.data;
  const wei = amount !== null && amount > 0 ? parseUnits(String(amount), 18) : 0n;
  const withdrawBlocked = s?.lowestIcr !== null && s?.lowestIcr !== undefined && s.lowestIcr < parseUnits("1.1", 18);
  const max = mode === "deposit" ? s?.musd ?? 0n : s?.deposit ?? 0n;
  const tooMuch = wei > max;
  const needsApproval = mode === "deposit" && (s?.allowance ?? 0n) < wei;
  const noGas = s?.btc !== null && s?.btc !== undefined && s.btc === 0n;
  const disabledReason = !s
    ? "Reading your testnet balances…"
    : wei === 0n
      ? "Enter an amount."
      : tooMuch
        ? mode === "deposit"
          ? "More than your test MUSD balance."
          : "More than your Stability Pool deposit."
        : noGas
          ? "You need testnet BTC for gas."
          : mode === "withdraw" && withdrawBlocked
            ? "Withdrawals are blocked by the protocol right now."
            : null;

  const record = (rec: TxRecord) => {
    if (!address) return;
    setTxs((prev) => {
      const next = [rec, ...prev.filter((t) => t.hash !== rec.hash)];
      saveTxs(address, next);
      return next;
    });
  };

  const gasFor = async (est: () => Promise<bigint>, floor: bigint) => {
    try {
      const e = await est();
      const padded = (e * 13n) / 10n;
      return padded > floor ? padded : floor;
    } catch {
      return floor;
    }
  };

  const send = async (label: string, run: () => Promise<`0x${string}`>) => {
    setBusy(label);
    const hash = await run();
    record({ hash, label, at: new Date().toISOString(), status: "pending" });
    toast(`${label} sent. Waiting for Mezo testnet…`);
    const receipt = await client!.waitForTransactionReceipt({ hash });
    const ok = receipt.status === "success";
    record({ hash, label, at: new Date().toISOString(), status: ok ? "success" : "reverted" });
    if (!ok) throw new Error(`${label} reverted on-chain.`);
    return hash;
  };

  const execute = async () => {
    if (!address || !client) return;
    setConfirm(false);
    try {
      if (chainId !== mezoTestnet.id) await switchChainAsync({ chainId: mezoTestnet.id });
      if (mode === "deposit") {
        if (needsApproval) {
          const gas = await gasFor(() => client.estimateContractGas({ account: address, address: TESTNET.MUSD, abi: erc20Abi, functionName: "approve", args: [TESTNET.StabilityPool, wei] }), GAS_FLOORS.erc20);
          await send("Approve MUSD", () => writeContractAsync({ chainId: mezoTestnet.id, address: TESTNET.MUSD, abi: erc20Abi, functionName: "approve", args: [TESTNET.StabilityPool, wei], gas }));
        }
        await client.simulateContract({ account: address, address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "provideToSP", args: [wei] });
        const gas = await gasFor(() => client.estimateContractGas({ account: address, address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "provideToSP", args: [wei] }), GAS_FLOORS.stabilityPool);
        await send(`Deposit ${fmtNum(amount, 2)} MUSD`, () => writeContractAsync({ chainId: mezoTestnet.id, address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "provideToSP", args: [wei], gas }));
      } else {
        await client.simulateContract({ account: address, address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "withdrawFromSP", args: [wei] });
        const gas = await gasFor(() => client.estimateContractGas({ account: address, address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "withdrawFromSP", args: [wei] }), GAS_FLOORS.stabilityPool);
        await send(`Withdraw ${fmtNum(amount, 2)} MUSD`, () => writeContractAsync({ chainId: mezoTestnet.id, address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "withdrawFromSP", args: [wei], gas }));
      }
      toast.success(mode === "deposit" ? "Deposited into the testnet Stability Pool." : "Withdrawn from the testnet Stability Pool.");
    } catch (e) {
      toast.error(explain(e));
    } finally {
      setBusy(null);
      await Promise.all([qc.invalidateQueries({ queryKey: ["sp-state"] }), qc.invalidateQueries({ queryKey: ["portfolio"] })]);
    }
  };

  const fmt = (v: bigint | null | undefined, dp = 2) => (v === null || v === undefined ? "Unavailable" : fmtNum(Number(formatUnits(v, 18)), dp));

  return (
    <Panel id="practise">
      <H2 sub="Real MUSD contracts on Mezo testnet. Test MUSD has no value; this is for learning how the Stability Pool behaves before using mainnet.">
        Practise: MUSD Stability Pool (testnet)
      </H2>
      {!isConnected || !address ? (
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
          <WalletButton />
          <span>Connect a wallet to deposit or withdraw test MUSD. Reading and comparing never needs one.</span>
        </div>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Stat size="sm" label="Your test MUSD" value={fmt(s?.musd)} />
            <Stat size="sm" label="Your pool deposit" value={fmt(s?.deposit)} />
            <Stat size="sm" label="BTC gains to claim" value={fmt(s?.gainBtc, 6)} note="Paid out on your next withdrawal" />
            <Stat size="sm" label="Testnet BTC (gas)" value={s?.btc === null || s?.btc === undefined ? "Unavailable" : fmtNum(Number(formatUnits(s.btc, 18)), 6)} />
          </dl>

          {noGas || (s && (s.musd ?? 0n) === 0n && (s.deposit ?? 0n) === 0n) ? (
            <Callout tone="info" title="Getting test funds">
              Testnet BTC for gas comes from the <a className="text-pos underline-offset-2 hover:underline" href={MEZO_TESTNET_FAUCET} target="_blank" rel="noreferrer">Mezo faucet</a>. Test MUSD is minted by borrowing against testnet BTC in the Mezo app; YieldProof itself never opens loans.
            </Callout>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,240px)_auto] sm:items-end">
            <div className="flex gap-1.5" role="group" aria-label="Action">
              <Chip on={mode === "deposit"} onClick={() => setMode("deposit")} className="h-9">
                <ArrowDownToLine size={13} aria-hidden /> Deposit
              </Chip>
              <Chip on={mode === "withdraw"} onClick={() => setMode("withdraw")} className="h-9">
                <ArrowUpFromLine size={13} aria-hidden /> Withdraw
              </Chip>
            </div>
            <Field label="Amount" htmlFor="sp-amount">
              <NumInput id="sp-amount" value={amount} min={0} max={1e12} onChange={setAmount} suffix="MUSD" />
            </Field>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setAmount(Math.floor(Number(formatUnits(max, 18)) * 100) / 100)} disabled={!s || max === 0n}>
                Max
              </Button>
              <Button variant="primary" onClick={() => setConfirm(true)} disabled={!!disabledReason || !!busy}>
                {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                {busy ?? "Review"}
              </Button>
            </div>
          </div>
          {disabledReason && s ? <p className="text-[12.5px] text-muted">{disabledReason}</p> : null}
          {mode === "withdraw" && withdrawBlocked ? (
            <Callout tone="warn" title="The protocol is blocking withdrawals">
              Stability Pool withdrawals revert while any trove is below the 110% minimum collateral ratio. The lowest testnet trove is at {fmtNum(Number(formatUnits(s!.lowestIcr!, 18)) * 100, 1)}%. Your deposit is safe and withdrawable once that trove is liquidated or repaired.
            </Callout>
          ) : null}

          {txs.length ? (
            <div>
              <p className="mb-2 text-[12.5px] text-ink-2">Your testnet transactions (this browser)</p>
              <ul className="divide-y divide-line rounded-[8px] border border-line text-[12.5px]">
                {txs.slice(0, 6).map((t) => (
                  <li key={t.hash} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className={cn("h-1.5 w-1.5 rounded-full", t.status === "success" ? "bg-pos" : t.status === "reverted" ? "bg-neg" : "bg-muted")} aria-hidden />
                      <span className="text-ink-2">{t.label}</span>
                      <span className="text-faint">{t.status === "pending" ? "pending" : t.status === "reverted" ? "reverted" : "confirmed"} · {fmtAge(t.at)}</span>
                    </span>
                    <a className="figure inline-flex items-center gap-1 text-pos hover:underline" href={explorerTx(mezoTestnet.id, t.hash)} target="_blank" rel="noreferrer">
                      {shortAddr(t.hash)} <ExternalLink size={11} aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-[11.5px] leading-relaxed text-faint">
            Contracts: <a className="underline-offset-2 hover:underline" href={explorerAddress(mezoTestnet.id, TESTNET.StabilityPool)} target="_blank" rel="noreferrer">StabilityPool {shortAddr(TESTNET.StabilityPool)}</a>, <a className="underline-offset-2 hover:underline" href={explorerAddress(mezoTestnet.id, TESTNET.MUSD)} target="_blank" rel="noreferrer">MUSD {shortAddr(TESTNET.MUSD)}</a>. Pool total {fmt(s?.total, 0)} test MUSD. Each action is simulated before your wallet is asked to sign; gas is the estimate plus 30% with a protocol-specific floor.
          </p>
        </div>
      )}

      <Dialog.Root open={confirm} onOpenChange={setConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
          <Dialog.Content className="panel fixed left-1/2 top-1/2 z-50 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 p-6">
            <Dialog.Title className="font-display text-xl">Confirm testnet {mode}</Dialog.Title>
            <Dialog.Description className="mt-1 text-[13px] leading-relaxed text-muted">Your wallet will ask you to sign {mode === "deposit" && needsApproval ? "two transactions" : "one transaction"} on Mezo Testnet. Nothing is sent on mainnet.</Dialog.Description>
            <dl className="mt-5 space-y-2 text-[13px]">
              <div className="flex justify-between gap-4"><dt className="text-muted">Network</dt><dd className="text-ink">Mezo Testnet (31611)</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Amount</dt><dd className="figure text-ink">{fmtNum(amount, 2)} test MUSD</dd></div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Steps</dt>
                <dd className="text-right text-ink">{mode === "deposit" ? (needsApproval ? "1. approve MUSD · 2. provideToSP" : "provideToSP") : "withdrawFromSP (also pays out BTC gains)"}</dd>
              </div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Contract</dt><dd className="figure text-ink">{shortAddr(TESTNET.StabilityPool)}</dd></div>
            </dl>
            {mode === "deposit" ? (
              <p className="mt-4 text-[12px] leading-relaxed text-faint">While deposited, your MUSD absorbs liquidated troves&apos; debt in exchange for their BTC collateral, so the MUSD balance can shrink while BTC gains grow.</p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="ghost">Cancel</Button>
              </Dialog.Close>
              <Button variant="primary" onClick={execute}>
                Sign in wallet
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Panel>
  );
}
