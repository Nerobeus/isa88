// ui_table.js — Tableaux CM / Instances / Alertes (placeholders)
(function(global){
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
  global.UITable = { renderCMTable };
})(window);
