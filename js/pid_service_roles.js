// pid_service_roles.js — gestion des rôles & normalisation
console.log("[DEBUG] pid_service_roles.js chargé");

window.PIDRoles = (() => {

  // Normalisation simple (sans accents, sans espaces/séparateurs)
  function norm(s) {
    return (s || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g,"")
      .replace(/\s|[-_\.]/g, "");
  }

  // Normalisation pour comparaison "blob" (minuscules, alphanum)
  function normBlob(s) {
    return (s || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/[^a-z0-9]/g,"");
  }

  // Charger les rôles depuis la DB et construire les maps exact/norm
  async function loadRoles() {
    const roles = await DBService.getAllRoles();

    const exact = new Map();
    const nm = new Map();
    const keys = [];

    for (const r of roles) {
      for (const k of [(r.TagName || "").trim(), (r.RoleOrSignal || "").trim()]) {
        if (!k) continue;
        exact.set(k, r.EM_ID);
        nm.set(norm(k).toLowerCase(), r.EM_ID);
        keys.push(k);
      }
    }
    const uniq = [...new Set(keys)].sort((a, b) => b.length - a.length);

    return { exact, nm, uniq };
  }

  // Construire les mappings rôle→pidTag, id→pidTag, keySet→pidTag
  function buildMaps(allEms, allCms) {
    const roleToPidByEm = new Map();
    const idToPidByEm = new Map();
    const keySetByEm = new Map();

    const canonKey = s => normBlob(s);

    function collectCMKeys(cm) {
      const keys = new Set();
      const candidates = [
        cm.roleName, cm.RoleName,
        cm.displayName, cm.DisplayName,
        cm.name, cm.Name,
        cm.ioName, cm.IOName, cm.nameIO, cm.NameIO,
        cm.description, cm.Description
      ];
      for (const c of candidates) {
        if (!c) continue;
        const k = canonKey(String(c));
        if (k && k.length >= 3) keys.add(k);
      }
      return keys;
    }

    const PIDTAG_RX = /^[A-Z]{2}\d{3}$/;

    for (const em of allEms) {
      const emId = em.id;
      const list = allCms.filter(c => c.emId === emId);

      const rmap = new Map();
      const imap = new Map();
      const kmap = new Map();

      for (const cm of list) {
        const basePid = String(cm.pidTag || "").toUpperCase();
        if (PIDTAG_RX.test(basePid)) {
          const rn = canonKey(cm.roleName || cm.RoleName || "");
          const dn = canonKey(cm.displayName || cm.DisplayName || "");
          if (rn) rmap.set(rn, basePid);
          if (dn) rmap.set(dn, basePid);

          if (cm.id)    imap.set(String(cm.id), basePid);
          if (cm.cmId)  imap.set(String(cm.cmId), basePid);
          if (cm.CM_ID) imap.set(String(cm.CM_ID), basePid);

          const keys = collectCMKeys(cm);
          kmap.set(basePid, keys);
        }
      }
      roleToPidByEm.set(emId, rmap);
      idToPidByEm.set(emId, imap);
      keySetByEm.set(emId, kmap);
    }

    return { roleToPidByEm, idToPidByEm, keySetByEm };
  }

  return { norm, normBlob, loadRoles, buildMaps };
})();
