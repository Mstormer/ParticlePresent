(() => {
/* ---------- the shared presenter modules, inlined here by tools/build_template.py from particle-present/assets/modules/ (unchanged) ---------- */
// @MODULES@

const $ = s => document.querySelector(s);
const vp = $('#viewport'), stage = $('#stage');
const slides = [...stage.querySelectorAll('.slide')];
const N = slides.length;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const OFFLINE = location.protocol === 'file:';
const HOSTED = !!(window.claude && typeof window.claude.use === 'function');

/* ---------- what this deck remembers: edits saved in the file, plus a working copy in this browser ---------- */
const DEF_FX = { speed: 1, morph: 1, bright: 1, glow: 1, bg: 1, quality: 'auto', bar: true };
const readJSON = id => { try { return JSON.parse(document.getElementById(id).textContent); } catch (e) { return null; } };
// the edit state uses the shared shape of the deck modules: { fx, slides: { <id>: { els: { <data-e>: { x, y, s, w, hide, html } }, notes, img, names } }, timing: { wpm, auto, over } }
// (decks saved before the modules had the same shape, minus timing.auto: their builds always came on their own with voice off, so auto defaults to true)
const tidyTiming = t => { t = t && typeof t === 'object' ? t : null; return { wpm: +(t && t.wpm) || 140, auto: t && typeof t.auto === 'boolean' ? t.auto : true, over: t && t.over && typeof t.over === 'object' ? t.over : {} }; };
const tidy = s => { s = s && typeof s === 'object' ? JSON.parse(JSON.stringify(s)) : {}; s.fx = Object.assign({}, DEF_FX, s.fx || {}); s.slides = s.slides && typeof s.slides === 'object' ? s.slides : {};
  if (!s.timing) { try { const o = JSON.parse(localStorage.getItem('bi-timing-v1') || 'null'); if (o && typeof o === 'object') s.timing = o; } catch (e) {} }   // the oldest decks kept timing per browser
  s.timing = tidyTiming(s.timing); return s; };
const EMB = readJSON('deck-edits') || {};
let base = typeof EMB.stamp === 'string' ? EMB.stamp : '';
const wkey = () => 'bi-work-v1:' + base;
let state = tidy(EMB.state), restored = false;
try { const w = JSON.parse(localStorage.getItem(wkey()) || 'null'); if (w && w.state) { state = tidy(w.state); restored = !!(w.state.slides && Object.keys(w.state.slides).length); } } catch (e) {}
let persistT;
function persistNow() { clearTimeout(persistT); try { localStorage.setItem(wkey(), JSON.stringify({ t: Date.now(), state })); } catch (e) {} }
const persist = () => { clearTimeout(persistT); persistT = setTimeout(persistNow, 250); };

/* ---------- stage scaling: the light fills the screen; the 16:9 typography is scaled to fit and centered ---------- */
let scale = 1;
function fit() {
  const w = vp.clientWidth || innerWidth, h = vp.clientHeight || innerHeight;
  scale = Math.min(w / 1920, h / 1080);
  const ox = (w - 1920 * scale) / 2, oy = (h - 1080 * scale) / 2;
  stage.style.transform = `translate(${ox}px,${oy}px) scale(${scale})`;
  document.documentElement.style.setProperty('--inv', (1 / scale).toFixed(4));
  Light.resize({ vw: w, vh: h, scale, ox, oy });
}
addEventListener('resize', fit);
document.addEventListener('fullscreenchange', fit);
if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(vp);
(function watchDpr() { try { const mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); const h = () => { fit(); watchDpr(); }; if (mq.addEventListener) mq.addEventListener('change', h, { once: true }); else mq.addListener(h); } catch (e) {} })();

/* ---------- editable elements: remember each one's original markup and placement ---------- */
const ELS = [...stage.querySelectorAll('[data-e]')];
const PR = new Map(); ELS.forEach(el => PR.set(el, { html: el.innerHTML, style: el.getAttribute('style'), count: el.hasAttribute('data-count') }));
const slideOf = el => el.closest('.slide');
const isLeaf = el => !el.querySelector('[data-e]') && !el.matches('.animalname') && el.textContent.trim().length > 0;
const blockOf = el => { let b = el; for (let p = el.parentElement; p && p !== stage; p = p.parentElement) if (p.matches('[data-e]')) b = p; return b; };
const sEd = (sid, make) => state.slides[sid] || (make ? (state.slides[sid] = {}) : null);
function eEd(el, make) { const sd = sEd(slideOf(el).id, make); if (!sd) return null; if (!sd.els) { if (!make) return null; sd.els = {}; } return sd.els[el.dataset.e] || (make ? (sd.els[el.dataset.e] = {}) : null); }
function iEd(sid, make) { const sd = sEd(sid, make); if (!sd) return null; return sd.img || (make ? (sd.img = {}) : null); }
function prune() {
  for (const [sid, sd] of Object.entries(state.slides)) {
    if (sd.els) { for (const [k, e] of Object.entries(sd.els)) { for (const f of Object.keys(e)) if (e[f] === undefined || e[f] === null || (f !== 'html' && f !== 'hide' && (f === 's' ? +e[f] === 1 : +e[f] === 0))) delete e[f]; if (!Object.keys(e).length) delete sd.els[k]; } if (!Object.keys(sd.els).length) delete sd.els; }
    if (sd.img) { const m = sd.img; for (const f of Object.keys(m)) if (m[f] === undefined || ((f === 's' || f === 'speed' || f === 'bright' || f === 'glow') ? +m[f] === 1 : f === 'rays' ? m[f] === null : +m[f] === 0)) delete m[f]; if (!Object.keys(m).length) delete sd.img; }
    if (!Object.keys(sd).length) delete state.slides[sid];
  }
}

/* ---------- headline words: masked, word-by-word reveal ---------- */
function splitWords(el) {
  let i = 0;
  const walk = node => {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const part of ch.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
          const w = document.createElement('span'); w.className = 'w';
          const wi = document.createElement('span'); wi.className = 'wi'; wi.style.setProperty('--i', i++); wi.textContent = part;
          w.appendChild(wi); frag.appendChild(w);
        }
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1 && !ch.classList.contains('w')) walk(ch);
    }
  };
  walk(el);
}

