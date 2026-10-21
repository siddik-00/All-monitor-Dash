#!/usr/bin/env python3
"""Fast offline structural validation. Chart rendering is a separate check."""
from pathlib import Path
import json,re
import yaml
root=Path(__file__).resolve().parents[1]
for file in root.rglob('*.yaml'):
    if 'templates' in file.parts:continue
    list(yaml.safe_load_all(file.read_text()))
for file in root.rglob('*.json'):json.loads(file.read_text())
catalog=json.loads((root/'packages/toolchain/catalog.json').read_text())['tools'];ids={t['id'] for t in catalog}
assert len(ids)==len(catalog)==22
for tool in catalog:
    assert re.fullmatch(r'#[0-9a-fA-F]{6}',tool['color'])
    assert all((root/path).is_file() for path in tool['configPaths']),tool['id']
    assert (root/'packages/toolchain/icons'/f"{tool['id']}.svg").is_file()
for file in (root/'workflows').glob('*.json'):
    data=json.loads(file.read_text());node_ids={n['id'] for n in data['nodes']}
    assert all(n['tool'] in ids for n in data['nodes'])
    assert all(e['source'] in node_ids and e['target'] in node_ids for e in data['edges'])
    for node in data['nodes']:assert (root/node['codePath']).exists()
lock=json.loads((root/'infra/toolchain.lock.json').read_text())['charts']
values=yaml.safe_load((root/'infra/gitops/platform/values.yaml').read_text())
for component in values['components'].values():
    assert lock[component['chart']]['version']==component['version']
    assert (root/component['valuesFile']).is_file()
assert json.loads((root/'packages/contracts/openapi.json').read_text())==yaml.safe_load((root/'packages/contracts/openapi.yaml').read_text())
assert not list(root.rglob('*.pdf'))
print('YAML, JSON, tool config paths, workflows, chart pins and OpenAPI consistency passed.')
