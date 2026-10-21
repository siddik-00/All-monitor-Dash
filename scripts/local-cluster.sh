#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v k3d >/dev/null
command -v kubectl >/dev/null
k3d cluster create --config infra/local/k3d.yaml
kubectl --context k3d-devops-workflow get nodes
