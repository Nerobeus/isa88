// excel_service.js — Import Excel robuste (split EM + corrections + alertes Formalisation + ignore réserves + Common gris + héritage EM)

const ExcelService = (() => {

  async function importExcelFile(file) {
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
    const alerts = [];

    const emSet = new Set();
    const cmSet = new Set();

    let lastEm = null; // 🔑 Mémorise le dernier EM défini

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
        continue; // aucune EM définie, et pas d'héritage
      }

      const tagVersion = row[1] || "";
      const indexRange = row[2] || "";

      // --- Ajout EM uniquement si nouvel EM trouvé
      if (emIdRaw) {
        if (emSet.has(emNum)) {
          alerts.push({
            id: genId(),
            type: "Consistance",
            message: `Doublon EM détecté : ${emNum}`,
            source: "Excel",
            status: "Non traité"
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
          textColor: "#fff" // toujours blanc
        };
        ems.push(em);

        if (emAlerts.length > 0) alerts.push(...emAlerts);
      }

      // Parcours dynamique des blocs détectés
      blocks.forEach((block, bIdx) => {
        const roleName = (row[block.cols.role] || "").toString().trim(); // RoleName ou Name & I/O Name
        const pidTag = (row[block.cols.pid] || "").toString().trim();

        // ✅ Filtre : ignorer les CM réserves (pidTag hors format 2 lettres + 3 chiffres)
        const validPid = /^[A-Z]{2}\d{3}$/;
        if (!validPid.test(pidTag)) {
          if (roleName || pidTag) {
            console.log(`[Excel] CM ignoré (réserve) : ${pidTag} pour EM ${emNum}`);
          }
          return;
        }

        // --- Identifiant CM unique basé sur EM + bloc + pidTag + index ligne
        const cmId = `${emNum}__${block.type.toUpperCase()}${bIdx + 1}_${pidTag}_${i}`;

        // --- Contrôle unicité CM
        if (cmSet.has(cmId)) {
          alerts.push({
            id: genId(),
            type: "Consistance",
            message: `Doublon CM détecté (même cmId) : ${cmId}`,
            source: "Excel",
            status: "Non traité"
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
          roleName, // peut être vide
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
    const alertStats = alerts.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});
    const log = {
      id: genId(),
      type: "excel_import_log",
      timestamp: new Date().toISOString(),
      stats: {
        ems: ems.length,
        cms: cms.length,
        blocsAnalysés: blocks.length,
        blocsVidesIgnorés: stats.ignored,
        blocsFrenchManquants: stats.missingFrench,
        alertes: alerts.length,
        alertesParType: alertStats
      }
    };

    console.log("[Excel] Résumé import : ", log.stats);

    await DBService.save("ems", ems);
    await DBService.save("cms", cms);
    if (alerts.length > 0) await DBService.save("alerts", alerts);
    await DBService.save("meta", [log]);

    return { ems, cms, alerts, log };
  }

  // --- Détection dynamique des blocs CM / Instruments ---
  function detectBlocks(cmHeaders) {
    const blocks = [];
    let ignored = 0;
    let missingFrench = 0;
    let i = 3;

    while (i < cmHeaders.length) {
      const cell = String(cmHeaders[i] || "").trim();

      // Vérifie aussi que la 3e colonne est bien "PID_CM_Tag"
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

      } else if (!cell) {
        ignored++;
        i++;
      } else {
        i++;
      }
    }
    return { blocks, stats: { ignored, missingFrench } };
  }

  // --- Helpers
  function genId() {
    return "id_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
  }

  // Corrige les cas "1002 -EMT_TCU" → title "1002-EMT_TCU"
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
      alerts.push({
        id: genId(),
        type: "Formalisation",
        message: `Nom EM corrigé : "${s}" → "${title}"`,
        source: "Excel",
        status: "Non traité",
        row: sourceRow
      });
    } else {
      title = `${id} ${cleaned}`.trim();
      name = cleaned;
    }

    return { id, name, title, alerts };
  }

  function getReadableTextColor(color) {
    const hex = String(color || "").trim();
    let r, g, b;
    const mHex = /^#?([a-fA-F0-9]{6})$/.exec(hex);
    if (mHex) {
      const h = mHex[1];
      r = parseInt(h.slice(0,2), 16);
      g = parseInt(h.slice(2,4), 16);
      b = parseInt(h.slice(4,6), 16);
    } else {
      const mRgb = hex.match(/\d+/g);
      if (mRgb && mRgb.length >= 3) {
        r = +mRgb[0]; g = +mRgb[1]; b = +mRgb[2];
      } else {
        return "#000";
      }
    }
    const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
    return luminance > 0.5 ? "#000" : "#fff";
  }

  return { importExcelFile };
})();

// 🔧 Attachement global pour compatibilité avec main.js
window.ExcelService = ExcelService;
