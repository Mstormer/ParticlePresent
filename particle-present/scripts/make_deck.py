#!/usr/bin/env python3
"""ParticlePresent builder: pours new slides into the ParticlePresent template (any ParticlePresent deck .html works as the template).

usage: python3 make_deck.py --template "Template - ParticlePresent.html" --slides slides.html --title "My Talk"
                            [--settings settings.json] [--edits saved_edits.json] [--out out_dir]
writes <out>/deck.html (Artifact page content) and <out>/<Title> - ParticlePresent.html (offline file).
slides.html holds only <section class="slide" ...> blocks (with <aside class="notes">). data-cue is added
automatically unless an element already has one."""
import re, json, html, sys, argparse, pathlib

ap = argparse.ArgumentParser()
ap.add_argument('--template', required=True); ap.add_argument('--slides', required=True); ap.add_argument('--title', required=True)
ap.add_argument('--settings'); ap.add_argument('--edits', help='a saved deck-edits JSON to carry forward (user edits)'); ap.add_argument('--out', default='.')
A = ap.parse_args()
page = pathlib.Path(A.template).read_text(encoding='utf-8')
m = re.search(r'<script type="application/json" id="deck-src">(.*?)</script>', page, re.S)
if not m: sys.exit('Template has no deck-src block: use a ParticlePresent deck .html file.')
tpl = json.loads(m.group(1))
fonts = re.search(r'<style id="deck-fonts">(.*?)</style>', page, re.S).group(1)
slides = pathlib.Path(A.slides).read_text(encoding='utf-8').strip()

# ---- swap the slides and the title into the template
a = tpl.index('<section class="slide"'); b = tpl.rindex('</section>', a, tpl.index('<div id="hov"')) + len('</section>')  # slides end before the editor overlays
tpl = tpl[:a] + '\n' + slides + '\n' + tpl[b:]
tpl = re.sub(r'<title>.*?</title>', lambda _: '<title>' + html.escape(A.title) + '</title>', tpl, count=1)
tpl = re.sub(r'(id="stage"[^>]*aria-label=")[^"]*"', lambda mm: mm.group(1) + html.escape(A.title, quote=True) + '"', tpl, count=1)

# ---- voice cues: words that appear where each slide / build begins and were not just spoken before it
STOP = set("""a an the and or but if then than that this those these there their they them he she it its his her we our us you your i me my mine
is are was were be been being am do does did doing have has had having not no nor so too very just only also even still yet of in on at by for from to into
onto over under up down out off with without about above below between through during before after again further once here when where why how all any both
each few more most other some such own same can will would should could may might must shall let lets thats theres heres whats whos isnt didnt doesnt dont
wont cant couldnt wouldnt shouldnt wasnt werent hasnt havent hadnt im ive id youre theyre what which who whom whose because while until though although
as like really one ones thing things way get got make made said say says know now new well want every much many back first last""".split())
GENERIC = set("""tell write think time work people good form given means used come start realized right never true kind need stay whole among comes build
anything today study simply called question answer hand shows nearly thousand notice asked perhaps point itself clear least front
group designed different second better person place part sure going take takes took gave give gives keep went makes help helps
yourself something someone everyone instead around always often again since might started enough little great years""".split())
def spoken(notes):
    t = re.sub(r'<em class="dir">.*?</em>', ' ', notes, flags=re.S); return html.unescape(re.sub(r'<[^>]+>', ' ', t))
def toks(t):
    t = re.sub(r'\[[^\]]*\]', ' ', t); t = re.sub(r'\([^)]*\)', ' ', t); t = t.lower().replace('’', '').replace("'", '')
    t = re.sub(r'(\d),(?=\d{3})', r'\1', t); return [w for w in re.split(r'[^a-z0-9]+', t) if w]
same = lambda x, y: x == y or (len(x) >= 5 and len(y) >= 5 and (x.startswith(y) or y.startswith(x)))
sec_re = re.compile(r'(<section class="slide[^"]*" id="([^"]+)"[^>]*>)(.*?)(</section>)', re.S)
secs = [(mm.group(2), mm.group(1), mm.group(3)) for mm in sec_re.finditer(tpl)]
if len({s[0] for s in secs}) != len(secs): sys.exit('Slide ids must be unique.')
sp = {sid: spoken((re.search(r'<aside class="notes">(.*?)</aside>', inner, re.S) or [None, ''])[1]) for sid, _, inner in secs}
DF = {}
for sid in sp:
    for w in set(toks(sp[sid])): DF[w] = DF.get(w, 0) + 1
