// main.js — Orchestrateur principal (v12 corrigé)
console.log("[App] Initialisation");

// Petit helper statut avec auto-clear
function setStatus(id, text, clearMs) {
  const el = document.getElementById(id);
  if (!el) return;
  const token = String(Date.now());
  el.dataset.token = token;
  el.textContent = text || "";
  if (clearMs) {
    setTimeout(() => {
      if (el.dataset.token === token) el.textContent = "";
    }, clearMs);
  }
}

// === Gestion des onglets ===
function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");

      const targetId = btn.dataset.target?.replace(/^#/, "");
      const target = document.getElementById(targetId);

      if (target) {
        target.classList.add("active");
      } else {
        console.warn("[Tabs] Aucun panel trouvé pour", btn.dataset.target);
      }

      if (targetId === "tab-instances" && window.InstancesOverlay?.resize) {
        console.log("[Instances] Onglet Instances activé → resize forcé");
        setTimeout(() => window.InstancesOverlay.resize(), 50);
      }

      if (targetId === "tab-alerts" && window.AlertUI?.renderAlertsTable) {
        console.log("[Alertes] Onglet Alertes activé → refresh");
        AlertUI.renderAlertsTable();
      }
    });
  });
}

// === Import Excel ===
function initExcel() {
  const fileInput = document.getElementById("excel-file");
  const filenameLabel = document.getElementById("excel-filename");

  if (!fileInput) return;

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    filenameLabel.textContent = file.name;
    setStatus("excel-status", "Import en cours…");

    try {
      console.log("[Excel] Import démarré :", file.name);

      if (window.ExcelService?.importExcelFile) {
        if (window.DBService?.openDB) await DBService.openDB();
        const result = await ExcelService.importExcelFile(file);
        console.log("[Excel] Résultat import :", result);

        if (window.UITree?.build) {
          UITree.build(result.ems, result.cms, "excel-tree");
        }

        setStatus("excel-status", "Import terminé ✅", 4000);
      } else {
        setStatus("excel-status", "Service Excel indisponible ❌", 6000);
      }
    } catch (err) {
      console.error("[Excel] Erreur import :", err);
      setStatus("excel-status", "Erreur à l'import ❌", 6000);
    }
  });
}

// === Import P&ID ===
function initPID() {
  const fileInput = document.getElementById("pid-file");
  const filenameLabel = document.getElementById("pid-filename");
  const resetBtn = document.getElementById("reset-zoom");
  const pidSelect = document.getElementById("pid-select");

  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      filenameLabel.textContent = file.name;
      setStatus("pid-status", "Chargement du P&ID…");

      try {
        console.log("[PID] Import démarré :", file.name);

        if (window.PIDService?.importPID) {
          await PIDService.importPID(file);
          await refreshPIDSelect();
          setStatus("pid-status", "P&ID chargé ✅", 4000);
        } else {
          setStatus("pid-status", "Service PID indisponible ❌", 6000);
        }
      } catch (err) {
        console.error("[PID] Erreur import :", err);
        setStatus("pid-status", "Erreur de chargement ❌", 6000);
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (window.PIDService?.resetView) PIDService.resetView();
      else if (window.resetPIDView) window.resetPIDView();
    });
  }

  if (pidSelect) {
    pidSelect.addEventListener("change", async () => {
      const id = pidSelect.value;
      if (!id) return;
      const doc = await DBService.get("documents", id);
      if (!doc || !doc.pdfData) {
        console.warn("[PID] Pas de pdfData pour", doc);
        return;
      }
      const blob = new Blob([doc.pdfData], { type: "application/pdf" });
      const file = new File([blob], doc.filename, { type: "application/pdf" });
      console.log("[PID] Rechargement depuis DB:", doc.filename);
      await PIDService.importPID(file, { pidNumber: doc.ref, revision: doc.revision });
    });
  }
}

