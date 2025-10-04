// ui_table.js — Tableaux CM / Instances / Variants (flex-table full width)
(function(global){
  // --- Injecte le CSS pour le mode flex-table ---
  function ensureFlexTableStyles(){
    if (document.getElementById("flex-table-styles")) return;
    const css = `
      /* Le tableau occupe 100% du conteneur et n'impose pas sa largeur intrinsèque */
      #results-table.flex-table {
        display: block;       /* important pour que thead/tbody contrôlent la largeur */
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
      }
      /* thead/tbody deviennent des blocs pleine largeur */
      #results-table.flex-table thead,
      #results-table.flex-table tbody {
        display: block;
        width: 100%;
      }
      /* chaque ligne occupe 100% et devient un flex container */
      #results-table.flex-table thead tr,
      #results-table.flex-table tbody tr {
        display: flex;
        align-items: stretch;
        width: 100%;
        box-sizing: border-box;
      }

      /* colonnes: 1=ID, 2=Miniature, 3=Éléments validés (flexible), 4=Alertes */
      #results-table.flex-table thead th:nth-child(1),
      #results-table.flex-table tbody td:nth-child(1) { flex: 0 0 72px; }
      #results-table.flex-table thead th:nth-child(2),
      #results-table.flex-table tbody td:nth-child(2) { flex: 0 0 200px; }
      /* colonne flexible qui prend tout le reste */
      #results-table.flex-table thead th:nth-child(3),
      #results-table.flex-table tbody td:nth-child(3) { flex: 1 1 0; min-width: 0; }
      #results-table.flex-table thead th:nth-child(4),
      #results-table.flex-table tbody td:nth-child(4) { flex: 0 0 80px; }

      #results-table.flex-table th,
      #results-table.flex-table td {
        padding: 6px 8px;
        border-bottom: 1px solid #e5e5e5;
        overflow: hidden;          /* évite tout débordement horizontal */
        text-overflow: ellipsis;
        word-break: break-word;
        box-sizing: border-box;
      }

      /* s'assure que le panneau latéral ne cause pas de scroll horizontal global */
      .layout-instances aside.card.side {
        overflow: hidden;
      }
    `;
    const style = document.createElement("style");
    style.id = "flex-table-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // --- Rendu du tableau CM ---
  function renderCMTable(cms){
    const container = document.getElementById("cm-table");
    if(!container) return;
    container.innerHTML = "";
    const table = document.createElement("table");
    table.className = "cm-table";
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>CM ID</th><th>Role</th><th>PID Tag</th><th>Type</th></tr>";
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    cms.forEach(cm => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${cm.cmId}</td><td>${cm.roleName||''}</td><td>${cm.pidTag||''}</td><td>${cm.type||''}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  // --- Rendu du tableau des variants (flex-table) ---
  async function renderVariantsTable(variants){
    ensureFlexTableStyles();

    const table = document.getElementById("results-table");
    if(!table) return;

    // active le mode flex-table et force 100%
    table.classList.add("flex-table");
    table.style.width = "100%";

    const tbody = table.querySelector("tbody");
    tbody.innerHTML = "";

    // 🟢 Charger tous les CMs de la base
    const cms = await DBService.getAll("cms");
    const roleNames = new Set(cms.map(cm => (cm.roleName || "").toUpperCase()));

    variants.forEach(v => {
      const tokens = (v.description || "").split(/[ ,;]+/).map(t => t.trim()).filter(Boolean);
      const validElems = tokens.filter(tok => roleNames.has(tok.toUpperCase()));

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>V${v.variantId}</td>
        <td>${
          v.thumbnail
            ? `<img src="${v.thumbnail}" style="width:190px;height:auto;cursor:pointer;box-shadow:0 0 5px #999;" title="Cliquez pour agrandir">`
            : ""
        }</td>
        <td>${validElems.map(e => `<strong>${e}</strong>`).join("<br/>")}</td>
        <td><!-- alertes --></td>`;

      const img = tr.querySelector("img");
      if(img){
        img.addEventListener("click", () => openThumbnailModal(v));
      }

      tbody.appendChild(tr);
    });
  }

  // --- Modal zoom HD ---
  function openThumbnailModal(variant){
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = 0;
    overlay.style.left = 0;
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.8)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = 10000;

    const img = document.createElement("img");
    img.src = variant.thumbnail;
    img.style.maxWidth = "90%";
    img.style.maxHeight = "90%";
    img.style.boxShadow = "0 0 20px #000";
    img.style.border = "4px solid white";
    overlay.appendChild(img);

    const closeBtn = document.createElement("div");
    closeBtn.innerHTML = "✕";
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "16px";
    closeBtn.style.right = "24px";
    closeBtn.style.fontSize = "28px";
    closeBtn.style.color = "white";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.fontFamily = "Arial, sans-serif";
    overlay.appendChild(closeBtn);

    const close = () => overlay.remove();
    overlay.addEventListener("click", close);
    closeBtn.addEventListener("click", close);

    document.body.appendChild(overlay);
  }

  // --- Rafraîchissement filtré par EM sélectionné ---
  async function refreshVariantsTable(){
    const select = document.getElementById("instances-em-select");
    const emId = select?.value || "";
    const allVariants = await DBService.getAll("variants");
    const filtered = emId ? allVariants.filter(v => v.emId === emId) : allVariants;
    await renderVariantsTable(filtered);
  }

  // --- Listener sur event instances:variantsUpdated ---
  window.addEventListener("instances:variantsUpdated", async (e) => {
    console.log("[UI] Variants mis à jour pour EM", e.detail.emId);
    await refreshVariantsTable();

    const select = document.getElementById("instances-em-select");
    if(select && !select.value && e.detail.emId){
      select.value = e.detail.emId;
    }
  });

  // --- Listener sur changement du select EM ---
  window.addEventListener("DOMContentLoaded", () => {
    const select = document.getElementById("instances-em-select");
    if(select){
      select.addEventListener("change", refreshVariantsTable);
    }
  });

  global.UITable = { renderCMTable, renderVariantsTable, refreshVariantsTable };
})(window);
