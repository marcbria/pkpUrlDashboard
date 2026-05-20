// ============================================================
// main.js - Entry point and event handlers
// ============================================================

import { journals, loadJournalsFromCSV, loadEndpointsFromJSON, updateProdTestUrls, endpointGroups } from './dataLoader.js';
import { getTestBase, normalizeExternalBase, getFullExternalBase, registerExternalDomain } from './helpers.js';
import { setExternalState, setCurrentErrorOnly, updateActiveFilters, buildTable, applyErrorFilter } from './tableRenderer.js';

let externalBaseUrl = "";
let externalContext = "";
let currentAbortController = null;

// Read mode parameters from URL and apply to checkboxes
function applyModeParamsFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const basicParam = urlParams.get('basic');
  const cleanUrlsParam = urlParams.get('cleanUrls');
  const hideContextParam = urlParams.get('hideContext');
  
  const basicCheckbox = document.getElementById('filterBasic');
  const cleanUrlsCheckbox = document.getElementById('filterCleanUrls');
  const hideContextCheckbox = document.getElementById('filterHideContext');
  
  if (basicParam !== null) {
    basicCheckbox.checked = basicParam === '1';
  } else {
    basicCheckbox.checked = true;
  }
  if (cleanUrlsParam !== null) {
    cleanUrlsCheckbox.checked = cleanUrlsParam === '1';
  } else {
    cleanUrlsCheckbox.checked = false;
  }
  if (hideContextParam !== null) {
    hideContextCheckbox.checked = hideContextParam === '1';
  } else {
    hideContextCheckbox.checked = false;
  }
}

// Get current filter state from checkboxes
function getCurrentFilterState() {
  return {
    basic: document.getElementById('filterBasic').checked,
    cleanUrls: document.getElementById('filterCleanUrls').checked,
    hideContext: document.getElementById('filterHideContext').checked
  };
}

async function runAllTests() {
  if (currentAbortController) {
    currentAbortController.abort();
  }

  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  const runBtn = document.getElementById("runTestsBtn");
  const stopBtn = document.getElementById("stopTestsBtn");
  runBtn.disabled = true;
  stopBtn.disabled = false;
  runBtn.classList.add("disabled");
  stopBtn.classList.add("active");

  document.getElementById("toolbar").style.display = "flex";
  document.getElementById("tableWrapper").style.display = "block";
  document.getElementById("summaryPanel").style.display = "flex";
  
  updateActiveFilters();
  const alias = document.getElementById("journalSelect").value;
  const journal = journals.find(j => j.alias === alias);
  if (!journal) return;
  const prodBase = journal.prodUrl;
  const testBase = getTestBase(alias, prodBase, journal.testUrl);
  const rawExternalBase = document.getElementById("externalBaseUrl").value.trim();
  const context = document.getElementById("externalContext").value.trim();
  const errorDiv = document.getElementById("externalError");
  errorDiv.innerHTML = "";
  let hasExternal = false;
  let externalFullBase = null;

  if (rawExternalBase !== "") {
    const normalized = normalizeExternalBase(rawExternalBase);
    if (normalized === null) {
      errorDiv.innerHTML = "❌ Error: External base must be without protocol (e.g., domain.com)";
    } else if (context === "") {
      errorDiv.innerHTML = "❌ Error: If you add an external base, you must provide a context.";
    } else {
      externalBaseUrl = normalized;
      externalContext = context;
      hasExternal = true;
      externalFullBase = getFullExternalBase(externalBaseUrl);
      const fullUrl = "https://" + externalBaseUrl;
      try {
        const domain = new URL(fullUrl).hostname;
        await registerExternalDomain(domain);
      } catch(e) { errorDiv.innerHTML = "❌ External domain error"; hasExternal = false; }
    }
  } else {
    externalBaseUrl = "";
    externalContext = "";
    hasExternal = false;
  }

  setExternalState(externalBaseUrl, externalContext);

  const filterState = getCurrentFilterState();
  const urlParams = new URLSearchParams();
  urlParams.set('journal', alias);
  urlParams.set('basic', filterState.basic ? '1' : '0');
  urlParams.set('cleanUrls', filterState.cleanUrls ? '1' : '0');
  urlParams.set('hideContext', filterState.hideContext ? '1' : '0');
  if (hasExternal) {
    urlParams.set('external_base_url', externalBaseUrl);
    urlParams.set('external_context', externalContext);
  }
  const currentUrl = `${window.location.pathname}?${urlParams.toString()}`;
  
  const copyBtn = document.getElementById("copyUrlBtn");
  copyBtn.onclick = () => {
    const freshFilterState = getCurrentFilterState();
    const freshUrlParams = new URLSearchParams();
    freshUrlParams.set('journal', document.getElementById("journalSelect").value);
    freshUrlParams.set('basic', freshFilterState.basic ? '1' : '0');
    freshUrlParams.set('cleanUrls', freshFilterState.cleanUrls ? '1' : '0');
    freshUrlParams.set('hideContext', freshFilterState.hideContext ? '1' : '0');
    if (document.getElementById("externalBaseUrl").value.trim() !== "" && document.getElementById("externalContext").value.trim() !== "") {
      freshUrlParams.set('external_base_url', externalBaseUrl);
      freshUrlParams.set('external_context', externalContext);
    }
    const freshUrl = `${window.location.pathname}?${freshUrlParams.toString()}`;
    navigator.clipboard.writeText(window.location.origin + freshUrl)
      .then(() => alert("URL copied to clipboard!"))
      .catch(() => alert("Failed to copy URL"));
  };

  document.getElementById("progressMsg").innerText = "Running tests...";
  try {
    await buildTable(endpointGroups, prodBase, testBase, alias, hasExternal, externalFullBase, signal);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('Tests aborted by user');
      document.getElementById("progressMsg").innerText = "Tests stopped by user.";
    } else {
      console.error(err);
      document.getElementById("progressMsg").innerText = "Error running tests.";
    }
  } finally {
    runBtn.disabled = false;
    stopBtn.disabled = true;
    runBtn.classList.remove("disabled");
    stopBtn.classList.remove("active");
    currentAbortController = null;
  }
}

function resetExternalToDemo() {
  document.getElementById("externalBaseUrl").value = "ojs33.testdrive.publicknowledgeproject.org";
  document.getElementById("externalContext").value = "testdrive-journal";
  document.getElementById("externalError").innerHTML = "";
}

async function initialize() {
  await loadEndpointsFromJSON();
  await loadJournalsFromCSV();
  applyModeParamsFromUrl();
  document.getElementById("progressMsg").innerText = "Ready. Click RUN ALL TESTS to start.";
}

function populateSelectAndStart() {
  const select = document.getElementById("journalSelect");
  select.addEventListener("change", () => {
    updateProdTestUrls();
  });
  document.getElementById("runTestsBtn").addEventListener("click", () => runAllTests());
  document.getElementById("runTestsBtnBottom").addEventListener("click", () => runAllTests());
  document.getElementById("resetExternalBtn").addEventListener("click", () => resetExternalToDemo());
  
  const stopBtn = document.getElementById("stopTestsBtn");
  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      if (currentAbortController) {
        currentAbortController.abort();
      }
    });
  }
  
  const errorBtn = document.getElementById("errorToggleBtn");
  errorBtn.addEventListener("click", () => {
    const newValue = !errorBtn.classList.contains("active");
    setCurrentErrorOnly(newValue);
    errorBtn.classList.toggle("active");
    errorBtn.innerHTML = newValue ? "✔️ Show all rows" : "❗ Show errors only";
    applyErrorFilter();
  });
  initialize();
}

populateSelectAndStart();
