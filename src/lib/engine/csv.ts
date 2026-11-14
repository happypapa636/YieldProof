/**
 * RFC 4180 CSV writer with spreadsheet formula-injection protection.
 * Exports never include wallet addresses, signatures, sessions or keys —
 * only strategy analytics and their assumptions.
 */

export type CsvCell = string | number | null | undefined;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return "";
    return String(cell);
  }
  let s = String(cell);
  // Text that a spreadsheet would execute as a formula is neutralised with a leading apostrophe.
  // Plain numeric strings (e.g. "-12.50") are data, not formulas, and are left intact.
  if (FORMULA_PREFIX.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header.map(escapeCsvCell).join(",")];
  for (const r of rows) {
    if (r.length !== header.length) throw new Error(`CSV row has ${r.length} cells, expected ${header.length}`);
    lines.push(r.map(escapeCsvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** Columns required by the spec (§19). */
export const COMPARISON_CSV_HEADER = [
  "Strategy",
  "Protocol",
  "Network",
  "Data kind",
  "Initial capital (MUSD)",
  "Time horizon (days)",
  "Estimated base earnings (MUSD)",
  "Incentive earnings (MUSD)",
  "Estimated costs (MUSD)",
  "Estimated net result (MUSD)",
  "Estimated net return (%)",
  "Annualised net (simple %)",
  "Risk category",
  "Risk indicators",
  "Confidence",
  "Assumptions",
  "Data source",
  "Data timestamp (UTC)",
] as const;

export interface ComparisonCsvRow {
  strategy: string;
  protocol: string;
  network: string;
  dataKind: "live" | "demo";
  capital: string;
  days: number;
  baseEarnings: string | null;
  incentiveEarnings: string | null;
  costs: string;
  netResult: string | null;
  netReturnPct: string | null;
  annualizedPct: string | null;
  riskCategory: string;
  riskIndicators: string[];
  confidence: string;
  assumptions: string[];
  dataSource: string;
  dataTimestamp: string | null;
}

export function comparisonCsv(rows: ComparisonCsvRow[]): string {
  return toCsv(
    [...COMPARISON_CSV_HEADER],
    rows.map((r) => [
      r.dataKind === "demo" ? `${r.strategy} (FICTIONAL DEMO)` : r.strategy,
      r.protocol,
      r.network,
      r.dataKind === "demo" ? "DEMO — synthetic" : "LIVE",
      r.capital,
      r.days,
      r.baseEarnings ?? "Unavailable",
      r.incentiveEarnings ?? "Unavailable",
      r.costs,
      r.netResult ?? "Unavailable",
      r.netReturnPct ?? "Unavailable",
      r.annualizedPct ?? "Unavailable",
      r.riskCategory,
      r.riskIndicators.join("; "),
      r.confidence,
      r.assumptions.join("; "),
      r.dataSource,
      r.dataTimestamp ?? "Unavailable",
    ]),
  );
}
