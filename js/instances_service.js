// instances_service.js — Importation des PDF d’analyses fonctionnelles
// v20 — centralisation control_data + alert_service + documents avec pdfBlob + reload depuis IndexedDB
console.log("[Instances] service chargé (v20)");

(function (global) {
  const InstanceService = {
    lastResult: null,
    fileMap: new Map(),

    async parseFile(file, revision = 1) {
      console.log("[Instances] Import démarré :", file?.name);

      const pdfData = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

      // --- Détection EM ---
      let detectedEm = await detectEmId(pdf, file);
      if (!detectedEm) {
        console.warn("[Instances] Aucun EM détecté → fallback UNKNOWN");
        detectedEm = { id: "0000", title: "UNKNOWN", name: "UNKNOWN" };
        await AlertService.create({
          type: "Mapping",
          message: "EM introuvable dans la base",
          details: "Impossible de relier l’instance PDF à un EM Excel",
          source: "Instances",
          file: file?.name,
          level: "error"
        });
      }
      console.log("[Instances] EM détecté:", detectedEm);

      const finalEmId = detectedEm.id;
      const finalEmTitle = detectedEm.title || file.name;

      // --- Recherche de la vraie page LIST OF VARIANTS ---
      let foundPageNum = null;
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent({ disableCombineTextItems: true });
        const fullText = textContent.items.map(it => it.str).join(" ");

        if (isSummaryPage(fullText)) continue;

        if (/LIST OF VARIANTS/i.test(fullText)) {
          const items = textContent.items.map(it => ({
            text: (it.str || "").trim(),
            x: it.transform[4],
            y: it.transform[5]
          }));
          const header = VariantParsing.detectVariantHeader(items);
          if (header) {
            console.log("[Instances] Table des variants détectée page", pageNum);
            foundPageNum = pageNum;
            break;
          }
        }
      }

      if (!foundPageNum) {
        console.warn("[Instances] Aucune vraie table de variants détectée");
        const emptyRecord = buildControlDataRecord(file, finalEmId, finalEmTitle, revision, { variants: [] });
        await DBService.put("control_data", emptyRecord);

        // Sauvegarde document avec PDF
        await persistDocument({
          emId: finalEmId,
          title: finalEmTitle,
          filename: file.name,
          revision,
          pageNum: 1,
          pdfData
        });

        this.lastResult = emptyRecord;
        return this.lastResult;
      }

      // --- Extraction variants ---
      const variants = await InstanceServiceCore.extractVariants(
        pdf, foundPageNum, finalEmId, finalEmTitle, revision
      );
      console.log("[Instances] Variants extraits:", variants.length);

      // --- Sauvegarde document (avec pdfBlob) ---
      await persistDocument({
        emId: finalEmId,
        title: finalEmTitle,
        filename: file.name,
        revision,
        pageNum: foundPageNum,
        pdfData
      });

      // --- Extraction autres sections ---
      const otherSections = await extractOtherSections(
        pdf, foundPageNum, finalEmId, finalEmTitle, revision, file?.name
      );

      // --- Construction record unique ---
      const record = buildControlDataRecord(file, finalEmId, finalEmTitle, revision, {
        variants,
        ...otherSections
      });

      await DBService.put("control_data", record);
      console.log("[Instances] control_data sauvegardé:", record);

      // --- Mémorisation (en mémoire) ---
      const blob = new Blob([pdfData], { type: "application/pdf" });
      this.fileMap.set(finalEmId, { file: blob, pdfData, variants, pageNum: foundPageNum, title: finalEmTitle });
      this.lastResult = record;

      dispatchEvent(new CustomEvent("instances:variantsUpdated", {
        detail: { emId: finalEmId, count: variants.length }
      }));

      // --- Affichage UI ---
      if (global.UITable) {
      const parsedPages = [];

      const types = this.lastResult?.types || {};
      Object.entries(types).forEach(([key, arr]) => {
        if (Array.isArray(arr) && arr.length) {
          parsedPages.push({
            type: key,
            rows: arr,
            pageNum: arr[0]?.page || 0
          });
        }
      });

      UITable.renderAnalysisTables(parsedPages);
    }

      return this.lastResult;
    },

    // --- Nouvelle API pour recharger un PDF depuis IndexedDB ---
    async loadPdfFromDb(emId) {
      const docId = `instance_${emId}`;
      const doc = await DBService.get("documents", docId);
      if (!doc) {
        console.warn("[Instances] Aucun document trouvé pour", emId);
        return null;
      }
      if (!doc.pdfBlob) {
        console.warn("[Instances] Pas de pdfBlob stocké pour", emId);
        return null;
      }

      const arrayBuffer = await doc.pdfBlob.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const fileObj = {
        file: doc.pdfBlob,
        pdfData: arrayBuffer,
        variants: (doc.types && doc.types.variants) || [],
        pageNum: doc.pageNum,
        title: doc.title
      };

      this.fileMap.set(emId, fileObj);
      console.log("[Instances] PDF rechargé depuis IndexedDB pour", emId);
      return fileObj;
    }
  };

  // --- Construction record control_data ---
  function buildControlDataRecord(file, emId, emTitle, revision, types) {
    return {
      id: file.name,
      file: file.name,
      emId,
      title: emTitle,
      revision,
      types: {
        variants: types.variants || [],
        measurements_switches: types.measurements_switches || [],
        machine_parameters: types.machine_parameters || [],
        external_initial_conditions: types.external_initial_conditions || [],
        external_error_conditions: types.external_error_conditions || [],
        external_exchanges: types.external_exchanges || [],
        alarm_messages: types.alarm_messages || [],
        control_modules: types.control_modules || [],
        characteristics: types.characteristics || []
      }
    };
  }

  // --- Skip sommaire ---
  function isSummaryPage(fullText) {
    return (
      /TABLE OF CONTENTS|SOMMAIRE|INDEX/i.test(fullText) ||
      /\.{3,}\s*\d+/.test(fullText) ||
      /CHAPTER|SECTION/i.test(fullText)
    );
  }

  // --- Extraction autres sections ---
  async function extractOtherSections(pdf, startPage, emId, emTitle, revision, fileName) {
    const sections = [
      { re: /CONTROL MODULES/i, fn: InstanceServiceCore.extractControlModules, key: "control_modules" },
      { re: /MEASUREMENTS/i, fn: InstanceServiceCore.extractMeasurements, key: "measurements_switches" },
      { re: /CHARACTERISTICS/i, fn: InstanceServiceCore.extractCharacteristics, key: "characteristics" },
      { re: /MACHINE PARAMETERS/i, fn: InstanceServiceCore.extractMachineParameters, key: "machine_parameters" },
      { re: /EXTERNAL INITIAL/i, fn: InstanceServiceCore.extractExternalInitialConditions, key: "external_initial_conditions" },
      { re: /EXTERNAL ERROR/i, fn: InstanceServiceCore.extractExternalErrorConditions, key: "external_error_conditions" },
      { re: /EXTERNAL EXCHANGES/i, fn: InstanceServiceCore.extractExternalExchanges, key: "external_exchanges" },
      { re: /ALARM MESSAGES/i, fn: InstanceServiceCore.extractAlarmMessages, key: "alarm_messages" }
    ];

    const out = {};
    for (const sec of sections) out[sec.key] = [];

    for (let p = startPage; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent({ disableCombineTextItems: true });
      const fullText = tc.items.map(it => it.str).join(" ");
      if (isSummaryPage(fullText)) continue;

      for (const sec of sections) {
        if (!sec.re.test(fullText)) continue;
        console.log("[Instances] Section détectée:", sec.key, "page", p);
        try {
          const recs = await sec.fn(pdf, p, emId, emTitle, revision);
          if (Array.isArray(recs)) out[sec.key] = out[sec.key].concat(recs);
        } catch (e) {
          await AlertService.create({
            type: "Parsing",
            message: `Erreur extraction ${sec.key}`,
            details: e?.message || String(e),
            source: "Instances",
            file: fileName,
            level: "error"
          });
        }
      }
    }
    return out;
  }

  // --- Persistance document (avec pdfBlob) ---
  async function persistDocument({ emId, title, filename, revision, pageNum, pdfData }) {
    const docId = `instance_${emId}`;
    const docRecord = {
      id: docId,
      type: "instance",
      ref: emId,
      title,
      filename,
      revision,
      pageNum,
      date: new Date().toISOString(),
      pdfBlob: new Blob([pdfData], { type: "application/pdf" })
    };
    await DBService.put("documents", docRecord);
  }

  // --- Détection EM ---
  async function detectEmId(pdf, file) {
    let tag = null;
    try {
      const page = await pdf.getPage(1);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(i => i.str).join(" ");
      let match = text.match(/([0-9]{3,4}-(?:EMT|EM)[A-Za-z0-9_]+)/);
      if (!match) match = text.match(/(EMT?_[A-Za-z0-9]+)/);
      if (!match && file?.name) match = file.name.match(/(EMT?_[A-Za-z0-9]+)/);
      if (match) tag = match[1].toUpperCase();
    } catch (_) {}

    let fdsId = null;
    if (file?.name) {
      const fdsMatch = file.name.match(/FDS[_-]*0*([0-9]+)/i);
      if (fdsMatch) {
        const num = parseInt(fdsMatch[1], 10);
        fdsId = (1000 + num).toString();
        console.log("[Instances] FDS détecté:", fdsId);
      }
    }

    if (tag) {
      const name = tag;
      const fullId = fdsId ? `${fdsId}-${name}` : name;
      return { id: fullId, title: fullId, name };
    }
    return { id: "0000", title: "UNKNOWN", name: "UNKNOWN" };
  }

  function genId(prefix = "id") {
    return prefix + "_" + Math.random().toString(36).slice(2, 9) + "_" + Date.now();
  }

  global.InstanceService = InstanceService;
})(window);
