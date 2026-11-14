import type { MetadataRoute } from "next";
import { LIVE_DEFINITIONS } from "@/lib/data/registry";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://yieldproof-mezo.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/dashboard", "/opportunities", "/compare", "/risk", "/history", "/musd", "/sources", "/methodology", "/demo", "/watchlist", "/portfolio", "/settings", "/legal"];
  return [...pages.map((p) => ({ url: `${SITE}${p}` })), ...LIVE_DEFINITIONS.map((d) => ({ url: `${SITE}/opportunities/${d.id}` }))];
}
