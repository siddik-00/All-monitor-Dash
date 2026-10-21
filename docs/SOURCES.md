# Primary configuration references

The implementation uses pinned chart packages and their actual values/templates. Upgrade values together with the lock file and run chart rendering again.

- [Argo CD Helm sources and value files](https://argo-cd.readthedocs.io/en/stable/user-guide/helm/)
- [Argo CD sync phases and waves](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/)
- [Terraform Helm provider](https://registry.terraform.io/providers/hashicorp/helm/3.2.0/docs)
- [OpenTelemetry Collector Helm chart](https://opentelemetry.io/docs/platforms/kubernetes/helm/collector/)
- [Loki Helm configuration](https://grafana.com/docs/loki/latest/setup/install/helm/)
- [Alloy Kubernetes log collection](https://grafana.com/docs/alloy/latest/collect/logs-in-kubernetes/)
- [External Secrets Kubernetes source provider](https://external-secrets.io/latest/provider/kubernetes/)
- [cert-manager Helm installation](https://cert-manager.io/docs/installation/helm/)
- [Velero chart and provider configuration](https://github.com/vmware-tanzu/helm-charts/tree/main/charts/velero)

The pinned Loki 7.3.0 chart uses `deploymentMode: SingleBinary`. Do not substitute a value from an unpinned newer documentation version without checking its rendered workloads.
