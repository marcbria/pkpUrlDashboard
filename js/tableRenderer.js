// ============================================================
// tableRenderer.js - Table rendering and UI logic
// ============================================================

import { journals, endpointGroups } from './dataLoader.js';
import { replaceAlias, testAndRenderCell } from './helpers.js';

let externalBaseUrl = "";
let externalContext = "";
let currentErrorOnly = false;
let activeModes = {
  basic: true,
  cleanUrls: true,
  hideContext: true
};

export function setExternalState(baseUrl, context) {
  externalBaseUrl = baseUrl;
  externalContext = context;
}

export function setCurrentErrorOnly(value) {
  currentErrorOnly = value;
}

export function updateActiveFilters() {
  activeModes.basic = document.getElementById("filterBasic").checked;
  activeModes.cleanUrls = document.getElementById("filterCleanUrls").checked;
  activeModes.hideContext = document.getElementById("filterHideContext").checked;
}

export function setupColumnToggles() {
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
      document.querySelectorAll(`.col-${colName}`).forEach(cell => cell.classList.add("col-compact"));
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
    if (externalBaseUrl && externalContext) {
      tds[3].innerHTML = `<span class="category-summary">✅ ${externalOk}/${externalTotal}</span>`;
    } else {
      tds[3].innerHTML = `<span class="category-summary">-</span>`;
    }
  }
}

export function updateAllCategorySummaries() {
  document.querySelectorAll(".category").forEach(cat => {
    if (cat._groupRows) updateCategorySummary(cat, cat._groupRows);
  });
}

export function applyErrorFilter() {
  const rows = document.querySelectorAll("#urlTable tbody tr:not(.category)");
  rows.forEach(row => {
    row.style.display = (currentErrorOnly && !row._hasError) ? "none" : "";
  });
}

export function computeAndDisplaySummary(hasExternal) {
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
      const stat = modeStats[mode];
      if (stat) {
        stat.total++;
        if (isOk(prodStatus)) stat.prodOk++;
        if (isOk(testStatus)) stat.testOk++;
        if (hasExternal && isOk(externalStatus)) stat.externalOk++;
      }
    });
  });

  function cmp(prodOk, testOk, externalOk) {
    if (!hasExternal) {
      if (testOk >= prodOk) return (testOk === prodOk) ? "✅ TEST = PRODUCTION" : "🏆 TEST better than PRODUCTION";
      return "⚠️ TEST worse than PRODUCTION";
    }
    let mainText = "";
    if (testOk >= prodOk && testOk >= externalOk) {
      if (testOk === prodOk && testOk === externalOk) mainText = "✅ TEST equal to others";
      else if (testOk > prodOk && testOk > externalOk) mainText = "🏆 TEST best";
      else if (testOk === prodOk && testOk > externalOk) mainText = "✅ TEST & PRODUCTION equal (better than EXTERNAL)";
      else if (testOk === externalOk && testOk > prodOk) mainText = "✅ TEST & EXTERNAL equal (better than PRODUCTION)";
      else mainText = "✅ TEST good";
    } else if (testOk < prodOk && testOk < externalOk) mainText = "❌ TEST worse than both";
    else mainText = "⚠️ TEST improvable";
    let colorClass = mainText.includes("✅") || mainText.includes("🏆") ? "green" : (mainText.includes("❌") ? "red" : "orange");
    return `<div class="comparison ${colorClass}"><span class="main-line">${mainText}</span></div>`;
  }

  const summaryHtml = `
    <div class="summary-block">
      <h4>📘 basic mode</h4>
      <div class="stat-number">${modeStats.basic.total} endpoints</div>
      <div class="stat-detail">PRODUCTION OK: ${modeStats.basic.prodOk} | TEST OK: ${modeStats.basic.testOk}${hasExternal ? ` | EXTERNAL OK: ${modeStats.basic.externalOk}` : ''}</div>
      ${cmp(modeStats.basic.prodOk, modeStats.basic.testOk, modeStats.basic.externalOk)}
    </div>
    <div class="summary-block">
      <h4>🌐 cleanUrls mode</h4>
      <div class="stat-number">${modeStats.cleanUrls.total} endpoints</div>
      <div class="stat-detail">PRODUCTION OK: ${modeStats.cleanUrls.prodOk} | TEST OK: ${modeStats.cleanUrls.testOk}${hasExternal ? ` | EXTERNAL OK: ${modeStats.cleanUrls.externalOk}` : ''}</div>
      ${cmp(modeStats.cleanUrls.prodOk, modeStats.cleanUrls.testOk, modeStats.cleanUrls.externalOk)}
    </div>
    <div class="summary-block">
      <h4>🚀 hide mode</h4>
      <div class="stat-number">${modeStats.hideContext.total} endpoints</div>
      <div class="stat-detail">PRODUCTION OK: ${modeStats.hideContext.prodOk} | TEST OK: ${modeStats.hideContext.testOk}${hasExternal ? ` | EXTERNAL OK: ${modeStats.hideContext.externalOk}` : ''}</div>
      ${cmp(modeStats.hideContext.prodOk, modeStats.hideContext.testOk, modeStats.hideContext.externalOk)}
    </div>
    <div class="summary-block">
      <h4>🌍 Global</h4>
      <div class="stat-number">${modeStats.basic.total + modeStats.cleanUrls.total + modeStats.hideContext.total} routes</div>
      <div class="stat-detail">✅ PRODUCTION OK: ${modeStats.basic.prodOk + modeStats.cleanUrls.prodOk + modeStats.hideContext.prodOk}</div>
      <div class="stat-detail">✅ TEST OK: ${modeStats.basic.testOk + modeStats.cleanUrls.testOk + modeStats.hideContext.testOk}</div>
      ${hasExternal ? `<div class="stat-detail">✅ EXTERNAL OK: ${modeStats.basic.externalOk + modeStats.cleanUrls.externalOk + modeStats.hideContext.externalOk}</div>` : ''}
    </div>
  `;
  document.getElementById("summaryPanel").innerHTML = summaryHtml;
}

