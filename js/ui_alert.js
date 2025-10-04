// ui_alert.js — Alertes avec tri + filtres + header fixe + formatage date
console.log("[ui_alert] script chargé");

(function (global) {
  let currentSort = { col: "date", asc: false };
  let filters = {};

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  async function renderAlertsTable() {
    const tbody = document.querySelector("#alerts-table tbody");
    if (!tbody) return;

    tbody.innerHTML = "<tr><td colspan='8'>Chargement...</td></tr>";

    try {
      let alerts = await DBService.getAll("alerts");
      if (!alerts || alerts.length === 0) {
        tbody.innerHTML = "<tr><td colspan='8'>Aucune alerte enregistrée</td></tr>";
        return;
      }

      // Appliquer filtres
      alerts = alerts.filter(a => {
        return Object.entries(filters).every(([col, val]) => {
          if (!val) return true;
          let field = a[col] || "";
          if (col === "status" && (!a.status || a.status === "Non traité")) {
            field = "Non traité";
          }
          return String(field).toLowerCase().includes(String(val).toLowerCase());
        });
      });

      // Tri
      if (currentSort.col) {
        alerts.sort((a, b) => {
          let va = a[currentSort.col] || "";
          let vb = b[currentSort.col] || "";
          if (currentSort.col.includes("date")) {
            va = new Date(va).getTime() || 0;
            vb = new Date(vb).getTime() || 0;
          } else {
            if (typeof va === "string") va = va.toLowerCase();
            if (typeof vb === "string") vb = vb.toLowerCase();
          }
          if (va < vb) return currentSort.asc ? -1 : 1;
          if (va > vb) return currentSort.asc ? 1 : -1;
          return 0;
        });
      }

      // Rendu
      tbody.innerHTML = "";
      alerts.forEach(alert => {
        const tr = document.createElement("tr");

        const dateApparition = alert.date || alert.createdAt || "";
        const dateTraitement = alert.dateTraitee || "";

        let statusHtml = "";
        if (!alert.status || alert.status === "Non traité") {
          statusHtml = `<span class="status-warning">⚠ Non traité</span>`;
        } else {
          statusHtml = alert.status;
        }

        tr.innerHTML = `
          <td>${alert.source || ""}</td>
          <td>${alert.file || ""}</td>
          <td>${alert.message || ""}</td>
          <td>${alert.details || ""}</td>
          <td>${alert.type || ""}</td>
          <td>${formatDate(dateApparition)}</td>
          <td>${formatDate(dateTraitement)}</td>
          <td>${statusHtml}</td>
        `;
        tbody.appendChild(tr);
      });

      // Maj visuel du tri
      document.querySelectorAll("#alerts-table thead tr:first-child th").forEach(th => {
        th.classList.remove("sorted-asc", "sorted-desc");
        if (th.dataset.col === currentSort.col) {
          th.classList.add(currentSort.asc ? "sorted-asc" : "sorted-desc");
        }
      });

    } catch (err) {
      console.error("[ui_alert] Erreur chargement alertes :", err);
      tbody.innerHTML = "<tr><td colspan='8'>Erreur de chargement</td></tr>";
    }
  }

  function initAlertsUI() {
    const tabButton = document.querySelector('.tab-alerts');
    if (tabButton) {
      tabButton.addEventListener("click", () => {
        renderAlertsTable();
      });
    }

    // Tri par clic
    document.querySelectorAll("#alerts-table th[data-col]").forEach(th => {
      th.addEventListener("click", () => {
        const col = th.dataset.col;
        if (!col) return;
        if (currentSort.col === col) {
          currentSort.asc = !currentSort.asc;
        } else {
          currentSort.col = col;
          currentSort.asc = true;
        }
        renderAlertsTable();
      });
    });

    // Filtres
    document.querySelectorAll("#alerts-table .filters th").forEach((th, idx) => {
      const input = th.querySelector("input, select");
      if (input) {
        const col = document.querySelectorAll("#alerts-table thead tr:first-child th")[idx]?.dataset.col;
        if (col) {
          input.addEventListener("input", () => {
            filters[col] = input.value;
            renderAlertsTable();
          });
        }
      }
    });
  }

  global.AlertUI = { renderAlertsTable, initAlertsUI };

})(window);
