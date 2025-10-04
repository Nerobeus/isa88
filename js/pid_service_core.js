// pid_service_core.js — rendu PDF + fonctions utilitaires PID
console.log("[DEBUG] pid_service_core.js chargé");

window.PIDCore = (() => {

  async function renderPDF(file) {
    console.log("[PIDCore] renderPDF :", file?.name);

    const canvas = document.getElementById("pid-canvas");
    if (!canvas) throw new Error("Canvas #pid-canvas introuvable");
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await pdf.getPage(1);

    const BASE = 2.0;
    const vp = page.getViewport({ scale: BASE });

    const off = document.createElement("canvas");
    off.width = vp.width;
    off.height = vp.height;
    await page.render({ canvasContext: off.getContext("2d"), viewport: vp }).promise;

    const wrap = document.querySelector(".canvas-wrap");
    const rect = wrap ? wrap.getBoundingClientRect() : { width: 1000, height: 700 };
    canvas.width = Math.max(800, Math.floor(rect.width));
    canvas.height = Math.max(500, Math.floor(rect.height));

    let scale = Math.min(canvas.width / off.width, canvas.height / off.height);
    let panX = (canvas.width - off.width * scale) / 2;
    let panY = (canvas.height - off.height * scale) / 2;
    const MIN = 0.1, MAX = 4;

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
    function resetView() {
      scale = Math.min(canvas.width / off.width, canvas.height / off.height);
      panX = (canvas.width - off.width * scale) / 2;
      panY = (canvas.height - off.height * scale) / 2;
      draw();
      if (window.PIDOverlay) PIDOverlay.refresh();
    }
    if (resetBtn) resetBtn.onclick = resetView;

    draw();

    return {
      canvas,
      off,
      getScale: () => scale,
      getPanX: () => panX,
      getPanY: () => panY,
      draw,
      resetView
    };
  }

  // --- Détection numéro PID (cartouche vs nom fichier)
  async function detectPIDNumber(pdf, filename = "") {
    const CARTOUCHE_RE = /[A-Z0-9]{2,4}(?:-\d{2}){4}-(\d{3,4})\b/i;
    const FILE_RE = /[A-Z0-9]{2,4}(?:-\d{2}){4}-(\d{3,4})(?:-R\d+(?:\.\d+)?)?/i;

    let cartoucheCode = null;
    let fileCode = null;

    try {
      const page = await pdf.getPage(1);
      const tc = await page.getTextContent();
      const txt = tc.items.map(it => mcIdSanitize(it.str)).join(" ");
      const m = CARTOUCHE_RE.exec(txt);
      if (m && m[1]) cartoucheCode = normalizePid(m[1]);
    } catch (e) {}

    if (filename) {
      const m2 = FILE_RE.exec(filename);
      if (m2 && m2[1]) fileCode = normalizePid(m2[1]);
    }

    if (cartoucheCode && fileCode && cartoucheCode !== fileCode) {
      await DBService.putAlert({
        id: genId("alert"),
        type: "Consistance",
        message: `PID cartouche ≠ PID fichier`,
        details: `Cartouche = ${cartoucheCode}, Fichier = ${fileCode}`,
        source: "PID",
        file: filename,
        level: "error"
      });
    }

    if (cartoucheCode) return cartoucheCode;
    if (fileCode) return fileCode;
    return "000";
  }

  function normalizePid(numStr) {
    const raw = String(numStr || "").replace(/\D/g, "");
    if (!raw) return "000";
    if (raw.length >= 4) return raw.slice(-4);
    return raw.padStart(3, "0");
  }

  function mcIdSanitize(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function genId(prefix = "id") {
    return prefix + "_" + Math.random().toString(36).slice(2, 9) + "_" + Date.now();
  }

  // --- Extraction overlays CM
  async function extractCMOverlays(pdf, cmTags, margins) {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const text = await page.getTextContent();
    const overlays = [];
    const TAG = /[A-Z]{2}\d{3}[A-Z]?[a-z]?/g;

    for (const it of text.items) {
      const s = String(it.str || "").trim();
      if (!s || s.length <= 3) continue;
      const x = it.transform[4] * 2.0;
      const y = it.transform[5] * 2.0;
      const w = (it.width || 0) * 2.0;
      const h = (it.height || 0) * 2.0;
      const cx = x + w / 2, cy = y + h / 2;

      if (
        cx < margins.left || cx > viewport.width - margins.right ||
        cy < margins.top || cy > viewport.height - margins.bottom
      ) continue;

      const normS = PIDRoles.norm(s).toLowerCase();

      if (cmTags.has(normS)) {
        const cm = cmTags.get(normS);
        overlays.push({ em: cm.emId, tag: s, x, y, cx, cy });
      } else {
        TAG.lastIndex = 0;
        let m;
        while ((m = TAG.exec(s)) !== null) {
          overlays.push({ em: "UNMAPPED", tag: m[0], x, y, cx, cy });
        }
      }
    }
    return overlays;
  }

  // --- Construction des instances EM/CM
  function buildInstances(allCms, allEms, overlays) {
    const PIDTAG_RX = /^[A-Z]{2}\d{3}$/;
    const tagsInPid = [...new Set(overlays.map(o => o.tag))];
    const cmsInPid = [];
    const emInstances = new Map();

    for (const cm of allCms) {
      const baseTag = (cm.pidTag || "").toUpperCase();
      if (!PIDTAG_RX.test(baseTag)) continue;
      const foundTag = tagsInPid.find(t => t.toUpperCase().startsWith(baseTag));
      if (!foundTag) continue;
      const instSuffix = /[a-z]$/.test(foundTag) ? foundTag.slice(-1) : "";
      const key = cm.emId + "|" + instSuffix;

      if (!emInstances.has(key)) {
        const baseEm = allEms.find(e => e.id === cm.emId);
        if (baseEm) {
          emInstances.set(key, {
            ...baseEm,
            id: baseEm.id + (instSuffix ? "_inst_" + instSuffix : ""),
            title: baseEm.title || baseEm.id,
            suffix: instSuffix,
            cms: [],
            color: baseEm.color || "#888"
          });
        }
      }
      const inst = emInstances.get(key);
      if (inst) {
        inst.cms.push(baseTag);
        cmsInPid.push({
          ...cm,
          pidTag: foundTag,
          emId: inst.id,
          cmId: baseTag,
          color: inst.color
        });
      }
    }

    return { emInstances, cmsInPid };
  }

  return { renderPDF, detectPIDNumber, extractCMOverlays, buildInstances };
})();
