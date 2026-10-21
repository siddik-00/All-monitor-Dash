import {validateGraph,connect,removeNode,traceEdges,connectionPath} from './model.mjs';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
let tools=[],graph=null,original=null,clusterData=null,clusterRevision='',serverContext='',selectedContext='',contextWatcher=null,view='system',selected=null,selectedEdge=null,connecting=false,token='',apiBase='',scale=1,offset={x:0,y:0},drag=null,poller=null,traceRun=0;
try{apiBase=localStorage.getItem('devops-workflow-api-base')||'';}catch{}
let toolMap=new Map(),observations=new Map();
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function dom(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function svg(tag,attrs={},text){const e=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;}
async function api(path){const r=await fetch(`${apiBase}${path}`,{headers:token?{Authorization:`Bearer ${token}`}:{},cache:'no-store'});if(!r.ok){if(r.status===401&&!$('auth-dialog').open){$('api-base').value=apiBase;$('auth-dialog').showModal();}throw Error(r.status===401?'Live API requires an operator bearer token.':`API returned HTTP ${r.status}.`);}return r.json();}
function remember(){try{localStorage.setItem(`devops-workflow-v2:${view}`,JSON.stringify(graph));}catch{message('Browser storage is unavailable; use Export JSON to save this workflow.');}}
function renderDashboard(){
 if(!graph)return;
 const s=clusterData?.summary, mode=clusterData?.mode;
 const hasCpu=Number.isFinite(s?.cpuPercent),hasMemory=Number.isFinite(s?.memoryPercent),hasAlerts=Number.isFinite(s?.firingAlerts);
 $('metric-nodes').textContent=s&&Number.isFinite(s.readyNodes)&&Number.isFinite(s.totalNodes)?`${s.readyNodes} / ${s.totalNodes}`:'—';
 $('metric-nodes-note').textContent=s?`${clusterData.cluster} · ${mode==='demo'?'sample snapshot':'cluster snapshot'}`:'Connect a cluster to load server health';
 $('metric-workloads').textContent=s&&Number.isFinite(s.readyPods)&&Number.isFinite(s.totalPods)?`${s.readyPods} / ${s.totalPods}`:'—';
 $('metric-workloads-note').textContent=s&&Number.isFinite(s.workloads)?`${s.workloads} deployments · click to inspect pods`:'Connect a cluster to inspect pods';
 $('metric-alerts').textContent=hasAlerts?String(s.firingAlerts):'—';
 $('metric-alerts-note').textContent=hasAlerts?`${clusterData.alerts?.length||0} alerts · ${mode==='demo'?'sample data':'monitoring'}`:'Prometheus alert source unavailable';
 $('metric-cpu').textContent=hasCpu?`${Math.round(s.cpuPercent)}%`:'—';
 $('metric-memory').textContent=hasMemory?`${Math.round(s.memoryPercent)}%`:'—';
 $('cpu-bar').style.width=hasCpu?`${Math.max(0,Math.min(100,s.cpuPercent))}%`:'0%';
 $('memory-bar').style.width=hasMemory?`${Math.max(0,Math.min(100,s.memoryPercent))}%`:'0%';
 $('resource-state').textContent=s?(mode==='demo'?'SAMPLE':'LIVE'):'CLUSTER';
 const metricsState=hasCpu&&hasMemory?'Prometheus telemetry':hasCpu||hasMemory?'Partial metrics':'Prometheus metrics unavailable';
 $('metric-resource-note').textContent=s?`Updated ${new Date(clusterData.timestamp).toLocaleTimeString()} · ${mode==='demo'?'sample telemetry':metricsState}`:'Live telemetry appears when the API is connected';
 $('environment').classList.toggle('connected',!!clusterData);
 const list=$('workload-list');list.replaceChildren();
 if(clusterData?.workloads?.length){
  $('workload-caption').textContent=`${clusterData.cluster} · ${clusterData.namespace} namespace · ${clusterData.mode==='demo'?'sample data':'live snapshot'}`;
  for(const w of clusterData.workloads.slice(0,4)){const row=dom('div',undefined,'workload-row'),name=dom('div',undefined,'workload-name');name.append(dom('strong',w.name),dom('small',`${w.namespace} · ${w.age}`));const replicas=dom('span',`${w.ready}/${w.desired}`,'replicas'),state=dom('span',w.status,w.status==='Healthy'?'workload-state healthy':'workload-state degraded');row.append(name,replicas,state);list.append(row);}
 }else{ $('workload-caption').textContent='Cluster deployments and replica readiness';list.append(dom('div','Connect the Control API to view server workloads.','empty-state')); }
 if($('pods-dialog').open)renderPods();
}
async function loadContexts(){
 try{const data=await api('/api/v1/clusters'),select=$('cluster-context'),previous=selectedContext,revisionChanged=clusterRevision!==''&&clusterRevision!==data.revision,currentChanged=serverContext!==''&&serverContext!==data.current;clusterRevision=data.revision;serverContext=data.current||'';
  if(!selectedContext||!data.contexts.includes(selectedContext)||currentChanged)selectedContext=data.current||data.contexts[0]||'';
  select.replaceChildren(new Option(data.contexts.length?'Select context':'No cluster connected',''));
  for(const context of data.contexts)select.append(new Option(context,context));select.value=selectedContext;
  return revisionChanged||currentChanged||previous!==selectedContext;
 }catch{selectedContext='';const select=$('cluster-context');select.replaceChildren(new Option('No cluster connected',''));return false;}
}
function renderPods(){
 const pods=clusterData?.pods||[],namespace=$('pods-namespace').value,query=$('pods-search').value.trim().toLowerCase();
 const filtered=pods.filter(p=>(namespace==='all'||p.namespace===namespace)&&(!query||`${p.name} ${p.namespace} ${p.deployment||''} ${p.status}`.toLowerCase().includes(query)));
 const body=$('pods-table-body');body.replaceChildren();
 for(const p of filtered){const row=dom('tr'),name=dom('td'),nameWrap=dom('div',undefined,'pod-name');nameWrap.append(dom('strong',p.name),dom('small',p.deployment||p.image||'Standalone pod'));name.append(nameWrap);const status=dom('span',p.status||'Unknown',`pod-status ${p.ready?'running':String(p.status||'').toLowerCase().includes('pending')?'pending':'issue'}`),statusCell=dom('td');statusCell.append(status);row.append(name,dom('td',p.namespace||'—'),statusCell,dom('td',p.ready?'Ready':'Not ready',p.ready?'ready-text':'not-ready-text'),dom('td',String(p.restarts??0)),dom('td',p.node||'Unscheduled'),dom('td',p.age||'—'));body.append(row);}
 $('pods-empty').hidden=filtered.length>0;
 $('pods-count').textContent=`${filtered.length} of ${pods.length} pods`;
 $('pods-summary').textContent=clusterData?`${clusterData.cluster} · ${pods.filter(p=>p.ready).length}/${pods.length} ready · updated ${new Date(clusterData.timestamp).toLocaleTimeString()}`:'Pod readiness and runtime status';
 $('pods-mode').textContent=clusterData?(clusterData.mode==='demo'?'Sample Kubernetes inventory':'Live Kubernetes inventory'):'Cluster data unavailable';
}
function openPods(){
 const select=$('pods-namespace'),current=select.value;select.replaceChildren(new Option('All namespaces','all'));
 const namespaces=[...new Set((clusterData?.pods||[]).map(p=>p.namespace).filter(Boolean))].sort();for(const ns of namespaces)select.append(new Option(ns,ns));select.value=namespaces.includes(current)?current:'all';
 $('pods-search').value='';renderPods();$('pods-dialog').showModal();
}
function draw(){
 if(!graph)return;
 renderDashboard();
 const groups=$('groups'),edges=$('edges'),nodes=$('nodes');groups.replaceChildren();edges.replaceChildren();nodes.replaceChildren();
 for(const g of graph.groups||[]){groups.append(svg('rect',{x:g.x,y:g.y,width:g.width,height:g.height,rx:10,fill:'#f3f6fb','fill-opacity':.45}),svg('text',{x:g.x+12,y:g.y+22,class:'group-label'},g.label));}
 const byId=new Map(graph.nodes.map(n=>[n.id,n]));
 for(const e of graph.edges){const a=byId.get(e.source),b=byId.get(e.target);if(!a||!b)continue;const p=connectionPath(a,b),g=svg('g',{'data-edge':e.id});g.append(svg('path',{d:p.d,class:`edge-line ${e.kind}${selectedEdge===e.id?' selected':''}`}));const hit=svg('path',{d:p.d,class:'edge-hit'});hit.addEventListener('pointerdown',ev=>{ev.stopPropagation();selectedEdge=e.id;selected=null;draw();inspectEdge(e);});g.append(hit,svg('text',{x:p.x,y:p.y,'text-anchor':'middle',class:'edge-label'},e.label));edges.append(g);}
 for(const n of graph.nodes){const tool=toolMap.get(n.tool),o=observations.get(n.tool),g=svg('g',{transform:`translate(${n.x} ${n.y})`,class:`tool-node${selected===n.id?' selected':''}`,'data-node':n.id,tabindex:0,role:'button','aria-label':`${n.label}: ${o?.status||'not checked'}`});
  g.append(svg('rect',{width:166,height:88,rx:9,class:'node-body'}),svg('rect',{x:13,y:14,width:34,height:34,rx:7,fill:tool.color,'fill-opacity':.07}),svg('image',{x:19,y:20,width:22,height:22,href:tool.icon}),svg('text',{x:56,y:31,class:'node-name'},n.label.length>17?n.label.slice(0,16)+'…':n.label),svg('text',{x:56,y:45,class:'node-category'},tool.category.toUpperCase()),svg('circle',{cx:18,cy:68,r:2.8,fill:o?.status==='available'?'#2ba37f':o?.status==='unavailable'?'#d36c73':'#bac3d1'}),svg('text',{x:26,y:71,class:'node-status'},o?.status||'not checked'),svg('circle',{cx:0,cy:44,r:3.4,class:'node-port'}),svg('circle',{cx:166,cy:44,r:3.4,class:'node-port'}));
  g.addEventListener('pointerdown',ev=>nodeDown(ev,n));g.addEventListener('keydown',ev=>{if(ev.key==='Enter'){selected=n.id;selectedEdge=null;draw();inspect();}});nodes.append(g);
 }
 $('graph-counts').textContent=`${graph.nodes.length} tools · ${graph.edges.length} connections`;
}
function inspect(){
 const n=graph?.nodes.find(n=>n.id===selected);if(!n)return;const t=toolMap.get(n.tool),o=observations.get(n.tool),container=$('inspector');container.replaceChildren();document.querySelector('.inspector').classList.add('open');
 const detail=dom('div',undefined,'tool-detail'),heading=dom('div',undefined,'detail-title'),img=dom('img');img.src=t.icon;img.alt='';const names=dom('div');names.append(dom('h3',t.name),dom('small',t.category));heading.append(img,names);detail.append(heading,dom('p',t.description,'description'));
 const label=dom('label','Node name','node-edit'),input=dom('input');input.value=n.label;input.maxLength=70;input.addEventListener('input',()=>{n.label=input.value;remember();draw();});label.append(input);detail.append(label);
 const state=dom('section',undefined,'detail-section');state.append(dom('h4','Connection status'),dom('span',o?.status||'Not checked',`status-pill ${o?.status||''}`),dom('p',o?.detail||'Choose Check APIs to read server-side probe results.'));detail.append(state);
 const endpoint=dom('section',undefined,'detail-section');endpoint.append(dom('h4','Read-only integration API'),dom('div',`GET ${t.statusEndpoint}`,'code-path'),dom('p','Upstream credentials and tool URLs are configured on the API server.'));detail.append(endpoint);
 const links=dom('section',undefined,'detail-section');links.append(dom('h4','Workflow connections'));const related=graph.edges.filter(e=>e.source===n.id||e.target===n.id);for(const e of related)links.append(dom('p',`${e.source===n.id?'→':'←'} ${graph.nodes.find(x=>x.id===(e.source===n.id?e.target:e.source))?.label}: ${e.label}`));if(!related.length)links.append(dom('p','No connections. Use Connect tools to add one.'));detail.append(links);
 const actions=dom('div',undefined,'detail-actions'),copy=dom('button','Copy API path'),remove=dom('button','Remove node');copy.onclick=()=>navigator.clipboard.writeText(t.statusEndpoint).then(()=>message('API path copied.')).catch(()=>message(t.statusEndpoint));remove.onclick=()=>{removeNode(graph,n.id);selected=null;container.replaceChildren();remember();draw();message('Tool removed from this workflow.');};actions.append(copy,remove);detail.append(actions);container.append(detail);
}
function inspectEdge(e){
 const c=$('inspector');c.replaceChildren();document.querySelector('.inspector').classList.add('open');const detail=dom('div',undefined,'tool-detail');detail.append(dom('h3','Tool connection'),dom('p',`${e.source} → ${e.target}`,'description'));
 const label=dom('label','API / automation contract','edge-edit'),input=dom('input');input.value=e.label;input.maxLength=100;input.oninput=()=>{e.label=input.value;remember();draw();};label.append(input);const remove=dom('button','Remove connection');remove.onclick=()=>{graph.edges=graph.edges.filter(x=>x.id!==e.id);selectedEdge=null;remember();draw();c.replaceChildren();};detail.append(label,dom('p','This edge documents a tool integration. Editing it changes the local workflow definition.','description'),remove);c.append(detail);
}
function clientPoint(ev){const r=$('viewport').getBoundingClientRect();return {x:(ev.clientX-r.left)/scale+offset.x,y:(ev.clientY-r.top)/scale+offset.y};}
function nodeDown(ev,n){
 ev.stopPropagation();if(ev.button!==0)return;
 if(connecting&&selected&&selected!==n.id){try{connect(graph,selected,n.id);remember();message('Connection added. Select another target or press Escape.');}catch(e){message(e.message,true);}draw();return;}
 selected=n.id;selectedEdge=null;const p=clientPoint(ev);drag={type:'node',id:n.id,dx:p.x-n.x,dy:p.y-n.y};$('viewport').setPointerCapture(ev.pointerId);draw();inspect();
}
function updateView(){const v=$('viewport');$('canvas').setAttribute('viewBox',`${offset.x} ${offset.y} ${v.clientWidth/scale} ${v.clientHeight/scale}`);$('zoom-label').textContent=`${Math.round(scale*100)}%`;}
function fit(){if(!graph?.nodes.length)return;const minX=Math.min(...graph.nodes.map(n=>n.x))-60,minY=Math.min(...graph.nodes.map(n=>n.y))-65,maxX=Math.max(...graph.nodes.map(n=>n.x+166))+60,maxY=Math.max(...graph.nodes.map(n=>n.y+88))+85;const v=$('viewport');scale=Math.min(1.3,Math.max(.18,Math.min(v.clientWidth/(maxX-minX),v.clientHeight/(maxY-minY))));offset={x:minX-(v.clientWidth/scale-(maxX-minX))/2,y:minY};updateView();}
function zoom(mult,point){const old=scale;scale=Math.min(2.5,Math.max(.18,scale*mult));const v=$('viewport'),px=point?.x??v.clientWidth/2,py=point?.y??v.clientHeight/2;offset.x+=px/old-px/scale;offset.y+=py/old-py/scale;updateView();}
async function loadView(id){
 try{const {workflow}=await api(`/api/v1/workflows/${id}`);original=structuredClone(workflow);view=id;let saved;try{saved=JSON.parse(localStorage.getItem(`devops-workflow-v2:${id}`)||'null');}catch{}graph=validateGraph(saved||workflow,tools);selected=null;selectedEdge=null;traceRun++;$('workflow-title').textContent=graph.title;$('workflow-subtitle').textContent=graph.subtitle;for(const b of $('views').querySelectorAll('button'))b.classList.toggle('active',b.dataset.view===view);draw();fit();message(saved?'Loaded your saved local workflow.':'Workflow loaded. Select a tool to inspect its config and API.');}catch(e){message(e.message,true);}
}
async function refresh(initial=false){
 $('refresh').disabled=true;
 try{await loadContexts();const data=await api('/api/v1/toolchain');tools=data.tools;toolMap=new Map(tools.map(t=>[t.id,t]));observations=new Map(tools.map(t=>[t.id,t.observation]));$('tool-count').textContent=String(tools.length);renderLibrary();try{const query=selectedContext?`?context=${encodeURIComponent(selectedContext)}`:'';const snapshot=await api(`/api/v1/cluster/snapshot${query}`);clusterData=snapshot.mode==='demo'?null:snapshot;}catch{clusterData=null;}$('mode').textContent=clusterData?'LIVE · KUBECONFIG':'CLUSTER DISCONNECTED';if(initial||!graph)await loadView(view);else{draw();if(selected)inspect();}renderDashboard();message(clusterData?`${clusterData.cluster} refreshed at ${new Date(clusterData.timestamp).toLocaleTimeString()}.`:'Kubernetes inventory is hidden until a kubeconfig context is available.');}catch(e){message(e.message,true);}finally{$('refresh').disabled=false;}
}
function renderLibrary(){const q=$('search').value.toLowerCase(),library=$('tool-library');library.replaceChildren();let category='';const list=[...tools].sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));for(const t of list.filter(t=>`${t.name} ${t.category}`.toLowerCase().includes(q))){if(t.category!==category){category=t.category;library.append(dom('h3',category,'category-title'));}const b=dom('button',undefined,'tool-button'),img=dom('img');img.src=t.icon;img.alt='';b.append(img,dom('span',t.name),dom('span','+','add'));b.onclick=()=>{if(!graph)return;if(graph.nodes.length>=100)return message('This workflow already has 100 tools.',true);const v=$('viewport'),n={id:`${t.id}-${Date.now().toString(36)}`,tool:t.id,label:t.name,x:Math.round(offset.x+v.clientWidth/(2*scale)-83),y:Math.round(offset.y+v.clientHeight/(2*scale)-44),width:166,height:88};graph.nodes.push(n);selected=n.id;selectedEdge=null;remember();draw();inspect();message(`${t.name} added. Drag it into place and connect it.`);};library.append(b);}}
$('search').oninput=renderLibrary;
$('views').onclick=e=>{const b=e.target.closest('[data-view]');if(b)loadView(b.dataset.view);};
$('viewport').addEventListener('pointerdown',ev=>{if(ev.target.closest('[data-node],[data-edge]'))return;const p=clientPoint(ev);drag={type:'pan',x:ev.clientX,y:ev.clientY,ox:offset.x,oy:offset.y};$('viewport').setPointerCapture(ev.pointerId);if(ev.button===0&&!connecting){selected=null;selectedEdge=null;draw();}});
$('viewport').addEventListener('pointermove',ev=>{if(!drag)return;if(drag.type==='node'){const n=graph.nodes.find(n=>n.id===drag.id),p=clientPoint(ev);n.x=Math.round(Math.max(-19000,Math.min(19000,p.x-drag.dx))/8)*8;n.y=Math.round(Math.max(-19000,Math.min(19000,p.y-drag.dy))/8)*8;draw();}else{offset.x=drag.ox-(ev.clientX-drag.x)/scale;offset.y=drag.oy-(ev.clientY-drag.y)/scale;updateView();}});
for(const event of ['pointerup','pointercancel'])$('viewport').addEventListener(event,()=>{if(drag?.type==='node')remember();drag=null;});
$('viewport').addEventListener('wheel',e=>{e.preventDefault();const r=$('viewport').getBoundingClientRect();zoom(e.deltaY<0?1.1:1/1.1,{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
$('viewport').addEventListener('contextmenu',e=>e.preventDefault());
$('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);$('fit').onclick=fit;new ResizeObserver(updateView).observe($('viewport'));
$('connect').onclick=()=>{connecting=!connecting;$('connect').classList.toggle('active',connecting);message(connecting?'Select a source tool, then a target. Press Escape to finish.':'Connection mode ended.');};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){connecting=false;$('connect').classList.remove('active');traceRun++;message('Selection mode.');}if((e.key==='Delete'||e.key==='Backspace')&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){if(selected){removeNode(graph,selected);selected=null;}else if(selectedEdge){graph.edges=graph.edges.filter(x=>x.id!==selectedEdge);selectedEdge=null;}remember();draw();}});
$('trace').onclick=async()=>{if(!graph)return;const start=selected||graph.nodes[0]?.id,steps=traceEdges(graph,start),run=++traceRun;if(!steps.length)return message('Select a tool with outgoing connections to trace its workflow.');for(let i=0;i<steps.length;i++){if(run!==traceRun)break;const e=steps[i];for(const x of $('canvas').querySelectorAll('.tracing'))x.classList.remove('tracing');$('edges').querySelector(`[data-edge="${e.id}"] .edge-line`)?.classList.add('tracing');$('nodes').querySelector(`[data-node="${e.target}"]`)?.classList.add('tracing');message(`LOCAL TRACE ${i+1}/${steps.length} · ${e.source} → ${e.target} · ${e.label}`);await new Promise(r=>setTimeout(r,650));}for(const x of $('canvas').querySelectorAll('.tracing'))x.classList.remove('tracing');if(run===traceRun)message('Local trace finished. No pipeline or deployment was executed.');};
$('reset').onclick=()=>{if(!original)return;graph=validateGraph(original,tools);selected=null;selectedEdge=null;remember();draw();fit();message('Repository workflow layout restored.');};
$('export').onclick=()=>{if(!graph)return;const url=URL.createObjectURL(new Blob([JSON.stringify(graph,null,2)+'\n'],{type:'application/json'})),a=dom('a');a.href=url;a.download=`${graph.id}.workflow.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Workflow JSON exported. It contains no API tokens.');};
$('import').onclick=()=>$('import-file').click();$('import-file').onchange=async()=>{const file=$('import-file').files[0];if(!file)return;try{if(file.size>512000)throw Error('Workflow JSON must be smaller than 500 KB.');graph=validateGraph(JSON.parse(await file.text()),tools);selected=null;selectedEdge=null;traceRun++;remember();$('workflow-title').textContent=graph.title;$('workflow-subtitle').textContent=graph.subtitle;draw();fit();message('Workflow JSON imported and saved locally.');}catch(e){message(e.message,true);}finally{$('import-file').value='';}};
$('refresh').onclick=()=>refresh();$('auto-refresh').onchange=()=>{clearInterval(poller);poller=$('auto-refresh').checked?setInterval(()=>refresh(),20000):null;};
$('dashboard-refresh').onclick=()=>refresh();
$('cluster-context').onchange=()=>{selectedContext=$('cluster-context').value;refresh();};
$('open-infrastructure').onclick=()=>loadView('infrastructure');
$('running-workloads-card').onclick=openPods;
$('running-workloads-card').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openPods();}};
$('pods-close').onclick=()=>$('pods-dialog').close();
$('pods-namespace').onchange=renderPods;$('pods-search').oninput=renderPods;
$('pods-refresh').onclick=async()=>{await refresh();renderPods();};
$('pods-dialog').addEventListener('click',event=>{if(event.target===$('pods-dialog'))$('pods-dialog').close();});
$('auth-open').onclick=()=>{$('api-base').value=apiBase;$('api-token').value='';$('api-connection-error').textContent='';$('auth-dialog').showModal();};
$('auth-cancel').onclick=()=>$('auth-dialog').close();
$('api-connection-form').addEventListener('submit',event=>{event.preventDefault();const raw=$('api-base').value.trim();let next='';if(raw){try{const url=new URL(raw),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||(!local&&url.protocol!=='https:'))throw Error();next=url.origin;}catch{$('api-connection-error').textContent='Enter an HTTPS API origin. HTTP is allowed only for localhost.';return;}}apiBase=next;try{if(apiBase)localStorage.setItem('devops-workflow-api-base',apiBase);else localStorage.removeItem('devops-workflow-api-base');}catch{}const entered=$('api-token').value.trim();if(entered)token=entered;$('api-token').value='';$('api-connection-error').textContent='';$('auth-dialog').close();refresh(true);});
refresh(true).then(()=>{clearInterval(contextWatcher);contextWatcher=setInterval(async()=>{if(await loadContexts())refresh();},5000);});
