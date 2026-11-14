"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, FlaskConical, Info } from "lucide-react";
import { Tooltip as RTooltip } from "radix-ui";
import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import type { Confidence, Metric } from "@/lib/engine/types";
import type { Freshness } from "@/lib/engine/confidence";
import type { RiskCategory } from "@/lib/engine/risk";
import { cn } from "@/lib/cn";
import { fmtAge, fmtDateTime, fmtNum, fmtPct, fmtUsdCompact } from "@/lib/format";
import { btnCls, type BtnVariant, signTone } from "@/lib/styles";

export { cn };

export type MetricFormat = "pct" | "pct-APR" | "pct-APY" | "usd" | "test-musd";

function applyFormat(kind: MetricFormat, v: number): string {
  switch (kind) {
    case "pct":
      return fmtPct(v);
    case "pct-APR":
      return `${fmtPct(v)} APR`;
    case "pct-APY":
      return `${fmtPct(v)} APY`;
    case "usd":
      return fmtUsdCompact(v);
    case "test-musd":
      return `${fmtNum(v, 0)} test MUSD`;
  }
}

export { btnCls, signTone };

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }>(
  function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }, ref) {
    return <button ref={ref} type={type} className={cn(btnCls(variant, size), className)} {...rest} />;
  },
);

export function Panel({ children, className, as: As = "section", id }: { children: ReactNode; className?: string; as?: "section" | "div" | "article"; id?: string }) {
  return (
    <As id={id} className={cn("panel p-5 md:p-6", className)}>
      {children}
    </As>
  );
}

export function H2({ children, sub, right, id }: { children: ReactNode; sub?: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-[22px] leading-tight text-ink">
          {children}
        </h2>
        {sub ? <p className="mt-1 max-w-[72ch] text-[13px] leading-relaxed text-muted">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <RTooltip.Provider delayDuration={150}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
        <RTooltip.Portal>
          <RTooltip.Content sideOffset={6} className="z-50 max-w-xs rounded-[6px] border border-line-strong bg-raised px-3 py-2 text-[12px] leading-relaxed text-ink-2">
            {content}
          </RTooltip.Content>
        </RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  );
}

const pill = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] leading-[18px]";

export function ConfidenceBadge({ label, reasons }: { label: Confidence; reasons?: string[] }) {
  const style = label === "Verified" ? "border-pos/45 text-pos" : label === "Partial" ? "border-dashed border-line-strong text-ink-2" : "border-dashed border-muted text-ink-2";
  const Icon = label === "Verified" ? CheckCircle2 : label === "Partial" ? CircleDashed : FlaskConical;
  const badge = (
    <span className={cn(pill, style)}>
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
  if (!reasons?.length) return badge;
  return (
    <Tip content={<ul className="list-disc pl-4">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}>
      <button type="button" className="rounded-full" aria-label={`Confidence ${label}: ${reasons.join(" ")}`}>
        {badge}
      </button>
    </Tip>
  );
}

const RISK_STEPS: Record<RiskCategory, number> = {
  "Lower modeled risk": 1,
  "Moderate modeled risk": 2,
  "Elevated modeled risk": 3,
  "High modeled risk": 4,
  "Insufficient data": 0,
};

/** Risk as a 4-step meter: intensity, not a rainbow. Only "High" is red. */
export function RiskBadge({ category, compact }: { category: RiskCategory; compact?: boolean }) {
  const steps = RISK_STEPS[category];
  const fill = steps === 4 ? "bg-neg" : steps === 1 ? "bg-pos" : "bg-ink-2";
  const text = steps === 4 ? "text-neg" : steps === 0 ? "text-faint italic" : "text-ink-2";
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap text-[12.5px]", text)} title={category}>
      <span className="inline-flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("w-[4px] rounded-[1px]", i < steps ? fill : "bg-line-strong", ["h-[6px]", "h-[8px]", "h-[10px]", "h-[12px]"][i])} />
        ))}
      </span>
      {compact ? category.replace(" modeled risk", "") : category}
    </span>
  );
}