// === Import Instances (multi fichiers) ===
function initInstances() {
  const fileInput = document.getElementById("pdf-file");
  const filenameLabel = document.getElementById("pdf-filename");
  const emSelect = document.getElementById("instances-em-select");

  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;

      filenameLabel.textContent =
        files.length === 1 ? files[0].name : `${files.length} fichiers sélectionnés`;
      setStatus("pdf-status", "Analyse des Instances…");

      try {
        if (window.InstanceService?.parseFile) {
          InstanceService.fileMap.clear();
          if (emSelect) {
            emSelect.innerHTML = "";
            const optDefault = document.createElement("option");
            optDefault.value = "";
            optDefault.textContent = "Sélectionnez un EM/EP";
            emSelect.appendChild(optDefault);
          }

          for (const file of files) {
            console.log("[Instances] Import fichier:", file.name);
            const { variants, pageNum, file: pdfFile, em } = await InstanceService.parseFile(file);

            if (em) {
              InstanceService.fileMap.set(em.id, { file: pdfFile, variants, pageNum, title: em.title });

              if (emSelect) {
                const opt = document.createElement("option");
                opt.value = em.id;
                opt.textContent = `${em.id} — ${em.title}`;
                emSelect.appendChild(opt);
              }
            }
          }

          setStatus("pdf-status", "Instances importées ✅", 4000);
        } else {
          setStatus("pdf-status", "Service Instances indisponible ❌", 6000);
        }
      } catch (err) {
        console.error("[Instances] Erreur import :", err);
        setStatus("pdf-status", "Erreur lors de l'analyse ❌", 6000);
      }
    });
  }

  if (emSelect) {
    emSelect.addEventListener("change", async () => {
      const emId = emSelect.value;
      if (!emId) return;

      let entry = InstanceService.fileMap.get(emId);
      if (!entry) {
        console.log("[Instances] EM non présent en mémoire → tentative reload DB:", emId);
        entry = await InstanceService.loadPdfFromDb(emId);
      }
      if (!entry) {
        console.warn("[Instances] PDF introuvable pour EM", emId);
        return;
      }

      console.log("[Instances] Changement sélection EM:", emId);

      // 🔹 PATCH overlay variants from control_data (structure imbriquée)
      let variants = entry.variants || [];
      if ((!variants || !variants.length) && window.DBService) {
        const allData = await DBService.getAll("control_data");
        const found = allData.find(
          d =>
            d.emId === emId ||
            d.id === emId ||
            d.file === `${emId}.pdf` ||
            (d.title && d.title.includes(emId))
        );

        if (found && found.types && found.types.variants) {
          variants = found.types.variants;
          console.log(`[Instances] ${variants.length} variants récupérés depuis control_data pour`, emId);
        } else {
          console.warn("[Instances] Aucun variants trouvé pour", emId);
        }
      }

      if (window.InstancesOverlay?.render && entry.file) {
        // 🔹 Charger toutes les données (variants + autres) depuis control_data
        let allData = [];
        if (window.DBService) {
          const allRecords = await DBService.getAll("control_data");
          const found = allRecords.find(
            d => d.emId === emId || d.id === emId || d.filename === entry.title
          );
          if (found && found.types) {
            Object.entries(found.types).forEach(([type, arr]) => {
              if (Array.isArray(arr) && arr.length) {
                allData.push({
                  type,
                  rows: arr,
                  pageNum: arr[0]?.page || 0
                });
              }
            });
            console.log(`[Instances] ${allData.length} sections chargées depuis control_data`);
          } else {
            console.warn("[Instances] Aucune donnée control_data trouvée pour", emId);
          }
        }

        // 🔹 Variants pour l’overlay uniquement
        let variants = [];
        const variantsSection = allData.find(s => s.type === "variants");
        if (variantsSection) variants = variantsSection.rows;

        await InstancesOverlay.render(entry.file, entry.pageNum, variants);

        // 🔹 Rafraîchir les tableaux UI
        if (window.UITable && allData.length) {
          UITable.renderAnalysisTables(allData);
        }
      } else {
        console.warn("[Instances] PDF non dispo pour EM", emId);
      }


      if (window.renderResults) renderResults(variants);
    });
  }
}

