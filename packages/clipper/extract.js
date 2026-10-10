// Reads the job posting on the current page. Runs in the page: the extension
// injects this file, and build-bookmarklet.mjs inlines it into the
// bookmarklet. Keep it one self-contained expression, with comments on lines
// of their own, so the build can flatten it to a single line.
//
// Order of trust: the page's own text selection, then schema.org JobPosting
// data the site publishes for search engines, then per-site selectors, then
// the page's main content. LinkedIn is the exception: it is a single-page
// app that can leave a previous job's JSON-LD behind, so its visible
// markup wins.
//
// Returns { company, role, location, url, jobDescription }, every field a
// string (possibly empty), single-line fields flattened and the description
// kept as plain text with its list items as "• " bullets.
(function extractJob() {
  // A lone surrogate (e.g. from slicing through an emoji) makes
  // encodeURIComponent throw, which would silently kill the bookmarklet.
  const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
  const safe = (value) => value.replace(LONE_SURROGATE, "");

  // Multi-line text: collapse runs of spaces, trim every line, keep line
  // breaks (at most one blank line in a row) and any bullets.
  const tidy = (value) =>
    String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[​‌‍﻿]/g, "")
      .replace(/[   ]/g, " ")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  const oneLine = (value) => tidy(value).replace(/\s+/g, " ");

  const parse = (html) => new DOMParser().parseFromString(html, "text/html");
  const decode = (value) => {
    const text = String(value || "");
    return /&(#\d+|#x[\da-f]+|[a-z]+);/i.test(text)
      ? parse(text).documentElement.textContent || text
      : text;
  };

  const SKIP = /^(script|style|noscript|svg|template|button|iframe|select)$/i;
  const LINE = /^(div|section|article|tr|header|footer|main|aside|figure|dl|dt|dd|br)$/i;
  const PARAGRAPH = /^(p|ul|ol|h[1-6]|blockquote|table|pre)$/i;
  // Breaks are written as markers and resolved at the end, so a list item
  // followed by another gets one line break, not a blank line between.
  const LINE_BREAK = "\u0001";
  const PARAGRAPH_BREAK = "\u0002";
  // innerText drops list markers, so walk the tree and write them back.
  const walk = (node, out) => {
    if (node.nodeType === 3) {
      out.push(node.nodeValue.replace(/\s+/g, " "));
      return;
    }
    if (node.nodeType !== 1 || node.hidden || SKIP.test(node.tagName)) return;
    const tag = node.tagName;
    const item = /^li$/i.test(tag);
    const edge = PARAGRAPH.test(tag) ? PARAGRAPH_BREAK : item || LINE.test(tag) ? LINE_BREAK : "";
    out.push(edge);
    if (item) out.push("• ");
    for (const child of node.childNodes) walk(child, out);
    out.push(edge);
  };
  const blockText = (root) => {
    const out = [];
    walk(root, out);
    return tidy(
      out
        .join("")
        .replace(/[\u0001\u0002 \t]*[\u0001\u0002][\u0001\u0002 \t]*/g, (run) =>
          run.includes(PARAGRAPH_BREAK) ? "\n\n" : "\n",
        ),
    );
  };

  // HTML (or entity-escaped HTML, or plain text) to tidy plain text.
  const htmlToText = (value) => {
    let source = String(value || "");
    if (!/<[a-z!/]/i.test(source) && /&lt;[a-z/]/i.test(source)) {
      source = decode(source);
    }
    if (!/<[a-z!/]/i.test(source)) return tidy(decode(source));
    return blockText(parse(source).body);
  };

  const queryOne = (selector, root) => {
    try {
      return (root || document).querySelector(selector);
    } catch {
      return null;
    }
  };
  const firstLine = (selectors, root) => {
    for (const selector of selectors) {
      const node = queryOne(selector, root);
      const value = node ? oneLine(blockText(node)) : "";
      if (value) return value;
    }
    return "";
  };
  // The first match that looks like a real description, else the longest.
  const firstBlock = (selectors, root) => {
    let best = "";
    for (const selector of selectors) {
      const node = queryOne(selector, root);
      const value = node ? blockText(node) : "";
      if (value.length >= 80) return value;
      if (value.length > best.length) best = value;
    }
    return best;
  };
  const meta = (name) => {
    const node =
      queryOne('meta[property="' + name + '"]') || queryOne('meta[name="' + name + '"]');
    return oneLine(decode(node ? node.getAttribute("content") : ""));
  };
  const pick = (...values) => values.find((value) => value) || "";

  // 1. schema.org JobPosting (Greenhouse, Lever, Ashby and most career sites).
  const posting = (() => {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const queue = [].concat(JSON.parse(script.textContent || ""));
        while (queue.length) {
          const node = queue.shift();
          if (!node || typeof node !== "object") continue;
          if ([].concat(node["@type"] || []).includes("JobPosting")) return node;
          queue.push(...[].concat(node["@graph"] || []));
        }
      } catch {
        // Malformed JSON-LD: ignore it and keep looking.
      }
    }
    return null;
  })();
  const fromPosting = (() => {
    if (!posting) return { company: "", role: "", location: "", description: "" };
    const org = posting.hiringOrganization;
    const place = [].concat(posting.jobLocation || [])[0];
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
              .filter((part) => part && typeof part === "string")
              .join(", ")
          : "";
    return {
      company: oneLine(decode(typeof org === "string" ? org : org && org.name)),
      role: oneLine(decode(posting.title)),
      location: where
        ? oneLine(decode(where))
        : posting.jobLocationType === "TELECOMMUTE"
          ? "Remote"
          : "",
      description: htmlToText(posting.description),
    };
  })();

  // 2. Per-site selectors, most specific first.
  const host = location.hostname;
  const isLinkedIn = host.includes("linkedin.com");
  const isLever = host.includes("lever.co");
  const isBoard = isLever || host.includes("greenhouse.io") || host.includes("ashbyhq.com");

  const sites = {
    linkedin: {
      root: [
        ".jobs-search__job-details--container",
        ".scaffold-layout__detail",
        ".jobs-details",
        ".job-view-layout",
      ],
      role: [
        ".job-details-jobs-unified-top-card__job-title h1",
        ".job-details-jobs-unified-top-card__job-title",
        ".jobs-unified-top-card__job-title",
        ".top-card-layout__title",
        "h1.t-24",
        "h1",
      ],
      company: [
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name",
        ".topcard__org-name-link",
        'a[href*="/company/"]',
      ],
      location: [
        ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
        ".job-details-jobs-unified-top-card__bullet",
        ".jobs-unified-top-card__bullet",
        ".topcard__flavor--bullet",
      ],
      description: [
        ".jobs-description__content .jobs-box__html-content",
        ".jobs-description__content",
        ".jobs-description",
        "#job-details",
        ".show-more-less-html__markup",
        ".description__text",
        "article",
      ],
    },
    greenhouse: {
      role: [".app-title", ".job__title h1", "h1.section-header", "h1"],
      company: [".company-name"],
      location: [".location", ".job__location"],
      description: ["#content", ".job__description", ".job-post", "main"],
    },
    lever: {
      role: [".posting-headline h2", "h2"],
      company: [],
      location: [".posting-categories .location", ".sort-by-time"],
      description: [
        '[data-qa="job-description"]',
        ".posting-page .content",
        ".section-wrapper",
        "main",
      ],
    },
    ashby: {
      role: ["h1"],
      company: [],
      location: [],
      description: [
        '[class*="descriptionText"]',
        '[class*="_description_"]',
        "#overview",
        "main",
      ],
    },
    generic: {
      role: ["h1"],
      company: [],
      location: [],
      description: ['[role="main"]', "main", "article"],
    },
  };
  const site = isLinkedIn
    ? sites.linkedin
    : host.includes("greenhouse.io")
      ? sites.greenhouse
      : isLever
        ? sites.lever
        : host.includes("ashbyhq.com")
          ? sites.ashby
          : sites.generic;
  const scope = (site.root && site.root.map((selector) => queryOne(selector)).find(Boolean)) || document;
  const fromSite = {
    company: firstLine(site.company, scope).replace(/^(at|@)\s+/i, ""),
    role: firstLine(site.role, scope),
    location: firstLine(site.location, scope),
    description: firstBlock(site.description, scope),
  };

  // 3. The page title: "Role at Company", "Role @ Company", "Company hiring
  // Role in Place | LinkedIn", "Role | Company | LinkedIn", "Company - Role".
  const NOISE =
    /^(linkedin|indeed|glassdoor|greenhouse|lever|ashby|workable|careers?|jobs?|job application|apply( now)?|home)$/i;
  const parseTitle = (raw, knownRole) => {
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
        location: "",
      };
    }
    const parts = title
      .split(/\s+[|\-–—]\s+/)
      .map((part) => part.trim())
      .filter((part) => part && !NOISE.test(part));
    if (parts.length < 2) return { role: parts[0] || "", company: "", location: "" };
    const known = knownRole.toLowerCase();
    const index = known ? parts.findIndex((part) => part.toLowerCase() === known) : -1;
    if (index >= 0) {
      return {
        role: parts[index],
        company: parts.find((_, other) => other !== index) || "",
        location: "",
      };
    }
    return isLever
      ? { company: parts[0], role: parts[1], location: "" }
      : { role: parts[0], company: parts[1], location: "" };
  };
  const knownRole = pick(fromSite.role, fromPosting.role);
  const fromTitle = [document.title, meta("og:title")]
    .map((value) => parseTitle(oneLine(decode(value)), knownRole))
    .reduce(
      (merged, parsed) => ({
        company: merged.company || parsed.company,
        role: merged.role || parsed.role,
        location: merged.location || parsed.location,
      }),
      { company: "", role: "", location: "" },
    );

  // 4. Job boards put the company in the address: boards.greenhouse.io/acme/…
  const fromAddress = (() => {
    if (!isBoard) return "";
    const named = new URLSearchParams(location.search).get("for");
    const segment = location.pathname.split("/").filter(Boolean)[0] || "";
    let raw = named || (/^(embed|jobs?|job_app)$/i.test(segment) ? "" : segment);
    try {
      raw = decodeURIComponent(raw);
    } catch {
      // Leave it as it is.
    }
    return raw.replace(/[-_]+/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  })();

  // The user's own selection beats everything: it is what they pointed at.
  const selection = tidy(String(window.getSelection() || ""));
  const preferSite = isLinkedIn;
  const [first, second] = preferSite ? [fromSite, fromPosting] : [fromPosting, fromSite];

  const description = pick(
    selection.length > 200 && selection,
    first.description,
    second.description,
    blockText(queryOne("main") || queryOne("article") || document.createElement("div")),
    meta("og:description"),
  );

  // Tracking parameters make the same job look different each time.
  const jobUrl = (() => {
    try {
      const current = new URL(location.href);
      const jobId = current.searchParams.get("currentJobId");
      if (isLinkedIn && jobId) {
        return current.origin + "/jobs/view/" + encodeURIComponent(jobId) + "/";
      }
      for (const key of [...current.searchParams.keys()]) {
        if (/^(utm_|trk|trackingid|refid|gh_src|lever-|ref$|src$|source$)/i.test(key)) {
          current.searchParams.delete(key);
        }
      }
      current.hash = "";
      return current.href;
    } catch {
      return location.href.split("#")[0];
    }
  })();

  // og:site_name names the board ("LinkedIn") on aggregators: not a company.
  const siteName = NOISE.test(meta("og:site_name")) ? "" : meta("og:site_name");

  const line = (value, max) => safe(oneLine(value).slice(0, max)).trim();
  return {
    company: line(
      pick(first.company, second.company, siteName, fromTitle.company, fromAddress),
      200,
    ),
    role: line(pick(first.role, second.role, fromTitle.role), 200),
    // LinkedIn appends "· 2 days ago · 40 applicants" to the place.
    location: line(
      pick(first.location, second.location, fromTitle.location).split(/\s+[·•]\s+/)[0],
      200,
    ),
    url: safe(jobUrl.slice(0, 2000)),
    jobDescription: safe(tidy(description).slice(0, 30000)).trim(),
  };
})();
