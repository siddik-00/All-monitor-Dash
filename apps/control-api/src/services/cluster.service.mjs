import { validateNamespace,validateRange } from '../../../../packages/connectors/collector.mjs';
export function createClusterService(provider) {
  const snapshot=(namespace='all',range='1h',context='')=>provider.snapshot(validateNamespace(namespace),validateRange(range),context);
  return {
    contexts:()=>provider.contexts?provider.contexts():Promise.resolve({mode:'live',contexts:[],current:'',revision:'static'}),
    snapshot,
    async collection(key,namespace,range,context) {
      const data=await snapshot(namespace,range,context);
      return {mode:data.mode,cluster:data.cluster,timestamp:data.timestamp,namespace:data.namespace,warnings:data.warnings,[key]:data[key]};
    },
    logs:(...args)=>provider.logs(...args)
  };
}
