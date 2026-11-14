import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { Panel } from "@/components/ui";

export const metadata: Metadata = { title: "Methodology" };

const F = ({ children }: { children: React.ReactNode }) => <pre className="figure my-3 overflow-x-auto rounded-[8px] border border-line bg-sunk px-4 py-3 text-[12.5px] leading-relaxed text-ink">{children}</pre>;

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Net return",
    body: (
      <>
        <F>{`Net Profit = Gross Base Yield + Realised Incentive Value − Estimated Costs
Costs      = entry tx + exit tx + deposit fee + entry slippage + exit slippage
           + withdrawal fee + performance fee + borrow interest + borrow fee
           + reinvestment fees + modeled impermanent loss
Net Return = Net Profit / Initial Capital
Annualised (simple) = Net Return × 365 / days`}</F>
        <p>Fees flagged as already included in the quoted rate are listed in the assumption ledger and not subtracted again. A rate that is unavailable is excluded and the result is marked partial; it is never counted as zero. When costs exceed earnings the loss is shown.</p>
      </>
    ),
  },
  {
    title: "APR and APY",
    body: (
      <>
        <F>{`APY = (1 + APR / n)^n − 1        APR = n · ((1 + APY)^(1/n) − 1)`}</F>
        <p>DefiLlama reports APY. Before projecting, YieldProof converts every quote to a simple APR assuming daily compounding (n = 365), then applies your compounding choice. This prevents an APY from being treated as an APR (which would overstate a non-compounded return).</p>
      </>
    ),
  },
  {
    title: "Compounding",
    body: (
      <>
        <F>{`per period: earned = balance × APR / periods_per_year
reinvest only if earned > reinvestment cost (claim + swap + redeposit gas)
remainder days accrue simply on the final balance`}</F>
        <p>Compounding is applied only where the strategy can realistically reinvest (vault yield distributed weekly, locks and leverage loops cannot). Otherwise the projection falls back to simple accrual with a warning.</p>
      </>
    ),
  },
  {
    title: "Incentives and scenarios",
    body: <p>Incentive value = incentive APR × price factor (1, 0.75, 0.5, 0). Rate-change scenarios multiply the base APR by (1 + change) for the whole horizon. Both are hypothetical sensitivity tests, not forecasts.</p>,
  },
  {
    title: "Costs from live chain data",
    body: (
      <>
        <F>{`gas cost (MUSD) = modeled gas units × live Mezo gas price × Mezo oracle BTC price
LP entry slippage = half the capital swapped through the pool (exact on-chain getAmountOut)
LP exit slippage  = burn pro-rata, swap the other leg through the post-burn reserves`}</F>
        <p>Gas units per action are documented assumptions (e.g. 250k for approve + vault deposit, 850k to open a trove and deposit). Slippage uses YieldProof&apos;s wei-exact port of Pool.getAmountOut, verified in tests against live Mezo mainnet quotes.</p>
      </>
    ),
  },
  {
    title: "AMM pricing (Mezo Pools)",
    body: (
      <>
        <F>{`fee:      amountIn' = amountIn − amountIn × fee / 10,000   (volatile 30 = 0.30%, stable 2 = 0.02%)
volatile: x · y = k       → out = amountIn' · reserveOut / (reserveIn + amountIn')
stable:   x³y + xy³ = k   → out solved by Newton's method on reserves normalised to 1e18
impermanent loss (50/50 x·y=k): IL = 2√r / (1 + r) − 1,  r = P_end / P_start`}</F>
      </>
    ),
  },
  {
    title: "Realised yields from chain state",
    body: (
      <>
        <F>{`sMUSD:  APR = (yieldIndex_now − yieldIndex_then) / 1e18 × 31,536,000 / seconds
Gauge:  APR = rewardRate (MEZO/s) × 31,536,000 × MEZO price / (staked sMUSD × MUSD price)
Pools:  APR = Σ Fees events over 7 days (BTC at oracle, stables at $1) / pool TVL × 365 / days`}</F>
        <p>These independently recompute DefiLlama&apos;s figures; agreement within tolerance earns the Verified label.</p>
      </>
    ),
  },
  {
    title: "MUSD leverage",
    body: (
      <>
        <F>{`net debt       = borrowed × (1 + issuance fee)
recorded debt  = net debt + 200 MUSD gas compensation (escrowed, refunded on close)
ICR            = collateral × BTC price / recorded debt
health factor  = ICR / MCR (110%)          liquidatable when < 1
liquidation px = recorded debt × MCR / collateral
interest       = recorded debt × APR × days / 365   (simple, fixed at open)
leverage       = (collateral value + deployed MUSD) / (that − net debt)
break-even APR = (interest + fee + tx + B·s) / (B · t · (1 − s))`}</F>
        <p>Stress grid: BTC −10% to −50%, strategy yield −25% to −100%, borrow APR +1 to +4 points, exit slippage 1% to 5%. Recovery Mode (TCR below 150%) is flagged.</p>
      </>
    ),
  },
  {
    title: "Risk model",
    body: <p>Components: contract maturity and audits, dependencies, liquidity depth, withdrawal restrictions, yield volatility (30-day σ of DefiLlama daily APY), incentive dependence, holder concentration, liquidation, leverage, data quality, incidents. Overall = most severe known component; “Insufficient data” when fewer than 4 of 6 core components have evidence; unaudited or unknown-audit protocols are never rated below Elevated; nothing is ever called safe.</p>,
  },
  {
    title: "Confidence and freshness",
    body: <p>Verified: read from Mezo contracts, or an API value independently reproduced on-chain within tolerance, with no critical field missing and fresh data. Partial: API-only, missing fields, stale (older than 30 hours) or sources disagree. Demo: synthetic. Summary statistics need at least three comparable values.</p>,
  },
  {
    title: "History",
    body: <p>Only real observations: DefiLlama&apos;s archived daily series plus YieldProof&apos;s own daily snapshots (one row per metric per UTC day). Sample counts, coverage and gaps are shown; nothing is interpolated.</p>,
  },
];

export default function MethodologyPage() {
  return (
    <>
      <PageHeader title="Methodology" lede="Every number in YieldProof is reproducible from the formulas below and the assumptions shown next to it. The engine is plain TypeScript using 40-digit decimal arithmetic and bigint token amounts, covered by unit tests with hand-verified examples." />
      <div className="space-y-5">
        {SECTIONS.map((s) => (
          <Panel key={s.title}>
            <h2 className="font-display text-[22px]">{s.title}</h2>
            <div className="prose-yp mt-2 text-[14px]">{s.body}</div>
          </Panel>
        ))}
      </div>
    </>
  );
}
