// pid_service_overlay.js — Overlay fusionné (PIDOverlay + PIDOverlayService)
// gère le canvas overlay, le survol, la sélection unique ou groupée par EM
window.PIDOverlay = (function(){
  let pdfCanvas, overlayCanvas, getPositions, onHover, onSelect, getColor, afterDraw;
  let dpr = 1;
  let currentPositions = [];
  let hoveredId = null;
  let selected = new Set();

  function init(cfg){
    pdfCanvas   = cfg.pdfCanvas;
    getPositions= cfg.getCMPositions;
    onHover     = cfg.onHover || function(){};
    onSelect    = cfg.onSelect || function(){};
    getColor    = cfg.getColorForEM || (()=>"#0bf");
    afterDraw   = cfg.afterDraw || null;

    if (overlayCanvas && overlayCanvas.parentNode) overlayCanvas.remove();

    const container = pdfCanvas.closest('.canvas-wrap') || pdfCanvas.parentNode;
    overlayCanvas = document.createElement("canvas");
    overlayCanvas.id = "pidOverlayCanvas";
    overlayCanvas.style.position = "absolute";
    overlayCanvas.style.inset = "0";
    overlayCanvas.style.pointerEvents = "auto";
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

    overlayCanvas.addEventListener("mousemove", e=>{
      const r = overlayCanvas.getBoundingClientRect();
      const x = (e.clientX-r.left)*dpr, y = (e.clientY-r.top)*dpr;
      const pos = getPositions()||[];
      let found=null;
      for(const p of pos){
        const dx=x-p.x*dpr, dy=y-p.y*dpr, rr=(p.r||12)*dpr*3;
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

    overlayCanvas.addEventListener("click", ()=>{
      if(!hoveredId) return;
      selected.clear();
      selected.add(hoveredId);
      onSelect([...selected]);
      refresh();
    });

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
      ctx.beginPath(); ctx.arc(x,y,r,0,2*Math.PI);
      ctx.lineWidth=2; ctx.strokeStyle=getColor(p.emId); ctx.stroke();

      if (selected.has(p.cmId) || hoveredId === p.cmId) {
        ctx.beginPath(); ctx.arc(x,y,r,0,2*Math.PI);
        ctx.fillStyle=getColor(p.emId);
        ctx.globalAlpha=0.28;
        ctx.fill();
        ctx.globalAlpha=1;
      }
    }
    if(afterDraw) afterDraw(ctx);
  }

  function refresh(){ if(overlayCanvas) draw(); }
  function highlightByIds(ids,opt){
    opt=opt||{};
    selected.clear();
    (ids||[]).forEach(id=>selected.add(id));
    refresh();
  }
  function clearSelection(){ selected.clear(); refresh(); }

  return {init, refresh, highlightByIds, clearSelection, currentPositions};
})();


// PIDOverlayService — synchro avec arborescence (CM = single, EM = multi)
window.PIDOverlayService = (() => {
  function attachOverlay({canvas, off, overlays, allCms, allEms, emsInPid, cmsInPid,
    getPanX, getPanY, getScale, OFFSET_Y, margins}) {

    const descByTag = new Map();
    for (const cm of allCms) {
      const tag = String(cm.pidTag || "").toUpperCase();
      const desc = cm.displayName || cm.roleName || cm.description || tag;
      if (tag) descByTag.set(tag, desc);
    }

    PIDOverlay.init({
      pdfCanvas: canvas,
      getCMPositions: () => {
        const rBase=12, S=getScale(), panX=getPanX(), panY=getPanY();
        const validTags=new Set(cmsInPid.map(cm=>String(cm.pidTag||"").toUpperCase()));
        return overlays
          .filter(o=>{
            const raw=String(o.tag||"").toUpperCase();
            const base=raw.replace(/[a-z]$/,"");
            return validTags.has(raw)||validTags.has(base);
          })
          .map(o=>{
            const raw=String(o.tag||"").toUpperCase();
            const base=raw.replace(/[a-z]$/,"");
            const cm=cmsInPid.find(c=>
              String(c.pidTag||"").toUpperCase()===raw||
              String(c.pidTag||"").toUpperCase()===base);
            return {
              cmId:raw, baseId:base, emId:cm?cm.emId:o.em,
              x:panX+o.cx*S+(window.__PID_HILIGHT_OFFSET_X||0),
              y:panY+(off.height-o.cy+OFFSET_Y)*S,
              r:rBase*S, color:cm?.color
            };
          });
      },
      onHover: ()=> PIDOverlay.refresh(),
      onSelect: ids=>{
        const id=(ids&&ids[0])?ids[0].toUpperCase():null;
        if(!id){
          PIDOverlay.clearSelection();
          if(window.UITree?.clearSelection) UITree.clearSelection("pid-tree");
          return;
        }
        PIDOverlay.highlightByIds([id],{append:false});
        const base=id.replace(/[a-z]$/,"");
        if(window.UITree?.highlightCM){
          if(!UITree.highlightCM(id,"pid-tree")) UITree.highlightCM(base,"pid-tree");
        }
      },
      getColorForEM: emId=>{
        const cm=cmsInPid.find(c=>c.emId===emId&&c.color);
        if(cm) return cm.color;
        const em=allEms.find(e=>e.id===emId)||emsInPid.find(e=>e.id===emId||e.baseEmId===emId);
        return em?.color||"#39f";
      },
      afterDraw: ctx=>{
        if(margins&&off){
          const S=getScale(), panX=getPanX(), panY=getPanY();
          const {top=0,bottom=0,left=0,right=0}=margins;
          const x1=panX+left*S, y1=panY+top*S;
          const x2=panX+(off.width-right)*S, y2=panY+(off.height-bottom)*S;
          ctx.save();
          ctx.strokeStyle="rgba(255,0,0,0.8)";
          ctx.lineWidth=Math.max(1,2*S);
          ctx.strokeRect(x1,y1,Math.max(0,x2-x1),Math.max(0,y2-y1));
          ctx.restore();
        }
      }
    });

    if(window.UITree){
      // CM = single select
      UITree.onCMClick(cmId=>{
        if(cmId) PIDOverlay.highlightByIds([String(cmId).toUpperCase()],{append:false});
      });

      // EM = multi select
      UITree.onEMClick(emId=>{
        const cmIds=cmsInPid.filter(cm=>cm.emId===emId)
          .map(cm=>String(cm.pidTag||cm.cmId||"").toUpperCase())
          .filter(Boolean);
        if(cmIds.length) PIDOverlay.highlightByIds(cmIds,{append:false});
      });
    }
    PIDOverlay.refresh();
  }

  return {attachOverlay};
})();
