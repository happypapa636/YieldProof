import { fmtMusd } from "@/lib/format";
import { signTone } from "@/lib/styles";
import type { Projection } from "./projection";
import type { Opportunity } from "./types";

/** A bar in the advertised → net waterfall. Signed MUSD. */
export interface WaterfallStep {
  label: string;
  value: number;
  kind: "advertised" | "gain" | "cost" | "net";
  unavailable?: boolean;
}

export const COST_PARTS = (p: Projection): [string, number][] => [
  ["Transactions", p.transactionCosts.toNumber()],
  ["Slippage", p.slippageCosts.toNumber()],
  ["Protocol fees", p.feeCosts.toNumber()],
  ["Borrowing", p.borrowingCosts.toNumber()],
  ["Impermanent loss", p.ilCost.toNumber()],
  ["Reinvesting", p.reinvestCosts.toNumber()],
];

export function waterfallSteps(opp: Opportunity, p: Projection): WaterfallStep[] {
  const t = p.days / 365;
  const steps: WaterfallStep[] = [];
  if (opp.advertised.value !== null) {
    steps.push({ label: "Advertised", value: p.capital.toNumber() * opp.advertised.value * t, kind: "advertised" });
  }
  steps.push({ label: "Base yield", value: p.baseEarnings?.toNumber() ?? 0, kind: "gain", unavailable: p.baseEarnings === null });
  steps.push({ label: "Incentives", value: p.incentiveEarnings?.toNumber() ?? 0, kind: "gain", unavailable: p.incentiveEarnings === null });
  for (const [label, v] of COST_PARTS(p)) if (v > 0.000001) steps.push({ label, value: -v, kind: "cost" });
  steps.push({ label: "Estimated net", value: p.netProfit?.toNumber() ?? 0, kind: "net", unavailable: p.netProfit === null });
  return steps;
}

/** Plain-language summary: what the headline implies, what you might keep, and the biggest reason they differ. */
export function verdictFor(opp: Opportunity, p: Projection): { headline: string; detail: string | null; tone: "pos" | "neg" | "muted" } {
  const net = p.netProfit?.toNumber() ?? null;
  const cap = fmtMusd(p.capital.toNumber(), 0);
  const horizon = p.days === 365 ? "one year" : `${p.days} days`;
  if (net === null) {
    return { headline: `Not enough verified data to estimate what ${cap} MUSD would earn here.`, detail: "YieldProof shows no number rather than a guessed one.", tone: "muted" };
  }
  const keep = net >= 0 ? `you might keep about ${fmtMusd(net, 0)} MUSD` : `you would lose about ${fmtMusd(-net, 0)} MUSD`;
  const adv = opp.advertised.value !== null ? p.capital.toNumber() * opp.advertised.value * (p.days / 365) : null;
  const headline = `On ${cap} MUSD over ${horizon}, ${keep}${adv !== null ? `, against ${fmtMusd(adv, 0)} implied by the advertised rate` : ""}.`;

  const drags: [string, number][] = COST_PARTS(p).filter(([, v]) => v > 0.005);
  const inc = p.incentiveEarnings?.toNumber() ?? 0;
  const gross = p.grossEarnings?.toNumber() ?? 0;
  const top = drags.sort((x, y) => y[1] - x[1])[0];
  const parts: string[] = [];
  if (top && top[1] > Math.max(1, gross * 0.05)) parts.push(`The biggest cost is ${top[0].toLowerCase()} (${fmtMusd(top[1], 0)} MUSD).`);
  if (gross > 0 && inc / gross >= 0.5) parts.push(`${Math.round((inc / gross) * 100)}% of the earnings are paid in an incentive token whose price can fall.`);
  if (opp.economics.lockDays && opp.economics.lockDays > 0) parts.push(`Funds can be locked for up to ${opp.economics.lockDays} days.`);
  if (p.status === "partial") parts.push("Some components are unverified and excluded, so this is a partial estimate.");
  return { headline, detail: parts.join(" ") || null, tone: signTone(net) };
}


/**
 * Where each waterfall bar starts and ends. Advertised and net are anchored at
 * zero; gains and costs float from the running total; unavailable steps are
 * zero-width at the running total and do not move it. Each range carries its own
 * step, so a label can never be attached to the wrong bar.
 */
export function waterfallRanges(steps: WaterfallStep[]): (WaterfallStep & { from: number; to: number })[] {
  let running = 0;
  return steps.map((s) => {
    if (s.unavailable) return { ...s, from: running, to: running };
    if (s.kind === "advertised" || s.kind === "net") return { ...s, from: 0, to: s.value };
    const from = running;
    running += s.value;
    return { ...s, from, to: running };
  });
}
