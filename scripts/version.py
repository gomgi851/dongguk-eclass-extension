"""Start a new changelog entry and synchronize extension version labels."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2 or not re.fullmatch(r'\d+\.\d+\.\d+', sys.argv[1]):
    raise SystemExit('Usage: npm run version -- X.Y.Z')
version = sys.argv[1]
manifest_path = root / 'extension/manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
old = manifest['version']
if tuple(map(int, version.split('.'))) <= tuple(map(int, old.split('.'))):
    raise SystemExit('Version must increase')
manifest['version'] = version
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
for name in ['package.json', 'package-lock.json']:
    path = root / name
    if not path.exists():
        continue
    data = json.loads(path.read_text(encoding='utf-8'))
    data['version'] = version
    if name == 'package-lock.json':
        data['packages']['']['version'] = version
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
for relative in ['extension/dashboard.html', 'extension/사용방법.md', 'docs/USAGE.md']:
    path = root / relative
    path.write_text(path.read_text(encoding='utf-8').replace('v' + old, 'v' + version), encoding='utf-8')
date = datetime.now(timezone(timedelta(hours=9))).date().isoformat()
path = root / 'CHANGELOG.md'
text = path.read_text(encoding='utf-8')
text = text.replace('# 업데이트 내역\n', f'# 업데이트 내역\n\n## {version} · {date}\n\n- 변경 내용을 작성하세요.\n', 1)
path.write_text(text, encoding='utf-8')
(root / 'extension/CHANGELOG.md').write_text(text, encoding='utf-8')
print(f'{old} -> {version}. Fill out CHANGELOG.md before packaging.')