/* ---------- apply edits to an element ---------- */
const APPLIED = new WeakMap();
const srcHTML = el => { const e = eEd(el); return e && typeof e.html === 'string' ? e.html : PR.get(el).html; };
function syncCount(el) {
  const m = el.textContent.trim().match(/^([\s\S]*?)(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/);
  if (!m) { delete el.dataset.count; return; }
  el.dataset.prefix = m[1]; el.dataset.count = m[2].replace(/,/g, ''); el.dataset.suffix = m[3];
}
function applyStyle(el) {
  const e = eEd(el) || {}, pr = PR.get(el);
  if (pr.style === null) el.removeAttribute('style'); else el.setAttribute('style', pr.style);
  if (+e.x || +e.y) el.style.translate = `${+e.x || 0}px ${+e.y || 0}px`;
  if (e.s && +e.s !== 1) el.style.scale = String(+e.s);
  if (+e.w) el.style.width = (+e.w) + 'px';
  el.classList.toggle('ed-hidden', !!e.hide);
}
function renderEl(el, o = {}) {
  if (!el.matches('.animalname')) {
    const html = srcHTML(el), pr = PR.get(el);
    if (o.force || (APPLIED.has(el) ? APPLIED.get(el) !== html : html !== pr.html)) {
      el.innerHTML = html;
      if (pr.count) syncCount(el);
      if (el.hasAttribute('data-type')) delete el.dataset.full;
      if (o.split !== false) { if (el.matches('.rv')) splitWords(el); el.querySelectorAll('.rv').forEach(splitWords); }
    }
    APPLIED.set(el, html);
  }
  applyStyle(el);
}
// before anything animates: apply saved edits, then split headline words
ELS.forEach(el => { if (eEd(el)) renderEl(el, { split: false }); else APPLIED.set(el, PR.get(el).html); });
document.querySelectorAll('.rv').forEach(splitWords);

/* ---------- film grain ---------- */
try {
  const c = document.createElement('canvas'); c.width = c.height = 180; const x = c.getContext('2d'); const d = x.createImageData(180, 180);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255 | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); $('.grain').style.backgroundImage = `url(${c.toDataURL()})`;
} catch (e) {}

