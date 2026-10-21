import { randomBytes } from 'node:crypto';
// Small OTLP/HTTP JSON exporter. Bounded, best effort, and never records tokens or query strings.
export function createTelemetry(config){
  const queue=[];let busy=false;
  async function flush(){
    if(busy||!queue.length||!config.otlpEndpoint)return;
    busy=true;const spans=queue.splice(0,32);
    try{await fetch(config.otlpEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(2500),body:JSON.stringify({resourceSpans:[{resource:{attributes:[{key:'service.name',value:{stringValue:'control-api'}}]},scopeSpans:[{scope:{name:'devops-workflow-http',version:'2.0.0'},spans}]}]})});}catch{/* Telemetry failure must not fail an API response. */}finally{busy=false;}
  }
  const timer=config.otlpEndpoint?setInterval(flush,3000):null;timer?.unref();
  return {
    begin(req,res,path){
      if(['/healthz','/readyz','/metrics'].includes(path))return;
      const traceId=randomBytes(16).toString('hex'),spanId=randomBytes(8).toString('hex'),started=BigInt(Date.now())*1000000n;
      res.setHeader('X-Trace-Id',traceId);
      res.once('finish',()=>{
        const finished=BigInt(Date.now())*1000000n;
        if(config.requestLogs)process.stdout.write(JSON.stringify({level:'info',service:'control-api',method:req.method,path,status:res.statusCode,traceId,durationMs:Number(finished-started)/1e6})+'\n');
        if(config.otlpEndpoint&&queue.length<256)queue.push({traceId,spanId,name:`${req.method} ${path}`,kind:2,startTimeUnixNano:started.toString(),endTimeUnixNano:finished.toString(),attributes:[{key:'http.request.method',value:{stringValue:req.method}},{key:'url.path',value:{stringValue:path}},{key:'http.response.status_code',value:{intValue:String(res.statusCode)}}],status:{code:res.statusCode>=500?2:1}});
      });
    },close(){if(timer)clearInterval(timer);return flush();}
  };
}
