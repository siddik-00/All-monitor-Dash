import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createProvider } from '../../../packages/providers/index.mjs';
import { createClusterService } from './services/cluster.service.mjs';
import { createWorkflowService } from './services/workflow.service.mjs';
import { createToolchainService } from './services/toolchain.service.mjs';
import { serveCanvas } from './middleware/canvas.mjs';
import { createTelemetry } from '../../../packages/connectors/telemetry.mjs';
import { createWorkflowRepository } from './repositories/workflow.repository.mjs';
import { createClusterController } from './controllers/cluster.controller.mjs';
import { createWorkflowController } from './controllers/workflow.controller.mjs';
import { createRouter } from './routes/index.mjs';
import { requireAuth } from './middleware/auth.mjs';
import { cors } from './middleware/cors.mjs';
import { json,errorResponse } from './middleware/response.mjs';
const contract=JSON.parse(readFileSync(new URL('../../../packages/contracts/openapi.json',import.meta.url),'utf8'));

export function createApp(config,dependencies={}) {
  const clusterService=createClusterService(dependencies.provider||createProvider(config));
  const repository=dependencies.repository||createWorkflowRepository();
  const toolchainService=createToolchainService(config,clusterService,dependencies.toolchain);
  const workflowService=createWorkflowService(repository,toolchainService);
  const dispatch=createRouter({cluster:createClusterController(clusterService),workflow:createWorkflowController(workflowService),toolchain:toolchainService,openapi:contract});
  const telemetry=createTelemetry(config);
  const rates=new Map(),counts=new Map();
  const app=http.createServer(async(req,res)=>{
    res.on('finish',()=>counts.set(res.statusCode,(counts.get(res.statusCode)||0)+1));
    try {
      if((req.url||'').length>2048)throw Object.assign(new Error('Request URL is too long.'),{status:414});
      const url=new URL(req.url,'http://control-api.local');
      telemetry.begin(req,res,url.pathname);
      if(url.pathname==='/healthz'||url.pathname==='/readyz')return json(res,200,{status:'ok',mode:config.demo?'demo':'live',upstreamHealth:'/api/v1/integrations'});
      if(url.pathname==='/metrics'){res.writeHead(200,{'Content-Type':'text/plain; version=0.0.4'});return res.end(`# TYPE control_api_http_requests_total counter\n${[...counts].map(([status,count])=>`control_api_http_requests_total{status="${status}"} ${count}`).join('\n')}\n`);}
      if(url.pathname==='/'){res.writeHead(302,{Location:'/canvas/'});return res.end();}
      if(req.method==='GET'&&await serveCanvas(url.pathname,res))return;
      if(!url.pathname.startsWith('/api/'))throw Object.assign(new Error('Unknown API endpoint.'),{status:404});
      cors(req,res,config);
      if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
      if(req.method!=='GET'){res.setHeader('Allow','GET, OPTIONS');throw Object.assign(new Error('Only read-only GET requests are supported.'),{status:405});}
      const now=Date.now(),key=req.socket.remoteAddress||'unknown',bucket=rates.get(key);
      if(!bucket||now-bucket.start>=60000){if(rates.size>=1024)rates.delete(rates.keys().next().value);rates.set(key,{start:now,count:1});}else if(++bucket.count>180){res.setHeader('Retry-After','60');throw Object.assign(new Error('Rate limit exceeded.'),{status:429});}
      requireAuth(req.headers.authorization,config);
      json(res,200,await dispatch(url));
    } catch(error){if(!res.headersSent)errorResponse(res,error);else res.destroy();}
  });
  app.requestTimeout=25000;app.headersTimeout=10000;app.keepAliveTimeout=5000;app.maxHeadersCount=50;
  app.once('close',()=>telemetry.close());
  return app;
}
