/* ---------- presenting UI: the HUD, notes strip, slide list, help, timing panel and voice cues ----------
   Drop-in module. Paste this function into the deck's script unchanged and create it once, after the speaker view:
     const ui = makeDeckUI({ ...adapter });
   It injects its own markup (#hud, #hint, #notes, #mic, #toast, #black, #jump, #help, #cues, #bar) and CSS. Call ui.refresh()
   whenever the slide or build changes, ui.arrived(ms) when a slide arrives (ms: how long until it is on screen), and
   ui.reset() after a build comes in. Use ui.cueWords, ui.markCues, ui.buildAt, ui.autoAt and ui.cueFromDblclick in the speaker
   view's adapter, ui.key for its key handler, ui.toast for messages, ui.hear(transcript) to test voice cues.
   Colours and the font are CSS variables (--ui-ink, --ui-mute, --ui-dim, --ui-gold, --ui-leaf, --ui-coral, --ui-sky, --ui-font,
   --ui-btn, --ui-btn-hover, --ui-raise, --ui-sheet, --ui-scrim, --ui-box, --ui-field, --ui-card, --ui-line) set at zero
   specificity, so a deck's own :root{...} rethemes it wherever it sits.

   Adapter (required unless marked optional):
     slides            array of slide elements, in order; each has an id, data-title and a .notes element holding the script,
                       with [BUILD] between the parts of each build and optional <em class="dir"> stage directions;
                       builds are [data-step="k"] elements, cue words data-cue="a, b" on the slide (its arrival) or on a build
     cur(), step()     the current slide index and build
     maxStep(s)        the number of builds on slide s
     go(i, o)          go to slide i (o.toEnd: with every build shown; o.jump: picked from the slide list)
     next(), prev()    move on and back (the clicker)
     reveal(k)         bring the current slide's builds up to k
     timing()          the live timing object { wpm, auto, over } kept in the deck's edit state; over is keyed by slide id
                       (its arrival) or "id:k" (build k), each { at, cue, target } (seconds after arrival, cue words, slide target)
     persist()         store the edit state in the browser (the working copy)
     speaker           the object from makeSpeaker (optional: no Speaker view button without it)
     editing()         true while the editor is open (optional)
     edit()            open or close the editor (E and the Edit button; optional: no Edit button without it)
     quickEdit(el, e)  a double-click on slide text while presenting: open the editor typing there (optional)
     busy()            true while a move plays; voice cues wait (optional)
     surface           the element whose clicks, right-clicks and swipes move on (the stage or viewport)
     sound()           toggle sound, returns true when on (optional: no Sound button without it); soundOn() its state;
                       soundMsg(on) the toast (optional)
     bar(v)            read (no argument) or set the progress bar choice in the edit state (optional: kept per browser)
     blackout(on)      the screen was blanked or shown (optional, e.g. to duck sound)
     onWords(words, s) a deck's own spoken words checked first (e.g. "thank you" on the last slide); true when used (optional)
     keys(e)           the deck's own keys, checked first; true when used (optional)
     help              { E: 'text', M: 'text', ..., rows: [['<kbd>X</kbd>', 'text']] } replaces a row's text or adds rows (optional)
     pauseSecs         seconds a [PAUSE] adds to the timing (default 1.6; "[PAUSE laugh]" 3.2)
     lang              speech recognition language (default 'en-US')
     prefsKey          localStorage key for the notes strip's text size and height
*/
function makeDeckUI(A) {
  const slides = A.slides, N = slides.length, $ = id => document.getElementById(id), title = s => s.dataset.title || '';
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const editing = () => !!(A.editing && A.editing()), sp = () => A.speaker || null, T = () => A.timing();
  const CSS = `:where(:root){--ui-ink:#F2F5F0;--ui-mute:#97AAA3;--ui-dim:#5F726C;--ui-gold:#F6BC4E;--ui-leaf:#8AD6A8;--ui-coral:#F3846B;--ui-sky:#8CC3EC;--ui-font:"Mona Sans","Avenir Next","Segoe UI",system-ui,sans-serif;--ui-btn:rgba(10,22,20,.62);--ui-btn-hover:rgba(24,44,40,.8);--ui-raise:rgba(16,30,27,.86);--ui-sheet:rgba(6,14,12,.95);--ui-scrim:rgba(3,8,7,.93);--ui-box:#0B1715;--ui-field:#050B0A;--ui-card:rgba(16,30,27,.9);--ui-line:rgba(255,255,255,.12)}
:is(#hud,#notes,#toast,#jump,#help,#cues)[hidden],:is(#hud,#notes,#cues,#help) [hidden]{display:none!important}
#hud{position:fixed;right:max(20px,env(safe-area-inset-right,0px));bottom:max(18px,env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:8px;opacity:0;pointer-events:none;transition:opacity .4s;z-index:20;font:600 14px/1 var(--ui-font)}
body.awake #hud,body.edit #hud{opacity:1;pointer-events:auto}body.edit #hud{right:calc(var(--edw,348px) + 20px)}
#hud button,#help button,#cues button,#notes .nctl button{font:inherit;color:var(--ui-ink);background:var(--ui-raise);border:1px solid var(--ui-line);border-radius:10px;padding:10px 13px;cursor:pointer;white-space:nowrap}
#hud button{background:var(--ui-btn);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}#hud button:hover{background:var(--ui-btn-hover)}
#hud button:focus-visible,#help button:focus-visible,#jump button:focus-visible,#cues button:focus-visible,#notes button:focus-visible{outline:2px solid var(--ui-gold);outline-offset:2px}
#counter{color:var(--ui-mute);padding:0 8px;font-variant-numeric:tabular-nums;white-space:nowrap}body.sound #b-sound{color:var(--ui-leaf)}
#hint{position:fixed;left:max(20px,env(safe-area-inset-left,0px));bottom:max(18px,env(safe-area-inset-bottom,0px));font:500 14px/1.4 var(--ui-font);color:var(--ui-mute);opacity:0;transition:opacity .4s;z-index:20;pointer-events:none}
body.awake #hint{opacity:1}body.edit #hint{display:none}@media (max-width:1700px){#hint{display:none}}
#hint kbd,#help kbd{font:600 12px/1 var(--ui-font);padding:3px 6px;border:1px solid rgba(255,255,255,.16);border-radius:5px;color:var(--ui-ink);background:var(--ui-card)}
#bar{position:fixed;left:0;bottom:0;height:2px;width:0;background:linear-gradient(90deg,rgba(242,245,240,0),rgba(242,245,240,.95));opacity:.32;box-shadow:0 0 12px rgba(242,245,240,.35);transition:width 1s cubic-bezier(.16,1,.3,1),opacity 1s ease;z-index:5;pointer-events:none}body.nobar #bar,body.edit #bar{display:none}
#black{position:fixed;inset:0;background:#000;z-index:40;opacity:0;pointer-events:none;transition:opacity .5s}#black.on{opacity:1;pointer-events:auto}
#mic{position:fixed;left:max(14px,env(safe-area-inset-left,0px));top:max(14px,env(safe-area-inset-top,0px));width:10px;height:10px;border-radius:50%;background:var(--ui-leaf);opacity:0;z-index:25;transition:opacity .3s,background .3s,box-shadow .3s;pointer-events:none}
body.voice #mic{opacity:.4}body.voice #mic.hear{opacity:.95;box-shadow:0 0 0 6px rgba(138,214,168,.25)}body.voice #mic.err{background:var(--ui-coral);opacity:.9}
#toast{position:fixed;left:50%;top:max(20px,env(safe-area-inset-top,0px));transform:translateX(-50%);background:var(--ui-sheet);border:1px solid var(--ui-line);border-radius:12px;padding:12px 18px;font:500 16px/1.45 var(--ui-font);color:var(--ui-ink);z-index:60;max-width:min(640px,calc(100% - 32px));box-shadow:0 16px 40px rgba(0,0,0,.45);box-sizing:content-box}
#jump,#help,#cues{position:fixed;inset:0;z-index:50;background:var(--ui-scrim);display:grid;place-items:center;padding:24px;box-sizing:border-box;color:var(--ui-ink)}
#jump .list{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;width:min(1100px,100%);max-height:80vh;overflow:auto}
#jump button{text-align:left;font:500 15px/1.35 var(--ui-font);color:var(--ui-ink);background:var(--ui-card);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px 14px;cursor:pointer}
#jump button span{display:block;color:var(--ui-gold);font-weight:700;font-size:12px;letter-spacing:.12em;margin-bottom:4px}#jump button.cur{border-color:var(--ui-gold)}
#help .box,#cues .box{background:var(--ui-box);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:26px 30px;box-sizing:border-box;font:400 16px/1.6 var(--ui-font)}#help .box{width:min(600px,100%)}
#help h2,#cues h2{font:680 26px/1.2 var(--ui-font);margin:0 0 10px}#help dl{display:grid;grid-template-columns:auto 1fr;gap:6px 18px;margin:0 0 18px}#help dt{margin:0}#help dd{margin:0;color:var(--ui-mute)}
#cues .box{width:min(1040px,100%);max-height:88vh;overflow:auto}#cues .sub{color:var(--ui-mute);margin:0 0 14px}
#cues .pace{display:flex;align-items:center;gap:12px;margin-bottom:12px;font-weight:600}#cues .pace span{color:var(--ui-mute);font-weight:400}
#cues .r{display:grid;grid-template-columns:minmax(0,1fr) 150px minmax(0,1.3fr);gap:12px;align-items:center;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.08);font:500 15px/1.35 var(--ui-font)}
#cues .r.s label{color:var(--ui-gold);font-weight:700}#cues .r.b label{color:var(--ui-mute);padding-left:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#cues .r .lbl2{color:var(--ui-dim);font-size:13px}
#cues input{width:100%;box-sizing:border-box;font:500 15px/1.3 var(--ui-font);color:var(--ui-ink);background:var(--ui-field);border:1px solid var(--ui-line);border-radius:8px;padding:8px 10px;user-select:text;-webkit-user-select:text}
#cues input[type=number]{width:96px}#cues input[type=checkbox]{width:auto}#cues input.changed{border-color:var(--ui-gold)}#cues input:focus-visible{outline:2px solid var(--ui-gold);outline-offset:1px}
#cues .actions{display:flex;gap:10px;justify-content:flex-end;position:sticky;bottom:-26px;background:var(--ui-box);padding:14px 0 4px}@media (max-width:760px){#cues .r{grid-template-columns:1fr}}
#notes{position:fixed;left:max(16px,env(safe-area-inset-left,0px));right:max(16px,env(safe-area-inset-right,0px));bottom:calc(max(18px,env(safe-area-inset-bottom,0px)) + 50px);height:var(--nh,146px);max-height:calc(100vh - 80px);box-sizing:border-box;display:flex;flex-direction:column;gap:4px;padding:8px 22px;background:var(--ui-sheet);border:1px solid var(--ui-line);border-radius:16px;font:400 var(--nfs,18px)/1.45 var(--ui-font);color:var(--ui-ink);z-index:30;box-shadow:0 20px 60px rgba(0,0,0,.5);user-select:none;-webkit-user-select:none}
#nscr{flex:1 1 auto;min-height:0;overflow:hidden;position:relative;-webkit-mask-image:linear-gradient(#000,#000 var(--cut,100%),transparent var(--cut,100%));mask-image:linear-gradient(#000,#000 var(--cut,100%),transparent var(--cut,100%))}
#notes.tall #nscr{-webkit-mask-image:linear-gradient(#000,#000 var(--cut,100%),rgba(0,0,0,.66) calc(var(--cut,100%) + 1.1em),rgba(0,0,0,.4) calc(100% - 2em),transparent);mask-image:linear-gradient(#000,#000 var(--cut,100%),rgba(0,0,0,.66) calc(var(--cut,100%) + 1.1em),rgba(0,0,0,.4) calc(100% - 2em),transparent)}
#nscr::after{content:'';display:block;height:100vh}#nscr .seg{display:block;cursor:text}#nscr .seg.now~.seg{opacity:.5}#nscr .seg.past{color:var(--ui-mute)}
#nscr .b{position:relative;padding-left:1.15em;margin:.08em 0}#nscr .b.l0::before{content:'•';position:absolute;left:.25em}#nscr .b.l1{margin-left:1.4em}#nscr .b.l1::before{content:'◦';position:absolute;left:.25em}#nscr .b.dir{font-style:italic;color:var(--ui-mute)}#nscr .b.dir::before{content:none}
#nscr .pz{color:var(--ui-mute);font-style:italic}#nscr .gt{color:#FF5A4E;font-weight:800;margin-right:.35em}#nscr .bt{color:var(--ui-sky);font-weight:600;font-size:.62em;vertical-align:.2em;margin-right:.4em}
#notes q{color:var(--ui-leaf);font-weight:700;quotes:none}#nscr q.done{color:inherit;opacity:.75;font-weight:600;text-decoration:underline;text-decoration-color:rgba(138,214,168,.5);text-underline-offset:3px}
#ncue{flex:none;font-size:min(16px,.78em);line-height:1.4;color:var(--ui-mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-top:1px solid rgba(255,255,255,.08);padding-top:3px}#ncue:empty{display:none}
#ncue .nk{text-transform:uppercase;letter-spacing:.06em;font-weight:650;font-size:.86em;color:var(--ui-dim);margin-right:.5em}#ncue .nk b{color:var(--ui-gold);text-transform:none;letter-spacing:0}#ncue i{color:var(--ui-mute)}#ncue .hd{color:var(--ui-ink);opacity:.7;margin-left:1.2em}
#notes .nctl{position:absolute;right:10px;top:6px;display:flex;gap:4px;opacity:0;transition:opacity .2s;z-index:2}#notes:hover .nctl,#notes:focus-within .nctl{opacity:1}#notes .nctl button{font:600 13px/1 var(--ui-font);padding:5px 9px;border-radius:8px;min-width:34px}
#notes .ngrip{position:absolute;left:24px;right:24px;top:-6px;height:12px;cursor:ns-resize;z-index:2;touch-action:none}#notes .ngrip::after{content:'';position:absolute;left:50%;top:4px;width:44px;height:4px;margin-left:-22px;border-radius:2px;background:rgba(255,255,255,.28);opacity:0;transition:opacity .2s}#notes:hover .ngrip::after,#notes .ngrip.drag::after{opacity:1}
body.nresize,body.nresize *{cursor:ns-resize!important;user-select:none!important}
@media (pointer:coarse) and (max-width:1100px){#hud{right:50%;transform:translateX(50%);gap:6px}#hud button,#counter{padding:9px 12px}#hud #b-speaker,#hud #b-voice,#hud #b-cues,#hud #b-edit{display:none}#toast{top:12px}}
@media (prefers-reduced-motion:reduce){#bar,#black,#hud,#hint{transition:none}}`;
  const help0 = [['next', '<kbd>→</kbd> <kbd>Space</kbd> <kbd>PgDn</kbd> click', 'Next build, then the next slide'], ['prev', '<kbd>←</kbd> <kbd>PgUp</kbd> right-click', 'Previous slide (shown complete)'],
    ['V', '<kbd>V</kbd>', 'Voice cues: builds and slides come when you say their cue words (Chrome or Edge, with internet)'], ['T', '<kbd>T</kbd>', 'Timing: speaking pace, slide targets, build delays and cue words'],
    ['S', '<kbd>S</kbd>', 'Speaker view: notes, cues and timers in a separate window. Share or project only the slides window.'], ['N', '<kbd>N</kbd>', 'Notes: this slide’s script along the bottom, with the next cue word'],
    ['F', '<kbd>F</kbd> or <kbd>F5</kbd>', 'Fullscreen'], ['B', '<kbd>B</kbd> or <kbd>.</kbd>', 'Blank the screen'], ['G', '<kbd>G</kbd>', 'Jump to any slide'],
    ['E', '<kbd>E</kbd>', 'Edit: move, resize and retype anything'], ['P', '<kbd>P</kbd>', 'Show or hide the progress bar'], ['M', '<kbd>M</kbd>', 'Sound on or off'], ['dbl', 'Double-click', 'Edit that text right away (Esc to finish)']]
    .filter(r => !(r[0] === 'S' && !A.speaker) && !(r[0] === 'E' && !A.edit) && !(r[0] === 'M' && !A.sound) && !(r[0] === 'dbl' && !A.quickEdit));
  const H = A.help || {}, helpRows = help0.map(r => [r[1], H[r[0]] || r[2]]).concat(H.rows || []);
  const hb = (id, label, aria) => `<button id="${id}" type="button"${aria ? ` aria-label="${aria}"` : ''}>${label}</button>`;
  const MARKUP = `<div id="hint">Next slide: <kbd>→</kbd> or clicker · Back: <kbd>←</kbd> · Voice: <kbd>V</kbd>${A.sound ? ' · Sound: <kbd>M</kbd>' : ''} · Fullscreen: <kbd>F</kbd> · Notes: <kbd>N</kbd>${A.edit ? ' · Edit: <kbd>E</kbd>' : ''} · Help: <kbd>?</kbd></div>
<div id="hud">${hb('b-prev', '←', 'Previous slide')}<span id="counter">1 / ${N}</span>${hb('b-next', '→', 'Next slide')}${hb('b-voice', 'Voice: off')}${A.sound ? hb('b-sound', 'Sound: off') : ''}${hb('b-cues', 'Timing')}${hb('b-notes', 'Notes')}${A.speaker ? hb('b-speaker', 'Speaker view') : ''}${hb('b-jump', 'Slides')}${A.edit ? hb('b-edit', 'Edit') : ''}${hb('b-fs', 'Fullscreen')}</div>
<div id="notes" hidden aria-label="Speaker notes"><div class="ngrip" title="Drag to change the height"></div><div class="nctl"><button type="button" id="n-sm" title="Smaller notes">A−</button><button type="button" id="n-sp" title="Larger notes">A+</button></div><div id="nscr"></div><div id="ncue"></div></div>
<div id="mic" aria-hidden="true"></div><div id="toast" role="status" hidden></div><div id="black"></div><div id="bar"></div>
<div id="jump" hidden><div class="list" id="jumplist"></div></div>
<div id="cues" hidden><div class="box">
 <h2>Timing and voice cues</h2>
 <p class="sub">One click or one cue per slide. Builds inside a slide wait for your click; each click shows the next build, then moves to the next slide. With voice on, a build also appears when its words are heard, and the next slide comes when any of its words is heard. Each slide has a target time; a blank target or build time follows your pace. Timed builds (below) are optional. Separate words with commas. Quicker: in Notes or Speaker view, double-click any word in the script to add it as a cue, or double-click a green word to drop it (useful for names the mic can’t catch). Changes are kept in this browser; Save (press E) writes them into the deck file.</p>
 <div class="pace"><label for="pace">Speaking pace</label><input id="pace" type="number" min="100" max="200" step="5"><span>words per minute</span></div>
 <label class="pace" style="gap:10px;cursor:pointer"><input id="autob" type="checkbox"> <span>With voice off, also show builds on their own, timed to your pace (off: builds wait for your click)</span></label>
 <div id="cuelist"></div>
 <div class="actions"><button type="button" id="cues-reset">Reset all to defaults</button><button type="button" id="cues-close">Done</button></div>
</div></div>
<div id="help" hidden><div class="box"><h2>Presenting</h2><dl>${helpRows.map(([k, t]) => `<dt>${k}</dt><dd>${t}</dd>`).join('')}</dl><button type="button" id="help-close">Close</button></div></div>`;
  { const st = document.createElement('style'); st.id = 'deck-ui-css'; st.textContent = CSS; document.head.appendChild(st);
    const box = document.createElement('div'); box.innerHTML = MARKUP; document.body.append(...box.childNodes); }

  /* ---------- timing: builds follow the script at the speaker's pace ---------- */
  const PAUSE = +A.pauseSecs || 1.6;
  function spoken(s) { const n = s.querySelector('.notes'); if (!n) return ''; const c = n.cloneNode(true); c.querySelectorAll('.dir').forEach(e => e.remove()); return c.textContent; }
  function secs(txt) {
    const pauses = (txt.match(/\[PAUSE[^\]]*\]/g) || []).reduce((a, p) => a + (/laugh/i.test(p) ? 3.2 : PAUSE), 0);
    const clean = txt.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
    return (clean.match(/[A-Za-z0-9’']+/g) || []).length / ((+T().wpm || 140) / 60) + pauses;
  }
  function defaultTimes(s) { const parts = spoken(s).split('[BUILD]'), out = []; let acc = 1; /* a beat between the click and the first word */ for (let k = 0; k < parts.length - 1; k++) { acc += secs(parts[k]); out.push(Math.round(acc * 10) / 10); } return out; }
  const num = v => v !== undefined && v !== '' && v !== null && !isNaN(+v);
  function targetOf(s) { const o = T().over[s.id]; return o && num(o.target) ? +o.target : Math.round(secs(spoken(s)) + 6); }
  const stepEl = (s, k) => s.querySelector(`[data-step="${k}"][data-cue]`) || s.querySelector(`[data-step="${k}"]`);
  function buildAt(s, k) { const o = T().over[s.id + ':' + k]; return o && num(o.at) ? +o.at : defaultTimes(s)[k - 1] ?? 3; }
  function cueWords(key) {
    const o = T().over[key]; let txt;
    if (o && typeof o.cue === 'string') txt = o.cue;
    else { const [sid, k] = key.split(':'), s = document.getElementById(sid), el = s && (k ? stepEl(s, +k) : s); txt = (el && el.dataset.cue) || ''; }
    return txt.split(',').map(w => w.trim()).filter(Boolean);
  }
  const autoAt = (s, k) => T().auto ? buildAt(s, k) : null;

  /* ---------- words: what the microphone hears, and cue words in the script ---------- */
  const NUMW = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', seventeen: '17', twenty: '20', thirty: '30', forty: '40', fifty: '50' };
  function norm(t) { return String(t).toLowerCase().replace(/[’'`]/g, '').replace(/(\d),(?=\d{3})/g, '$1').replace(/%/g, ' percent ').replace(/\+/g, ' plus ').replace(/-/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map(w => NUMW[w] || w); }
  const same = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a)));
  const heardAny = (words, cues) => cues.some(c => { const w = norm(c)[0]; return w && words.some(x => same(x, w)); });
  // cue words coloured inside the script (green ahead, underlined once used); text inside tags is left alone
  function markCues(html, cues, used) {
    const cw = cues.map(c => norm(c)[0]).filter(Boolean); if (!cw.length) return html;
    return html.split(/(<[^>]+>)/).map(p => p.startsWith('<') ? p : p.replace(/[A-Za-z0-9’']+/g, w => { const n = norm(w)[0]; return n && cw.some(c => same(n, c)) ? `<q class="${used ? 'done' : ''}">${w}</q>` : w; })).join('');
  }

  /* ---------- HUD and overlays ---------- */
  const toggle = (id, force) => { const el = $(id); el.hidden = force === undefined ? !el.hidden : !force; return !el.hidden; };
  const black = $('black');
  const setBlack = on => { const was = black.classList.contains('on'); black.classList.toggle('on', on); if (was !== on && A.blackout) A.blackout(on); };
  black.addEventListener('click', () => setBlack(false));
  let toastT; function toast(msg, ms = 5200) { try { const s = sp(); s && s.toast(msg); } catch (er) {} const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }
  function toggleFS() { try { if (document.fullscreenElement) document.exitFullscreen(); else { const r = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } } catch (e) {} }
  let barLocal = true; try { barLocal = localStorage.getItem((A.prefsKey || 'deck-ui') + '-bar') !== '0'; } catch (e) {}
  const barOn = () => A.bar ? A.bar() !== false : barLocal;
  function toggleBar(force) { const v = force === undefined ? !barOn() : !!force; if (A.bar) A.bar(v); else { barLocal = v; try { localStorage.setItem((A.prefsKey || 'deck-ui') + '-bar', v ? '1' : '0'); } catch (e) {} } document.body.classList.toggle('nobar', !v); return v; }
  document.body.classList.toggle('nobar', !barOn());
  function soundBtn() { const b = $('b-sound'); if (!b) return; const on = !!(A.soundOn && A.soundOn()); b.textContent = on ? 'Sound: on' : 'Sound: off'; document.body.classList.toggle('sound', on); }
  function toggleSound() { if (!A.sound) return; const v = A.sound(); soundBtn(); toast(A.soundMsg ? A.soundMsg(v) : v ? 'Sound on. M turns it off.' : 'Sound off. M turns it back on.', 3200); }
  const jl = $('jumplist');
  slides.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span>`; b.append(document.createTextNode(title(s))); b.addEventListener('click', e => { e.stopPropagation(); toggle('jump', false); A.go(i, { jump: true }); }); jl.appendChild(b); });
  $('jump').addEventListener('click', () => toggle('jump', false));
  $('help-close').addEventListener('click', () => toggle('help', false));
  const btn = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', e => { e.stopPropagation(); fn(); e.currentTarget.blur(); }); };
  btn('b-prev', () => A.prev()); btn('b-next', () => A.next()); btn('b-notes', () => toggleNotes()); btn('b-jump', () => toggle('jump')); btn('b-fs', toggleFS);
  btn('b-voice', () => voice.toggle()); btn('b-speaker', () => sp() && sp().toggle()); btn('b-cues', () => openCues()); btn('b-edit', () => A.edit()); btn('b-sound', toggleSound); soundBtn();
  $('cues-close').addEventListener('click', () => { toggle('cues', false); refresh(); });
  function closeAll() { toggle('notes', false); toggle('cues', false); toggle('jump', false); toggle('help', false); setBlack(false); }

  /* ---------- the notes strip: this slide's script as a lower third, the current part at the top, the next lines at half ---------- */
  const NKEY = (A.prefsKey || 'deck-ui') + '-notes', NH0 = 146;   // the default height: under 150 px at any window size
  const np = Object.assign({ fs: 18, h: 0 }, (() => { try { return JSON.parse(localStorage.getItem(NKEY) || '{}'); } catch (e) { return {}; } })());
  const saveNp = () => { try { localStorage.setItem(NKEY, JSON.stringify(np)); } catch (e) {} };
  const notesEl = $('notes'), scr = $('nscr'), cueEl = $('ncue');
  const clampH = h => Math.round(Math.max(60, Math.min(innerHeight * .5, h)));
  function applyNp() { notesEl.style.setProperty('--nfs', np.fs + 'px'); const h = np.h ? clampH(np.h) : Math.min(NH0, clampH(NH0)); notesEl.style.setProperty('--nh', h + 'px'); notesEl.classList.toggle('tall', h > NH0); }
  applyNp(); addEventListener('resize', () => { applyNp(); if (!notesEl.hidden) flow(false); });
  $('n-sm').addEventListener('click', e => { e.stopPropagation(); np.fs = Math.max(14, np.fs - 2); saveNp(); applyNp(); flow(false); });
  $('n-sp').addEventListener('click', e => { e.stopPropagation(); np.fs = Math.min(48, np.fs + 2); saveNp(); applyNp(); flow(false); });
  { const g = notesEl.querySelector('.ngrip'); let y0 = 0, h0 = 0;
    g.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); g.setPointerCapture(e.pointerId); g.classList.add('drag'); document.body.classList.add('nresize'); y0 = e.clientY; h0 = notesEl.offsetHeight; });
    g.addEventListener('pointermove', e => { if (!g.classList.contains('drag')) return; np.h = clampH(h0 + y0 - e.clientY); applyNp(); flow(false); });
    const end = () => { if (!g.classList.contains('drag')) return; g.classList.remove('drag'); document.body.classList.remove('nresize'); saveNp(); };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end); g.addEventListener('dblclick', () => { np.h = 0; saveNp(); applyNp(); flow(false); }); }
  notesEl.addEventListener('click', e => e.stopPropagation());
  // the script as bullets, like the speaker view: a main point, shorter follow-ons indented, a red > on every click
  function sents(line) { const parts = line.replace(/\s+/g, ' ').trim().split(/(?<!\bv\.)(?<!\bp\.)(?<=[.?!])([”"’)]*)\s+(?=[A-Z“"\[(])/); const out = []; let buf = '';
    parts.forEach((x, i) => { if (i % 2 === 0) buf += x || ''; else { buf += x || ''; out.push(buf.trim()); buf = ''; } }); if (buf.trim()) out.push(buf.trim());
    const res = []; out.forEach(t => { const m = t.match(/^((?:\[[^\]]+\]\s*)+)(.*)$/); if (res.length && m) { res[res.length - 1] += ' ' + m[1].trim(); t = m[2].trim(); } if (t) res.push(t); }); return res; }
  function bul(html, cues, used, lead) { const tmp = document.createElement('div'); tmp.innerHTML = html; const out = []; let txt = '';
    const flush = () => { txt.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => { const ss = sents(line); if (!ss.length) return; let head = ss[0]; const rest = ss.slice(1);
      while (rest.length && head.length + rest[0].length < 70) head += ' ' + rest.shift(); const mg = []; rest.forEach(x => { if (mg.length && mg[mg.length - 1].length + x.length < 80) mg[mg.length - 1] += ' ' + x; else mg.push(x); });
      out.push({ t: head, l: 0 }); mg.forEach(x => out.push({ t: x, l: 1 })); }); txt = ''; };
    tmp.childNodes.forEach(n => { if (n.nodeType === 1 && n.matches('em.dir')) { flush(); out.push({ t: n.textContent, dir: 1 }); } else txt += n.textContent; }); flush();
    if (!out.length && lead) out.push({ t: '', l: 0 });
    return out.map((o, i) => { const pre = i === 0 && lead ? lead : '';
      return o.dir ? `<div class="b dir">${pre}${esc(o.t)}</div>` : `<div class="b l${o.l}">${pre}${markCues(esc(o.t), cues, used).replace(/\[(PAUSE|pause)\]/g, '<i class="pz">[pause]</i>')}</div>`; }).join(''); }
  function notesHTML() { const cur = A.cur(), step = A.step(), s = slides[cur], n = s.querySelector('.notes'), on = voice.on;
    return (n ? n.innerHTML : '').split('[BUILD]').map((h, k) => { const key = k ? s.id + ':' + k : s.id, at = k && !on ? autoAt(s, k) : null;
      const tag = k ? `<span class="bt">[${on ? 'build on cue' : at != null ? `builds at ${(+at).toFixed(0)} s` : 'click'}${k <= step ? ', shown' : ''}]</span>` : '';
      return `<div class="seg${k === step ? ' now' : k < step ? ' past' : ''}" data-k="${k}">${bul(h, cueWords(key), k <= step, k ? `<b class="gt">&gt;</b>${tag}` : '')}</div>`; }).join(''); }
  // the line boxes of the text in els (screen px), one entry per visual line
  function lineBoxes(els, lh) { const L = [], r = document.createRange();
    els.forEach(el => { const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { if (!n.textContent.trim()) continue; r.selectNodeContents(n);
      for (const q of r.getClientRects()) { if (q.height < 2 || q.width < 1) continue; const c = (q.top + q.bottom) / 2, g = L.find(l => Math.abs(l.c - c) < lh * .5); if (g) { g.top = Math.min(g.top, q.top); g.bottom = Math.max(g.bottom, q.bottom); } else L.push({ c, top: q.top, bottom: q.bottom }); } } });
    return L.sort((a, b) => a.top - b.top); }
  let voiceAt = 0, glideId = 0;
  function flow(smooth) { if (notesEl.hidden) return; const el = scr.querySelector('.seg.now'); if (!el) return;
    const br = scr.getBoundingClientRect(), lh = parseFloat(getComputedStyle(scr).lineHeight) || np.fs * 1.45, er = el.getBoundingClientRect(), target = Math.max(0, er.top - br.top + scr.scrollTop);
    scr.style.visibility = scr.clientHeight < lh * .9 ? 'hidden' : '';   // dragged too short for a whole line: only the cue line
    // the cut: the current part and the next two lines of this slide's script; past it nothing shows (a taller strip fades on, as the speaker view)
    const after = []; for (let x = el.nextElementSibling; x; x = x.nextElementSibling) after.push(x);
    const ls = lineBoxes(after, lh), endAt = ls.length ? ls[Math.min(1, ls.length - 1)].bottom : er.bottom;
    scr.style.setProperty('--cut', Math.round(Math.max(er.bottom, endAt) - br.top + scr.scrollTop - target + 2) + 'px');
    glide(target, !smooth ? 0 : voiceAt ? 1500 : 450); }
  // our own scroll animation, so a move a spoken cue causes can run at 30% of the normal speed (450 ms vs 1.5 s), as in the speaker view
  function glide(to, ms) { const id = ++glideId; if (!ms) { scr.scrollTop = to; return; } const from = scr.scrollTop, t0 = performance.now(), ez = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const stepF = () => { if (id !== glideId) return; const t = Math.min(1, (performance.now() - t0) / ms); scr.scrollTop = from + (to - from) * ez(t); if (t < 1) requestAnimationFrame(stepF); }; requestAnimationFrame(stepF); }
  // the next cue: the next build's words while builds remain, then the next slide's; nothing after the last build of the talk
  function cueLine(heard) { const cur = A.cur(), step = A.step(), s = slides[cur]; if (!s) return '';
    const qs = ws => ws.length ? ws.map(w => `<q>${esc(w)}</q>`).join(', ') : '<i>no cue word: click</i>';
    let h = ''; if (step < A.maxStep(s)) h = `<span class="nk">Next build</span>${qs(cueWords(s.id + ':' + (step + 1)))}`;
    else if (slides[cur + 1]) h = `<span class="nk">Next slide · <b>${esc(title(slides[cur + 1]))}</b></span>${qs(cueWords(slides[cur + 1].id))}`;
    return h && heard ? h + heard : h; }
  function renderNotes() { if (notesEl.hidden || A.cur() < 0) return; const keep = scr.scrollTop; scr.innerHTML = notesHTML(); scr.scrollTop = keep; flow(true); voice.render(); }
  function toggleNotes(force) { const on = toggle('notes', force); if (on) { scr.innerHTML = ''; renderNotes(); flow(false); } return on; }
  scr.addEventListener('dblclick', e => cueFromDblclick(window, e));

  /* ---------- voice: one cue per slide, words heard early pull a build forward ---------- */
  const voice = (() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null, on = false, words = [], mark = 0, lastErr = '', retry = 400, hearT, arrivedAt = 0, lastNx = [], heldNx = [], holdUntil = 0, holdT;
    const HOLD = 2200, mic = $('mic');
    function setBtn() { $('b-voice').textContent = on ? 'Voice: on' : 'Voice: off'; document.body.classList.toggle('voice', on); }
    // a preview of what you say next: from the start, through the sentence holding the first cue word (cue words highlighted)
    function preview(txt, cues) {
      const clean = String(txt || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim(); if (!clean) return '…';
      const ss = clean.match(/[^.?!]+[.?!]+[”’"']*|[^.?!]+$/g) || [clean], cw = cues.map(c => norm(c)[0]).filter(Boolean);
      const hit = w => { const n = norm(w)[0]; return n && cw.some(c => same(n, c)); };
      let out = [], found = false;
      for (const sn of ss) { out.push(sn.trim()); if (sn.split(/\s+/).some(hit)) { found = true; break; } if (out.length >= 3) break; }
      if (!found) out = out.slice(0, 1);
      let t = out.join(' '); if (t.length > 260) t = t.slice(0, 257).replace(/\s+\S*$/, '') + '…';
      return '“' + t.split(/(\s+)/).map(w => /^\s+$/.test(w) ? w : hit(w) ? `<q>${esc(w)}</q>` : esc(w)).join('') + (t.length < clean.length && !t.endsWith('…') ? ' …' : '') + '”';
    }
    function render() {
      const cur = A.cur(), step = A.step(), s = slides[cur]; if (!s) return;
      const nextS = slides[cur + 1], max = A.maxStep(s), bits = [], nx = [];
      if (step < max) { const at = buildAt(s, step + 1), el = (performance.now() - arrivedAt) / 1000, key = s.id + ':' + (step + 1);
        bits.push(on ? 'Next build: say a green word above (or click).' : T().auto ? `Next build at ${at.toFixed(0)} s (now ${Math.max(0, el).toFixed(0)} s), or click` : 'Next build: click.');
        nx.push(`<span class="pvl">Next build</span><span class="pv">${preview(spoken(s).split('[BUILD]')[step + 1], cueWords(key))}</span>`); }
      if (nextS) { bits.push(on ? (step < max ? 'Next slide: listens once the builds are done.' : '') : 'Voice is off. Click for the next slide, or press <b>V</b>.');
        nx.push(`<span class="pvl">Next slide · <b class="pvt">${esc(title(nextS))}</b></span><span class="pv">${preview(spoken(nextS).split('[BUILD]')[0], cueWords(nextS.id))}</span>`); }
      else bits.push(on ? 'Last slide.' : 'Last slide. Click to end.');
      const held = performance.now() < holdUntil, show = held ? heldNx : nx; lastNx = show;
      const live = step < max ? cueWords(s.id + ':' + (step + 1)) : nextS ? cueWords(nextS.id) : [], ws = words.slice(Math.max(mark, words.length - 16));
      let hear = null;
      if (on) hear = `<div class="hear"><b>Heard:</b> ${ws.length ? markCues(esc(ws.join(' ')), live, false) : '<span style="color:#5F726C">listening…</span>'}${lastErr ? ` <span style="color:#FF7A6E">(${esc(lastErr)})</span>` : ''}</div>`;
      const s0 = sp(); if (s0) s0.status(bits.filter(Boolean), show, held, hear);
      if (!notesEl.hidden) cueEl.innerHTML = cueLine(on ? `<span class="hd">heard: ${ws.length ? markCues(esc(ws.slice(-8).join(' ')), live, false) : 'listening…'}${lastErr ? ` (${esc(lastErr)})` : ''}</span>` : '');
    }
    function check() {
      if (editing() || (A.busy && A.busy())) return;
      const w = words.slice(mark); if (!w.length) return;
      const cur = A.cur(), step = A.step(), s = slides[cur], since = (performance.now() - arrivedAt) / 1000;
      if (A.onWords && A.onWords(w, s)) { mark = words.length; return; }
      if (step < A.maxStep(s)) { const k = step + 1; if (since > .4 && heardAny(w, cueWords(s.id + ':' + k))) { mark = words.length; A.reveal(k); return; } }
      const nx = slides[cur + 1];
      if (nx && step >= A.maxStep(s) && since > 2.5 && heardAny(w, cueWords(nx.id))) { mark = words.length; A.go(cur + 1); }
    }
    function hear(t) {
      words = norm(t); if (mark > words.length) mark = words.length;
      lastErr = ''; mic.classList.remove('err'); mic.classList.add('hear'); clearTimeout(hearT); hearT = setTimeout(() => mic.classList.remove('hear'), 500);
      // set while the result is handled, so a move a spoken cue causes glides slower in the notes and the speaker view
      voiceAt = performance.now(); const s0 = sp(); if (s0) s0.voiceAt = voiceAt; try { check(); } finally { voiceAt = 0; if (s0) s0.voiceAt = 0; } render();
    }
    function start() {
      if (!SR) { toast('Voice cues need Chrome or Edge (or Safari with Siri turned on). Your clicker still works.'); return false; }
      if (!rec) {
        rec = new SR(); rec.lang = A.lang || 'en-US'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
        rec.onresult = e => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + ' '; hear(t); };
        rec.onerror = e => {
          lastErr = e.error; mic.classList.add('err');
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { on = false; setBtn(); toast('The microphone is blocked here. Open the deck file in Chrome or Edge and allow the microphone when asked.', 8000); }
          else if (e.error === 'network') { retry = 3000; toast('Voice cues need an internet connection (the browser sends audio to its speech service). Your clicker still works.', 7000); }
          else if (e.error === 'audio-capture') { on = false; setBtn(); toast('No microphone found. Check the input device, then press V again.', 7000); }
          render();
        };
        rec.onstart = () => { retry = 400; };
        rec.onend = () => { words = []; mark = 0; if (on) setTimeout(() => { if (on) { try { rec.start(); } catch (e) {} } }, retry); render(); };
      }
      try { rec.start(); } catch (e) {}
      on = true; setBtn(); render(); return true;
    }
    function stop() { on = false; setBtn(); try { rec && rec.stop(); } catch (e) {} render(); }
    return {
      get on() { return on; },
      toggle() { if (on) { stop(); toast('Voice cues off. Use the clicker.', 2500); } else if (start()) toast('Voice cues on. Press N to see the next cue word.', 3500); refresh(); },
      reset() { mark = words.length; if (lastNx.length && performance.now() >= holdUntil) { heldNx = lastNx; holdUntil = performance.now() + HOLD; clearTimeout(holdT); holdT = setTimeout(render, HOLD + 30); } render(); },
      arrived(ms) { arrivedAt = performance.now() + (ms || 0); this.reset(); },
      hear, render
    };
  })();
  setInterval(() => { if (!notesEl.hidden || (sp() && sp().win)) voice.render(); }, 1000);
  // double-click a word in the notes (or the speaker view) to make it a cue for that part of the script, or to drop it
  function cueFromDblclick(win, e) {
    const seg = e.target.closest && e.target.closest('.seg'); if (!seg || A.cur() < 0) return;
    const word = String(win.getSelection ? win.getSelection().toString() : '').trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9’']+$/g, '');
    try { win.getSelection().removeAllRanges(); } catch (er) {}
    if (!word || /\s/.test(word)) return;
    toggleCue(slides[A.cur()], +seg.dataset.k, word, win === window ? m => toast(m, 4200) : m => sp() && sp().toast(m));   // speaker-view edits never show on the shared screen
  }
  function toggleCue(s, k, word, say = m => toast(m, 4200)) {
    const key = k ? s.id + ':' + k : s.id, w = norm(word)[0]; if (!w) return;
    const list = cueWords(key), i = list.findIndex(c => norm(c)[0] === w), clean = word.toLowerCase().replace(/[’']/g, ''), cur = slides.indexOf(s);
    let msg;
    if (i >= 0) { list.splice(i, 1); msg = `Removed “${clean}”.` + (list.length ? ` Listening for: ${list.join(', ')}.` : ' No cue words left here; use the clicker.'); }
    else {
      list.push(clean); msg = `Added “${clean}”. Listening for: ${list.join(', ')}.`;
      const segs = spoken(s).split('[BUILD]'), before = k ? segs[k - 1] : (slides[cur - 1] ? spoken(slides[cur - 1]).split('[BUILD]').pop() : '');
      if (norm(before.replace(/\[[^\]]*\]/g, ' ')).some(x => same(x, w))) msg += ` Careful: “${clean}” is also said just before this point, so it may fire early.`;
    }
    const ov = T().over[key] || (T().over[key] = {}); ov.cue = list.join(', '); A.persist();
    say(msg + (k === 0 ? ' (This part brings in this slide.)' : '')); refresh();
  }

  /* ---------- the timing panel: pace, slide targets, build times and cue words ---------- */
  function numInput(val, ph, label, onIn) {
    const at = document.createElement('input'); at.type = 'number'; at.min = '0'; at.step = '0.5'; at.setAttribute('aria-label', label);
    at.value = val; at.placeholder = ph; at.classList.toggle('changed', at.value !== '');
    at.addEventListener('input', () => { onIn(at.value); at.classList.toggle('changed', at.value !== ''); A.persist(); });
    return at;
  }
  const ovr = key => T().over[key] || (T().over[key] = {});
  function openCues() {
    $('pace').value = T().wpm; $('autob').checked = !!T().auto;
    const list = $('cuelist'); list.textContent = '';
    slides.forEach((s, i) => {
      const rows = [{ key: s.id, label: `${i + 1}. ${title(s)}`, cls: 's', arrive: i > 0, s }];
      for (let k = 1; k <= A.maxStep(s); k++) { const el = stepEl(s, k), txt = (el ? (tw => { let o = '', gap = false, blk = null; const blockOf = n => { let e = n.parentElement; while (e && e !== el && /^inline/.test(getComputedStyle(e).display)) e = e.parentElement; return e; }; while (tw.nextNode()) { const n = tw.currentNode; if (n.nodeType === 1) { if (n.tagName === 'BR') gap = true; continue; } const b = blockOf(n); if (o && (gap || b !== blk)) o += ' '; o += n.nodeValue; gap = false; blk = b; } return o; })(document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)) : '').replace(/\s+/g, ' ').trim().slice(0, 48); /* a space where a new line or block starts, so words on separate lines don't run together */ rows.push({ key: s.id + ':' + k, label: `build ${k}${txt ? ': ' + txt : ''}`, cls: 'b', s, k }); }
      rows.forEach(r => {
        const row = document.createElement('div'); row.className = 'r ' + r.cls;
        const id = 'cue-' + r.key.replace(/[^a-z0-9]/gi, '-'), o = T().over[r.key] || {};
        const lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = r.label; row.appendChild(lab);
        const mid = document.createElement('div'), sfx = t => { const x = document.createElement('span'); x.className = 'lbl2'; x.textContent = t; return x; };
        if (r.cls === 'b') { const at = numInput(num(o.at) ? o.at : '', (defaultTimes(r.s)[r.k - 1] ?? 3).toFixed(1), 'Seconds after the slide appears', v => { const ov = ovr(r.key); if (v === '') delete ov.at; else ov.at = +v; }); at.id = id + '-at'; at.dataset.sid = r.s.id; at.dataset.k = r.k; at.classList.add('bat'); mid.append(at, sfx(' s')); }
        else { const tg = numInput(num(o.target) ? o.target : '', String(Math.round(secs(spoken(r.s)) + 6)), 'Target seconds for this slide', v => { const ov = ovr(r.key); if (v === '') delete ov.target; else ov.target = +v; }); tg.id = id + '-tg'; tg.dataset.sid = r.s.id; tg.classList.add('tgt'); mid.append(tg, sfx(' s target')); }
        row.appendChild(mid);
        if (r.cls === 'b' || r.arrive) {
          const inp = document.createElement('input'); inp.type = 'text'; inp.id = id; inp.autocomplete = 'off'; inp.spellcheck = false;
          inp.value = cueWords(r.key).join(', '); inp.placeholder = r.cls === 'b' ? 'words that bring this build in early' : 'any of these words moves to this slide';
          inp.classList.toggle('changed', typeof o.cue === 'string');
          inp.addEventListener('input', () => { ovr(r.key).cue = inp.value; inp.classList.add('changed'); A.persist(); voice.render(); });
          row.appendChild(inp);
        } else row.appendChild(document.createElement('div'));
        list.appendChild(row);
      });
    });
    toggle('cues', true);
  }
  $('pace').addEventListener('input', () => { const v = +$('pace').value; if (v >= 80 && v <= 220) { T().wpm = v; A.persist();
    document.querySelectorAll('#cuelist input.bat').forEach(inp => { inp.placeholder = (defaultTimes(document.getElementById(inp.dataset.sid))[+inp.dataset.k - 1] ?? 3).toFixed(1); });
    document.querySelectorAll('#cuelist input.tgt').forEach(inp => { inp.placeholder = String(Math.round(secs(spoken(document.getElementById(inp.dataset.sid))) + 6)); }); } });
  $('autob').addEventListener('change', e => { T().auto = e.target.checked; A.persist(); refresh(); toast(T().auto ? 'Builds now also appear on their own, timed to your pace (voice off).' : 'Builds now wait for your click (or cue word).', 3000); });
  $('cues-reset').addEventListener('click', () => { const t = T(); t.wpm = 140; t.auto = false; t.over = {}; A.persist(); openCues(); toast('Timing and cues reset to the defaults.', 2500); });

  /* ---------- input: the presenting keys, clicks, swipes ---------- */
  function key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (A.keys && A.keys(e)) return;
    const k = e.key, t = e.target;
    if (t && t.closest && t.closest('input,textarea,select')) { if (k === 'Escape') { t.blur(); toggle('cues', false); refresh(); } return; }
    const overlay = !$('jump').hidden || !$('help').hidden || !$('cues').hidden;
    if (editing() && !(overlay && k === 'Escape') && !/^[fFsSmMgGoO?hHpP]$/.test(k)) return;   // the editor has the other keys
    if (k === 'Escape') { toggle('jump', false); toggle('help', false); toggle('cues', false); setBlack(false); return; }
    if (overlay && !['g', 'G', 'o', 'O', '?', 't', 'T', 'c', 'C'].includes(k)) return;
    const bl = black.classList.contains('on');
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Spacebar', 'Enter', 'MediaTrackNext'].includes(k)) { e.preventDefault(); if (bl) setBlack(false); else A.next(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'MediaTrackPrevious'].includes(k)) { e.preventDefault(); if (bl) setBlack(false); else A.prev(); }
    else if (k === 'Home') { e.preventDefault(); A.go(0); }
    else if (k === 'End') { e.preventDefault(); A.go(N - 1, { toEnd: true }); }
    else if (k === 'f' || k === 'F' || k === 'F5') { e.preventDefault(); toggleFS(); }
    else if (['b', 'B', '.', 'w', 'W', ','].includes(k)) setBlack(!bl);
    else if (k === 'n' || k === 'N') toggleNotes();
    else if (['g', 'G', 'o', 'O'].includes(k)) toggle('jump');
    else if (k === 'v' || k === 'V') voice.toggle();
    else if (['t', 'T', 'c', 'C'].includes(k)) { if ($('cues').hidden) openCues(); else { toggle('cues', false); refresh(); } }
    else if ((k === 'e' || k === 'E') && A.edit) { e.preventDefault(); A.edit(); }
    else if ((k === 's' || k === 'S') && sp()) { e.preventDefault(); sp().toggle(); }
    else if (k === 'm' || k === 'M') toggleSound();
    else if (k === 'p' || k === 'P') { const v = toggleBar(); toast(v ? 'Progress bar shown. P hides it.' : 'Progress bar hidden. P shows it.', 2200); }
    else if (k === '?' || k === 'h' || k === 'H' || k === '/') toggle('help');
  }
  document.addEventListener('keydown', key);
  const surf = A.surface || document.body;
  let hadFocus = document.hasFocus();
  addEventListener('pointerdown', () => { hadFocus = document.hasFocus(); }, true);
  // a single click advances after a short wait, so a double-click on slide text can open it for editing instead (quick edit)
  let clickT = null, clickAt = 0, pendingDbl = false, dblT = null;
  surf.addEventListener('click', e => { if (editing() || e.target.closest('button')) return; if (!hadFocus) { hadFocus = true; return; }
    if (!A.quickEdit) { A.next(); return; }
    if (clickT && e.timeStamp - clickAt < 380) { clearTimeout(clickT); clickT = null; pendingDbl = true; clearTimeout(dblT); dblT = setTimeout(() => { if (pendingDbl) { pendingDbl = false; A.next(); } }, 600); return; }   // the second click of a double-click
    if (clickT) { clearTimeout(clickT); clickT = null; A.next(); }   // an earlier click still waiting (a busy moment): honour it now, never drop it
    clickAt = e.timeStamp; clickT = setTimeout(() => { clickT = null; A.next(); }, 280); });
  surf.addEventListener('dblclick', e => { if (!pendingDbl) return; clearTimeout(clickT); clearTimeout(dblT); clickT = null; pendingDbl = false; if (editing()) return;
    if (!A.quickEdit(e.target, e)) A.next(); });
  surf.addEventListener('contextmenu', e => { if (editing()) return; e.preventDefault(); A.prev(); });
  let tx = null;
  surf.addEventListener('touchstart', e => { if (editing()) return; tx = e.touches[0].clientX; }, { passive: true });
  surf.addEventListener('touchend', e => { if (editing() || tx === null) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 50) { dx < 0 ? A.next() : A.prev(); } }, { passive: true });
  let idleT;
  function wake() { document.body.classList.add('awake'); document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => { if (editing()) return; document.body.classList.remove('awake'); document.body.classList.add('idle'); }, 2600); }
  addEventListener('mousemove', wake);
  document.body.classList.add('awake'); idleT = setTimeout(() => document.body.classList.remove('awake'), 6000);
  let lock = null; async function keepAwake() { try { if (!lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (e) {} }
  addEventListener('keydown', keepAwake); addEventListener('click', keepAwake);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(); });

  function refresh() {
    const cur = A.cur(); if (cur < 0) return;
    $('counter').textContent = `${cur + 1} / ${N}`;
    $('bar').style.width = (N > 1 ? cur / (N - 1) * 100 : 100) + '%';
    jl.querySelectorAll('button').forEach((b, i) => b.classList.toggle('cur', i === cur));
    const eb = $('b-edit'); if (eb) eb.textContent = editing() ? 'Done editing' : 'Edit';
    soundBtn(); renderNotes(); voice.render();
    const s0 = sp(); if (s0) s0.sync();
  }
  return {
    refresh, toast, key, closeAll, openCues, toggle, cueWords, markCues, buildAt, autoAt, targetOf, defaultTimes, spoken, norm, same, cueFromDblclick, toggleCue,
    arrived: ms => voice.arrived(ms), reset: () => voice.reset(), hear: t => voice.hear(t), toggleVoice: () => voice.toggle(), notes: f => toggleNotes(f), bar: f => toggleBar(f),
    get voice() { return voice.on; }, voiceOn: () => voice.on, get notesOpen() { return !notesEl.hidden; },
    black(on) { if (on === undefined) return black.classList.contains('on'); setBlack(!!on); }
  };
}
