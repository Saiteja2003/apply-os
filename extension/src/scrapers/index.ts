import type { ExtractedJob, JobExtractor } from "../types/extractor";
import { ashbyExtractor } from "./ashby";
import {
  cleanJobUrl,
  oneLine,
  safe,
  tidy,
} from "./dom-utils";
import { extractJsonLd, genericExtractor } from "./generic";
import { greenhouseExtractor } from "./greenhouse";
import { leverExtractor } from "./lever";
import { linkedInExtractor } from "./linkedin";

const EXTRACTORS: JobExtractor[] = [
  linkedInExtractor,
  greenhouseExtractor,
  leverExtractor,
  ashbyExtractor,
];

export function extractJob(doc = document, win = window): ExtractedJob {
  const url = win.location.href;
  const hostname = win.location.hostname;
  const isLinkedIn = hostname.includes("linkedin.com");

  // User selection override: if user pointed at specific text, prioritize it
  const rawSelection = tidy(String(win.getSelection() || ""));
  const hasUserSelection = rawSelection.length >= 80;

  // 1. Run matched specific extractor if any
  let matchedExtractor: JobExtractor | null = null;
  for (const ext of EXTRACTORS) {
    if (ext.matches(url, hostname)) {
      matchedExtractor = ext;
      break;
    }
  }

  const siteResult = matchedExtractor ? matchedExtractor.extract(doc, win) : null;
  const jsonLdResult = extractJsonLd(doc);
  const genericResult = genericExtractor.extract(doc, win);

  // Preference order:
  // On LinkedIn, site markup wins over stale JSON-LD
  // On other sites, JSON-LD is often high fidelity
  const preferSiteFirst = isLinkedIn || (siteResult && siteResult.description && siteResult.description.length > 200);

  const company =
    (preferSiteFirst
      ? siteResult?.companyName || jsonLdResult.company || genericResult?.companyName
      : jsonLdResult.company || siteResult?.companyName || genericResult?.companyName) || "";

  const role =
    (preferSiteFirst
      ? siteResult?.roleTitle || jsonLdResult.role || genericResult?.roleTitle
      : jsonLdResult.role || siteResult?.roleTitle || genericResult?.roleTitle) || "";

  const location =
    (preferSiteFirst
      ? siteResult?.location || jsonLdResult.location || genericResult?.location
      : jsonLdResult.location || siteResult?.location || genericResult?.location) || "";

  let description = "";
  if (hasUserSelection) {
    description = rawSelection;
  } else if (preferSiteFirst) {
    description =
      siteResult?.description ||
      jsonLdResult.description ||
      genericResult?.description ||
      "";
  } else {
    description =
      jsonLdResult.description ||
      siteResult?.description ||
      genericResult?.description ||
      "";
  }

  const finalJobUrl = cleanJobUrl(url, isLinkedIn);

  const cleanCompany = safe(oneLine(company).slice(0, 200)).trim();
  const cleanRole = safe(oneLine(role).slice(0, 200)).trim();
  const cleanLoc = safe(oneLine(location).slice(0, 200)).trim();
  const cleanDesc = safe(tidy(description).slice(0, 30_000)).trim();
  const cleanUrl = safe(finalJobUrl.slice(0, 2000));
  const source = matchedExtractor ? matchedExtractor.name : "generic";

  return {
    source,
    companyName: cleanCompany,
    roleTitle: cleanRole,
    location: cleanLoc,
    description: cleanDesc,
    jobUrl: cleanUrl,
    // API aliases
    company: cleanCompany,
    role: cleanRole,
    url: cleanUrl,
    jobDescription: cleanDesc,
  };
}
