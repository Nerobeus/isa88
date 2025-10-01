window.App = window.App || {};
App.Utils = (function(){
  // ---- Base64 helpers (peu utilisés avec IndexedDB, mais utiles si besoin) ----
  function arrayBufferToB64(buffer){
    let binary='';
    const bytes=new Uint8Array(buffer);
    const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk){
      const sub=bytes.subarray(i,i+chunk);
      binary += String.fromCharCode.apply(null, sub);
    }
    return btoa(binary);
  }
  function b64ToArrayBuffer(b64){
    try{
      const bin=atob(b64);
      const len=bin.length;
      const bytes=new Uint8Array(len);
      for(let i=0;i<len;i++) bytes[i]=bin.charCodeAt(i);
      return bytes.buffer;
    }catch(e){
      console.error('❌ b64ToArrayBuffer: base64 invalide', e);
      return new ArrayBuffer(0);
    }
  }
  // ---- Couleurs utilitaires ----
  function stringToColor(str){let h=0;for(let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h);const c=(h&0x00FFFFFF).toString(16).toUpperCase();return"#"+"000000".substring(0,6-c.length)+c;}
  function getTextColor(bg){if(!bg||bg.length!==7)return"#000";const c=bg.substring(1);const rgb=parseInt(c,16);const r=(rgb>>16)&0xff,g=(rgb>>8)&0xff,b=(rgb>>0)&0xff;const l=0.2126*r+0.7152*g+0.0722*b;return l<145?"#fff":"#000";}
  function rgba(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgba(${r},${g},${b},${a})`;}

  // ---- IndexedDB helpers ----
  function openDB(){
    return new Promise((resolve, reject)=>{
      const req = indexedDB.open("pidDB", 1);
      req.onupgradeneeded = e=>{
        const db = e.target.result;
        if(!db.objectStoreNames.contains("pids")){
          const store = db.createObjectStore("pids", { keyPath: "name" });
          store.createIndex("ref", "ref", {unique:false});
        }
      };
      req.onsuccess = e=> resolve(e.target.result);
      req.onerror = e=> reject(e);
    });
  }
  async function idbPut(record){
    const db = await openDB();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction("pids", "readwrite");
      tx.objectStore("pids").put(record);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=e=>reject(e);
    });
  }
  async function idbGet(name){
    const db = await openDB();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction("pids", "readonly");
      const req = tx.objectStore("pids").get(name);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=e=>reject(e);
    });
  }
  async function idbAll(){
    const db = await openDB();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction("pids", "readonly");
      const req = tx.objectStore("pids").getAll();
      req.onsuccess=()=>resolve(req.result||[]);
      req.onerror=e=>reject(e);
    });
  }
  async function idbClear(){
    const db = await openDB();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction("pids", "readwrite");
      tx.objectStore("pids").clear();
      tx.oncomplete=()=>resolve(true);
      tx.onerror=e=>reject(e);
    });
  }

  return { arrayBufferToB64, b64ToArrayBuffer, stringToColor, getTextColor, rgba, openDB, idbPut, idbGet, idbAll, idbClear };
})();