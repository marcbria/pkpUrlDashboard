// ============================================================
// dashboard.js - PKP URL Health Monitor
// Version: modular, constants, external config
// ============================================================

// -------------------------------
// Constants & Configuration
// -------------------------------
const PROXY_PATH = "proxy.php";
const EXTERNAL_DELAY_US = 2000000;      // 2 seconds for external calls
const CSV_FILE = "journals.csv";
const ENDPOINTS_FILE = "endpoints.json";

// Global state
let journals = [];
let externalBaseUrl = "https://ojs33.testdrive.publicknowledgeproject.org";
let externalContext = "testdrive-journal";
let currentErrorOnly = false;

// -------------------------------
// Helper Functions
// -------------------------------
function normalizeExternalBase(url) {
  if (!url) return "";
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url;
}

function getTestBase(alias, prodUrl, optionalTestUrl) {
  if (optionalTestUrl) return optionalTestUrl;
  if (prodUrl.includes('revistes.uab.cat/')) {
    return `https://cory-revistes.precarietat.net/${alias}`;
  } else {
    const match = prodUrl.match(/https?:\/\/([^.]+)\./);
    if (match && match[1]) {
      return `https://cory-${match[1]}.precarietat.net`;
    }
    return `https://cory-${alias}.precarietat.net`;
  }
}

async function registerExternalDomain(domain) {
  if (!domain) return;
  try {
    const registerUrl = `${PROXY_PATH}?add_domain=${encodeURIComponent(domain)}`;
    await fetch(registerUrl, { method: 'HEAD', cache: 'no-store' });
  } catch(e) { /* ignore */ }
}

// Build external URL using externalContext (not journal alias)
function getExternalUrl(path) {
  if (!externalBaseUrl) return "";
  let base = externalBaseUrl.replace(/\/$/, '');
  if (path === "http://") return base.replace(/^https:/, 'http:');
  if (path === "") return base;
  if (path.startsWith("/")) {
    if (path.includes("/index.php/")) {
      return base + path;
    }
    return `${base}/index.php/${externalContext}${path}`;
  }
  return base + path;
}

// *** CORRECCIÓN: Eliminado AbortController y timeout ***
async function checkUrlViaProxy(url, useDelay = false) {
  let proxyUrl = `${PROXY_PATH}?url=${encodeURIComponent(url)}`;
  if (useDelay) {
    proxyUrl += `&delay=${EXTERNAL_DELAY_US}`;
  }
  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { status: data.status };
  } catch (err) {
    return { status: 0 };
  }
}

function getBgClass(status) {
  if (status === 0) return "bg-error";
  if (status >= 200 && status < 300) return "bg-success";
  if (status >= 300 && status < 400) return "bg-redirect";
  if (status === 401 || status === 403) return "bg-unauthorized";
  return "bg-error";
}

async function testAndRenderCell(cell, url, isRoot = false, useDelay = false) {
  const { status } = await checkUrlViaProxy(url, useDelay);
  const bgClass = getBgClass(status);
  let displayUrl = url;
  if (!isRoot) {
    try {
      const urlObj = new URL(url);
      displayUrl = urlObj.pathname + urlObj.search;
      if (displayUrl === "") displayUrl = "/";
    } catch(e) { displayUrl = url; }
  }
  const icon = (status >= 200 && status < 300) ? "" : (status >= 300 && status < 400) ? "🔄" : (status === 401 || status === 403) ? "🔒" : "❌";
  cell.innerHTML = `<span class="status-bg ${bgClass}">${icon} <a href="${url}" target="_blank">${displayUrl}</a></span>`;
  return { status, isError: (status >= 400 && status !== 403 && status !== 401) || status === 0 };
}

