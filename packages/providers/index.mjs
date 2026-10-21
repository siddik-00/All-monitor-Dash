import { createCollector } from '../connectors/collector.mjs';
import { demoSnapshot } from './demo.provider.mjs';
import { createKubeconfigProvider } from './kubeconfig.provider.mjs';
export function createProvider(config) {
  if(config.kubeconfigEnabled)return createKubeconfigProvider(config);
  if(!config.demo)return createCollector(config);
  return {contexts:async()=>({mode:'demo',contexts:[],current:'',revision:'demo'}),snapshot:async(namespace,range)=>demoSnapshot(namespace,range),logs:async()=>{throw Object.assign(new Error('Pod logs are unavailable in demo mode.'),{status:403});}};
}
