import type { ExtractedJob, JobExtractor } from "../types/extractor";
import {
  blockText,
  cleanJobUrl,
  firstBlock,
  firstLine,
  oneLine,
  parseTitle,
  queryOne,
  safe,
} from "./dom-utils";

export const linkedInExtractor: JobExtractor = {
  name: "linkedin",
  matches(_url: string, hostname: string): boolean {
    return hostname.includes("linkedin.com");
  },
  extract(doc: Document, win: Window): Partial<ExtractedJob> | null {
    const rootSelectors = [
      ".jobs-search__job-details--container",
      ".scaffold-layout__detail",
      ".jobs-details",
      ".job-view-layout",
    ];

    let scope: Element | Document = doc;
    for (const sel of rootSelectors) {
      const el = queryOne(sel, doc);
      if (el) {
        scope = el;
        break;
      }
    }

    const roleSelectors = [
      ".job-details-jobs-unified-top-card__job-title h1",
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      ".top-card-layout__title",
      "h1.t-24",
      "h1",
    ];

    const companySelectors = [
      ".job-details-jobs-unified-top-card__company-name a",
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name",
      ".topcard__org-name-link",
      'a[href*="/company/"]',
    ];

    const locationSelectors = [
      ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
      ".job-details-jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__bullet",
      ".topcard__flavor--bullet",
    ];

    const descriptionSelectors = [
      ".jobs-description__content .jobs-box__html-content",
      ".jobs-description__content",
      ".jobs-description",
      "#job-details",
      ".show-more-less-html__markup",
      ".description__text",
      "article",
    ];

    let role = firstLine(roleSelectors, scope);
    let company = firstLine(companySelectors, scope).replace(/^(at|@)\s+/i, "");
    let loc = firstLine(locationSelectors, scope);

    // Fallback to title parsing if role or company missing
    if (!role || !company) {
      const parsed = parseTitle(doc.title, role, true, false);
      if (!role && parsed.role) role = parsed.role;
      if (!company && parsed.company) company = parsed.company;
      if (!loc && parsed.location) loc = parsed.location;
    }

    // Clean location (remove applicants and date counts)
    if (loc) {
      loc = loc.split(/\s+[·•]\s+/)[0];
    }

    const rawDescription = firstBlock(descriptionSelectors, scope, 80);
    const jobUrl = cleanJobUrl(win.location.href, true);

    return {
      source: "linkedin",
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
