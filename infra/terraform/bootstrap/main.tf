provider "helm" {
  kubernetes = {
    config_path    = pathexpand(var.kubeconfig_path)
    config_context = var.kube_context
  }
}

# The cluster is supplied by k3d or your existing provider. Terraform owns this
# bootstrap release; Argo CD owns the child applications in infra/gitops/platform.
resource "helm_release" "argocd" {
  name             = "argocd"
  namespace        = "argocd"
  create_namespace = true
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  version          = "10.10.5"
  atomic           = true
  timeout          = 900
  values           = [file("${path.module}/../../gitops/argocd-values.yaml")]
}
