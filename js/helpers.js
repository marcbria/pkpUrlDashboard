// ============================================================
// helpers.js - Utility functions
// ============================================================

import { PROXY_PATH, EXTERNAL_DELAY_US } from './constants.js';

export function normalizeExternalBase(raw) {
  // ... (código existente sin cambios)
}

export function getFullExternalBase(externalBaseUrl) {
  // ... (código existente sin cambios)
}

export function getTestBase(alias, prodUrl, optionalTestUrl) {
  // ... (código existente sin cambios)
}

export async function registerExternalDomain(domain) {
  // ... (código existente sin cambios)
}

export function replaceAlias(pathTemplate, alias) {
  // ... (código existente sin cambios)
}

// Modificamos esta función para aceptar una signal
export async function checkUrlViaProxy(url, useDelay = false, signal = null) {
  let proxyUrl = `${PROXY_PATH}?url=${encodeURIComponent(url)}`;
  if (useDelay) proxyUrl += `&delay=${EXTERNAL_DELAY_US}`;
  try {
    // Pasar la señal al fetch
    const res = await fetch(proxyUrl, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { status: data.status };
  } catch (err) {
    // Si el error es por aborto, lo relanzamos para manejarlo específicamente
    if (err.name === 'AbortError') {
      throw err;
    }
    return { status: 0 };
  }
}

export function getBgClass(status) {
  // ... (código existente sin cambios)
}

// Modificamos esta función para propagar la signal
export async function testAndRenderCell(cell, url, isRoot = false, useDelay = false, displayPath = null, signal = null) {
  let statusData;
  try {
    statusData = await checkUrlViaProxy(url, useDelay, signal);
  } catch (err) {
    if (err.name === 'AbortError') {
      // Si se aborta, mostramos un mensaje y relanzamos para que la promesa se rechace
      cell.innerHTML = `<span class="status-bg bg-error">⏹️ Stopped</span>`;
      throw err;
    }
    statusData = { status: 0 };
  }
  const { status } = statusData;
  const bgClass = getBgClass(status);
  let displayUrl = displayPath;
  // ... (resto del código para renderizar la celda)
  // ... (código existente para determinar icon)
  cell.innerHTML = `<span class="status-bg ${bgClass}">${icon} <a href="${url}" target="_blank">${displayUrl}</a></span>`;
  return { status, isError: (status >= 400 && status !== 403 && status !== 401) || status === 0 };
}
