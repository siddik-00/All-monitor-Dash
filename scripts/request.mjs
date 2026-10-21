import { readFile } from 'node:fs/promises';
const [base,tokenFile,path='/api/v1/cluster/snapshot']=process.argv.slice(2);
if(!base||!tokenFile){console.error('Usage: node scripts/request.mjs API_BASE TOKEN_FILE [API_PATH]');process.exit(2);}
const origin=new URL(base);if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(origin.hostname)))throw Error('Use HTTPS or localhost.');
if(!path.startsWith('/api/v1/'))throw Error('Use a /api/v1/ endpoint.');
const token=(await readFile(tokenFile,'utf8')).trim();
const response=await fetch(base.replace(/\/$/,'')+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(25000)});
console.log(JSON.stringify(await response.json(),null,2));if(!response.ok)process.exitCode=1;