// -------------------------------
// Data Loading (CSV + JSON endpoints)
// -------------------------------
async function loadJournalsFromCSV() {
  try {
    const response = await fetch(CSV_FILE);
    const csvText = await response.text();
    const lines = csvText.trim().split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') continue;
      const parts = line.split(',');
      if (parts.length < 3) continue;
      const alias = parts[0].trim();
      const prodUrl = parts[1].trim();
      let testUrl = parts[2].trim();
      if (testUrl === '') testUrl = null;
      journals.push({ alias, prodUrl, testUrl });
    }
    if (journals.length === 0) throw new Error('No journals found in CSV');
    const select = document.getElementById('journalSelect');
    select.innerHTML = '';
    journals.forEach(j => {
      const opt = document.createElement('option');
      opt.value = j.alias;
      opt.textContent = j.alias;
      select.appendChild(opt);
    });
    select.disabled = false;

    // Read URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    let initialJournal = urlParams.get('journal');
    let initialExternalBase = urlParams.get('external_base_url');
    let initialExternalContext = urlParams.get('external_context');

    if (initialJournal && journals.some(j => j.alias === initialJournal)) {
      select.value = initialJournal;
    } else {
      select.value = "brumal";
    }
    if (initialExternalBase) {
      document.getElementById('externalBaseUrl').value = initialExternalBase;
    } else {
      document.getElementById('externalBaseUrl').value = "https://ojs33.testdrive.publicknowledgeproject.org";
    }
    if (initialExternalContext) {
      document.getElementById('externalContext').value = initialExternalContext;
    } else {
      document.getElementById('externalContext').value = "testdrive-journal";
    }

    setTimeout(() => runAllTests(), 100);
  } catch (err) {
    console.error('Failed to load journals.csv', err);
    document.getElementById('progressMsg').innerText = 'Error loading journals.csv';
    document.getElementById('journalSelect').innerHTML = '<option>Error loading CSV</option>';
  }
}

let endpointGroups = [];
async function loadEndpointsFromJSON() {
  try {
    const response = await fetch(ENDPOINTS_FILE);
    const data = await response.json();
    endpointGroups = data.groups;
  } catch (err) {
    console.error('Failed to load endpoints.json', err);
    endpointGroups = []; // fallback (empty)
  }
}

function resolveEndpoints(groups, alias) {
  return groups.map(group => ({
    ...group,
    endpoints: group.endpoints.map(ep => {
      if (ep.pathTemplate) {
        return { ...ep, path: ep.pathTemplate.replace(/{alias}/g, alias), modes: ep.modes };
      }
      return { ...ep, path: ep.path };
    })
  }));
}

// -------------------------------
// Table rendering and UI logic
// -------------------------------
let currentGroups = [];

function setupColumnToggles() {
  const headers = document.querySelectorAll("#tableHeader th[data-col]");
  headers.forEach(th => {
    const colName = th.getAttribute("data-col");
    if (!colName || colName === "first") return;
    th.style.cursor = "pointer";
    const newTh = th.cloneNode(true);
    th.parentNode.replaceChild(newTh, th);
    const originalText = newTh.innerText.trim();
    let shortText = "";
    switch (colName) {
      case "prod": shortText = "P"; break;
      case "test": shortText = "T"; break;
      case "external": shortText = "E"; break;
      case "basic": shortText = "B"; break;
      case "clean": shortText = "C"; break;
      case "hide": shortText = "H"; break;
      case "badge": shortText = "p"; break;
      default: shortText = "?";
    }
    newTh.addEventListener("click", (e) => {
      const selector = `.col-${colName}`;
      const cells = document.querySelectorAll(selector);
      const isCompact = cells.length > 0 && cells[0].classList.contains("col-compact");
      cells.forEach(cell => {
        if (isCompact) cell.classList.remove("col-compact");
        else cell.classList.add("col-compact");
      });
      if (isCompact) {
        newTh.innerText = originalText;
        newTh.classList.remove("col-compact");
      } else {
        newTh.innerText = shortText;
        newTh.classList.add("col-compact");
      }
    });
    const shouldBeCompact = (colName === "basic" || colName === "clean" || colName === "hide" || colName === "badge");
    if (shouldBeCompact) {
      newTh.innerText = shortText;
      newTh.classList.add("col-compact");
      const cells = document.querySelectorAll(`.col-${colName}`);
      cells.forEach(cell => cell.classList.add("col-compact"));
    }
  });
}

