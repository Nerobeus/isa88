window.PIDOverlay = (function(){
  let pdfCanvas, overlayCanvas, hitCanvas, getPositions, onHover, onSelect, getColor;
  let selected = new Set(), dpr = 1;

  function init(cfg){
    pdfCanvas = cfg.pdfCanvas;
    getPositions = cfg.getCMPositions;
    onHover = cfg.onHover || function(){};
    onSelect = cfg.onSelect || function(){};
    getColor = cfg.getColorForEM || function(){ return "#0bf"; };

    const container = pdfCanvas.closest('.canvas-wrap') || pdfCanvas.parentNode;
    overlayCanvas = document.createElement("canvas");
    hitCanvas = document.createElement("canvas");
    overlayCanvas.id = "pidOverlayCanvas";
    hitCanvas.id = "pidHitCanvas";
    [overlayCanvas, hitCanvas].forEach(c => { container.appendChild(c); });

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      const w = pdfCanvas.clientWidth || pdfCanvas.width;
      const h = pdfCanvas.clientHeight || pdfCanvas.height;
      [overlayCanvas, hitCanvas].forEach(c => {
        c.width = Math.round(w*dpr);
        c.height = Math.round(h*dpr);
        c.style.width = w + 'px';
        c.style.height = h + 'px';
        c.style.position = 'absolute';
        c.style.left = '0';
        c.style.top = '0';
      });
      refresh();
    };
    new ResizeObserver(resize).observe(pdfCanvas);
    resize();

    // ✅ attach wheel handler inside init where hitCanvas is defined
    hitCanvas.addEventListener("wheel", e=>{
      e.preventDefault();
      e.stopPropagation();
    }, { passive:false });

    hitCanvas.addEventListener("mousemove", e=>{
      const r = hitCanvas.getBoundingClientRect();
      const x = (e.clientX-r.left)*dpr, y = (e.clientY-r.top)*dpr;
      const pos = getPositions()||[]; let found=null;
      for(const p of pos){ const dx=x-p.x*dpr, dy=y-p.y*dpr; const rr=(p.r||12)*dpr;
        if(dx*dx+dy*dy<=rr*rr){found=p;break;} }
      draw(found); onHover(found?found.cmId:null,{x,y});
    });
    hitCanvas.addEventListener("mouseleave", ()=>{draw(null)});
    hitCanvas.addEventListener("click", e=>{
      const r = hitCanvas.getBoundingClientRect();
      const x = (e.clientX-r.left)*dpr, y = (e.clientY-r.top)*dpr;
      const pos = getPositions()||[]; let found=null;
      for(const p of pos){ const dx=x-p.x*dpr, dy=y-p.y*dpr; const rr=(p.r||12)*dpr;
        if(dx*dx+dy*dy<=rr*rr){found=p;break;} }
      if(found){ if(selected.has(found.cmId)) selected.delete(found.cmId); else selected.add(found.cmId); onSelect([...selected]); }
      draw(found);
    });
  }

  function draw(hover){
    const ctx=overlayCanvas.getContext("2d");
    ctx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);
    const pos=getPositions()||[];
    for(const p of pos){
      const x=p.x*dpr, y=p.y*dpr, r=(p.r||12)*dpr;
      if(selected.has(p.cmId)){
        for(let i=3;i>=1;i--){ ctx.beginPath(); ctx.arc(x,y,r+i*4,0,2*Math.PI); ctx.fillStyle="rgba(0,0,0,0.0)"; ctx.fill(); }
      }
      ctx.beginPath(); ctx.arc(x,y,r+2,0,2*Math.PI); ctx.lineWidth=2; ctx.strokeStyle=getColor(p.emId); ctx.stroke();
      if(selected.has(p.cmId)){ ctx.beginPath(); ctx.arc(x,y,r,0,2*Math.PI); ctx.fillStyle=getColor(p.emId); ctx.globalAlpha=0.28; ctx.fill(); ctx.globalAlpha=1; }
    }
    if(hover){ const x=hover.x*dpr, y=hover.y*dpr, r=(hover.r||12)*dpr; ctx.beginPath(); ctx.arc(x,y,r+6,0,2*Math.PI); ctx.lineWidth=1; ctx.strokeStyle="#ef4444"; ctx.stroke(); }
  }

  function refresh(){ if(overlayCanvas){ draw(null); } }
  function highlightByIds(ids,opt){ opt=opt||{}; if(!opt.append) selected.clear(); (ids||[]).forEach(id=>selected.add(id)); refresh(); }
  function setZoomFactor(){} // inutile, recalcul auto

  return {init, refresh, highlightByIds, setZoomFactor};
})();