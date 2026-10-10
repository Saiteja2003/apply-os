/**
 * Reads the text layer of a PDF in the browser. The file never leaves the
 * device: only the extracted text is sent on for structuring.
 *
 * The PDF engine is large, so import this module lazily.
 */

/** An error whose message is safe to show to the user. */
export class PdfTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfTextError";
  }
}

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Below this, the PDF is almost certainly a scan with no text layer. */
const MIN_TEXT_CHARS = 200;

export interface ExtractedPdf {
  text: string;
  pages: number;
}

export async function extractPdfText(file: File): Promise<ExtractedPdf> {
  if (file.size > MAX_PDF_BYTES) {
    throw new PdfTextError("That PDF is too large (10 MB max).");
  }

  const { extractText, getDocumentProxy } = await import("unpdf");

  let pages: string[];
  try {
    const document = await getDocumentProxy(
      new Uint8Array(await file.arrayBuffer()),
    );
    ({ text: pages } = await extractText(document, { mergePages: false }));
  } catch {
    throw new PdfTextError(
      "That file could not be read as a PDF. If it is password protected, remove the password first.",
    );
  }

  const text = pages
    .map((page) => page.trim())
    .filter(Boolean)
    .join("\n\n");

  if (text.length < MIN_TEXT_CHARS) {
    throw new PdfTextError(
      "This PDF has no selectable text, so it is probably a scan. Paste the text of your resume instead.",
    );
  }
  return { text, pages: pages.length };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