export async function buildTable(groups, prodBase, testBase, alias, hasExternal, externalFullBase) {
  const tbody = document.querySelector("#urlTable tbody");
  const thead = document.getElementById("tableHeader");
  tbody.innerHTML = "";

  thead.innerHTML = `<tr>
    <th data-col="first">Section / Endpoint</th>
    <th data-col="prod">PRODUCTION</th>
    <th data-col="test">TEST</th>
    ${hasExternal ? '<th data-col="external">EXTERNAL</th>' : '<th data-col="external" style="display:none;">EXTERNAL</th>'}
    <th data-col="basic">basic</th>
    <th data-col="clean">clean</th>
    <th data-col="hide">hide</th>
    <th data-col="badge">pkpCheckUrls</th>
  </table>`;

  setupColumnToggles();
  if (!hasExternal) {
    const externalTh = document.querySelector("th[data-col='external']");
    if (externalTh) externalTh.style.display = "none";
  }

  let totalTests = 0;
  const allPromises = [];

  for (let group of groups) {
    const catRow = document.createElement("tr");
    catRow.className = "category";
    const colCount = hasExternal ? 8 : 7;
    for (let i = 0; i < colCount; i++) {
      const td = document.createElement("td");
      if (i === 0) td.innerHTML = `<span class="collapse-indicator">›</span> <strong>${group.name}</strong>`;
      catRow.appendChild(td);
    }
    tbody.appendChild(catRow);
    const groupRows = [];

    catRow.addEventListener("click", (e) => {
      if (e.target.tagName === 'A') return;
      const isCollapsed = catRow.classList.contains("collapsed");
      groupRows.forEach(row => { row.style.display = isCollapsed ? "" : "none"; });
      catRow.classList.toggle("collapsed");
    });

    for (let ep of group.endpoints) {
      const endpointModes = ep.modes || [];
      const hasActiveMode = endpointModes.some(mode => activeModes[mode] === true);
      if (!hasActiveMode) continue;

      const pathTemplate = ep.pathTemplate;
      const isHttpTest = (pathTemplate === "http://");
      let prodPath = replaceAlias(pathTemplate, alias);
      let prodUrl = isHttpTest ? prodBase.replace(/^https:/, 'http:') : prodBase + prodPath;
      let testPath = replaceAlias(pathTemplate, alias);
      let testUrl = isHttpTest ? testBase.replace(/^https:/, 'http:') : testBase + testPath;
      let externalUrl = null;
      let externalDisplayPath = null;
      if (hasExternal && externalFullBase) {
        let extPath = replaceAlias(pathTemplate, externalContext);
        externalUrl = isHttpTest ? externalFullBase.replace(/^https:/, 'http:') : externalFullBase + extPath;
        externalDisplayPath = extPath;
      }

      const tr = document.createElement("tr");
      const tdDesc = document.createElement("td");
      tdDesc.textContent = ep.desc;
      tr.appendChild(tdDesc);

      const tdProd = document.createElement("td"); tdProd.className = "url-cell col-prod"; tdProd.innerHTML = '<span class="status-loading">⏳</span>'; tr.appendChild(tdProd);
      const tdTest = document.createElement("td"); tdTest.className = "url-cell col-test"; tdTest.innerHTML = '<span class="status-loading">⏳</span>'; tr.appendChild(tdTest);
      const tdExternal = document.createElement("td"); tdExternal.className = "url-cell col-external";
      if (hasExternal && externalUrl) tdExternal.innerHTML = '<span class="status-loading">⏳</span>';
      else { tdExternal.innerHTML = '<span class="status-bg bg-error">-</span>'; tdExternal.style.display = "none"; }
      tr.appendChild(tdExternal);

      const tdBasic = document.createElement("td"); tdBasic.className = "mode-check col-basic"; tdBasic.textContent = ep.modes.includes("basic") ? "✓" : ""; tr.appendChild(tdBasic);
      const tdClean = document.createElement("td"); tdClean.className = "mode-check col-clean"; tdClean.textContent = ep.modes.includes("cleanUrls") ? "✓" : ""; tr.appendChild(tdClean);
      const tdHide = document.createElement("td"); tdHide.className = "mode-check col-hide"; tdHide.textContent = ep.modes.includes("hideContext") ? "✓" : ""; tr.appendChild(tdHide);
      const tdBadge = document.createElement("td"); tdBadge.className = "col-badge";
      const badgeSpan = document.createElement("span"); badgeSpan.className = `badge ${ep.tested ? "yes" : "no"}`; badgeSpan.textContent = ep.tested ? "YES" : "NO"; tdBadge.appendChild(badgeSpan); tr.appendChild(tdBadge);

      tbody.appendChild(tr);
      groupRows.push(tr);
      tr._modes = ep.modes;

      const isRootUrl = (pathTemplate === "" || pathTemplate === "http://");
      const displayPathProd = isRootUrl ? null : replaceAlias(pathTemplate, alias);
      const displayPathTest = isRootUrl ? null : replaceAlias(pathTemplate, alias);
      const displayPathExt = isRootUrl ? null : externalDisplayPath;

      const promises = [
        testAndRenderCell(tdProd, prodUrl, isRootUrl, false, displayPathProd),
        testAndRenderCell(tdTest, testUrl, isRootUrl, false, displayPathTest)
      ];
      if (hasExternal && externalUrl) {
        promises.push(testAndRenderCell(tdExternal, externalUrl, isRootUrl, true, displayPathExt));
      } else {
        promises.push(Promise.resolve({ status: 0, isError: false }));
      }
      const promise = Promise.all(promises).then(([prod, test, external]) => {
        tr._prodStatus = prod.status;
        tr._testStatus = test.status;
        tr._externalStatus = external.status;
        tr._hasError = prod.isError || test.isError || (hasExternal && external.isError);
        totalTests++;
        document.getElementById("progressMsg").innerText = `Tested ${totalTests} / ... endpoints`;
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
  computeAndDisplaySummary(hasExternal);
}
