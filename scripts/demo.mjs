import { createApp } from '../apps/control-api/src/app.mjs';
import { configFromEnv } from '../apps/control-api/src/config/env.mjs';
const config=configFromEnv({...process.env,DEMO_MODE:'true'}),server=createApp(config);
server.listen(config.port,config.host,()=>console.log(`DevOps workflow dashboard: http://localhost:${config.port}/\nJSON API: http://localhost:${config.port}/api/v1/toolchain\nDEMO MODE: tool status is sample data, not a live deployment.`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
