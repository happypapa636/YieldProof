import { loadEnv } from "./load-env";
loadEnv();
process.env.YP_DB_WS = process.env.YP_DB_WS ?? "1";

/** Run the daily snapshot job locally (same code path as /api/cron/snapshot). */
(async () => {
  const { runSnapshotJob } = await import("../src/lib/jobs/snapshot");
  const { closeDb } = await import("../src/lib/db/client");
  const report = await runSnapshotJob();
  console.log(JSON.stringify(report, null, 2));
  await closeDb();
})().catch((e) => {
  console.error("snapshot failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
