const idPattern=/^[a-z][a-z0-9-]{0,79}$/;
export function validateGraph(value,tools){
  if(!value||value.schemaVersion!==2||!Array.isArray(value.nodes)||!Array.isArray(value.edges))throw Error('Expected a version 2 DevOps workflow JSON.');
  if(value.nodes.length>100||value.edges.length>300)throw Error('A workflow can contain at most 100 tools and 300 connections.');
  const known=new Set(tools.map(t=>t.id)),ids=new Set();
  const nodes=value.nodes.map(n=>{
    if(!idPattern.test(n.id)||ids.has(n.id)||!known.has(n.tool))throw Error('Duplicate node ID or unknown DevOps tool.');
    if(!Number.isFinite(n.x)||!Number.isFinite(n.y)||Math.abs(n.x)>20000||Math.abs(n.y)>20000)throw Error('Invalid node position.');
    ids.add(n.id);return {id:n.id,tool:n.tool,label:String(n.label||n.tool).slice(0,70),x:n.x,y:n.y,width:166,height:88};
  });
  const edgeIds=new Set(),pairs=new Set();
  const edges=value.edges.map(e=>{
    const pair=`${e.source}->${e.target}`;
    if(!idPattern.test(e.id)||edgeIds.has(e.id)||pairs.has(pair)||!ids.has(e.source)||!ids.has(e.target)||e.source===e.target)throw Error('Invalid, duplicate, or dangling connection.');
    edgeIds.add(e.id);pairs.add(pair);
    return {id:e.id,source:e.source,target:e.target,label:String(e.label||'API / automation').slice(0,100),kind:['delivery','infrastructure','security','api','metrics','logs','traces','recovery'].includes(e.kind)?e.kind:'api'};
  });
  const groups=Array.isArray(value.groups)?value.groups.slice(0,10).filter(g=>[g.x,g.y,g.width,g.height].every(Number.isFinite)).map(g=>({id:String(g.id).slice(0,50),label:String(g.label).slice(0,90),x:g.x,y:g.y,width:Math.max(0,Math.min(30000,g.width)),height:Math.max(0,Math.min(30000,g.height))})):[];
  return {schemaVersion:2,id:idPattern.test(value.id)?value.id:'custom',title:String(value.title||'Custom workflow').slice(0,100),subtitle:String(value.subtitle||'').slice(0,500),kind:'devops-tool-workflow',canvas:{width:1480,height:1260},groups,nodes,edges};
}
export function connect(graph,source,target,label='API / automation'){
  if(source===target)throw Error('Choose two different tools.');
  if(!graph.nodes.some(n=>n.id===source)||!graph.nodes.some(n=>n.id===target))throw Error('Connection endpoint is missing.');
  if(graph.edges.some(e=>e.source===source&&e.target===target))throw Error('This connection already exists.');
  if(graph.edges.length>=300)throw Error('Connection limit reached.');
  graph.edges.push({id:`edge-${crypto.randomUUID()}`,source,target,label:String(label).slice(0,100),kind:'api'});
}
export function removeNode(graph,id){graph.nodes=graph.nodes.filter(n=>n.id!==id);graph.edges=graph.edges.filter(e=>e.source!==id&&e.target!==id);}
export function traceEdges(graph,start){
  const visited=new Set([start]),queue=[start],result=[];
  while(queue.length){const current=queue.shift();for(const e of graph.edges.filter(e=>e.source===current)){result.push(e);if(!visited.has(e.target)){visited.add(e.target);queue.push(e.target);}}}
  return result;
}
export function connectionPath(source,target){
  const dx=target.x-source.x,dy=target.y-source.y;
  if(Math.abs(dy)<110){
    const from=dx>=0?source.x+166:source.x,to=dx>=0?target.x:target.x+166,sign=dx>=0?1:-1;
    if(Math.abs(dx)>350){const lane=Math.min(source.y,target.y)-36;return {d:`M ${from} ${source.y+44} C ${from+sign*24} ${source.y+44} ${from+sign*24} ${lane} ${from+sign*44} ${lane} L ${to-sign*44} ${lane} C ${to-sign*24} ${lane} ${to-sign*24} ${target.y+44} ${to} ${target.y+44}`,x:(from+to)/2,y:lane-8};}
    return {d:`M ${from} ${source.y+44} C ${(from+to)/2} ${source.y+44} ${(from+to)/2} ${target.y+44} ${to} ${target.y+44}`,x:(from+to)/2,y:(source.y+target.y)/2+34};
  }
  if(Math.abs(dx)<80&&Math.abs(dy)>350){
    const sign=dy>0?1:-1,from=dy>0?source.y+88:source.y,to=dy>0?target.y:target.y+88,lane=Math.max(source.x,target.x)+204;
    return {d:`M ${source.x+83} ${from} C ${source.x+83} ${from+sign*35} ${lane} ${from+sign*35} ${lane} ${from+sign*65} L ${lane} ${to-sign*65} C ${lane} ${to-sign*35} ${target.x+83} ${to-sign*35} ${target.x+83} ${to}`,x:lane+8,y:(from+to)/2};
  }
  const from=dy>0?source.y+88:source.y,to=dy>0?target.y:target.y+88,mid=(from+to)/2;
  return {d:`M ${source.x+83} ${from} C ${source.x+83} ${mid} ${target.x+83} ${mid} ${target.x+83} ${to}`,x:(source.x+target.x)/2+83,y:mid-8};
}