export function FreshnessBadge({ freshness, at }: { freshness: Freshness; at: string | null }) {
  const color = freshness === "fresh" ? "bg-pos" : freshness === "aging" ? "bg-ink-2" : "bg-neg";
  return (
    <Tip content={`Last source update: ${fmtDateTime(at)} (${freshness}).`}>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-muted" tabIndex={0}>
        <span className={cn("h-1.5 w-1.5 rounded-full", color)} aria-hidden />
        {at ? fmtAge(at) : "no timestamp"}
        {freshness === "stale" || freshness === "unknown" ? <span className="text-neg">({freshness})</span> : null}
      </span>
    </Tip>
  );
}

/** Renders a metric value or an explicit "Unavailable"/"Not verified", never a fake zero. */
export function MetricText({ m, format, className }: { m: Metric<number>; format: MetricFormat; className?: string }) {
  if (m.value === null || m.status !== "ok") {
    const word = m.status === "not_verified" ? "Not verified" : "Unavailable";
    return (
      <Tip content={m.note ?? `${word}: no reliable source value.`}>
        <span tabIndex={0} className="cursor-help text-[12.5px] text-faint underline decoration-dotted underline-offset-[3px]">
          {word}
        </span>
      </Tip>
    );
  }
  return <span className={cn("figure", className)}>{applyFormat(format, m.value)}</span>;
}

export function SourceTag({ type }: { type: string }) {
  return <span className="rounded-[3px] border border-line-strong px-1 font-mono text-[10px] uppercase tracking-wide text-muted">{type}</span>;
}

export function SourceLine({ m, className }: { m: Metric<unknown>; className?: string }) {
  if (!m.source) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-faint", className)}>
      <SourceTag type={m.source.type} />
      {m.source.url ? (
        <a href={m.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-ink-2">
          {m.source.name}
          <ExternalLink size={10} aria-hidden />
        </a>
      ) : (
        <span>{m.source.name}</span>
      )}
      {m.observedAt ? <span>({fmtDateTime(m.observedAt)})</span> : null}
    </span>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warn" | "neg" | "pos" | "demo"; title?: string; children: ReactNode }) {
  const styles = {
    info: "border-line border-l-line-strong",
    warn: "border-line border-l-ink-2",
    neg: "border-neg/30 border-l-neg bg-neg-soft/50",
    pos: "border-pos/25 border-l-pos",
    demo: "border-dashed border-muted",
  }[tone];
  const Icon = tone === "neg" || tone === "warn" ? AlertTriangle : tone === "demo" ? FlaskConical : tone === "pos" ? CheckCircle2 : Info;
  const iconColor = tone === "neg" ? "text-neg" : tone === "pos" ? "text-pos" : "text-ink-2";
  return (
    <div className={cn("flex gap-3 rounded-[8px] border border-l-2 bg-sunk px-4 py-3 text-[13px] leading-relaxed text-ink-2", styles)} role={tone === "neg" ? "alert" : undefined}>
      <Icon size={16} className={cn("mt-0.5 shrink-0", iconColor)} aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-medium text-ink">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[6px] bg-raised", className)} aria-hidden />;
}

export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11.5px] leading-snug text-faint">{hint}</p> : null}
    </div>
  );
}

export const inputCls =
  "h-9 w-full rounded-[6px] border border-line-strong bg-sunk px-3 text-sm text-ink placeholder:text-faint focus:border-pos/70 focus:outline-none aria-[invalid=true]:border-neg/70";

export function Select({ value, onChange, options, id, ariaLabel, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; id?: string; ariaLabel?: string; className?: string }) {
  return (
    <select id={id} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, "cursor-pointer pr-8", className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Pressable chip used for toggles and segmented choices. */
export function Chip({ on, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[6px] border px-3 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        on ? "border-pos/60 bg-pos-soft text-pos" : "border-line-strong text-muted hover:border-muted hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A labelled figure: the basic unit of every stat row. */
export function Stat({ label, value, note, tone, size = "md" }: { label: ReactNode; value: ReactNode; note?: ReactNode; tone?: "pos" | "neg" | "muted"; size?: "sm" | "md" | "lg" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className={cn("figure mt-1 truncate", size === "lg" ? "text-[28px] leading-none" : size === "sm" ? "text-[16px]" : "text-[20px]", tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : tone === "muted" ? "text-faint" : "text-ink")}>{value}</dd>
      {note ? <dd className="mt-1 text-[11.5px] leading-snug text-faint">{note}</dd> : null}
    </div>
  );
}
