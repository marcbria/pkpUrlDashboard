// ============================================================
// main.js - Entry point and event handlers
// ============================================================

import { journals, loadJournalsFromCSV, loadEndpointsFromJSON, updateProdTestUrls, endpointGroups } from './dataLoader.js';
import { getTestBase, normalizeExternalBase, getFullExternalBase, registerExternalDomain } from './helpers.js';
import { setExternalState, setCurrentErrorOnly, updateActiveFilters, buildTable, applyErrorFilter } from './tableRenderer.js';

let externalBaseUrl = "";
let externalContext = "";
let currentAbortController = null;

// Función para leer parámetros de modos de la URL y aplicar a los checkboxes
function applyModeParamsFromUrl() {
  // ... (código existente sin cambios)
}

// Obtener estado actual de los checkboxes
function getCurrentFilterState() {
  // ... (código existente sin cambios)
}

async function runAllTests() {
  // Si ya hay una prueba en curso, la cancelamos antes de iniciar una nueva
  if (currentAbortController) {
    currentAbortController.abort();
  }

  // Crear un nuevo AbortController
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  // Cambiar estado de los botones
  const runBtn = document.getElementById("runTestsBtn");
  const stopBtn = document.getElementById("stopTestsBtn");
  runBtn.disabled = true;
  stopBtn.disabled = false;
  runBtn.classList.add("disabled");
  stopBtn.classList.add("active");

  // Mostrar elementos UI
  document.getElementById("toolbar").style.display = "flex";
  document.getElementById("tableWrapper").style.display = "block";
  document.getElementById("summaryPanel").style.display = "flex";
  
  updateActiveFilters();
  // ... (código existente para obtener alias, etc.)

  setExternalState(externalBaseUrl, externalContext);

  // Guardar estado en la URL incluyendo los modos activos (código existente)
  // ...

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
    // Restaurar estado de los botones al finalizar (tanto si termina bien como si es abortado)
    runBtn.disabled = false;
    stopBtn.disabled = true;
    runBtn.classList.remove("disabled");
    stopBtn.classList.remove("active");
    currentAbortController = null;
  }
}

function resetExternalToDemo() {
  // ... (código existente sin cambios)
}

async function initialize() {
  // ... (código existente sin cambios)
}

function populateSelectAndStart() {
  // ... (código existente para selectores y botones)

  // Añadir evento para el botón Stop
  const stopBtn = document.getElementById("stopTestsBtn");
  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      if (currentAbortController) {
        currentAbortController.abort();
      }
    });
  }

  // ... (resto del código)
}

populateSelectAndStart();
