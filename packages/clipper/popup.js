"use strict";
(() => {
  // extension/src/popup/popup.ts
  var DEFAULT_APP_URL = "http://localhost:3000";
  var $ = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };
  var connectionPill = $("connectionPill");
  var connectionText = $("connectionText");
  var sourceBadge = $("sourceBadge");
  var roleInput = $("role");
  var companyInput = $("company");
  var locationInput = $("location");
  var telemetryBox = $("telemetryBox");
  var telemetryIcon = $("telemetryIcon");
  var telemetryText = $("telemetryText");
  var telemetryBadge = $("telemetryBadge");
  var modelSelect = $("model");
  var autoTailorCheckbox = $("autoTailor");
  var appliedCheckbox = $("applied");
  var clipBtn = $("clipBtn");
  var btnSpinner = $("btnSpinner");
  var btnText = $("btnText");
  var autofillBtn = $("autofillBtn");
  var autofillSpinner = $("autofillSpinner");
  var autofillBtnText = $("autofillBtnText");
  var statusAlert = $("statusAlert");
  var statusMessage = $("statusMessage");
  var actionLinks = $("actionLinks");
  var pipelineLink = $("pipelineLink");
  var appUrlInput = $("appUrl");
  var testBtn = $("testBtn");
  var currentJob = null;
  function getAppOrigin() {
    const input = appUrlInput.value.trim() || DEFAULT_APP_URL;
    try {
      return new URL(input).origin;
    } catch {
      return DEFAULT_APP_URL;
    }
  }
  function setConnectionStatus(status, text) {
    connectionPill.className = `connection-pill ${status}`;
    connectionText.textContent = text;
  }
  function showAlert(type, message, links) {
    statusAlert.className = `status-alert ${type}`;
    statusMessage.textContent = message;
    statusAlert.classList.remove("hidden");
    if (links && links.dashboard) {
      pipelineLink.href = links.dashboard;
      actionLinks.classList.remove("hidden");
    } else {
      actionLinks.classList.add("hidden");
    }
  }
  function clearAlert() {
    statusAlert.classList.add("hidden");
    statusMessage.textContent = "";
    actionLinks.classList.add("hidden");
  }
  async function checkHostConnection(origin) {
    setConnectionStatus("checking", "Connecting...");
    try {
      const res = await fetch(`${origin}/api/ingest`, {
        method: "OPTIONS",
        credentials: "include"
      });
      if (res.ok || res.status === 204) {
        setConnectionStatus("online", "Connected");
      } else if (res.status === 401) {
        setConnectionStatus("offline", "Auth Required");
      } else {
        setConnectionStatus("online", "Online");
      }
    } catch {
      setConnectionStatus("offline", "Unreachable");
    }
  }
  async function syncCandidateProfile(origin) {
    try {
      const res = await fetch(`${origin}/api/profile/autofill-data`, {
        method: "GET",
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.profile) {
          await chrome.storage.local.set({ candidateProfile: data.profile });
          return data.profile;
        }
      }
    } catch {
    }
    const cached = await chrome.storage.local.get("candidateProfile");
    return cached.candidateProfile || null;
  }
  async function loadSettings() {
    try {
      const saved = await chrome.storage.sync.get(["appUrl", "model", "autoTailor"]);
      appUrlInput.value = saved.appUrl || DEFAULT_APP_URL;
      modelSelect.value = saved.model || "";
      autoTailorCheckbox.checked = saved.autoTailor !== false;
    } catch {
      appUrlInput.value = DEFAULT_APP_URL;
    }
  }
  async function saveSettings() {
    try {
      await chrome.storage.sync.set({
        appUrl: getAppOrigin(),
        model: modelSelect.value,
        autoTailor: autoTailorCheckbox.checked
      });
    } catch {
    }
  }
  async function inspectActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !/^https?:/.test(tab.url || "")) {
      sourceBadge.textContent = "Unsupported";
      telemetryIcon.textContent = "\u26A0\uFE0F";
      telemetryText.textContent = "Open a valid job posting tab.";
      clipBtn.disabled = true;
      return;
    }
    telemetryIcon.textContent = "\u23F3";
    telemetryText.textContent = "Extracting job details...";
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["extract.js"]
      });
      currentJob = injection && injection.result || null;
    } catch (err) {
      sourceBadge.textContent = "Restricted";
      telemetryIcon.textContent = "\u26A0\uFE0F";
      telemetryText.textContent = "Browser security prohibits script injection here.";
      clipBtn.disabled = true;
      return;
    }
    if (!currentJob || typeof currentJob.description !== "string") {
      currentJob = null;
      sourceBadge.textContent = "Unknown";
      telemetryIcon.textContent = "\u26A0\uFE0F";
      telemetryText.textContent = "No job posting detected.";
      clipBtn.disabled = true;
      return;
    }
    roleInput.value = currentJob.roleTitle || currentJob.role || "";
    companyInput.value = currentJob.companyName || currentJob.company || "";
    locationInput.value = currentJob.location || "";
    sourceBadge.textContent = currentJob.source || "Detected";
    const charLength = currentJob.description.length;
    if (charLength >= 80) {
      telemetryIcon.textContent = "\u2713";
      telemetryText.textContent = `${charLength.toLocaleString()} characters captured`;
      telemetryBadge.classList.remove("hidden");
      clipBtn.disabled = false;
    } else {
      telemetryIcon.textContent = "\u26A0\uFE0F";
      telemetryText.textContent = "Description too short (<80 chars). Highlight text & retry.";
      telemetryBadge.classList.add("hidden");
      clipBtn.disabled = true;
    }
  }
  async function handleClip() {
    if (!currentJob) return;
    const company = companyInput.value.trim();
    const role = roleInput.value.trim();
    const location = locationInput.value.trim();
    if (!company || !role) {
      showAlert("error", "Company and Role Title are required.");
      (company ? roleInput : companyInput).focus();
      return;
    }
    const origin = getAppOrigin();
    try {
      const granted = await chrome.permissions.request({
        origins: [`${origin}/*`]
      });
      if (!granted) {
        showAlert("error", `Permission to connect to ${origin} was denied.`);
        return;
      }
    } catch {
    }
    await saveSettings();
    clearAlert();
    clipBtn.disabled = true;
    btnSpinner.classList.remove("hidden");
    btnText.textContent = "Importing...";
    const payload = {
      company,
      role,
      location,
      url: currentJob.jobUrl || currentJob.url,
      jobDescription: currentJob.description || currentJob.jobDescription,
      autoTailor: autoTailorCheckbox.checked,
      applied: appliedCheckbox.checked,
      modelId: modelSelect.value || null
    };
    try {
      const res = await fetch(`${origin}/api/ingest`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (res.status === 401) {
        showAlert("error", "You are signed out. Please sign in to Honing.");
        setConnectionStatus("offline", "Auth Required");
      } else if (res.status === 403) {
        showAlert("error", "Origin not accepted by Honing (CORS / Extension origin check).");
      } else if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showAlert("error", data.error || `Server responded with HTTP ${res.status}.`);
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = data.tailoring ? "\u2713 Job clipped & background tailoring started!" : "\u2713 Job clipped to your pipeline!";
        showAlert("success", msg, { dashboard: `${origin}/dashboard` });
        btnText.textContent = "Clipped \u2713";
        setConnectionStatus("online", "Connected");
        return;
      }
    } catch (err) {
      showAlert("error", `Could not connect to Honing at ${origin}.`);
      setConnectionStatus("offline", "Unreachable");
    } finally {
      btnSpinner.classList.add("hidden");
      if (btnText.textContent !== "Clipped \u2713") {
        clipBtn.disabled = false;
        btnText.textContent = "Clip & Tailor Application";
      }
    }
  }
  async function handleAutofill() {
    const origin = getAppOrigin();
    autofillBtn.disabled = true;
    autofillSpinner.classList.remove("hidden");
    autofillBtnText.textContent = "Autofilling...";
    clearAlert();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !/^https?:/.test(tab.url || "")) {
      showAlert("error", "Open an active job application form page first.");
      autofillBtn.disabled = false;
      autofillSpinner.classList.add("hidden");
      autofillBtnText.textContent = "Autofill Application Form";
      return;
    }
    let profile = await syncCandidateProfile(origin);
    if (!profile) {
      const cached = await chrome.storage.local.get("candidateProfile");
      profile = cached.candidateProfile || null;
    }
    if (!profile) {
      showAlert(
        "error",
        "No candidate profile found. Sign in to Honing to load your intake data."
      );
      autofillBtn.disabled = false;
      autofillSpinner.classList.add("hidden");
      autofillBtnText.textContent = "Autofill Application Form";
      return;
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (candidateData) => {
          window.__applyos_candidate_profile = candidateData;
        },
        args: [profile]
      });
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["autofill.js"]
      });
      const result = injection && injection.result;
      if (result && result.filledCount > 0) {
        const unhandledMsg = result.unhandledFields.length > 0 ? ` (${result.unhandledFields.length} custom question(s) highlighted in amber)` : "";
        showAlert(
          "success",
          `\u2713 Autofilled ${result.filledCount} fields (${result.portal.toUpperCase()}). Review before submitting${unhandledMsg}.`
        );
        autofillBtnText.textContent = `Autofilled (${result.filledCount}) \u2713`;
      } else if (result && result.unhandledFields.length > 0) {
        showAlert(
          "error",
          `Detected ${result.unhandledFields.length} custom fields (highlighted in amber). Fill them manually.`
        );
        autofillBtnText.textContent = "Autofill Application Form";
      } else {
        showAlert(
          "error",
          "No matching application form inputs detected on this page. Open the application form or Easy Apply modal first."
        );
        autofillBtnText.textContent = "Autofill Application Form";
      }
    } catch (err) {
      showAlert("error", "Failed to inject autofill script into page.");
      autofillBtnText.textContent = "Autofill Application Form";
    } finally {
      autofillSpinner.classList.add("hidden");
      setTimeout(() => {
        autofillBtn.disabled = false;
        if (autofillBtnText.textContent.includes("\u2713")) {
          autofillBtnText.textContent = "Autofill Application Form";
        }
      }, 3500);
    }
  }
  clipBtn.addEventListener("click", handleClip);
  autofillBtn.addEventListener("click", handleAutofill);
  testBtn.addEventListener("click", async () => {
    const origin = getAppOrigin();
    await checkHostConnection(origin);
  });
  appUrlInput.addEventListener("change", () => {
    saveSettings();
    const origin = getAppOrigin();
    checkHostConnection(origin);
    syncCandidateProfile(origin);
  });
  modelSelect.addEventListener("change", saveSettings);
  autoTailorCheckbox.addEventListener("change", saveSettings);
  (async () => {
    await loadSettings();
    const origin = getAppOrigin();
    checkHostConnection(origin);
    syncCandidateProfile(origin);
    await inspectActiveTab();
  })();
})();
