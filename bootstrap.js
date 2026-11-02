(async()=>{
  const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('无法加载 '+src));document.head.append(s);});
   try{for(const src of ['engine.js','ocr-core.js','workbooks.js','model.js','io.js','recognition.js','matching.js','image-viewer.js?v=20261102-zoom','app.js?v=20261102-zoom'])await load(src);}
  catch(e){document.getElementById('workspace').textContent=e.message;}
})();
