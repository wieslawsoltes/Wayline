#!/usr/bin/env python3
"""Produce a portable, dependency-free, single-file HTML application."""
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parent
modules = ['core.js', 'icons.js', 'engine.js', 'basemap.js', 'services.js', 'app.js']
source = []
for module in modules:
    code = (ROOT / 'src' / module).read_text()
    code = re.sub(r'^import .+?;\s*$', '', code, flags=re.MULTILINE)
    code = re.sub(r'\bexport\s+(?=(?:const|let|function|class|async)\b)', '', code)
    source.append(f'\n// ── {module} ──\n{code}')
html = (ROOT / 'index.dev.html').read_text()
css = (ROOT / 'src/styles.css').read_text()
html = html.replace('<link rel="stylesheet" href="src/styles.css">', f'<style>\n{css}\n</style>')
script = '\n'.join(source).replace('</script', '<\\/script')
html = html.replace('<script type="module" src="src/app.js"></script>', f'<script type="module">\n{script}\n</script>')
(ROOT / 'index.html').write_text(html)
print(f'Built index.html: {len(html.encode()):,} bytes. No build or runtime dependencies.')
