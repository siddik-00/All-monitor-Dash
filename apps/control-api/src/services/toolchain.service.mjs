import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { requestUpstream } from '../../../../packages/connectors/collector.mjs';
const catalog=JSON.parse(readFileSync(new URL('../../../../packages/toolchain/catalog.json',import.meta.url),'utf8'));
const paths={argocd:'/api/v1/applications',grafana:'/api/health',prometheus:'/-/ready',loki:'/ready',tempo:'/ready',alertmanager:'/-/ready',alloy:'/-/ready',opentelemetry:'/'};
const runtime=new Set(['argocd','grafana','prometheus','loki','tempo','alertmanager','alloy','opentelemetry','kubernetes','control-api']);

export function createToolchainService(config,clusterService,{request=requestUpstream}={}){
  let cached,inflight;
  async function observe(tool){
    const checkedAt=new Date().toISOString();
    if(!runtime.has(tool.id))return {status:'definition',checkedAt,detail:'Configuration is in the repository; this tool has no runtime probe.'};
    if(config.demo)return {status:'sample',checkedAt,detail:'Demo mode. No live tool connection was tested.'};
    if(tool.id==='control-api')return {status:'available',checkedAt,detail:'This API process answered the request.'};
    if(tool.id==='kubernetes'){
      try{const data=await clusterService.snapshot();const found=data.integrations.find(x=>x.name==='Kubernetes');
        return {status:found?.status==='connected'?'available':'unavailable',checkedAt,detail:found?.status==='connected'?'Kubernetes resource reads succeeded.':'Kubernetes resource reads did not succeed.'};
      }catch{return {status:'unavailable',checkedAt,detail:'Kubernetes API could not be read.'};}
    }
    const target=config.toolEndpoints?.[tool.id];
    if(!target)return {status:'not-configured',checkedAt,detail:'Set the corresponding tool URL on the API server to enable its health probe.'};
    try{
      const [token,ca]=await Promise.all([target.tokenFile?readFile(target.tokenFile,'utf8'):'',target.caFile?readFile(target.caFile):undefined]);
      const data=await request(`${target.url}${paths[tool.id]}`,{token:String(token).trim(),ca,raw:!['argocd','grafana'].includes(tool.id),timeout:5000,maxBytes:512*1024});
      if(tool.id==='argocd'&&!Array.isArray(data.items)&&data.items!==null&&data.items!==undefined)throw Error('Invalid Argo CD response.');
      if(tool.id==='grafana'&&data.database!=='ok')throw Error('Grafana database is unavailable.');
      return {status:'available',checkedAt,detail:`Read-only ${paths[tool.id]} probe succeeded.`,...(tool.id==='argocd'?{applications:Array.isArray(data.items)?data.items.length:0}:{})};
    }catch{return {status:'unavailable',checkedAt,detail:'Tool health probe failed. Check server configuration, authentication and reachability.'};}
  }
  async function collect(){
    const timestamp=new Date().toISOString();
    return {schemaVersion:1,kind:'devops-toolchain',mode:config.demo?'demo':'live',timestamp,tools:await Promise.all(catalog.tools.map(async t=>({...t,observation:await observe(t)})))};
  }
  async function list(){
    if(cached&&Date.now()-cached.at<10000)return cached.data;
    if(!inflight)inflight=collect().then(data=>{cached={at:Date.now(),data};return data;}).finally(()=>{inflight=undefined;});
    return inflight;
  }
  return {list,async status(id){if(!catalog.tools.some(t=>t.id===id))throw Object.assign(Error('Unknown DevOps tool.'),{status:404});return (await list()).tools.find(t=>t.id===id);}};
}
