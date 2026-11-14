import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "@/components/providers";
import "./globals.css";

const display = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", weight: ["400", "500", "600"], style: ["normal", "italic"], display: "swap" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-plex-sans", weight: ["400", "500", "600"], display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-plex-mono", weight: ["400", "500"], display: "swap" });

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://yieldproof-mezo.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "YieldProof — See Beyond APY", template: "%s — YieldProof" },
  description: "Compare DeFi strategies using estimated net returns, transparent costs, and risk-aware analytics. Built on live Mezo and MUSD data.",
  openGraph: {
    title: "YieldProof — See Beyond APY",
    description: "Where the yield comes from, what it costs, what could go wrong, and what you might actually keep. Live Mezo & MUSD analytics.",
    type: "website",
    siteName: "YieldProof",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title: "YieldProof — See Beyond APY", images: ["/api/og"] },
};

export const viewport: Viewport = { themeColor: "#0f1011", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
