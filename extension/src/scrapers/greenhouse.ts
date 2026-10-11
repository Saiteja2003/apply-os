import type { ExtractedJob, JobExtractor } from "../types/extractor";
import {
  cleanJobUrl,
  firstBlock,
  firstLine,
  oneLine,
  parseTitle,
  queryOne,
  safe,
} from "./dom-utils";

export const greenhouseExtractor: JobExtractor = {
  name: "greenhouse",
  matches(_url: string, hostname: string): boolean {
    return hostname.includes("greenhouse.io") || queryOne("#grnhse_app") !== null;
  },
  extract(doc: Document, win: Window): Partial<ExtractedJob> | null {
    const roleSelectors = [".app-title", ".job__title h1", "h1.section-header", "h1"];
    const companySelectors = [".company-name"];
    const locationSelectors = [".location", ".job__location"];
    const descriptionSelectors = ["#content", ".job__description", ".job-post", "main"];

    let role = firstLine(roleSelectors, doc);
    let company = firstLine(companySelectors, doc);
    let loc = firstLine(locationSelectors, doc);

    // Extract company from URL path or param if not in DOM
    if (!company) {
      try {
        const u = new URL(win.location.href);
        const named = u.searchParams.get("for");
        const segments = u.pathname.split("/").filter(Boolean);
        const segment = segments[0] || "";
        let raw = named || (/^(embed|jobs?|job_app)$/i.test(segment) ? "" : segment);
        if (raw) {
          raw = decodeURIComponent(raw);
          company = raw
            .replace(/[-_]+/g, " ")
            .replace(/\b[a-z]/g, (c) => c.toUpperCase());
        }
      } catch {
        // Ignore URL parsing errors
      }
    }

    if (!role || !company) {
      const parsed = parseTitle(doc.title, role, false, false);
      if (!role && parsed.role) role = parsed.role;
      if (!company && parsed.company) company = parsed.company;
      if (!loc && parsed.location) loc = parsed.location;
    }

    const rawDescription = firstBlock(descriptionSelectors, doc, 80);
    const jobUrl = cleanJobUrl(win.location.href, false);

    return {
      source: "greenhouse",
      companyName: safe(oneLine(company).slice(0, 200)).trim(),
      roleTitle: safe(oneLine(role).slice(0, 200)).trim(),
      location: safe(oneLine(loc).slice(0, 200)).trim(),
      description: safe(rawDescription.slice(0, 30_000)).trim(),
      jobUrl: safe(jobUrl.slice(0, 2000)),
      company: safe(oneLine(company).slice(0, 200)).trim(),
      role: safe(oneLine(role).slice(0, 200)).trim(),
      url: safe(jobUrl.slice(0, 2000)),
      jobDescription: safe(rawDescription.slice(0, 30_000)).trim(),
    };
  },
};
