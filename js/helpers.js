// ============================================================
// helpers.js - Utility functions
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

export async function checkUrlViaProxy(url, useDelay = false) {
  let proxyUrl = `${PROXY_PATH}?url=${encodeURIComponent(url)}`;
  if (useDelay) proxyUrl += `&delay=${EXTERNAL_DELAY_US}`;
  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { status: data.status };
  } catch (err) {
    return { status: 0 };
  }
}

export function getBgClass(status) {
  if (status === 0) return "bg-error";
  if (status >= 200 && status < 300) return "bg-success";
  if (status >= 300 && status < 400) return "bg-redirect";
  if (status === 401 || status === 403) return "bg-unauthorized";  // Cambiado: naranja/amarillo
  return "bg-error";
}

export async function testAndRenderCell(cell, url, isRoot = false, useDelay = false, displayPath = null) {
  const { status } = await checkUrlViaProxy(url, useDelay);
  const bgClass = getBgClass(status);
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
  const icon = (status >= 200 && status < 300) ? "" : (status >= 300 && status < 400) ? "🔄" : (status === 401 || status === 403) ? "🔒" : "❌";
  cell.innerHTML = `<span class="status-bg ${bgClass}">${icon} <a href="${url}" target="_blank">${displayUrl}</a></span>`;
  return { status, isError: (status >= 400 && status !== 403 && status !== 401) || status === 0 };
}
