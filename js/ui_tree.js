// ui_tree.js — Arborescence EM → CM (Excel & PID)
(function(global){
  let cmClickHandler = null;
  let emClickHandler = null;

  function build(ems, cms, containerId="excel-tree"){
    console.log("[UITree] build", ems, cms, "→", containerId);
    const container = document.getElementById(containerId);
    if(!container){
      console.warn("[UITree] Aucun conteneur #" + containerId + " trouvé dans le DOM");
      return;
    }
    container.innerHTML = "";
    const list = document.createElement("ul");
    list.className = "tree-root";

    ems.forEach(em => {
      const li = document.createElement("li");

      // === Ligne EM/Instance ===
      const emDiv = document.createElement("div");
      emDiv.className = "em-node";
      emDiv.style.display = "inline-block";
      emDiv.style.padding = "4px 10px";
      emDiv.style.borderRadius = "12px";
      emDiv.style.fontWeight = "bold";
      emDiv.style.margin = "4px 0";
      emDiv.style.backgroundColor = em.color || "#333";
      emDiv.style.color = "#fff";
      emDiv.style.cursor = "pointer";

      let label = em.title || `${em.id} ${em.name || ""}`;
      if (em.suffix) label += ` [${em.suffix}]`;

      emDiv.textContent = label;
      li.appendChild(emDiv);

      emDiv.addEventListener("click", () => {
        if(emClickHandler) emClickHandler(em.id);
      });

      // === Liste des CM associés ===
      const ulCM = document.createElement("ul");
      ulCM.style.listStyle = "none";
      ulCM.style.margin = "4px 0 8px 16px";
      ulCM.style.padding = "0";

      const cmList = cms.filter(c => c.emId === em.id);
      cmList.forEach(cm => {
        const liCM = document.createElement("li");
        liCM.style.margin = "2px 0";
        liCM.dataset.cmId = (cm.cmId || cm.pidTag || "").toUpperCase();
        liCM.dataset.emId = cm.emId;

        const cmLine = document.createElement("div");
        cmLine.textContent = cm.label || `${cm.pidTag} ${cm.roleName}`;
        cmLine.style.fontWeight = "500";
        cmLine.style.cursor = "pointer";

        const cmDesc = document.createElement("div");
        cmDesc.textContent = cm.shortDescription || "";
        cmDesc.style.fontSize = "smaller";
        cmDesc.style.color = "#555";

        liCM.appendChild(cmLine);
        if (cmDesc.textContent) liCM.appendChild(cmDesc);

        liCM.addEventListener("click", () => {
          if(cmClickHandler) cmClickHandler(liCM.dataset.cmId);
        });

        ulCM.appendChild(liCM);
      });

      li.appendChild(ulCM);
      list.appendChild(li);
    });

    container.appendChild(list);
  }

  // ✅ Nettoyer toutes les sélections
  function clearHighlights(containerId="pid-tree") {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll(".cm-selected, .em-selected")
      .forEach(el => el.classList.remove("cm-selected","em-selected"));
  }

  // ✅ Mise en évidence d’un CM
  function highlightCM(cmId, containerId="pid-tree"){
    const container = document.getElementById(containerId);
    if(!container) return;
    clearHighlights(containerId);

    if(cmId){
      const target = container.querySelector(`li[data-cm-id="${cmId}"]`);
      if(target){
        target.classList.add("cm-selected");
        target.scrollIntoView({behavior:"smooth", block:"center"});
      }
    }
  }

  // ✅ Mise en évidence de tous les CM d’un EM
  function highlightEM(emId, containerId="pid-tree"){
    const container = document.getElementById(containerId);
    if(!container) return;
    clearHighlights(containerId);

    const emNode = [...container.querySelectorAll(".em-node")]
      .find(el => el.textContent.includes(emId));
    if(emNode) emNode.classList.add("em-selected");

    const targets = container.querySelectorAll(`li[data-cm-id][data-em-id="${emId}"]`);
    targets.forEach(li=>{
      li.classList.add("cm-selected");
      li.scrollIntoView({behavior:"smooth", block:"nearest"});
    });
  }

  function onCMClick(handler){ cmClickHandler = handler; }
  function onEMClick(handler){ emClickHandler = handler; }

  global.UITree = { build, clearHighlights, highlightCM, highlightEM, onCMClick, onEMClick };
})(window);
