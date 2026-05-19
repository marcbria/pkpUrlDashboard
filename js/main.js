// ============================================================
// main.js - Entry point and event handlers
// ============================================================

import { journals, loadJournalsFromCSV, loadEndpointsFromJSON, updateProdTestUrls, endpointGroups } from './dataLoader.js';
import { getTestBase, normalizeExternalBase, getFullExternalBase, registerExternalDomain } from './helpers.js';
import { setExternalState, setCurrentErrorOnly, updateActiveFilters, buildTable, applyErrorFilter } from './tableRenderer.js';

let externalBaseUrl = "";
let externalContext = "";

async function runAllTests() {
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

  const urlParams = new URLSearchParams();
  urlParams.set('journal', alias);
  if (hasExternal) {
    urlParams.set('external_base_url', externalBaseUrl);
    urlParams.set('external_context', externalContext);
  }
  const currentUrl = `${window.location.pathname}?${urlParams.toString()}`;
  const copyBtn = document.getElementById("copyUrlBtn");
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(window.location.origin + currentUrl).then(() => alert("URL copied to clipboard!")).catch(() => alert("Failed to copy URL"));
  };

  document.getElementById("progressMsg").innerText = "Running tests...";
  await buildTable(endpointGroups, prodBase, testBase, alias, hasExternal, externalFullBase);
}

function resetExternalToDemo() {
  document.getElementById("externalBaseUrl").value = "ojs33.testdrive.publicknowledgeproject.org";
  document.getElementById("externalContext").value = "testdrive-journal";
  document.getElementById("externalError").innerHTML = "";
}

function populateSelectAndStart() {
  const select = document.getElementById("journalSelect");
  select.addEventListener("change", () => {
    updateProdTestUrls();
  });
  document.getElementById("runTestsBtn").addEventListener("click", () => runAllTests());
  document.getElementById("runTestsBtnBottom").addEventListener("click", () => runAllTests());
  document.getElementById("resetExternalBtn").addEventListener("click", () => resetExternalToDemo());
  const errorBtn = document.getElementById("errorToggleBtn");
  errorBtn.addEventListener("click", () => {
    const newValue = !errorBtn.classList.contains("active");
    setCurrentErrorOnly(newValue);
    errorBtn.classList.toggle("active");
    errorBtn.innerHTML = newValue ? "✔️ Show all rows" : "❗ Show errors only";
    applyErrorFilter();
  });
  loadEndpointsFromJSON().then(() => loadJournalsFromCSV());
}

populateSelectAndStart();
