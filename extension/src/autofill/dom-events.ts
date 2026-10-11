/**
 * Native DOM input event simulation & styling helpers for React/Vue forms.
 */

export function setNativeInputValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): boolean {
  if (!element || !value) return false;

  try {
    element.focus();

    // In React 16+, setting element.value directly bypasses synthetic onChange listeners.
    // We access the original prototype setter to ensure React state updates.
    const prototype = Object.getPrototypeOf(element);
    const descriptor =
      Object.getOwnPropertyDescriptor(prototype, "value") ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }

    // Realistic human typing event sequence
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

export function setNativeSelectValue(
  select: HTMLSelectElement,
  matchPredicate: (text: string, value: string) => boolean,
): boolean {
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

export function clickNativeRadio(radio: HTMLInputElement): boolean {
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

export function highlightFilled(el: HTMLElement) {
  try {
    el.style.outline = "2px solid rgba(16, 185, 129, 0.85)";
    el.style.outlineOffset = "2px";
    el.style.transition = "outline 200ms ease-out";
  } catch {
    // Style override fallback
  }
}

export function highlightAmber(el: HTMLElement, promptName?: string) {
  try {
    el.style.outline = "2px solid rgba(245, 158, 11, 0.9)";
    el.style.outlineOffset = "2px";
    el.style.transition = "outline 200ms ease-out";
    el.setAttribute(
      "title",
      promptName
        ? `ApplyOS Review: Custom question (${promptName}) requires manual candidate confirmation.`
        : "ApplyOS Review: Please review and complete this custom question before submitting.",
    );
  } catch {
    // Style override fallback
  }
}
