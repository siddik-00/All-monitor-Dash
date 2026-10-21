#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${KUBE_CONTEXT:?Set KUBE_CONTEXT explicitly}"
umask 077
if [[ -e .secrets/api-token ]]; then echo 'Token already exists locally. Use your rotation procedure.' >&2; exit 1; fi
if kubectl --context "$KUBE_CONTEXT" get secret control-api-source -n platform-secrets >/dev/null 2>&1; then echo 'Source Secret already exists. Use your rotation procedure.' >&2; exit 1; fi
for ns in platform-secrets platform-system monitoring; do
  kubectl --context "$KUBE_CONTEXT" create namespace "$ns" --dry-run=client -o yaml |
    kubectl --context "$KUBE_CONTEXT" apply -f -
done
mkdir -p .secrets
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" > .secrets/api-token
kubectl --context "$KUBE_CONTEXT" create secret generic control-api-source -n platform-secrets --from-file=api-token=.secrets/api-token
if ! kubectl --context "$KUBE_CONTEXT" get secret grafana-admin -n monitoring >/dev/null 2>&1; then
  node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))" > .secrets/grafana-password
  kubectl --context "$KUBE_CONTEXT" create secret generic grafana-admin -n monitoring \
    --from-literal=admin-user=admin --from-file=admin-password=.secrets/grafana-password
fi
echo 'Source credentials created. Apply infra/security/source-secrets.yaml after the External Secrets controller is ready.'
