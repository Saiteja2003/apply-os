"use strict";
(() => {
  // extension/src/scrapers/dom-utils.ts
  var LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
  function safe(value) {
    return (value || "").replace(LONE_SURROGATE, "");
  }
  function tidy(value) {
    return String(value || "").replace(/\r\n?/g, "\n").replace(/[​‌‍﻿]/g, "").replace(/[   ]/g, " ").replace(/[ \t\f\v]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function oneLine(value) {
    return tidy(value).replace(/\s+/g, " ");
  }
  function parseHtml(html) {
    return new DOMParser().parseFromString(html, "text/html");
  }
  function decodeHtml(value) {
    const text = String(value || "");
    return /&(#\d+|#x[\da-f]+|[a-z]+);/i.test(text) ? parseHtml(text).documentElement.textContent || text : text;
  }
  var SKIP_TAGS = /^(script|style|noscript|svg|template|button|iframe|select)$/i;
  var LINE_TAGS = /^(div|section|article|tr|header|footer|main|aside|figure|dl|dt|dd|br)$/i;
  var PARAGRAPH_TAGS = /^(p|ul|ol|h[1-6]|blockquote|table|pre)$/i;
  var LINE_BREAK = "";
  var PARAGRAPH_BREAK = "";
  function walkNodes(node, out) {
    if (node.nodeType === 3) {
      out.push((node.nodeValue || "").replace(/\s+/g, " "));
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node;
    if (el.hidden || SKIP_TAGS.test(el.tagName)) return;
    const tag = el.tagName;
    const isItem = /^li$/i.test(tag);
    const edge = PARAGRAPH_TAGS.test(tag) ? PARAGRAPH_BREAK : isItem || LINE_TAGS.test(tag) ? LINE_BREAK : "";
    out.push(edge);
    if (isItem) out.push("\u2022 ");
    for (let i = 0; i < el.childNodes.length; i++) {
      walkNodes(el.childNodes[i], out);
    }
    out.push(edge);
  }
  function blockText(root) {
    const out = [];
    walkNodes(root, out);
    return tidy(
      out.join("").replace(
        /[\u0001\u0002 \t]*[\u0001\u0002][\u0001\u0002 \t]*/g,
        (run) => run.includes(PARAGRAPH_BREAK) ? "\n\n" : "\n"
      )
    );
  }
  function htmlToText(value) {
    let source = String(value || "");
    if (!/<[a-z!/]/i.test(source) && /&lt;[a-z/]/i.test(source)) {
      source = decodeHtml(source);
    }
    if (!/<[a-z!/]/i.test(source)) return tidy(decodeHtml(source));
    return blockText(parseHtml(source).body);
  }
  function queryOne(selector, root) {
    try {
      return (root || document).querySelector(selector);
    } catch {
      return null;
    }
  }
  function firstLine(selectors, root) {
    for (const selector of selectors) {
      const node = queryOne(selector, root);
      const value = node ? oneLine(blockText(node)) : "";
      if (value) return value;
    }
    return "";
  }
  function firstBlock(selectors, root, minLength = 80) {
    let best = "";
    for (const selector of selectors) {
      const node = queryOne(selector, root);
      const value = node ? blockText(node) : "";
      if (value.length >= minLength) return value;
      if (value.length > best.length) best = value;
    }
    return best;
  }
  function meta(name, doc) {
    const root = doc || document;
    const node = queryOne('meta[property="' + name + '"]', root) || queryOne('meta[name="' + name + '"]', root);
    return oneLine(decodeHtml(node ? node.getAttribute("content") : ""));
  }
  function cleanJobUrl(rawUrl, isLinkedIn = false) {
    try {
      const current = new URL(rawUrl);
      const jobId = current.searchParams.get("currentJobId");
      if (isLinkedIn && jobId) {
        return current.origin + "/jobs/view/" + encodeURIComponent(jobId) + "/";
      }
      const trackingParams = /^(utm_|trk|trackingid|refid|gh_src|lever-|ref$|src$|source$)/i;
      for (const key of [...current.searchParams.keys()]) {
        if (trackingParams.test(key)) {
          current.searchParams.delete(key);
        }
      }
      current.hash = "";
      return current.href;
    } catch {
      return (rawUrl || "").split("#")[0];
    }
  }
  var NOISE_WORDS = /^(linkedin|indeed|glassdoor|greenhouse|lever|ashby|workable|careers?|jobs?|job application|apply( now)?|home)$/i;
  function parseTitle(raw, knownRole, isLinkedIn = false, isLever = false) {
    const title = raw.replace(/^\(\d+\)\s*/, "");
    const hiring = title.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+(.+?))?(?:\s+\|.*)?$/i);
    if (hiring && isLinkedIn) {
      return { company: hiring[1], role: hiring[2], location: hiring[3] || "" };
    }
    const at = title.match(/^(?:Job Application for\s+)?(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (at) {
      return {
        role: at[1],
        company: at[2].split(/\s+[|\-–—]\s+/)[0],
        location: ""
      };
    }
    const parts = title.split(/\s+[|\-–—]\s+/).map((part) => part.trim()).filter((part) => part && !NOISE_WORDS.test(part));
    if (parts.length < 2) return { role: parts[0] || "", company: "", location: "" };
    const known = knownRole.toLowerCase();
    const index = known ? parts.findIndex((part) => part.toLowerCase() === known) : -1;
    if (index >= 0) {
      return {
        role: parts[index],
        company: parts.find((_, other) => other !== index) || "",
        location: ""
      };
    }
    return isLever ? { company: parts[0], role: parts[1], location: "" } : { role: parts[0], company: parts[1], location: "" };
  }

  // extension/src/scrapers/ashby.ts
  var ashbyExtractor = {
    name: "ashby",
    matches(_url, hostname) {
      return hostname.includes("ashbyhq.com") || queryOne("#ashby-job-posting-app") !== null;
    },
    extract(doc, win) {
      const roleSelectors = ["h1"];
      const locationSelectors = [
        '[class*="location" i]',
        '[class*="Location"]',
        ".ashby-job-posting-location"
      ];
      const descriptionSelectors = [
        '[class*="descriptionText"]',
        '[class*="_description_"]',
        "#overview",
        "main"
      ];
      let role = firstLine(roleSelectors, doc);
      let loc = firstLine(locationSelectors, doc);
      let company = "";
      try {
        const u = new URL(win.location.href);
        const segment = u.pathname.split("/").filter(Boolean)[0] || "";
        if (segment && !/^(embed|jobs?)$/i.test(segment)) {
          company = decodeURIComponent(segment).replace(/[-_]+/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
        }
      } catch {
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
        description: safe(rawDescription.slice(0, 3e4)).trim(),
        jobUrl: safe(jobUrl.slice(0, 2e3)),
        company: safe(oneLine(company).slice(0, 200)).trim(),
        role: safe(oneLine(role).slice(0, 200)).trim(),
        url: safe(jobUrl.slice(0, 2e3)),
        jobDescription: safe(rawDescription.slice(0, 3e4)).trim()
      };
    }
  };

  // extension/src/scrapers/generic.ts
  function extractJsonLd(doc) {
    let posting = null;
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
            posting = item;
            break;
          }
          if (Array.isArray(item["@graph"])) {
            queue.push(...item["@graph"]);
          }
        }
        if (posting) break;
      } catch {
      }
    }
    if (!posting) {
      return { company: "", role: "", location: "", description: "" };
    }
    const org = posting.hiringOrganization;
    const company = typeof org === "string" ? org : org && org.name ? org.name : "";
    const place = Array.isArray(posting.jobLocation) ? posting.jobLocation[0] : posting.jobLocation;
    const address = place && (place.address || place);
    const country = address && address.addressCountry;
    const where = typeof address === "string" ? address : address ? [
      address.addressLocality,
      address.addressRegion,
      typeof country === "string" ? country : country && country.name
    ].filter((p) => p && typeof p === "string").join(", ") : "";
    const location = where ? where : posting.jobLocationType === "TELECOMMUTE" ? "Remote" : "";
    return {
      company: oneLine(decodeHtml(company)),
      role: oneLine(decodeHtml(posting.title)),
      location: oneLine(decodeHtml(location)),
      description: htmlToText(posting.description)
    };
  }
  var genericExtractor = {
    name: "generic",
    matches() {
      return true;
    },
    extract(doc, win) {
      const jsonLd = extractJsonLd(doc);
      const roleSelectors = ["h1"];
      const descriptionSelectors = ['[role="main"]', "main", "article"];
      const domRole = firstLine(roleSelectors, doc);
      const domDescription = firstBlock(descriptionSelectors, doc, 80);
      const titleParsed = parseTitle(doc.title, domRole || jsonLd.role, false, false);
      const ogTitle = meta("og:title", doc);
      const ogParsed = ogTitle ? parseTitle(ogTitle, domRole || jsonLd.role, false, false) : { company: "", role: "", location: "" };
      const siteNameMeta = meta("og:site_name", doc);
      const siteName = NOISE_WORDS.test(siteNameMeta) ? "" : siteNameMeta;
      const company = jsonLd.company || titleParsed.company || ogParsed.company || siteName;
      const role = jsonLd.role || domRole || titleParsed.role || ogParsed.role;
      const loc = jsonLd.location || titleParsed.location || ogParsed.location;
      const rawDescription = jsonLd.description || domDescription || meta("og:description", doc) || (doc.body ? blockText(doc.body) : "");
      const jobUrl = cleanJobUrl(win.location.href, false);
      return {
        source: "generic",
        companyName: safe(oneLine(company).slice(0, 200)).trim(),
        roleTitle: safe(oneLine(role).slice(0, 200)).trim(),
        location: safe(oneLine(loc).slice(0, 200)).trim(),
        description: safe(rawDescription.slice(0, 3e4)).trim(),
        jobUrl: safe(jobUrl.slice(0, 2e3)),
        company: safe(oneLine(company).slice(0, 200)).trim(),
        role: safe(oneLine(role).slice(0, 200)).trim(),
        url: safe(jobUrl.slice(0, 2e3)),
        jobDescription: safe(rawDescription.slice(0, 3e4)).trim()
      };
    }
  };

  // extension/src/scrapers/greenhouse.ts
  var greenhouseExtractor = {
    name: "greenhouse",
    matches(_url, hostname) {
      return hostname.includes("greenhouse.io") || queryOne("#grnhse_app") !== null;
    },
    extract(doc, win) {
      const roleSelectors = [".app-title", ".job__title h1", "h1.section-header", "h1"];
      const companySelectors = [".company-name"];
      const locationSelectors = [".location", ".job__location"];
      const descriptionSelectors = ["#content", ".job__description", ".job-post", "main"];
      let role = firstLine(roleSelectors, doc);
      let company = firstLine(companySelectors, doc);
      let loc = firstLine(locationSelectors, doc);
      if (!company) {
        try {
          const u = new URL(win.location.href);
          const named = u.searchParams.get("for");
          const segments = u.pathname.split("/").filter(Boolean);
          const segment = segments[0] || "";
          let raw = named || (/^(embed|jobs?|job_app)$/i.test(segment) ? "" : segment);
          if (raw) {
            raw = decodeURIComponent(raw);
            company = raw.replace(/[-_]+/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
          }
        } catch {
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
        description: safe(rawDescription.slice(0, 3e4)).trim(),
        jobUrl: safe(jobUrl.slice(0, 2e3)),
        company: safe(oneLine(company).slice(0, 200)).trim(),
        role: safe(oneLine(role).slice(0, 200)).trim(),
        url: safe(jobUrl.slice(0, 2e3)),
        jobDescription: safe(rawDescription.slice(0, 3e4)).trim()
      };
    }
  };

  // extension/src/scrapers/lever.ts
  var leverExtractor = {
    name: "lever",
    matches(_url, hostname) {
      return hostname.includes("lever.co");
    },
    extract(doc, win) {
      const roleSelectors = [".posting-headline h2", "h2"];
      const locationSelectors = [".posting-categories .location", ".sort-by-time"];
      const descriptionSelectors = [
        '[data-qa="job-description"]',
        ".posting-page .content",
        ".section-wrapper",
        "main"
      ];
      let role = firstLine(roleSelectors, doc);
      let loc = firstLine(locationSelectors, doc);
      let company = "";
      try {
        const u = new URL(win.location.href);
        const segment = u.pathname.split("/").filter(Boolean)[0] || "";
        if (segment && !/^(embed|jobs?)$/i.test(segment)) {
          company = decodeURIComponent(segment).replace(/[-_]+/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
        }
      } catch {
      }
      if (!role || !company) {
        const parsed = parseTitle(doc.title, role, false, true);
        if (!role && parsed.role) role = parsed.role;
        if (!company && parsed.company) company = parsed.company;
        if (!loc && parsed.location) loc = parsed.location;
      }
      const rawDescription = firstBlock(descriptionSelectors, doc, 80);
      const jobUrl = cleanJobUrl(win.location.href, false);
      return {
        source: "lever",
        companyName: safe(oneLine(company).slice(0, 200)).trim(),
        roleTitle: safe(oneLine(role).slice(0, 200)).trim(),
        location: safe(oneLine(loc).slice(0, 200)).trim(),
        description: safe(rawDescription.slice(0, 3e4)).trim(),
        jobUrl: safe(jobUrl.slice(0, 2e3)),
        company: safe(oneLine(company).slice(0, 200)).trim(),
        role: safe(oneLine(role).slice(0, 200)).trim(),
        url: safe(jobUrl.slice(0, 2e3)),
        jobDescription: safe(rawDescription.slice(0, 3e4)).trim()
      };
    }
  };

  // extension/src/scrapers/linkedin.ts
  var linkedInExtractor = {
    name: "linkedin",
    matches(_url, hostname) {
      return hostname.includes("linkedin.com");
    },
    extract(doc, win) {
      const rootSelectors = [
        ".jobs-search__job-details--container",
        ".scaffold-layout__detail",
        ".jobs-details",
        ".job-view-layout"
      ];
      let scope = doc;
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
        "h1"
      ];
      const companySelectors = [
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name",
        ".topcard__org-name-link",
        'a[href*="/company/"]'
      ];
      const locationSelectors = [
        ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
        ".job-details-jobs-unified-top-card__bullet",
        ".jobs-unified-top-card__bullet",
        ".topcard__flavor--bullet"
      ];
      const descriptionSelectors = [
        ".jobs-description__content .jobs-box__html-content",
        ".jobs-description__content",
        ".jobs-description",
        "#job-details",
        ".show-more-less-html__markup",
        ".description__text",
        "article"
      ];
      let role = firstLine(roleSelectors, scope);
      let company = firstLine(companySelectors, scope).replace(/^(at|@)\s+/i, "");
      let loc = firstLine(locationSelectors, scope);
      if (!role || !company) {
        const parsed = parseTitle(doc.title, role, true, false);
        if (!role && parsed.role) role = parsed.role;
        if (!company && parsed.company) company = parsed.company;
        if (!loc && parsed.location) loc = parsed.location;
      }
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
        description: safe(rawDescription.slice(0, 3e4)).trim(),
        jobUrl: safe(jobUrl.slice(0, 2e3)),
        company: safe(oneLine(company).slice(0, 200)).trim(),
        role: safe(oneLine(role).slice(0, 200)).trim(),
        url: safe(jobUrl.slice(0, 2e3)),
        jobDescription: safe(rawDescription.slice(0, 3e4)).trim()
      };
    }
  };

  // extension/src/scrapers/index.ts
  var EXTRACTORS = [
    linkedInExtractor,
    greenhouseExtractor,
    leverExtractor,
    ashbyExtractor
  ];
  function extractJob(doc = document, win = window) {
    const url = win.location.href;
    const hostname = win.location.hostname;
    const isLinkedIn = hostname.includes("linkedin.com");
    const rawSelection = tidy(String(win.getSelection() || ""));
    const hasUserSelection = rawSelection.length >= 80;
    let matchedExtractor = null;
    for (const ext of EXTRACTORS) {
      if (ext.matches(url, hostname)) {
        matchedExtractor = ext;
        break;
      }
    }
    const siteResult = matchedExtractor ? matchedExtractor.extract(doc, win) : null;
    const jsonLdResult = extractJsonLd(doc);
    const genericResult = genericExtractor.extract(doc, win);
    const preferSiteFirst = isLinkedIn || siteResult && siteResult.description && siteResult.description.length > 200;
    const company = (preferSiteFirst ? siteResult?.companyName || jsonLdResult.company || genericResult?.companyName : jsonLdResult.company || siteResult?.companyName || genericResult?.companyName) || "";
    const role = (preferSiteFirst ? siteResult?.roleTitle || jsonLdResult.role || genericResult?.roleTitle : jsonLdResult.role || siteResult?.roleTitle || genericResult?.roleTitle) || "";
    const location = (preferSiteFirst ? siteResult?.location || jsonLdResult.location || genericResult?.location : jsonLdResult.location || siteResult?.location || genericResult?.location) || "";
    let description = "";
    if (hasUserSelection) {
      description = rawSelection;
    } else if (preferSiteFirst) {
      description = siteResult?.description || jsonLdResult.description || genericResult?.description || "";
    } else {
      description = jsonLdResult.description || siteResult?.description || genericResult?.description || "";
    }
    const finalJobUrl = cleanJobUrl(url, isLinkedIn);
    const cleanCompany = safe(oneLine(company).slice(0, 200)).trim();
    const cleanRole = safe(oneLine(role).slice(0, 200)).trim();
    const cleanLoc = safe(oneLine(location).slice(0, 200)).trim();
    const cleanDesc = safe(tidy(description).slice(0, 3e4)).trim();
    const cleanUrl = safe(finalJobUrl.slice(0, 2e3));
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
      jobDescription: cleanDesc
    };
  }

  // extension/src/extract.ts
  (() => {
    try {
      return extractJob();
    } catch {
      return null;
    }
  })();
  return typeof extractJob === 'function' ? extractJob() : null;
})();
