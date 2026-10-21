variable "kubeconfig_path" {
  description = "Existing kubeconfig on the operator workstation."
  type        = string
  default     = "~/.kube/config"
}
variable "kube_context" {
  description = "Explicit kubeconfig context; do not bootstrap an unintended cluster."
  type        = string
  validation {
    condition     = length(trimspace(var.kube_context)) > 0
    error_message = "Set kube_context to the intended existing Kubernetes context."
  }
}
