// unit_parser.js — Détection des Units dans le texte PID
console.log("[UnitParser] chargé");

window.UnitParser = (() => {

  /**
   * Recherche une unité associée à un tag CM dans une liste de textes PDF.
   * Exemple attendu dans le PDF : "664C09 XM101"
   * @param {string} cmTag - Le tag du CM (ex: XM101)
   * @param {Array} textItems - Liste text.items de pdf.js
   * @returns {object|null} { unitId, cmTag } si trouvé
   */
  function findUnitForCM(cmTag, textItems) {
    if (!cmTag || !textItems) return null;

    const rx = /([0-9]{3}[A-Z0-9]{2})\s+([A-Z]{2}\d{3})/;

    for (const it of textItems) {
      const s = String(it.str || "").trim();
      if (!s) continue;
      const m = s.match(rx);
      if (m && m[2].toUpperCase() === cmTag.toUpperCase()) {
        return { unitId: m[1], cmTag: m[2] };
      }
    }
    return null;
  }

  return { findUnitForCM };
})();
