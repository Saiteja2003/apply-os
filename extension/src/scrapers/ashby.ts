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

export const ashbyExtractor: JobExtractor = {
  name: "ashby",
  matches(_url: string, hostname: string): boolean {
    return hostname.includes("ashbyhq.com") || queryOne("#ashby-job-posting-app") !== null;
  },
  extract(doc: Document, win: Window): Partial<ExtractedJob> | null {
    const roleSelectors = ["h1"];
    const locationSelectors = [
      '[class*="location" i]',
      '[class*="Location"]',
      ".ashby-job-posting-location",
    ];
    const descriptionSelectors = [
      '[class*="descriptionText"]',
      '[class*="_description_"]',
      "#overview",
      "main",
    ];

    let role = firstLine(roleSelectors, doc);
    let loc = firstLine(locationSelectors, doc);
    let company = "";

    try {
      const u = new URL(win.location.href);
      const segment = u.pathname.split("/").filter(Boolean)[0] || "";
      if (segment && !/^(embed|jobs?)$/i.test(segment)) {
        company = decodeURIComponent(segment)
          .replace(/[-_]+/g, " ")
          .replace(/\b[a-z]/g, (c) => c.toUpperCase());
      }
    } catch {
      // Ignore URL parsing errors
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
      source: "ashby",
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
