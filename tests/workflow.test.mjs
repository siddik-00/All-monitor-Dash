import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateGraph,connect,removeNode,traceEdges} from '../apps/workflow-canvas/model.mjs';
const {tools}=JSON.parse(await readFile(new URL('../packages/toolchain/catalog.json',import.meta.url),'utf8'));
const original=JSON.parse(await readFile(new URL('../workflows/system.workflow.json',import.meta.url),'utf8'));
test('all repository workflows use registered tools and valid connections',async()=>{
 for(const id of ['system','delivery','infrastructure','observability','api-request']){
  const input=JSON.parse(await readFile(new URL(`../workflows/${id}.workflow.json`,import.meta.url),'utf8'));const g=validateGraph(input,tools);assert.ok(g.nodes.length>=7);assert.ok(g.edges.length>=6);
 }
});
test('import rejects dangling edges, duplicate tool IDs, unknown tools and non-finite positions',()=>{
 for(const mutate of [g=>g.edges[0].target='missing',g=>g.nodes.push(g.nodes[0]),g=>g.nodes[0].tool='missing',g=>g.nodes[0].x=Infinity,g=>g.edges.push(g.edges[0])]){const g=structuredClone(original);mutate(g);assert.throws(()=>validateGraph(g,tools));}
});
test('removing a node removes all incident connections',()=>{
 const g=validateGraph(original,tools);removeNode(g,'kubernetes');assert.ok(!g.edges.some(e=>e.source==='kubernetes'||e.target==='kubernetes'));assert.doesNotThrow(()=>validateGraph(g,tools));
});
test('connections reject self-links, duplicate pairs and missing nodes',()=>{
 const g=validateGraph(original,tools);assert.throws(()=>connect(g,'github','github'));assert.throws(()=>connect(g,'github','github-actions'));assert.throws(()=>connect(g,'github','unknown'));connect(g,'github','loki','integration');assert.equal(g.edges.at(-1).target,'loki');
});
test('trace terminates when workflows contain observation loops',()=>{
 const g=validateGraph(original,tools);connect(g,'grafana','control-api');const edges=traceEdges(g,'control-api');assert.ok(edges.length>0);assert.ok(edges.length<=g.edges.length);assert.ok(edges.some(e=>e.target==='grafana'));
});
