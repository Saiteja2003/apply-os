import {
  clickNativeRadio,
  highlightAmber,
  setNativeInputValue,
  setNativeSelectValue,
} from "./dom-events";
import { PORTAL_MAPS, type PortalFormMap } from "./mappings";
import type { AutofillResult, CandidateProfile, PortalType } from "./types";

function queryFirst<T extends HTMLElement>(
  selectors: string[],
  root: Document | Element = document,
): T | null {
  for (const sel of selectors) {
    try {
      const el = root.querySelector<T>(sel);
      if (el) return el;
    } catch {
      // Ignore invalid selector syntax
    }
  }
  return null;
}

function getFieldLabelText(el: HTMLElement): string {
  // Try <label for="id">
  if (el.id) {
    const lbl = document.querySelector(`label[for="${el.id}"]`);
    if (lbl && lbl.textContent) return lbl.textContent.trim();
  }
  // Try parent label
  const parentLabel = el.closest("label");
  if (parentLabel && parentLabel.textContent) {
    return parentLabel.textContent.trim();
  }
  // Try aria-label
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim();
  // Try placeholder or name
  return el.getAttribute("placeholder") || el.getAttribute("name") || "";
}

function fillWorkAuthorization(
  scope: Element | Document,
  profile: CandidateProfile,
): number {
  let filled = 0;

  // Search containers that ask about work auth or sponsorship
  const questions = scope.querySelectorAll(
    "fieldset, .application-question, .custom-question, .jobs-easy-apply-form-section__grouping, div[data-test-form-builder-field]",
  );

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] as HTMLElement;
    const text = (q.textContent || "").toLowerCase();

    // 1. Legally authorized to work
    if (
      (text.includes("authorized") || text.includes("legally")) &&
      (text.includes("work") || text.includes("employment"))
    ) {
      const radios = q.querySelectorAll<HTMLInputElement>('input[type="radio"]');
      if (radios.length >= 2) {
        for (let r = 0; r < radios.length; r++) {
          const radio = radios[r];
          const label = (
            radio.closest("label")?.textContent ||
            radio.parentElement?.textContent ||
            radio.value ||
            ""
          ).toLowerCase();
          const isYes = label.includes("yes") || radio.value === "yes" || radio.value === "1";
          const isNo = label.includes("no") || radio.value === "no" || radio.value === "0";

          if (profile.legallyAuthorized ? isYes : isNo) {
            if (!radio.checked && clickNativeRadio(radio)) filled++;
            break;
          }
        }
      }

      const select = q.querySelector<HTMLSelectElement>("select");
      if (select) {
        if (
          setNativeSelectValue(select, (optText, optVal) =>
            profile.legallyAuthorized
              ? optText.includes("yes") || optVal.includes("yes")
              : optText.includes("no") || optVal.includes("no"),
          )
        ) {
          filled++;
        }
      }
    }

    // 2. Visa sponsorship now or in the future
    if (
      text.includes("sponsorship") ||
      text.includes("sponsor") ||
      (text.includes("visa") && text.includes("require"))
    ) {
      const radios = q.querySelectorAll<HTMLInputElement>('input[type="radio"]');
      if (radios.length >= 2) {
        for (let r = 0; r < radios.length; r++) {
          const radio = radios[r];
          const label = (
            radio.closest("label")?.textContent ||
            radio.parentElement?.textContent ||
            radio.value ||
            ""
          ).toLowerCase();
          const isYes = label.includes("yes") || radio.value === "yes" || radio.value === "1";
          const isNo = label.includes("no") || radio.value === "no" || radio.value === "0";

          if (profile.requiresSponsorship ? isYes : isNo) {
            if (!radio.checked && clickNativeRadio(radio)) filled++;
            break;
          }
        }
      }

      const select = q.querySelector<HTMLSelectElement>("select");
      if (select) {
        if (
          setNativeSelectValue(select, (optText, optVal) =>
            profile.requiresSponsorship
              ? optText.includes("yes") || optVal.includes("yes")
              : optText.includes("no") || optVal.includes("no"),
          )
        ) {
          filled++;
        }
      }
    }
  }

  return filled;
}

function fillEeoDemographics(
  scope: Element | Document,
  _profile: CandidateProfile,
): number {
  let filled = 0;

  const eeoSelects = scope.querySelectorAll<HTMLSelectElement>(
    'select[id*="gender" i], select[name*="gender" i], ' +
      'select[id*="race" i], select[name*="race" i], select[name*="ethnicity" i], ' +
      'select[id*="veteran" i], select[name*="veteran" i], ' +
      'select[id*="disability" i], select[name*="disability" i]',
  );

  for (let i = 0; i < eeoSelects.length; i++) {
    const sel = eeoSelects[i];
    // Default safe choice for automated submission compliance
    const ok = setNativeSelectValue(
      sel,
      (text, val) =>
        text.includes("decline") ||
        text.includes("prefer not") ||
        text.includes("do not wish") ||
        text.includes("not to say") ||
        val.includes("decline"),
    );
    if (ok) filled++;
  }

  return filled;
}

