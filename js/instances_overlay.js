// instances_overlay.js — gestion du rendu PDF + overlay pour les Instances
(function (global) {
  const InstancesOverlay = {
    pdfDoc: null,
    file: null,          // conserve le fichier ouvert
    pageNum: 1,
    variants: [],
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

    // ✅ Correction : init prépare aussi les contexts + events
    async init(file, variants, startPage = 1) {
      this.file = file;
      this.pdfDoc = await pdfjsLib.getDocument(await file.arrayBuffer()).promise;
      this.variants = variants || [];
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

      this.bindNavButtons();   // active navigation
      this.bindEvents(wrap);   // wheel/drag
      this.resize();           // fixe tailles + 1er render
    },

    async render(file, pageNum, variants) {
      console.log("[InstancesOverlay] Rendu Instances démarré");

      this.file = file;
      this.pdfDoc = await pdfjsLib.getDocument(await file.arrayBuffer()).promise;
      this.pageNum = pageNum;
      this.variants = variants || [];

      const wrap = document.querySelector("#tab-instances .canvas-wrap");
      const canvas = document.getElementById("instance-canvas");
      const overlay = document.getElementById("instanceOverlayCanvas");

      if (!canvas || !overlay || !wrap) {
        console.error("[InstancesOverlay] Canvas introuvable");
        return;
      }

      this.ctx = canvas.getContext("2d");
      this.overlayCtx = overlay.getContext("2d");

      this.resize(); // initialise les dimensions et déclenche renderPage()
      this.bindEvents(wrap);

      await this.renderPage();
      console.log(`[InstancesOverlay] Page ${pageNum} rendue`);
    },

    async renderPage() {
      if (!this.pdfDoc || !this.ctx) return;

      const page = await this.pdfDoc.getPage(this.pageNum);

      // Effacer le canvas avant chaque rendu
      this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

      // Viewport PDF.js
      const viewport = page.getViewport({ scale: this.scale });
      this.viewport = viewport;

      const renderContext = {
        canvasContext: this.ctx,
        viewport: viewport,
        transform: [1, 0, 0, 1, this.dx, this.dy],
      };

      await page.render(renderContext).promise;

      // Rendu overlay
      this.drawOverlay();
    },

    // Applique une matrice de transformation PDF.js
    applyTransform(pt, m) {
      return {
        x: m[0] * pt.x + m[2] * pt.y + m[4],
        y: m[1] * pt.x + m[3] * pt.y + m[5],
      };
    },

    drawOverlay() {
      if (!this.overlayCtx || !this.viewport) return;
      const ctx = this.overlayCtx;
      const { width, height } = ctx.canvas;

      // Nettoyer l’overlay
      ctx.clearRect(0, 0, width, height);

      const transform = this.viewport.transform;

      // Affiche seulement les variants de la page courante
      this.variants
        .filter(v => v.page === this.pageNum)
        .forEach((v, idx) => {
          const { x, y, w, h } = v.bbox;

          // Appliquer la même transformation que PDF.js
          const p1 = this.applyTransform({ x, y }, transform);
          const p2 = this.applyTransform({ x: x + w, y: y + h }, transform);

          // Ajouter le pan manuel (dx, dy)
          const rx = Math.min(p1.x, p2.x) + this.dx;
          const ry = Math.min(p1.y, p2.y) + this.dy;
          const rw = Math.abs(p2.x - p1.x);
          const rh = Math.abs(p2.y - p1.y);

          const hue = (idx * 47) % 360;
          ctx.strokeStyle = `hsl(${hue}, 80%, 50%)`;
          ctx.fillStyle = `hsla(${hue}, 80%, 50%, 0.1)`;

          ctx.lineWidth = 2;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);

          ctx.fillStyle = `hsl(${hue}, 80%, 40%)`;
          ctx.font = "14px Arial";
          ctx.fillText(v.variantId || `#${idx + 1}`, rx + 4, ry + 16);
        });
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

      this.renderPage(); // redraw avec les nouvelles dimensions
    },

    bindEvents(wrap) {
      if (this.eventsBound) return;
      this.eventsBound = true;

      wrap.addEventListener("wheel", (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.scale *= delta;
        this.renderPage();
      });

      wrap.addEventListener("mousedown", (e) => {
        this.isDragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      });

      wrap.addEventListener("mouseup", () => {
        this.isDragging = false;
      });

      wrap.addEventListener("mouseleave", () => {
        this.isDragging = false;
      });

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
            this.renderPage();
          }
        };
        next.onclick = () => {
          if (this.pageNum < this.pdfDoc.numPages) {
            this.pageNum++;
            this.renderPage();
          }
        };
      }
    },
  };

  global.InstancesOverlay = InstancesOverlay;
})(window);
