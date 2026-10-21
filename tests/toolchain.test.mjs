import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createToolchainService} from '../apps/control-api/src/services/toolchain.service.mjs';
import {configFromEnv} from '../apps/control-api/src/config/env.mjs';
const cluster={snapshot:async()=>({integrations:[{name:'Kubernetes',status:'connected'}]})};
test('demo never contacts any upstream tool',async()=>{
 let requests=0;const svc=createToolchainService({demo:true},cluster,{request:()=>{requests++;throw Error('Must not call.');}});const d=await svc.list();assert.equal(requests,0);assert.ok(d.tools.every(t=>['sample','definition'].includes(t.observation.status)));
});
test('unconfigured tools stay unconfigured; configuration alone is not a readiness check',async()=>{
 const svc=createToolchainService({demo:false,toolEndpoints:{}},cluster);const d=await svc.list();assert.equal(d.tools.find(t=>t.id==='grafana').observation.status,'not-configured');assert.equal(d.tools.find(t=>t.id==='kubernetes').observation.status,'available');assert.equal(d.tools.find(t=>t.id==='terraform').observation.status,'definition');
});
test('server-side Argo probe uses token file and exposes only a count',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'devops-token-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'token');await writeFile(file,'upstream-secret-value\n');let seen;
 const svc=createToolchainService({demo:false,toolEndpoints:{argocd:{url:'https://argo.example',tokenFile:file}}},cluster,{request:async(url,opts)=>{seen={url,opts};return {items:[{spec:{secret:'do-not-expose'}}]};}});const data=await svc.status('argocd');assert.equal(seen.url,'https://argo.example/api/v1/applications');assert.equal(seen.opts.token,'upstream-secret-value');assert.equal(data.observation.applications,1);assert.ok(!JSON.stringify(data).includes('upstream-secret-value'));assert.ok(!JSON.stringify(data).includes('do-not-expose'));
});
test('failed tools are redacted and concurrent reads share one probe batch',async()=>{
 let count=0;const svc=createToolchainService({demo:false,toolEndpoints:{grafana:{url:'https://grafana.example'}}},cluster,{request:async()=>{count++;throw Error('private backend details');}});const [a,b]=await Promise.all([svc.list(),svc.list()]);assert.equal(count,1);assert.equal(a,b);assert.equal(a.tools.find(t=>t.id==='grafana').observation.status,'unavailable');assert.ok(!JSON.stringify(a).includes('private backend details'));
});
test('tool URL configuration rejects embedded credentials and query parameters',()=>{
 for(const url of ['https://name:secret@example.com','https://example.com?token=secret','file:///etc/passwd'])assert.throws(()=>configFromEnv({DEMO_MODE:'true',GRAFANA_URL:url}));
});
