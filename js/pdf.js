window.App=window.App||{};
App.PDF=(function(){
  const S=App.State.state;
  // --- helpers ---
  function syncZoomUI(){
    const s=document.getElementById('zoomSlider');
    const l=document.getElementById('zoomPct');
    if(s) s.value=Math.round(S.zoomScale*100);
    if(l) l.textContent=Math.round(S.zoomScale*100)+'%';
  }
  function clampPan(){
    const vp=document.getElementById('pdfViewport');
    const wrap=document.getElementById('pdfWrap');
    if(!vp||!wrap||!S.pdfViewport) return;
    const vw=vp.clientWidth, vh=vp.clientHeight;
    const cw=S.pdfViewport.width*S.zoomScale;
    const ch=S.pdfViewport.height*S.zoomScale;
    const minX=Math.min(0, vw-cw);
    const minY=Math.min(0, vh-ch);
    S.offsetX=Math.max(minX, Math.min(0,S.offsetX));
    S.offsetY=Math.max(minY, Math.min(0,S.offsetY));
  }
  function updateTransform(){
    clampPan();
    const wrap=document.getElementById('pdfWrap');
    if(!wrap) return;
    wrap.style.transform=`translate(${S.offsetX}px, ${S.offsetY}px) scale(${S.zoomScale})`;
    wrap.style.transformOrigin='0 0';
  }
  function resetView(){ S.zoomScale=1; S.offsetX=0; S.offsetY=0; updateTransform(); syncZoomUI(); drawMinimap(); }
  function screenToPdf(clientX, clientY){
    const vp=document.getElementById('pdfViewport');
    const rect=vp.getBoundingClientRect();
    const x=(clientX-rect.left-S.offsetX)/S.zoomScale;
    const y=(clientY-rect.top -S.offsetY)/S.zoomScale;
    return {x,y};
  }
  function normalizeTag(t){ return String(t||'').toUpperCase().replace(/\s+/g,'').replace(/[^A-Z0-9]/g,''); }

  // --- public: render PDF and detect CMs ---
  async function renderPDFFromBlob(file){
    const url=URL.createObjectURL(file);
    try{
      const pdf=await pdfjsLib.getDocument({url}).promise;
      const page=await pdf.getPage(1);
      S.pdfViewport=page.getViewport({scale:1.2});
      const W=Math.floor(S.pdfViewport.width), H=Math.floor(S.pdfViewport.height);
      const pdfCanvas=document.getElementById('pdfCanvas');
      const overlay=document.getElementById('overlayCanvas');
      const wrap=document.getElementById('pdfWrap');
      [pdfCanvas,overlay].forEach(cv=>{ if(cv){ cv.width=W; cv.height=H; cv.style.width=W+'px'; cv.style.height=H+'px'; } });
      if(wrap){ wrap.style.width=W+'px'; wrap.style.height=H+'px'; }
      resetView();

      // Render page then detect
      await page.render({ canvasContext: pdfCanvas.getContext('2d'), viewport: S.pdfViewport }).promise;
      const textContent = await page.getTextContent();
      detectAndOverlay(textContent, page);

      const s=document.getElementById('pid-status'); if(s) s.textContent='✅ PID chargé';
    } finally { URL.revokeObjectURL(url); }
  }

  // Build normalized set of expected tags from state.emInstances
    function collectExpectedTags(){
    const set = new Set();
    const emByTag = {};
    const st = App.State.state;
    for(const em in (st.emData||{})){
      const arr = (st.emData[em].CM||[]);
      for(const cm of arr){
        const t = (cm && cm.tag)||'';
        if(!t) continue;
        const norm = String(t||'').toUpperCase().replace(/\s+/g,'').replace(/[^A-Z0-9]/g,'');
        set.add(norm);
        if(!emByTag[norm]) emByTag[norm]=em;
      }
    }
    return { set, emByTag };
  }
;
    const st = App.State.state;
    for(const em in (st.emData||{})){
      const arr = (st.emData[em].CM||[]);
      for(const cm of arr){
        const t = (cm && cm.tag)||'';
        if(!t) continue;
        const norm = normalizeTag(t);
        set.add(norm);
        if(!emByTag[norm]) emByTag[norm]=em;
      }
    }
    return { set, emByTag };
  }

  function detectAndOverlay(textContent, page){
    const oc=document.getElementById('overlayCanvas');
    if(!oc || !S.pdfViewport) return;
    const ctx=oc.getContext('2d');
    ctx.clearRect(0,0,oc.width,oc.height);

    const { set:expected, emByTag } = collectExpectedTags();
    if(expected.size===0){ console.log('[PID Mapping] Aucun tag attendu (import Excel requis)'); return; }

    const items = textContent.items || [];
    let hits = 0;
    items.forEach(it=>{
      const raw = (it.str||'').trim();
      if(!raw) return;
      const norm = normalizeTag(raw);
      if(!expected.has(norm)) return;

      // Map glyph transform to page coords
      const m = pdfjsLib.Util.transform(S.pdfViewport.transform, it.transform);
      const x = m[4], y = m[5];
      const fontHeight = Math.hypot(m[2],m[3]);
      const w = (it.width||0) * S.pdfViewport.scale;
      const h = fontHeight;
      const cy = S.pdfViewport.height - y;
      const rect = { x, y: cy-h, w, h };

      // draw circle
      const cx = rect.x + rect.w/2;
      const cyy = rect.y + rect.h/2;
      const em = emByTag[norm];
      const color = colorForEM(em);
      ctx.beginPath();
      ctx.arc(cx, cyy, Math.max(6, Math.min(14, h*0.7)), 0, Math.PI*2);
      ctx.fillStyle = hexToRgba(color, 0.28);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();

      hits++;
      // store for interactions
      if(!S.circleIndex) S.circleIndex=[];
      S.circleIndex.push({ tag: raw, cx, cy: cyy, r: Math.max(6, Math.min(14, h*0.7)) });
      console.log('[PID Mapping] Match:', raw, '→ EM:', em);
    });

    if(hits===0){
      console.log('[PID Mapping] Aucun CM détecté sur le PID (vérifier exactitude des tags).');
    }
  }

  // --- colors per EM ---
  const PALETTE = ['#e74c3c','#1abc9c','#3498db','#9b59b6','#f39c12','#2ecc71','#34495e','#e67e22','#16a085','#d35400'];
  const EM_COLOR = {};
  function colorForEM(em){
    if(!em) return '#ff0000';
    if(!EM_COLOR[em]){
      const keys = Object.keys(EM_COLOR);
      EM_COLOR[em] = PALETTE[keys.length % PALETTE.length];
    }
    return EM_COLOR[em];
  }
  function hexToRgba(hex, a){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if(!m) return `rgba(255,0,0,${a})`;
    const r=parseInt(m[1],16), g=parseInt(m[2],16), b=parseInt(m[3],16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // --- minimap (kept as-is) ---
  function drawMinimap(){
    const mini=document.getElementById('minimap'); if(!mini||!S.pdfViewport) return;
    const ctx=mini.getContext('2d');
    const mw=mini.width, mh=mini.height;
    ctx.clearRect(0,0,mw,mh);
    const pdfW=S.pdfViewport.width, pdfH=S.pdfViewport.height;
    const scale=Math.min(mw/pdfW, mh/pdfH);
    const pw=pdfW*scale, ph=pdfH*scale;
    const ox=(mw-pw)/2, oy=(mh-ph)/2;
    ctx.fillStyle='#f0f0f0'; ctx.fillRect(ox,oy,pw,ph);
    const vp=document.getElementById('pdfViewport');
    if(!vp) return;
    const vw=vp.clientWidth/S.zoomScale*scale;
    const vh=vp.clientHeight/S.zoomScale*scale;
    const vx=ox + (-S.offsetX/S.zoomScale)*scale;
    const vy=oy + (-S.offsetY/S.zoomScale)*scale;
    ctx.strokeStyle='#1e90ff'; ctx.lineWidth=2; ctx.strokeRect(vx,vy,vw,vh);
  }

  // --- interactions: wheel / pan / UI ---
  window.addEventListener('DOMContentLoaded', ()=>{
    const vp=document.getElementById('pdfViewport');
    if(!vp) return;
    vp.addEventListener('wheel',(e)=>{
      if(!S.pdfViewport) return;
      e.preventDefault();
      const factor = e.deltaY>0?0.9:1.1;
      const before=screenToPdf(e.clientX,e.clientY);
      S.zoomScale=Math.max(0.2, Math.min(6, S.zoomScale*factor));
      const after=screenToPdf(e.clientX,e.clientY);
      S.offsetX += (after.x-before.x)*S.zoomScale;
      S.offsetY += (after.y-before.y)*S.zoomScale;
      updateTransform(); syncZoomUI(); drawMinimap();
    }, {passive:false});
    let dragging=false,sx=0,sy=0,sox=0,soy=0;
    vp.addEventListener('mousedown', e=>{ dragging=true; sx=e.clientX; sy=e.clientY; sox=S.offsetX; soy=S.offsetY; });
    window.addEventListener('mousemove', e=>{ if(!dragging) return; S.offsetX=sox+(e.clientX-sx); S.offsetY=soy+(e.clientY-sy); updateTransform(); drawMinimap(); });
    window.addEventListener('mouseup', ()=> dragging=false);

    const slider=document.getElementById('zoomSlider');
    if(slider) slider.addEventListener('input', (e)=>{
      const pct=Math.max(20, Math.min(600, parseInt(e.target.value||'100',10)));
      const rect=vp.getBoundingClientRect();
      const cx=rect.left+vp.clientWidth/2, cy=rect.top+vp.clientHeight/2;
      const before=screenToPdf(cx,cy);
      S.zoomScale=pct/100;
      const after=screenToPdf(cx,cy);
      S.offsetX += (after.x-before.x)*S.zoomScale;
      S.offsetY += (after.y-before.y)*S.zoomScale;
      updateTransform(); syncZoomUI(); drawMinimap();
    });
    const reset=document.getElementById('zoomReset'); if(reset) reset.addEventListener('click', resetView);
  });

  return { renderPDFFromBlob, resetView };
})();