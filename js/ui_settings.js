window.App = window.App || {};
App.Settings = (function(){

  function bind(state){
    const btnOpen = document.getElementById('settingsBtn');
    const btnClose = document.getElementById('closeSettingsBtn');
    const btnSave = document.getElementById('saveSettingsBtn');
    const modal = document.getElementById('settingsModal');

    if(!btnOpen || !btnClose || !btnSave || !modal){
      console.warn("⚠️ Paramètres UI introuvables dans le DOM");
      return;
    }

    btnOpen.addEventListener('click', ()=>{ modal.style.display='flex'; });
    btnClose.addEventListener('click', ()=>{ modal.style.display='none'; });

    btnSave.addEventListener('click', ()=>{
      const dx=parseInt(document.getElementById('paramDx').value)||0;
      const dy=parseInt(document.getElementById('paramDy').value)||0;
      const sh=parseInt(document.getElementById('paramShadow').value)||0;
      state.HIGHLIGHT_DX=dx; state.HIGHLIGHT_DY=dy; state.SHADOW_BLUR=sh;
      localStorage.setItem('params', JSON.stringify({dx,dy,shadow:sh}));
      modal.style.display='none';
      App.PDF.rebuildCircleIndex();
      App.PDF.redrawCircles();
    });
  }

  function loadToUI(state){
    const saved=localStorage.getItem('params');
    if(saved){
      try{ const p=JSON.parse(saved);
        state.HIGHLIGHT_DX=p.dx; state.HIGHLIGHT_DY=p.dy; state.SHADOW_BLUR=p.shadow;
        const dx=document.getElementById('paramDx'); const dy=document.getElementById('paramDy'); const sh=document.getElementById('paramShadow');
        if(dx) dx.value=p.dx; if(dy) dy.value=p.dy; if(sh) sh.value=p.shadow;
      }catch(e){}
    }
  }

  return { bind, loadToUI };
})();