# API integration

The workflow editor uses same-origin `/api/v1/` requests. All API operations are read-only GETs. Graph edits are saved in browser storage and exported as JSON; commit an exported file under `workflows/` to version it. No graph executes arbitrary commands.

## Tool probes

Set tool URLs and optional token/CA files on the API server using `.env.tools.example`. URL settings reject embedded credentials, query strings and fragments. Browser input never selects upstream URLs. Tokens are read from files; upstream tokens are not returned in JSON.

| Tool | Environment prefix | Fixed probe |
|---|---|---|
| Argo CD | `ARGOCD` | `/api/v1/applications` |
| Grafana | `GRAFANA` | `/api/health` |
| Prometheus | `PROMETHEUS` | `/-/ready` |
| Alertmanager | `ALERTMANAGER` | `/-/ready` |
| Loki | `LOKI` | `/ready` |
| Tempo | `TEMPO` | `/ready` |
| Alloy | `ALLOY` | `/-/ready` |
| OpenTelemetry Collector | `OTEL_HEALTH` | `/` on port 13133 |
| Kubernetes | `KUBE_API_URL`, token and CA files | Read-only resource collector |

For example: `ARGOCD_URL=https://argocd.example`, `ARGOCD_TOKEN_FILE=/run/secrets/argo-token`, `ARGOCD_CA_FILE=/run/secrets/argo-ca.crt`. Use a read-only upstream account. This credential is separate from the operator token used by the editor.

`/api/v1/toolchain` returns catalog and observations. `/api/v1/tools/{id}/status` returns a registered tool. Responses never include raw Argo CD application specs or credentials. Probes have a five-second timeout, bounded response size, ten-second cache and concurrent-read deduplication. Kubernetes collection has its own cache, pagination and timeouts. Health means the configured endpoint answered successfully; it does not prove delivery or data correctness. CLI tools, CI definitions and controllers without a configured probe remain `definition`.

Workflow routes return allowlisted JSON definitions. Cluster routes return inventory, workloads, events, metrics and partial-data warnings. Missing metrics remain null. Namespace must be `all` or a valid name; range is `1h`, `6h` or `24h`. Pod logs are opt-in, bounded, and require separate RBAC.

## Multiple kubeconfig contexts

For a local dashboard, set `KUBECONFIG_ENABLED=true` and point `KUBECONFIG` at one or more kubeconfig files. `GET /api/v1/clusters` returns available context names, the current context, and a file revision marker; it never returns kubeconfig contents or credentials. Cluster reads accept an optional `context` query parameter, for example `GET /api/v1/cluster/snapshot?context=staging`. If omitted, the API uses the kubeconfig's current context. Contexts are passed to `kubectl` server-side. The dashboard polls the context list every five seconds and refreshes its inventory when the current context or kubeconfig files change. A context's configured default namespace is used for inventory when `namespace=all`.

The root URL redirects to `/canvas/`, which serves only allowlisted editor assets. `/healthz` and `/readyz` are process health, independent of upstream readiness. `/metrics` exposes request counters. OpenAPI is at `packages/contracts/openapi.yaml` and `/api/v1/openapi`.

## Logs and traces

`REQUEST_LOGS=true` writes structured HTTP completion logs with method, path, status, duration and trace ID. Tokens, query strings and request bodies are omitted. Alloy collects pod stdout and forwards it to Loki.

`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://otel-collector.monitoring.svc.cluster.local:4318/v1/traces` enables a bounded, best-effort OTLP/HTTP JSON exporter. The API produces one server span per completed application request and an `X-Trace-Id` response header. The Collector forwards spans to Tempo. Additional services need their own OpenTelemetry SDK instrumentation for distributed tracing.

Imports accept only version 2 graph JSON, registered tool IDs, finite bounded positions, unique IDs and valid connection endpoints. Limits: 500 KB, 100 nodes and 300 edges. User labels are rendered as text. Operator tokens stay in memory and never enter localStorage or exported graphs.
