export function createClusterController(service) {
  const args=url=>[url.searchParams.get('namespace')||'all',url.searchParams.get('range')||'1h',url.searchParams.get('context')||''];
  return {
    contexts:()=>service.contexts(),
    snapshot:url=>service.snapshot(...args(url)),
    nodes:url=>service.collection('nodes',...args(url)),
    workloads:url=>service.collection('workloads',...args(url)),
    events:url=>service.collection('events',...args(url)),
    alerts:url=>service.collection('alerts',...args(url)),
    integrations:url=>service.collection('integrations',...args(url)),
    async logs(url) {
      const namespace=url.searchParams.get('namespace')||'all',pod=url.searchParams.get('pod'),container=url.searchParams.get('container')||'',tail=Number(url.searchParams.get('tail')||100),context=url.searchParams.get('context')||'';
      return {mode:'live',namespace,pod,context,logs:await service.logs(namespace,pod,container,tail,context)};
    }
  };
}
