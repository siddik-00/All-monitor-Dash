#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
repo_url="${1:?Usage: KUBE_CONTEXT=your-context bash scripts/bootstrap-platform.sh https://github.com/you/repo.git}"
: "${KUBE_CONTEXT:?Set KUBE_CONTEXT explicitly}"
command -v helm >/dev/null
command -v kubectl >/dev/null
helm template devops-platform infra/gitops/platform \
  --namespace argocd --set-string repoURL="$repo_url" \
  --set-string gitRevision="${GIT_REVISION:-main}" |
  kubectl --context "$KUBE_CONTEXT" apply -f -
echo 'Platform Applications created. Sync controllers first, then observability. See docs/DEPLOYMENT.md.'
