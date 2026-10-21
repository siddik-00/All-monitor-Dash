# Deploy the toolchain

Use Bash/WSL2 for infrastructure scripts. Required CLIs: Docker, k3d, kubectl, Helm, Terraform 1.9+, Python with requirements-dev.txt, and optionally the Argo CD/Ansible CLIs.

## 1. Supply a cluster

Use an existing context or create the local cluster:

```bash
bash scripts/local-cluster.sh
export KUBE_CONTEXT=k3d-devops-workflow
kubectl --context "$KUBE_CONTEXT" get nodes
```

The local cluster has one server and two agents. Access uses port-forwarding. Domain exposure requires an existing ingress controller plus your chart ingress class, hostname and TLS Secret. Ansible is optional host preparation for existing Ubuntu 22.04+ machines; skip it for k3d/managed clusters. Put real hosts in a private inventory:

```bash
cd infra/ansible
ansible-playbook -i /path/to/inventory.yaml site.yaml --check --diff
ansible-playbook -i /path/to/inventory.yaml site.yaml
```

## 2. Bootstrap Argo CD

From the repository root:

```bash
terraform -chdir=infra/terraform/bootstrap init
terraform -chdir=infra/terraform/bootstrap plan -var="kube_context=$KUBE_CONTEXT" -out=bootstrap.tfplan
terraform -chdir=infra/terraform/bootstrap apply bootstrap.tfplan
```

Terraform owns this bootstrap release. Argo CD owns the child Applications. Default Terraform state is local; configure protected remote state for team use. Keep state and credentials outside Git.

## 3. Create source credentials

```bash
KUBE_CONTEXT="$KUBE_CONTEXT" bash scripts/create-secrets.sh
```

This generates an ignored local API token and `platform-secrets/control-api-source`, plus Grafana admin credentials if absent. It prints no credential values and stops if the API token already exists. The External Secrets example uses Kubernetes as its source store, avoiding a cloud secret service dependency in the local profile. Replace the SecretStore provider with your chosen secret service/workload identity for the real environment.

## 4. Register and sync platform tools

Push this source to your own Git repository. Set `repoURL` and revision in `infra/gitops/platform/values.yaml`, commit, and configure private-repository authentication in Argo CD if needed.

```bash
KUBE_CONTEXT="$KUBE_CONTEXT" bash scripts/bootstrap-platform.sh https://github.com/YOUR_ORG/YOUR_REPO.git
kubectl --context "$KUBE_CONTEXT" -n argocd port-forward svc/argocd-server 8443:443
```

Log in to Argo CD with its bootstrap administrator credential. Sync and wait in this order through its UI or CLI:

```bash
argocd app sync cert-manager external-secrets kyverno
argocd app wait cert-manager external-secrets kyverno --health --timeout 900
argocd app sync observability loki tempo
argocd app wait observability loki tempo --health --timeout 900
argocd app sync otel-collector alloy
argocd app wait otel-collector alloy --health --timeout 900
kubectl --context "$KUBE_CONTEXT" apply -f infra/security/source-secrets.yaml
kubectl --context "$KUBE_CONTEXT" -n platform-system wait externalsecret/control-api-auth --for=condition=Ready --timeout=180s
kubectl --context "$KUBE_CONTEXT" apply -f infra/security/policies.yaml
```

Applications use manual sync and no automatic pruning. Commands explicitly wait for controllers before consumers. External Secrets creates the target `platform-system/control-api-auth` Secret. Kyverno starts in Audit mode for application pods. The optional local certificate manifest is self-signed for `workflow.local`; it does not issue a public certificate.

## 5. Publish and promote the application

GitHub Actions validates and scans code/infrastructure, builds the image, scans that image, and publishes the scanned image on main-branch pushes. Supply package permissions/visibility or an imagePullSecret for your registry. A failed scan stops publication.

After CI publishes, use the real lowercase repository and full commit tag:

```bash
python3 scripts/promote.py --image ghcr.io/your_org/your_repo --tag sha-FULL_40_CHARACTER_LOWERCASE_COMMIT
```

The script updates image values and enables the application. Review the Git diff, commit/push, then run bootstrap-platform.sh again to create/update the control-api Application.

```bash
argocd app sync control-api
argocd app wait control-api --health --timeout 600
kubectl --context "$KUBE_CONTEXT" -n platform-system port-forward svc/control-api 8080:8080
```

Open http://localhost:8080/canvas/ and enter the operator token using API connection. The chart sets internal monitoring and OTLP URLs. Argo CD probing is off until you supply its read-only token and trusted CA. Additional tool settings are in .env.tools.example.

## 6. Operate and recover

Grafana has Prometheus, Loki and Tempo data sources. Alloy collects pod logs. The Collector accepts the API's HTTP spans. Alertmanager defaults to a null receiver; configure your actual notification destination before relying on alerts.

Velero is disabled until its values contain a real bucket/region and `velero-cloud-credentials` exists. The profile uses node-agent filesystem backups with snapshots disabled. Confirm plugin/storage compatibility, test a backup and verify a restore before enabling the schedule.

Rollback the application by reverting the image promotion commit and syncing. For platform releases, restore the previous pinned chart and values in Git and reconcile that Application.

This is a local/existing-cluster starter. Set real object storage, storage classes, replicas, DNS/ingress, identity, alert receiver and backups for the target environment. Cloud resources, image publication and live cluster reconciliation were not executed while preparing this source.
