window.Recognition=(()=>{
 const {s}=W;
 const blobData=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(blob);});
 function wait(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted)return reject(new DOMException('已取消','AbortError'));const cancel=()=>{clearTimeout(timer);reject(new DOMException('已取消','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);signal.addEventListener('abort',cancel,{once:true});});}
 async function request(p,key,signal){const blob=p.cropped||p.original;if(blob.size>8*1024*1024)throw Error('当前页面图片超过 8MB，请先裁剪');const body=JSON.stringify({model:'glm-ocr',file:await blobData(blob)});
  for(let attempt=0;attempt<3;attempt++){
   if(signal.aborted)throw new DOMException('已取消','AbortError');const controller=new AbortController();let timedOut=false;const cancel=()=>controller.abort();signal.addEventListener('abort',cancel,{once:true});const timer=setTimeout(()=>{timedOut=true;controller.abort();},90000);
   try{const response=await fetch('https://open.bigmodel.cn/api/paas/v4/layout_parsing',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body,signal:controller.signal});const raw=await response.text();let json;try{json=JSON.parse(raw);}catch{throw Error(`HTTP ${response.status}：接口未返回有效 JSON，请检查网络代理或稍后重试`);}
    if(!response.ok||json.error){const error=Error(OCRCore.describeApiError(response.status,json));error.retryable=response.status===429||response.status>=500;throw error;}return json;
   }catch(e){if(signal.aborted)throw new DOMException('已取消','AbortError');if(timedOut)throw Error('请求超过 90 秒，请稍后重试');if(attempt===2||!(e.retryable||e instanceof TypeError)){if(e instanceof TypeError)throw Error('浏览器无法取得智谱响应。请检查网络、代理、证书或跨域限制；可在 Network/Console 查看详情。');throw e;}}
   finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
   p.status='重试 '+(attempt+1)+'/2';W.emit('background');await wait(1000*2**attempt,signal);
  }
 }
 async function start(retry=false){
  if(s.ocrBusy||s.importing||s.cropPending||s.exporting)throw Error('请等待当前导入、裁剪或识别操作完成');
  const key=document.getElementById('apiKey').value.trim().replace(/^Bearer\s+/i,'');if(!key){document.getElementById('apiKey').scrollIntoView({block:'center'});document.getElementById('apiKey').focus();throw Error('请先在右侧设置中填写智谱 API Key');}
  const concurrency=Number(document.getElementById('concurrency').value);if(!Number.isInteger(concurrency)||concurrency<1||concurrency>10)throw Error('并发数必须为 1～10 的整数');
  const targets=s.docs.flatMap(d=>d.pages).filter(p=>retry?['失败','已取消'].includes(p.status):p.selected);if(!targets.length)throw Error(retry?'没有失败或已取消的页面':'请勾选需要识别的页面');
  const controller=new AbortController(),signal=controller.signal;const job=s.ocrJob={controller,total:targets.length,done:0};s.ocrBusy=true;
  for(const p of targets){for(const t of s.tables.filter(t=>t.pageId===p.id))W.removeTable(t.id);p.status='等待';p.error='';p.notes='';}W.dirty();W.emit();let index=0;
  async function worker(){while(index<targets.length&&!signal.aborted){const p=targets[index++];p.status='识别中';W.emit('background');try{
   const response=await request(p,key,signal);if(signal.aborted)throw new DOMException('已取消','AbortError');const parsed=OCRCore.parseLayoutResponse(response,W.doc(p.documentId).name);p.notes=parsed.filter(t=>t.kind==='text').flatMap(t=>t.rows.slice(1).map(r=>r[0])).join('\n');const tables=parsed.filter(t=>t.kind==='table');if(!tables.length)throw Error('已收到识别结果，但未提取到表格；说明文字仅供查看');tables.forEach((table,i)=>W.addTable(W.doc(p.documentId),p,table,i));p.status='成功';
  }catch(e){p.status=signal.aborted?'已取消':'失败';p.error=String(e?.message||e).split(key).join('[密钥已隐藏]');}finally{job.done++;W.emit('background');}}}
  try{await Promise.all(Array.from({length:Math.min(concurrency,targets.length)},worker));}
  finally{targets.filter(p=>p.status==='等待').forEach(p=>p.status='已取消');s.ocrBusy=false;s.ocrJob=null;W.emit();const ok=targets.filter(p=>p.status==='成功').length,failed=targets.filter(p=>p.status==='失败').length;W.emit('message',{message:`识别结束：成功 ${ok} / 失败 ${failed} / 取消 ${targets.length-ok-failed}${failed?'；失败详情已显示在对应页面。':''}`,error:!!failed});}
 }
 function invalidatePage(p){if(s.cropPending||p.status==='识别中'||p.status==='等待')throw Error('请先等待该页面识别或裁剪完成');for(const t of s.tables.filter(t=>t.pageId===p.id))W.removeTable(t.id);p.status='待识别';p.error='';p.notes='';W.dirty();}
 return {start,cancel:()=>s.ocrJob?.controller.abort(),invalidatePage};
})();
