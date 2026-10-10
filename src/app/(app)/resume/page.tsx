import type { Metadata } from "next";

import { ResumeEditor } from "@/components/resume/resume-editor";

export const metadata: Metadata = { title: "Master resume · ApplyOS" };

export default function ResumePage() {
  return <ResumeEditor />;
}
