export function createWorkflowController(service) {
  return {list:()=>service.list(),get:(_url,params)=>service.get(params.id),topology:()=>service.topology()};
}
