/** Display formatting. `null` always renders as an explicit word, never 0. */

export function fmtPct(v: number | null | undefined, dp = 2, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "Unavailable";
  const s = (v * 100).toFixed(dp);
  return `${signed && v > 0 ? "+" : ""}${s}%`;
}

export function fmtNum(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "Unavailable";
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtMusd(v: number | null | undefined, dp = 2, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "Unavailable";
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  return `${sign}${s}`;
}

export function fmtUsdCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "Unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: v >= 1e6 ? 2 : 1 }).format(v);
}

export function fmtCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "Unavailable";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
}

export function fmtAge(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "unknown time";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "unknown time";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function shortAddr(a: string | null | undefined): string {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