def pick(window, banned, n, maxdf=2, strict=True):
    out = []
    for w in window:
        if w in STOP or (strict and w in GENERIC) or (len(w) < 4 and not w.isdigit()) or DF.get(w, 0) > maxdf: continue
        if any(same(w, x) for x in banned) or any(same(w, o) for o in out): continue
        out.append(w)
        if len(out) >= n: break
    return out
arrive, pulls, report = {}, {}, []
for i, (sid, head, inner) in enumerate(secs):
    parts = sp[sid].split('[BUILD]')
    if i:
        banned = set(toks(sp[secs[i - 1][0]].split('[BUILD]')[-1]))
        w = pick(toks(parts[0])[:40], banned, 5) or pick(toks(parts[0]), banned, 5, 99, False)
        pre = re.search(r'data-cue="([^"]*)"', head)
        if pre: w = [x.strip() for x in pre.group(1).split(',') if x.strip()]
        arrive[sid] = w; report.append(f'{i + 1:2d} {sid:16s} -> {", ".join(w) or "(none: clicker only)"}')
    for k in range(1, len(parts)):
        w = pick(toks(parts[k])[:16], set(toks(parts[k - 1])), 4, 3) or pick(toks(parts[k]), set(toks(parts[k - 1])), 3, 99, False)
        el = re.search(rf'<[^>]*data-step="{k}"[^>]*>', inner); pre = el and re.search(r'data-cue="([^"]*)"', el.group(0))
        if pre: w = [x.strip() for x in pre.group(1).split(',') if x.strip()]
        pulls[(sid, k)] = w; report.append(f'      {sid}:{k} -> {", ".join(w) or "(none: clicker only)"}')
    steps = sorted({int(x) for x in re.findall(r'data-step="(\d+)"', inner)})
    if steps and steps != list(range(1, len(steps) + 1)): report.append(f'  !! {sid}: data-step values must run 1..n, found {steps}')
    if len(parts) - 1 != len(steps): report.append(f'  !! {sid}: {len(parts) - 1} [BUILD] markers but {len(steps)} build steps')
def add_cues(mm):
    open_tag, sid, inner, close = mm.group(1), mm.group(2), mm.group(3), mm.group(4)
    if sid in arrive and 'data-cue=' not in open_tag:
        open_tag = open_tag.replace(f'id="{sid}"', f'id="{sid}" data-cue="{", ".join(arrive[sid])}"', 1)
    for k in sorted({int(x) for x in re.findall(r'data-step="(\d+)"', inner)}):
        first = re.search(rf'<[^>]*data-step="{k}"[^>]*>', inner)
        if first and 'data-cue=' not in first.group(0):
            inner = inner[:first.start()] + first.group(0).replace(f'data-step="{k}"', f'data-step="{k}" data-cue="{", ".join(pulls.get((sid, k), []))}"', 1) + inner[first.end():]
    return open_tag + inner + close
tpl = sec_re.sub(add_cues, tpl)
print('\n'.join(report))

# ---- assemble
M_FONTS, M_SRC, M_EDITS = '/*@FONTS@*/', '"@SRC@"', '"@EDITS@"'
for mk in (M_FONTS, M_SRC, M_EDITS): assert tpl.count(mk) == 1, mk
js = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
fx = {"speed": 1.5, "morph": 1.5, "bright": 1, "glow": 2, "bg": 1.25, "quality": "high", "bar": True}
if A.settings: fx.update(json.loads(pathlib.Path(A.settings).read_text()))
edits = {"stamp": "", "state": {"fx": fx}}
if A.edits:
    edits = json.loads(pathlib.Path(A.edits).read_text()); edits.setdefault("state", {}).setdefault("fx", fx)
out = tpl.replace(M_FONTS, fonts).replace(M_SRC, js(tpl)).replace(M_EDITS, js(edits))
od = pathlib.Path(A.out); od.mkdir(parents=True, exist_ok=True)
(od / 'deck.html').write_text(out, encoding='utf-8')
safe = re.sub(r'[\\/:*?"<>|]+', '', A.title).strip() or 'Presentation'
(od / f'{safe} - ParticlePresent.html').write_text('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n' + out + '\n</body>\n</html>\n', encoding='utf-8')
print(f'{len(secs)} slides; wrote {od / "deck.html"} and {od / (safe + " - ParticlePresent.html")} ({len(out.encode()) // 1024} KB)')
