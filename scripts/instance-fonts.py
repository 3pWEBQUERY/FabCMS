"""
Fixes the soft axis of Fraunces at SOFT=100 – the only value the Bistro style
uses – and keeps the weight axis. The result is about 40 % smaller than the
@fontsource «soft» file and is what Bistro loads (fonts/, see src/site/fonts.ts).

Run after updating @fontsource-variable/fraunces:
  pip install fonttools brotli && python3 scripts/instance-fonts.py
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

root = Path(__file__).resolve().parent.parent
src = root / 'node_modules/@fontsource-variable/fraunces/files'
for subset in ('latin', 'latin-ext'):
    for style in ('normal', 'italic'):
        font = TTFont(src / f'fraunces-{subset}-soft-{style}.woff2')
        font = instancer.instantiateVariableFont(font, {'SOFT': 100})
        font.flavor = 'woff2'
        out = root / 'fonts' / f'fraunces-{subset}-soft100-{style}.woff2'
        font.save(out)
        print(out.name, out.stat().st_size)
