// instances_service.js — Importation des PDF d’analyses fonctionnelles
// v13 — centralisation dans control_data
console.log("[Instances] service chargé (v13)");

(function (global) {
  const InstanceService = {
    lastResult: null,
    fileMap: new Map(),

    async parseFile(file, revision = 1) {
      console.log("[Instances] Import démarré :", file?.name);

      const pdfData = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

      // --- Détection EM ---
      let detectedEm = await detectEmId(pdf);
      if (!detectedEm) {
        console.warn("[Instances] Aucun EM détecté → fallback UNKNOWN");
        detectedEm = { id: "0000", title: "UNKNOWN", name: "UNKNOWN" };
        await DBService.put("alerts", {
          id: genId("alert"),
          type: "Mapping",
          message: "EM introuvable dans la base",
          details: "Impossible de relier l’instance PDF à un EM Excel",
          source: "Instances",
          file: file?.name,
          level: "error",
          date: new Date().toISOString()
        });
      }
      console.log("[Instances] EM détecté:", detectedEm);

      const finalEmId = detectedEm.id;
      const finalEmTitle = detectedEm.title || file.name;

      // --- Recherche de la vraie page LIST OF VARIANTS ---
      let foundPageNum = null;
      let headerInfo = null;

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent({ disableCombineTextItems: true });
        const fullText = textContent.items.map(it => it.str).join(" ");

        // 🔹 Skip sommaire
        if (isSummaryPage(fullText)) {
          console.log("[Instances] Page", pageNum, "détectée comme sommaire → skip complet");
          continue;
        }

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
            headerInfo = header;
            break;
          } else {
            console.log("[Instances] Mention LIST OF VARIANTS page", pageNum, "mais pas de header → skip");
          }
        }
      }

      if (!foundPageNum) {
        console.warn("[Instances] Aucune vraie table de variants détectée");
        await persistDocument({
          emId: finalEmId,
          title: finalEmTitle,
          filename: file.name,
          revision,
          pdfData,
          pageNum: 1,
          variants: []
        });
        const blob = new Blob([pdfData], { type: "application/pdf" });
        this.fileMap.set(finalEmId, { file: blob, pdfData, variants: [], pageNum: 1, title: finalEmTitle });
        return { variants: [], pageNum: 1, file: blob, em: detectedEm };
      }

      // --- Extraction variants ---
      const variants = await InstanceServiceCore.extractVariants(
        pdf, foundPageNum, finalEmId, finalEmTitle, revision
      );
      console.log("[Instances] Variants extraits:", variants.length);

      // ✅ Variants déjà sauvegardés dans control_data par Core

      // --- Sauvegarde document ---
      await persistDocument({
        emId: finalEmId,
        title: finalEmTitle,
        filename: file.name,
        revision,
        pdfData,
        pageNum: foundPageNum,
        variants
      });

      const blob = new Blob([pdfData], { type: "application/pdf" });
      this.fileMap.set(finalEmId, { file: blob, pdfData, variants, pageNum: foundPageNum, title: finalEmTitle });

      this.lastResult = { variants, pageNum: foundPageNum, file: blob, em: detectedEm };

      dispatchEvent(new CustomEvent("instances:variantsUpdated", {
        detail: { emId: finalEmId, count: variants.length }
      }));

      // --- Extraction des autres sections ---
      await extractOtherSections(pdf, foundPageNum, finalEmId, finalEmTitle, revision, file?.name);

      // --- Affichage UI des résultats extraits ---
      if (global.UITable) {
        const parsedPages = [];

        (this.lastResult.variants || this.lastResult.results || []).forEach(r => {
          parsedPages.push({
            pageNum: r.pageNum || 0,
            type: r.type || "Variants",
            rows: r.rows || r.lines || []
          });
        });

        UITable.renderAnalysisTables(parsedPages);
      }

      return this.lastResult;
    }
  };

  // --- Skip sommaire ---
  function isSummaryPage(fullText) {
    if (/TABLE OF CONTENTS|SOMMAIRE|INDEX/i.test(fullText)) return true;
    if (/\.{3,}\s*\d+/.test(fullText)) return true;
    if (/CHAPTER|SECTION/i.test(fullText)) return true;
    return false;
  }

  // --- Extraction des autres sections génériques ---
  async function extractOtherSections(pdf, startPage, emId, emTitle, revision, fileName) {
    const otherSections = [
      { re: /CONTROL MODULES/i, fn: InstanceServiceCore.extractControlModules, category: "control_modules" },
      { re: /MEASUREMENTS/i, fn: InstanceServiceCore.extractMeasurements, category: "measurements_switches" },
      { re: /CHARACTERISTICS/i, fn: InstanceServiceCore.extractCharacteristics, category: "characteristics" },
      { re: /MACHINE PARAMETERS/i, fn: InstanceServiceCore.extractMachineParameters, category: "machine_parameters" },
      { re: /EXTERNAL INITIAL/i, fn: InstanceServiceCore.extractExternalInitialConditions, category: "external_initial_conditions" },
      { re: /EXTERNAL ERROR/i, fn: InstanceServiceCore.extractExternalErrorConditions, category: "external_error_conditions" },
      { re: /EXTERNAL EXCHANGES/i, fn: InstanceServiceCore.extractExternalExchanges, category: "external_exchanges" },
      { re: /ALARM MESSAGES/i, fn: InstanceServiceCore.extractAlarmMessages, category: "alarm_messages" }
    ];

    for (let p = startPage; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent({ disableCombineTextItems: true });
      const fullText = tc.items.map(it => it.str).join(" ");

      if (isSummaryPage(fullText)) {
        console.log("[Instances] Page", p, "détectée comme sommaire → skip extractions");
        continue;
      }

      for (const sec of otherSections) {
        if (sec.re.test(fullText)) {
          console.log("[Instances] Section détectée:", sec.category, "page", p);
          try {
            const recs = await sec.fn(pdf, p, emId, emTitle, revision);
            console.log("[Instances] ", recs.length, "lignes extraites pour", sec.category, "page", p);
            // ✅ Déjà sauvegardés dans control_data
          } catch (e) {
            await DBService.put("alerts", {
              id: genId("alert"),
              type: "Parsing",
              message: `Erreur extraction ${sec.category}`,
              details: e?.message || String(e),
              source: "Instances",
              file: fileName,
              level: "error",
              date: new Date().toISOString()
            });
          }
        }
      }
    }
  }

  // --- Persistance document ---
  async function persistDocument({ emId, title, filename, revision, pdfData, pageNum, variants }) {
    const docId = `instance_${emId}`;
    const docRecord = {
      id: docId,
      type: "instance",
      ref: emId,
      title,
      filename,
      revision,
      pageNum,
      variants,
      date: new Date().toISOString()
    };
    await DBService.put("documents", docRecord);
  }

  // --- Utilitaires EM ---
  const EM_RE = /(EMT[_A-Z0-9]+)/i;
  function findEmCandidate(text) {
    if (!text) return null;
    const m = EM_RE.exec(text);
    return m ? m[1] : null;
  }
  function detectEmNumber(text) {
    const match = /FDS[_\s]*([0-9]{1,4})/i.exec(text);
    if (match) return "1" + parseInt(match[1], 10).toString().padStart(3, "0");
    return null;
  }
