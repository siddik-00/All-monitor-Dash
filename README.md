# DevOps Workflow Studio — source code

Editable DevOps tool workflows, a read-only integration API, and infrastructure configuration for **22 tools**. The workflow editor is built from HTML, CSS, SVG and JavaScript modules. Node.js serves the API and the editor without third-party Node dependencies.

## Run locally

Install **Node.js 24**, extract this codebase, open its folder in a terminal and run:

```bash
npm run dev
```

Open **http://localhost:8080/**. It redirects to the workflow dashboard. No npm install or build step is required. In Windows PowerShell, use `npm.cmd run dev` when script execution policy blocks `npm.ps1`.

With Docker installed:

```bash
docker compose -f infra/compose/compose.yaml up --build
```

These commands start a **labelled demo**; they do not install the platform or claim live tool readiness.

## Editor

- Five connected views: all tools, CI/CD, infrastructure, observability and API flow.
- Add tools, drag nodes, connect tools, rename nodes, edit connection labels and remove nodes/links.
- Pan/zoom/fit and inspect API endpoints and connection status.
- Animate an outgoing path locally. Trace does not execute a pipeline or deployment.
- Save layouts in browser storage; import/export validated JSON workflows.
- Poll live server-side health APIs every 20 seconds when enabled.
- Operator token stays in tab memory. Upstream credentials stay on the server.

## Toolchain

| Area | Tools | Configuration |
|---|---|---|
| Source, build, delivery | GitHub, GitHub Actions, Docker, Trivy, GHCR | `.github/workflows/ci.yaml`, `Dockerfile` |
| Infrastructure | Terraform, Ansible, Kubernetes, Helm | `infra/terraform/`, `infra/ansible/`, `infra/local/`, `infra/helm/` |
| GitOps | Argo CD | `infra/gitops/platform/` |
| Security | cert-manager, External Secrets, Kyverno | `infra/security/` |
| Metrics and alerts | Prometheus, Alertmanager, Grafana | `infra/monitoring/` |
| Logs | Grafana Alloy, Loki | `infra/observability/` |
| Traces | OpenTelemetry Collector, Tempo | `infra/observability/`, `packages/connectors/telemetry.mjs` |
| Recovery | Velero, optional and initially disabled | `infra/backup/values.yaml` |
| Integration | Control API | `apps/control-api/`, `packages/connectors/` |

## Code structure

```text
apps/
  workflow-canvas/       Editable browser workflow, no build step
  control-api/src/
    config/             Environment and token-file validation
    middleware/         Auth, CORS, static allowlist, JSON errors
    routes/             API endpoint mapping
    controllers/        Request parameter extraction
    services/           Cluster reads, tool probes, workflow composition
    repositories/       Allowlisted workflow loading
packages/
  connectors/           Kubernetes/Prometheus reads, OTLP HTTP exporter
  providers/            Live collector and explicitly labelled demo
  contracts/            OpenAPI JSON and YAML
  toolchain/            22-tool catalog and bundled icons
workflows/              Five editable tool graph definitions
infra/
  terraform/bootstrap/  Existing cluster -> Argo CD Helm release
  ansible/              Existing Ubuntu host preparation
  local/                k3d cluster
  helm/control-api/     Application, RBAC, probes, optional ingress
  gitops/platform/      Platform Argo CD Applications
  environments/local/  Promoted application image values
  monitoring/           Metrics, alert rules, data sources
  observability/        Logs and traces
  security/             Secret sync, TLS example, audit policy
  backup/               Optional S3 backup profile
  compose/              Local container preview
scripts/                Bootstrap, promotion, secrets and validation
```

## Integration API

```text
GET /api/v1/toolchain
GET /api/v1/tools/{id}/status
GET /api/v1/workflows
GET /api/v1/workflows/{system|delivery|infrastructure|observability|api-request}
GET /api/v1/topology
GET /api/v1/cluster/{snapshot|nodes|workloads|events}
GET /api/v1/alerts
GET /api/v1/integrations
GET /api/v1/openapi
```

Request -> operator authentication -> route -> controller/service -> server-side connector -> JSON response. Graph edits remain local until you export and commit them. The API does not restart, delete or deploy workloads.

Live mode needs an operator token of at least 32 characters, real endpoints and server-side credential/CA files. Copy `.env.example` to `.env`, edit it, then run:

```bash
node --env-file=.env apps/control-api/src/server.mjs
```

For local multi-cluster access, set `KUBECONFIG_ENABLED=true` and provide one or more files through the standard `KUBECONFIG` environment variable (`;` separates files on Windows and `:` on Linux). The dashboard lists merged contexts and follows kubeconfig file changes every five seconds. Credentials remain in the server process; only context names and collected Kubernetes inventory reach the browser.

Use **API connection** in the editor to enter the operator token. Extra settings are in `.env.tools.example`. Observations distinguish `definition`, `sample`, `not-configured`, `available` and `unavailable`. A configuration file is never evidence that a service is running.

## Infrastructure scope

The target is local **k3d or an existing Kubernetes cluster**. Terraform bootstraps Argo CD; it does not create cloud VMs, networks or managed clusters. Ansible prepares existing Ubuntu hosts; it does not create machines or install a Kubernetes distribution. A cloud provider/account was not specified.

CI builds and scans an image, then publishes `ghcr.io/<owner>/<repo>:sha-<full-commit>`. Promote that image in Git; Argo CD reconciles the reviewed desired state. Platform charts have pinned versions and SHA-256 hashes in `infra/toolchain.lock.json`.

See **docs/DEPLOYMENT.md** for bootstrap, secret sync, image promotion, TLS, backup and rollback. The starter profile uses single-instance logs/traces and local persistent storage. Set real storage, replicas, domain/ingress, identity, alert receivers and backup credentials for the target environment. Velero remains disabled until its bucket and credentials are configured.

## Verify

```bash
npm run check
npm test
python3 -m pip install -r requirements-dev.txt
npm run validate
npm run verify:charts
```

Helm is required for infrastructure validation. Chart verification downloads official pinned charts, verifies hashes and renders them without changing a cluster. Terraform/Ansible checks also run in CI. See `docs/VERIFICATION.md` for performed checks and their limits.

## Contribute

Start with one small improvement and open a pull request against `dev`. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for the review workflow and ideas for follow-up work.
