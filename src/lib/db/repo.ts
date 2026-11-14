import { sql } from "./client";
import type { ComparisonParams } from "@/lib/model/comparison";
import type { AlertKind } from "@/lib/model/alerts";

/** All queries are parameterised and scoped by the authenticated address. */

export interface WatchItem {
  id: number;
  opportunity_id: string;
  note: string | null;
  created_at: string;
}

export async function listWatchlist(address: string): Promise<WatchItem[]> {
  return (await sql()`SELECT id, opportunity_id, note, created_at FROM yieldproof.watchlist WHERE address = ${address} ORDER BY created_at DESC`) as WatchItem[];
}

export async function addWatch(address: string, opportunityId: string, note: string | null): Promise<WatchItem> {
  const rows = (await sql()`
    INSERT INTO yieldproof.watchlist (address, opportunity_id, note) VALUES (${address}, ${opportunityId}, ${note})
    ON CONFLICT (address, opportunity_id) DO UPDATE SET note = COALESCE(EXCLUDED.note, yieldproof.watchlist.note)
    RETURNING id, opportunity_id, note, created_at`) as WatchItem[];
  return rows[0]!;
}

export async function removeWatch(address: string, opportunityId: string): Promise<boolean> {
  const rows = (await sql()`DELETE FROM yieldproof.watchlist WHERE address = ${address} AND opportunity_id = ${opportunityId} RETURNING id`) as unknown[];
  return rows.length > 0;
}

export interface SavedComparison {
  id: string;
  name: string;
  params: ComparisonParams;
  created_at: string;
  updated_at: string;
}

export async function listComparisons(address: string): Promise<SavedComparison[]> {
  return (await sql()`SELECT id, name, params, created_at, updated_at FROM yieldproof.saved_comparisons WHERE address = ${address} ORDER BY created_at DESC LIMIT 100`) as SavedComparison[];
}

