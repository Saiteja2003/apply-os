import type { Metadata } from "next";

import { ClipImport } from "@/components/clip-import";

export const metadata: Metadata = { title: "Import job · ApplyOS" };

export default function ClipPage() {
  return <ClipImport />;
}
