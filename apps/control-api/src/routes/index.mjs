export function createRouter({cluster,workflow,toolchain,openapi}) {
  const routes=new Map([
    ['/api/v1/clusters',cluster.contexts],
    ['/api/v1/cluster/snapshot',cluster.snapshot],
    ['/api/v1/cluster/nodes',cluster.nodes],
    ['/api/v1/cluster/workloads',cluster.workloads],
    ['/api/v1/cluster/events',cluster.events],
    ['/api/v1/alerts',cluster.alerts],
    ['/api/v1/integrations',cluster.integrations],
    ['/api/v1/pods/logs',cluster.logs],
    ['/api/v1/topology',workflow.topology],
    ['/api/v1/workflows',workflow.list],
    ['/api/v1/toolchain',()=>toolchain.list()],
    ['/api/v1/openapi',()=>openapi]
  ]);
  return async url=>{
    const handler=routes.get(url.pathname);
    if(handler)return handler(url,{});
    const match=url.pathname.match(/^\/api\/v1\/workflows\/([a-z-]+)$/);
    if(match)return workflow.get(url,{id:match[1]});
    const tool=url.pathname.match(/^\/api\/v1\/tools\/([a-z-]+)\/status$/);
    if(tool)return toolchain.status(tool[1]);
    throw Object.assign(new Error('Unknown API endpoint.'),{status:404});
  };
}
