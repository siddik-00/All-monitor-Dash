#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run check
npm test
python3 scripts/validate_infra.py
for script in scripts/*.sh; do bash -n "$script"; done
helm template control-api infra/helm/control-api \
  --namespace platform-system \
  --set image.repository=ghcr.io/example/control-api \
  --set image.tag=sha-test > /dev/null
helm template devops-platform infra/gitops/platform --namespace argocd \
  --set repoURL=https://github.com/example/devops-system-workflow.git \
  --set application.enabled=true > /dev/null
echo "API checks and Helm rendering passed."
