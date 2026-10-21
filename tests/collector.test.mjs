import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollector,validateNamespace,validateRange } from '../packages/connectors/collector.mjs';

const config={clusterName:'fixture-cluster',kubeUrl:'https://kubernetes.example',prometheusUrl:'http://prometheus.example',logsEnabled:false};
function fixture({fail='',empty=false,paginated=false}={}) {
  const requests=[];
  const request=async(raw,options)=>{
    const url=new URL(raw);requests.push({url,options});
    if(fail&&url.pathname.endsWith(fail))throw new Error('Upstream returned HTTP 403.');
    const metadata={namespace:'production',creationTimestamp:'2026-10-01T00:00:00Z'};
    const list=items=>({items,metadata:{}});
    if(url.pathname==='/version')return {gitVersion:'v1.35.9'};
    if(url.pathname.endsWith('/nodes')){
      if(paginated&&!url.searchParams.get('continue'))return {items:[],metadata:{continue:'next/token+value'}};
      return list([{metadata:{...metadata,name:'worker-01',labels:{'topology.kubernetes.io/zone':'zone-a'}},status:{conditions:[{type:'Ready',status:'True'}],allocatable:{cpu:'1500m',memory:'2Gi'},nodeInfo:{kubeletVersion:'v1.35.9'}}}]);
    }
    if(url.pathname.endsWith('/pods'))return list([
      {metadata:{...metadata,name:'api-abc-p1',ownerReferences:[{kind:'ReplicaSet',name:'api-abc'}]},spec:{nodeName:'worker-01',containers:[{name:'api'}]},status:{phase:'Running',conditions:[{type:'Ready',status:'True'}],containerStatuses:[{restartCount:3}]}},
      {metadata:{...metadata,name:'job-complete'},status:{phase:'Succeeded',conditions:[]}},
      {metadata:{...metadata,name:'api-abc-p2',ownerReferences:[{kind:'ReplicaSet',name:'api-abc'}]},status:{phase:'Pending',conditions:[]}}
    ]);
    if(url.pathname.endsWith('/deployments'))return list([{metadata:{...metadata,name:'api'},spec:{replicas:2,template:{spec:{containers:[{image:'example/api:sha-test'}]}}},status:{readyReplicas:1}}]);
    if(url.pathname.endsWith('/replicasets'))return list([{metadata:{...metadata,name:'api-abc',ownerReferences:[{kind:'Deployment',name:'api'}]}}]);
    if(url.pathname.endsWith('/namespaces'))return list([{metadata:{name:'production'}}]);
    if(url.pathname.endsWith('/events'))return list([{metadata,type:'Warning',reason:'FailedScheduling',message:'Insufficient memory',lastTimestamp:'2026-10-20T01:00:00Z',involvedObject:{name:'api-abc-p2'},count:2}]);
    if(url.pathname==='/api/v1/query_range')return {status:'success',data:{resultType:'matrix',result:empty?[]:[{values:[[1000,'35'],[1060,'NaN'],[1120,'42.5']]}]}};
    if(url.pathname==='/api/v1/alerts')return {status:'success',data:{alerts:[{state:'firing',labels:{alertname:'ReplicaMismatch',namespace:'production',severity:'warning'},annotations:{summary:'Replica missing'},activeAt:'2026-10-20T01:00:00Z'},{state:'firing',labels:{alertname:'OtherNamespace',namespace:'staging'}}]}};
    if(url.pathname.endsWith('/log'))return 'log line\n';
    throw new Error(`Unexpected upstream fixture request ${url.pathname}`);
  };
  return {request,requests};
}
function collector(options={}){const f=fixture(options);return {...f,collector:createCollector(config,{request:f.request,tokenReader:async()=> 'rotating-token',caReader:async()=> 'test-ca'})};}

test('collects live inventory, follows ReplicaSet ownership, and excludes completed pods from readiness',async()=>{
  const {collector:c}=collector();const s=await c.snapshot('production','1h');
  assert.equal(s.mode,'live');assert.equal(s.summary.totalPods,2);assert.equal(s.summary.readyPods,1);
  assert.equal(s.workloads[0].restarts,3);assert.equal(s.pods[0].deployment,'api');
  assert.equal(s.nodes[0].cpuCapacity,1.5);assert.equal(s.nodes[0].memoryGiB,2);
  assert.equal(s.summary.firingAlerts,1);assert.equal(s.series[1].cpu,null);assert.equal(s.summary.cpuPercent,42.5);assert.deepEqual(s.warnings,[]);
});
test('missing metrics stay null and produce visible warnings instead of fabricated zeros',async()=>{
  const {collector:c}=collector({empty:true});const s=await c.snapshot();assert.equal(s.summary.cpuPercent,null);assert.equal(s.summary.memoryPercent,null);assert.equal(s.series.length,0);assert.ok(s.warnings.some(w=>w.includes('no samples')));
});
test('a Kubernetes permission failure preserves other data and marks the missing count null',async()=>{
  const {collector:c}=collector({fail:'/nodes'});const s=await c.snapshot();assert.equal(s.summary.totalNodes,null);assert.equal(s.summary.totalPods,2);assert.ok(s.warnings.some(w=>w.includes('Nodes unavailable')));assert.equal(s.integrations[0].status,'unavailable');
});
test('follows Kubernetes pagination using an encoded continuation token',async()=>{
  const {collector:c,requests}=collector({paginated:true});const s=await c.snapshot();assert.equal(s.nodes.length,1);const pages=requests.filter(r=>r.url.pathname.endsWith('/nodes'));assert.equal(pages.length,2);assert.equal(pages[1].url.searchParams.get('continue'),'next/token+value');
});
test('deduplicates concurrent collections and uses a short bounded cache',async()=>{
  const {collector:c,requests}=collector();const [a,b]=await Promise.all([c.snapshot(),c.snapshot()]);assert.equal(a,b);const count=requests.length;await c.snapshot();assert.equal(requests.length,count);
});
test('namespace and range validation reject query injection and excessive ranges',()=>{
  for(const ns of ['../secrets','production?limit=999','a/b','a'.repeat(64),'__proto__'])assert.throws(()=>validateNamespace(ns));
  assert.equal(validateNamespace('core-prod'),'core-prod');assert.throws(()=>validateRange('90d'));assert.throws(()=>validateRange('__proto__'));
});
test('optional logs require opt-in and enforce namespace, path, and line bounds',async()=>{
  const {collector:c}=collector();await assert.rejects(c.logs('production','api-pod','',100),{status:403});
  const f=fixture();const enabled=createCollector({...config,logsEnabled:true},{request:f.request,tokenReader:async()=> 'token',caReader:async()=> 'ca'});
  await assert.rejects(enabled.logs('all','api-pod','',100),{status:400});await assert.rejects(enabled.logs('production','../secrets','',100),{status:400});await assert.rejects(enabled.logs('production','api-pod','',1000),{status:400});
  assert.equal(await enabled.logs('production','api-pod','api',50),'log line\n');const last=f.requests.at(-1).url;assert.equal(last.searchParams.get('limitBytes'),'65536');assert.equal(last.searchParams.get('tailLines'),'50');
});
test('reads the projected service account token on every upstream call',async()=>{
  const f=fixture();let reads=0;const c=createCollector(config,{request:f.request,tokenReader:async()=>`token-${++reads}`,caReader:async()=> 'ca'});await c.snapshot();const kubeRequests=f.requests.filter(r=>r.url.hostname==='kubernetes.example');assert.equal(reads,kubeRequests.length);assert.equal(new Set(kubeRequests.map(r=>r.options.token)).size,reads);
});