function updateCategorySummary(catRow, rows) {
  let prodOk = 0, prodTotal = 0, testOk = 0, testTotal = 0, externalOk = 0, externalTotal = 0;
  rows.forEach(row => {
    const isOk = (s) => s >= 200 && s < 300;
    if (row._prodStatus !== undefined) { prodTotal++; if (isOk(row._prodStatus)) prodOk++; }
    if (row._testStatus !== undefined) { testTotal++; if (isOk(row._testStatus)) testOk++; }
    if (row._externalStatus !== undefined) { externalTotal++; if (isOk(row._externalStatus)) externalOk++; }
  });
  const tds = catRow.querySelectorAll("td");
  if (tds.length >= 4) {
    tds[1].innerHTML = `<span class="category-summary">✅ ${prodOk}/${prodTotal}</span>`;
    tds[2].innerHTML = `<span class="category-summary">✅ ${testOk}/${testTotal}</span>`;
    tds[3].innerHTML = `<span class="category-summary">✅ ${externalOk}/${externalTotal}</span>`;
  }
}

function updateAllCategorySummaries() {
  document.querySelectorAll(".category").forEach(cat => {
    if (cat._groupRows) updateCategorySummary(cat, cat._groupRows);
  });
}

function applyErrorFilter() {
  const rows = document.querySelectorAll("#urlTable tbody tr:not(.category)");
  rows.forEach(row => {
    if (currentErrorOnly) {
      row.style.display = row._hasError ? "" : "none";
    } else {
      row.style.display = "";
    }
  });
}

