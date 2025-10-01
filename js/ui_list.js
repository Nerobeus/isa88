window.App = window.App || {};
App.List = (function(){
  function renderCMList(S){
    const el = document.getElementById('cmList');
    if (!el){ console.warn('cmList missing'); return; }
    let html='';
    for (const em in (S.emInstances||{})){
      html += `<div class="em-title">${em}</div>`;
      const insts = S.emInstances[em] || {};
      for (const inst in insts){
        const tags = insts[inst] || [];
        tags.forEach(t => {
          html += `<div class="em-row"><span class="chip">${inst}</span>${t}</div>`;
        });
      }
    }
    el.innerHTML = html || '—';
  }
  function highlightRowForTag(tag){
    const rows = document.querySelectorAll('.em-row');
    rows.forEach(r=>{
      if (r.textContent.includes(tag)) r.classList.add('highlight-row');
      setTimeout(()=> r.classList.remove('highlight-row'), 1200);
    });
  }
  return { renderCMList, highlightRowForTag };
})();