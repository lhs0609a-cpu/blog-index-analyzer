"""Rename product-facing copy; keep domains, billing IDs and persisted keys stable."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
roots = ['frontend/app', 'frontend/components', 'frontend/lib', 'frontend/public',
         'flyio-backend/routers', 'flyio-backend/services', 'chrome-extension']
extensions = {'.ts', '.tsx', '.js', '.json', '.html', '.svg', '.css', '.py', '.md'}
changed = []
for root in roots:
    for path in (ROOT / root).rglob('*'):
        if not path.is_file() or path.suffix not in extensions:
            continue
        original = path.read_text(encoding='utf-8')
        text = original.replace('블랭크', '블스피')
        if root.startswith('frontend'):
            text = text.replace('BlankLogo', 'BlspiLogo').replace('BlankMark', 'BlspiMark')
            text = text.replace('WHY BLANK', 'WHY BLSPI').replace('>BLANK<', '>BLSPI<')
            text = text.replace("'BLANK'", "'BLSPI'").replace('(BLANK)', '(BLSPI)')
        if root == 'chrome-extension':
            text = text.replace('Blrank', 'Blspi')
        if text != original:
            path.write_text(text, encoding='utf-8', newline='\n')
            changed.append(str(path.relative_to(ROOT)))
logo = ROOT / 'frontend/components/BlankLogo.tsx'
if logo.exists():
    logo.rename(logo.with_name('BlspiLogo.tsx'))
for name in ['package.json', 'package-lock.json']:
    path = ROOT / 'frontend' / name
    if path.exists():
        original = path.read_text(encoding='utf-8')
        text = original.replace('blank-frontend', 'blspi-frontend').replace('블랭크', '블스피')
        if text != original:
            path.write_text(text, encoding='utf-8', newline='\n')
            changed.append(str(path.relative_to(ROOT)))
print(json.dumps({'changed': changed}, ensure_ascii=False))