function computeAndDisplaySummary() {
  const rows = document.querySelectorAll("#urlTable tbody tr:not(.category)");
  const modeStats = {
    basic: { prodOk: 0, testOk: 0, externalOk: 0, total: 0 },
    cleanUrls: { prodOk: 0, testOk: 0, externalOk: 0, total: 0 },
    hideContext: { prodOk: 0, testOk: 0, externalOk: 0, total: 0 }
  };
  rows.forEach(row => {
    const modes = row._modes || [];
    const prodStatus = row._prodStatus;
    const testStatus = row._testStatus;
    const externalStatus = row._externalStatus;
    const isOk = (s) => s >= 200 && s < 300;
    modes.forEach(mode => {
      if (mode === "basic") {
        modeStats.basic.total++;
        if (isOk(prodStatus)) modeStats.basic.prodOk++;
        if (isOk(testStatus)) modeStats.basic.testOk++;
        if (isOk(externalStatus)) modeStats.basic.externalOk++;
      } else if (mode === "cleanUrls") {
        modeStats.cleanUrls.total++;
        if (isOk(prodStatus)) modeStats.cleanUrls.prodOk++;
        if (isOk(testStatus)) modeStats.cleanUrls.testOk++;
        if (isOk(externalStatus)) modeStats.cleanUrls.externalOk++;
      } else if (mode === "hideContext") {
        modeStats.hideContext.total++;
        if (isOk(prodStatus)) modeStats.hideContext.prodOk++;
        if (isOk(testStatus)) modeStats.hideContext.testOk++;
        if (isOk(externalStatus)) modeStats.hideContext.externalOk++;
      }
    });
  });

  function cmp(prodOk, testOk, externalOk) {
    let mainText = "", subText = "";
    if (testOk >= prodOk && testOk >= externalOk) {
      if (testOk === prodOk && testOk === externalOk) {
        mainText = "✅ TEST equal to others";
      } else if (testOk > prodOk && testOk > externalOk) {
        mainText = "🏆 TEST best";
      } else if (testOk === prodOk && testOk > externalOk) {
        mainText = "✅ TEST & PRODUCTION equal";
        subText = "(better than EXTERNAL)";
      } else if (testOk === externalOk && testOk > prodOk) {
        mainText = "✅ TEST & EXTERNAL equal";
        subText = "(better than PRODUCTION)";
      } else {
        mainText = "✅ TEST good";
      }
    } else if (testOk < prodOk && testOk < externalOk) {
      mainText = "❌ TEST worse than both";
    } else {
      mainText = "⚠️ TEST improvable";
    }
    let colorClass = "";
    if (mainText.includes("✅") || mainText.includes("🏆")) colorClass = "green";
    else if (mainText.includes("❌")) colorClass = "red";
    else if (mainText.includes("⚠️")) colorClass = "orange";
    return `<div class="comparison ${colorClass}">
              <span class="main-line">${mainText}</span>
              ${subText ? `<span class="sub-line">${subText}</span>` : ''}
            </div>`;
  }

  const summaryHtml = `
    <div class="summary-block">
      <h4>📘 basic mode</h4>
      <div class="stat-number">${modeStats.basic.total} endpoints</div>
      <div class="stat-detail">PRODUCTION OK: ${modeStats.basic.prodOk} | TEST OK: ${modeStats.basic.testOk} | EXTERNAL OK: ${modeStats.basic.externalOk}</div>
      ${cmp(modeStats.basic.prodOk, modeStats.basic.testOk, modeStats.basic.externalOk)}
    </div>
    <div class="summary-block">
      <h4>🌐 cleanUrls mode</h4>
      <div class="stat-number">${modeStats.cleanUrls.total} endpoints</div>
      <div class="stat-detail">PRODUCTION OK: ${modeStats.cleanUrls.prodOk} | TEST OK: ${modeStats.cleanUrls.testOk} | EXTERNAL OK: ${modeStats.cleanUrls.externalOk}</div>
      ${cmp(modeStats.cleanUrls.prodOk, modeStats.cleanUrls.testOk, modeStats.cleanUrls.externalOk)}
    </div>
    <div class="summary-block">
      <h4>🚀 hideContext mode</h4>
      <div class="stat-number">${modeStats.hideContext.total} endpoints</div>
      <div class="stat-detail">PRODUCTION OK: ${modeStats.hideContext.prodOk} | TEST OK: ${modeStats.hideContext.testOk} | EXTERNAL OK: ${modeStats.hideContext.externalOk}</div>
      ${cmp(modeStats.hideContext.prodOk, modeStats.hideContext.testOk, modeStats.hideContext.externalOk)}
    </div>
    <div class="summary-block">
      <h4>🌍 Global (all modes)</h4>
      <div class="stat-number">${modeStats.basic.total + modeStats.cleanUrls.total + modeStats.hideContext.total} routes</div>
      <div class="stat-detail">✅ PRODUCTION OK: ${modeStats.basic.prodOk + modeStats.cleanUrls.prodOk + modeStats.hideContext.prodOk}</div>
      <div class="stat-detail">✅ TEST OK: ${modeStats.basic.testOk + modeStats.cleanUrls.testOk + modeStats.hideContext.testOk}</div>
      <div class="stat-detail">✅ EXTERNAL OK: ${modeStats.basic.externalOk + modeStats.cleanUrls.externalOk + modeStats.hideContext.externalOk}</div>
    </div>
  `;
  document.getElementById("summaryPanel").innerHTML = summaryHtml;
}

