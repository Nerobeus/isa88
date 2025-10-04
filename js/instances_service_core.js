// instances_service_core.js — extraction des tableaux d’analyses fonctionnelles
// v1.0 — retourne uniquement les résultats, pas d’écriture DB directe
(function(global){

  // --- Détection sommaire ---
  function isSummaryPage(fullText) {
    if (/TABLE OF CONTENTS|SOMMAIRE|INDEX/i.test(fullText)) return true;
    if (/\.{3,}\s*\d+/.test(fullText)) return true;
    if (/CHAPTER|SECTION/i.test(fullText)) return true;
    return false;
  }

  // --- LIST OF VARIANTS ---
  async function extractVariants(pdf, startPage, emId, emTitle, revision) {
    const STOP_RE = /CONTROL MODULES?|MEASUREMENTS?|CHARACTERISTICS?|MACHINE PARAMETERS?|EXTERNAL/i;
    const results = [];
    let headerInfo = null;

    for (let p = startPage; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent({ disableCombineTextItems: true });
      const fullText = tc.items.map(it => it.str).join(" ");

      if (isSummaryPage(fullText)) {
        console.log(`[InstancesCore] Page ${p} est un sommaire → skip Variants`);
        continue;
      }
      if (p !== startPage && STOP_RE.test(fullText)) {
        console.log("[InstancesCore] Fin de section Variants détectée page", p);
        break;
      }

      const items = tc.items.map(it => ({
        text: (it.str || "").trim(),
        x: it.transform[4],
        y: it.transform[5]
      }));

      const headerThisPage = VariantParsing.detectVariantHeader(items) || headerInfo;
      if (!headerThisPage) continue;
      headerInfo = headerThisPage;

      const rows = await VariantParsing.extractVariantsByPositions(page, headerThisPage);
      console.log(`[InstancesCore] Page ${p} → ${rows.length} variants détectés`);

      for (const r of rows) {
        const index = results.length + 1;
        const thumb = await VariantParsing.generateVariantThumbnail(pdf, p, r.bbox);

        results.push({
          category: "variants",
          emId,
          emTitle,
          index,
          revision,
          variantId: r.variantId || "",
          description: r.description || "",
          bbox: r.bbox,
          page: p,
          thumbnail: thumb,
          createdAt: new Date().toISOString()
        });
      }
    }

    console.log(`[InstancesCore] ${results.length} variants extraits`);
    return results;
  }

  // ------------------------------------------------------------------
  // Sections génériques
  // ------------------------------------------------------------------

  async function extractControlModules(pdf, startPage, emId, emTitle, revision) {
    return await extractGenericTableWithBBox(pdf, startPage, emId, emTitle, revision,
      ["CMT", "Role Name", "Display Name", "Instance Tag", "Description"],
      "control_modules",
      /MEASUREMENTS?|CHARACTERISTICS?|MACHINE PARAMETERS?|EXTERNAL/i
    );
  }

  async function extractMeasurements(pdf, startPage, emId, emTitle, revision) {
    return await extractGenericTableWithBBox(pdf, startPage, emId, emTitle, revision,
      ["Generic Tag", "Instance Tag", "Description", "Data type"],
      "measurements_switches",
      /CHARACTERISTICS?|MACHINE PARAMETERS?|EXTERNAL/i
    );
  }

  async function extractCharacteristics(pdf, startPage, emId, emTitle, revision) {
    return await extractGenericTableWithBBox(pdf, startPage, emId, emTitle, revision,
      ["Name", "Value", "Unit", "Description"],
      "characteristics",
      /MACHINE PARAMETERS?|EXTERNAL/i
    );
  }

  async function extractMachineParameters(pdf, startPage, emId, emTitle, revision) {
    return await extractGenericTableWithBBox(pdf, startPage, emId, emTitle, revision,
      ["Name", "Default", "Unit", "Description"],
      "machine_parameters",
      /EXTERNAL/i
    );
  }

  async function extractExternalInitialConditions(pdf, startPage, emId, emTitle, revision) {
    return await extractGenericTableWithBBox(pdf, startPage, emId, emTitle, revision,
      ["Condition", "Description"],
      "external_initial_conditions",
      /EXTERNAL ERROR CONDITIONS?|EXTERNAL EXCHANGES?|ALARM/i
    );
  }

  async function extractExternalErrorConditions(pdf, startPage, emId, emTitle, revision) {
    return await extractGenericTableWithBBox(pdf, startPage, emId, emTitle, revision,
      ["Condition", "Description"],
      "external_error_conditions",
      /EXTERNAL EXCHANGES?|ALARM/i
    );
  }

  async function extractExternalExchanges(pdf, startPage, emId, emTitle, revision) {
    return await extractGenericTableWithBBox(pdf, startPage, emId, emTitle, revision,
      ["Exchange", "Description"],
      "external_exchanges",
      /ALARM/i
    );
  }

  async function extractAlarmMessages(pdf, startPage, emId, emTitle, revision) {
    return await extractGenericTableWithBBox(pdf, startPage, emId, emTitle, revision,
      ["Alarm ID", "Message", "Severity"],
      "alarm_messages",
      /END|$/i
    );
  }

  // ------------------------------------------------------------------
  // Fonction générique de parsing avec skip sommaire
  // ------------------------------------------------------------------

  async function extractGenericTableWithBBox(pdf, startPage, emId, emTitle, revision, headers, category, stopRe) {
    console.log(`[InstancesCore] Extraction ${category} à partir de la page ${startPage}`);
    const results = [];

    for (let p = startPage; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent({ disableCombineTextItems: true });
      const fullText = tc.items.map(it => it.str).join(" ");

      if (isSummaryPage(fullText)) {
        console.log(`[InstancesCore] Page ${p} est un sommaire → skip ${category}`);
        continue;
      }

      const { rows, positions } = parseTableByColumnsWithBBox(tc.items, headers);
      console.log(`[InstancesCore] Page ${p} → ${rows.length} lignes détectées pour ${category}`);

      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        const pos = positions[idx];

        results.push({
          category,
          emId,
          emTitle,
          revision,
          ...row,
          page: p,
          bbox: pos.bbox,
          createdAt: new Date().toISOString()
        });
      }

      if (stopRe.test(fullText)) {
        console.log(`[InstancesCore] Stop regex atteint pour ${category} page ${p}`);
        break;
      }
    }

    console.log(`[InstancesCore] ${results.length} enregistrements ${category} extraits`);
    return results;
  }

  // ------------------------------------------------------------------
  // Parsing utilitaire
  // ------------------------------------------------------------------

  function parseTableByColumnsWithBBox(items, headers) {
    const rows = [];
    const positions = [];
    const lines = {};

    items.forEach(it => {
      const y = Math.round(it.transform[5]);
      if (!lines[y]) lines[y] = [];
      lines[y].push({
        text: (it.str || "").trim(),
        x: it.transform[4],
        y: it.transform[5],
        w: it.width || 8,
        h: (it.height || 10)
      });
    });

    const sortedY = Object.keys(lines).map(Number).sort((a,b)=>b-a);
    for (const y of sortedY) {
      const tokens = lines[y].sort((a,b)=>a.x-b.x);
      const row = {};
      const bbox = { x: Infinity, y, w: 0, h: 0 };

      let i = 0;
      for (const h of headers) {
        if (tokens[i]) {
          row[h] = tokens[i].text;
          bbox.x = Math.min(bbox.x, tokens[i].x);
          bbox.w = Math.max(bbox.w, (tokens[i].x + tokens[i].w) - bbox.x);
          bbox.h = Math.max(bbox.h, tokens[i].h);
          i++;
        } else {
          row[h] = "";
        }
      }
      if (Object.values(row).some(v => v)) {
        rows.push(row);
        positions.push({ bbox, headers });
      }
    }

    return { rows, positions };
  }

  // ------------------------------------------------------------------
  // Expose API publique
  // ------------------------------------------------------------------

  global.InstanceServiceCore = {
    extractVariants,
    extractControlModules,
    extractMeasurements,
    extractCharacteristics,
    extractMachineParameters,
    extractExternalInitialConditions,
    extractExternalErrorConditions,
    extractExternalExchanges,
    extractAlarmMessages
  };

})(window);
