#!/usr/bin/env python3
"""Rebuilds particle-present/assets/template.html from the editable sources in src/ and the shared modules.

usage: python3 tools/build_template.py [--check]

src/head.html, src/style.css, src/body.html (with <!-- @SLIDES@ -->), src/light.js (the WebGL light engine), src/app.js (the deck:
navigation, light image, finale, adapters; its "// @MODULES@" line receives the modules) and src/fonts.css are joined into the
template source (the JSON string in <script id="deck-src">). The four presenter modules in particle-present/assets/modules/ come
from Cinematic Deck Designer and are inlined unchanged. The sample slides (particle-present/examples/sample_slides.html) are then
poured in with scripts/make_deck.py, exactly as a user's deck is built, and the offline file replaces assets/template.html.
--check builds into a temporary folder and reports whether assets/template.html is up to date, without writing it."""
import json, pathlib, subprocess, sys, tempfile, shutil, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, SKILL = ROOT / 'src', ROOT / 'particle-present'
MODULES = ['speaker-view.js', 'deck-ui.js', 'deck-editor.js', 'deck-save.js']
rd = lambda p: p.read_text(encoding='utf-8')

def source():
    mods = '\n'.join(f'/* ===== {m} (Cinematic Deck Designer, unchanged) ===== */\n' + rd(SKILL / 'assets' / 'modules' / m).rstrip() + '\n' for m in MODULES)
    app = rd(SRC / 'app.js')
    assert app.count('// @MODULES@\n') == 1, 'src/app.js needs one "// @MODULES@" line'
    app = app.replace('// @MODULES@\n', mods)
    body = rd(SRC / 'body.html')
    assert body.count('<!-- @SLIDES@ -->') == 1
    body = body.replace('<!-- @SLIDES@ -->', rd(SKILL / 'examples' / 'sample_slides.html').strip())
    tpl = rd(SRC / 'head.html') + '<style>\n' + rd(SRC / 'style.css') + '</style>\n' + body + '<script>\n' + rd(SRC / 'light.js') + '</script>\n<script>\n' + app + '</script>\n'
    for code in (rd(SRC / 'light.js'), app):
        if re.search(r'</script|<!--', code, re.I): sys.exit('JS must not contain "</script" or "<!--" (it is inlined in the page)')
    for mk in ('/*@FONTS@*/', '"@SRC@"', '"@EDITS@"'): assert tpl.count(mk) == 1, mk
    return tpl

def build(out_dir):
    tpl = source()
    js = json.dumps(tpl, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    proto = out_dir / 'proto.html'
    proto.write_text('<style id="deck-fonts">' + rd(SRC / 'fonts.css') + '</style>\n<script type="application/json" id="deck-src">' + js + '</script>\n', encoding='utf-8')
    subprocess.run([sys.executable, str(SKILL / 'scripts' / 'make_deck.py'), '--template', str(proto), '--slides', str(SKILL / 'examples' / 'sample_slides.html'),
                    '--title', 'ParticlePresent', '--out', str(out_dir / 'out')], check=True, stdout=subprocess.DEVNULL)
    return out_dir / 'out' / 'ParticlePresent - ParticlePresent.html'

if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as d:
        f = build(pathlib.Path(d)); dest = SKILL / 'assets' / 'template.html'
        if '--check' in sys.argv:
            same = dest.exists() and rd(dest) == rd(f); print('template.html is up to date' if same else 'template.html is OUT OF DATE: run python3 tools/build_template.py'); sys.exit(0 if same else 1)
        shutil.copyfile(f, dest); print(f'wrote {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)')