/* ---------- small effects: counters, typing ---------- */
let timers = [], token = 0;
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; token++; };
const hiddenStep = el => { const st = el.closest('[data-step]'); return !!(st && !st.classList.contains('shown')); };
const pick = (root, sel) => [...(root.matches && root.matches(sel) ? [root] : []), ...root.querySelectorAll(sel)];
function fmt(el, v) { el.textContent = (el.dataset.prefix || '') + Math.round(v).toLocaleString('en-US') + (el.dataset.suffix || ''); }
function count(el) {
  if (el.dataset.count === undefined) return;
  const target = +el.dataset.count, delay = +(el.dataset.delay || 0), my = token;
  if (reduce || editing()) { fmt(el, target); return; }
  fmt(el, 0);
  later(() => { const t0 = performance.now(), dur = 1600; const tick = n => { if (my !== token) return; const k = Math.min(1, (n - t0) / dur); fmt(el, target * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, delay);
}
function type(el, text, delay, speed) {
  const full = text ?? (el.dataset.full || (el.dataset.full = el.textContent.trim()));
  if (reduce || editing()) { el.textContent = full; return; }
  el.textContent = '';
  const chars = [...full].map(c => { const s = document.createElement('span'); s.className = 'ch'; s.textContent = c; el.appendChild(s); return s; });
  const caret = document.createElement('span'); caret.className = 'caret';
  let i = 0; const step = speed || Math.max(22, Math.min(55, 2600 / chars.length));
  const go = () => { if (i < chars.length) { chars[i].classList.add('v'); chars[i].appendChild(caret); i++; later(go, step); } else if (!el.hasAttribute('data-type')) later(() => caret.remove(), 1400); }; // caret rides inside the last typed character, so it never wraps onto a line of its own, and stays blinking at the end
  later(() => { el.insertBefore(caret, el.firstChild); go(); }, delay ?? +(el.dataset.delay || 0));
}
function effects(root) {
  pick(root, '[data-count]').forEach(el => { if (!hiddenStep(el)) count(el); });
  pick(root, '[data-type]').forEach(el => { if (!hiddenStep(el)) type(el); });
}
function waves(root) {
  if (editing()) return;
  pick(root, '[data-wave]').forEach(el => { if (el !== root && hiddenStep(el)) return; const [x, y, a, d] = el.dataset.wave.split(',').map(Number); if (isFinite(x) && isFinite(y)) later(() => Light.wave(x, y, a || 16), (d || 0) * 1000); });
}

/* ---------- the light image: per-slide placement and particle settings ---------- */
const baseForm = s => { const f = (s.dataset.form || '').split('>')[0].split('@')[0]; if (f && f !== 'none') return f; const st = s.querySelector('[data-form]'); return st ? st.dataset.form.split('>')[0].split('@')[0] : ''; };
const slideXf = s => { const m = iEd(s.id) || {}; return { x: +m.x || 0, y: +m.y || 0, s: +m.s || 1 }; };
function applyFx(s) {
  const g = state.fx, m = (s && iEd(s.id)) || {};
  Light.setFx({ speed: g.speed * (m.speed ?? 1), morph: g.morph, bright: g.bright * (m.bright ?? 1), glow: g.glow, bg: g.bg, quality: g.quality, spotK: m.glow ?? 1, raysI: m.rays ?? null });
  document.body.classList.toggle('nobar', !g.bar);
}
/* forms: "name" or "a>b@2.6" (morph to a now, b after 2.6 s) */
function playForm(spec, s) {
  if (!spec) return;
  spec.split('>').forEach((part, i) => {
    const [name, at] = part.split('@');
    const m = () => Light.morph(name, { xf: slideXf(s), pivot: baseForm(s) });
    if (i === 0 || editing()) m(); else later(m, (+at || 2) * 1000);
  });
}

/* ---------- the naming list (slide: names): real animals with ridiculous names, one after another ---------- */
const ANIMAL_COLOR = { fish: 'var(--sky)', bird: 'var(--leaf)', cat: 'var(--coral)', dog: 'var(--coral)', lion: 'var(--gold)', donkey: 'var(--ink)', camel: 'var(--gold)', rabbit: 'var(--ink)', horse: 'var(--leaf)', butterfly: 'var(--gold)', beetle: 'var(--gold)', bug: 'var(--coral)', shrimp: 'var(--coral)', egg: 'var(--gold)', cow: 'var(--ink)', paw: 'var(--coral)', spider: 'var(--gold)' };
const parseNames = txt => String(txt || '').split(/\n|;/).map(l => l.trim()).filter(Boolean).map(l => { const f = l.split('|').map(x => x.trim()); const a = (f.length > 1 ? f[f.length - 1] : '').toLowerCase(), kind = ANIMAL_COLOR[a] ? a : 'paw';
  return f.length >= 4 ? { he: f[0], tr: f[1], name: f[2], a: kind } : { name: f[0], a: kind }; }).filter(e => e.name);
const namesText = s => { const o = (sEd(s.id) || {}).names; return typeof o === 'string' && o.trim() ? o : (s.dataset.cycle || '').split(';').map(x => x.trim()).filter(Boolean).join('\n'); };
const namesOf = s => parseNames(namesText(s));
function fitName(el, text) { // as large as fits on one line, up to 150px
  const maxW = 1000, base = 150;
  Object.assign(el.style, { fontSize: base + 'px', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: 'none' });
  el.textContent = text; const one = el.offsetWidth || 1;
  const words = text.split(/\s+/); let longest = 1; for (const w of words) { el.textContent = w; longest = Math.max(longest, el.offsetWidth); }
  let size = Math.min(base, base * maxW / one);
  Object.assign(el.style, { fontSize: Math.floor(size) + 'px', whiteSpace: '', display: '', maxWidth: '' });
  el.textContent = text;
}
function showName(s, i, morph, typed) {
  const list = namesOf(s); if (!list.length) return;
  i = ((i % list.length) + list.length) % list.length; cycleIdx = i;
  const e = list[i], an = s.querySelector('.animalname .an'), log = s.querySelector('.namelog');
  if (morph) Light.morph('animal:' + e.a, { xf: slideXf(s), pivot: baseForm(s) });
  if (!an) return;
  if (log && typed && an.dataset.name) { const p = document.createElement('p'); p.textContent = an.dataset.name; p.style.color = ANIMAL_COLOR[an.dataset.a] || 'var(--ink)'; log.prepend(p); while (log.children.length > 4) log.lastChild.remove(); }
  an.dataset.a = e.a; an.style.color = ANIMAL_COLOR[e.a];
  if (e.he) { // Hebrew word with a simple transliteration, the English word beneath
    an.dataset.name = `${e.tr} · ${e.name}`; an.style.fontSize = '';
    an.innerHTML = '<span class="heb"><span class="he" dir="rtl" lang="he"></span><span class="tr"></span></span><span class="en"></span>';
    an.querySelector('.he').textContent = e.he; an.querySelector('.tr').textContent = e.tr; an.querySelector('.en').textContent = e.name;
    an.classList.remove('pop'); void an.offsetWidth; if (typed) an.classList.add('pop');
    return;
  }
  an.dataset.name = e.name;
  fitName(an, e.name);
  if (typed) type(an, e.name, 120, 42); else an.textContent = e.name;
}
function resetNames(s) { const log = s.querySelector('.namelog'); if (log) log.textContent = ''; const an = s.querySelector('.animalname .an'); if (an) delete an.dataset.name; cycleIdx = 0; }
function startCycle(s, from = 0, morph = false) {
  stopCycle();
  showName(s, from, morph, true);
  if (!reduce) cycleT = setInterval(() => showName(s, cycleIdx + 1, true, true), 3400);
}
function stopCycle() { if (cycleT) clearInterval(cycleT); cycleT = null; }

/* ---------- the ending ---------- */
let finT = [];
let qAt = 0, finDue = 0; const Q_MIN = 5000, Q_AUTO = 8000;   // question on screen: at least 5 s, blows away by itself at 8 s
function qWords() { // the question's words, measured at rest (the .w boxes do not move while the words animate in)
  const q = document.querySelector('.slide .finalq'); if (!q) return [];
  return [...q.querySelectorAll('.w')].map(w => { const r = rectOf(w), cs = getComputedStyle(w.querySelector('.wi') || w), fs = parseFloat(cs.fontSize), px = .04 * fs;
    return { text: w.textContent, x: r.x + px, y: r.y, w: r.w - 2 * px, h: r.h - .14 * fs, font: `${cs.fontStyle} ${cs.fontWeight} ${fs}px "Mona Sans", sans-serif`, c: (cs.color.match(/[\d.]+/g) || [242, 245, 240]).slice(0, 3).map(v => v / 255) }; })
    .filter(w => w.w > 1 && w.text.trim());
}
function startFinale() {
  if (editing()) return;
  finT.forEach(clearTimeout); finT = []; qAt = performance.now();
  document.body.classList.add('finale');
  const ws = qWords(); if (ws.length && Light.textForm(ws)) document.body.classList.add('qlight'); else Light.fadeOut();
  finDue = performance.now() + Q_AUTO; finT.push(setTimeout(finale2, Q_AUTO));
}
function disintegrate() { // the question becomes particles (same words, same place) and blows away
  const q = document.querySelector('.slide .finalq'); if (!q || editing()) return false;
  const words = qWords();
  if (!words.length || !Light.dissolve(words)) return false;
  document.body.classList.add('finale2', 'dissolve'); return true;
}
function finale2() { if (!disintegrate()) document.body.classList.add('finale2'); }
function finaleNow() { // "thank you" or a click: bring the ending forward, but never cut the question short
  if (editing() || document.body.classList.contains('finale2')) return;
  if (!document.body.classList.contains('finale')) { startFinale(); }
  const due = performance.now() + Math.max(700, qAt + Q_MIN - performance.now()); if (finDue && finDue <= due) return;
  finT.forEach(clearTimeout); finT = []; finDue = due; finT.push(setTimeout(finale2, due - performance.now()));
}
function clearFinale() { finT.forEach(clearTimeout); finT = []; finDue = 0; if (document.body.classList.contains('finale')) Light.fadeIn(); document.body.classList.remove('finale', 'finale2', 'dissolve', 'qlight'); }

/* ---------- speaker notes: edits from the speaker view live in the edit state (slides[id].notes), the original is kept ---------- */
const NOTES0 = new Map(slides.map(s => { const n = s.querySelector('.notes'); return [s.id, n ? n.innerHTML : null]; }));
function applyNotes(s) { const n = s.querySelector('.notes'); if (!n) return; const sd = sEd(s.id), v = sd && typeof sd.notes === 'string' ? sd.notes : NOTES0.get(s.id); if (n.innerHTML !== v) n.innerHTML = v; }
slides.forEach(applyNotes);
function setNotes(sid, html) {
  const sd = sEd(sid, true), orig = NOTES0.get(sid) || '';
  if (html.replace(/\s+/g, ' ').trim() === orig.replace(/\s+/g, ' ').trim()) delete sd.notes; else sd.notes = html;
  applyNotes(document.getElementById(sid)); editor.commit();
}

/* ---------- geometry in design units (the 1920×1080 stage) ---------- */
function rectOf(el) { const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: (r.left - s.left) / scale, y: (r.top - s.top) / scale, w: r.width / scale, h: r.height / scale }; }
function imgRect() { const r = Light.imageRect(); if (!r) return null; const p = 18; return { x: r[0] - p, y: r[1] - p, w: r[2] - r[0] + p * 2, h: r[3] - r[1] + p * 2 }; }

/* ---------- navigation ---------- */
let cur = -1, step = 0, cycleT = null, cycleIdx = 0;
const maxStep = s => Math.max(0, ...[...s.querySelectorAll('[data-step]')].map(e => +e.dataset.step));
function show(s, n) { s.querySelectorAll('[data-step]').forEach(e => e.classList.toggle('shown', +e.dataset.step <= n)); }
function go(n, o) {
  let toEnd = o === true || !!(o && o.toEnd);
  n = clamp(n, 0, N - 1);
  const fresh = n !== cur;
  if (editor && editor.typing) editor.commitText();
  clearTimers(); stopCycle(); clearFinale();
  if (editing()) toEnd = true;
  const prev = slides[cur];
  if (prev && n !== cur) prev.classList.remove('on');
  cur = n; const s = slides[cur], max = maxStep(s);
  step = toEnd ? max : 0; show(s, step);
  s.classList.remove('on'); void s.offsetWidth; s.classList.add('on');
  Light.mood(s.dataset.mood || 'ai');
  applyFx(s);
  let f = s.dataset.form, cyc = !!s.dataset.cycle;
  if (toEnd) for (let k = 1; k <= max; k++) { const el = s.querySelector(`[data-step="${k}"][data-form]`); if (el) f = el.dataset.form; const cc = s.querySelector(`[data-step="${k}"][data-cycle-cmd]`); if (cc) cyc = cc.dataset.cycleCmd === 'start'; }
  if (s.dataset.cycle) { if (fresh) resetNames(s); const L = namesOf(s); if (L.length && cyc) f = 'animal:' + L[cycleIdx % L.length].a; }
  playForm(f, s);
  if (s.dataset.cycle) { if (cyc && !editing()) startCycle(s, cycleIdx, false); else if (editing()) showName(s, cycleIdx, false, false); }
  // with voice off, builds come on their own at the speaker's pace (timing panel: T); with voice on they wait for their cue word or the clicker
  if (!toEnd) for (let k = 1; k <= max; k++) { const at = ui.autoAt(s, k); if (at != null) later(() => { if (!ui.voice) revealUpTo(k); }, at * 1000); }
  if (toEnd && !editing() && s.querySelector('.finalq.shown')) startFinale();
  effects(s);
  if (!toEnd) waves(s);
  ui.arrived(0); ui.refresh();
  try { history.replaceState(null, '', '#' + s.id); } catch (e) {}
  // build the next slides' light forms while the room is listening
  const upcoming = []; for (const t of [slides[cur + 1], slides[cur + 2]]) if (t) t.querySelectorAll('[data-form]').forEach(e => upcoming.push(...e.dataset.form.split('>').map(p => p.split('@')[0])));
  if (slides[cur + 1] && slides[cur + 1].dataset.form) upcoming.unshift(...slides[cur + 1].dataset.form.split('>').map(p => p.split('@')[0]));
  Light.prebuild(upcoming);
  if (editing()) editor.refresh();
}
function revealUpTo(k) { const s = slides[cur]; while (step < k && step < maxStep(s)) reveal(s, ++step); }
function reveal(s, k) {
  const els = [...s.querySelectorAll(`[data-step="${k}"]`)];
  els.forEach(e => e.classList.add('shown')); ui.reset(); els.forEach(effects); els.forEach(waves);
  const fe = els.find(e => e.dataset.form); const cc = els.find(e => e.dataset.cycleCmd);
  if (cc && cc.dataset.cycleCmd === 'stop') stopCycle();
  if (fe) playForm(fe.dataset.form, s);
  if (cc && cc.dataset.cycleCmd === 'start') startCycle(s, cycleIdx + 1, true);
  if (els.some(e => e.classList.contains('finalq'))) startFinale();
  ui.refresh();
}
function next() {
  if (editing()) return;
  const s = slides[cur];
  if (cur === N - 1) { if (step < maxStep(s)) revealUpTo(maxStep(s)); else finaleNow(); return; }
  if (step < maxStep(s)) { revealUpTo(step + 1); return; } // the clicker always shows the next build before moving on
  go(cur + 1);
}
function prev() { if (cur > 0) go(cur - 1, true); }

/* ---------- the shared presenter modules (Cinematic Deck Designer), wired through their adapters ---------- */
let editor = null, capArt = null, capDl = null, capsAsked = false;
const editing = () => !!(editor && editor.on);
const bar = v => { if (v === undefined) return state.fx.bar !== false; state.fx.bar = !!v; document.body.classList.toggle('nobar', !state.fx.bar); persist(); return state.fx.bar; };
const thanks = (w, s) => cur === N - 1 && !!s.querySelector('.finalq.shown') && w.some(x => x === 'thank' || x === 'thanks');

const speaker = makeSpeaker({
  slides, cur: () => cur, step: () => step, maxStep,
  cueWords: key => ui.cueWords(key), markCues: (h, c, u) => ui.markCues(h, c, u), voiceOn: () => ui.voiceOn(), autoAt: (s, k) => ui.autoAt(s, k),
  next, prev,
  key: e => { if (e.key === 's' || e.key === 'S') return; ui.key(e); },   // S belongs to the slides window
  cueFromDblclick: (w, e) => ui.cueFromDblclick(w, e),
  setNotes, refresh: () => ui.refresh(), toast: (m, ms) => ui.toast(m, ms),
  prefsKey: 'pp-sv-prefs', winName: 'pp-speaker',
  snap: () => Light.snap()   // the Now preview: a still of the particle light under the slide's text
});

const ui = makeDeckUI({
  slides, cur: () => cur, step: () => step, maxStep,
  go: (i, o) => go(i, !!(o && o.toEnd)), next, prev, reveal: revealUpTo,
  timing: () => state.timing, persist, speaker,
  editing, edit: () => editor.toggle(),
  surface: vp, bar,
  onWords: (w, s) => { if (thanks(w, s)) { finaleNow(); return true; } return false; },   // "thank you" on the last slide brings the ending forward
  help: {
    next: 'Next build, then the next slide (with voice off, builds also come on their own, timed to your script)',
    E: 'Edit: move, resize and retype anything; place the light image; particle speed, brightness, glow and light rays per slide; deck-wide light settings',
    rows: [['Last slide', 'The question forms out of light and dissolves after about 8 s; “thank you” or a click brings that forward (never sooner than 5 s)']]
  },
  prefsKey: 'pp-ui'
});

/* the editor's own plug-ins: the light image (a target), its per-slide light, the naming list, and the whole deck's light */
const fmtX = v => `${+(+v).toFixed(2)}×`;
const setVal = (root, sel, v) => { const el = root.querySelector(sel); if (el && document.activeElement !== el) el.value = v; };
const slider = (id, label, min, max) => `<label class="ed-slider">${label}<input type="range" id="${id}" min="${min}" max="${max}" step="0.05"><output id="${id}-o"></output></label>`;
const curS = () => slides[cur];
const imgTarget = {
  id: 'img', name: 'Light image', hint: 'drag to move it, drag the corner to resize it', hint0: 'Or click the light image.',
  link: 'Select the light image', none: 'This slide has no light image to place.',
  rect: imgRect,
  pos() { const m = iEd(curS().id) || {}; return { x: +m.x || 0, y: +m.y || 0 }; },
  setPos(x, y) { const m = iEd(curS().id, true); m.x = x; m.y = y; Light.setXform(slideXf(curS()), baseForm(curS())); },
  size() { return +(iEd(curS().id) || {}).s || 1; },
  setSize(v) { const m = iEd(curS().id, true); m.s = v; Light.setXform(slideXf(curS()), baseForm(curS())); },
  reset() { const s = curS(), sd = sEd(s.id); if (sd) delete sd.img; applyFx(s); Light.setXform(slideXf(s), baseForm(s)); }
};
const IMGK = { 'ed-ispeed': 'speed', 'ed-ibright': 'bright', 'ed-iglow': 'glow' };
function raysUI(root) { const m = iEd(curS().id) || {}, own = Light.lights ? Light.lights().rays : 0, v = m.rays ?? null;
  setVal(root, '#ed-irays', v ?? own); root.querySelector('#ed-irays-o').textContent = v == null ? `auto (${+(+own).toFixed(2)})` : (+v).toFixed(2); root.querySelector('#ed-irays-auto').disabled = v == null; }
const imgSection = {
  id: 'light-image', at: 'selected', show: ctx => !!(ctx.target && ctx.target.id === 'img'),
  html: slider('ed-ispeed', 'Particle speed, this slide', 0, 3) + slider('ed-ibright', 'Brightness, this slide', 0.2, 2) + slider('ed-iglow', 'Glow, this slide', 0, 3) +
    slider('ed-irays', 'Light rays, this slide', 0, 1.2) + '<div class="ed-btns"><button type="button" id="ed-irays-auto">Rays: back to auto</button></div>',
  mount(root, ctx) {
    Object.entries(IMGK).forEach(([id, k]) => { const el = root.querySelector('#' + id); el.addEventListener('input', () => { const m = iEd(curS().id, true); m[k] = +el.value; root.querySelector(`#${id}-o`).textContent = fmtX(m[k]); applyFx(curS()); }); el.addEventListener('change', () => ctx.commit()); });
    const r = root.querySelector('#ed-irays'); r.addEventListener('input', () => { const m = iEd(curS().id, true); m.rays = +r.value; raysUI(root); applyFx(curS()); }); r.addEventListener('change', () => ctx.commit());
    root.querySelector('#ed-irays-auto').addEventListener('click', () => { const m = iEd(curS().id, true); m.rays = null; raysUI(root); applyFx(curS()); ctx.commit(); });
  },
  update(root) { const m = iEd(curS().id) || {}; Object.entries(IMGK).forEach(([id, k]) => { const v = m[k] ?? 1; setVal(root, '#' + id, v); root.querySelector(`#${id}-o`).textContent = fmtX(v); }); raysUI(root); }
};
const namesSection = {
  id: 'names', at: 'section', title: 'Names on this slide', show: ctx => !!(ctx.slide && ctx.slide.dataset.cycle),
  html: '<p class="ed-sub">One per line, in order: Hebrew | transliteration | English | shape (or just English | shape). Shapes: lion, horse, donkey, camel, dog, fish, bird, cat, rabbit, butterfly, beetle, bug, shrimp, spider, egg, cow, paw.</p><textarea id="ed-names-t" rows="9" spellcheck="false" aria-label="Animal names, one per line"></textarea><div class="ed-btns"><button type="button" id="ed-names-reset">Restore the original list</button></div>',
  mount(root, ctx) {
    const t = root.querySelector('#ed-names-t');
    t.addEventListener('input', () => { const s = curS(); sEd(s.id, true).names = t.value; showName(s, cycleIdx, true, false); });
    t.addEventListener('change', () => ctx.commit());
    root.querySelector('#ed-names-reset').addEventListener('click', () => { const s = curS(), sd = sEd(s.id); if (sd) delete sd.names; t.value = ''; showName(s, 0, true, false); ctx.commit(); });
  },
  update(root) { const t = root.querySelector('#ed-names-t'); if (document.activeElement !== t) t.value = namesText(curS()).split('\n').map(l => l.replace(/\s*\|\s*/, ' | ')).join('\n'); }
};
const FXK = { speed: ['Particle speed', 0, 3], morph: ['Transition speed', 0.3, 3], bright: ['Particle brightness', 0.3, 2], glow: ['Glow and light rays', 0, 2], bg: ['Background haze', 0, 2] };
const deckSection = {
  id: 'deck-light', at: 'deck',
  html: Object.entries(FXK).map(([k, [l, a, b]]) => slider('ed-' + k, l, a, b)).join('') +
    '<label class="ed-row">Quality<select id="ed-quality"><option value="auto">Automatic</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low (no glow)</option></select></label>',
  mount(root, ctx) {
    Object.keys(FXK).forEach(k => { const el = root.querySelector('#ed-' + k); el.addEventListener('input', () => { state.fx[k] = +el.value; root.querySelector(`#ed-${k}-o`).textContent = fmtX(state.fx[k]); applyFx(curS()); }); el.addEventListener('change', () => ctx.commit()); });
    root.querySelector('#ed-quality').addEventListener('change', e => { state.fx.quality = e.target.value; applyFx(curS()); ctx.commit();
      setTimeout(() => { const st = Light.stats(); ctx.status(`Quality: ${['minimal', 'low', 'medium', 'high'][st.level]}${st.hdr ? '' : ' (no HDR on this device)'}.`); }, 60); });
  },
  update(root) { Object.keys(FXK).forEach(k => { setVal(root, '#ed-' + k, state.fx[k]); root.querySelector(`#ed-${k}-o`).textContent = fmtX(state.fx[k]); }); setVal(root, '#ed-quality', state.fx.quality); }
};

/* ---------- saving: the edits go into the deck file itself (deck-save module); a hosted artifact publishes a new version ---------- */
// Markers are assembled here so they appear only once in the page source (inside the template).
const M_FONTS = '/*@' + 'FONTS@*/', M_SRC = '"@' + 'SRC@"', M_EDITS = '"@' + 'EDITS@"';
const OFF_HEAD = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n', OFF_TAIL = '\n</body>\n</html>\n';
const ART_HEAD = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n', ART_TAIL = '\n</body></html>';
function buildDoc(shape, payload) {
  const srcText = document.getElementById('deck-src').textContent, tpl = JSON.parse(srcText);
  const fonts = document.getElementById('deck-fonts').textContent;
  const ed = JSON.stringify(payload).replace(/</g, '\\u003c');
  const body = tpl.replace(M_FONTS, () => fonts).replace(M_SRC, () => srcText).replace(M_EDITS, () => ed);
  return shape === 'artifact' ? ART_HEAD + body + ART_TAIL : OFF_HEAD + body + OFF_TAIL;
}
const deckName = () => (document.title || 'Presentation').replace(/[\\/:*?"<>|]+/g, '').trim() + ' - ParticlePresent.html';
function payloadNow() { if (editor) editor.flush(); prune(); return { stamp: new Date().toISOString(), state: JSON.parse(JSON.stringify(state)) }; }
function rebase(stamp) { base = stamp; persistNow(); }
const status = (m, k) => editor && editor.status(m, k);
const fileSaver = makeSaver({ buildDoc: p => buildDoc('offline', p), payloadNow, rebase, status, refresh: () => editor && editor.refresh(), key: 'pp', fallbackName: deckName });
async function publishHere() {
  const payload = payloadNow(); status('Saving to this page…');
  try { localStorage.setItem('bi-work-v1:' + payload.stamp, JSON.stringify({ t: Date.now(), state: payload.state })); } catch (e) {}
  try { await capArt.publish(buildDoc('artifact', payload)); status('Saved. Reloading to the new version…', 'ok'); }
  catch (err) {
    const c = err && err.code;
    if (c === 'conflict') { status('A newer version was published first; reloading to it. Your edits are still in this browser.', 'warn'); return; }
    if (['not_writer', 'not_granted', 'not_declared', 'consent_required', 'capability_disabled', 'capability_removed'].includes(c)) { capArt = null; editor.refresh(); status('This view can’t save the page. Use Save as… for an offline copy.', 'warn'); return; }
    status(`Couldn’t save (${c || 'error'}). Your edits are still in this browser; try again.`, 'warn');
  }
}
async function downloadHere() {
  const payload = payloadNow();
  try { await capDl.save({ filename: deckName(), data: new Blob([buildDoc('offline', payload)], { type: 'text/html' }) }); status('Downloaded. Open that file in Chrome to present with voice cues.', 'ok'); }
  catch (err) { status(err && err.code === 'declined' ? 'Not downloaded.' : 'Download isn’t available here.', 'warn'); }
}
const saver = {
  save: () => HOSTED && capArt ? publishHere() : fileSaver.save(),
  saveAs: () => HOSTED && capDl ? downloadHere() : fileSaver.saveAs(),
  label: () => HOSTED && capArt ? 'Save to this page' : fileSaver.label(),
  get handle() { return fileSaver.handle; }
};

editor = makeEditor({
  stage, surface: vp, slides, cur: () => cur,
  goto: i => go(i, true),
  enter() {
    Light.edit(true); ui.closeAll();
    if (HOSTED && !capsAsked) { capsAsked = true; (async () => { try { capArt = await window.claude.use('artifact'); } catch (e) { capArt = null; } try { capDl = await window.claude.use('downloads'); } catch (e) { capDl = null; } editor.refresh(); })(); }
    go(cur, true);
  },
  exit() { Light.edit(false); go(cur); },   // play the slide from the start
  fit,
  isText: isLeaf, ed: eEd, slideEd: sEd,
  apply: applyStyle, render: el => renderEl(el, { force: true }), typing: el => { el.innerHTML = srcHTML(el); }, orig: el => PR.get(el).html,
  snapshot: () => JSON.stringify({ fx: state.fx, slides: state.slides }),
  restore(sn) {
    const o = JSON.parse(sn); state.fx = Object.assign({}, DEF_FX, o.fx); state.slides = o.slides || {};
    ELS.forEach(el => renderEl(el)); slides.forEach(applyNotes);
    const s = curS(); if (s) { applyFx(s); Light.setXform(slideXf(s), baseForm(s)); if (s.dataset.cycle) showName(s, cycleIdx, true, false); }
    ui.refresh();
  },
  prune, persist, saver,
  refresh: () => ui.refresh(), toast: (m, ms) => ui.toast(m, ms),
  overlay: () => !$('#jump').hidden || !$('#help').hidden || !$('#cues').hidden,
  colors: [{ cls: 'c-ink', hex: '#F2F5F0', title: 'White' }, { cls: 'c-gold', hex: '#F6BC4E', title: 'Gold' }, { cls: 'c-leaf', hex: '#8AD6A8', title: 'Green' }, { cls: 'c-coral', hex: '#F3846B', title: 'Coral' }, { cls: 'c-sky', hex: '#8CC3EC', title: 'Blue' }, { cls: 'mute', hex: '#97AAA3', title: 'Muted' }],
  bar,
  sections: [imgSection, namesSection, deckSection],
  targets: [imgTarget]
});

/* ---------- start ---------- */
addEventListener('beforeunload', () => { if (editor.typing) editor.commitText(); persistNow(); });
Light.start($('#gl'));
applyFx(null);
fit();
const fromHash = () => { const id = decodeURIComponent(location.hash.slice(1)); return slides.findIndex(s => s.id === id); };
addEventListener('hashchange', () => { const i = fromHash(); if (i >= 0 && i !== cur) go(i, editing()); });
const startAt = fromHash();
const begin = () => { go(startAt >= 0 ? startAt : 0); if (restored) ui.toast('Your unsaved edits from last time are back. Press E to edit, then Save to keep them in the file.', 6500); };
(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(begin, 120));
window.__deck = {
  go, next, prev, get cur() { return cur; }, get step() { return step; }, N, maxStep: i => maxStep(slides[i]), get busy() { return false; }, settle() {}, hear: t => ui.hear(t),
  revealUpTo, enterEdit: () => editor.enter(), exitEdit: () => editor.exit(), state: () => state, buildDoc: (p, shape = 'offline') => buildDoc(shape, p || payloadNow()),
  select: t => editor.select(t === 'img' ? imgTarget : typeof t === 'string' ? stage.querySelector(`[data-e="${t}"]`) : t),
  startText: id => editor.startText(stage.querySelector(`[data-e="${id}"]`)), commitText: () => editor.commitText(), undo: () => editor.undo(), redo: () => editor.redo(),
  saveDeck: () => saver.save(), get sel() { return editor.sel; }, light: Light, ui, speaker, editor,
  dbg: { slides, spoken: s => ui.spoken(s), norm: t => ui.norm(t), same: (a, b) => ui.same(a, b), cueWords: k => ui.cueWords(k) }
};
})();
