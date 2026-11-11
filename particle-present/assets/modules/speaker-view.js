/* ---------- speaker view: notes, timing and cue previews in their own window (share only the slides) ----------
   Drop-in module. Paste this function into the deck's script unchanged and create it once:
     const speaker = makeSpeaker({ ...adapter });
   then call speaker.toggle() for S, speaker.sync() whenever the slide or build changes, speaker.status(...) from the voice
   renderer, and speaker.toast(msg) for messages meant only for the presenter. While a voice result is handled, set
   speaker.voiceAt = performance.now() and back to 0 afterwards, so a move a spoken cue causes glides slower.

   Adapter (required unless marked optional):
     slides            array of slide elements, in order; each has an id, data-title and an .notes element holding the script,
                       with [BUILD] between the parts of each build and optional <em class="dir"> stage directions
     cur(), step()     the current slide index and build
     maxStep(s)        the number of builds on slide s
     cueWords(key)     the cue words for a key: the slide id for its arrival, "id:k" for build k
     markCues(html, cues, used)   wraps cue words in <q> (class "done" when used)
     voiceOn()         true while voice cues are listening
     autoAt(s, k)      seconds at which build k comes on its own, or null when builds wait for a click
     next(), prev()    move on and back
     key(e)            the deck's key handler, so a clicker aimed at this window still drives the deck (optional; without it
                       → / space / Enter / PgDn and ← / PgUp / Backspace move, B and . blank, V voice, M sound through
                       blank(), voice(), sound())
     cueFromDblclick(win, e)   double-click a word in the notes to add or drop a cue (optional)
     setNotes(sid, html)       store edited notes for slide sid (the deck's edit state, so Save writes them into the file)
     refresh()         the deck's own update; it calls speaker.sync()
     toast(msg, ms)    a message on the main screen (only used when the browser blocks the window)
     prefsKey          localStorage key for the panel choices and sizes
     winName           window name for window.open
     paint(doc, box, i, upTo)  draw slide i with builds up to upTo into box inside a preview frame's document (optional; the
                       default clones the slide, adds "on", and marks [data-step] elements "shown")
     snap()            a Promise of an image URL of the live screen, laid over the Now preview 1.2 s after each change and
                       refreshed every 2.5 s (each try gives up after 2 s) (optional)
     previewHTML       extra markup for each preview frame's body, such as shared SVG <defs> (optional)
*/
function makeSpeaker(A) {
  let w = null, t0 = 0, voiceAt = 0;   // voiceAt: set while a voice result is being handled, so the notes glide slower after a spoken cue
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const slides = A.slides, N = slides.length, title = s => s.dataset.title || '';
  const open = () => !!(w && !w.closed && w.document.getElementById('sv'));
  const CSS = `:root{color-scheme:dark}body{margin:0;background:#0B0B0B;color:#F2F2F2;font:400 18px/1.55 "Mona Sans",system-ui,sans-serif}
#sv{display:flex;flex-direction:column;height:100vh}
header{display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,.12);background:#141414}
header b{color:#F6BC4E;font-size:20px}header .n{color:#A3A3A3;font-variant-numeric:tabular-nums}header .sp{flex:1}
header .clk{font-variant-numeric:tabular-nums;font-size:20px;font-weight:650}header .el{color:#8AD6A8}
button{font:inherit;font-size:15px;color:#F2F2F2;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:9px;padding:7px 13px;cursor:pointer}
#st{padding:8px 20px;font-size:15px;color:#A3A3A3;border-bottom:1px solid rgba(255,255,255,.08)}#st q{color:#8AD6A8;font-weight:700;quotes:none}#st .heard{color:#F2F2F2}
#nt{flex:1;overflow:auto;position:relative;padding:6px 20px;white-space:pre-line;font-size:22px}#nt em{color:#A3A3A3}#nt .bt{color:#8CC3EC;font-weight:600}
#main{flex:1;display:flex;min-height:0}#left{flex:1;display:flex;flex-direction:column;min-width:0}#pvs{width:38%;padding:10px 16px 16px;border-left:1px solid rgba(255,255,255,.1);background:#101010;overflow:auto}#pvs iframe{display:block;width:100%;aspect-ratio:16/9;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#0B0B0B}#pvs .pl{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6E6E6E;font-weight:650;margin:8px 0 6px}#pvs .pl b{color:#F6BC4E;text-transform:none;letter-spacing:0}@media (max-width:900px){#pvs{display:none}}
#tip{padding:6px 20px;font-size:13px;color:#6E6E6E;border-top:1px solid rgba(255,255,255,.06)}#tt{position:fixed;left:50%;bottom:44px;transform:translate(-50%,10px);max-width:80%;background:#1C1C1C;border:1px solid rgba(138,214,168,.35);color:#F2F2F2;padding:10px 16px;border-radius:10px;font-size:16px;opacity:0;transition:.25s;pointer-events:none}#tt.on{opacity:1;transform:translate(-50%,0)}
#nt .seg{cursor:text}#nx{padding:8px 20px 12px;border-bottom:1px solid rgba(255,255,255,.14);background:#141414}
.pvl{display:block;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6E6E6E;font-weight:650;margin-top:4px}.pvt{color:#F6BC4E;text-transform:none;letter-spacing:0}
.pv{display:block;font-size:24px;line-height:1.45}q{color:#8AD6A8;font-weight:700;quotes:none}q.done{color:inherit;opacity:.75;font-weight:600;text-decoration:underline;text-decoration-color:rgba(138,214,168,.5);text-underline-offset:3px}
.seg{display:inline;border-radius:6px;transition:background-color .6s}.seg.past{color:#A3A3A3}.seg.now{background:rgba(246,188,78,.10);box-shadow:-10px 0 0 rgba(246,188,78,.10),10px 0 0 rgba(246,188,78,.10);animation:spot 2.4s ease-out}
@keyframes spot{0%{background:rgba(246,188,78,.38)}100%{background:rgba(246,188,78,.10)}}#nx.held{opacity:.8}#nx.hearing{padding:6px 20px}#nx .hear{color:#F2F2F2;font-size:13px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#nx .hear b{color:#A3A3A3;font-weight:650;margin-right:.3em}#nx .hear q{color:#8AD6A8}
.tgs{display:flex;gap:6px;align-items:center}button.tg{font-size:13px;padding:5px 10px}button.tg[aria-pressed=false]{opacity:.42;text-decoration:line-through;text-decoration-color:rgba(255,255,255,.4)}button.fs{font-size:13px;padding:5px 9px;min-width:34px}
#nt::after{content:'';display:block;height:70vh}#nt{font-size:var(--fs,22px);-webkit-mask-image:linear-gradient(#000,#000 var(--cut,100%),rgba(0,0,0,.66) calc(var(--cut,100%) + 1.1em),rgba(0,0,0,.4) calc(100% - 2em),transparent);mask-image:linear-gradient(#000,#000 var(--cut,100%),rgba(0,0,0,.66) calc(var(--cut,100%) + 1.1em),rgba(0,0,0,.4) calc(100% - 2em),transparent)}
#nt .seg.now~.seg,#nt .fut{opacity:.5}#nt .old{color:#A3A3A3}#nt .slt{display:block;color:#F6BC4E;font-weight:650;font-size:.72em;letter-spacing:.02em;margin:1.1em 0 .2em}#nt .fut .slt{color:#A3A3A3}#nt .fut q{color:#FF7A6E;font-weight:700}
#nt{white-space:normal}#nt .seg,#nt .oseg{display:block}#nt .b{position:relative;padding-left:1.15em;margin:.08em 0}#nt .b.l0::before{content:'•';position:absolute;left:.25em}#nt .b.l1{margin-left:1.4em}#nt .b.l1::before{content:'◦';position:absolute;left:.25em}#nt .b.dir{font-style:italic;color:#A3A3A3}#nt .b.dir::before{content:none}#nt .pz{color:#A3A3A3;font-style:italic}#nt .gt{color:#FF5A4E;font-weight:800;margin-right:.35em}#nt .bt{font-size:.62em;vertical-align:.2em;margin-right:.4em}
body.ednotes #nt .cur-s{white-space:pre-line}body.ednotes #nt .cur-s .seg{display:inline}#nt .cur-s q.done{color:#8AD6A8;opacity:.8}#nt .old q{color:inherit;font-weight:inherit}
body.no-cues #nx,body.no-cues #st,body.no-notes #nt,body.no-notes #tip,body.no-now .now-p,body.no-next .next-p{display:none!important}body.no-now.no-next #pvs{display:none}body.no-cues.no-notes #left{display:none}
#spl{width:7px;cursor:col-resize;background:rgba(255,255,255,.04);flex:none}#spl:hover,#spl.drag{background:rgba(246,188,78,.35)}body.no-now.no-next #spl{display:none}
#nx{overflow:hidden;flex:none}#nx:not(.hearing){display:none!important}#st:empty{display:none}.now-p,.next-p{resize:horizontal;overflow:hidden;max-width:100%;min-width:120px;padding-bottom:4px}#pvs{flex:none}
body.ednotes #nt .cur-s .seg{outline:1px dashed rgba(246,188,78,.45);outline-offset:3px;background:rgba(246,188,78,.06)}body.ednotes #nt .cur-s .seg:focus{outline:2px solid #F6BC4E}body.ednotes #nt{-webkit-mask-image:none;mask-image:none}header .tipt{font-size:12px;color:#6E6E6E;max-width:340px;line-height:1.3}header .save{background:#F6BC4E;color:#0B0B0B;border-color:#F6BC4E;font-weight:650}header button{white-space:nowrap}html,body{overflow:hidden}
#main{overflow:hidden}body.lay-l #main{flex-direction:row-reverse}body.lay-v.lay-t #main{flex-direction:column-reverse}body.lay-l #pvs{border-left:0;border-right:1px solid rgba(255,255,255,.1)}body.lay-t #pvs{border-top:0;border-bottom:1px solid rgba(255,255,255,.1)}body.lay-off #pvs,body.lay-off #spl{display:none!important}#lay{padding:4px 8px;line-height:0}#lay svg{width:20px;height:20px}body.lay-v #main{flex-direction:column}body.lay-v #left{flex:1 1 0;min-height:0}
#sv>header{order:2;flex-wrap:nowrap;gap:6px;border-bottom:0;border-top:1px solid rgba(255,255,255,.12);padding:6px 12px;overflow-x:auto}#sv>header .tgs{flex-wrap:nowrap;gap:4px;flex:none}
#sv>header #ti{font-size:16px;min-width:60px;flex:0 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#sv>header .n{font-size:14px;white-space:nowrap;flex:none}#sv>header .sp{flex:1 1 8px}
#sv>header button{font-size:13px;padding:4px 9px;border-radius:7px;flex:none}#sv>header button.nav{font-size:16px;padding:2px 12px}#sv>header .clkb{background:none;border-color:transparent;padding:2px 4px}#sv>header .clk{font-size:16px;white-space:nowrap}#sv>header .tipt:empty{display:none}#sv>header .tipt{max-width:260px;font-size:11px}#lay{padding:3px 6px}#lay svg{width:17px;height:17px}#sv>#main{order:1}#left>#nt{order:1;min-height:0}#left{overflow:hidden;min-height:0}#pvs{position:relative;z-index:1}#left>#nx,#left>#st,#left>#tip{flex:none}#left>#nx{order:2;border-bottom:0;border-top:1px solid rgba(255,255,255,.14)}#left>#st{order:3;border-bottom:0;border-top:1px solid rgba(255,255,255,.08)}#left>#tip{order:4}body.lay-v #pvs{width:auto!important;height:var(--ph,300px);border-left:0;border-top:1px solid rgba(255,255,255,.1);display:flex;gap:16px;align-items:flex-start}
body.lay-v #spl{width:auto;height:7px;cursor:row-resize}body.lay-v .now-p[style],body.lay-v .next-p[style]{width:min(calc(50% - 8px),calc((var(--ph,300px) - 44px) * 16 / 9))!important}body.lay-v .now-p,body.lay-v .next-p{flex:none;resize:none;width:min(calc(50% - 8px),calc((var(--ph,300px) - 44px) * 16 / 9))}body.lay-v.no-now .next-p,body.lay-v.no-next .now-p{width:min(100%,calc((var(--ph,300px) - 44px) * 16 / 9))}
body.dragging,body.dragging *{user-select:none;cursor:col-resize!important}body.lay-v.dragging,body.lay-v.dragging *{cursor:row-resize!important}body.dragging iframe{pointer-events:none}`;
  const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  // static slide previews: a copy of the slide's text and layout (and, if the deck can take one, a still of the live screen once it settles)
  let pvKey = '', pvSnapT, deckCSS = null;
  const PVCSS = `html,body{margin:0;height:100%;overflow:hidden;background:var(--bg,#0B0B0B)}#ps{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;overflow:hidden}#ps>img{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .4s}#ps>img.on{opacity:1}#ps .slide{transition:none!important}#ps *,#ps *::before,#ps *::after{animation-delay:-60s!important;animation-iteration-count:1!important;transition:none!important}#ps .caret,#ps .notes{display:none!important}#ps .ch{opacity:1!important}`;
  function pvDoc(f) { const d = f.contentDocument; if (d.getElementById('ps')) return d;
    deckCSS = deckCSS || [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><style>${deckCSS}</style><style>${PVCSS}</style></head><body>${A.previewHTML || ''}<div id="ps"><img alt=""><div id="sl"></div></div></body></html>`); d.close(); fitPv(f); return d; }
  function fitPv(f) { if (!f) return; const d = f.contentDocument, ps = d && d.getElementById('ps'); if (ps) ps.style.transform = `scale(${f.clientWidth / 1920})`; }
  function paint(f, i, upTo, img) {
    const d = pvDoc(f), sl = d.getElementById('sl'), im = d.querySelector('#ps>img'), slide = slides[i];
    if (!slide) { sl.innerHTML = '<div style="position:absolute;inset:0;display:grid;place-items:center;font:600 64px sans-serif;color:#6E6E6E">End of the talk</div>'; im.classList.remove('on'); return; }
    if (A.paint) A.paint(d, sl, i, upTo);
    else { const c = slide.cloneNode(true); c.classList.add('on'); c.querySelectorAll('[data-step]').forEach(e => e.classList.toggle('shown', +e.dataset.step <= upTo)); sl.replaceChildren(d.importNode(c, true)); }
    fitPv(f);
    if (img === undefined) return; if (img) { im.src = img; im.classList.add('on'); } else im.classList.remove('on');
  }
  function previews() {
    const cur = A.cur(), step = A.step();
    if (!open() || cur < 0) return; const d = w.document, s = slides[cur], key = cur + ':' + step; if (key === pvKey) return; pvKey = key;
    paint(d.getElementById('pnow'), cur, step, null);
    const more = step < A.maxStep(s), ni = more ? cur : cur + 1, ns = slides[ni];
    d.getElementById('pnl').innerHTML = more ? 'Next · <b>build on this slide</b>' : ns ? `Next slide · <b>${esc(title(ns))}</b>` : 'Next';
    paint(d.getElementById('pnext'), ni, more ? step + 1 : 0, null);
    // keep the "on screen now" picture current: first still soon after the change, then refreshed every 2.5 s until the next change
    clearTimeout(pvSnapT); const shoot = () => { if (!open() || pvKey !== key) return; if (!svp.now || !A.snap) { pvSnapT = setTimeout(shoot, 2500); return; }
      Promise.race([A.snap(), new Promise(r => setTimeout(() => r(null), 2000))]).then(url => { if (url && open() && pvKey === key) { const f = w.document.getElementById('pnow'); paint(f, cur, step); const im = pvDoc(f).querySelector('#ps>img'); im.src = url; im.classList.add('on'); } }).catch(() => {}).finally(() => { if (open() && pvKey === key) pvSnapT = setTimeout(shoot, 2500); }); };
    pvSnapT = setTimeout(shoot, 1200);
  }
  // which panels show, and the notes size; kept per browser
  const svp = Object.assign({ cues: true, notes: true, now: true, next: true, fs: 22, lay: 'r', ph: 0, pw: 0, nh: 0, nw: 0, xw: 0 }, (() => { try { return JSON.parse(localStorage.getItem(A.prefsKey) || '{}'); } catch (e) { return {}; } })());
  const saveSvp = () => { try { localStorage.setItem(A.prefsKey, JSON.stringify(svp)); } catch (e) {} };
  function applySvp() { if (!open()) return; const d = w.document, b = d.body; ['notes', 'now', 'next'].forEach(k => b.classList.toggle('no-' + k, !svp[k]));
    d.querySelectorAll('button.tg').forEach(x => x.setAttribute('aria-pressed', String(!!svp[x.dataset.k]))); d.getElementById('nt').style.setProperty('--fs', svp.fs + 'px');
    const L = svp.lay; ['r', 'b', 'l', 't', 'off'].forEach(k => b.classList.toggle('lay-' + k, L === k)); b.classList.toggle('lay-v', L === 'b' || L === 't');
    const fill = { r: [1, 3], l: [0, 2], b: [2, 3], t: [0, 1], off: [] }[L] || [], names = { r: 'right', b: 'bottom', l: 'left', t: 'top', off: 'hidden' };
    const lb = d.getElementById('lay'); lb.title = `Previews: ${names[L]} (click to move: right, bottom, left, top, hidden)`; lb.setAttribute('aria-label', lb.title);
    lb.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true">${[[1, 1], [11, 1], [1, 11], [11, 11]].map(([x, y], i) => `<rect x="${x}" y="${y}" width="8" height="8" rx="1.5" fill="${fill.includes(i) ? '#F6BC4E' : 'none'}" stroke="${fill.includes(i) ? '#F6BC4E' : '#A3A3A3'}" stroke-width="1.3"/>`).join('')}</svg>`; if (svp.ph) b.style.setProperty('--ph', svp.ph + 'px'); else b.style.removeProperty('--ph');
    d.getElementById('spl').title = 'Drag to size the previews';
    pvKey = ''; previews(); fitPv(d.getElementById('pnow')); fitPv(d.getElementById('pnext')); flow(false); }
  // the whole script as one running column: earlier slides grey, the current part lit, the next two lines at half strength, the rest faded out
  // the script as bullets, laid out like the printed presenter notes: a main point, shorter follow-ons indented, a red > on every click
  function sents(line) { const parts = line.replace(/\s+/g, ' ').trim().split(/(?<!\bv\.)(?<!\bp\.)(?<=[.?!])([”"’)]*)\s+(?=[A-Z“"\[(])/); const out = []; let buf = '';
    parts.forEach((x, i) => { if (i % 2 === 0) buf += x || ''; else { buf += x || ''; out.push(buf.trim()); buf = ''; } }); if (buf.trim()) out.push(buf.trim());
    const res = []; out.forEach(t => { const m = t.match(/^((?:\[[^\]]+\]\s*)+)(.*)$/); if (res.length && m) { res[res.length - 1] += ' ' + m[1].trim(); t = m[2].trim(); } if (t) res.push(t); }); return res; }
  function bul(html, cues, used, lead) { const tmp = document.createElement('div'); tmp.innerHTML = html; const out = []; let txt = '';
    const flush = () => { txt.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => { const ss = sents(line); if (!ss.length) return; let head = ss[0]; const rest = ss.slice(1);
      while (rest.length && head.length + rest[0].length < 70) head += ' ' + rest.shift(); const mg = []; rest.forEach(x => { if (mg.length && mg[mg.length - 1].length + x.length < 80) mg[mg.length - 1] += ' ' + x; else mg.push(x); });
      out.push({ t: head, l: 0 }); mg.forEach(x => out.push({ t: x, l: 1 })); }); txt = ''; };
    tmp.childNodes.forEach(n => { if (n.nodeType === 1 && n.matches('em.dir')) { flush(); out.push({ t: n.textContent, dir: 1 }); } else txt += n.textContent; }); flush();
    return out.map((o, i) => { const pre = i === 0 && lead ? lead : '';
      return o.dir ? `<div class="b dir">${pre}${esc(o.t)}</div>` : `<div class="b l${o.l}">${pre}${A.markCues(esc(o.t), cues, used).replace(/\[(PAUSE|pause)\]/g, '<i class="pz">[pause]</i>')}</div>`; }).join(''); }
  function segsOf(x) { const n = x.querySelector('.notes'); return (n ? n.innerHTML : '').split('[BUILD]'); }
  function bulSlide(x, i) { const cur = A.cur(), step = A.step(), isCur = i === cur, later = i > cur;
    return segsOf(x).map((h, k) => { const key = k ? x.id + ':' + k : x.id, cls = isCur ? (k === step ? ' now' : k < step ? ' past' : '') : '', at = k && isCur && !A.voiceOn() ? A.autoAt(x, k) : null;
      const tag = k && isCur ? `<span class="bt">[${A.voiceOn() ? 'build on cue' : at != null ? `builds at ${(+at).toFixed(0)} s` : 'click'}${k <= step ? ', shown' : ''}]</span>` : '';
      const lead = k ? `<b class="gt">&gt;</b>${tag}` : '';
      return `<div class="${isCur ? 'seg' : 'oseg'}${cls}" data-k="${k}">${bul(h, isCur || later ? A.cueWords(key) : [], isCur && k <= step, lead)}</div>`; }).join(''); }
  const sTitle = (x, i) => `<span class="slt">${i ? '<b class="gt">&gt;</b>' : ''}${i + 1}. ${esc(title(x))}</span>`;
  function flow(smooth) { if (!open()) return; const d = w.document, box = d.getElementById('nt'), el = box.querySelector('.seg.now') || box.querySelector('.cur-s'); if (!el || !svp.notes) return;
    const br = box.getBoundingClientRect(), rs = el.getClientRects(), last = rs[rs.length - 1] || el.getBoundingClientRect(), first = rs[0] || last;
    const topC = first.top - br.top + box.scrollTop, botC = last.bottom - br.top + box.scrollTop, target = Math.max(0, topC - (parseFloat(w.getComputedStyle(box).lineHeight) || svp.fs * 1.55) * .7);
    const lh = parseFloat(w.getComputedStyle(box).lineHeight) || svp.fs * 1.55; box.style.setProperty('--cut', Math.round(botC - target + lh * 2 + 4) + 'px');
    glide(box, target, !smooth ? 0 : voiceAt ? 1500 : 450); }
  // our own scroll animation, so a voice-triggered move can run at 30% of the normal speed (450 ms vs 1.5 s)
  let glideId = 0;
  function glide(box, to, ms) { const id = ++glideId; if (!ms) { box.scrollTop = to; return; } const from = box.scrollTop, t0 = performance.now(), ez = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const stepF = () => { if (id !== glideId || !open()) return; const t = Math.min(1, (performance.now() - t0) / ms); box.scrollTop = from + (to - from) * ez(t); if (t < 1) w.requestAnimationFrame(stepF); }; w.requestAnimationFrame(stepF); }
  // editing the script: the current slide's parts become editable in place; Save writes them into the deck (kept with Save in the editor/file)
  let edSid = null;
  function startEd() { const cur = A.cur(), step = A.step(); if (!open() || cur < 0 || edSid) return; const d = w.document; if (!svp.notes) { svp.notes = true; saveSvp(); applySvp(); }
    edSid = slides[cur].id; d.body.classList.add('ednotes'); const box = d.querySelector('#nt .cur-s'); if (!box) { edSid = null; return; }
    box.innerHTML = sTitle(slides[cur], cur) + segsOf(slides[cur]).map((h, k) => `<span class="seg${k === step ? ' now' : ''}" data-k="${k}">${h}</span>`).join('');
    box.querySelectorAll('.seg').forEach(x => { x.contentEditable = 'true'; x.spellcheck = true; }); box.querySelectorAll('.bt').forEach(x => x.contentEditable = 'false');
    d.getElementById('ednb').hidden = true; d.getElementById('edns').hidden = false; d.getElementById('ednc').hidden = false;
    d.getElementById('tipt').textContent = 'Editing: Ctrl/Cmd+Enter saves, Esc cancels. Each box is one build.';
    const f = box.querySelector('.seg.now') || box.querySelector('.seg'); if (f) f.focus(); }
  function clean(seg) { const c = seg.cloneNode(true); c.querySelectorAll('.bt').forEach(x => x.remove());
    c.querySelectorAll('br').forEach(b => b.replaceWith('\n')); c.querySelectorAll('div,p').forEach(x => { x.before('\n'); });
    [...c.querySelectorAll('*')].reverse().forEach(x => { if (!(x.tagName === 'EM' && x.classList.contains('dir'))) x.replaceWith(...x.childNodes); else { x.removeAttribute('style'); x.removeAttribute('contenteditable'); } });
    return c.innerHTML.replace(/&nbsp;| /g, ' ').replace(/\n{3,}/g, '\n\n'); }
  function endEd(save) { if (!open() || !edSid) { edSid = null; return; } const d = w.document, sid = edSid, box = d.querySelector('#nt .cur-s');
    const html = save && box ? [...box.querySelectorAll('.seg')].map(clean).join('[BUILD]') : null;
    edSid = null; d.body.classList.remove('ednotes'); d.getElementById('ednb').hidden = false; d.getElementById('edns').hidden = true; d.getElementById('ednc').hidden = true;
    d.getElementById('tipt').textContent = '';
    if (html !== null) { A.setNotes(sid, html); api.toast('Notes saved. They stay in this browser; use Save in the editor (E) to write them into the file.'); } A.refresh(); }
  function keys(e) { // the clicker may send keys to this window: pass them to the deck
    const k = e.key;
    if (edSid && e.target.isContentEditable) { if (k === 'Escape') { e.preventDefault(); endEd(false); } else if (k === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); endEd(true); } return; }
    if (A.key) { A.key(e); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); A.next(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); A.prev(); }
    else if (k === 'b' || k === 'B' || k === '.') A.blank && A.blank();
    else if (k === 'v' || k === 'V') A.voice && A.voice();
    else if (k === 'm' || k === 'M') A.sound && A.sound();
  }
  function make() {
    w = window.open('', A.winName, 'width=1440,height=820');
    if (!w) { A.toast('The browser blocked the speaker window. Allow pop-ups for this file, then press S again.', 7000); return; }
    if (!w.document.getElementById('pvs')) {
      edSid = null;
      w.document.open(); w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Speaker view · ${esc(document.title)}</title><style>${CSS}</style></head><body><div id="sv"><header><b id="ti"></b><span class="n" id="nm"></span><span class="tgs"><button class="tg" data-k="notes" title="Show or hide the notes. Double-click a word in the notes to make it a cue (or drop one).">Notes</button><button class="tg" data-k="now">Now</button><button class="tg" data-k="next">Next</button><button class="fs" id="fsm" title="Smaller notes">A−</button><button class="fs" id="fsp" title="Larger notes">A+</button><button class="fs" id="lay" title="Previews">▦</button><button class="fs" id="szr" title="Reset panel sizes">Reset sizes</button><button class="fs" id="ednb" title="Edit the script for this slide. Tip: double-click a word in the notes to make it a cue (or drop one).">Edit notes</button><button class="fs save" id="edns" hidden>Save notes</button><button class="fs" id="ednc" hidden>Cancel</button><span id="tipt" class="tipt"></span></span><span class="sp"></span><button id="pv" class="nav" title="Back">←</button><button id="nxb" class="nav" title="Next">→</button><button id="rs" class="clkb" title="Talk timer (click to restart)"><span class="clk el" id="el">0:00</span></button><span class="clk" id="ck"></span></header><div id="main"><div id="left"><div id="nx"></div><div id="st"></div><div id="nt"></div></div><div id="spl" title="Drag to size the previews"></div><aside id="pvs"><div class="now-p"><div class="pl">On screen now</div><iframe id="pnow" title="Current slide"></iframe></div><div class="next-p"><div class="pl" id="pnl">Next</div><iframe id="pnext" title="Next"></iframe></div></aside></div><div id="tt"></div></div></body></html>`); w.document.close();
      const d = w.document;
      d.getElementById('nt').addEventListener('dblclick', e => { if (!edSid && A.cueFromDblclick) A.cueFromDblclick(w, e); });
      d.getElementById('ednb').onclick = () => startEd(); d.getElementById('edns').onclick = () => endEd(true); d.getElementById('ednc').onclick = () => endEd(false); d.getElementById('pv').onclick = () => A.prev(); d.getElementById('nxb').onclick = () => A.next(); d.getElementById('rs').onclick = () => { t0 = Date.now(); };
      d.addEventListener('keydown', keys);
      d.querySelectorAll('button.tg').forEach(b => b.onclick = () => { const k = b.dataset.k; svp[k] = !svp[k]; saveSvp(); applySvp(); });
      d.getElementById('fsm').onclick = () => { svp.fs = Math.max(14, svp.fs - 2); saveSvp(); applySvp(); };
      d.getElementById('lay').onclick = () => { const order = ['r', 'b', 'l', 't', 'off']; svp.lay = order[(order.indexOf(svp.lay) + 1) % order.length]; d.querySelectorAll('.now-p,.next-p').forEach(x => x.style.width = ''); svp.nw = svp.xw = 0; saveSvp(); applySvp(); };
      d.getElementById('szr').onclick = () => { Object.assign(svp, { ph: 0, pw: 0, nh: 0, nw: 0, xw: 0 }); saveSvp(); ['#pvs', '#nx', '.now-p', '.next-p'].forEach(q => { const x = d.querySelector(q); x.style.width = ''; x.style.height = ''; }); applySvp(); };
      d.getElementById('fsp').onclick = () => { svp.fs = Math.min(48, svp.fs + 2); saveSvp(); applySvp(); };
      // sizing: drag the bar between script and previews; drag the corner of either preview
      const spl = d.getElementById('spl'), pvs = d.getElementById('pvs');
      spl.addEventListener('pointerdown', e => { e.preventDefault(); spl.setPointerCapture(e.pointerId); spl.classList.add('drag'); d.body.classList.add('dragging'); });
      spl.addEventListener('pointermove', e => { if (!spl.classList.contains('drag')) return;
        const m = d.getElementById('main').getBoundingClientRect();
        if (svp.lay === 'b' || svp.lay === 't') { const v = svp.lay === 'b' ? m.bottom - e.clientY : e.clientY - m.top; svp.ph = Math.round(Math.min(m.height - 120, Math.max(140, v))); d.body.style.setProperty('--ph', svp.ph + 'px'); return; }
        const v = svp.lay === 'l' ? e.clientX - m.left : m.right - e.clientX; svp.pw = Math.round(Math.min(m.width - 90, Math.max(200, v))); pvs.style.width = svp.pw + 'px'; });
      spl.addEventListener('pointerup', () => { spl.classList.remove('drag'); d.body.classList.remove('dragging'); saveSvp(); fitPv(d.getElementById('pnow')); fitPv(d.getElementById('pnext')); });
      const sizeT = {};
      [d.querySelector('.now-p'), d.querySelector('.next-p')].forEach(x => (new w.ResizeObserver(() => fitPv(x.querySelector('iframe')))).observe(x));
      d.querySelectorAll('.now-p,.next-p').forEach(x => x.addEventListener('mousedown', () => { if (svp.lay === 'r' || svp.lay === 'l') x.style.width = x.offsetWidth + 'px'; }));
      d.querySelectorAll('.now-p,.next-p').forEach(x => (new w.ResizeObserver(() => { const k = x.classList.contains('now-p') ? 'nw' : 'xw'; if (!x.style.width) return; clearTimeout(sizeT[k]); sizeT[k] = setTimeout(() => { svp[k] = x.offsetWidth; saveSvp(); }, 300); })).observe(x));
      if (svp.pw) pvs.style.width = svp.pw + 'px';
      if (svp.nw) d.querySelector('.now-p').style.width = svp.nw + 'px'; if (svp.xw) d.querySelector('.next-p').style.width = svp.xw + 'px';
      applySvp();
      pvKey = ''; w.addEventListener('resize', () => { fitPv(d.getElementById('pnow')); fitPv(d.getElementById('pnext')); });
      t0 = Date.now();
      const tick = () => { if (!w || w.closed) return; const el = d.getElementById('el'), ck = d.getElementById('ck'); if (el) el.textContent = fmtT((Date.now() - t0) / 1000); if (ck) ck.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
      setInterval(tick, 1000); tick();
    }
    A.refresh(); w.focus();
  }
  const api = {
    toggle() { if (open()) { w.close(); w = null; } else make(); },
    get win() { return open() ? w : null; },
    set voiceAt(v) { voiceAt = v; },
    toast(m) { if (!open()) return; const t = w.document.getElementById('tt'); if (!t) return; t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 4200); },
    sync() { if (!open()) return; const cur = A.cur(); if (cur < 0) return; const s = slides[cur], d = w.document; d.getElementById('ti').textContent = `${cur + 1}/${N}`; d.getElementById('ti').title = title(s); d.getElementById('nm').textContent = ''; if (edSid) { if (edSid === s.id) { previews(); return; } endEd(true); return; }
      const nt = d.getElementById('nt'), keep = nt.scrollTop;
      nt.innerHTML = slides.map((x, i) => `<div class="${i === cur ? 'cur-s' : i < cur ? 'old' : 'fut'}">${sTitle(x, i)}${bulSlide(x, i)}</div>`).join('');
      nt.scrollTop = keep; flow(true); previews(); },
    // bits: status phrases; nx: the next build's and next slide's opening lines (.pvl label + .pv quote, cue words in <q>);
    // held: dim the box while a cue just fired; hear: a one-line "Heard:" transcript while voice listens (the box shows only then)
    status(bits, nx, held, hear) { if (!open()) return; const d = w.document; d.getElementById('st').innerHTML = bits.join(' · '); const x = d.getElementById('nx');
      x.innerHTML = hear || nx.join('') || '<span class="pvl">End of the talk</span>'; x.classList.toggle('held', !hear && !!held); x.classList.toggle('hearing', !!hear); if (hear) x.scrollTop = x.scrollHeight;
    }
  };
  return api;
}
