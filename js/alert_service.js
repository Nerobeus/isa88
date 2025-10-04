// alert_service.js — Service centralisé pour la gestion des alertes
console.log("[alert_service] script chargé");

window.AlertService = (function () {

  // Génère un ID unique
  function genId() {
    return "alert_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  }

  /**
   * Crée et enregistre une nouvelle alerte dans la base
   * @param {Object} params - paramètres d'alerte
   * @param {string} params.type - Type d'alerte (Formalisation, Consistance, Mapping, Parsing…)
   * @param {string} params.message - Message principal
   * @param {string} [params.details] - Détails techniques ou explicatifs
   * @param {string} params.source - Origine (Excel, PID, Instances…)
   * @param {string} [params.file] - Nom du fichier concerné
   * @param {string} [params.level="error"] - Niveau (error, info)
   * @param {string} [params.status] - Statut (par défaut "Non traité" si error, "Information" si info)
   * @param {number} [params.row] - Ligne Excel ou contexte facultatif
   */
  async function create({ type, message, details = "", source, file = "", level = "error", status, row = null }) {
    if (!window.DBService) {
      console.error("[AlertService] DBService non disponible !");
      return null;
    }

    // statut par défaut selon le niveau
    if (!status) {
      status = (level === "info") ? "Information" : "Non traité";
    }

    const alert = {
      id: genId(),
      type,
      message,
      details,
      source,
      file,
      status,
      level,
      row,
      date: new Date().toISOString()
    };

    await DBService.put("alerts", alert);
    console.log("[AlertService] Alerte créée :", alert);
    return alert;
  }

  /**
   * Met à jour le statut d’une alerte
   * @param {string} id - ID de l'alerte
   * @param {string} status - Nouveau statut (Validé, Rejeté, Traité…)
   */
  async function updateStatus(id, status) {
    if (!window.DBService) return null;
    const alert = await DBService.get("alerts", id);
    if (!alert) return null;
    alert.status = status;
    alert.dateTraitee = new Date().toISOString();
    await DBService.put("alerts", alert);
    console.log("[AlertService] Statut mis à jour :", alert);
    return alert;
  }

  /**
   * Récupère toutes les alertes
   */
  async function getAll() {
    if (!window.DBService) return [];
    return DBService.getAll("alerts");
  }

  /**
   * Supprime toutes les alertes
   */
  async function reset() {
    if (!window.DBService) return;
    const all = await getAll();
    const tx = (await DBService.openDB()).transaction("alerts", "readwrite");
    const os = tx.objectStore("alerts");
    all.forEach(a => os.delete(a.id));
    return new Promise(resolve => {
      tx.oncomplete = () => {
        console.log("[AlertService] Toutes les alertes supprimées");
        resolve(true);
      };
    });
  }

  return { create, updateStatus, getAll, reset };
})();
