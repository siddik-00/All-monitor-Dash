import { readFile } from 'node:fs/promises';
const definitions=Object.fromEntries(['system','delivery','infrastructure','observability','api-request'].map(id=>[id,`${id}.workflow.json`]));
const directory=new URL('../../../../workflows/',import.meta.url);
export function createWorkflowRepository() {
  return {
    list:()=>Object.keys(definitions),
    async get(id) {
      if(!Object.hasOwn(definitions,id))throw Object.assign(new Error('Unknown workflow.'),{status:404});
      return JSON.parse(await readFile(new URL(definitions[id],directory),'utf8'));
    }
  };
}
