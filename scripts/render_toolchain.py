#!/usr/bin/env python3
"""Download pinned official charts, verify hashes, and render without a cluster."""
import argparse,hashlib,json,os,shutil,subprocess,tempfile
from pathlib import Path
from urllib.request import urlopen
import yaml
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--cache-dir',type=Path,default=Path(tempfile.gettempdir())/'devops-toolchain-charts');args=p.parse_args();args.cache_dir.mkdir(parents=True,exist_ok=True)
helm=shutil.which(os.environ.get('HELM','helm'))
if not helm:raise SystemExit('Helm must be installed; set HELM to its executable path.')
lock=json.loads((root/'infra/toolchain.lock.json').read_text())['charts'];values=yaml.safe_load((root/'infra/gitops/platform/values.yaml').read_text())
components=list(values['components'].values())+[{'chart':'argo-cd','releaseName':'argocd','namespace':'argocd','valuesFile':'infra/gitops/argocd-values.yaml'}]
for component in components:
    name=component['chart'];pin=lock[name];archive=args.cache_dir/f"{name}-{pin['version']}.tgz"
    if not archive.exists():
        if pin.get('oci'):
            subprocess.run([helm,'pull',pin['oci'],'--version',pin['version'],'--destination',str(args.cache_dir)],check=True,capture_output=True)
        else:
            index=yaml.safe_load(urlopen(pin['repo']+'/index.yaml',timeout=45).read());row=next(x for x in index['entries'][name] if x['version']==pin['version']);url=row['urls'][0];url=url if url.startswith('https:') else pin['repo']+'/'+url
            archive.write_bytes(urlopen(url,timeout=60).read())
    if not pin.get('sha256') or hashlib.sha256(archive.read_bytes()).hexdigest()!=pin['sha256']:raise SystemExit(f'Chart checksum mismatch: {name}')
    cmd=[helm,'template',component['releaseName'],str(archive),'--namespace',component['namespace'],'--kube-version','1.35.0','-f',str(root/component['valuesFile'])]
    # Optional Velero profile is rendered too; its real credentials/bucket are not used here.
    result=subprocess.run(cmd,text=True,capture_output=True)
    if result.returncode:raise SystemExit(f'{name}: {result.stderr}')
    resources=[d for d in yaml.safe_load_all(result.stdout) if d]
    assert resources and all(d.get('kind') and d.get('apiVersion') for d in resources)
    workloads=[d for d in resources if d['kind'] in ['Deployment','StatefulSet','DaemonSet']]
    assert workloads,f'{name}: no workload was rendered'
    if name=='loki':
        assert any(d['kind']=='StatefulSet' and d['metadata']['name']=='loki' and d['spec'].get('replicas',1)>0 for d in workloads),'Loki storage process is missing'
    if name=='opentelemetry-collector':
        services=[d for d in resources if d['kind']=='Service']
        assert any(any(port['port']==13133 for port in d['spec']['ports']) for d in services),'Collector health port missing'
    print(f"Rendered {name} {pin['version']}: {len(resources)} resources")
print('All pinned tool charts rendered successfully. No cluster resources were changed.')
