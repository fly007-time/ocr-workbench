window.Workbooks=(()=>{const E=createEngine();
function auditSheets(snapshot,agg,fileId=null){
  const keep=r=>fileId===null||r.fileId===fileId,records=snapshot.records.filter(keep),raw=new Set(records.map(r=>r.channel));
  const relevantSheets=snapshot.sheets.filter(s=>fileId===null||s.fileId===fileId);
  const sourceKeep=r=>fileId===null||r.fileId===fileId;
  const mapping=[['原名称','记录数','交易笔数（缺失时留空）','目标渠道','相似度','处理状态','候选一','候选二','候选三'],...snapshot.matches.filter(m=>raw.has(m.raw)).map(m=>{const rows=records.filter(r=>r.channel===m.raw);return [m.raw,rows.length,rows.some(r=>r.count===null)?'':rows.reduce((v,r)=>v+r.count,0),m.target,m.score,{auto:'自动匹配',confirmed:'人工确认',pending:'待确认',unmatched:'未匹配',excluded:'人工排除'}[m.status],...m.candidates.map(c=>`${c.name} ${(c.score*100).toFixed(1)}%`)];})];
  const excluded=[['文件','工作表','原始行','原渠道','目标渠道','原始金额','金额','原因'],...agg.excluded.filter(keep).map(r=>[r.file,r.sheet,r.row,r.channel,r.target,r.raw,r.cents/100,r.reason])];
  const issues=[['文件','工作表','原始行','渠道','原始金额','原因'],...snapshot.issues.filter(sourceKeep).map(r=>[r.file,r.sheet,r.row,r.channel,r.raw,r.reason]),...snapshot.warnings.map(w=>['','','','','',w])];
  const check=[['文件','工作表','原始行','范围','原表合计','计算金额','差额'],...snapshot.checks.filter(sourceKeep).map(r=>[r.file,r.sheet,r.row,r.channel,r.reported/100,r.calculated/100,r.difference/100])];
  const includedMap=new Map(agg.included.map(r=>[r.sourceId+'\0'+r.row,r]));
  const trace=[['settlement','文件','工作表','原始行','原渠道','原始金额','金额','交易笔数','是否纳入','目标渠道'],...records.map(r=>{const hit=includedMap.get(r.sourceId+'\0'+r.row);const local=relevantSheets.findIndex(s=>s.id===r.sourceId);return ['settlement'+(local+1),r.file,r.sheet,r.row,r.channel,r.raw,r.cents/100,r.count??'',hit?'是':'否',hit?.target||''];})];
  const parameters=[['参数','值'],['生成时间',snapshot.created],['匹配阈值',snapshot.threshold],['低分待确认阈值',.7],['候选分差阈值',.05],['金额单位','按源数据数值汇总；不做币种换算'],['提取金额',records.reduce((sum,r)=>E.add(sum,r.cents),0)/100],['纳入金额',agg.included.filter(keep).reduce((sum,r)=>E.add(sum,r.cents),0)/100],['未纳入金额',agg.excluded.filter(keep).reduce((sum,r)=>E.add(sum,r.cents),0)/100],['计算说明','金额采用整数分累加；无效金额另列异常。渠道分组有小计时采用小计并核对明细。'],...relevantSheets.map(s=>[s.fileName+' / '+s.name,`表头第${s.config.header+1}行；渠道列${s.config.ch+1}；金额列${s.config.amt+1}；结构${s.config.mode}；确认${s.config.confirmed?'是':'否'}`])];
  return [['未纳入汇总',excluded],['解析异常',issues],['合计核对',check],['来源明细',trace],['匹配明细',mapping],['运行参数',parameters]];
}
function bookFrom(items){const wb=XLSX.utils.book_new(),used=new Set();for(const [label,rows] of items){let base=String(label).replace(/[\\/?*\[\]:]/g,'_').replace(/^'+|'+$/g,'').slice(0,31)||'Sheet';if(base.toUpperCase()==='HISTORY')base='Sheet';let name=base,n=1;while(used.has(name.toLowerCase())){const suffix='_'+n++;name=base.slice(0,31-suffix.length)+suffix;}used.add(name.toLowerCase());const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=(rows[0]||[]).map((_,i)=>({wch:Math.min(38,Math.max(12,...rows.slice(0,100).map(r=>String(r[i]??'').length*1.5)))}));XLSX.utils.book_append_sheet(wb,ws,name);}return wb;}
function buildExports(snapshot,mode){
  const agg=E.aggregate(snapshot),files=[...new Set(snapshot.sheets.map(s=>s.fileId))].map(id=>({id,name:snapshot.sheets.find(s=>s.fileId===id).fileName.split(/[\\/]/).pop(),slots:snapshot.sheets.filter(s=>s.fileId===id).map(s=>s.slot)}));
  const merged=E.summary(snapshot,agg,snapshot.sheets.map(s=>s.slot));
  if(mode==='merged')return [{name:'合并汇总结果.xlsx',wb:bookFrom([['汇总',merged],...auditSheets(snapshot,agg)])}];
  if(mode==='individual')return files.map(f=>({name:f.name.replace(/\.[^.]+$/,'')+'_汇总结果.xlsx',wb:bookFrom([['汇总',E.summary(snapshot,agg,f.slots)],...auditSheets(snapshot,agg,f.id)])}));
  const overview=[['支付渠道',...files.map(f=>f.name.replace(/\.[^.]+$/,'')),'合计']],colTotals=new Array(files.length).fill(0);let grand=0;
  for(const name of snapshot.template){const amounts=agg.totals.get(name),values=files.map(f=>f.slots.reduce((sum,slot)=>E.add(sum,amounts[slot]),0)),total=values.reduce(E.add,0);values.forEach((v,i)=>colTotals[i]=E.add(colTotals[i],v));grand=E.add(grand,total);overview.push([name,...values.map(v=>v/100),total/100]);}overview.push(['合计',...colTotals.map(v=>v/100),grand/100]);
  const items=[['汇总结果',overview],['合并汇总结果',merged],...files.map(f=>[f.name.replace(/\.[^.]+$/,'')+'_汇总',E.summary(snapshot,agg,f.slots)]),...auditSheets(snapshot,agg)];
  return [{name:'单独+合并汇总结果.xlsx',wb:bookFrom(items)}];
}
async function serializeWorkbook(wb){
  // SheetJS CE does not emit tab colors; add standard OOXML properties after serialization.
  const zip=await JSZip.loadAsync(XLSX.write(wb,{bookType:'xlsx',type:'array'}));
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  for(const name of ['未纳入汇总','解析异常']){
    const index=wb.SheetNames.indexOf(name);if(index<0)continue;
    const path=`xl/worksheets/sheet${index+1}.xml`,entry=zip.file(path);
    if(!entry)throw Error('无法设置工作表标签颜色：'+name);
    const doc=new DOMParser().parseFromString(await entry.async('string'),'application/xml');
    if(doc.querySelector('parsererror'))throw Error('工作表格式无效：'+name);
    const root=doc.documentElement;
    let properties=Array.from(root.children).find(el=>el.localName==='sheetPr');
    if(!properties){properties=doc.createElementNS(ns,'sheetPr');root.insertBefore(properties,root.firstChild);}
    let color=Array.from(properties.children).find(el=>el.localName==='tabColor');
    if(!color){color=doc.createElementNS(ns,'tabColor');properties.insertBefore(color,properties.firstChild);}
    for(const attr of Array.from(color.attributes))color.removeAttributeNode(attr);
    color.setAttribute('rgb','FFFF0000');
    zip.file(path,new XMLSerializer().serializeToString(doc));
  }
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}

return {buildExports,serializeWorkbook,bookFrom};})();