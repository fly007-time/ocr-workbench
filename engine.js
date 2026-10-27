function createEngine() {
  const text = v => String(v ?? '').normalize('NFKC').trim();
  const key = v => text(v).toUpperCase().replace(/[\s_\-/\\]/g, '');
  const fixes = {SETILI:'SETTLE',ROG:'BOC',WECNAT:'WECHAT',WRECHAT:'WECHAT',DOC:'BOC',FUN:'FUNG',PUNG:'FUNG',CRUI:'CARD',CTRL:'CARD',AMAX:'AMERICANEXPRESS',AUXAX:'AMERICANEXPRESS',USEPAY:'UNIONPAY',AMEX:'AMERICANEXPRESS',VISA:'VISACARD'};
  const normalize = value => key(text(value).toUpperCase().replace(/\bVISA\s+CARD\b/g,'VISACARD').replace(/[A-Z]+/g, word => fixes[word] || word));
  function similarity(a,b) {
    a=normalize(a);b=normalize(b);
    if(!a||!b)return 0;
    if(a===b)return 1;
    if(a.length>=3&&b.length>=3&&(a.includes(b)||b.includes(a)))return .85;
    let prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++) {const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=next;}
    return 1-prev[b.length]/Math.max(a.length,b.length);
  }
  function money(value) {
    if(typeof value==='number'){
      if(!Number.isFinite(value))return {ok:false,error:'金额不是有限数字'};
      const cents=Math.round(value*100);
      if(!Number.isSafeInteger(cents))return {ok:false,error:'金额超出精确计算范围'};
      if(Math.abs(value*100-cents)>1e-6)return {ok:false,error:'金额超过两位小数'};
      return {ok:true,cents};
    }
    let s=text(value);
    if(!s)return {ok:false,error:'金额为空'};
    let negative=false;
    if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1).trim();}
    const leading=s.match(/^([+-])\s*(?=HK\$|US\$|RMB|CNY|HKD|USD|[$¥￥])/i);
    if(leading)s=s.slice(leading[0].length);
    s=(leading?leading[1]:'')+s.replace(/^(?:HK\$|US\$|RMB|CNY|HKD|USD|[$¥￥])\s*/i,'').replace(/\s*(?:元|RMB|CNY|HKD|USD)$/i,'').trim();
    if(!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(s))return {ok:false,error:'金额格式无效或超过两位小数'};
    if(negative&&/^[+-]/.test(s))return {ok:false,error:'括号与正负号不能同时使用'};
    const sign=negative||s[0]==='-'?-1:1;
    const [whole,frac='']=s.replace(/^[+-]/,'').replace(/,/g,'').split('.');
    const cents=sign*(Number(whole)*100+Number(frac.padEnd(2,'0')));
    if(!Number.isSafeInteger(cents))return {ok:false,error:'金额超出精确计算范围'};
    return {ok:true,cents};
  }
  function add(a,b) {const v=a+b;if(!Number.isSafeInteger(v))throw Error('累计金额超出精确计算范围');return v;}
  function detect(rows) {
    let best=null;
    for(let i=0;i<Math.min(12,rows.length);i++) {
      const h=(rows[i]||[]).map(v=>text(v).toUpperCase());
      const ch=h.findIndex(v=>/CHANNEL|MERCHANT|NAME|渠道|商户|名称/.test(v)&&!/AMOUNT|金额|笔数/.test(v));
      const amt=h.findIndex(v=>/AMOUNT|金额/.test(v));
      const count=h.findIndex(v=>/^(COUNT|SUM|SCM)$|笔数|次数|数量/.test(v));
      const type=h.findIndex(v=>/^(TYPE|TRANSACTION TYPE)$|交易类型/.test(v));
      if(ch>=0&&amt>=0&&ch!==amt){const score=2+(count>=0?1:0)+(type>=0?1:0);if(!best||score>best.score)best={header:i,ch,amt,count,type,mode:'auto',confirmed:true,score};}
    }
    return best||{header:0,ch:0,amt:2,count:1,type:-1,mode:'auto',confirmed:true};
  }
  function reference(rows) {
    const seen=new Set(),names=[],warnings=[];
    for(let i=0;i<rows.length;i++) {
      const name=text(rows[i]?.[0]);
      if(!name||/^(NAN|合计|总计|TOTAL)$/i.test(name))continue;
      if(i===0&&/^(渠道|支付渠道|商户|名称|渠道名称|标准名称|标准渠道|CHANNEL|MERCHANT|NAME|PAYMENT|PAYMENT CHANNEL|PAYMENT METHOD|STANDARD NAME)$/i.test(name))continue;
      const k=key(name);
      if(seen.has(k)){warnings.push(`第 ${i+1} 行名称重复：${name}`);continue;}
      seen.add(k);names.push(name);
    }
    return {names,warnings};
  }
  function parseSheet(sheet) {
    const {rows,config:c}=sheet,records=[],issues=[],checks=[];
    const issue=(row,reason,raw='',channel='')=>issues.push({sourceId:sheet.id,fileId:sheet.fileId,file:sheet.fileName,sheet:sheet.name,row:row+1,reason,raw:text(raw),channel});
    if(!c.confirmed) {issue(c.header,'表头或列位置尚未确认');return {records,issues,checks};}
    const width=rows.reduce((m,r)=>Math.max(m,r.length),0);
    if(!Number.isInteger(c.header)||c.header<0||c.header>=rows.length||c.ch===c.amt||c.ch<0||c.amt<0||c.ch>=width||c.amt>=width){issue(c.header,'表头或渠道/金额列配置无效');return {records,issues,checks};}
    let group=null;
    const isTotal=v=>/^(TOTAL|SUBTOTAL|GRAND TOTAL|小计|合计|总计)$/i.test(text(v));
    const isTransaction=v=>/^(SALE|VOID|COMPLETE|COMPLETE VOID|TIPS|REFUND|DEBIT|CREDIT|AUTH|PREAUTH|AUTHORIZATION|CASHBACK)$/i.test(text(v));
    const record=(ch,result,row,raw,count)=>({sourceId:sheet.id,fileId:sheet.fileId,file:sheet.fileName,sheet:sheet.name,slot:sheet.slot,row:row+1,channel:ch,cents:result.cents,raw:text(raw),count});
    function readCount(row,index){if(index<0||!text(row[index]))return null;const s=text(row[index]).replace(/,/g,'');if(!/^\d+$/.test(s)||!Number.isSafeInteger(Number(s))){issue(rows.indexOf(row),'交易笔数无效',row[index]);return null;}return Number(s);}
    function flush() {
      if(!group)return;
      if(group.total) {
        records.push(group.total);
        if(group.details.length){const sum=group.details.reduce((v,r)=>add(v,r.cents),0);const diff=group.total.cents-sum;checks.push({sourceId:sheet.id,fileId:sheet.fileId,file:sheet.fileName,sheet:sheet.name,row:group.total.row,channel:group.name,reported:group.total.cents,calculated:sum,difference:diff});if(diff)issue(group.total.row-1,'渠道小计与明细不一致；本次采用小计金额',group.total.raw,group.name);}
      } else if(group.details.length)records.push(...group.details);
      else issue(group.row,'渠道没有可用金额', '',group.name);
      group=null;
    }
    const sheetTotals=[];
    for(let ri=c.header+1;ri<rows.length;ri++) {
      const row=rows[ri]||[];
      if(!row.some(v=>text(v)))continue;
      const channel=text(row[c.ch]),type=c.type>=0?text(row[c.type]):'';
      const totalIndex=row.findIndex(isTotal);
      if(totalIndex>=0) {
        let ai=c.amt,ci=c.count;
        if(totalIndex===ai||(totalIndex===ci&&ai>ci))ai++;
        if(totalIndex===ci)ci++;
        const result=money(row[ai]);
        if(!result.ok){issue(ri,result.error,row[ai],group?.name||channel);if(group)flush();continue;}
        const label=text(row[totalIndex]).toUpperCase();
        if(group&&!/^(GRAND TOTAL|总计)$/.test(label)) {group.total=record(group.name,result,ri,row[ai],readCount(row,ci));flush();}
        else {flush();if(/^(SUBTOTAL|小计)$/.test(label))issue(ri,'未归属渠道的小计未参与汇总，请确认报表结构',row[ai]);else sheetTotals.push({result,row:ri});}
        continue;
      }
      if(/^(CHANNEL|MERCHANT|NAME|TYPE|渠道|商户|名称|交易类型)$/i.test(channel)||/REPORT|报表标题/.test(channel.toUpperCase()))continue;
      if(channel&&!isTransaction(channel)&&!text(row[c.amt])&&!text(row[c.count])) {
        if(c.mode==='flat'){issue(ri,'渠道金额为空',row[c.amt],channel);continue;}
        flush();group={name:channel,row:ri,details:[],total:null};continue;
      }
      const transaction=isTransaction(channel)||isTransaction(type)||!channel;
      if(group&&transaction) {
        const result=money(row[c.amt]);
        if(result.ok)group.details.push(record(group.name,result,ri,row[c.amt],readCount(row,c.count)));
        else issue(ri,result.error,row[c.amt],group.name);
        continue;
      }
      if(!channel||isTransaction(channel)){issue(ri,'金额行缺少明确的渠道归属',row[c.amt],channel);continue;}
      flush();
      const result=money(row[c.amt]);
      if(!result.ok){issue(ri,result.error,row[c.amt],channel);continue;}
      const r=record(channel,result,ri,row[c.amt],readCount(row,c.count));
      if(c.mode==='grouped')group={name:channel,row:ri,details:[r],total:null};else records.push(r);
    }
    flush();
    const sum=records.reduce((v,r)=>add(v,r.cents),0);
    for(const total of sheetTotals){const diff=total.result.cents-sum;checks.push({sourceId:sheet.id,fileId:sheet.fileId,file:sheet.fileName,sheet:sheet.name,row:total.row+1,channel:'整表',reported:total.result.cents,calculated:sum,difference:diff});if(diff)issue(total.row,'整表合计与提取金额不一致',total.result.cents/100);}
    if(!records.length&&!issues.length)issue(c.header,'未提取到有效金额记录');
    return {records,issues,checks};
  }
  function calculate(input,progress=()=>{}) {
    const records=[],issues=[],checks=[];
    input.sheets.forEach((sheet,i)=>{const parsed=parseSheet(sheet);records.push(...parsed.records);issues.push(...parsed.issues);checks.push(...parsed.checks);progress({phase:'解析工作表',done:i+1,total:input.sheets.length});});
    const names=[...new Set(records.map(r=>r.channel))],refCache=input.refs.map(name=>({name,normal:normalize(name)}));
    const matches=names.map((name,i)=>{
      const normal=normalize(name);
      const candidates=refCache.map(ref=>({name:ref.name,score:similarity(normal,ref.normal)})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,3);
      const best=candidates[0],second=candidates[1];
      const eligible=best&&best.score>=input.threshold;
      const pending=!!eligible&&(best.score<.7||!!second&&best.score-second.score<.05);
      progress({phase:'匹配渠道',done:i+1,total:names.length});
      return {raw:name,candidates,target:eligible?best.name:'',score:best?.score||0,status:eligible?(pending?'pending':'auto'):'unmatched'};
    });
    return {records,issues,checks,matches,sheets:input.sheets.map(({id,fileId,fileName,name,slot,config})=>({id,fileId,fileName,name,slot,config})),refs:input.refs,template:input.template,threshold:input.threshold,created:new Date().toISOString(),warnings:input.warnings||[]};
  }
  function aggregate(snapshot) {
    const matchMap=new Map(snapshot.matches.map(m=>[m.raw,m])),allowed=new Map(snapshot.template.map(name=>[key(name),name]));
    const included=[],excluded=[],totals=new Map(snapshot.template.map(name=>[name,new Array(snapshot.sheets.length).fill(0)]));
    let extracted=0,includedCents=0,excludedCents=0;
    for(const r of snapshot.records) {
      extracted=add(extracted,r.cents);
      const m=matchMap.get(r.channel),target=m?.target||r.channel;
      const canonical=allowed.get(key(target));
      const reason=m?.status==='pending'?'匹配待人工确认':!m||m.status==='unmatched'?'未匹配标准渠道':m.status==='excluded'?'人工排除':!canonical?'匹配渠道不在汇总样表中':'';
      if(reason){excluded.push({...r,target,reason});excludedCents=add(excludedCents,r.cents);}
      else {included.push({...r,target:canonical});totals.get(canonical)[r.slot]=add(totals.get(canonical)[r.slot],r.cents);includedCents=add(includedCents,r.cents);}
    }
    return {included,excluded,totals,extracted,includedCents,excludedCents,balanced:extracted===add(includedCents,excludedCents),clean:!excluded.length&&!snapshot.issues.length&&!snapshot.warnings.length};
  }
  function summary(snapshot,agg,slots) {
    const rows=[['渠道',...slots.map((_,i)=>'settlement'+(i+1)),'合计']],sums=new Array(slots.length).fill(0);let grand=0;
    for(const name of snapshot.template){const amounts=agg.totals.get(name);let total=0;const row=[name];slots.forEach((slot,i)=>{const amount=amounts[slot]||0;row.push(amount/100);sums[i]=add(sums[i],amount);total=add(total,amount);});row.push(total/100);rows.push(row);grand=add(grand,total);}
    rows.push(['合计',...sums.map(v=>v/100),grand/100]);return rows;
  }
  return {key,normalize,similarity,money,detect,reference,parseSheet,calculate,aggregate,summary,add};
}
if(typeof module!=='undefined')module.exports=createEngine;