export async function countComparisons(address: string): Promise<number> {
  const rows = (await sql()`SELECT count(*)::int AS n FROM yieldproof.saved_comparisons WHERE address = ${address}`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export async function saveComparison(address: string, name: string, params: ComparisonParams): Promise<SavedComparison> {
  const rows = (await sql()`
    INSERT INTO yieldproof.saved_comparisons (address, name, params) VALUES (${address}, ${name}, ${JSON.stringify(params)}::jsonb)
    RETURNING id, name, params, created_at, updated_at`) as SavedComparison[];
  return rows[0]!;
}

export async function deleteComparison(address: string, id: string): Promise<boolean> {
  const rows = (await sql()`DELETE FROM yieldproof.saved_comparisons WHERE id = ${id}::uuid AND address = ${address} RETURNING id`) as unknown[];
  return rows.length > 0;
}

export async function getSettings(address: string): Promise<Record<string, unknown> | null> {
  const rows = (await sql()`SELECT settings FROM yieldproof.user_settings WHERE address = ${address}`) as { settings: Record<string, unknown> }[];
  return rows[0]?.settings ?? null;
}

export async function putSettings(address: string, settings: Record<string, unknown>): Promise<void> {
  await sql()`INSERT INTO yieldproof.user_settings (address, settings) VALUES (${address}, ${JSON.stringify(settings)}::jsonb)
              ON CONFLICT (address) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()`;
}

export interface AlertRow {
  id: number;
  address: string;
  opportunity_id: string;
  kind: AlertKind;
  threshold: string | null;
  enabled: boolean;
  state: "unknown" | "ok" | "triggered" | "unavailable";
  last_value: string | null;
  last_checked_at: string | null;
  last_triggered_at: string | null;
  baseline: Record<string, unknown> | null;
  created_at: string;
}

export async function listAlerts(address: string): Promise<AlertRow[]> {
  return (await sql()`SELECT * FROM yieldproof.alerts WHERE address = ${address} ORDER BY created_at DESC`) as AlertRow[];
}

export async function listAllEnabledAlerts(): Promise<AlertRow[]> {
  return (await sql()`SELECT * FROM yieldproof.alerts WHERE enabled = true ORDER BY address`) as AlertRow[];
}

export async function upsertAlert(address: string, opportunityId: string, kind: AlertKind, threshold: number | null, baseline: Record<string, unknown> | null): Promise<AlertRow> {
  const rows = (await sql()`
    INSERT INTO yieldproof.alerts (address, opportunity_id, kind, threshold, baseline)
    VALUES (${address}, ${opportunityId}, ${kind}, ${threshold}, ${baseline ? JSON.stringify(baseline) : null}::jsonb)
    ON CONFLICT (address, opportunity_id, kind) DO UPDATE SET threshold = EXCLUDED.threshold, enabled = true,
      baseline = COALESCE(yieldproof.alerts.baseline, EXCLUDED.baseline)
    RETURNING *`) as AlertRow[];
  return rows[0]!;
}

export async function deleteAlert(address: string, id: number): Promise<boolean> {
  const rows = (await sql()`DELETE FROM yieldproof.alerts WHERE id = ${id} AND address = ${address} RETURNING id`) as unknown[];
  return rows.length > 0;
}

export async function recordAlertResult(alert: AlertRow, state: "ok" | "triggered" | "unavailable", value: number | null, message: string): Promise<boolean> {
  const transitioned = state === "triggered" && alert.state !== "triggered";
  await sql()`UPDATE yieldproof.alerts SET state = ${state}, last_value = ${value}, last_checked_at = now(),
              last_triggered_at = CASE WHEN ${transitioned} THEN now() ELSE last_triggered_at END
              WHERE id = ${alert.id}`;
  if (transitioned) {
    await sql()`INSERT INTO yieldproof.notifications (address, alert_id, opportunity_id, message)
                VALUES (${alert.address}, ${alert.id}, ${alert.opportunity_id}, ${message})`;
  }
  return transitioned;
}

export interface NotificationRow {
  id: number;
  opportunity_id: string | null;
  message: string;
  created_at: string;
  read_at: string | null;
}

export async function listNotifications(address: string): Promise<NotificationRow[]> {
  return (await sql()`SELECT id, opportunity_id, message, created_at, read_at FROM yieldproof.notifications WHERE address = ${address} ORDER BY created_at DESC LIMIT 50`) as NotificationRow[];
}

export async function markNotificationsRead(address: string): Promise<void> {
  await sql()`UPDATE yieldproof.notifications SET read_at = now() WHERE address = ${address} AND read_at IS NULL`;
}

// ---- snapshots & cron ----

export interface SnapshotRow {
  opportunity_id: string;
  metric: string;
  value: number | null;
  source: string;
  source_type: string;
  observed_at: string | null;
}

/** One round trip for the whole batch (unnest of parallel arrays). */
export async function upsertSnapshots(rows: SnapshotRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  // Deduplicate within the batch so ON CONFLICT never sees the same key twice.
  const byKey = new Map<string, SnapshotRow>();
  for (const r of rows) byKey.set(`${r.opportunity_id}|${r.metric}`, r);
  const list = [...byKey.values()];
  const res = (await sql()`
    INSERT INTO yieldproof.metric_snapshots (snapshot_day, opportunity_id, metric, value, source, source_type, observed_at)
    SELECT (now() AT TIME ZONE 'utc')::date, t.opportunity_id, t.metric, t.value, t.source, t.source_type, t.observed_at
    FROM unnest(
      ${list.map((r) => r.opportunity_id)}::text[],
      ${list.map((r) => r.metric)}::text[],
      ${list.map((r) => (r.value === null ? null : String(r.value)))}::numeric[],
      ${list.map((r) => r.source)}::text[],
      ${list.map((r) => r.source_type)}::text[],
      ${list.map((r) => r.observed_at)}::timestamptz[]
    ) AS t(opportunity_id, metric, value, source, source_type, observed_at)
    ON CONFLICT (opportunity_id, metric, snapshot_day) DO UPDATE
      SET value = EXCLUDED.value, taken_at = now(), source = EXCLUDED.source, source_type = EXCLUDED.source_type, observed_at = EXCLUDED.observed_at
    RETURNING id`) as unknown[];
  return res.length;
}

export async function readSnapshots(opportunityId: string): Promise<{ snapshot_day: string; metric: string; value: string | null; taken_at: string }[]> {
  return (await sql()`SELECT snapshot_day::text, metric, value::text, taken_at FROM yieldproof.metric_snapshots WHERE opportunity_id = ${opportunityId} ORDER BY snapshot_day`) as {
    snapshot_day: string;
    metric: string;
    value: string | null;
    taken_at: string;
  }[];
}

export async function snapshotStats(): Promise<{ rows: number; days: number; first: string | null; last: string | null }> {
  const r = (await sql()`SELECT count(*)::int AS rows, count(DISTINCT snapshot_day)::int AS days, min(snapshot_day)::text AS first, max(snapshot_day)::text AS last FROM yieldproof.metric_snapshots`) as {
    rows: number;
    days: number;
    first: string | null;
    last: string | null;
  }[];
  return r[0] ?? { rows: 0, days: 0, first: null, last: null };
}

export async function startCron(job: string): Promise<number> {
  const r = (await sql()`INSERT INTO yieldproof.cron_runs (job) VALUES (${job}) RETURNING id`) as { id: number }[];
  return r[0]!.id;
}

export async function finishCron(id: number, status: "success" | "partial" | "failed", details: unknown): Promise<void> {
  await sql()`UPDATE yieldproof.cron_runs SET finished_at = now(), status = ${status}, details = ${JSON.stringify(details)}::jsonb WHERE id = ${id}`;
}

export async function recentCronRuns(limit = 10): Promise<{ id: number; job: string; started_at: string; finished_at: string | null; status: string; details: unknown }[]> {
  return (await sql()`SELECT id, job, started_at, finished_at, status, details FROM yieldproof.cron_runs ORDER BY started_at DESC LIMIT ${limit}`) as {
    id: number;
    job: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    details: unknown;
  }[];
}

export async function upsertFeeWindow(poolId: string, windowDays: number, data: unknown): Promise<void> {
  await sql()`INSERT INTO yieldproof.fee_windows (pool_id, window_days, computed_at, data) VALUES (${poolId}, ${windowDays}, now(), ${JSON.stringify(data)}::jsonb)
              ON CONFLICT (pool_id, window_days) DO UPDATE SET computed_at = now(), data = EXCLUDED.data`;
}
