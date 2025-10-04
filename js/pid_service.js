// pid_service.js — Orchestration Import & affichage PID (v10 orchestrateur)
console.log("[DEBUG] pid_service.js chargé (v10)");

window.PIDService = (() => {
  const alertCache = new Set();

  function asMap(m) {
    if (m instanceof Map) return m;
    if (m && typeof m === "object") return new Map(Object.entries(m));
    return new Map();
  }

  async function importPID(file, { revision = 1 } = {}) {
    console.log("[PID] Import démarré :", file.name);

    const marginTop = 110, marginBottom = 110, marginLeft = 110, marginRight = 1030;
    const OFFSET_X = 0, OFFSET_Y = -10;
    const PARTIAL_RATIO = 0.1;

    // Reset UI
    const tree = document.getElementById("pid-tree");
    if (tree) tree.innerHTML = "";
    const statusEl = document.getElementById("pid-status");
    if (statusEl) statusEl.textContent = "";

    // 1) Lecture binaire + hash
    const buf = await file.arrayBuffer();
    const fileHash = await hashFileSHA256Buffer(buf);

    // 2) Doublons
    const docs = await DBService.getAll("documents");
    const existing = (docs || []).find(d => d.type === "pid" && d.hash === fileHash);

    // 3) Charger PDF
    const pdfData = existing?.pdfData || buf;
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

    // 4) Numéro PID
    const pidNumber = await PIDCore.detectPIDNumber(pdf, file.name);

    // 5) Sauvegarde DB
    let docRecord;
    if (existing) {
      docRecord = existing;
    } else {
      docRecord = { id: genId("pid"), type: "pid", ref: pidNumber, filename: file.name, hash: fileHash, revision, pdfData: buf };
      await DBService.saveDocument(docRecord);
    }

    // 6) Rendu
    const { canvas, off, getScale, getPanX, getPanY } = await PIDCore.renderPDF(file);

    // 7) Charger catalogue
    const allEms = await DBService.getAll("ems");
    const allCms = await DBService.getAll("cms");
    const allVariants = await DBService.getAll("variants");
    const allDocs = await DBService.getAll("documents");
    const allInstances = allDocs.filter(d => d.type === "instance");

    // 8) Maps
    let maps = {};
    try { maps = PIDRoles.buildMaps(allEms, allCms); } catch (e) {}
    const roleToPidByEm = asMap(maps?.roleToPidByEm);
    const idToPidByEm = asMap(maps?.idToPidByEm);
    const keySetByEm = asMap(maps?.keySetByEm);

    // 9) Cache CM
    const cmTags = new Map();
    for (const cm of allCms) {
      const norm = PIDRoles.norm(cm.pidTag || "").toLowerCase();
      if (norm) cmTags.set(norm, cm);
    }

    // 10) Extraction overlays
    const overlays = await PIDCore.extractCMOverlays(pdf, cmTags, { top: marginTop, bottom: marginBottom, left: marginLeft, right: marginRight });

    // 11) Instances
    const { emInstances, cmsInPid } = PIDCore.buildInstances(allCms, allEms, overlays);

    // 12) Variants
    const variantMap = new Map();
    for (const v of allVariants) {
      const emKey = v.emId || v.EM_ID || v.emID;
      if (!emKey) continue;
      if (!variantMap.has(emKey)) variantMap.set(emKey, []);
      variantMap.get(emKey).push(v);
    }

    const emsInPid = [];
    for (const inst of emInstances.values()) {
      const baseEmId = inst.id.replace(/_inst_.*/, "");
      const hasInstance = allInstances.some(d => d.ref === baseEmId || d.emId === baseEmId);
      let variantLabel = null;
      if (hasInstance) {
        try {
          variantLabel = PIDVariants.findVariantFor(baseEmId, inst.cms, variantMap, roleToPidByEm, idToPidByEm, keySetByEm, PARTIAL_RATIO);
        } catch (e) {}
      }
      emsInPid.push({ ...inst, baseEmId, title: inst.title + (variantLabel ? " " + variantLabel : "") });
    }

    // 13) Arborescence
    if (window.UITree?.build) UITree.build(emsInPid, cmsInPid, "pid-tree");

    // 14) Overlay
    PIDOverlayService.attachOverlay({ canvas, off, overlays, allCms, allEms, emsInPid, cmsInPid, getScale, getPanX, getPanY, OFFSET_X, OFFSET_Y, margins: { top: marginTop, bottom: marginBottom, left: marginLeft, right: marginRight } });

    if (statusEl) statusEl.textContent = `PID ${pidNumber} — Tags détectés: ${overlays.length} — EM/instances: ${emsInPid.length}`;

    return docRecord;
  }

  async function hashFileSHA256Buffer(buf) {
    const h = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, "0")).join("");
  }

  function genId(prefix = "id") {
    return prefix + "_" + Math.random().toString(36).slice(2, 9) + "_" + Date.now();
  }

  return { importPID };
})();
