window.W=(()=>{
 const E=createEngine(),events=new EventTarget();
 const s={docs:[],tables:[],submitted:new Map(),refs:null,template:null,snapshot:null,manual:new Map(),step:1,activeTable:null,activePage:null,showOriginal:true,reviewView:'table',stale:false,revision:0,matchRevision:0,unsaved:false,ocrBusy:false,matchBusy:false,importing:false,exporting:false,cropPending:false,ocrJob:null,worker:null,workerUrl:null,matchTab:'pending',mapPage:0,tablePage:0,saved:[],message:'',lib:{},libErrors:{}};
 const emit=(kind='change',detail={})=>events.dispatchEvent(new CustomEvent(kind,{detail}));
 const uid=()=>crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2);
 const doc=id=>s.docs.find(d=>d.id===id),page=id=>s.docs.flatMap(d=>d.pages).find(p=>p.id===id),table=id=>s.tables.find(t=>t.id===id);
 const current=()=>table(s.activeTable);
 function dirty(){s.revision++;s.unsaved=true;}
 function invalidate(){s.matchRevision++;if(s.snapshot)s.stale=true;dirty();emit('status');}
 function touch(t){t.version++;dirty();if(s.submitted.has(t.id)){s.matchRevision++;if(s.snapshot)s.stale=true;}emit('status');}
 function removeTable(id){const included=s.submitted.delete(id);s.tables=s.tables.filter(t=>t.id!==id);if(included)invalidate();if(s.activeTable===id)s.activeTable=s.tables[0]?.id||null;}
 function addTable(d,p,result,order){
  const id=p?`${p.id}:table:${order}`:uid(),old=table(id);
  const t={id,documentId:d.id,pageId:p?.id||null,pageNumber:p?.number||null,order,name:p?'表'+(order+1):result.name,rows:result.rows,merges:result.merges||[],selected:true,version:(old?.version||0)+1,config:E.detect(result.rows),ocr:!!p};
  if(old)removeTable(id);s.tables.push(t);s.activeTable||=id;s.activePage||=p?.id||null;dirty();return t;
 }
 function orderedTables(){return [...s.tables].sort((a,b)=>s.docs.findIndex(d=>d.id===a.documentId)-s.docs.findIndex(d=>d.id===b.documentId)||(a.pageNumber||0)-(b.pageNumber||0)||a.order-b.order);}
 function transfer(){const chosen=orderedTables().filter(t=>t.selected);if(!chosen.length)throw Error('请先勾选需要送入的表格');for(const t of chosen){const d=doc(t.documentId);s.submitted.set(t.id,{id:t.id,fileId:d.id,fileName:d.name,name:t.pageNumber?`第${t.pageNumber}页 / ${t.name}`:t.name,rows:structuredClone(t.rows),config:structuredClone(t.config),version:t.version,pageNumber:t.pageNumber});}invalidate();s.step=3;emit();return chosen.length;}
 function selectTable(id,row=null){const t=table(id);if(!t)return;s.activeTable=id;s.activePage=t.pageId;s.tablePage=row?Math.floor((row-1)/100):0;s.highlightRow=row;s.reviewView='table';s.step=2;emit();}
 function removeDoc(id){const d=doc(id);if(!d)return;if(d.pages.some(p=>p.status==='识别中'||p.status==='等待'||p.status.startsWith('重试'))||s.cropPending)throw Error('请先等待该文件识别或裁剪完成');for(const t of s.tables.filter(t=>t.documentId===id))removeTable(t.id);s.docs=s.docs.filter(d=>d.id!==id);if(!page(s.activePage))s.activePage=s.docs.flatMap(d=>d.pages)[0]?.id||null;dirty();emit();}
 function safeName(name,extension){let base=String(name).replace(/\.[^.]+$/,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,145)||'结果';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base))base='_'+base;return base+'.'+extension;}
 return {s,E,events,emit,uid,doc,page,table,current,dirty,invalidate,touch,removeTable,addTable,orderedTables,transfer,selectTable,removeDoc,safeName};
})();
