import type { Metadata } from "next";

import { ClipImport } from "@/components/clip-import";

export const metadata: Metadata = { title: "Import job · Honing" };

export default function ClipPage() {
  return <ClipImport />;
}
