import type { ExtractedJob, JobExtractor } from "../types/extractor";
import {
  blockText,
  cleanJobUrl,
  decodeHtml,
  firstBlock,
  firstLine,
  htmlToText,
  meta,
  NOISE_WORDS,
  oneLine,
  parseTitle,
  queryOne,
  safe,
} from "./dom-utils";

interface JsonLdPosting {
  "@type"?: string | string[];
  title?: string;
  description?: string;
  hiringOrganization?: string | { name?: string };
  jobLocation?: any;
  jobLocationType?: string;
}

export function extractJsonLd(doc: Document): {
  company: string;
  role: string;
  location: string;
  description: string;
} {
  let posting: JsonLdPosting | null = null;
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');

  for (let i = 0; i < scripts.length; i++) {
    try {
      const parsed = JSON.parse(scripts[i].textContent || "");
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
        if (types.includes("JobPosting")) {
          posting = item as JsonLdPosting;
          break;
        }
        if (Array.isArray(item["@graph"])) {
          queue.push(...item["@graph"]);
        }
      }
      if (posting) break;
    } catch {
      // Ignore malformed JSON-LD
    }
  }

  if (!posting) {
    return { company: "", role: "", location: "", description: "" };
  }

  const org = posting.hiringOrganization;
  const company = typeof org === "string" ? org : org && org.name ? org.name : "";

  const place = Array.isArray(posting.jobLocation)
    ? posting.jobLocation[0]
    : posting.jobLocation;
  const address = place && (place.address || place);
  const country = address && address.addressCountry;
  const where =
    typeof address === "string"
      ? address
      : address
        ? [
            address.addressLocality,
            address.addressRegion,
            typeof country === "string" ? country : country && country.name,
          ]
            .filter((p) => p && typeof p === "string")
            .join(", ")
        : "";

  const location = where
    ? where
    : posting.jobLocationType === "TELECOMMUTE"
      ? "Remote"
      : "";

  return {
    company: oneLine(decodeHtml(company)),
    role: oneLine(decodeHtml(posting.title)),
    location: oneLine(decodeHtml(location)),
    description: htmlToText(posting.description),
  };
}

export const genericExtractor: JobExtractor = {
  name: "generic",
  matches(): boolean {
    return true;
  },
  extract(doc: Document, win: Window): Partial<ExtractedJob> | null {
    const jsonLd = extractJsonLd(doc);

    // DOM fallbacks
    const roleSelectors = ["h1"];
    const descriptionSelectors = ['[role="main"]', "main", "article"];

    const domRole = firstLine(roleSelectors, doc);
    const domDescription = firstBlock(descriptionSelectors, doc, 80);

    const titleParsed = parseTitle(doc.title, domRole || jsonLd.role, false, false);
    const ogTitle = meta("og:title", doc);
    const ogParsed = ogTitle
      ? parseTitle(ogTitle, domRole || jsonLd.role, false, false)
      : { company: "", role: "", location: "" };

    const siteNameMeta = meta("og:site_name", doc);
    const siteName = NOISE_WORDS.test(siteNameMeta) ? "" : siteNameMeta;

    const company =
      jsonLd.company ||
      titleParsed.company ||
      ogParsed.company ||
      siteName;

    const role =
      jsonLd.role ||
      domRole ||
      titleParsed.role ||
      ogParsed.role;

    const loc =
      jsonLd.location ||
      titleParsed.location ||
      ogParsed.location;

    const rawDescription =
      jsonLd.description ||
      domDescription ||
      meta("og:description", doc) ||
      (doc.body ? blockText(doc.body) : "");

    const jobUrl = cleanJobUrl(win.location.href, false);

    return {
      source: "generic",
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