// --- Détection EM / EMT avec support FDS et resolveCandidate ---
  async function detectEmId(pdf, file) {
    try {
      const page = await pdf.getPage(1);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(i => i.str).join(" ");

      // 1. Regex élargie pour capter EMT et EM
      let match = text.match(/([0-9]{3,4}-(?:EMT|EM)[A-Za-z0-9_]+)/);

      // 2. Fallback : format style EMT_CCA ou EM_CCA
      if (!match) {
        match = text.match(/(EMT?_[A-Za-z0-9]+)/);
      }

      // 3. Fallback : nom de fichier
      if (!match && file?.name) {
        const nameMatch = file.name.match(/(EMT?_[A-Za-z0-9]+)/);
        if (nameMatch) {
          match = nameMatch;
        }
      }

      // 4. Extraction du numéro FDSxxx dans le nom du fichier
      let fdsId = null;
      if (file?.name) {
        const fdsMatch = file.name.match(/FDS0*([0-9]+)/i);
        if (fdsMatch) {
          const num = parseInt(fdsMatch[1], 10);
          fdsId = (1000 + num).toString(); // ex: FDS003 → 1003
        }
      }

      // 5. Construction du résultat
      if (match) {
        const tag = match[1].toUpperCase();
        if (typeof resolveCandidate === "function") {
          const resolved = resolveCandidate(tag);
          if (resolved && resolved.id && resolved.title) {
            // enrichir avec le numéro FDS si dispo
            if (fdsId && !resolved.id.startsWith(fdsId)) {
              const fullId = `${fdsId}-${resolved.title}`;
              return { id: fullId, title: fullId, name: resolved.title };
            }
            return resolved;
          }
        }
        if (fdsId) {
          const fullId = `${fdsId}-${tag}`;
          return { id: fullId, title: fullId, name: tag };
        } else {
          return { id: tag, title: tag, name: tag };
        }
      }
    } catch (e) {
      console.warn("[Instances] Impossible de détecter EM", e);
    }

    // Fallback final
    return { id: "0000", title: "UNKNOWN", name: "UNKNOWN" };
  }


  // --- Normalisation locale (complément resolveCandidate) ---
  function normalizeLocalEM(raw, fdsId) {
    const s = String(raw).replace(/\s+/g, "");

    // Cas : 1001-EMT_CCA
    let m = s.match(/^([0-9]{3,4})[-–]((?:EMT|EM)[-_]?[A-Za-z0-9_]+)$/i);
    if (m) {
      const idNum = m[1];
      const tag = m[2].replace(/–/g, "-").replace(/^-+/, "");
      const fullId = `${idNum}-${tag}`;
      return { id: fullId, title: fullId, name: tag };
    }

    // Cas : EM_CCA
    m = s.match(/^(EMT?|EM)[-_]?[A-Za-z0-9_]+$/i);
    if (m) {
      const tag = s.toUpperCase().replace(/–/g, "-").replace(/^-+/, "");
      if (fdsId) {
        const fullId = `${fdsId}-${tag}`;
        return { id: fullId, title: fullId, name: tag };
      } else {
        return { id: tag, title: tag, name: tag };
      }
    }

    return null;
  }



  function resolveCandidate(ems, candidateName, candidateNum) {
    const foundByName = candidateName ? ems.find(e => e.title === candidateName || e.name === candidateName) : null;
    const foundByNum = candidateNum ? ems.find(e => e.id === candidateNum) : null;
    if (foundByName) return foundByName;
    if (foundByNum) return foundByNum;
    return null;
  }
  async function extractTexts(pdf, pageNum) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent({ disableCombineTextItems: true });
    return textContent.items.map(it => it.str);
  }

  function genId(prefix = "id") {
    return prefix + "_" + Math.random().toString(36).slice(2, 9) + "_" + Date.now();
  }

  global.InstanceService = InstanceService;
})(window);