export function autofillActiveJobForm(
  profile: CandidateProfile,
  doc = document,
): AutofillResult {
  let matchedPortalMap: PortalFormMap = PORTAL_MAPS[PORTAL_MAPS.length - 1]; // generic
  for (const map of PORTAL_MAPS) {
    if (map.matches(window.location.href, doc)) {
      matchedPortalMap = map;
      break;
    }
  }

  const portal: PortalType = matchedPortalMap.portal;
  let scope: Element | Document = doc;
  if (matchedPortalMap.scopeSelector) {
    const scopedEl = doc.querySelector(matchedPortalMap.scopeSelector);
    if (scopedEl) scope = scopedEl;
  }

  let filledCount = 0;
  const touchedElements = new Set<HTMLElement>();

  const fields = matchedPortalMap.fields;

  // 1. Names
  let nameFilled = false;
  const firstNameEl = queryFirst<HTMLInputElement>(fields.firstName, scope);
  if (firstNameEl && profile.firstName) {
    if (setNativeInputValue(firstNameEl, profile.firstName)) {
      filledCount++;
      touchedElements.add(firstNameEl);
      nameFilled = true;
    }
  }

  const lastNameEl = queryFirst<HTMLInputElement>(fields.lastName, scope);
  if (lastNameEl && profile.lastName) {
    if (setNativeInputValue(lastNameEl, profile.lastName)) {
      filledCount++;
      touchedElements.add(lastNameEl);
      nameFilled = true;
    }
  }

  if (!nameFilled) {
    const fullNameEl = queryFirst<HTMLInputElement>(fields.fullName, scope);
    if (fullNameEl && profile.fullName) {
      if (setNativeInputValue(fullNameEl, profile.fullName)) {
        filledCount++;
        touchedElements.add(fullNameEl);
      }
    }
  }

  // 2. Email
  const emailEl = queryFirst<HTMLInputElement>(fields.email, scope);
  if (emailEl && profile.email) {
    if (setNativeInputValue(emailEl, profile.email)) {
      filledCount++;
      touchedElements.add(emailEl);
    }
  }

  // 3. Phone
  const phoneEl = queryFirst<HTMLInputElement>(fields.phone, scope);
  if (phoneEl && profile.phone) {
    if (setNativeInputValue(phoneEl, profile.phone)) {
      filledCount++;
      touchedElements.add(phoneEl);
    }
  }

  // 4. Location
  const locEl = queryFirst<HTMLInputElement>(fields.location, scope);
  if (locEl && profile.location) {
    if (setNativeInputValue(locEl, profile.location)) {
      filledCount++;
      touchedElements.add(locEl);
    }
  }

  // 5. Social & Portfolio URLs
  const linkedInEl = queryFirst<HTMLInputElement>(fields.linkedIn, scope);
  if (linkedInEl && profile.linkedInUrl) {
    if (setNativeInputValue(linkedInEl, profile.linkedInUrl)) {
      filledCount++;
      touchedElements.add(linkedInEl);
    }
  }

  const gitHubEl = queryFirst<HTMLInputElement>(fields.gitHub, scope);
  if (gitHubEl && profile.gitHubUrl) {
    if (setNativeInputValue(gitHubEl, profile.gitHubUrl)) {
      filledCount++;
      touchedElements.add(gitHubEl);
    }
  }

  const portfolioEl = queryFirst<HTMLInputElement>(fields.portfolio, scope);
  if (portfolioEl && profile.portfolioUrl) {
    if (setNativeInputValue(portfolioEl, profile.portfolioUrl)) {
      filledCount++;
      touchedElements.add(portfolioEl);
    }
  }

  // 6. Work authorization & Sponsorship
  filledCount += fillWorkAuthorization(scope, profile);

  // 7. EEO standard answers
  filledCount += fillEeoDemographics(scope, profile);

  // 8. Circuit Breaker: Detect and highlight unhandled/custom fields in amber
  const allInputs = scope.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");

  const unhandledFields: string[] = [];

  for (let i = 0; i < allInputs.length; i++) {
    const input = allInputs[i];
    if (touchedElements.has(input)) continue;

    // Skip hidden or non-data inputs
    if (input instanceof HTMLInputElement) {
      if (/^(hidden|submit|button|reset|image|file)$/i.test(input.type)) continue;
    }

    // Skip invisible elements
    if (input.offsetParent === null && input.getClientRects().length === 0) continue;

    // Check if input is empty
    const val = input.value ? input.value.trim() : "";
    if (!val) {
      const labelText = getFieldLabelText(input);
      highlightAmber(input, labelText);
      unhandledFields.push(labelText || input.name || `Field #${i + 1}`);
    }
  }

  return {
    portal,
    filledCount,
    unhandledFields,
  };
}

// Global invocation bridge for chrome.scripting.executeScript
(() => {
  try {
    const w = window as any;
    const profile: CandidateProfile = w.__applyos_candidate_profile || {
      fullName: "Candidate",
      firstName: "Candidate",
      lastName: "",
      email: "",
      phone: "",
      location: "",
      linkedInUrl: "",
      gitHubUrl: "",
      portfolioUrl: "",
      workAuthorization: "CITIZEN",
      requiresSponsorship: false,
      legallyAuthorized: true,
    };
    const result = autofillActiveJobForm(profile);
    w.__applyos_last_autofill = result;
    return result;
  } catch (err) {
    console.error("ApplyOS Autofill failed:", err);
    return null;
  }
})();
