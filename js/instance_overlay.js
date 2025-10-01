// instance_overlay.js — overlay interactif pour PDF d'instances
window.InstanceOverlay = (function(){
  let pdfCanvas, overlayCanvas, getPositions, onHover, onSelect;
  let selected = new Set(), dpr = 1;

  function init(cfg){
    pdfCanvas   = cfg.pdfCanvas;
    getPositions= cfg.getVariantPositions;
    onHover     = cfg.onHover || function(){};
    onSelect    = cfg.onSelect || function(){};

    const container = pdfCanvas.closest('.canvas-wrap') || pdfCanvas.parentNode;
    overlayCanvas = document.getElementById("instanceOverlayCanvas");
    if(!overlayCanvas){
      overlayCanvas = document.createElement("canvas");
      overlayCanvas.id = "instanceOverlayCanvas";
      container.appendChild(overlayCanvas);
    }

    overlayCanvas.style.position="absolute";
    overlayCanvas.style.inset="0";
    overlayCanvas.style.pointerEvents="auto";

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

    overlayCanvas.addEventListener("mousemove", e=>{
      const r = overlayCanvas.getBoundingClientRect();
      const x = (e.clientX-r.left)*dpr, y = (e.clientY-r.top)*dpr;
      const pos = getPositions()||[];
      let found=null;
      for(const p of pos){
        const dx=x-p.x*dpr, dy=y-p.y*dpr, rr=(p.r||12)*dpr;
        if(dx*dx+dy*dy<=rr*rr){found=p;break;}
      }
      draw(found); onHover(found?found.variantId:null,{x,y});
    });

    overlayCanvas.addEventListener("mouseleave", ()=>{ draw(null); });

    overlayCanvas.addEventListener("click", e=>{
      const r = overlayCanvas.getBoundingClientRect();
      const x = (e.clientX-r.left)*dpr, y = (e.clientY-r.top)*dpr;
      const pos = getPositions()||[];
      let found=null;
      for(const p of pos){
        const dx=x-p.x*dpr, dy=y-p.y*dpr, rr=(p.r||12)*dpr;
        if(dx*dx+dy*dy<=rr*rr){found=p;break;}
      }
      if(found){
        if(selected.has(found.variantId)) selected.delete(found.variantId);
        else selected.add(found.variantId);
        onSelect([...selected]);
      }
      draw(found);
    });
  }

  function draw(hover){
    const ctx=overlayCanvas.getContext("2d");
    ctx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);
    const pos=getPositions()||[];
    for(const p of pos){
      const x=p.x*dpr, y=p.y*dpr, r=(p.r||12)*dpr;
      ctx.beginPath(); ctx.arc(x,y,r+2,0,2*Math.PI);
      ctx.lineWidth=2; ctx.strokeStyle="#0bf"; ctx.stroke();
      if(selected.has(p.variantId)){
        ctx.beginPath(); ctx.arc(x,y,r,0,2*Math.PI);
        ctx.fillStyle="#0bf"; ctx.globalAlpha=0.28;
        ctx.fill(); ctx.globalAlpha=1;
      }
    }
    if(hover){
      const x=hover.x*dpr, y=hover.y*dpr, r=(hover.r||12)*dpr;
      ctx.beginPath(); ctx.arc(x,y,r+6,0,2*Math.PI);
      ctx.lineWidth=1; ctx.strokeStyle="#ef4444"; ctx.stroke();
    }
  }

  function refresh(){ if(overlayCanvas) draw(null); }
  function highlightByIds(ids,opt){ opt=opt||{}; if(!opt.append) selected.clear(); (ids||[]).forEach(id=>selected.add(id)); refresh(); }

  return {init, refresh, highlightByIds};
})();
