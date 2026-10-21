import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { delimiter } from 'node:path';
import { validateName,validateNamespace,validateRange } from '../connectors/collector.mjs';

const execute=promisify(execFile);
const age=timestamp=>{if(!timestamp)return 'unknown';const hours=Math.max(0,Math.floor((Date.now()-new Date(timestamp).getTime())/3600000));return hours<1?'<1h':hours<24?`${hours}h`:`${Math.floor(hours/24)}d ${hours%24}h`;};

export function createKubeconfigProvider(config,{run=execute,fileStat=stat}={}) {
  const env={...process.env,...(config.kubeconfigFiles.length?{KUBECONFIG:config.kubeconfigFiles.join(delimiter)}:{})};
  const cache=new Map();
  async function command(args,{raw=false}={}) {
    try{
      const {stdout}=await run(config.kubectlPath,args,{env,windowsHide:true,timeout:20000,maxBuffer:12*1024*1024});
      return raw?stdout:JSON.parse(stdout);
    }catch(error){const detail=String(error.stderr||error.message||'kubectl failed').trim().split('\n').at(-1);throw Object.assign(new Error(`Kubernetes command failed: ${detail}`),{status:502});}
  }
  async function revision(){
    if(!config.kubeconfigFiles.length)return 'default';
    const values=await Promise.all(config.kubeconfigFiles.map(async file=>{try{const s=await fileStat(file);return `${file}:${s.size}:${s.mtimeMs}`;}catch{return `${file}:missing`;}}));
    return values.join('|');
  }
  async function contexts(){
    const [namesText,currentText,view,sourceRevision]=await Promise.all([
      command(['config','get-contexts','-o','name'],{raw:true}),
      command(['config','current-context'],{raw:true}).catch(()=>''),
      command(['config','view','-o','json']),
      revision()
    ]);
    const names=namesText.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).sort();
    const namespaces=Object.fromEntries((view.contexts||[]).map(entry=>[entry.name,entry.context?.namespace||'all']));
    return {mode:'live',contexts:names,current:currentText.trim(),namespaces,revision:sourceRevision};
  }
  async function requireContext(requested){
    const available=await contexts(),selected=requested||available.current||available.contexts[0];
    if(!selected||!available.contexts.includes(selected))throw Object.assign(new Error('Select an available Kubernetes context.'),{status:400});
    return {selected,available};
  }
  async function snapshot(namespace='all',range='1h',requestedContext='') {
    validateNamespace(namespace);validateRange(range);const {selected,available}=await requireContext(requestedContext);
    const effectiveNamespace=namespace==='all'?(available.namespaces[selected]||'all'):namespace,key=`${available.revision}:${selected}:${effectiveNamespace}:${range}`,cached=cache.get(key);if(cached&&Date.now()-cached.at<5000)return cached.data;
    const scope=effectiveNamespace==='all'?['--all-namespaces']:['-n',effectiveNamespace],base=['--context',selected];
    const definitions=[
      ['Nodes',command([...base,'get','nodes','-o','json'])],
      ['Pods',command([...base,'get','pods',...scope,'-o','json'])],
      ['Deployments',command([...base,'get','deployments',...scope,'-o','json'])],
      ['ReplicaSets',command([...base,'get','replicasets',...scope,'-o','json'])],
      ['Namespaces',effectiveNamespace==='all'?command([...base,'get','namespaces','-o','json']):Promise.resolve({items:[{metadata:{name:effectiveNamespace}}]})],
      ['Events',command([...base,'get','events',...scope,'-o','json'])],
      ['Version',command([...base,'version','-o','json'])]
    ];
    const results=await Promise.allSettled(definitions.map(([,promise])=>promise)),value=(i,fallback)=>results[i].status==='fulfilled'?results[i].value:fallback,succeeded=i=>results[i].status==='fulfilled';
    const warnings=results.flatMap((result,i)=>result.status==='rejected'?[`${definitions[i][0]} unavailable.`]:[]),items=i=>value(i,{items:[]}).items||[];
    const replicas=items(3),owners=new Map(replicas.map(rs=>[`${rs.metadata?.namespace}/${rs.metadata?.name}`,rs.metadata?.ownerReferences?.find(o=>o.kind==='Deployment')?.name||'']));
    const pods=items(1).map(p=>{const rs=p.metadata?.ownerReferences?.find(o=>o.kind==='ReplicaSet')?.name;return {name:p.metadata?.name||'',namespace:p.metadata?.namespace||'',deployment:owners.get(`${p.metadata?.namespace}/${rs}`)||'',status:p.metadata?.deletionTimestamp?'Terminating':p.status?.containerStatuses?.find(c=>c.state?.waiting)?.state.waiting.reason||p.status?.phase||'Unknown',ready:p.status?.conditions?.some(c=>c.type==='Ready'&&c.status==='True')||false,restarts:(p.status?.containerStatuses||[]).reduce((n,c)=>n+(c.restartCount||0),0),node:p.spec?.nodeName||'',containers:(p.spec?.containers||[]).map(c=>c.name),phase:p.status?.phase||'',terminating:!!p.metadata?.deletionTimestamp,age:age(p.metadata?.creationTimestamp),image:(p.spec?.containers||[]).map(c=>c.image).join(', ')};});
    const workloads=items(2).map(d=>{const desired=d.spec?.replicas??1,ready=d.status?.readyReplicas??0;return {name:d.metadata?.name||'',namespace:d.metadata?.namespace||'',desired,ready,status:ready>=desired?'Healthy':'Degraded',restarts:pods.filter(p=>p.namespace===d.metadata?.namespace&&p.deployment===d.metadata?.name).reduce((n,p)=>n+p.restarts,0),age:age(d.metadata?.creationTimestamp),revision:d.metadata?.annotations?.['deployment.kubernetes.io/revision']||'',image:d.spec?.template?.spec?.containers?.map(c=>c.image).join(', ')||''};}).sort((a,b)=>a.namespace.localeCompare(b.namespace)||a.name.localeCompare(b.name));
    const nodes=items(0).map(n=>{const conditions=n.status?.conditions||[];return {name:n.metadata?.name||'',ready:conditions.some(c=>c.type==='Ready'&&c.status==='True'),role:Object.keys(n.metadata?.labels||{}).find(k=>k.startsWith('node-role.kubernetes.io/'))?.split('/').at(-1)||'worker',zone:n.metadata?.labels?.['topology.kubernetes.io/zone']||'',cpuCapacity:n.status?.capacity?.cpu||'',memoryGiB:null,version:n.status?.nodeInfo?.kubeletVersion||'',pressure:conditions.filter(c=>c.status==='True'&&c.type.endsWith('Pressure')).map(c=>c.type),age:age(n.metadata?.creationTimestamp),ip:n.status?.addresses?.find(a=>a.type==='InternalIP')?.address||''};});
    const events=items(5).map(e=>({type:e.type||'Normal',reason:e.reason||'Event',namespace:e.metadata?.namespace||'',object:e.involvedObject?.name||'',message:e.message||'',time:e.lastTimestamp||e.eventTime||e.metadata?.creationTimestamp||'',count:e.count||1})).sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0,100);
    const namespaces=items(4).map(n=>n.metadata?.name).filter(Boolean).sort(),activePods=pods.filter(p=>!p.terminating&&!['Succeeded','Failed'].includes(p.phase));
    const data={mode:'live',cluster:selected,context:selected,contextRevision:available.revision,timestamp:new Date().toISOString(),namespace:effectiveNamespace,range,namespaces,version:value(6,{}).serverVersion?.gitVersion||'',summary:{readyNodes:succeeded(0)?nodes.filter(n=>n.ready).length:null,totalNodes:succeeded(0)?nodes.length:null,readyPods:succeeded(1)?activePods.filter(p=>p.ready).length:null,totalPods:succeeded(1)?activePods.length:null,workloads:succeeded(2)?workloads.length:null,cpuPercent:null,memoryPercent:null,firingAlerts:null},nodes,workloads,pods,events,alerts:[],series:[],warnings,capabilities:{logs:config.logsEnabled},integrations:[{name:'Kubernetes',status:[0,1,2,3,4,5,6].every(succeeded)?'connected':'unavailable',detail:`kubectl context inventory (${effectiveNamespace})`},{name:'Prometheus',status:'not-configured',detail:'Metrics are not configured for this kubeconfig context.'}]};
    cache.clear();cache.set(key,{at:Date.now(),data});return data;
  }
  async function logs(namespace,pod,container='',tail=100,context=''){
    validateNamespace(namespace);if(namespace==='all')throw Object.assign(new Error('A specific namespace is required.'),{status:400});validateName(pod);if(container)validateName(container);const {selected}=await requireContext(context);const args=['--context',selected,'logs','-n',namespace,pod,'--tail',String(Math.max(1,Math.min(500,tail))),...(container?['-c',container]:[])];return command(args,{raw:true});
  }
  return {contexts,snapshot,logs};
}
