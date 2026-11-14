import { getDemoStrategies } from "@/lib/demo/strategies";
import { getLiveDataset } from "@/lib/data/dataset";
import { projectionContext } from "@/lib/jobs/snapshot";
import { comparisonCsvFor, decodeComparison, projectAll } from "@/lib/model/comparison";
import { assertDemoOnly } from "@/lib/model/separation";

export const dynamic = "force-dynamic";

/** CSV export of a comparison. Live and demo exports are separate (?demo=1). No wallet data is included. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = decodeComparison(url.searchParams);
  const demo = url.searchParams.get("demo") === "1";
  if (params.ids.length === 0) return new Response("ids required", { status: 400 });
  let csv: string;
  if (demo) {
    const opps = assertDemoOnly(getDemoStrategies());
    csv = comparisonCsvFor(projectAll(opps, params.ids, params.assumptions, { pools: {}, btcPrice: null }), params.assumptions);
  } else {
    const ds = await getLiveDataset();
    csv = comparisonCsvFor(projectAll(ds.opportunities, params.ids, params.assumptions, projectionContext(ds)), params.assumptions);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="yieldproof-${demo ? "demo-" : ""}comparison-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
