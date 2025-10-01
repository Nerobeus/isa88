// main.js — Orchestrateur principal
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
      const target = document.querySelector(btn.dataset.target);
      if (target) target.classList.add("active");

      // 🔹 Resize forcé quand on ouvre l’onglet Instances
      if (btn.dataset.target === "#tab-instances" && window.InstancesOverlay?.resize) {
        console.log("[Instances] Onglet Instances activé → resize forcé");
        setTimeout(() => window.InstancesOverlay.resize(), 50);
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

  if (!fileInput) return;

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    filenameLabel.textContent = file.name;
    setStatus("pid-status", "Chargement du P&ID…");

    try {
      console.log("[PID] Import démarré :", file.name);

      if (window.PIDService?.importPID) {
        await PIDService.importPID(file);
        setStatus("pid-status", "P&ID chargé ✅", 4000);
      } else {
        setStatus("pid-status", "Service PID indisponible ❌", 6000);
      }
    } catch (err) {
      console.error("[PID] Erreur import :", err);
      setStatus("pid-status", "Erreur de chargement ❌", 6000);
    }
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (window.PIDService?.resetView) PIDService.resetView();
      else if (window.resetPIDView) window.resetPIDView();
    });
  }
}

// === Import Instances ===
function initInstances() {
  const fileInput = document.getElementById("pdf-file");
  const filenameLabel = document.getElementById("pdf-filename");

  if (!fileInput) return;

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    filenameLabel.textContent = file.name;
    setStatus("pdf-status", "Analyse des Instances…");

    try {
      console.log("[Instances] Import démarré :", file.name);

      if (window.InstanceService?.parseFile) {
        const { variants, pageNum, file: pdfFile } = await InstanceService.parseFile(file);
        console.log("[Instances] Résultat import :", { variants, pageNum });

        if (window.InstancesOverlay?.render) {
          setTimeout(async () => {
            await InstancesOverlay.render(pdfFile, pageNum, variants);
            console.log("[Instances] PDF rendu dans le canvas");
          }, 100);
        }

        if (window.renderResults) renderResults(variants);
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

// === Initialisation générale ===
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[App] DOM prêt");

  try {
    if (window.DBService?.openDB) {
      await DBService.openDB();
      console.log("[App] DB ouverte au démarrage");
    }
  } catch (e) {
    console.warn("[App] Ouverture DB au démarrage impossible", e);
  }

  initTabs();
  initExcel();
  initPID();
  initInstances();

  console.log("[App] Initialisation terminée");
});
