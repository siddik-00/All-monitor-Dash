import { createApp } from './app.mjs';
import { configFromEnv } from './config/env.mjs';
try {
  const config=configFromEnv();
  const server=createApp(config);
  server.listen(config.port,config.host,()=>console.log(JSON.stringify({event:'listening',host:config.host,port:config.port,mode:config.demo?'demo':'live',interface:'api-only'})));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
}catch(error){console.error(error.message);process.exit(1);}
