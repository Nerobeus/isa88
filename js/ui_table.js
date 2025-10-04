// ui_table.js — affichage des données extraites des PDF d’analyses fonctionnelles
(function (global) {
  /**
   * Rend les tableaux d'analyse fonctionnelle extraits
   * @param {Array} pages - Liste d’objets { pageNum, type, rows }
   *   - pageNum: numéro de la page PDF
   *   - type: type de tableau ("Control Modules", "Measurements", etc.)
   *   - rows: tableau de lignes (chaque ligne = objet clé:valeur)
   */
  function renderAnalysisTables(pages) {
    const container = document.getElementById("analysis-container");
    if (!container) return;

    container.innerHTML = ""; // reset

    if (!pages || pages.length === 0) {
      container.innerHTML = "<p>Aucune donnée extraite</p>";
      return;
    }

    pages.forEach((page) => {
      // Section pour cette page
      const section = document.createElement("section");
      section.className = "analysis-section";

      // Titre
      const title = document.createElement("h3");
      title.textContent = `Page ${page.pageNum} — ${page.type}`;
      section.appendChild(title);

      // Tableau
      const table = document.createElement("table");
      table.className = "analysis-table";

      // En-têtes dynamiques
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      const firstRow = page.rows[0] || {};
      Object.keys(firstRow).forEach((col) => {
        const th = document.createElement("th");
        th.textContent = col;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      // Lignes
      const tbody = document.createElement("tbody");
      page.rows.forEach((row) => {
        const tr = document.createElement("tr");
        Object.values(row).forEach((val) => {
          const td = document.createElement("td");
          td.textContent = val || "";
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      section.appendChild(table);
      container.appendChild(section);
    });
  }

  /**
   * Met en surbrillance la section correspondant à la page PDF affichée
   * @param {number} pageNum
   */
  function highlightPage(pageNum) {
    const sections = document.querySelectorAll(".analysis-section");
    sections.forEach((sec) => {
      sec.classList.remove("highlight");
      if (sec.querySelector("h3")?.textContent.startsWith(`Page ${pageNum}`)) {
        sec.classList.add("highlight");
        sec.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  // Expose API
  global.UITable = {
    renderAnalysisTables,
    highlightPage,
  };
})(window);
