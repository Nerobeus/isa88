// pid_overlay.js — un seul canvas overlay interactif
window.PIDOverlay = (function(){
  let pdfCanvas, overlayCanvas, getPositions, onHover, onSelect, getColor, afterDraw;
  let selected = new Set(), dpr = 1;
  let currentPositions = [];
  let hoveredId = null; // ✅ suivi du CM survolé

  function init(cfg){
    pdfCanvas   = cfg.pdfCanvas;
    getPositions= cfg.getCMPositions;
    onHover     = cfg.onHover || function(){};
    onSelect    = cfg.onSelect || function(){};
    getColor    = cfg.getColorForEM || (()=>"#0bf");
    afterDraw   = cfg.afterDraw || null;

    // ✅ éviter doublon d’overlay
    if (overlayCanvas && overlayCanvas.parentNode) {
      overlayCanvas.remove();
    }

    const container = pdfCanvas.closest('.canvas-wrap') || pdfCanvas.parentNode;
    overlayCanvas = document.createElement("canvas");
    overlayCanvas.id = "pidOverlayCanvas";
    overlayCanvas.style.position = "absolute";
    overlayCanvas.style.inset = "0";
    overlayCanvas.style.pointerEvents = "auto"; // on garde la détection
    container.appendChild(overlayCanvas);

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      const w = pdfCanvas.clientWidth || pdfCanvas.width;
      const h = pdfCanvas.clientHeight || pdfCanvas.height;
      overlayCanvas.width  = Math.round(w*dpr);
      overlayCanvas.height = Math.round(h*dpr);
      overlayCanvas.style.width  = w+"px";
      overlayCanvas.style.height = h+"px";
      refresh();
    };
    new ResizeObserver(resize).observe(pdfCanvas);
    resize();

    // === Gestion overlay (hover + click) ===
    overlayCanvas.addEventListener("mousemove", e=>{
      const r = overlayCanvas.getBoundingClientRect();
      const x = (e.clientX-r.left)*dpr, y = (e.clientY-r.top)*dpr;
      const pos = getPositions()||[];
      let found=null;
      for(const p of pos){
        const dx=x-p.x*dpr, dy=y-p.y*dpr, rr=(p.r||12)*dpr*3; // ✅ zone = cercle affiché
        if(dx*dx+dy*dy<=rr*rr){found=p;break;}
      }
      hoveredId = found ? found.cmId : null;
      refresh();
      onHover(hoveredId,{x,y});
    });

    overlayCanvas.addEventListener("mouseleave", ()=>{
      hoveredId = null;
      refresh();
    });

    overlayCanvas.addEventListener("click", e=>{
      if(!hoveredId) return;
      if(selected.has(hoveredId)) selected.delete(hoveredId);
      else selected.add(hoveredId);
      onSelect([...selected]);
      refresh();
    });

    // ✅ Laisse passer wheel/mousedown/move/up pour zoom/pan PDF
    ["wheel","mousedown","mouseup","mousemove"].forEach(ev=>{
      overlayCanvas.addEventListener(ev, e=>{
        const forwarded = new e.constructor(ev, e);
        pdfCanvas.dispatchEvent(forwarded);
      }, {passive:false});
    });
  }

  function draw(){
    const ctx=overlayCanvas.getContext("2d");
    ctx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);
    const pos=getPositions()||[];
    currentPositions = pos;
    PIDOverlay.currentPositions = pos;

    for(const p of pos){
      const x=p.x*dpr, y=p.y*dpr, r=(p.r||12)*dpr*3;

      // stroke toujours
      ctx.beginPath(); ctx.arc(x,y,r,0,2*Math.PI);
      ctx.lineWidth=2; ctx.strokeStyle=getColor(p.emId); ctx.stroke();

      // remplissage si hover ou sélection
      if (selected.has(p.cmId) || hoveredId === p.cmId) {
        ctx.beginPath(); ctx.arc(x,y,r,0,2*Math.PI);
        ctx.fillStyle=getColor(p.emId);
        ctx.globalAlpha=0.28;
        ctx.fill();
        ctx.globalAlpha=1;
      }
    }

    // ✅ appel du hook pour tooltip
    if(afterDraw) afterDraw(ctx);
  }

  function refresh(){ if(overlayCanvas) draw(); }
  function highlightByIds(ids,opt){
    opt=opt||{};
    if(!opt.append) selected.clear();
    (ids||[]).forEach(id=>selected.add(id));
    refresh();
  }

  return {init, refresh, highlightByIds, currentPositions};
})();
