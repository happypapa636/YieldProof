/**
 * The whole visual system in one place: a neutral charcoal scale plus two signal
 * colours. Green means "what you keep" (positive results, verified data, primary
 * actions); red means "what you lose" (costs, negative results, high risk).
 * Everything else is neutral. Mirrors the @theme tokens in globals.css for code
 * that cannot read CSS variables (SVG charts, Recharts, OG images).
 */
export const PALETTE = {
  ground: "#0f1011",
  surface: "#151618",
  raised: "#1c1d20",
  sunk: "#0b0c0d",
  line: "#26282b",
  lineStrong: "#36383c",
  ink: "#ededea",
  ink2: "#c2c3c0",
  muted: "#9a9c9b",
  faint: "#7d7f81",
  pos: "#3fb68b",
  posSoft: "#132a20",
  neg: "#e5615a",
  negSoft: "#2c1615",
} as const;

/** Neutral series ramp for charts where identity (not sign) must be shown. */
export const SERIES_NEUTRAL = [PALETTE.ink, PALETTE.pos, PALETTE.muted, PALETTE.faint] as const;
