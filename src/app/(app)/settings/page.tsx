import type { Metadata } from "next";
import { SettingsClient } from "@/components/personal";
import { PageHeader } from "@/components/shell";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" lede="Defaults for every projection in the app." />
      <SettingsClient />
    </>
  );
}
