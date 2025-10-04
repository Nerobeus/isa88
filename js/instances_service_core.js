// instances_service_core.js — extraction des tableaux d’analyses fonctionnelles
// baseline 0.9.1 — retourne les données (pas d'écriture DB) + export complet

(function(global){

  // --- Détection sommaire ---
  function isSummaryPage(fullText) {
    if (/TABLE OF CONTENTS|SOMMAIRE|INDEX/i.test(fullText)) return true;
    if (/\.{3,}\s*\d+/.test(fullText)) return true; // "..... 12"
    if (/CHAPTER|SECTION/i.test(fullText)) return true;
    return false;
  }

  // --- util id ---
  function safeGenId(prefix) {
    if (global.DBService && typeof DBService.genId === "function") return DBService.genId(prefix);
    return `${prefix}_${Math.random().toString(36).slice(2,9)}_${Date.now()}`;
  }

  // ------------------------------------------------------------------
  // LIST OF VARIANTS
  // startPage = page réelle de la table (détectée côté orchestrateur)
  // ------------------------------------------------------------------
  async function extractVariants(pdf, startPage, emId, emTitle, revision) {
    const STOP_RE = /CONTROL MODULES?|MEASUREMENTS?|CHARACTERISTICS?|MACHINE PARAMETERS?|EXTERNAL/i;
    const results = [];
    let headerInfo = null;

    for (let p = startPage; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent({ disableCombineTextItems: true });
      const fullText = tc.items.map(it => it.str).join(" ");

      if (isSummaryPage(fullText)) {
        console.log(`[InstancesCore] Page ${p} sommaire → skip Variants`);
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

      const headerThisPage = (global.VariantParsing?.detectVariantHeader(items)) || headerInfo;
      if (!headerThisPage) continue;
      headerInfo = headerThisPage;

      const rows = await global.VariantParsing.extractVariantsByPositions(page, headerThisPage);
      console.log(`[InstancesCore] Page ${p} → ${rows.length} variants détectés`);

      for (const r of rows) {
        const idx = results.length + 1;
        // La vignette peut être coûteuse; on laisse l’orchestrateur décider de la générer si besoin
        results.push({
          id: `${emId}-${String(idx).padStart(2,"0")}-R${revision}`,
          category: "variants",
          emId,
          emTitle,
          index: idx,
          revision,
          variantId: r.variantId || "",
          description: r.description || "",
          bbox: r.bbox,
          page: p,
          createdAt: new Date().toISOString()
        });
      }
    }
    return results;
  }

  // ------------------------------------------------------------------
  // Sections génériques
  // ------------------------------------------------------------------

  async function extractControlModules(pdf, startPage, emId, emTitle, revision) {
    return extractGenericTableWithBBox(
      pdf, startPage, emId, emTitle, revision,
      ["CMT", "Role Name", "Display Name", "Instance Tag", "Description"],
      "control_modules",
      /MEASUREMENTS?|CHARACTERISTICS?|MACHINE PARAMETERS?|EXTERNAL/i
    );
  }

  async function extractMeasurements(pdf, startPage, emId, emTitle, revision) {
    return extractGenericTableWithBBox(
      pdf, startPage, emId, emTitle, revision,
      ["Generic Tag", "Instance Tag", "Description", "Data type"],
      "measurements_switches",
      /CHARACTERISTICS?|MACHINE PARAMETERS?|EXTERNAL/i
    );
  }

  async function extractCharacteristics(pdf, startPage, emId, emTitle, revision) {
    return extractGenericTableWithBBox(
      pdf, startPage, emId, emTitle, revision,
      ["Name", "Value", "Unit", "Description"],
      "characteristics",
      /MACHINE PARAMETERS?|EXTERNAL/i
    );
  }

  async function extractMachineParameters(pdf, startPage, emId, emTitle, revision) {
    return extractGenericTableWithBBox(
      pdf, startPage, emId, emTitle, revision,
      ["Name", "Default", "Unit", "Description"],
      "machine_parameters",
      /EXTERNAL/i
    );
  }

  async function extractExternalInitialConditions(pdf, startPage, emId, emTitle, revision) {
    return extractGenericTableWithBBox(
      pdf, startPage, emId, emTitle, revision,
      ["Condition", "Description"],
      "external_initial_conditions",
      /EXTERNAL ERROR CONDITIONS?|EXTERNAL EXCHANGES?|ALARM/i
    );
  }

  async function extractExternalErrorConditions(pdf, startPage, emId, emTitle, revision) {
    return extractGenericTableWithBBox(
      pdf, startPage, emId, emTitle, revision,
      ["Condition", "Description"],
      "external_error_conditions",
      /EXTERNAL EXCHANGES?|ALARM/i
    );
  }

  async function extractExternalExchanges(pdf, startPage, emId, emTitle, revision) {
    return extractGenericTableWithBBox(
      pdf, startPage, emId, emTitle, revision,
      ["Exchange", "Description"],
      "external_exchanges",
      /ALARM/i
    );
  }

  async function extractAlarmMessages(pdf, startPage, emId, emTitle, revision) {
    return extractGenericTableWithBBox(
      pdf, startPage, emId, emTitle, revision,
      ["Alarm ID", "Message", "Severity"],
      "alarm_messages",
      /END|$/i
    );
  }

  // ------------------------------------------------------------------
  // Fonction générique + parsing utilitaire
  // ------------------------------------------------------------------

  async function extractGenericTableWithBBox(pdf, startPage, emId, emTitle, revision, headers, category, stopRe) {
    console.log(`[InstancesCore] Extraction ${category} à partir de la page ${startPage}`);
    const results = [];

    for (let p = startPage; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent({ disableCombineTextItems: true });
      const fullText = tc.items.map(it => it.str).join(" ");

      if (isSummaryPage(fullText)) {
        console.log(`[InstancesCore] Page ${p} sommaire → skip ${category}`);
        continue;
      }

      const { rows, positions } = parseTableByColumnsWithBBox(tc.items, headers);
      if (rows.length) {
        console.log(`[InstancesCore] Page ${p} → ${rows.length} lignes détectées pour ${category}`);
      }

      for (let i = 0; i < rows.length; i++) {
        results.push({
          id: safeGenId(category),
          category,
          emId,
          emTitle,
          revision,
          ...rows[i],
          page: p,
          bbox: positions[i].bbox,
          createdAt: new Date().toISOString()
        });
      }

      if (stopRe.test(fullText)) {
        console.log(`[InstancesCore] Stop regex atteint pour ${category} page ${p}`);
        break;
      }
    }

    return results;
  }

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
  // Helper : extraction groupée (facultatif)
  // ------------------------------------------------------------------
  async function extractAllSections(pdf, startPages, emId, emTitle, revision) {
    // startPages = { variants: n, control_modules: n, ... } — laissé au caller
    return {
      id: `control_${emId}_R${revision}`,
      emId,
      emTitle,
      revision,
      createdAt: new Date().toISOString(),
      variants: await extractVariants(pdf, startPages?.variants ?? 1, emId, emTitle, revision),
      control_modules: await extractControlModules(pdf, startPages?.control_modules ?? 1, emId, emTitle, revision),
      measurements_switches: await extractMeasurements(pdf, startPages?.measurements_switches ?? 1, emId, emTitle, revision),
      characteristics: await extractCharacteristics(pdf, startPages?.characteristics ?? 1, emId, emTitle, revision),
      machine_parameters: await extractMachineParameters(pdf, startPages?.machine_parameters ?? 1, emId, emTitle, revision),
      external_initial_conditions: await extractExternalInitialConditions(pdf, startPages?.external_initial_conditions ?? 1, emId, emTitle, revision),
      external_error_conditions: await extractExternalErrorConditions(pdf, startPages?.external_error_conditions ?? 1, emId, emTitle, revision),
      external_exchanges: await extractExternalExchanges(pdf, startPages?.external_exchanges ?? 1, emId, emTitle, revision),
      alarm_messages: await extractAlarmMessages(pdf, startPages?.alarm_messages ?? 1, emId, emTitle, revision)
    };
  }

  // --- EXPORT COMPLET (comme avant) ---
  global.InstanceServiceCore = {
    extractVariants,
    extractControlModules,
    extractMeasurements,
    extractCharacteristics,
    extractMachineParameters,
    extractExternalInitialConditions,
    extractExternalErrorConditions,
    extractExternalExchanges,
    extractAlarmMessages,
    // bonus
    extractAllSections
  };

})(window);
