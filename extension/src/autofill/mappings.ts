import type { PortalType } from "./types";

export interface FieldMapping {
  key: string;
  selectors: string[];
  type?: "text" | "select" | "radio_group";
}

export interface PortalFormMap {
  portal: PortalType;
  matches: (url: string, doc: Document) => boolean;
  scopeSelector?: string;
  fields: {
    firstName: string[];
    lastName: string[];
    fullName: string[];
    email: string[];
    phone: string[];
    location: string[];
    linkedIn: string[];
    gitHub: string[];
    portfolio: string[];
  };
}

export const PORTAL_MAPS: PortalFormMap[] = [
  // 1. Greenhouse
  {
    portal: "greenhouse",
    matches: (_url, doc) =>
      location.hostname.includes("greenhouse.io") ||
      doc.querySelector("#grnhse_app") !== null ||
      doc.querySelector("#application_form") !== null,
    fields: {
      firstName: [
        "#first_name",
        'input[name*="first_name" i]',
        'input[autocomplete="given-name"]',
      ],
      lastName: [
        "#last_name",
        'input[name*="last_name" i]',
        'input[autocomplete="family-name"]',
      ],
      fullName: ['input[name="full_name" i]', 'input[autocomplete="name"]'],
      email: [
        "#email",
        'input[name*="email" i]',
        'input[type="email"]',
        'input[autocomplete="email"]',
      ],
      phone: [
        "#phone",
        'input[name*="phone" i]',
        'input[type="tel"]',
        'input[autocomplete="tel"]',
      ],
      location: [
        "#location",
        'input[name*="location" i]',
        'input[name*="candidate[location]" i]',
      ],
      linkedIn: [
        'input[id*="job_application_answers_attributes"][id*="linkedin" i]',
        'input[name*="answers_attributes"][name*="linkedin" i]',
        'input[autocomplete*="linkedin" i]',
        'input[placeholder*="linkedin.com" i]',
        'input[name*="linkedin" i]',
      ],
      gitHub: [
        'input[id*="job_application_answers_attributes"][id*="github" i]',
        'input[name*="answers_attributes"][name*="github" i]',
        'input[placeholder*="github.com" i]',
        'input[name*="github" i]',
      ],
      portfolio: [
        'input[id*="job_application_answers_attributes"][id*="website" i]',
        'input[id*="job_application_answers_attributes"][id*="portfolio" i]',
        'input[name*="answers_attributes"][name*="website" i]',
        'input[name*="answers_attributes"][name*="portfolio" i]',
        'input[name*="website" i]',
        'input[name*="portfolio" i]',
      ],
    },
  },

  // 2. Lever
  {
    portal: "lever",
    matches: (_url, _doc) => location.hostname.includes("lever.co"),
    fields: {
      firstName: ['input[name="first_name" i]'],
      lastName: ['input[name="last_name" i]'],
      fullName: ['input[name="name"]', 'input[name="full_name" i]'],
      email: ['input[name="email"]', 'input[type="email"]'],
      phone: ['input[name="phone"]', 'input[type="tel"]'],
      location: ['input[name="location" i]'],
      linkedIn: [
        'input[name="urls[LinkedIn]"]',
        'input[name*="linkedin" i]',
        'input[placeholder*="linkedin.com" i]',
      ],
      gitHub: [
        'input[name="urls[GitHub]"]',
        'input[name*="github" i]',
        'input[placeholder*="github.com" i]',
      ],
      portfolio: [
        'input[name="urls[Portfolio]"]',
        'input[name="urls[Other]"]',
        'input[name*="portfolio" i]',
        'input[name*="website" i]',
      ],
    },
  },

  // 3. Ashby
  {
    portal: "ashby",
    matches: (_url, doc) =>
      location.hostname.includes("ashbyhq.com") ||
      doc.querySelector("#ashby-job-posting-app") !== null ||
      doc.querySelector('[class*="ashby" i]') !== null,
    fields: {
      firstName: [
        'input[name="_system_field_first_name"]',
        'input[name*="firstName" i]',
        'input[name*="first_name" i]',
      ],
      lastName: [
        'input[name="_system_field_last_name"]',
        'input[name*="lastName" i]',
        'input[name*="last_name" i]',
      ],
      fullName: [
        'input[name="_system_field_name"]',
        'input[name="name"]',
        'input[name*="fullName" i]',
      ],
      email: [
        'input[name="_system_field_email"]',
        'input[name*="email" i]',
        'input[type="email"]',
      ],
      phone: [
        'input[name="_system_field_phone"]',
        'input[name*="phone" i]',
        'input[type="tel"]',
      ],
      location: [
        'input[name="_system_field_location"]',
        'input[name*="location" i]',
      ],
      linkedIn: ['input[name*="linkedin" i]', 'input[id*="linkedin" i]'],
      gitHub: ['input[name*="github" i]', 'input[id*="github" i]'],
      portfolio: [
        'input[name*="website" i]',
        'input[name*="portfolio" i]',
        'input[id*="website" i]',
        'input[id*="portfolio" i]',
      ],
    },
  },

  // 4. LinkedIn Easy Apply
  {
    portal: "linkedin",
    matches: (_url, doc) =>
      location.hostname.includes("linkedin.com") &&
      (doc.querySelector(".jobs-easy-apply-modal") !== null ||
        doc.querySelector(".jobs-apply-form") !== null ||
        doc.querySelector('[data-view-name*="easy-apply" i]') !== null),
    scopeSelector: ".jobs-easy-apply-modal, .jobs-apply-form, .artdeco-modal",
    fields: {
      firstName: ['input[id*="firstName" i]', 'input[name*="firstName" i]'],
      lastName: ['input[id*="lastName" i]', 'input[name*="lastName" i]'],
      fullName: ['input[id*="name" i]:not([id*="first" i]):not([id*="last" i])'],
      email: [
        'input[id*="email" i]',
        'input[name*="email" i]',
        'input[type="email"]',
      ],
      phone: [
        'input[id*="phoneNumber" i]',
        'input[name*="phoneNumber" i]',
        'input[type="tel"]',
      ],
      location: [
        'input[id*="location" i]',
        'input[name*="location" i]',
        'input[id*="city" i]',
      ],
      linkedIn: ['input[id*="linkedin" i]'],
      gitHub: ['input[id*="github" i]'],
      portfolio: ['input[id*="website" i]', 'input[id*="portfolio" i]'],
    },
  },

  // 5. Generic Form Fallback
  {
    portal: "generic",
    matches: () => true,
    fields: {
      firstName: [
        'input[autocomplete="given-name"]',
        'input[name*="first_name" i]',
        'input[name*="firstName" i]',
        'input[id*="first_name" i]',
        'input[id*="firstName" i]',
      ],
      lastName: [
        'input[autocomplete="family-name"]',
        'input[name*="last_name" i]',
        'input[name*="lastName" i]',
        'input[id*="last_name" i]',
        'input[id*="lastName" i]',
      ],
      fullName: [
        'input[autocomplete="name"]',
        'input[name="name" i]',
        'input[name*="fullName" i]',
        'input[id*="fullName" i]',
      ],
      email: [
        'input[type="email"]',
        'input[autocomplete="email"]',
        'input[name*="email" i]',
        'input[id*="email" i]',
      ],
      phone: [
        'input[type="tel"]',
        'input[autocomplete="tel"]',
        'input[name*="phone" i]',
        'input[id*="phone" i]',
      ],
      location: [
        'input[autocomplete="address-level2"]',
        'input[name*="location" i]',
        'input[id*="location" i]',
        'input[name*="city" i]',
      ],
      linkedIn: [
        'input[name*="linkedin" i]',
        'input[id*="linkedin" i]',
        'input[placeholder*="linkedin.com" i]',
      ],
      gitHub: [
        'input[name*="github" i]',
        'input[id*="github" i]',
        'input[placeholder*="github.com" i]',
      ],
      portfolio: [
        'input[name*="portfolio" i]',
        'input[name*="website" i]',
        'input[id*="portfolio" i]',
        'input[id*="website" i]',
      ],
    },
  },
];
