import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../apps/control-api/src/app.mjs';
import { configFromEnv } from '../apps/control-api/src/config/env.mjs';
import { demoSnapshot } from '../packages/providers/demo.provider.mjs';
const token='x'.repeat(64),headers={Authorization:`Bearer ${token}`};
async function run(t,{demo=false,provider}={}){
 const config=configFromEnv({API_TOKEN:token,DEMO_MODE:String(demo),ALLOWED_ORIGINS:'https://integration.example'});
 const app=createApp(config,{provider:provider||{snapshot:async(ns,r)=>({...demoSnapshot(ns,r),mode:demo?'demo':'live'}),logs:async()=>{throw Object.assign(Error('disabled'),{status:403});}}});
 app.listen(0,'127.0.0.1');await once(app,'listening');
 t.after(()=>new Promise(resolve=>{app.closeAllConnections();app.close(resolve);}));
 return `http://127.0.0.1:${app.address().port}`;
}
test('root opens the dashboard and arbitrary source assets are not served',async t=>{
 const url=await run(t);const root=await fetch(url,{redirect:'manual'});assert.equal(root.status,302);assert.equal(root.headers.get('location'),'/canvas/');
 for(const p of ['/index.html','/app.mjs','/.env','/package.json'])assert.equal((await fetch(url+p)).status,404);
});
test('live API authentication is required, including for workflow definitions',async t=>{
 const url=await run(t);assert.equal((await fetch(url+'/api/v1/workflows/system')).status,401);assert.equal((await fetch(url+'/api/v1/workflows/system',{headers})).status,200);
});
test('workflow API returns connected graph models with resolvable edge endpoints',async t=>{
 const url=await run(t);for(const id of ['system','api-request','delivery']){const r=await fetch(url+`/api/v1/workflows/${id}`,{headers});const {workflow}=await r.json();const ids=new Set(workflow.nodes.map(n=>n.id));assert.ok(ids.size>5);assert.ok(workflow.edges.length>5);assert.ok(workflow.edges.every(e=>ids.has(e.source)&&ids.has(e.target)));}
 assert.equal((await fetch(url+'/api/v1/workflows/unknown',{headers})).status,404);
});
test('cluster routes pass namespace and range through the service/provider boundary',async t=>{
 let received;const url=await run(t,{provider:{snapshot:async(ns,r)=>{received=[ns,r];return {...demoSnapshot(ns,r),mode:'live'};}}});
 const r=await fetch(url+'/api/v1/cluster/snapshot?namespace=production&range=6h',{headers});assert.equal(r.status,200);assert.deepEqual(received,['production','6h']);assert.equal((await r.json()).mode,'live');
 assert.equal((await fetch(url+'/api/v1/cluster/nodes?namespace=../secrets',{headers})).status,400);
});
test('topology contains DevOps tools and separates definitions from live observations',async t=>{
 const url=await run(t,{demo:true});const data=await(await fetch(url+'/api/v1/topology',{headers})).json();assert.equal(data.kind,'devops-tool-topology');const ids=data.workflow.nodes.map(n=>n.tool);assert.ok(ids.includes('terraform'));assert.ok(ids.includes('argocd'));assert.ok(ids.includes('opentelemetry'));assert.equal(data.observations.find(x=>x.nodeId==='argocd').status,'sample');assert.equal(data.observations.find(x=>x.nodeId==='terraform').status,'definition');
});
test('API is read-only and rejects untrusted browser origins',async t=>{
 const url=await run(t);assert.equal((await fetch(url+'/api/v1/cluster/snapshot',{method:'POST',headers})).status,405);assert.equal((await fetch(url+'/api/v1/cluster/snapshot',{headers:{...headers,Origin:'https://untrusted.example'}})).status,403);assert.equal((await fetch(url+'/api/v1/cluster/snapshot',{headers:{...headers,Origin:'https://integration.example'}})).status,200);
});
test('OpenAPI contract is available as authenticated JSON',async t=>{
 const url=await run(t);const r=await fetch(url+'/api/v1/openapi',{headers});const data=await r.json();assert.equal(data.openapi,'3.1.0');assert.ok(data.paths['/api/v1/cluster/snapshot']);assert.ok(data.paths['/api/v1/workflows/{id}']);
});
test('provider failures are redacted at the HTTP boundary',async t=>{
 const url=await run(t,{provider:{snapshot:async()=>{throw Error(`private detail ${token}`);}}});const r=await fetch(url+'/api/v1/cluster/snapshot',{headers});assert.equal(r.status,502);assert.ok(!(await r.text()).includes(token));
});
test('canvas serves an allowlisted application and its tool icons only',async t=>{
 const url=await run(t,{demo:true});const page=await fetch(url+'/canvas/');assert.equal(page.status,200);assert.match(await page.text(),/DevOps Workflow Studio/);assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
 assert.equal((await fetch(url+'/canvas/icons/kubernetes.svg')).status,200);
 for(const path of ['/canvas/.env','/canvas/package.json','/canvas/icons/unknown.svg'])assert.equal((await fetch(url+path)).status,404);
 const catalog=await(await fetch(url+'/api/v1/toolchain')).json();assert.equal(catalog.tools.length,22);
 assert.equal((await fetch(url+'/api/v1/tools/argocd/status')).status,200);assert.equal((await fetch(url+'/api/v1/tools/unknown/status')).status,404);
});
