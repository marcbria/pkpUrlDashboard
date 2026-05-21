// ============================================================
// helpers.js - Utility functions (with fetch timeout)
// ============================================================

import { PROXY_PATH, EXTERNAL_DELAY_US } from './constants.js';

export function normalizeExternalBase(raw) {
  if (!raw) return "";
  let s = raw.trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return null;
  return s;
}

export function getFullExternalBase(externalBaseUrl) {
  if (!externalBaseUrl) return "";
  return "https://" + externalBaseUrl;
}

export function getTestBase(alias, prodUrl, optionalTestUrl) {
  if (optionalTestUrl) return optionalTestUrl;
  if (prodUrl.includes('revistes.uab.cat/')) {
    return `https://cory-revistes.precarietat.net/${alias}`;
  } else {
    const match = prodUrl.match(/https?:\/\/([^.]+)\./);
    if (match && match[1]) return `https://cory-${match[1]}.precarietat.net`;
    return `https://cory-${alias}.precarietat.net`;
  }
}

export async function registerExternalDomain(domain) {
  if (!domain) return;
  try {
    await fetch(`${PROXY_PATH}?add_domain=${encodeURIComponent(domain)}`, { method: 'HEAD', cache: 'no-store' });
  } catch(e) {}
}

export function replaceAlias(pathTemplate, alias) {
  if (!pathTemplate) return "";
  return pathTemplate.replace(/{alias}/g, alias);
}

async function fetchWithTimeout(url, options, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function checkUrlViaProxy(url, useDelay = false, signal = null) {
  let proxyUrl = `${PROXY_PATH}?url=${encodeURIComponent(url)}`;
  if (useDelay) proxyUrl += `&delay=${EXTERNAL_DELAY_US}`;
  try {
    let response;
    if (signal) {
      response = await fetch(proxyUrl, { signal });
    } else {
      response = await fetchWithTimeout(proxyUrl, {}, 20000);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return { status: data.status };
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('Fetch aborted (timeout or manual):', url);
      return { status: 0, aborted: true };
    }
    return { status: 0 };
  }
}

export function getBgClass(status) {
  if (status === 0) return "bg-error";
  if (status >= 200 && status < 300) return "bg-success";
  if (status >= 300 && status < 400) return "bg-redirect";
  if (status === 401 || status === 403) return "bg-unauthorized";
  if (status === 460) return "bg-filtered";
  return "bg-error";
}

export async function testAndRenderCell(cell, url, isRoot = false, useDelay = false, displayPath = null, signal = null) {
  let statusData;
  try {
    statusData = await checkUrlViaProxy(url, useDelay, signal);
  } catch (err) {
    if (err.name === 'AbortError') {
      cell.innerHTML = `<span class="status-bg bg-error" style="background-color:#f8d7da;">⏹️ Stopped</span>`;
      throw err;
    }
    statusData = { status: 0 };
  }
  const { status } = statusData;
  let bgClass = getBgClass(status);
  let inlineStyle = '';
  if (status === 460) {
    inlineStyle = 'background-color: #b8e1fc; border-left: 3px solid #1e88e5;';
  }
  let displayUrl = displayPath;
  if (!displayUrl) {
    if (isRoot) displayUrl = url;
    else {
      try {
        const urlObj = new URL(url);
        displayUrl = urlObj.pathname + urlObj.search;
        if (displayUrl === "") displayUrl = "/";
      } catch(e) { displayUrl = url; }
    }
  }
  let icon = "";
  if (status >= 200 && status < 300) icon = "";
  else if (status >= 300 && status < 400) icon = "🔄";
  else if (status === 401 || status === 403) icon = "🔒";
  else if (status === 460) icon = "🛡️";
  else icon = "❌";
  
  cell.innerHTML = `<span class="status-bg ${bgClass}" style="${inlineStyle}">${icon} <a href="${url}" target="_blank">${displayUrl}</a></span>`;
  return { status, isError: (status >= 400 && status !== 403 && status !== 401 && status !== 460) || status === 0 };
}
