import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createApp} from '../apps/control-api/src/app.mjs';
import {configFromEnv} from '../apps/control-api/src/config/env.mjs';
test('HTTP spans reach an OTLP receiver without request secrets or query parameters',async t=>{
 let received;const delivery=new Promise(resolve=>{received=resolve;});
 const receiver=http.createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString('utf8');res.writeHead(200);res.end('{}');received({body,path:req.url});});
 receiver.listen(0,'127.0.0.1');await once(receiver,'listening');
 const app=createApp(configFromEnv({DEMO_MODE:'true',OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:`http://127.0.0.1:${receiver.address().port}/v1/traces`}));
 app.listen(0,'127.0.0.1');await once(app,'listening');
 t.after(async()=>{app.closeAllConnections();await new Promise(r=>app.close(r));receiver.closeAllConnections();await new Promise(r=>receiver.close(r));});
 const response=await fetch(`http://127.0.0.1:${app.address().port}/api/v1/workflows/delivery?private=do-not-record`,{headers:{Authorization:'Bearer do-not-record'}});await response.text();
 assert.equal(response.status,200);const trace=response.headers.get('x-trace-id');assert.match(trace,/^[a-f0-9]{32}$/);
 const timer=setTimeout(()=>received(null),5000);const result=await delivery;clearTimeout(timer);assert.ok(result,'OTLP receiver did not receive a span');assert.equal(result.path,'/v1/traces');assert.ok(!result.body.includes('do-not-record'));assert.ok(!result.body.includes('?private'));
 const span=JSON.parse(result.body).resourceSpans[0].scopeSpans[0].spans[0];assert.equal(span.traceId,trace);assert.equal(span.name,'GET /api/v1/workflows/delivery');
});
