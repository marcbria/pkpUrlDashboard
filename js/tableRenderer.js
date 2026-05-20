// ============================================================
// tableRenderer.js - Table rendering and UI logic (sin columna pkpCheckUrl)
// ============================================================

import { replaceAlias, testAndRenderCell } from './helpers.js';

// ... (código existente sin cambios hasta la función buildTable)

export async function buildTable(groups, prodBase, testBase, alias, hasExternal, externalFullBase, signal = null) {
  // ... (código existente hasta la creación de las promesas)

  // Modificamos la llamada a testAndRenderCell para pasar la señal
  for (let group of groups) {
    // ... (código existente)

    for (let ep of group.endpoints) {
      // ... (código existente)

      const promises = [
        testAndRenderCell(tdProd, prodUrl, isRootUrl, false, displayPathProd, signal),
        testAndRenderCell(tdTest, testUrl, isRootUrl, false, displayPathTest, signal)
      ];
      if (hasExternal && externalUrl) {
        promises.push(testAndRenderCell(tdExternal, externalUrl, isRootUrl, true, displayPathExt, signal));
      } else {
        promises.push(Promise.resolve({ status: 0, isError: false }));
      }

      const promise = Promise.all(promises).then(([prod, test, external]) => {
        // ... (código existente)
      }).catch(err => {
        // Si la promesa se rechaza por un AbortError, simplemente no hacemos nada
        if (err.name === 'AbortError') {
          console.log('Test aborted');
          return;
        }
        throw err;
      });
      allPromises.push(promise);
    }
    // ... (código existente)
  }

  // Al final, esperamos todas las promesas, pero si alguna falla por aborto, las demás también fallarán
  try {
    await Promise.all(allPromises);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('All tests aborted');
      document.getElementById("progressMsg").innerText = "Tests stopped by user.";
      // No hacemos nada más, la tabla se queda como está
      return;
    }
    throw err;
  }

  // ... (resto del código)
}
