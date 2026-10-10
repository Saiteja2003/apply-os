import { pdf } from "@react-pdf/renderer";

import type { MasterResume, PatchDocument } from "@/lib/types/resume";

import { mergeResume } from "./merge";
import { DENSITIES, ResumeDocument } from "./resume-document";

export interface RenderedResume {
  blob: Blob;
  /** 1 unless the content could not fit even at the tightest layout. */
  pages: number;
}

/** Counts page objects in a PDF file's text (`/Type /Page`, not `/Pages`). */
export function countPages(pdfText: string): number {
  return pdfText.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

/**
 * Merges the immutable master resume with a patch and compiles it to a PDF
 * in the browser. Layout density is stepped down until the result fits on a
 * single page; if nothing fits, the tightest layout is returned with its
 * real page count so the caller can say so.
 *
 * Pass `null` as the patch to render the master resume unchanged.
 */
export async function renderTailoredResume(
  masterResume: MasterResume,
  patchDocument: PatchDocument | null,
): Promise<RenderedResume> {
  const resume = mergeResume(masterResume, patchDocument);

  let rendered: RenderedResume | null = null;
  for (const density of DENSITIES) {
    const blob = await pdf(
      <ResumeDocument resume={resume} density={density} />,
    ).toBlob();
    rendered = { blob, pages: countPages(await blob.text()) };
    if (rendered.pages <= 1) break;
  }

  if (!rendered) throw new Error("No layout available to render the resume.");
  return rendered;
}

export function resumeFileName(name: string, company: string | null): string {
  const slug = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_");
  return `${[name, company, "Resume"].filter(Boolean).map((part) => slug(part!)).join("_")}.pdf`;
}
