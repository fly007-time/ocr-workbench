window.Matching=(()=>{
 const {s,E}=W;
 function stop(){s.worker?.terminate();s.worker=null;if(s.workerUrl)URL.revokeObjectURL(s.workerUrl);s.workerUrl=null;s.matchBusy=false;W.emit('status');}
 function run(){if(s.matchBusy||s.importing||s.exporting)throw Error('请等待当前计算或导入结束');if(!s.refs||!s.template)throw Error('请上传黄金对照表与汇总样表');if(!s.submitted.size)throw Error('请先在表格校对步骤送入所选表格');
  for(const [id,submitted]of s.submitted){const t=W.table(id);if(!t||t.version!==submitted.version)throw Error('来源表格已更新，请返回校对并重新送入匹配');}
  const threshold=Number(document.getElementById('threshold').value);if(!Number.isFinite(threshold)||threshold<.3||threshold>.95)throw Error('匹配阈值无效');
  const staged=W.orderedTables().filter(t=>s.submitted.has(t.id)).map((t,slot)=>({...structuredClone(s.submitted.get(t.id)),slot}));
  const input={sheets:staged,refs:[...s.refs.names],template:[...s.template.names],threshold,warnings:[...s.refs.warnings.map(x=>'对照表：'+x),...s.template.warnings.map(x=>'样表：'+x)]};
  const revision=s.matchRevision;s.matchBusy=true;if(s.snapshot)s.stale=true;s.matchProgress={phase:'准备计算',done:0,total:1};W.emit('status');
  try{const code=`const E=(${createEngine.toString()})();self.onmessage=event=>{try{const result=E.calculate(event.data,p=>self.postMessage({type:'progress',data:p}));self.postMessage({type:'result',data:result});}catch(error){self.postMessage({type:'error',message:error.message});}};`;s.workerUrl=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));const worker=s.worker=new Worker(s.workerUrl);
   worker.onmessage=e=>{if(worker!==s.worker)return;const m=e.data;if(m.type==='progress'){s.matchProgress=m.data;W.emit('status');return;}stop();if(m.type==='error'){W.emit('message',{message:'匹配失败：'+m.message,error:true});return;}if(revision!==s.matchRevision){W.emit('message',{message:'数据在计算期间发生变化，请重新计算',error:true});return;}
    for(const match of m.data.matches){const manual=s.manual.get(match.raw);if(manual&&(manual.status==='excluded'||manual.kept||s.refs.names.includes(manual.target))){Object.assign(match,{target:manual.target,status:manual.status,score:manual.kept?1:E.similarity(match.raw,manual.target)});}}
    s.snapshot=m.data;s.stale=false;s.mapPage=0;W.dirty();W.emit();W.emit('message',{message:'汇总已生成。请检查待确认匹配与未纳入金额。'});
   };worker.onerror=e=>{stop();W.emit('message',{message:'后台计算失败：'+e.message,error:true});};worker.postMessage(input);
  }catch(e){stop();throw e;}
 }
 function confirm(raw,target,action='confirm'){if(!s.snapshot||s.stale||s.matchBusy||s.exporting||s.importing)throw Error('请先重新计算最新结果');const m=s.snapshot.matches.find(m=>m.raw===raw);if(!m)return;
  if(action==='exclude'){m.status='excluded';}
  else if(action==='keep'){m.target=raw;m.status='confirmed';m.score=1;}
  else{target=String(target).trim();if(!s.refs.names.includes(target))throw Error('请选择黄金对照表中的标准渠道');m.target=target;m.status='confirmed';m.score=E.similarity(raw,target);}
  s.manual.set(raw,{target:m.target,status:m.status,kept:action==='keep'});W.dirty();W.emit();
 }
 return {run,stop,confirm};
})();
