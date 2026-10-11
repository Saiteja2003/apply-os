"use strict";
(() => {
  // extension/src/autofill/dom-events.ts
  function setNativeInputValue(element, value) {
    if (!element || !value) return false;
    try {
      element.focus();
      const prototype = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value") || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
      } else {
        element.value = value;
      }
      element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
      highlightFilled(element);
      return true;
    } catch (err) {
      console.warn("Could not set input value natively:", err);
      return false;
    }
  }
  function setNativeSelectValue(select, matchPredicate) {
    if (!select) return false;
    try {
      select.focus();
      let found = false;
      for (let i = 0; i < select.options.length; i++) {
        const opt = select.options[i];
        if (matchPredicate(opt.text.trim().toLowerCase(), opt.value.toLowerCase())) {
          select.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (found) {
        select.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
        select.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
        select.dispatchEvent(new Event("blur", { bubbles: true }));
        highlightFilled(select);
        return true;
      }
      return false;
    } catch (err) {
      console.warn("Could not select value natively:", err);
      return false;
    }
  }
  function clickNativeRadio(radio) {
    if (!radio) return false;
    try {
      radio.focus();
      radio.checked = true;
      radio.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      radio.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      radio.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      radio.dispatchEvent(new Event("blur", { bubbles: true }));
      const label = radio.closest("label") || radio.parentElement;
      if (label) {
        highlightFilled(label);
      } else {
        highlightFilled(radio);
      }
      return true;
    } catch (err) {
      console.warn("Could not click radio natively:", err);
      return false;
    }
  }
  function highlightFilled(el) {
    try {
      el.style.outline = "2px solid rgba(16, 185, 129, 0.85)";
      el.style.outlineOffset = "2px";
      el.style.transition = "outline 200ms ease-out";
    } catch {
    }
  }
  function highlightAmber(el, promptName) {
    try {
      el.style.outline = "2px solid rgba(245, 158, 11, 0.9)";
      el.style.outlineOffset = "2px";
      el.style.transition = "outline 200ms ease-out";
      el.setAttribute(
        "title",
        promptName ? `ApplyOS Review: Custom question (${promptName}) requires manual candidate confirmation.` : "ApplyOS Review: Please review and complete this custom question before submitting."
      );
    } catch {
    }
  }

  // extension/src/autofill/mappings.ts
  var PORTAL_MAPS = [
    // 1. Greenhouse
    {
      portal: "greenhouse",
      matches: (_url, doc) => location.hostname.includes("greenhouse.io") || doc.querySelector("#grnhse_app") !== null || doc.querySelector("#application_form") !== null,
      fields: {
        firstName: [
          "#first_name",
          'input[name*="first_name" i]',
          'input[autocomplete="given-name"]'
        ],
        lastName: [
          "#last_name",
          'input[name*="last_name" i]',
          'input[autocomplete="family-name"]'
        ],
        fullName: ['input[name="full_name" i]', 'input[autocomplete="name"]'],
        email: [
          "#email",
          'input[name*="email" i]',
          'input[type="email"]',
          'input[autocomplete="email"]'
        ],
        phone: [
          "#phone",
          'input[name*="phone" i]',
          'input[type="tel"]',
          'input[autocomplete="tel"]'
        ],
        location: [
          "#location",
          'input[name*="location" i]',
          'input[name*="candidate[location]" i]'
        ],
        linkedIn: [
          'input[id*="job_application_answers_attributes"][id*="linkedin" i]',
          'input[name*="answers_attributes"][name*="linkedin" i]',
          'input[autocomplete*="linkedin" i]',
          'input[placeholder*="linkedin.com" i]',
          'input[name*="linkedin" i]'
        ],
        gitHub: [
          'input[id*="job_application_answers_attributes"][id*="github" i]',
          'input[name*="answers_attributes"][name*="github" i]',
          'input[placeholder*="github.com" i]',
          'input[name*="github" i]'
        ],
        portfolio: [
          'input[id*="job_application_answers_attributes"][id*="website" i]',
          'input[id*="job_application_answers_attributes"][id*="portfolio" i]',
          'input[name*="answers_attributes"][name*="website" i]',
          'input[name*="answers_attributes"][name*="portfolio" i]',
          'input[name*="website" i]',
          'input[name*="portfolio" i]'
        ]
      }
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
          'input[placeholder*="linkedin.com" i]'
        ],
        gitHub: [
          'input[name="urls[GitHub]"]',
          'input[name*="github" i]',
          'input[placeholder*="github.com" i]'
        ],
        portfolio: [
          'input[name="urls[Portfolio]"]',
          'input[name="urls[Other]"]',
          'input[name*="portfolio" i]',
          'input[name*="website" i]'
        ]
      }
    },
    // 3. Ashby
    {
      portal: "ashby",
      matches: (_url, doc) => location.hostname.includes("ashbyhq.com") || doc.querySelector("#ashby-job-posting-app") !== null || doc.querySelector('[class*="ashby" i]') !== null,
      fields: {
        firstName: [
          'input[name="_system_field_first_name"]',
          'input[name*="firstName" i]',
          'input[name*="first_name" i]'
        ],
        lastName: [
          'input[name="_system_field_last_name"]',
          'input[name*="lastName" i]',
          'input[name*="last_name" i]'
        ],
        fullName: [
          'input[name="_system_field_name"]',
          'input[name="name"]',
          'input[name*="fullName" i]'
        ],
        email: [
          'input[name="_system_field_email"]',
          'input[name*="email" i]',
          'input[type="email"]'
        ],
        phone: [
          'input[name="_system_field_phone"]',
          'input[name*="phone" i]',
          'input[type="tel"]'
        ],
        location: [
          'input[name="_system_field_location"]',
          'input[name*="location" i]'
        ],
        linkedIn: ['input[name*="linkedin" i]', 'input[id*="linkedin" i]'],
        gitHub: ['input[name*="github" i]', 'input[id*="github" i]'],
        portfolio: [
          'input[name*="website" i]',
          'input[name*="portfolio" i]',
          'input[id*="website" i]',
          'input[id*="portfolio" i]'
        ]
      }
    },
    // 4. LinkedIn Easy Apply
    {
      portal: "linkedin",
      matches: (_url, doc) => location.hostname.includes("linkedin.com") && (doc.querySelector(".jobs-easy-apply-modal") !== null || doc.querySelector(".jobs-apply-form") !== null || doc.querySelector('[data-view-name*="easy-apply" i]') !== null),
      scopeSelector: ".jobs-easy-apply-modal, .jobs-apply-form, .artdeco-modal",
      fields: {
        firstName: ['input[id*="firstName" i]', 'input[name*="firstName" i]'],
        lastName: ['input[id*="lastName" i]', 'input[name*="lastName" i]'],
        fullName: ['input[id*="name" i]:not([id*="first" i]):not([id*="last" i])'],
        email: [
          'input[id*="email" i]',
          'input[name*="email" i]',
          'input[type="email"]'
        ],
        phone: [
          'input[id*="phoneNumber" i]',
          'input[name*="phoneNumber" i]',
          'input[type="tel"]'
        ],
        location: [
          'input[id*="location" i]',
          'input[name*="location" i]',
          'input[id*="city" i]'
        ],
        linkedIn: ['input[id*="linkedin" i]'],
        gitHub: ['input[id*="github" i]'],
        portfolio: ['input[id*="website" i]', 'input[id*="portfolio" i]']
      }
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
          'input[id*="firstName" i]'
        ],
        lastName: [
          'input[autocomplete="family-name"]',
          'input[name*="last_name" i]',
          'input[name*="lastName" i]',
          'input[id*="last_name" i]',
          'input[id*="lastName" i]'
        ],
        fullName: [
          'input[autocomplete="name"]',
          'input[name="name" i]',
          'input[name*="fullName" i]',
          'input[id*="fullName" i]'
        ],
        email: [
          'input[type="email"]',
          'input[autocomplete="email"]',
          'input[name*="email" i]',
          'input[id*="email" i]'
        ],
        phone: [
          'input[type="tel"]',
          'input[autocomplete="tel"]',
          'input[name*="phone" i]',
          'input[id*="phone" i]'
        ],
        location: [
          'input[autocomplete="address-level2"]',
          'input[name*="location" i]',
          'input[id*="location" i]',
          'input[name*="city" i]'
        ],
        linkedIn: [
          'input[name*="linkedin" i]',
          'input[id*="linkedin" i]',
          'input[placeholder*="linkedin.com" i]'
        ],
        gitHub: [
          'input[name*="github" i]',
          'input[id*="github" i]',
          'input[placeholder*="github.com" i]'
        ],
        portfolio: [
          'input[name*="portfolio" i]',
          'input[name*="website" i]',
          'input[id*="portfolio" i]',
          'input[id*="website" i]'
        ]
      }
    }
  ];

  // extension/src/autofill/filler.ts
  function queryFirst(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch {
      }
    }
    return null;
  }
  function getFieldLabelText(el) {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl && lbl.textContent) return lbl.textContent.trim();
    }
    const parentLabel = el.closest("label");
    if (parentLabel && parentLabel.textContent) {
      return parentLabel.textContent.trim();
    }
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();
    return el.getAttribute("placeholder") || el.getAttribute("name") || "";
  }
  function fillWorkAuthorization(scope, profile) {
    let filled = 0;
    const questions = scope.querySelectorAll(
      "fieldset, .application-question, .custom-question, .jobs-easy-apply-form-section__grouping, div[data-test-form-builder-field]"
    );
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const text = (q.textContent || "").toLowerCase();
      if ((text.includes("authorized") || text.includes("legally")) && (text.includes("work") || text.includes("employment"))) {
        const radios = q.querySelectorAll('input[type="radio"]');
        if (radios.length >= 2) {
          for (let r = 0; r < radios.length; r++) {
            const radio = radios[r];
            const label = (radio.closest("label")?.textContent || radio.parentElement?.textContent || radio.value || "").toLowerCase();
            const isYes = label.includes("yes") || radio.value === "yes" || radio.value === "1";
            const isNo = label.includes("no") || radio.value === "no" || radio.value === "0";
            if (profile.legallyAuthorized ? isYes : isNo) {
              if (!radio.checked && clickNativeRadio(radio)) filled++;
              break;
            }
          }
        }
        const select = q.querySelector("select");
        if (select) {
          if (setNativeSelectValue(
            select,
            (optText, optVal) => profile.legallyAuthorized ? optText.includes("yes") || optVal.includes("yes") : optText.includes("no") || optVal.includes("no")
          )) {
            filled++;
          }
        }
      }
      if (text.includes("sponsorship") || text.includes("sponsor") || text.includes("visa") && text.includes("require")) {
        const radios = q.querySelectorAll('input[type="radio"]');
        if (radios.length >= 2) {
          for (let r = 0; r < radios.length; r++) {
            const radio = radios[r];
            const label = (radio.closest("label")?.textContent || radio.parentElement?.textContent || radio.value || "").toLowerCase();
            const isYes = label.includes("yes") || radio.value === "yes" || radio.value === "1";
            const isNo = label.includes("no") || radio.value === "no" || radio.value === "0";
            if (profile.requiresSponsorship ? isYes : isNo) {
              if (!radio.checked && clickNativeRadio(radio)) filled++;
              break;
            }
          }
        }
        const select = q.querySelector("select");
        if (select) {
          if (setNativeSelectValue(
            select,
            (optText, optVal) => profile.requiresSponsorship ? optText.includes("yes") || optVal.includes("yes") : optText.includes("no") || optVal.includes("no")
          )) {
            filled++;
          }
        }
      }
    }
    return filled;
  }
  function fillEeoDemographics(scope, _profile) {
    let filled = 0;
    const eeoSelects = scope.querySelectorAll(
      'select[id*="gender" i], select[name*="gender" i], select[id*="race" i], select[name*="race" i], select[name*="ethnicity" i], select[id*="veteran" i], select[name*="veteran" i], select[id*="disability" i], select[name*="disability" i]'
    );
    for (let i = 0; i < eeoSelects.length; i++) {
      const sel = eeoSelects[i];
      const ok = setNativeSelectValue(
        sel,
        (text, val) => text.includes("decline") || text.includes("prefer not") || text.includes("do not wish") || text.includes("not to say") || val.includes("decline")
      );
      if (ok) filled++;
    }
    return filled;
  }
  function autofillActiveJobForm(profile, doc = document) {
    let matchedPortalMap = PORTAL_MAPS[PORTAL_MAPS.length - 1];
    for (const map of PORTAL_MAPS) {
      if (map.matches(window.location.href, doc)) {
        matchedPortalMap = map;
        break;
      }
    }
    const portal = matchedPortalMap.portal;
    let scope = doc;
    if (matchedPortalMap.scopeSelector) {
      const scopedEl = doc.querySelector(matchedPortalMap.scopeSelector);
      if (scopedEl) scope = scopedEl;
    }
    let filledCount = 0;
    const touchedElements = /* @__PURE__ */ new Set();
    const fields = matchedPortalMap.fields;
    let nameFilled = false;
    const firstNameEl = queryFirst(fields.firstName, scope);
    if (firstNameEl && profile.firstName) {
      if (setNativeInputValue(firstNameEl, profile.firstName)) {
        filledCount++;
        touchedElements.add(firstNameEl);
        nameFilled = true;
      }
    }
    const lastNameEl = queryFirst(fields.lastName, scope);
    if (lastNameEl && profile.lastName) {
      if (setNativeInputValue(lastNameEl, profile.lastName)) {
        filledCount++;
        touchedElements.add(lastNameEl);
        nameFilled = true;
      }
    }
    if (!nameFilled) {
      const fullNameEl = queryFirst(fields.fullName, scope);
      if (fullNameEl && profile.fullName) {
        if (setNativeInputValue(fullNameEl, profile.fullName)) {
          filledCount++;
          touchedElements.add(fullNameEl);
        }
      }
    }
    const emailEl = queryFirst(fields.email, scope);
    if (emailEl && profile.email) {
      if (setNativeInputValue(emailEl, profile.email)) {
        filledCount++;
        touchedElements.add(emailEl);
      }
    }
    const phoneEl = queryFirst(fields.phone, scope);
    if (phoneEl && profile.phone) {
      if (setNativeInputValue(phoneEl, profile.phone)) {
        filledCount++;
        touchedElements.add(phoneEl);
      }
    }
    const locEl = queryFirst(fields.location, scope);
    if (locEl && profile.location) {
      if (setNativeInputValue(locEl, profile.location)) {
        filledCount++;
        touchedElements.add(locEl);
      }
    }
    const linkedInEl = queryFirst(fields.linkedIn, scope);
    if (linkedInEl && profile.linkedInUrl) {
      if (setNativeInputValue(linkedInEl, profile.linkedInUrl)) {
        filledCount++;
        touchedElements.add(linkedInEl);
      }
    }
    const gitHubEl = queryFirst(fields.gitHub, scope);
    if (gitHubEl && profile.gitHubUrl) {
      if (setNativeInputValue(gitHubEl, profile.gitHubUrl)) {
        filledCount++;
        touchedElements.add(gitHubEl);
      }
    }
    const portfolioEl = queryFirst(fields.portfolio, scope);
    if (portfolioEl && profile.portfolioUrl) {
      if (setNativeInputValue(portfolioEl, profile.portfolioUrl)) {
        filledCount++;
        touchedElements.add(portfolioEl);
      }
    }
    filledCount += fillWorkAuthorization(scope, profile);
    filledCount += fillEeoDemographics(scope, profile);
    const allInputs = scope.querySelectorAll("input, textarea, select");
    const unhandledFields = [];
    for (let i = 0; i < allInputs.length; i++) {
      const input = allInputs[i];
      if (touchedElements.has(input)) continue;
      if (input instanceof HTMLInputElement) {
        if (/^(hidden|submit|button|reset|image|file)$/i.test(input.type)) continue;
      }
      if (input.offsetParent === null && input.getClientRects().length === 0) continue;
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
      unhandledFields
    };
  }
  (() => {
    try {
      const w = window;
      const profile = w.__applyos_candidate_profile || {
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
        legallyAuthorized: true
      };
      const result = autofillActiveJobForm(profile);
      w.__applyos_last_autofill = result;
      return result;
    } catch (err) {
      console.error("ApplyOS Autofill failed:", err);
      return null;
    }
  })();
  return (window && window.__applyos_last_autofill) || null;
})();
