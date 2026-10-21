import { readFileSync } from 'node:fs';
import { delimiter } from 'node:path';
export function configFromEnv(env=process.env) {
  const demo=env.DEMO_MODE==='true';
  const kubeconfigFiles=(env.KUBECONFIG||'').split(delimiter).map(s=>s.trim()).filter(Boolean);
  const config={demo,kubeconfigFiles,kubeconfigEnabled:env.KUBECONFIG_ENABLED==='true'||kubeconfigFiles.length>0,kubectlPath:env.KUBECTL_PATH||'kubectl',port:Number(env.PORT||8080),host:env.HOST||'127.0.0.1',clusterName:env.CLUSTER_NAME||'my-cluster',apiToken:env.API_TOKEN||'',apiTokenFile:env.API_TOKEN_FILE||'',kubeUrl:(env.KUBE_API_URL||'https://kubernetes.default.svc').replace(/\/$/,''),kubeTokenFile:env.KUBE_TOKEN_FILE||'/var/run/secrets/kubernetes.io/serviceaccount/token',kubeCAFile:env.KUBE_CA_FILE||'/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',prometheusUrl:(env.PROMETHEUS_URL||'http://observability-prometheus.monitoring.svc.cluster.local:9090').replace(/\/$/,''),promTokenFile:env.PROMETHEUS_TOKEN_FILE||'',promCAFile:env.PROMETHEUS_CA_FILE||'',logsEnabled:env.LOGS_ENABLED==='true',allowedOrigins:(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)};
  if(!Number.isInteger(config.port)||config.port<0||config.port>65535)throw new Error('PORT must be a valid TCP port.');
  if(!demo&&tokenFor(config).length<32)throw new Error('Live mode requires an API_TOKEN or API_TOKEN_FILE of at least 32 characters.');
  for(const origin of config.allowedOrigins){const url=new URL(origin);if(url.origin!==origin||!['https:','http:'].includes(url.protocol))throw new Error('ALLOWED_ORIGINS must contain exact origins, with no path or wildcard.');}
  config.toolEndpoints={};
  for(const [id,prefix] of Object.entries({argocd:'ARGOCD',grafana:'GRAFANA',prometheus:'PROMETHEUS',loki:'LOKI',tempo:'TEMPO',alertmanager:'ALERTMANAGER',alloy:'ALLOY',opentelemetry:'OTEL_HEALTH'})){
    if(!env[`${prefix}_URL`])continue;
    const url=new URL(env[`${prefix}_URL`]);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error(`${prefix}_URL must be HTTP(S) without embedded credentials, query, or fragment.`);
    config.toolEndpoints[id]={url:url.href.replace(/\/$/,''),tokenFile:env[`${prefix}_TOKEN_FILE`]||'',caFile:env[`${prefix}_CA_FILE`]||''};
  }
  config.otlpEndpoint=env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT||'';
  if(config.otlpEndpoint){const u=new URL(config.otlpEndpoint);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT must be a plain HTTP(S) URL.');}
  config.requestLogs=env.REQUEST_LOGS==='true';
  const kube=new URL(config.kubeUrl);if(kube.protocol!=='https:'||kube.username||kube.password||kube.search||kube.hash)throw new Error('KUBE_API_URL must be an HTTPS URL without embedded credentials or query.');
  const prom=new URL(config.prometheusUrl);if(!['https:','http:'].includes(prom.protocol)||prom.username||prom.password||prom.search||prom.hash)throw new Error('PROMETHEUS_URL must be HTTP(S) without embedded credentials or query.');
  return config;
}
function tokenFor(config){return config.apiTokenFile?readFileSync(config.apiTokenFile,'utf8').trim():config.apiToken;}

export { tokenFor };
