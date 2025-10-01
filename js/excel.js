(function(){
  if(!window.App) window.App={};
  if(!App.State) App.State={ state:{ emData:{}, emInstances:{} } };
  if(!App.Excel) App.Excel={};

  function norm(v){ return String(v==null?'':v).replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim(); }
  function up(v){ return norm(v).toUpperCase(); }

  function isHeaderRow(row){
    const U = (row||[]).map(up);
    return U.some(c=>c==='EM NAME & ID');
  }

  function mapColumns(H1,H2){
    const cols=[], reAct=/\bCM_Actuator(\d+)\b/i, reIns=/\bCM[_ ]?Instrum(\d+)\b/i;
    for(let c=0;c<Math.max(H1.length,H2.length);c++){
      const b = H1[c]||'', bU=up(b);
      const f = H2[c]||'';
      let kind='other', block=null;
      if(bU==='COMMENT' || bU==='EM NAME & ID' || bU==='TAG VERSION' || /^PLAGE INDEX/i.test(b)) kind='fixed';
      else if(reAct.test(b)){ kind='act'; block=parseInt(b.match(reAct)[1],10); }
      else if(reIns.test(b)){ kind='ins'; block=parseInt(b.match(reIns)[1],10); }
      cols[c]={kind,block,b1:b,b2:f};
    }
    const idxEM       = H1.findIndex(v=>up(v)==='EM NAME & ID');
    const idxCOMMENT  = H1.findIndex(v=>up(v)==='COMMENT');
    const idxTAGVER   = H1.findIndex(v=>up(v)==='TAG VERSION');
    const idxPLAGE    = H1.findIndex(v=>/^PLAGE INDEX/i.test(v));
    return { cols, idxEM, idxCOMMENT, idxTAGVER, idxPLAGE };
  }

  function pickFieldVal(rawField, obj){
    // Accept multiple textual variants
    const map = {
      roleName: ['RoleName','Role Name','Name & I/O Name','Name  & I/O Name','Name & I-O Name','Name and I/O Name'],
      description: ['Description','Descr','Desc'],
      tag: ['PID_CM_Tag','PID CM Tag','PID-CM-Tag','PID_CM TAG'],
      displayName: ['Display Name','DisplayName','Display_Name'],
      fr: ['French description','French Description','French descr','FR Description']
    };
    const tryKeys = map[rawField]||[];
    for(const k of tryKeys){ if(obj.hasOwnProperty(k)) return norm(obj[k]); }
    return '';
  }

  App.Excel.handleExcel = function(file){
    if(!file) return;
    const fr = new FileReader();
    fr.onload = function(e){
      try{
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data,{type:'array'});
        // Sheet 2 (index 1), fallback to last if missing
        const sheetIndex = Math.min(1, wb.SheetNames.length-1);
        const ws = wb.Sheets[wb.SheetNames[sheetIndex]];
        const A = XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        if(!A || !A.length){ console.error('[Excel] Feuille vide'); return; }

        // Find header block (row with "EM Name & ID")
        let h=-1;
        for(let i=0;i<A.length;i++){ if(isHeaderRow(A[i])){ h=i; break; } }
        if(h<0){ console.error('[Excel] En-têtes introuvables (EM Name & ID)'); return; }

        const H1=(A[h]||[]).map(norm);
        const H2=(A[h+1]||[]).map(norm);
        const {cols, idxEM, idxCOMMENT, idxTAGVER, idxPLAGE} = mapColumns(H1,H2);

        const rows = A.slice(h+2);
        const emData = {};
        let cmCount=0;

        function ensureEM(em){
          if(!emData[em]) emData[em] = { meta:{}, CM:[] };
          return emData[em];
        }

        rows.forEach(row=>{
          const EM = norm(row[idxEM]||'');
          if(!EM) return;
          const comment = idxCOMMENT>=0? norm(row[idxCOMMENT]):'';
          const tagVer  = idxTAGVER>=0? norm(row[idxTAGVER]):'';
          const plage   = idxPLAGE>=0? norm(row[idxPLAGE]):'';

          const acts={}, ins={};
          cols.forEach((m,c)=>{
            if(!m) return;
            if(m.kind==='act' && m.block){
              (acts[m.block]=acts[m.block]||{})[m.b2] = row[c];
            }else if(m.kind==='ins' && m.block){
              (ins[m.block]=ins[m.block]||{})[m.b2] = row[c];
            }
          });

          for(let b=1;b<=27;b++){
            const o=acts[b]; if(!o) continue;
            const cm={
              type:'Actuator',
              block:b,
              roleOrSignal: pickFieldVal('roleName', o),
              description : pickFieldVal('description', o),
              tag         : pickFieldVal('tag', o),
              displayName : pickFieldVal('displayName', o),
              fr          : pickFieldVal('fr', o)
            };
            if(cm.roleOrSignal || cm.description || cm.tag || cm.displayName || cm.fr){
              ensureEM(EM).CM.push(cm); cmCount++;
            }
          }
          for(let b=1;b<=12;b++){
            const o=ins[b]; if(!o) continue;
            const cm={
              type:'Instrument',
              block:b,
              roleOrSignal: pickFieldVal('roleName', o),
              description : pickFieldVal('description', o),
              tag         : pickFieldVal('tag', o),
              displayName : pickFieldVal('displayName', o),
              fr          : pickFieldVal('fr', o)
            };
            if(cm.roleOrSignal || cm.description || cm.tag || cm.displayName || cm.fr){
              ensureEM(EM).CM.push(cm); cmCount++;
            }
          }

          const m = ensureEM(EM).meta;
          if(comment) m.comment = comment;
          if(tagVer)  m.tagVersion = tagVer;
          if(plage)   m.plage = plage;
        });

        // Build instances strictly from PID_CM_Tag
        const S = App.State.state;
        S.emData = emData;
        const instance = (()=>{
          for(const em in emData){
            const tv=(emData[em].meta && emData[em].meta.tagVersion)||'';
            const m=/P\d{2}\.\d{2}/i.exec(tv);
            if(m) return m[0];
          }
          return 'DEFAULT';
        })();
        S.emInstances = {};
        for(const em in emData){
          const tags = (emData[em].CM||[])
            .map(cm=>cm.tag)
            .filter(t=>t && t.length>0);
          S.emInstances[em] = {};
          S.emInstances[em][instance] = Array.from(new Set(tags));
        }

        console.log('[Excel] EM:', Object.keys(emData).length, 'CM:', cmCount, 'Instance:', instance);
        if(typeof window.afterEMLoaded==='function') window.afterEMLoaded();
      }catch(err){
        console.error('[Excel] Erreur parse:', err);
      }
    };
    fr.readAsArrayBuffer(file);
  };
})();