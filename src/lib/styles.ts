import { cn } from "./cn";

/** Pure class helpers, safe to call from Server and Client Components alike. */
export type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

export const btnCls = (variant: BtnVariant = "secondary", size: "sm" | "md" = "md") =>
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
    variant === "primary" && "bg-pos text-sunk hover:bg-[#52c49a]",
    variant === "secondary" && "border border-line-strong bg-raised text-ink hover:border-muted",
    variant === "ghost" && "text-ink-2 hover:bg-raised hover:text-ink",
    variant === "danger" && "border border-neg/50 text-neg hover:bg-neg-soft",
  );

export function signTone(v: number | null | undefined): "pos" | "neg" | "muted" {
  return v === null || v === undefined ? "muted" : v >= 0 ? "pos" : "neg";
}
