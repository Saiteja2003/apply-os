// Popup for the ApplyOS Clipper. Reads the job from the active tab, then
// posts it to ApplyOS's /api/ingest using the browser's ApplyOS session.

const DEFAULT_APP_URL = "http://localhost:3000";

const $ = (id) => document.getElementById(id);
const fields = {
  company: $("company"),
  role: $("role"),
  model: $("model"),
  autoTailor: $("autoTailor"),
  applied: $("applied"),
  appUrl: $("appUrl"),
};
const importButton = $("import");
const status = $("status");
const captured = $("captured");

let job = null;

function showStatus(kind, message, link) {
  status.className = `status ${kind}`;
  status.textContent = message;
  if (link) {
    status.append(" ");
    const anchor = document.createElement("a");
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = link.label;
    status.append(anchor);
  }
}

const appOrigin = () =>
  new URL(fields.appUrl.value.trim() || DEFAULT_APP_URL).origin;

async function loadSettings() {
  const saved = await chrome.storage.sync.get(["appUrl", "model", "autoTailor"]);
  fields.appUrl.value = saved.appUrl || DEFAULT_APP_URL;
  fields.model.value = saved.model || "";
  fields.autoTailor.checked = saved.autoTailor !== false;
}

async function readPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !/^https?:/.test(tab.url || "")) {
    captured.textContent = "Open a job posting, then click the clipper.";
    return;
  }
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["extract.js"],
    });
    job = injection && injection.result;
  } catch {
    captured.textContent = "This page cannot be read by extensions.";
    return;
  }

  if (!job || typeof job.jobDescription !== "string") {
    job = null;
    captured.textContent = "Could not read a job from this page.";
    return;
  }

  fields.company.value = job.company || "";
  fields.role.value = job.role || "";
  const length = job.jobDescription.length;
  captured.textContent =
    length >= 80
      ? `Captured ${length.toLocaleString()} characters of the job description.`
      : "No job description found. Select the description text on the page and reopen this popup.";
  importButton.disabled = length < 80;
}

async function importJob() {
  if (!job) return;
  if (!fields.company.value.trim() || !fields.role.value.trim()) {
    showStatus("error", "Add the company and the role first.");
    (fields.company.value.trim() ? fields.role : fields.company).focus();
    return;
  }

  let origin;
  try {
    origin = appOrigin();
  } catch {
    showStatus("error", "The ApplyOS address is not a valid URL.");
    return;
  }

  // Ask for access to the ApplyOS origin if it is not the built-in default.
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    showStatus("error", "Permission to reach ApplyOS was not granted.");
    return;
  }
  await chrome.storage.sync.set({
    appUrl: origin,
    model: fields.model.value,
    autoTailor: fields.autoTailor.checked,
  });

  importButton.disabled = true;
  importButton.textContent = "Importing…";
  status.className = "status";
  status.textContent = "";

  try {
    const response = await fetch(`${origin}/api/ingest`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: fields.company.value,
        role: fields.role.value,
        location: job.location,
        url: job.url,
        jobDescription: job.jobDescription,
        autoTailor: fields.autoTailor.checked,
        applied: fields.applied.checked,
        modelId: fields.model.value || null,
      }),
    });

    if (response.status === 403) {
      showStatus("error", "ApplyOS did not accept this extension.");
    } else if (response.status === 401) {
      showStatus("error", "You are not signed in to ApplyOS.", {
        href: `${origin}/login`,
        label: "Sign in",
      });
    } else if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      showStatus("error", body.error || `ApplyOS answered with ${response.status}.`);
    } else {
      const body = await response.json().catch(() => ({}));
      showStatus(
        "ok",
        body.tailoring ? "Imported & Tailoring Initiated!" : "Imported to your pipeline.",
        { href: `${origin}/dashboard`, label: "Open pipeline" },
      );
      importButton.textContent = "Imported";
      return;
    }
  } catch {
    showStatus("error", `Could not reach ApplyOS at ${origin}.`);
  }
  importButton.disabled = false;
  importButton.textContent = "Import to ApplyOS";
}

importButton.addEventListener("click", importJob);
loadSettings().then(readPage);
