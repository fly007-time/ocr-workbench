window.ReviewImageViewer=(()=>{
 function create(img,page){
  const root=document.createElement('div');root.className='review-image-viewer';
  const toolbar=document.createElement('div');toolbar.className='review-image-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','原图缩放工具');
  const stage=document.createElement('div');stage.className='review-image-stage';stage.tabIndex=0;stage.setAttribute('role','region');stage.setAttribute('aria-label','原图预览，滚轮缩放，拖动移动；加减键缩放，0 适应窗口');
  const output=document.createElement('output');output.className='review-image-scale';output.setAttribute('aria-label','原图缩放比例');
  const hint=document.createElement('div');hint.className='review-image-hint';hint.textContent='滚轮缩放 · 拖动查看 · 双击放大 / 还原';
  let ready=false,destroyed=false,zoom=1,x=0,y=0,fitMode=page.reviewImageView?.fit??true,pinch=null,lastSize=null;
  const pointers=new Map(),buttons=[];
  const fitScale=()=>Math.min(1,Math.max(1,stage.clientWidth-24)/img.naturalWidth,Math.max(1,stage.clientHeight-24)/img.naturalHeight);
  const limit=value=>Math.max(Math.min(.05,fitScale()),Math.min(8,value));
  function button(text,label,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.title=label;b.setAttribute('aria-label',label);b.onclick=action;toolbar.append(b);buttons.push(b);return b;}
  const minus=button('−','缩小原图',()=>changeScale(zoom/1.25));
  toolbar.append(output);
  const plus=button('＋','放大原图',()=>changeScale(zoom*1.25));
  button('适应窗口','适应窗口',fit);
  button('原始尺寸','原始尺寸',()=>changeScale(1));
  function constrain(){const w=img.naturalWidth*zoom,h=img.naturalHeight*zoom,cw=stage.clientWidth,ch=stage.clientHeight;x=w<=cw?(cw-w)/2:Math.min(0,Math.max(cw-w,x));y=h<=ch?(ch-h)/2:Math.min(0,Math.max(ch-h,y));}
  function paint(){if(!ready||destroyed)return;constrain();img.style.transform=`translate(${x}px,${y}px) scale(${zoom})`;output.textContent=Math.round(zoom*100)+'%';for(const b of buttons)b.disabled=false;minus.disabled=zoom<=Math.min(.05,fitScale())+.00001;plus.disabled=zoom>=8-.00001;stage.classList.toggle('can-pan',img.naturalWidth*zoom>stage.clientWidth||img.naturalHeight*zoom>stage.clientHeight);page.reviewImageView={zoom,fit:fitMode,cx:(stage.clientWidth/2-x)/zoom/img.naturalWidth,cy:(stage.clientHeight/2-y)/zoom/img.naturalHeight};}
  function changeScale(value,anchor){if(!ready)return;const next=limit(value),point=anchor||{x:stage.clientWidth/2,y:stage.clientHeight/2},worldX=(point.x-x)/zoom,worldY=(point.y-y)/zoom;zoom=next;x=point.x-worldX*zoom;y=point.y-worldY*zoom;fitMode=false;paint();}
  function fit(){if(!ready)return;fitMode=true;zoom=fitScale();x=(stage.clientWidth-img.naturalWidth*zoom)/2;y=(stage.clientHeight-img.naturalHeight*zoom)/2;paint();}
  function layout(){if(destroyed||!img.naturalWidth||!img.naturalHeight||!stage.clientWidth||!stage.clientHeight)return;const size=stage.clientWidth+':'+stage.clientHeight;if(ready&&size===lastSize)return;lastSize=size;const saved=page.reviewImageView;ready=true;img.style.width=img.naturalWidth+'px';img.style.height=img.naturalHeight+'px';if(fitMode)fit();else{zoom=limit(saved?.zoom||1);x=stage.clientWidth/2-(saved?.cx??.5)*img.naturalWidth*zoom;y=stage.clientHeight/2-(saved?.cy??.5)*img.naturalHeight*zoom;paint();}}
  function local(clientX,clientY){const r=stage.getBoundingClientRect();return{x:clientX-r.left,y:clientY-r.top};}
  stage.addEventListener('wheel',e=>{if(!ready)return;e.preventDefault();changeScale(zoom*Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.0025),local(e.clientX,e.clientY));},{passive:false});
  stage.addEventListener('dblclick',e=>{if(!ready)return;if(!fitMode)fit();else changeScale(Math.max(1,zoom*2),local(e.clientX,e.clientY));});
  function startPinch(){const a=[...pointers.values()];if(a.length!==2){pinch=null;return;}const middle={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};pinch={distance:Math.max(1,Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)),zoom,worldX:(middle.x-x)/zoom,worldY:(middle.y-y)/zoom};}
  stage.addEventListener('pointerdown',e=>{if(!ready||e.button!==0)return;e.preventDefault();stage.focus({preventScroll:true});pointers.set(e.pointerId,local(e.clientX,e.clientY));stage.setPointerCapture(e.pointerId);stage.classList.add('dragging');startPinch();});
  stage.addEventListener('pointermove',e=>{const old=pointers.get(e.pointerId);if(!old)return;const next=local(e.clientX,e.clientY);pointers.set(e.pointerId,next);if(pointers.size===2&&pinch){const a=[...pointers.values()],middle={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};zoom=limit(pinch.zoom*Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)/pinch.distance);x=middle.x-pinch.worldX*zoom;y=middle.y-pinch.worldY*zoom;fitMode=false;}else if(pointers.size===1){x+=next.x-old.x;y+=next.y-old.y;}paint();});
  function endPointer(e){pointers.delete(e.pointerId);if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);stage.classList.toggle('dragging',pointers.size>0);startPinch();}
  for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,endPointer);
  stage.addEventListener('keydown',e=>{if(!ready)return;let handled=true;if(['+','='].includes(e.key))changeScale(zoom*1.25);else if(['-','_'].includes(e.key))changeScale(zoom/1.25);else if(['0','Home'].includes(e.key))fit();else if(e.key==='1')changeScale(1);else if(e.key==='ArrowLeft'){x+=50;paint();}else if(e.key==='ArrowRight'){x-=50;paint();}else if(e.key==='ArrowUp'){y+=50;paint();}else if(e.key==='ArrowDown'){y-=50;paint();}else handled=false;if(handled)e.preventDefault();});
  for(const b of buttons)b.disabled=true;output.textContent='加载中';img.draggable=false;stage.append(img);root.append(toolbar,stage,hint);
  img.addEventListener('load',layout);const observer=new ResizeObserver(layout);observer.observe(stage);if(img.complete)queueMicrotask(layout);
  return{element:root,destroy(){destroyed=true;observer.disconnect();img.removeEventListener('load',layout);pointers.clear();}};
 }
 return{create};
})();
