"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useSignMessage, WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/config/wagmi";

interface SessionCtx {
  address: string | null;
  loading: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  signingIn: boolean;
}

const SessionContext = createContext<SessionCtx | null>(null);

export function useSession(): SessionCtx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside provider");
  return ctx;
}

function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [signingIn, setSigningIn] = useState(false);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const r = await fetch("/api/auth/session", { cache: "no-store" });
      const j = (await r.json()) as { address: string | null };
      return j.address;
    },
    staleTime: 60_000,
  });

  const signIn = useCallback(async () => {
    if (!address) {
      toast.error("Connect a wallet first.");
      return false;
    }
    setSigningIn(true);
    try {
      const n = await fetch("/api/auth/nonce", { method: "POST" });
      if (!n.ok) throw new Error("Could not get a sign-in nonce.");
      const { nonce } = (await n.json()) as { nonce: string };
      const now = new Date();
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to YieldProof to save watchlists, comparisons and alerts. This does not send a transaction or cost gas.",
        uri: window.location.origin,
        version: "1",
        chainId: chainId === 31612 ? 31612 : 31611,
        nonce,
        issuedAt: now,
        expirationTime: new Date(now.getTime() + 10 * 60_000),
      });
      const signature = await signMessageAsync({ message });
      const v = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, signature }) });
      const body = (await v.json()) as { address?: string; error?: string };
      if (!v.ok) throw new Error(body.error ?? "Sign-in failed.");
      await qc.invalidateQueries({ queryKey: ["session"] });
      toast.success("Signed in. Your watchlist and comparisons are now saved to your wallet.");
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed.";
      toast.error(/rejected|denied/i.test(msg) ? "Signature request was rejected." : msg);
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [address, chainId, signMessageAsync, qc]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await qc.invalidateQueries();
    toast("Signed out.");
  }, [qc]);

  const value = useMemo<SessionCtx>(
    () => ({ address: session.data ?? null, loading: session.isLoading, signIn, signOut, signingIn }),
    [session.data, session.isLoading, signIn, signOut, signingIn],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } }));
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <SessionProvider>{children}</SessionProvider>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{ style: { background: "#1c1d20", border: "1px solid #36383c", color: "#ededea", fontFamily: "var(--font-sans)", borderRadius: 8 } }}
        />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
