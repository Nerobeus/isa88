// db_service.js — gestion IndexedDB centralisée (v10 rationalisé avec control_data)
console.log("[db_service] script chargé (v10 rationalisé)");

const DBService = (() => {
  const DB_NAME = "emcm_db";
  const DB_VERSION = 10; // incrémenté car rationalisation control_data
  let db = null;

  // === Générateur d'ID unique ===
  function genId(prefix = "id") {
    return prefix + "_" + Math.random().toString(36).slice(2, 9) + "_" + Date.now();
  }

  // === Ouvre la base ===
  async function openDB() {
    if (db) return db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log("[IndexedDB] Init / upgrade (v10)");

        // Stores principaux
        if (!db.objectStoreNames.contains("ems")) db.createObjectStore("ems", { keyPath: "id" });
        if (!db.objectStoreNames.contains("cms")) db.createObjectStore("cms", { keyPath: "id" });
        if (!db.objectStoreNames.contains("units")) db.createObjectStore("units", { keyPath: "unitId" });

        // Documents PID / Instances
        if (!db.objectStoreNames.contains("documents")) db.createObjectStore("documents", { keyPath: "id" });
        if (!db.objectStoreNames.contains("pages")) db.createObjectStore("pages", { keyPath: "id" });
        if (!db.objectStoreNames.contains("positions")) db.createObjectStore("positions", { keyPath: "id" });
        if (!db.objectStoreNames.contains("renvois")) db.createObjectStore("renvois", { keyPath: "id" });

        // Données annexes
        if (!db.objectStoreNames.contains("alerts")) db.createObjectStore("alerts", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });

        // 🔹 Store unique pour toutes les données issues des analyses fonctionnelles
        if (!db.objectStoreNames.contains("control_data")) db.createObjectStore("control_data", { keyPath: "id" });

        // ✅ Nettoyage : supprimer stores obsolètes si encore présents
        const obsoleteStores = [
          "variants",
          "control_modules",
          "measurements_switches",
          "characteristics",
          "machine_parameters",
          "external_initial_conditions",
          "external_error_conditions",
          "external_exchanges",
          "alarm_messages"
        ];
        obsoleteStores.forEach(store => {
          if (db.objectStoreNames.contains(store)) {
            db.deleteObjectStore(store);
            console.log("[IndexedDB] Store obsolète supprimé :", store);
          }
        });
      };

      req.onsuccess = (event) => {
        db = event.target.result;
        console.log("[IndexedDB] emcm_db ouverte avec succès (v10)");
        resolve(db);
      };
      req.onerror = (event) => {
        console.error("[IndexedDB] Erreur ouverture DB", event);
        reject(event);
      };
    });
  }

  // === Helpers génériques ===
  async function put(store, record) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const obj = { ...record };
      if (!obj.id) obj.id = genId(store);
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(obj);
      tx.oncomplete = () => resolve(obj);
      tx.onerror = (e) => reject(e);
    });
  }

  async function get(store, id) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, "readonly").objectStore(store).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e);
    });
  }

  async function getAll(store) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, "readonly").objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e);
    });
  }

  async function resetDB() {
    if (db) db.close();
    return new Promise((resolve, reject) => {
      const del = indexedDB.deleteDatabase(DB_NAME);
      del.onsuccess = () => {
        console.log("[IndexedDB] Base supprimée");
        db = null;
        resolve(true);
      };
      del.onerror = (e) => reject(e);
    });
  }

  // === Méthodes spécialisées ===
  async function putEM(em) { return put("ems", em); }
  async function putCM(cm) { return put("cms", cm); }
  async function putUnit(unit) { return put("units", unit); }
  async function putAlert(a) { return put("alerts", a); }
  async function putMeta(m) { return put("meta", m); }

  async function saveDocument(doc) { return put("documents", doc); }
  async function savePages(docId, pages) {
    for (const p of pages) {
      await put("pages", { ...p, docId });
    }
  }
  async function putPosition(pos) { return put("positions", pos); }
  async function putRenvoi(r) { return put("renvois", r); }

  // 🔹 Nouveau : persistance unifiée des données d’analyses fonctionnelles
  async function putControlData(record) {
    if (!record.category) {
      console.warn("[DBService] putControlData sans category → rejeté", record);
      return null;
    }
    return put("control_data", record);
  }

  // ✅ Compatibilité ascendante : redirige putVariant vers control_data
  async function putVariant(v) {
    const obj = { ...v, category: "variants" };
    return put("control_data", obj);
  }

  // === Relations ===
  async function linkCMtoUnit(cmId, unitId) {
    const unit = await get("units", unitId) || { unitId, cms: [] };
    if (!unit.cms.includes(cmId)) unit.cms.push(cmId);
    await put("units", unit);
    return unit;
  }

  return {
    openDB,
    resetDB,
    get, getAll, put, genId,
    putEM, putCM, putUnit, putAlert, putMeta,
    saveDocument, savePages, putPosition, putRenvoi,
    putControlData, putVariant,
    linkCMtoUnit
  };
})();

window.DBService = DBService;
