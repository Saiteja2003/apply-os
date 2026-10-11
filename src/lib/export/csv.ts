import type { JobApplication } from "@/lib/types/resume";

// ---------------------------------------------------------------------------
// CSV export helper – zero dependencies, client-side only.
// ---------------------------------------------------------------------------

/** Escape a cell value for CSV: quote if it contains commas, quotes, or newlines. */
function escapeCell(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Format an ISO timestamp into a clean `YYYY-MM-DD` date string, or return an empty string. */
function formatIsoDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

const HEADERS = [
  "Company",
  "Role",
  "Location",
  "Status",
  "Match Score",
  "Matched Keywords",
  "Missing Keywords",
  "Applied Date",
  "Date Added",
  "Job URL",
  "Source",
  "Notes",
] as const;

function applicationToRow(app: JobApplication): string[] {
  return [
    app.companyName,
    app.roleTitle,
    app.location ?? "",
    app.status,
    app.matchScore !== null ? String(app.matchScore) : "",
    app.atsKeywords.matched.join("; "),
    app.atsKeywords.missing.join("; "),
    formatIsoDate(app.appliedAt),
    formatIsoDate(app.createdAt),
    app.jobUrl ?? "",
    app.jobBoardSource ?? "",
    app.notes ?? "",
  ];
}

/**
 * Export an array of `JobApplication` objects to a CSV file downloaded on the
 * client. The file is named `honing_applications_YYYY-MM-DD.csv`.
 */
export function exportApplicationsToCsv(
  applications: JobApplication[],
): void {
  const rows = [
    HEADERS.map(escapeCell).join(","),
    ...applications.map((app) =>
      applicationToRow(app).map(escapeCell).join(","),
    ),
  ];

  const csvContent = rows.join("\r\n") + "\r\n";
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const today = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `honing_applications_${today}.csv`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  // Clean up after a tick so the browser has time to initiate the download.
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}
