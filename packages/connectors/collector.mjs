import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';

export const RANGES = Object.freeze({'1h':3600,'6h':21600,'24h':86400});
export function validateNamespace(value='all') {
  if(value==='all') return value;
  if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) throw Object.assign(new Error('Invalid Kubernetes namespace.'),{status:400});
  return value;
}
export function validateName(value) {
  if(typeof value!=='string'||value.length>253||!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value)||value.includes('..')) throw Object.assign(new Error('Invalid Kubernetes resource name.'),{status:400});
  return value;
}
export function validateRange(value='1h') {
  if(!Object.hasOwn(RANGES,value)) throw Object.assign(new Error('range must be 1h, 6h, or 24h.'),{status:400});
  return value;
}
export function requestUpstream(url,{token,ca,raw=false,timeout=12000,maxBytes=10*1024*1024}={}) {
  return new Promise((resolve,reject)=>{
    const parsed=new URL(url);
    if(!['https:','http:'].includes(parsed.protocol)) return reject(new Error('Unsupported upstream protocol.'));
    const transport=parsed.protocol==='https:'?https:http;
    const req=transport.get(parsed,{headers:{Accept:raw?'text/plain':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(ca?{ca}:{}),signal:AbortSignal.timeout(timeout)},res=>{
      let size=0;const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error('Upstream response exceeded the size limit.'));return;}chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>{
        if(res.statusCode<200||res.statusCode>=300) return reject(new Error(`Upstream returned HTTP ${res.statusCode}.`));
        const body=Buffer.concat(chunks).toString('utf8');
        if(raw)return resolve(body);
        try{resolve(JSON.parse(body));}catch{reject(new Error('Upstream returned invalid JSON.'));}
      });
    });
    req.on('error',error=>reject(new Error(error.name==='AbortError'?'Upstream request timed out.':error.message)));
  });
}
function quantity(value) {
  if(value===null||value===undefined)return null;
  const match=String(value).match(/^([\d.eE+-]+)(Ki|Mi|Gi|Ti|Pi|Ei|n|u|m|k|K|M|G|T|P|E)?$/);
  if(!match)return null;
  const factors={Ki:1024,Mi:1024**2,Gi:1024**3,Ti:1024**4,Pi:1024**5,Ei:1024**6,n:1e-9,u:1e-6,m:1e-3,k:1e3,K:1e3,M:1e6,G:1e9,T:1e12,P:1e15,E:1e18};
  const result=Number(match[1])*(factors[match[2]]||1);
  return Number.isFinite(result)?result:null;
}
const round=(value,digits=1)=>Number.isFinite(value)?Number(value.toFixed(digits)):null;
function resourceAge(timestamp) {
  if(!timestamp)return 'unknown';
  const hours=Math.max(0,Math.floor((Date.now()-new Date(timestamp).getTime())/3600000));
  return hours<1?'<1h':hours<24?`${hours}h`:`${Math.floor(hours/24)}d ${hours%24}h`;
}
function metricSeries(response) {
  if(response.status!=='success'||!Array.isArray(response.data?.result))throw new Error('Invalid Prometheus result.');
  if(response.data.result.length>1)throw new Error('Expected one aggregated metrics series.');
  return (response.data.result[0]?.values||[]).map(([time,value])=>({time:Number(time),value:Number.isFinite(Number(value))?Number(value):null}));
}
export function createCollector(config,dependencies={}) {
  const request=dependencies.request||requestUpstream;
  const tokenReader=dependencies.tokenReader||(()=>readFile(config.kubeTokenFile,'utf8'));
  const caReader=dependencies.caReader||(()=>readFile(config.kubeCAFile));
  const cache=new Map(),inflight=new Map();
  async function kube(path,raw=false) {
    const [token,ca]=await Promise.all([tokenReader(),caReader()]);
    return request(`${config.kubeUrl}${path}`,{token:token.trim(),ca,raw});
  }
  async function list(path) {
    const items=[];let continuation='';
    for(let page=0;page<20;page++) {
      const query=new URLSearchParams({limit:'500',...(continuation?{continue:continuation}:{})});
      const response=await kube(`${path}?${query}`);
      if(!Array.isArray(response.items))throw new Error('Invalid Kubernetes list response.');
      items.push(...response.items);continuation=response.metadata?.continue||'';
      if(!continuation)return items;
    }
    throw new Error('Collection limit reached (10,000 objects). Use a namespace filter or extend the collector.');
  }
  async function prometheus(path) {
    const token=config.promTokenFile?(await readFile(config.promTokenFile,'utf8')).trim():'';
    const ca=config.promCAFile?await readFile(config.promCAFile):undefined;
    const result=await request(`${config.prometheusUrl}${path}`,{token,ca});
    if(result.status!=='success')throw new Error('Prometheus query was unsuccessful.');
    return result;
  }
  async function collect(namespace,range) {
    const started=Date.now();
    const scope=namespace==='all'?'':`/namespaces/${encodeURIComponent(namespace)}`;
    const step=RANGES[range]/60,end=Math.floor(started/1000),start=end-RANGES[range];
    const query=expression=>`/api/v1/query_range?${new URLSearchParams({query:expression,start:String(start),end:String(end),step:String(step)})}`;
    const definitions=[
      ['Nodes',()=>list('/api/v1/nodes')],
      ['Pods',()=>list(`/api/v1${scope}/pods`)],
      ['Deployments',()=>list(`/apis/apps/v1${scope}/deployments`)],
      ['ReplicaSets',()=>list(`/apis/apps/v1${scope}/replicasets`)],
      ['Namespaces',()=>list('/api/v1/namespaces')],
      ['Events',()=>list(`/api/v1${scope}/events`)],
      ['Kubernetes version',()=>kube('/version')],
      ['CPU metrics',()=>prometheus(query('100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))')).then(metricSeries)],
      ['Memory metrics',()=>prometheus(query('100 * (1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))')).then(metricSeries)],
      ['Prometheus alerts',()=>prometheus('/api/v1/alerts')]
    ];
    const outcomes=await Promise.allSettled(definitions.map(([,run])=>run()));
    const warnings=outcomes.flatMap((result,i)=>result.status==='rejected'?[`${definitions[i][0]} unavailable: ${result.reason.message}`]:[]);
    const value=(index,fallback)=>outcomes[index].status==='fulfilled'?outcomes[index].value:fallback;
    const succeeded=i=>outcomes[i].status==='fulfilled';
    const rawNodes=value(0,[]),rawPods=value(1,[]),rawDeployments=value(2,[]),replicaSets=value(3,[]);
    const replicaOwners=new Map(replicaSets.map(rs=>[`${rs.metadata.namespace}/${rs.metadata.name}`,rs.metadata.ownerReferences?.find(o=>o.kind==='Deployment')?.name||'']));
    const pods=rawPods.map(p=>{const rs=p.metadata.ownerReferences?.find(o=>o.kind==='ReplicaSet')?.name;return {name:p.metadata.name,namespace:p.metadata.namespace,deployment:replicaOwners.get(`${p.metadata.namespace}/${rs}`)||'',status:p.metadata.deletionTimestamp?'Terminating':p.status?.containerStatuses?.find(c=>c.state?.waiting)?.state.waiting.reason||p.status?.phase||'Unknown',ready:p.status?.conditions?.some(c=>c.type==='Ready'&&c.status==='True')||false,restarts:(p.status?.containerStatuses||[]).reduce((n,c)=>n+(c.restartCount||0),0),node:p.spec?.nodeName||'',containers:(p.spec?.containers||[]).map(c=>c.name),phase:p.status?.phase,terminating:!!p.metadata.deletionTimestamp,age:resourceAge(p.metadata.creationTimestamp),image:(p.spec?.containers||[]).map(c=>c.image).join(', ')};});
    const nodes=rawNodes.map(n=>({name:n.metadata.name,ready:n.status?.conditions?.some(c=>c.type==='Ready'&&c.status==='True')||false,role:Object.hasOwn(n.metadata.labels||{},'node-role.kubernetes.io/control-plane')?'control-plane':'worker',zone:n.metadata.labels?.['topology.kubernetes.io/zone']||'',cpuCapacity:round(quantity(n.status?.allocatable?.cpu),3),memoryGiB:n.status?.allocatable?.memory?round(quantity(n.status.allocatable.memory)/1024**3):null,version:n.status?.nodeInfo?.kubeletVersion||'Unknown',pressure:(n.status?.conditions||[]).filter(c=>['MemoryPressure','DiskPressure','PIDPressure'].includes(c.type)&&c.status==='True').map(c=>c.type),age:resourceAge(n.metadata.creationTimestamp),ip:n.status?.addresses?.find(a=>a.type==='InternalIP')?.address||''}));
    const workloads=rawDeployments.map(d=>{const desired=d.spec?.replicas??1,ready=d.status?.readyReplicas??0;return {name:d.metadata.name,namespace:d.metadata.namespace,desired,ready,status:ready>=desired?'Healthy':'Degraded',restarts:succeeded(1)&&succeeded(3)?pods.filter(p=>p.namespace===d.metadata.namespace&&p.deployment===d.metadata.name).reduce((n,p)=>n+p.restarts,0):null,age:resourceAge(d.metadata.creationTimestamp),revision:d.metadata.annotations?.['deployment.kubernetes.io/revision']||'',image:d.spec?.template?.spec?.containers?.map(c=>c.image).join(', ')||''};}).sort((a,b)=>a.namespace.localeCompare(b.namespace)||a.name.localeCompare(b.name));
    const byTime=new Map();
    for(const [key,points] of [['cpu',value(7,[])],['memory',value(8,[])]])for(const p of points){if(!byTime.has(p.time))byTime.set(p.time,{time:p.time,cpu:null,memory:null});byTime.get(p.time)[key]=round(p.value);}
    const series=[...byTime.values()].sort((a,b)=>a.time-b.time);
    if(succeeded(7)&&!value(7,[]).some(p=>p.value!==null))warnings.push('CPU metrics query returned no samples. Verify node-exporter scraping.');
    if(succeeded(8)&&!value(8,[]).some(p=>p.value!==null))warnings.push('Memory metrics query returned no samples. Verify node-exporter scraping.');
    const alerts=(value(9,{data:{alerts:[]}}).data?.alerts||[]).filter(a=>namespace==='all'||!a.labels?.namespace||a.labels.namespace===namespace).map(a=>({name:a.labels?.alertname||'Unnamed alert',severity:a.labels?.severity||'unknown',namespace:a.labels?.namespace||'',state:a.state||'unknown',summary:a.annotations?.summary||a.labels?.alertname,description:a.annotations?.description||'',activeAt:a.activeAt||''}));
    const events=value(5,[]).map(e=>({type:e.type||'Normal',reason:e.reason||'Event',namespace:e.metadata.namespace,object:e.involvedObject?.name||'',message:e.message||'',time:e.lastTimestamp||e.eventTime||e.metadata.creationTimestamp,count:e.count||1})).sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0,100);
    const activePods=pods.filter(p=>!p.terminating&&!['Succeeded','Failed'].includes(p.phase));
    const namespaces=value(4,[]).map(n=>n.metadata.name).sort();
    if(namespace!=='all'&&!namespaces.includes(namespace))namespaces.push(namespace);
    return {mode:'live',cluster:config.clusterName,timestamp:new Date().toISOString(),namespace,range,namespaces,version:value(6,{}).gitVersion||'',summary:{readyNodes:succeeded(0)?nodes.filter(n=>n.ready).length:null,totalNodes:succeeded(0)?nodes.length:null,readyPods:succeeded(1)?activePods.filter(p=>p.ready).length:null,totalPods:succeeded(1)?activePods.length:null,workloads:succeeded(2)?workloads.length:null,cpuPercent:series.at(-1)?.cpu??null,memoryPercent:series.at(-1)?.memory??null,firingAlerts:succeeded(9)?alerts.filter(a=>a.state==='firing').length:null},nodes,workloads,pods,events,alerts,series,warnings,capabilities:{logs:config.logsEnabled},integrations:[{name:'Kubernetes',status:[0,1,2,3,4,5,6].every(succeeded)?'connected':'unavailable',detail:'Nodes, pods, deployments, namespaces, and events'},{name:'Prometheus',status:[7,8,9].every(succeeded)?'connected':'unavailable',detail:'Node metrics and alert rules'}],collectionMs:Date.now()-started};
  }
  return {
    async snapshot(namespace='all',range='1h') {
      validateNamespace(namespace);validateRange(range);
      const key=`${namespace}:${range}`,cached=cache.get(key);
      if(cached&&Date.now()-cached.created<10000)return cached.data;
      if(inflight.has(key))return inflight.get(key);
      if(inflight.size>=16)throw Object.assign(new Error('Too many concurrent collection requests.'),{status:429});
      const pending=collect(namespace,range).then(data=>{if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,{created:Date.now(),data});return data;}).finally(()=>inflight.delete(key));
      inflight.set(key,pending);return pending;
    },
    async logs(namespace,pod,container,tail=100) {
      if(!config.logsEnabled)throw Object.assign(new Error('Pod logs are disabled. Enable logs and its separate RBAC rule.'),{status:403});
      validateNamespace(namespace);if(namespace==='all')throw Object.assign(new Error('A specific namespace is required.'),{status:400});validateName(pod);if(container)validateName(container);
      if(!Number.isInteger(tail)||tail<1||tail>500)throw Object.assign(new Error('tail must be an integer between 1 and 500.'),{status:400});
      const params=new URLSearchParams({tailLines:String(tail),limitBytes:'65536',timestamps:'true',...(container?{container}:{})});
      return kube(`/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}/log?${params}`,true);
    }
  };
}
