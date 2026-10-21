import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function scan(path){const out=[];for(const item of await readdir(path,{withFileTypes:true})){const file=`${path}/${item.name}`;if(item.isDirectory())out.push(...await scan(file));else if(file.endsWith('.mjs'))out.push(file);}return out;}
for(const directory of ['apps','packages','scripts','tests'])for(const file of await scan(directory)){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log('All JavaScript source syntax checks passed.');
