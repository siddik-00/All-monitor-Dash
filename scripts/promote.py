#!/usr/bin/env python3
"""Write the reviewed image into GitOps values. Does not push Git or deploy."""
import argparse,re
from pathlib import Path
import yaml
p=argparse.ArgumentParser();p.add_argument('--image',required=True);p.add_argument('--tag',required=True);args=p.parse_args()
if not re.fullmatch(r'ghcr\.io/[a-z0-9][a-z0-9_./-]+',args.image):p.error('--image must be your lowercase ghcr.io image repository')
if not re.fullmatch(r'sha-[0-9a-f]{40}',args.tag):p.error('--tag must be the exact sha-<40-character-commit> tag published by CI')
root=Path(__file__).resolve().parents[1];file=root/'infra/environments/local/control-api.yaml';values=yaml.safe_load(file.read_text());values['image']={'repository':args.image,'tag':args.tag};file.write_text(yaml.safe_dump(values,sort_keys=False))
file=root/'infra/gitops/platform/values.yaml';values=yaml.safe_load(file.read_text());values['application']['enabled']=True;file.write_text(yaml.safe_dump(values,sort_keys=False))
print('Updated image values and enabled the application. Review the Git diff, commit, then reconcile Argo CD.')
