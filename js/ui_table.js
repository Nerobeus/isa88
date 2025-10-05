// ui_table.js — affichage des données extraites des PDF d’analyses fonctionnelles
console.log("[ui_table] script chargé (v4 – compatible control_data)");

(function (global) {

  /**
   * Rend les tableaux d'analyse fonctionnelle extraits.
   * Chaque section correspond à un type de données (variants, measurements, etc.)
   * @param {Array} pages - Liste d’objets { pageNum, type, rows }
   */
  function renderAnalysisTables(pages) {
    const container = document.getElementById("analysis-container");
    if (!container) {
      console.warn("[UITable] Aucun conteneur #analysis-container trouvé dans le DOM");
      return;
    }

    container.innerHTML = ""; // reset

    if (!pages || !pages.length) {
      container.innerHTML = "<p>Aucune donnée extraite.</p>";
      return;
    }

    // --- Pour chaque type de tableau (variants, alarms, etc.)
    pages.forEach((page, idx) => {
      const section = document.createElement("section");
      section.className = "analysis-section";

      // --- Titre de section
      const title = document.createElement("h3");
      const label = page.type || "Section";
      title.textContent = `📘 ${label} — Page ${page.pageNum || "?"}`;
      section.appendChild(title);

      // --- Si aucune ligne
      if (!page.rows || !page.rows.length) {
        const p = document.createElement("p");
        p.textContent = "(Aucune ligne détectée)";
        section.appendChild(p);
        container.appendChild(section);
        return;
      }

      // --- Création du tableau
      const table = document.createElement("table");
      table.className = "analysis-table";

      // En-têtes dynamiques
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      const firstRow = page.rows[0];
      Object.keys(firstRow).forEach((col) => {
        const th = document.createElement("th");
        th.textContent = col;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      // --- Lignes
      const tbody = document.createElement("tbody");
      page.rows.forEach((row) => {
        const tr = document.createElement("tr");
        Object.keys(firstRow).forEach((col) => {
          const td = document.createElement("td");

          // Affichage thumbnail si présent
          if (col === "thumbnail" && row[col]) {
            const img = document.createElement("img");
            img.src = row[col];
            img.alt = "Miniature";
            img.style.width = "80px";
            img.style.height = "auto";
            td.appendChild(img);
          } else {
            td.textContent = row[col] ?? "";
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      section.appendChild(table);
      container.appendChild(section);
    });

    console.log(`[UITable] ${pages.length} sections rendues dans #analysis-container`);
  }

  /**
   * Met en surbrillance la section correspondant à la page PDF affichée.
   * @param {number} pageNum
   */
  function highlightPage(pageNum) {
    const sections = document.querySelectorAll(".analysis-section");
    sections.forEach((sec) => {
      sec.classList.remove("highlight");
      const title = sec.querySelector("h3")?.textContent || "";
      if (title.includes(`Page ${pageNum}`)) {
        sec.classList.add("highlight");
        sec.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  // --- Expose API publique
  global.UITable = {
    renderAnalysisTables,
    highlightPage,
  };

})(window);
