// ============================================================
// main.js - Entry point and event handlers (data loading on start)
// ============================================================

import { journals, loadJournalsFromCSV, loadEndpointsFromJSON, updateProdTestUrls, endpointGroups } from './dataLoader.js';
import { getTestBase, normalizeExternalBase, getFullExternalBase, registerExternalDomain } from './helpers.js';
import { setExternalState, setCurrentErrorOnly, updateActiveFilters, buildTable, clearTableAndSummary, applyErrorFilter } from './tableRenderer.js';
import { CLEANUP_WAIT_SECONDS } from './constants.js';

let externalBaseUrl = "";
let externalContext = "";
let currentAbortController = null;
let isRunning = false;
let cleanupTimer = null;
let remainingSeconds = 0;

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

function getCurrentFilterState() {
  return {
    basic: document.getElementById('filterBasic').checked,
    cleanUrls: document.getElementById('filterCleanUrls').checked,
    hideContext: document.getElementById('filterHideContext').checked
  };
}

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

// Stop function: aborts fetches, shows countdown timer, then reloads
async function stopAndReload() {
  if (!isRunning) return;

  // Cancel any previous timer
  if (cleanupTimer) clearInterval(cleanupTimer);
  remainingSeconds = CLEANUP_WAIT_SECONDS;

  const progressMsg = document.getElementById("progressMsg");
  progressMsg.innerText = `Stopping tests and cleaning up pending requests... (${remainingSeconds} s remaining)`;

  // Abort all active fetch requests
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }

  // Clear table visually
  clearTableAndSummary();

  // Disable RUN buttons during cleanup
  const runBtn = document.getElementById("runTestsBtn");
  const runBtnBottom = document.getElementById("runTestsBtnBottom");
  runBtn.disabled = true;
  runBtnBottom.disabled = true;

  // Start countdown timer (updates every second)
  cleanupTimer = setInterval(() => {
    remainingSeconds--;
    if (remainingSeconds >= 0) {
      progressMsg.innerText = `Stopping tests and cleaning up pending requests... (${remainingSeconds} s remaining)`;
    }
    if (remainingSeconds <= 0) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
      // Reload page preserving current state
      const currentUrl = getCurrentStateUrl();
      window.location.href = currentUrl;
    }
  }, 1000);
}

async function runAllTests() {
  // If already running, stop and reload
  if (isRunning) {
    await stopAndReload();
    return;
  }

  // Cancel any previous controller
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;
  isRunning = true;

  // Change RUN buttons text to STOP (no emoji)
  const runBtn = document.getElementById("runTestsBtn");
  const runBtnBottom = document.getElementById("runTestsBtnBottom");
  runBtn.textContent = "STOP";
  runBtnBottom.textContent = "STOP";
  runBtn.classList.add("stop-btn");
  runBtnBottom.classList.add("stop-btn");

  // Show UI elements
  document.getElementById("toolbar").style.display = "flex";
  document.getElementById("tableWrapper").style.display = "block";
  document.getElementById("summaryPanel").style.display = "flex";
  
  updateActiveFilters();
  const alias = document.getElementById("journalSelect").value;
  const journal = journals.find(j => j.alias === alias);
  if (!journal) {
    finishTestRun(false);
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
    finishTestRun(false);
  } catch (err) {
    if (err.name === 'AbortError') {
      // Do NOT call finishTestRun; stopAndReload already handles UI and reload
      return;
    } else {
      console.error(err);
      document.getElementById("progressMsg").innerText = "Error running tests.";
      finishTestRun(false);
    }
  }
}

function finishTestRun(wasAborted = false) {
  // Prevent finishTestRun from running if we are in the middle of cleanup (timer active)
  if (cleanupTimer !== null) return;

  // Restore buttons to RUN (no emoji)
  const runBtn = document.getElementById("runTestsBtn");
  const runBtnBottom = document.getElementById("runTestsBtnBottom");
  runBtn.textContent = "RUN ALL TESTS";
  runBtnBottom.textContent = "RUN ALL TESTS";
  runBtn.classList.remove("stop-btn");
  runBtnBottom.classList.remove("stop-btn");
  // Ensure they are not disabled
  runBtn.disabled = false;
  runBtnBottom.disabled = false;
  isRunning = false;
  currentAbortController = null;
  if (!wasAborted) {
    document.getElementById("progressMsg").innerText = "Tests completed.";
  }
}

function resetExternalToDemo() {
  document.getElementById("externalBaseUrl").value = "ojs33.testdrive.publicknowledgeproject.org";
  document.getElementById("externalContext").value = "testdrive-journal";
  document.getElementById("externalError").innerHTML = "";
}

async function initialize() {
  const progressMsg = document.getElementById("progressMsg");
  progressMsg.innerText = "Loading data...";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    await Promise.all([
      loadEndpointsFromJSON(controller.signal),
      loadJournalsFromCSV(controller.signal)
    ]);
    clearTimeout(timeoutId);
    
    applyModeParamsFromUrl();
    progressMsg.innerText = "System ready. Click RUN ALL TESTS to start.";
  } catch (err) {
    console.error("Initialization error:", err);
    if (err.name === 'AbortError') {
      progressMsg.innerText = "Data loading timed out (10s). Please refresh.";
    } else {
      progressMsg.innerText = "Error loading data. Please refresh.";
    }
  }
}

function populateSelectAndStart() {
  const select = document.getElementById("journalSelect");
  select.addEventListener("change", () => {
    if (journals.length > 0) updateProdTestUrls();
  });
  
  const runBtn = document.getElementById("runTestsBtn");
  const runBtnBottom = document.getElementById("runTestsBtnBottom");
  runBtn.addEventListener("click", () => runAllTests());
  runBtnBottom.addEventListener("click", () => runAllTests());
  
  document.getElementById("resetExternalBtn").addEventListener("click", () => resetExternalToDemo());
  
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
