// ui_tree.js — Arborescence EM → CM (Excel & PID)
(function(global){
  let cmClickHandler = null;

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

      const emDiv = document.createElement("div");
      emDiv.textContent = em.title || `${em.id} ${em.name}`;
      emDiv.style.display = "inline-block";
      emDiv.style.padding = "4px 10px";
      emDiv.style.borderRadius = "12px";
      emDiv.style.fontWeight = "bold";
      emDiv.style.margin = "4px 0";
      emDiv.style.backgroundColor = em.color;
      emDiv.style.color = "#fff";

      li.appendChild(emDiv);

      const ulCM = document.createElement("ul");
      ulCM.style.listStyle = "none";
      ulCM.style.margin = "4px 0 8px 16px";
      ulCM.style.padding = "0";

      const cmList = cms.filter(c => c.emId === em.id);
      cmList.forEach(cm => {
        const liCM = document.createElement("li");
        liCM.style.margin = "2px 0";
        liCM.dataset.cmId = cm.cmId;

        const cmLine = document.createElement("div");
        cmLine.textContent = cm.label || `${cm.pidTag} ${cm.roleName}`;
        cmLine.style.fontWeight = "500";

        const cmDesc = document.createElement("div");
        cmDesc.textContent = cm.shortDescription || "";
        cmDesc.style.fontSize = "smaller";
        cmDesc.style.color = "#555";

        liCM.appendChild(cmLine);
        if (cmDesc.textContent) liCM.appendChild(cmDesc);

        // ✅ click → callback
        liCM.addEventListener("click", () => {
          if(cmClickHandler) cmClickHandler(cm.cmId);
        });

        ulCM.appendChild(liCM);
      });

      li.appendChild(ulCM);
      list.appendChild(li);
    });

    container.appendChild(list);
  }

  function highlightCM(cmId, containerId="pid-tree"){
    const container = document.getElementById(containerId);
    if(!container) return;
    container.querySelectorAll("li[data-cm-id]").forEach(li=>{
      li.classList.remove("cm-hover");
    });
    if(cmId){
      const target = container.querySelector(`li[data-cm-id="${cmId}"]`);
      if(target) target.classList.add("cm-hover");
    }
  }

  function onCMClick(handler){
    cmClickHandler = handler;
  }

  global.UITree = { build, highlightCM, onCMClick };
})(window);
