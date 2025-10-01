// db_service.js — gestion IndexedDB centralisée
const DBService = (() => {
  const DB_NAME = "emcm_db";
  const DB_VERSION = 2; // ↗ incrémenté car on ajoute un store "instances"
  let db = null;

  async function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log("[IndexedDB] Initialisation / mise à jour du schéma");

        // Stores principaux
        if (!db.objectStoreNames.contains("ems")) {
          db.createObjectStore("ems", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("cms")) {
          db.createObjectStore("cms", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("alerts")) {
          db.createObjectStore("alerts", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "id" });
        }

        // Nouveau store pour les Instances PID
        if (!db.objectStoreNames.contains("instances")) {
          db.createObjectStore("instances", { keyPath: "id" });
        }

        // Nouveau store pour les Variants
        if (!db.objectStoreNames.contains("variants")) {
          db.createObjectStore("variants", { keyPath: "id" });
        }
      };

      req.onsuccess = (event) => {
        db = event.target.result;
        console.log("[IndexedDB] emcm_db ouverte avec succès");
        resolve(db);
      };

      req.onerror = (event) => {
        console.error("[IndexedDB] Erreur ouverture DB", event);
        reject(event);
      };
    });
  }

  async function save(store, items) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const os = tx.objectStore(store);

      items.forEach(item => os.put(item));

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e);
    });
  }

  // ✅ Ajout minimal
  async function put(store, record) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e);
    });
  }

  async function getAll(store) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const os = tx.objectStore(store);
      const req = os.getAll();

      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e);
    });
  }

  async function resetDB() {
    if (db) {
      db.close();
    }
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

  // === Instances PID ===
  async function getOrCreateInstance(emId, signature, tags) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("instances", "readwrite");
      const os = tx.objectStore("instances");

      const req = os.get(signature);
      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result);
        } else {
          const inst = {
            id: signature,
            globalId: "inst_" + Math.random().toString(36).slice(2),
            emId,
            tags,
            createdAt: new Date().toISOString()
          };
          os.put(inst);
          resolve(inst);
        }
      };
      req.onerror = (e) => reject(e);
    });
  }

  async function deleteInstance(id) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("instances", "readwrite");
      const os = tx.objectStore("instances");
      const req = os.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e);
    });
  }

  // === Récupère tous les rôles (à partir des CMs) ===
  async function getAllRoles() {
    const cms = await getAll("cms");
    return cms.map(cm => ({
      EM_ID: cm.emId,
      TagName: cm.pidTag || "",
      RoleOrSignal: cm.roleName || ""
    }));
  }

  return {
    openDB,
    save,
    put,   // ✅ export ajouté
    getAll,
    resetDB,
    getOrCreateInstance,
    deleteInstance,
    getAllRoles
  };
})();
