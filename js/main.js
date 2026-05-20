// ============================================================
// main.js - Entry point and event handlers (with abort, no reload)
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
  
  if (basicParam !== null) basicCheckbox.checked = basicParam === '1';
  else basicCheckbox.checked = true;
  if (cleanUrlsParam !== null) cleanUrlsCheckbox.checked = cleanUrlsParam === '1';
  else cleanUrlsCheckbox.checked = false;
  if (hideContextParam !== null) hideContextCheckbox.checked = hideContextParam === '1';
  else hideContextCheckbox.checked = false;
}

// Get current filter state from checkboxes
function getCurrentFilterState() {
  return {
    basic: document.getElementById('filterBasic').checked,
    cleanUrls: document.getElementById('filterCleanUrls').checked,
    hideContext: document.getElementById('filterHideContext').checked
  };
}

// Build current URL with all parameters (for copy button, not for reload)
function getCurrentStateUrl() {
  const alias = document.getElementById("journalSelect").value;
  const filterState = getCurrentFilterState();
  const externalBase = document.getElementById("externalBaseUrl").value.trim();
  const externalCtx = document.getElementById("externalContext").value.trim();
  const urlParams = new URLSearchParams();
  urlParams.set('journal', alias);
  urlParams.set('basic', filterState.basic ? '1' : '0');
  urlParams.set('cleanUrls', filterState.cleanUrls ? '1' : '0');
  urlParams.set('hideContext', filterState.hideContext ? '1' : '0');
  if (externalBase && externalCtx) {
    const normalized = normalizeExternalBase(externalBase);
    urlParams.set('external_base_url', normalized || externalBase);
    urlParams.set('external_context', externalCtx);
  }
  return `${window.location.pathname}?${urlParams.toString()}`;
}

async function runAllTests() {
  // If there is already a running test, abort it
  if (currentAbortController) {
    currentAbortController.abort();
    // Wait a tiny bit for the abort to propagate (avoid race conditions)
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Create a new AbortController for this test run
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  // Show UI elements
  document.getElementById("toolbar").style.display = "flex";
  document.getElementById("tableWrapper").style.display = "block";
  document.getElementById("summaryPanel").style.display = "flex";
  
  updateActiveFilters();
  const alias = document.getElementById("journalSelect").value;
  const journal = journals.find(j => j.alias === alias);
  if (!journal) {
    currentAbortController = null;
    return;
  }
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

  // Update copy button URL (only for copying, not for navigation)
  const currentUrl = getCurrentStateUrl();
  const copyBtn = document.getElementById("copyUrlBtn");
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(window.location.origin + currentUrl)
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
    // Clear the controller only if it's the same one (avoid clearing a newer one)
    if (currentAbortController && currentAbortController.signal === signal) {
      currentAbortController = null;
    }
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
  // NO automatic test run
}

function populateSelectAndStart() {
  const select = document.getElementById("journalSelect");
  select.addEventListener("change", () => {
    updateProdTestUrls();
  });
  document.getElementById("runTestsBtn").addEventListener("click", () => runAllTests());
  document.getElementById("runTestsBtnBottom").addEventListener("click", () => runAllTests());
  document.getElementById("resetExternalBtn").addEventListener("click", () => resetExternalToDemo());
  
  // Stop button removed – not needed
  
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