// === Reconstruction arborescence depuis la DB ===
async function loadTreeFromDB() {
  console.log("[App] Chargement arborescence depuis IndexedDB");
  try {
    const ems = await DBService.getAll("ems");
    const cms = await DBService.getAll("cms");
    console.log("[App] EMs récupérés :", ems?.length || 0, "CMs récupérés :", cms?.length || 0);

    if (ems?.length && window.UITree?.build) {
      UITree.build(ems, cms, "excel-tree");
      console.log("[App] Arborescence affichée depuis DB");
    }
  } catch (err) {
    console.error("[App] Erreur lors du chargement arborescence DB", err);
  }
}

// === Select PID depuis la DB ===
async function refreshPIDSelect() {
  const select = document.getElementById("pid-select");
  if (!select) return;

  const docs = await DBService.getAll("documents");
  const pids = (docs || []).filter(d => d.type === "pid");

  select.innerHTML = "<option value=''>-- Sélectionner un PID --</option>";
  for (const doc of pids) {
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = `${doc.ref} (${doc.filename})`;
    select.appendChild(opt);
  }
}

// === Populate Instances depuis DB ===
// === Populate Instances depuis DB ===
async function populateInstancesSelectFromDB() {
  const emSelect = document.getElementById("instances-em-select");
  if (!emSelect) return;

  const docs = await DBService.getAll("documents");
  const instances = (docs || []).filter(d => d.type === "instance");

  emSelect.innerHTML = "<option value=''>Sélectionnez un EM/EP</option>";

  for (const inst of instances) {
    const emId = inst.ref || "0000";
    const title = inst.title || inst.ref || "UNKNOWN";

    // 🔹 Recrée le blob PDF si présent
    let fileBlob = null;
    if (inst.pdfData) {
      try {
        fileBlob = new Blob([inst.pdfData], { type: "application/pdf" });
      } catch (err) {
        console.warn("[Instances] Erreur création blob PDF pour", emId, err);
      }
    }

    // 🔹 Charge les variants depuis control_data (pour overlay)
    let variants = [];
    if (window.DBService) {
      const allData = await DBService.getAll("control_data");
      const found = allData.find(
        d => d.emId === emId || d.id === emId || d.filename === inst.filename
      );
      if (found?.types?.variants) {
        variants = found.types.variants;
      }
    }

    // 🔹 Enregistre dans le cache mémoire
    InstanceService.fileMap.set(emId, {
      file: fileBlob,
      pageNum: inst.pageNum || 1,
      variants,
      title
    });

    // 🔹 Ajoute l'option dans le select
    const opt = document.createElement("option");
    opt.value = emId;
    opt.textContent = `${emId} — ${title}`;
    emSelect.appendChild(opt);
  }

  console.log(`[Instances] Select Instances peuplé au démarrage (${instances.length} entrées)`);
}


// === Hook alertes ===
function hookDBServiceForAlerts() {
  if (!window.DBService) return;

  const origPut = DBService.put;
  DBService.put = async (store, record) => {
    const res = await origPut.call(DBService, store, record);
    if (store === "alerts" && window.AlertUI?.renderAlertsTable) {
      console.log("[Alertes] Nouvelle alerte détectée → refresh");
      AlertUI.renderAlertsTable();
    }
    return res;
  };
}

// === Initialisation générale ===
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[App] DOM prêt");
  try {
    if (window.DBService?.openDB) {
      await DBService.openDB();
      console.log("[App] DB ouverte au démarrage");

      await loadTreeFromDB();
      await populateInstancesSelectFromDB();
      await refreshPIDSelect();
    }
  } catch (e) {
    console.error("[App] Erreur ouverture DB au démarrage :", e);
  }

  initTabs();
  initExcel();
  initPID();
  initInstances();
  hookDBServiceForAlerts();

  if (window.AlertUI?.initAlertsUI) {
    AlertUI.initAlertsUI();
    console.log("[App] UI Alertes initialisée");
  }
  console.log("[App] Initialisation terminée");
});
