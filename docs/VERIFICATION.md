# Verification of this source package

- 28 automated tests passed: API routes, auth/CORS, static allowlist, cluster reads, upstream partial failures, pagination, cache/concurrency, projected token rereading, read-only tool probes, graph validation/editing and OTLP span delivery.
- Native JavaScript syntax checks passed.
- Browser checks passed for five workflows, all 22 tool nodes, inspector file paths, dragging, adding/connecting tools, import/export, local persistence, reset, live-mode login and memory-only operator tokens. No JavaScript console errors occurred in the editor interaction check. The final workflow canvas was visually inspected.
- Eleven actual API responses were checked against their OpenAPI 3.1 JSON Schemas, including toolchain, topology, workflows and cluster endpoints.
- Application Helm chart and platform Application chart rendered. Ten pinned official tool charts rendered with checksum verification; checks also require workloads, the Loki storage process and the Collector health Service port.
- YAML/JSON parsing, workflow references, source/config paths, chart version consistency, SVG XML and OpenAPI JSON/YAML consistency passed.
- Ansible playbook syntax check passed. No remote hosts were changed.
- Terraform formatting and HCL parsing passed. `terraform init` downloaded and verified the signed pinned Helm provider. Full `terraform validate` could not run here because this execution environment blocks the Unix-domain socket used for the provider handshake (`socket: operation not permitted`). The CI workflow runs Terraform validation on its normal runner. No Terraform plan/apply was run.

No customer cluster or cloud account was connected. Docker builds, Trivy scans, GitHub runner execution, registry publication, Argo CD sync and live platform installation were not executed here. Browser live-login testing used a controlled API fixture; it did not indicate that customer services were connected. Real tool probes were tested with injected upstream responses; OTLP delivery was tested with a local HTTP receiver.

The source is an existing-cluster/local platform starter. See DEPLOYMENT.md for the environment-specific bootstrap and production configuration work.
