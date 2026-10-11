/**
 * Deterministic DOM extraction utilities for job boards and career pages.
 */

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function safe(value: string): string {
  return (value || "").replace(LONE_SURROGATE, "");
}

export function tidy(value: unknown): string {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[​‌‍﻿]/g, "")
    .replace(/[   ]/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function oneLine(value: unknown): string {
  return tidy(value).replace(/\s+/g, " ");
}

export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

export function decodeHtml(value: unknown): string {
  const text = String(value || "");
  return /&(#\d+|#x[\da-f]+|[a-z]+);/i.test(text)
    ? parseHtml(text).documentElement.textContent || text
    : text;
}

const SKIP_TAGS = /^(script|style|noscript|svg|template|button|iframe|select)$/i;
const LINE_TAGS = /^(div|section|article|tr|header|footer|main|aside|figure|dl|dt|dd|br)$/i;
const PARAGRAPH_TAGS = /^(p|ul|ol|h[1-6]|blockquote|table|pre)$/i;

const LINE_BREAK = "\u0001";
const PARAGRAPH_BREAK = "\u0002";

function walkNodes(node: Node, out: string[]) {
  if (node.nodeType === 3) {
    out.push((node.nodeValue || "").replace(/\s+/g, " "));
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as HTMLElement;
  if (el.hidden || SKIP_TAGS.test(el.tagName)) return;

  const tag = el.tagName;
  const isItem = /^li$/i.test(tag);
  const edge = PARAGRAPH_TAGS.test(tag)
    ? PARAGRAPH_BREAK
    : isItem || LINE_TAGS.test(tag)
      ? LINE_BREAK
      : "";

  out.push(edge);
  if (isItem) out.push("• ");
  for (let i = 0; i < el.childNodes.length; i++) {
    walkNodes(el.childNodes[i], out);
  }
  out.push(edge);
}

export function blockText(root: Element): string {
  const out: string[] = [];
  walkNodes(root, out);
  return tidy(
    out
      .join("")
      .replace(
        /[\u0001\u0002 \t]*[\u0001\u0002][\u0001\u0002 \t]*/g,
        (run) => (run.includes(PARAGRAPH_BREAK) ? "\n\n" : "\n"),
      ),
  );
}

export function htmlToText(value: unknown): string {
  let source = String(value || "");
  if (!/<[a-z!/]/i.test(source) && /&lt;[a-z/]/i.test(source)) {
    source = decodeHtml(source);
  }
  if (!/<[a-z!/]/i.test(source)) return tidy(decodeHtml(source));
  return blockText(parseHtml(source).body);
}

export function queryOne(selector: string, root?: Document | Element): Element | null {
  try {
    return (root || document).querySelector(selector);
  } catch {
    return null;
  }
}

export function firstLine(selectors: string[], root?: Document | Element): string {
  for (const selector of selectors) {
    const node = queryOne(selector, root);
    const value = node ? oneLine(blockText(node)) : "";
    if (value) return value;
  }
  return "";
}

export function firstBlock(
  selectors: string[],
  root?: Document | Element,
  minLength = 80,
): string {
  let best = "";
  for (const selector of selectors) {
    const node = queryOne(selector, root);
    const value = node ? blockText(node) : "";
    if (value.length >= minLength) return value;
    if (value.length > best.length) best = value;
  }
  return best;
}

export function meta(name: string, doc?: Document): string {
  const root = doc || document;
  const node =
    queryOne('meta[property="' + name + '"]', root) ||
    queryOne('meta[name="' + name + '"]', root);
  return oneLine(decodeHtml(node ? node.getAttribute("content") : ""));
}

export function cleanJobUrl(rawUrl: string, isLinkedIn = false): string {
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

export const NOISE_WORDS =
  /^(linkedin|indeed|glassdoor|greenhouse|lever|ashby|workable|careers?|jobs?|job application|apply( now)?|home)$/i;

export function parseTitle(
  raw: string,
  knownRole: string,
  isLinkedIn = false,
  isLever = false,
): { company: string; role: string; location: string } {
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
    .filter((part) => part && !NOISE_WORDS.test(part));
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
}
