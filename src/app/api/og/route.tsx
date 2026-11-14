import { ImageResponse } from "next/og";
import { getLiveDataset } from "@/lib/data/dataset";
import { projectionContext } from "@/lib/jobs/snapshot";
import { decodeComparison, projectAll } from "@/lib/model/comparison";
import { PALETTE } from "@/lib/palette";

export const dynamic = "force-dynamic";

/** OG share card. With ?ids=… it summarises a comparison (no private data); without, a generic card. */
export async function GET(req: Request) {
  const params = decodeComparison(new URL(req.url).searchParams);
  let rows: { name: string; adv: string; net: string; pos: boolean }[] = [];
  if (params.ids.length) {
    try {
      const ds = await getLiveDataset();
      rows = projectAll(ds.opportunities, params.ids, params.assumptions, projectionContext(ds)).map(({ opp, projection }) => {
        const net = projection?.annualized?.toNumber() ?? null;
        return {
          name: opp.name.length > 44 ? opp.name.slice(0, 43) + "…" : opp.name,
          adv: opp.advertised.value === null ? "n/a" : `${(opp.advertised.value * 100).toFixed(2)}%`,
          net: net === null ? "insufficient data" : `${net >= 0 ? "+" : ""}${(net * 100).toFixed(2)}%`,
          pos: (net ?? 0) >= 0,
        };
      });
    } catch {
      rows = [];
    }
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: PALETTE.ground, color: PALETTE.ink, padding: 64, fontFamily: "serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 40 }}>
            <div style={{ width: 12, height: 40, border: `2px dashed ${PALETTE.muted}`, borderRadius: 2 }} />
            <div style={{ width: 12, height: 30, background: PALETTE.muted, borderRadius: 2 }} />
            <div style={{ width: 12, height: 22, background: PALETTE.pos, borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 34 }}>YieldProof</div>
        </div>
        {rows.length ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 48, gap: 18 }}>
            <div style={{ fontSize: 44 }}>Advertised vs estimated net</div>
            {rows.map((r) => (
              <div key={r.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 28, fontFamily: "sans-serif", borderTop: `1px solid ${PALETTE.line}`, paddingTop: 14 }}>
                <div style={{ display: "flex", color: PALETTE.ink2 }}>{r.name}</div>
                <div style={{ display: "flex", gap: 24 }}>
                  <span style={{ color: PALETTE.muted }}>{r.adv}</span>
                  <span style={{ color: r.pos ? PALETTE.pos : PALETTE.neg }}>{r.net}</span>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 20, color: PALETTE.muted, fontFamily: "sans-serif" }}>{`${params.assumptions.capital.toLocaleString("en-US")} MUSD, ${params.assumptions.days} days. Estimates, not guarantees.`}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 120 }}>
            <div style={{ fontSize: 96, letterSpacing: -2 }}>See Beyond APY.</div>
            <div style={{ fontSize: 30, marginTop: 24, color: PALETTE.ink2, fontFamily: "sans-serif" }}>Net yield after costs, incentives and risk, on live Mezo and MUSD data.</div>
          </div>
        )}
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
