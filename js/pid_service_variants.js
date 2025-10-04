// pid_service_variants.js — gestion des variantes (v4 rationalisé)
console.log("[DEBUG] pid_service_variants.js chargé (v4)");

window.PIDVariants = (() => {
  // regex réutilisées
  const PIDTAG_RX     = /^[A-Z]{2}\d{3}$/;
  const PIDTAG_ANY_RX = /^[A-Z]{2}\d{3}[A-Z]?$/;

  // --- Normalisation simple (canonKey)
  function canonKey(s) {
    return (s || "")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // --- Collecte de clés (utilisé par canonicalizeVariantCMS sur les blobs)
  function collectCMKeys(cm) {
    const keys = new Set();
    const candidates = [
      cm?.roleName, cm?.RoleName,
      cm?.displayName, cm?.DisplayName,
      cm?.name, cm?.Name,
      cm?.ioName, cm?.IOName, cm?.nameIO, cm?.NameIO,
      cm?.description, cm?.Description
    ];
    for (const c of candidates) {
      if (!c) continue;
      const k = canonKey(String(c));
      if (k && k.length >= 3) keys.add(k);
    }
    return keys;
  }

  /**
   * Convertit une définition de variant de la DB en set de pidTag de base (ex: 'PT123')
   * en utilisant les maps construites à partir des CMs Excel.
   */
  function canonicalizeVariantCMS(emId, v, roleToPidByEm, idToPidByEm, keySetByEm) {
    let list = v?.cms;
    let blobParts = [];
    const pushBlob = (val) => { if (val) blobParts.push(String(val)); };

    // Harmonisation des formats possibles
    if (!list) {
      if (Array.isArray(v?.CMs))               list = v.CMs;
      else if (Array.isArray(v?.cmIds))        list = v.cmIds;
      else if (typeof v?.cmIds === "string")   list = v.cmIds.split(/[\s,;\r\n]+/);
      else if (Array.isArray(v?.cmsPidTags))   list = v.cmsPidTags;
      else if (typeof v?.cms === "string")     list = v.cms.split(/[\s,;\r\n]+/);
      else if (typeof v?.CMs === "string")     list = v.CMs.split(/[\s,;\r\n]+/);
      else if (Array.isArray(v?.cm))           list = v.cm;
      else if (typeof v?.cm === "string")      list = v.cm.split(/[\s,;\r\n]+/);
      else                                     list = [];
    } else if (!Array.isArray(list) && typeof list === "string") {
      list = list.split(/[\s,;\r\n]+/);
    }

    // Blob texte pour matching "plein-texte"
    if (typeof v?.cms === "string") pushBlob(v.cms);
    if (typeof v?.CMs === "string") pushBlob(v.CMs);
    if (typeof v?.description === "string") pushBlob(v.description);
    if (typeof v?.text === "string") pushBlob(v.text);
    if (Array.isArray(list)) pushBlob(list.join(" "));
    if (Array.isArray(v?.cms)) {
      for (const it of v.cms) {
        if (typeof it === "string") pushBlob(it);
        else if (it && typeof it === "object") pushBlob(Object.values(it).join(" "));
      }
    }

    const descNorm = canonKey(blobParts.join(" ").trim());
    const rmap = roleToPidByEm.get(emId) || new Map();
    const imap = idToPidByEm.get(emId) || new Map();
    const kmap = keySetByEm.get(emId) || new Map();

    const out = new Set();

    // Résolution de chaque entrée
    for (const raw of (list || [])) {
      if (raw == null) continue;

      // Objet → tenter pidTag/roleName/cmId
      if (typeof raw === "object") {
        const up = s => String(s || "").toUpperCase();
        const pidCandidate = up(raw.pidTag || raw.tag || raw.pid || raw.PID || raw.Tag || raw.cmTag);
        if (PIDTAG_ANY_RX.test(pidCandidate)) { out.add(pidCandidate.slice(0, 5)); continue; }

        const rn = canonKey(raw.roleName || raw.RoleName || raw.name || raw.Name || "");
        if (rn) { const m = rmap.get(rn); if (m) { out.add(m); continue; } }

        const cid = String(raw.cmId || raw.CM_ID || raw.id || "");
        if (cid) { const m = imap.get(cid); if (m) { out.add(m); continue; } }
        continue;
      }

      // String → tenter pidTag / cmId numérique / roleName canonique
      const itemStr = String(raw);
      const tokUP = itemStr.toUpperCase();
      if (PIDTAG_ANY_RX.test(tokUP)) { out.add(tokUP.slice(0, 5)); continue; }

      if (/^\d+$/.test(itemStr)) {
        const m = imap.get(itemStr);
        if (m) { out.add(m); continue; }
      }

      const rn = canonKey(itemStr);
      const m = rmap.get(rn);
      if (m) { out.add(m); continue; }
    }

    // Matching "plein-texte" (faible) avec keySetByEm
    if (descNorm && descNorm.length >= 5) {
      for (const [pid, keySet] of kmap.entries()) {
        for (const key of keySet) {
          if (!key || key.length < 3) continue;
          if (descNorm.includes(key)) {
            out.add(pid);
            break;
          }
        }
      }
    }

    return out;
  }

  // --- Extraction d'un numéro de variant (V3, -01-R2, R004 → 3 ou 4)
  function extractVariantNumber(rawVariantName) {
    if (!rawVariantName) return null;
    let m = /(?:^|[\s-])V(\d+)(?:$|[\s-])/i.exec(rawVariantName);
    if (m) return parseInt(m[1], 10);

    // Tolérance : "1003-04-R1", "R004" → 4 (moins fiable, mais utile si Vn absent)
    m = /-(\d+)-R\d+/i.exec(rawVariantName);
    if (m) return parseInt(m[1], 10);

    m = /R0*(\d+)/i.exec(rawVariantName);
    if (m) return parseInt(m[1], 10);

    return null;
  }

  // --- Normalise un label variant → "Vn" ou null
  function normalizeVariantLabelToVn(v) {
    const label = v?.label ?? v?.variant ?? v?.name ?? v?.id ?? "";
    const n = extractVariantNumber(label);
    return (Number.isInteger(n) && n > 0) ? ("V" + n) : null;
  }

  /**
   * Trouve le meilleur variant pour un EM donné (retourne "Vn" ou null).
   * - Compare les CMs détectés (base tags) aux CMs déclarés par chaque variant.
   * - Applique une stratégie exact → subset → meilleur score (Jaccard).
   * - Ne renvoie **que** "Vn" (normalisé) ou `null`.
   */
  function findVariantFor(
    emId,
    detectedCmsBase,
    variantMap,
    roleToPidByEm,
    idToPidByEm,
    keySetByEm,
    PARTIAL_RATIO = 0.1
  ) {
    const variants = variantMap.get(emId) || [];
    if (!variants.length) return null;

    const detectedSet = new Set(detectedCmsBase || []);
    if (detectedSet.size === 0) return null;

    // Pré-calcul des sets par variant
    const vSets = variants.map(v => ({
      v,
      set: canonicalizeVariantCMS(emId, v, roleToPidByEm, idToPidByEm, keySetByEm)
    }));

    // 1) Match exact
    for (const { v, set } of vSets) {
      if (set.size === detectedSet.size && [...detectedSet].every(cm => set.has(cm))) {
        return normalizeVariantLabelToVn(v);
      }
    }

    // 2) detected ⊆ variant
    for (const { v, set } of vSets) {
      const subset = [...detectedSet].every(cm => set.has(cm));
      if (subset) {
        return normalizeVariantLabelToVn(v);
      }
    }

    // 3) meilleur Jaccard ≥ PARTIAL_RATIO
    let best = { score: 0, v: null };
    for (const { v, set } of vSets) {
      const inter = [...detectedSet].filter(cm => set.has(cm)).length;
      const union = new Set([...detectedSet, ...set]).size || 1;
      const score = inter / union;
      if (score > best.score) best = { score, v };
    }

    if (best.v && best.score >= PARTIAL_RATIO) {
      return normalizeVariantLabelToVn(best.v);
    }

    // Rien de fiable
    return null;
  }

  return {
    collectCMKeys,
    canonicalizeVariantCMS,
    findVariantFor,
    extractVariantNumber
  };
})();
