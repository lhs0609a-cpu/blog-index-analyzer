"""Stage only reviewed app sources for the existing frontend-root Vercel project."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
source = root / 'frontend'
target = root / 'output/blspi-release/frontend'
target.mkdir(parents=True, exist_ok=True)
for name in ['app', 'components', 'lib', 'public', 'types']:
    shutil.copytree(source / name, target / name, dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
for name in ['next-env.d.ts', 'next.config.js', 'package.json', 'package-lock.json', 'postcss.config.js',
             'tailwind.config.js', 'tsconfig.json', 'vercel.json', '.eslintrc.json', '.eslintignore', '.vercelignore']:
    shutil.copy2(source / name, target / name)
(target.parent / '.vercelignore').write_text('**/node_modules/**\n**/.next*/**\n**/.env*\n**/*.log\n', encoding='utf-8')
print(f'Staged {sum(1 for p in target.rglob("*") if p.is_file())} source files at {target.parent}')
