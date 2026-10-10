/**
 * Reading an inbound recruiter email: which application it is about, and
 * what it is asking for. Deterministic keyword rules, no model call, so the
 * webhook is fast, free and predictable. Pure, so it can be tested alone.
 */

export interface InboundEmail {
  /** Sender address, e.g. `jane@lumenpay.com`. */
  from: string;
  fromName: string | null;
  subject: string;
  text: string;
}

export type EmailIntent = "SCREENING" | "INTERVIEW" | "REJECTION" | "OTHER";

interface Candidate {
  id: string;
  companyName: string;
  jobUrl: string | null;
}

/** Mail providers whose domain says nothing about the employer. */
const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  // Applicant tracking systems send on behalf of many employers.
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "hire.lever.co",
  "ashbyhq.com",
  "workday.com",
  "myworkday.com",
  "smartrecruiters.com",
  "linkedin.com",
]);

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const domainOf = (address: string) =>
  address.trim().toLowerCase().split("@").pop() ?? "";

function hostOf(url: string | null): string {
  try {
    return url ? new URL(url).hostname : "";
  } catch {
    return "";
  }
}

/** `careers.lumenpay.co.uk` -> `lumenpay` (best effort, no public-suffix list). */
function domainLabel(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  const secondLevel = parts[parts.length - 2];
  // co.uk, com.au and similar: the name is one label further left.
  return ["co", "com", "org", "net", "ac"].includes(secondLevel) && parts.length > 2
    ? parts[parts.length - 3]
    : secondLevel;
}

/**
 * The application an email belongs to, or `null` if none or more than one
 * fits. Sender domain is the strongest signal; otherwise the company name
 * has to appear as a whole phrase in the sender name, subject or body.
 */
export function matchApplication<T extends Candidate>(
  applications: T[],
  email: InboundEmail,
): T | null {
  const domain = domainOf(email.from);
  const label = GENERIC_DOMAINS.has(domain) ? "" : squash(domainLabel(domain));

  if (label.length >= 3) {
    const byDomain = applications.filter((application) => {
      const company = squash(application.companyName);
      const urlLabel = squash(domainLabel(hostOf(application.jobUrl)));
      return company === label || company.startsWith(label) || urlLabel === label;
    });
    if (byDomain.length === 1) return byDomain[0];
  }

  const haystack = ` ${[email.fromName ?? "", email.subject, email.text]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")} `;
  const byName = applications.filter((application) => {
    const name = application.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    return name.length >= 3 && haystack.includes(` ${name} `);
  });
  return byName.length === 1 ? byName[0] : null;
}

const REJECTION =
  /\b(unfortunately|regret to inform|not (be )?moving forward|decided not to (proceed|move)|other candidates|will not be proceeding|position has been filled)\b/i;
const SCREENING =
  /\b(phone screen|screening call|recruiter (call|screen)|intro(ductory)? call|initial (call|conversation|chat)|quick (call|chat))\b/i;
const INTERVIEW =
  /\b(interview|technical (round|screen|assessment)|onsite|on-site|virtual loop|hiring manager (call|round)|schedule (a |some )?time|your availability|calendly\.com|book a (time|slot))\b/i;

/** What the email is asking for. Rejections win over scheduling words. */
export function classifyEmail(email: Pick<InboundEmail, "subject" | "text">): EmailIntent {
  const content = `${email.subject}\n${email.text}`;
  if (REJECTION.test(content)) return "REJECTION";
  if (SCREENING.test(content)) return "SCREENING";
  if (INTERVIEW.test(content)) return "INTERVIEW";
  return "OTHER";
}
