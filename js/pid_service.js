// pid_service.js — Import et affichage PID (overlay synchronisé zoom/pan)
console.log("[DEBUG] pid_service.js chargé");

window.PIDService = (() => {
  async function importPID(file) {
    console.log("[PID] Import démarré :", file.name);

    const tree = document.getElementById("pid-tree");
    if (tree) tree.innerHTML = "";

    const canvas = document.getElementById("pid-canvas");
    if (!canvas) throw new Error("Canvas #pid-canvas introuvable");
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const statusEl = document.getElementById("pid-status");
    if (statusEl) statusEl.textContent = "";

    // ----- PDF -----
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await pdf.getPage(1);

    const BASE = 2.0;
    const vp = page.getViewport({ scale: BASE });

    // Canvas offscreen = coordonnées "document"
    const off = document.createElement("canvas");
    off.width = vp.width;
    off.height = vp.height;
    await page.render({ canvasContext: off.getContext("2d"), viewport: vp }).promise;

    // Canvas visible = taille adaptative
    const wrap = document.querySelector(".canvas-wrap");
    const rect = wrap ? wrap.getBoundingClientRect() : { width: 1000, height: 700 };
    canvas.width = Math.max(800, Math.floor(rect.width));
    canvas.height = Math.max(500, Math.floor(rect.height));

    // ----- Rôles (depuis DB) -----
    const roles = await DBService.getAllRoles();
    const exact = new Map(), nm = new Map(), keys = [];
    const norm = s => (s || "").replace(/\s|[-_\.]/g, "");

    for (const r of roles) {
      for (const k of [(r.TagName || "").trim(), (r.RoleOrSignal || "").trim()]) {
        if (!k) continue;
        exact.set(k, r.EM_ID);
        nm.set(norm(k).toLowerCase(), r.EM_ID);
        keys.push(k);
      }
    }
    const uniq = [...new Set(keys)].sort((a, b) => b.length - a.length);
    console.log("[PID] exact", exact.size, "norm", nm.size);

    // ----- Extraction texte → overlays en coords "document"
    const text = await page.getTextContent();
    const overlays = [];
    const TAG = /[A-Z]{2}\d{3}[A-Z]?/g;

    for (const it of text.items) {
      const s = String(it.str || "");
      const x = it.transform[4] * BASE;   // coords document
      const y = it.transform[5] * BASE;   // coords document (origine en bas)

      for (const k of uniq) {
        if (!k) continue;
        if (s.indexOf(k) !== -1) {
          overlays.push({ em: exact.get(k) || "UNMAPPED", tag: k, x, y });
        } else {
          const nx = norm(s).toLowerCase(), nk = norm(k).toLowerCase();
          if (nx.includes(nk)) {
            overlays.push({ em: nm.get(nk) || "UNMAPPED", tag: k, x, y, issue: "Formalisation" });
          }
        }
      }

      let m;
      TAG.lastIndex = 0;
      while ((m = TAG.exec(s)) !== null) {
        const t = m[0];
        const em = exact.get(t) || nm.get(norm(t).toLowerCase()) || "UNMAPPED";
        const issue = (!exact.has(t) && nm.has(norm(t).toLowerCase())) ? "Formalisation" : undefined;
        overlays.push({ em, tag: t, x, y, issue });
      }
    }

    // ----- Filtrage EM/CM présents dans le PID (pour l’onglet P&ID UNIQUEMENT)
    const allEms = await DBService.getAll("ems");
    const allCms = await DBService.getAll("cms");
    const emIdsInPid = [...new Set(overlays.map(o => o.em).filter(e => e && e !== "UNMAPPED"))];
    const emsInPid = allEms.filter(em => emIdsInPid.includes(em.id));
    const cmsInPid = allCms.filter(cm => emIdsInPid.includes(cm.emId));

    if (window.UITree && typeof UITree.build === "function") {
      // ⚠️ cible l’arbre P&ID (pas l’onglet Tag names)
      UITree.build(emsInPid, cmsInPid, "pid-tree");
      console.log("[PID] Arborescence PID construite :", emsInPid.length, "EM /", cmsInPid.length, "CM");
    }

    // ----- Zoom / Pan (coords "écran")
    let scale = Math.min(canvas.width / off.width, canvas.height / off.height);
    let panX = (canvas.width - off.width * scale) / 2;
    let panY = (canvas.height - off.height * scale) / 2;
    const MIN = 0.3, MAX = 6;

    function draw() {
      const c = canvas.getContext("2d");
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.setTransform(scale, 0, 0, scale, panX, panY);
      c.drawImage(off, 0, 0);
    }

    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      const rc = canvas.getBoundingClientRect();
      const x = (e.clientX - rc.left - panX) / scale;
      const y = (e.clientY - rc.top - panY) / scale;
      const f = e.deltaY < 0 ? 1.1 : 0.9;
      const ns = Math.min(MAX, Math.max(MIN, scale * f));
      panX = e.clientX - rc.left - x * ns;
      panY = e.clientY - rc.top - y * ns;
      scale = ns;
      draw();
      if (window.PIDOverlay) PIDOverlay.refresh();
    }, { passive: false });

    let drag = false, lx = 0, ly = 0;
    canvas.addEventListener("mousedown", e => { drag = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener("mouseup", () => drag = false);
    window.addEventListener("mousemove", e => {
      if (!drag) return;
      panX += e.clientX - lx;
      panY += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      draw();
      if (window.PIDOverlay) PIDOverlay.refresh();
    });

    const resetBtn = document.getElementById("reset-zoom");
    if (resetBtn) {
      resetBtn.onclick = () => {
        scale = Math.min(canvas.width / off.width, canvas.height / off.height);
        panX = (canvas.width - off.width * scale) / 2;
        panY = (canvas.height - off.height * scale) / 2;
        draw();
        if (window.PIDOverlay) PIDOverlay.refresh();
      };
    }

    draw();

    // ----- Overlay (reprojection → coords écran)
    if (window.PIDOverlay) {
      PIDOverlay.init({
        pdfCanvas: canvas,
        getCMPositions: () => {
          // x_screen = panX + x_doc * scale
          // y_doc est depuis le bas → on retourne avec off.height
          // y_screen = panY + (off.height - y_doc) * scale
          const rBase = 12; // rayon document
          return overlays.map(o => ({
            cmId: o.tag,
            emId: o.em,
            x: panX + o.x * scale,
            y: panY + (off.height - o.y) * scale,
            r: rBase * scale // ✅ le rayon suit le zoom
          }));
        },
        onHover: cmId => { /* TODO: highlight dans l'arbre P&ID */ },
        onSelect: ids => console.log("[PID] Sélection :", ids),
        getColorForEM: emId => {
          const em = emsInPid.find(e => e.id === emId);
          return em ? em.color : "#39f";
        }
      });
      // premier refresh une fois init
      PIDOverlay.refresh();
    }

    if (statusEl) {
      statusEl.textContent = `Tags détectés: ${overlays.length} — EM: ${emsInPid.length}`;
    }
  }

  return { importPID };
})();
