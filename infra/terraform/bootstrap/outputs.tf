output "argocd_namespace" {
  value = helm_release.argocd.namespace
}
output "next_step" {
  value = "Configure your Git repo in infra/gitops/platform/values.yaml, then run scripts/bootstrap-platform.sh REPO_URL."
}