async function buildTable(groups, prodBase, testBase, alias) {
  const tbody = document.querySelector("#urlTable tbody");
  const thead = document.getElementById("tableHeader");
  tbody.innerHTML = "";

  thead.innerHTML = `<tr>
    <th data-col="first">Section / Endpoint</th>
    <th data-col="prod">PRODUCTION</th>
    <th data-col="test">TEST</th>
    <th data-col="external">EXTERNAL</th>
    <th data-col="basic" style="text-align:center;">basic</th>
    <th data-col="clean" style="text-align:center;">clean</th>
    <th data-col="hide" style="text-align:center;">hide</th>
    <th data-col="badge">pkpCheckUrls</th>
  </table>`;

  setupColumnToggles();

  let totalTests = 0;
  const allPromises = [];

  for (let group of groups) {
    const catRow = document.createElement("tr");
    catRow.className = "category";
    for (let i = 0; i < 8; i++) {
      const td = document.createElement("td");
      if (i === 0) {
        td.innerHTML = `<span class="collapse-indicator">›</span> <strong>${group.name}</strong>`;
      }
      catRow.appendChild(td);
    }
    tbody.appendChild(catRow);
    const groupRows = [];

    catRow.addEventListener("click", (e) => {
      if (e.target.tagName === 'A') return;
      const isCollapsed = catRow.classList.contains("collapsed");
      groupRows.forEach(row => {
        row.style.display = isCollapsed ? "" : "none";
      });
      catRow.classList.toggle("collapsed");
    });

    for (let ep of group.endpoints) {
      const isHttpTest = (ep.path === "http://");
      let prodUrl = isHttpTest ? prodBase.replace(/^https:/, 'http:') : prodBase + ep.path;
      let testUrl = isHttpTest ? testBase.replace(/^https:/, 'http:') : testBase + ep.path;
      let externalUrl = getExternalUrl(ep.path);

      const tr = document.createElement("tr");
      const tdDesc = document.createElement("td");
      tdDesc.textContent = ep.desc;
      tr.appendChild(tdDesc);

      const tdProd = document.createElement("td");
      tdProd.className = `url-cell col-prod`;
      tdProd.innerHTML = '<span class="status-loading">⏳</span>';
      tr.appendChild(tdProd);

      const tdTest = document.createElement("td");
      tdTest.className = `url-cell col-test`;
      tdTest.innerHTML = '<span class="status-loading">⏳</span>';
      tr.appendChild(tdTest);

      const tdExternal = document.createElement("td");
      tdExternal.className = `url-cell col-external`;
      tdExternal.innerHTML = '<span class="status-loading">⏳</span>';
      tr.appendChild(tdExternal);

      const tdBasic = document.createElement("td");
      tdBasic.className = "mode-check col-basic";
      tdBasic.textContent = ep.modes.includes("basic") ? "✓" : "";
      tr.appendChild(tdBasic);

      const tdClean = document.createElement("td");
      tdClean.className = "mode-check col-clean";
      tdClean.textContent = ep.modes.includes("cleanUrls") ? "✓" : "";
      tr.appendChild(tdClean);

      const tdHide = document.createElement("td");
      tdHide.className = "mode-check col-hide";
      tdHide.textContent = ep.modes.includes("hideContext") ? "✓" : "";
      tr.appendChild(tdHide);

      const tdBadge = document.createElement("td");
      tdBadge.className = "col-badge";
      const badgeSpan = document.createElement("span");
      badgeSpan.className = `badge ${ep.tested ? "yes" : "no"}`;
      badgeSpan.textContent = ep.tested ? "YES" : "NO";
      tdBadge.appendChild(badgeSpan);
      tr.appendChild(tdBadge);

      tbody.appendChild(tr);
      groupRows.push(tr);
      tr._modes = ep.modes;

      const isRootUrl = (ep.path === "" || ep.path === "http://");
      const promise = Promise.all([
        testAndRenderCell(tdProd, prodUrl, isRootUrl, false),
        testAndRenderCell(tdTest, testUrl, isRootUrl, false),
        testAndRenderCell(tdExternal, externalUrl, isRootUrl, true)
      ]).then(([prod, test, external]) => {
        tr._prodStatus = prod.status;
        tr._testStatus = test.status;
        tr._externalStatus = external.status;
        tr._hasError = prod.isError || test.isError || external.isError;
        totalTests++;
        document.getElementById("progressMsg").innerText = `Tested ${totalTests} / ${groups.flatMap(g => g.endpoints).length} endpoints`;
        updateCategorySummary(catRow, groupRows);
      });
      allPromises.push(promise);
    }
    catRow._groupRows = groupRows;
  }

  await Promise.all(allPromises);
  updateAllCategorySummaries();
  document.getElementById("progressMsg").innerText = `Tests completed (${totalTests} endpoints)`;
  applyErrorFilter();
  computeAndDisplaySummary();
}

