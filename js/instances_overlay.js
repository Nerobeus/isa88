// instances_overlay.js — gestion du rendu PDF + overlay pour les Instances (corrigé minimal)
(function (global) {
  const InstancesOverlay = {
    pdfDoc: null,
    file: null,
    pageNum: 1,
    variants: [],
    items: [],
    scale: 1,
    dx: 0,
    dy: 0,
    viewport: null,
    ctx: null,
    overlayCtx: null,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    eventsBound: false,

    async init(file, variants, items = [], startPage = 1) {
      this.file = file;
      this.pdfDoc = await pdfjsLib.getDocument(await file.arrayBuffer()).promise;
      this.variants = variants || [];
      this.items = items || [];
      this.pageNum = startPage;
      this.dx = 0;
      this.dy = 0;
      this.scale = 1;

      const wrap = document.querySelector("#tab-instances .canvas-wrap");
      const canvas = document.getElementById("instance-canvas");
      const overlay = document.getElementById("instanceOverlayCanvas");
      if (!canvas || !overlay || !wrap) {
        console.error("[InstancesOverlay] Canvas introuvable");
        return;
      }
      this.ctx = canvas.getContext("2d");
      this.overlayCtx = overlay.getContext("2d");

      this.bindNavButtons();
      this.bindEvents(wrap);
      this.resize();
    },

    async render(file, pageNum, variants, items = []) {
      console.log("[InstancesOverlay] Rendu Instances démarré");

      this.file = file;
      this.pdfDoc = await pdfjsLib.getDocument(await file.arrayBuffer()).promise;
      this.pageNum = pageNum;
      this.variants = variants || [];
      this.items = items || [];

      const wrap = document.querySelector("#tab-instances .canvas-wrap");
      const canvas = document.getElementById("instance-canvas");
      const overlay = document.getElementById("instanceOverlayCanvas");

      if (!canvas || !overlay || !wrap) {
        console.error("[InstancesOverlay] Canvas introuvable");
        return;
      }

      this.ctx = canvas.getContext("2d");
      this.overlayCtx = overlay.getContext("2d");

      this.bindNavButtons();
      this.resize();
      this.bindEvents(wrap);

      await this.renderPage();
      console.log(`[InstancesOverlay] Page ${pageNum} rendue`);
    },

    async renderPage() {
      if (!this.pdfDoc || !this.ctx) return;

      const page = await this.pdfDoc.getPage(this.pageNum);
      this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

      const viewport = page.getViewport({ scale: this.scale });
      this.viewport = viewport;

      const renderContext = {
        canvasContext: this.ctx,
        viewport,
        transform: [1, 0, 0, 1, this.dx, this.dy],
      };

      await page.render(renderContext).promise;
      this.drawOverlay();
    },

    // --- correction principale : respect viewport + translation ---
    drawOverlay() {
      if (!this.overlayCtx || !this.viewport) return;
      const ctx = this.overlayCtx;
      const { width, height } = ctx.canvas;
      ctx.clearRect(0, 0, width, height);

      // appliquer le même transform que le PDF
      const [a, b, c, d, e, f] = this.viewport.transform;
      ctx.setTransform(a, b, c, d, e + this.dx, f + this.dy);

      // --- Variants ---
      this.variants
        .filter(v => v.page === this.pageNum && v.bbox)
        .forEach((v, idx) => this.drawBox(ctx, v, idx, "variant"));

      // --- Autres items ---
      this.items
        .filter(it => it.page === this.pageNum && it.bbox)
        .forEach((it, idx) => this.drawBox(ctx, it, idx, it.source || "item"));

      // reset transform
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },

    drawBox(ctx, obj, idx, type = "item") {
      const { x, y, w, h } = obj.bbox;
      if (x == null || y == null) return;

      // Couleurs par type
      let hue;
      if (type === "variant") hue = (idx * 47) % 360;
      else if (type === "control") hue = 200;
      else if (type === "measure") hue = 120;
      else if (type === "characteristics") hue = 45;
      else if (type === "alarm") hue = 0;
      else hue = (idx * 23) % 360;

      ctx.strokeStyle = `hsl(${hue}, 80%, 50%)`;
      ctx.fillStyle = `hsla(${hue}, 80%, 50%, 0.15)`;
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.fillStyle = `hsl(${hue}, 80%, 35%)`;
      ctx.font = "11px Arial";
      const label =
        obj.variantId ? `V${obj.variantId}` :
        obj.roleName || obj.name || obj.tag || obj.id || `#${idx + 1}`;
      ctx.save();
      ctx.scale(1, -1); // inverse l’axe Y
      ctx.fillText(label, x + 3, -(y - 10)); // y négatif car on a inversé
      ctx.restore();
    },

    resize() {
      const wrap = document.querySelector("#tab-instances .canvas-wrap");
      const canvas = document.getElementById("instance-canvas");
      const overlay = document.getElementById("instanceOverlayCanvas");
      if (!wrap || !canvas || !overlay) return;

      const rect = wrap.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      overlay.width = rect.width;
      overlay.height = rect.height;

      console.log("[InstancesOverlay] resize →", rect.width, "x", rect.height);
      this.renderPage();
    },

    bindEvents(wrap) {
      if (this.eventsBound) return;
      this.eventsBound = true;

      wrap.addEventListener("wheel", (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.scale = Math.min(6, Math.max(0.3, this.scale * delta));
        this.renderPage();
      });

      wrap.addEventListener("mousedown", (e) => {
        this.isDragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      });

      wrap.addEventListener("mouseup", () => (this.isDragging = false));
      wrap.addEventListener("mouseleave", () => (this.isDragging = false));

      wrap.addEventListener("mousemove", (e) => {
        if (!this.isDragging) return;
        this.dx += e.clientX - this.lastX;
        this.dy += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.renderPage();
      });

      window.addEventListener("resize", () => this.resize());
    },

    bindNavButtons() {
      const prev = document.getElementById("btn-prev-page");
      const next = document.getElementById("btn-next-page");
      if (prev && next) {
        prev.onclick = () => {
          if (this.pageNum > 1) {
            this.pageNum--;
            this.dx = 0;
            this.dy = 0;
            this.scale = 1;
            this.renderPage();
          }
        };
        next.onclick = () => {
          if (this.pageNum < this.pdfDoc.numPages) {
            this.pageNum++;
            this.dx = 0;
            this.dy = 0;
            this.scale = 1;
            this.renderPage();
          }
        };
      }
    },
  };

  global.InstancesOverlay = InstancesOverlay;
})(window);
