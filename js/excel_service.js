// excel_service.js — Import Excel robuste (split EM + corrections + alertes via AlertService)
// adapté au DBService v5 (putEM / putCM / putMeta)

const ExcelService = (() => {

  async function importExcelFile(file) {
    console.log("[Excel] Import démarré :", file?.name);
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });

    const sheetName = workbook.SheetNames[1] || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error("Aucune feuille trouvée dans l'Excel");

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 9, defval: "" });
    if (rows.length < 4) throw new Error("Feuille Excel vide ou mal formée");

    // Supprimer la colonne COMMENT si présente
    const commentIdx = (rows[0] || []).findIndex(h => String(h ?? "").trim().toUpperCase() === "COMMENT");
    if (commentIdx !== -1) {
      for (let r = 0; r < rows.length; r++) {
        if (Array.isArray(rows[r]) && rows[r].length > commentIdx) {
          rows[r].splice(commentIdx, 1);
        }
      }
      console.log(`[Excel] Colonne 'COMMENT' ignorée`);
    }

    // --- Localiser la ligne contenant "EM Name & ID"
    let headers, cmHeaders;
    let headerRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === "EM Name & ID") {
        headers = rows[i];
        cmHeaders = rows[i + 1] || [];
        headerRowIndex = i;
        break;
      }
    }
    if (!headers) {
      throw new Error("[Excel] Impossible de trouver la ligne d'en-têtes (EM Name & ID)");
    }

    const { blocks, stats } = detectBlocks(cmHeaders);
    console.log(`[Excel] ${blocks.length} blocs détectés (vides ignorés: ${stats.ignored}, French manquants: ${stats.missingFrench})`);

    // Supprimer les lignes d’en-têtes, garder uniquement les données
    rows.splice(0, headerRowIndex + 2);

    const ems = [];
    const cms = [];

    const emSet = new Set();
    const cmSet = new Set();

    let lastEm = null;

    // Parsing des données
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      let emNum, emName, emTitle, emAlerts;
      const emIdRaw = row[0] || "";
      if (emIdRaw) {
        const split = splitEmIdName(emIdRaw, i + 10);
        emNum = split.id;
        emName = split.name;
        emTitle = split.title;
        emAlerts = split.alerts;
        lastEm = { emNum, emName, emTitle, emAlerts };
      } else if (lastEm) {
        ({ emNum, emName, emTitle, emAlerts } = lastEm);
      } else {
        continue;
      }

      const tagVersion = row[1] || "";
      const indexRange = row[2] || "";

      // --- Ajout EM uniquement si nouvel EM trouvé
      if (emIdRaw) {
        if (emSet.has(emNum)) {
          AlertService.create({
            type: "Consistance",
            message: `Import Excel — Doublon EM détecté : ${emNum}`,
            details: `Le même EM a été rencontré plusieurs fois (ligne ${i + 10})`,
            source: "Excel",
            file: "TagNames",
            level: "error",
            row: i + 10
          });
        }
        emSet.add(emNum);

        // ✅ Règle spéciale : EM "Common" → gris foncé
        const bg = (emNum === "Common") ? "#555555" : ColorService.getColor(emNum);

        const em = {
          id: emNum,
          emId: emNum,
          name: emName,
          title: emTitle,
          description: "",
          release: tagVersion,
          index: indexRange,
          color: bg,
          textColor: "#fff"
        };
        ems.push(em);

        // 🔗 Ajout des alertes détectées lors du splitEmIdName
        if (emAlerts.length > 0) {
          for (const a of emAlerts) {
            AlertService.create({
              ...a,
              source: "Excel",
              file: "TagNames",
              level: "info"
            });
          }
        }
      }

      // Parcours dynamique des blocs détectés
      blocks.forEach((block, bIdx) => {
        const roleName = (row[block.cols.role] || "").toString().trim();
        const pidTag = (row[block.cols.pid] || "").toString().trim();

        const validPid = /^[A-Z]{2}\d{3}$/;
        if (!validPid.test(pidTag)) {
          if (roleName || pidTag) {
            console.log(`[Excel] CM ignoré (réserve) : ${pidTag} pour EM ${emNum}`);
          }
          return;
        }

        const cmId = `${emNum}__${block.type.toUpperCase()}${bIdx + 1}_${pidTag}_${i}`;

        if (cmSet.has(cmId)) {
          AlertService.create({
            type: "Consistance",
            message: `Import Excel — Doublon CM détecté (même cmId) : ${cmId}`,
            details: `CM en double détecté (ligne ${i + 10})`,
            source: "Excel",
            file: "TagNames",
            level: "error",
            row: i + 10
          });
        }
        cmSet.add(cmId);

        const desc = (row[block.cols.description] || "").toString().trim();
        const fr = block.cols.french ? (row[block.cols.french] || "").toString().trim() : "";
        const displayName = (row[block.cols.display] || "").toString().trim();

        const cm = {
          id: cmId,
          cmId,
          emId: emNum,
          roleName,
          description: desc,
          pidTag,
          displayName,
          frenchDescription: fr,
          type: block.type,
          label: roleName ? `${pidTag} ${roleName}` : pidTag,
          shortDescription: fr || desc
        };
        cms.push(cm);
      });
    }

    // --- Journalisation avancée
    const log = {
      id: genId(),
      type: "excel_import_log",
      timestamp: new Date().toISOString(),
      stats: {
        ems: ems.length,
        cms: cms.length,
        blocsAnalysés: blocks.length,
        blocsVidesIgnorés: stats.ignored,
        blocsFrenchManquants: stats.missingFrench
      }
    };

    console.log("[Excel] Résumé import : ", log.stats);

        // --- Sauvegarde DB avec la nouvelle structure
    for (const em of ems) {
      await DBService.putEM(em);
    }
    for (const cm of cms) {
      await DBService.putCM(cm);
    }

    // 🔄 Journal d'import intégré dans control_data
    await DBService.put("control_data", {
      ...log,
      category: "import_excel",
      emsCount: ems.length,
      cmsCount: cms.length
    });


    return { ems, cms, log };
  }

  // --- Détection dynamique des blocs CM / Instruments ---
  function detectBlocks(cmHeaders) {
    const blocks = [];
    let ignored = 0;
    let missingFrench = 0;
    let i = 3;

    while (i < cmHeaders.length) {
      const cell = String(cmHeaders[i] || "").trim();
      if ((cell === "RoleName" || cell === "Name  & I/O Name") &&
          String(cmHeaders[i + 2]).trim() === "PID_CM_Tag") {

        const block = { start: i, type: (cell === "RoleName" ? "Actuator" : "Instrument"), cols: {} };
        block.cols.role = i;
        block.cols.description = i + 1;
        block.cols.pid = i + 2;
        block.cols.display = i + 3;
        if (cmHeaders[i + 4] === "French description") {
          block.cols.french = i + 4;
          i += 5;
        } else {
          block.cols.french = null;
          missingFrench++;
          i += 4;
        }
        blocks.push(block);
      } else {
        i++;
      }
    }
    return { blocks, stats: { ignored, missingFrench } };
  }

  function genId() {
    return "id_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
  }

  function splitEmIdName(raw, sourceRow) {
    if (!raw) return { id: "", name: "", title: "", alerts: [] };
    const s = String(raw).trim();
    const alerts = [];

    const m = s.match(/^(\d+)/);
    if (!m) return { id: s, name: "", title: s, alerts };

    const id = m[1];
    let rest = s.slice(m[0].length);
    const cleaned = rest.replace(/^[\s\-\u2013\u2014_:;.,]+/, "");

    let title, name;
    if (/^[-\u2013\u2014]/.test(rest)) {
      title = `${id}-${cleaned}`;
      name = cleaned;
      if (s !== title) {
        alerts.push({
          type: "Formalisation",
          message: `Import Excel — Nom EM corrigé : "${s}" → "${title}"`,
          details: "Nom EM corrigé automatiquement",
          source: "Excel",
          file: "TagNames",
          level: "info",
          row: sourceRow
        });
      }
    } else {
      title = `${id} ${cleaned}`.trim();
      name = cleaned;
    }
    return { id, name, title, alerts };
  }

  return { importExcelFile };
})();

window.ExcelService = ExcelService;
