import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { Panel } from "@/components/ui";

export const metadata: Metadata = { title: "Terms, privacy & risk" };

export default function LegalPage() {
  return (
    <>
      <PageHeader title="Terms, privacy & risk" lede="Plain-language terms for a buildathon project." />
      <div className="prose-yp space-y-5 text-[14px]">
        <Panel>
          <h2 className="font-display text-[22px]">Risk disclosure</h2>
          <p className="mt-2">YieldProof is an analytics and decision-support tool. Projections are estimates built from visible assumptions and backward-looking data; they are not guarantees, forecasts or financial advice. DeFi carries smart-contract, liquidity, oracle, de-peg, liquidation and incentive-token risks that can cause partial or total loss. Risk categories are product assessments, not ratings, and never imply safety.</p>
        </Panel>
        <Panel>
          <h2 className="font-display text-[22px]">Terms</h2>
          <p className="mt-2">YieldProof never holds your funds, never requests private keys or seed phrases, and never sends a transaction on your behalf. The only transactions it can prepare are optional Mezo testnet Stability Pool deposits and withdrawals of valueless test MUSD, which you review in a confirmation dialog and sign in your own wallet; nothing is ever sent on mainnet. The interactive demo uses fictional data. Use at your own risk; the software is provided as is.</p>
        </Panel>
        <Panel>
          <h2 className="font-display text-[22px]">Privacy</h2>
          <p className="mt-2">Without signing in, nothing about you is stored server-side; your default assumptions stay in your browser. If you sign in with Ethereum, YieldProof stores your wallet address, watchlist, saved comparisons, alert rules, notifications and settings, and a session cookie (HttpOnly). Exports and share links contain strategy ids and assumptions only. Aggregate page analytics are collected by Vercel Analytics without cookies.</p>
        </Panel>
      </div>
    </>
  );
}
