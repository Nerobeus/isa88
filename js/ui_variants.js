window.App = window.App || {};
App.Variants = (function(){

  function updateEMSelect(emData){
    const sel=document.getElementById('variantEmSelect');
    if(!sel){ console.warn('⚠️ variantEmSelect introuvable'); return; }
    sel.innerHTML='';
    Object.keys(emData).forEach(em=>{ const o=document.createElement('option'); o.value=em; o.textContent=em; sel.appendChild(o); });
    populateCMChecklist(emData, sel.value);
  }

  function populateCMChecklist(emData, em){
    const box=document.getElementById('variantCmSelect'); if(!box) return;
    box.innerHTML='';
    if(!emData[em]) return;
    (emData[em].CM||[]).forEach(cm=>{
      const id='cm_'+cm.tag;
      const label=document.createElement('label');
      const chk=document.createElement('input'); chk.type='checkbox'; chk.value=cm.tag; chk.id=id;
      label.htmlFor=id; label.appendChild(chk); label.appendChild(document.createTextNode(' '+cm.tag+(cm.description?(' - '+cm.description):'')));
      box.appendChild(label); box.appendChild(document.createElement('br'));
    });
  }

  function bind(emData){
    const sel=document.getElementById('variantEmSelect');
    const btn=document.getElementById('addVariantBtn');
    const nameInput=document.getElementById('variantName');
    if(sel){ sel.addEventListener('change', ()=> populateCMChecklist(emData, sel.value)); }
    if(btn){
      btn.addEventListener('click', ()=>{
        const em=sel?.value; const name=nameInput?.value?.trim();
        if(!em || !name) return;
        const chosen=Array.from(document.querySelectorAll('#variantCmSelect input[type=checkbox]:checked')).map(c=>c.value);
        if(!chosen.length) return;
        if(!emData[em].variants) emData[em].variants=[];
        emData[em].variants.push({name, cmList:chosen});
        localStorage.setItem('variants', JSON.stringify(extractVariants(emData)));
        nameInput.value='';
        document.querySelectorAll('#variantCmSelect input[type=checkbox]').forEach(c=>c.checked=false);
        renderVariants(emData);
      });
    }
  }

  function extractVariants(emData){
    const out={}; for(const em in emData){ if(emData[em].variants && emData[em].variants.length) out[em]=emData[em].variants; } return out;
  }

  function restoreVariants(emData){
    const saved=JSON.parse(localStorage.getItem('variants')||'{}');
    for(const em in saved){ if(emData[em]) emData[em].variants = saved[em]; }
  }

  function renderVariants(emData){
    const div=document.getElementById('variantsList'); if(!div) return;
    div.innerHTML='';
    for(const em in emData){
      if(emData[em].variants && emData[em].variants.length){
        const emDiv=document.createElement('div'); emDiv.innerHTML=`<h4>${em}</h4>`;
        emData[em].variants.forEach(v=>{ const p=document.createElement('p'); p.textContent=`Variant ${v.name}: ${v.cmList.join(', ')}`; emDiv.appendChild(p); });
        div.appendChild(emDiv);
      }
    }
  }

  return { updateEMSelect, bind, renderVariants, restoreVariants };
})();