// -------------------------------
// Main flow
// -------------------------------
async function runAllTests() {
  const alias = document.getElementById("journalSelect").value;
  const journal = journals.find(j => j.alias === alias);
  if (!journal) return;
  const prodBase = journal.prodUrl;
  const testBase = getTestBase(alias, prodBase, journal.testUrl);
  let rawExternalBase = document.getElementById("externalBaseUrl").value.trim();
  externalBaseUrl = normalizeExternalBase(rawExternalBase);
  externalContext = document.getElementById("externalContext").value.trim();
  let externalDomain = "";
  try {
    const urlObj = new URL(externalBaseUrl);
    externalDomain = urlObj.hostname;
    await registerExternalDomain(externalDomain);
  } catch(e) {}
  const baseDiv = document.getElementById("baseInfo");
  const prodLink = `<a href="${prodBase}" target="_blank">${prodBase.replace(/^https?:\/\//, '')}</a>`;
  const testLink = `<a href="${testBase}" target="_blank">${testBase.replace(/^https?:\/\//, '')}</a>`;
  const externalLink = `<a href="${externalBaseUrl}" target="_blank">${externalBaseUrl.replace(/^https?:\/\//, '')}</a>`;
  baseDiv.innerHTML = `PRODUCTION: ${prodLink} | TEST: ${testLink} | EXTERNAL: ${externalLink} (context: ${externalContext})`;

  const urlParams = new URLSearchParams();
  urlParams.set('journal', alias);
  urlParams.set('external_base_url', rawExternalBase);
  urlParams.set('external_context', externalContext);
  const currentUrl = `${window.location.pathname}?${urlParams.toString()}`;
  const copyBtn = document.getElementById("copyUrlBtn");
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(window.location.origin + currentUrl).then(() => {
      alert("URL copied to clipboard!");
    }).catch(() => alert("Failed to copy URL"));
  };

  document.getElementById("progressMsg").innerText = "Running tests...";
  const resolvedGroups = resolveEndpoints(endpointGroups, alias);
  await buildTable(resolvedGroups, prodBase, testBase, alias);
}

function resetExternalToDemo() {
  document.getElementById("externalBaseUrl").value = "https://ojs33.testdrive.publicknowledgeproject.org";
  document.getElementById("externalContext").value = "testdrive-journal";
  runAllTests();
}

function populateSelectAndStart() {
  const select = document.getElementById("journalSelect");
  select.addEventListener("change", () => runAllTests());
  document.getElementById("runTestsBtn").addEventListener("click", () => runAllTests());
  document.getElementById("resetExternalBtn").addEventListener("click", () => resetExternalToDemo());
  const errorBtn = document.getElementById("errorToggleBtn");
  errorBtn.addEventListener("click", () => {
    currentErrorOnly = !currentErrorOnly;
    if (currentErrorOnly) {
      errorBtn.classList.add("active");
      errorBtn.innerHTML = "✔️ Show all rows";
    } else {
      errorBtn.classList.remove("active");
      errorBtn.innerHTML = "❗ Show errors only";
    }
    applyErrorFilter();
  });
  // Load endpoints first, then CSV, then start
  loadEndpointsFromJSON().then(() => loadJournalsFromCSV());
}

populateSelectAndStart();
