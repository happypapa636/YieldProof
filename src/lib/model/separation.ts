import type { Opportunity } from "./types";

/**
 * Demo vs live separation. Live analytics must never contain synthetic rows;
 * demo views must never contain live rows presented as fictional (or vice
 * versa). Every boundary that assembles a dataset goes through these guards.
 */

export class DataSeparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataSeparationError";
  }
}

export function assertLiveOnly(opps: Opportunity[]): Opportunity[] {
  const bad = opps.filter((o) => o.dataKind !== "live" || o.network === "Fictional" || o.confidence.label === "Demo");
  if (bad.length > 0) throw new DataSeparationError(`Demo data found in a live dataset: ${bad.map((b) => b.id).join(", ")}`);
  return opps;
}

export function assertDemoOnly(opps: Opportunity[]): Opportunity[] {
  const bad = opps.filter((o) => o.dataKind !== "demo" || o.network !== "Fictional" || o.confidence.label !== "Demo");
  if (bad.length > 0) throw new DataSeparationError(`Live data found in the demo dataset: ${bad.map((b) => b.id).join(", ")}`);
  return opps;
}

/** Demo ids are namespaced so a shared link can never resolve a demo id to live data or back. */
export function isDemoId(id: string): boolean {
  return id.startsWith("demo-");
}
