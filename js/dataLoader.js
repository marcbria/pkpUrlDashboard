// ============================================================
// dataLoader.js - Load journals and endpoints (with abort signal)
// ============================================================

import { CSV_FILE, ENDPOINTS_FILE } from './constants.js';
import { getTestBase } from './helpers.js';

export let journals = [];
export let endpointGroups = [];

export async function loadJournalsFromCSV(signal = null) {
  try {
    const response = await fetch(CSV_FILE, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
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

    const urlParams = new URLSearchParams(window.location.search);
    let initialJournal = urlParams.get('journal');
    let initialExternalBase = urlParams.get('external_base_url');
    let initialExternalContext = urlParams.get('external_context');

    select.value = (initialJournal && journals.some(j => j.alias === initialJournal)) ? initialJournal : "brumal";
    document.getElementById('externalBaseUrl').value = initialExternalBase || "";
    document.getElementById('externalContext').value = initialExternalContext || "";

    updateProdTestUrls();
  } catch (err) {
    console.error('Failed to load journals.csv', err);
    document.getElementById('progressMsg').innerText = 'Error loading journals.csv';
    document.getElementById('journalSelect').innerHTML = '<option>Error loading CSV</option>';
    throw err;
  }
}

export function updateProdTestUrls() {
  const alias = document.getElementById("journalSelect").value;
  const journal = journals.find(j => j.alias === alias);
  if (!journal) return;
  const prodBase = journal.prodUrl;
  const testBase = getTestBase(alias, prodBase, journal.testUrl);
  const prodLink = `<a href="${prodBase}" target="_blank">${prodBase.replace(/^https?:\/\//, '')}</a>`;
  const testLink = `<a href="${testBase}" target="_blank">${testBase.replace(/^https?:\/\//, '')}</a>`;
  document.getElementById("prodTestUrls").innerHTML = `<strong>journalContext:</strong> ${alias} | <strong>PRODUCTION</strong>: ${prodLink} | <strong>TEST</strong>: ${testLink}`;
}

export async function loadEndpointsFromJSON(signal = null) {
  try {
    const response = await fetch(ENDPOINTS_FILE, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    endpointGroups = data.groups;
  } catch (err) {
    console.error('Failed to load endpoints.json', err);
    endpointGroups = [];
    throw err;
  }
}
