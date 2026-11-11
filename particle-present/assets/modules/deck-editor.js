/* ---------- the slide editor: select, move, resize, retype, hide; undo; save into the file ----------
   Drop-in module. Paste this function into the deck's script unchanged and create it once, after the saver:
     const editor = makeEditor({ ...adapter });
   It injects the editor panel (#ed), the selection boxes (#sel, #hov, #guides, inside the stage) and their CSS. Wire E and the
   Edit button to editor.toggle(); call editor.refresh() whenever the slide changes; editor.commit() after any other change to the
   edit state (e.g. notes edited in the speaker view), so undo, the working copy and Save carry it. editor.inset() is the panel's
   width while it is open: the deck fits its stage into the space left of it (call A.fit on enter and exit).
   Ctrl/Cmd+S saves (and opens the editor first when it is closed).

   The edit state is the deck's, in the shared shape: a slide record (slideEd) { els: { <key>: record }, notes, ... } and per
   element a record (ed) { x, y (px moved), s (scale), w (px width), hide (true), html (its words) }; the editor only sets those
   fields and asks the deck to show them.

   Adapter (required unless marked optional):
     stage             the element that holds the slides at design size (the selection boxes go in it); W, H its design size
                       (default 1920 x 1080)
     surface           where the pointer is listened to (default: stage)
     slides, cur()     the slides and the current index
     goto(i)           show slide i with every build in, still, for editing
     enter(), exit()   the deck's own work when the editor opens (show the slide still) and closes (play it from the start) (optional)
     fit()             refit the stage (it reads editor.inset()) (optional)
     isText(el)        el is a single text element whose words can be typed (editable elements are [data-e]; groups nest them)
     ed(el, make)      el's edit record (make: create it); slideEd(sid, make) the slide's record; keyOf(el) its key (default data-e)
     apply(el)         show el's placement, size, width and hidden state from its record (the deck styles hidden elements)
     render(el)        show el's words from its record (or the original), then its placement
     typing(el)        put el's plain words in for typing (no word or letter wrappers)
     orig(el)          el's original markup
     snapshot(), restore(sn)   the edit state as a string, and back (redraw everything) for undo and redo
     prune(), persist()        tidy the edit state; store the working copy in the browser
     saver             the object from makeSaver (Save, Save as…, the Save label)
     refresh()         the deck's own redraw when the editor closes (optional)
     toast(msg, ms)    a message on screen
     overlay()         true while one of the deck's overlays (slide list, help) is open: keys go to it (optional)
     colors            [{ cls, hex, title }] colours for the selected words while typing (optional: bold and italic only)
     snap              { x: [...], y: [...] } guide lines in design px (default margins 120 / 1800, centre 960 / 540)
     speed             built-in "Animation speed" section, shown only when given: { all(), setAll(v), slide(sid), setSlide(sid, v),
                       play() (optional: a "Play the way in" button), min, max } (optional)
     bar(v)            read (no argument) or set the progress bar choice: a checkbox under Whole deck (optional)
     sections          plug-in sections, shown only when given (optional): [{ id, title, html, at, show(ctx), mount(root, ctx),
                       update(root, ctx) }], at 'selected' (under the selection's controls, while show(ctx) is true), 'deck' (under
                       Whole deck) or 'section' (a section of its own, titled; show(ctx) hides it per slide). ctx: { sel, target,
                       slide, cur, commit, commitSoon, status, refresh, select }
     targets           plug-in things to select that are not elements, e.g. a light image (optional): [{ id, name, hint, link,
                       none, rect() (design px, or null when this slide has none), pos() {x,y}, setPos(x, y), size(), setSize(v),
                       reset() }]; drag moves, the corner sizes about its centre, arrows nudge, Size % works
*/
function makeEditor(A) {
  const W = A.W || 1920, slides = A.slides, stage = A.stage, surf = A.surface || stage, $ = id => document.getElementById(id);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), keyOf = el => A.keyOf ? A.keyOf(el) : el.dataset.e, cur = () => A.cur();
  const CSS = `:where(:root){--ui-ink:#F2F5F0;--ui-mute:#97AAA3;--ui-dim:#5F726C;--ui-gold:#F6BC4E;--ui-leaf:#8AD6A8;--ui-coral:#F3846B;--ui-sky:#8CC3EC;--ui-font:"Mona Sans","Avenir Next","Segoe UI",system-ui,sans-serif;--ui-ed:#08110F;--ui-field-ed:#040A09;--ui-on-gold:#16130A;--ui-hd-edge:#071210}
:root{--edw:348px}@media (max-width:900px){:root{--edw:300px}}
body.edit{cursor:auto}body.edit [data-e]{cursor:move}body.edit [contenteditable=true]{cursor:text!important;outline:none;user-select:text;-webkit-user-select:text;caret-color:var(--ui-gold)}
#hov,#sel{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:70;box-sizing:border-box;display:none;--inv:1}body.edit #hov.on,body.edit #sel.on{display:block}
#hov{border:calc(1.5px * var(--inv)) dashed rgba(246,188,78,.55);border-radius:calc(4px * var(--inv))}
#sel{border:calc(2px * var(--inv)) solid var(--ui-gold);border-radius:calc(4px * var(--inv));box-shadow:0 0 0 calc(1px * var(--inv)) rgba(0,0,0,.5)}#sel.tgt{border-style:dashed;border-color:var(--ui-sky)}#sel.typing{border-color:var(--ui-leaf)}
#sel .hd{position:absolute;width:calc(16px * var(--inv));height:calc(16px * var(--inv));background:var(--ui-gold);border:calc(2px * var(--inv)) solid var(--ui-hd-edge);border-radius:calc(4px * var(--inv));pointer-events:auto;box-sizing:border-box}
#sel.tgt .hd{background:var(--ui-sky)}#sel.typing .hd{display:none}#sel .hd-s{right:calc(-9px * var(--inv));bottom:calc(-9px * var(--inv));cursor:nwse-resize}
#sel .hd-w{right:calc(-9px * var(--inv));top:calc(50% - 8px * var(--inv));cursor:ew-resize;border-radius:calc(8px * var(--inv))}#sel.tgt .hd-w,#sel.nowidth .hd-w{display:none}
#guides{position:absolute;inset:0;pointer-events:none;z-index:69}#guides i{position:absolute;background:var(--ui-coral);opacity:.9}#guides i.v{top:0;bottom:0;width:calc(1px * var(--inv))}#guides i.h{left:0;right:0;height:calc(1px * var(--inv))}
#ed{position:fixed;top:0;right:0;bottom:0;width:var(--edw);box-sizing:border-box;z-index:45;overflow:auto;background:var(--ui-ed);border-left:1px solid rgba(255,255,255,.1);color:var(--ui-ink);font:500 14px/1.45 var(--ui-font);padding:14px 16px 18px;display:flex;flex-direction:column;gap:10px;-webkit-user-select:none;user-select:none;text-align:left}
#ed[hidden],#ed [hidden]{display:none!important}#ed *{box-sizing:border-box}#ed p,#ed h3{margin:0}
#ed button,#ed select,#ed input{font:inherit;color:var(--ui-ink)}#ed button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:9px;padding:7px 11px;cursor:pointer}
#ed button:hover{background:rgba(255,255,255,.12)}#ed button:disabled{opacity:.4;cursor:default}#ed button.primary{background:var(--ui-gold);border-color:var(--ui-gold);color:var(--ui-on-gold);font-weight:680}#ed button.wide{width:100%;padding:10px}
#ed button:focus-visible,#ed input:focus-visible,#ed select:focus-visible{outline:2px solid var(--ui-gold);outline-offset:2px}
#ed .ed-head{display:flex;align-items:center;justify-content:space-between;gap:8px}#ed .ed-title{font-size:16px}#ed .ed-title span{color:var(--ui-mute);font-weight:500;margin-left:6px;font-variant-numeric:tabular-nums}
#ed .ed-nav{display:flex;gap:6px}#ed .ed-nav button{min-width:34px}#ed .ed-name{color:var(--ui-gold);font-weight:640;font-size:15px}
#ed .ed-sec{border-top:1px solid rgba(255,255,255,.08);padding-top:10px;display:flex;flex-direction:column;gap:8px}#ed .ed-sec h3{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ui-dim);font-weight:700}
#ed .ed-what{color:var(--ui-mute);font-size:13px;overflow-wrap:anywhere}#ed .ed-what b{color:var(--ui-ink);font-weight:600}
#ed .ed-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px}#ed .ed-grid label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--ui-mute)}
#ed textarea{width:100%;background:var(--ui-field-ed);border:1px solid rgba(255,255,255,.14);border-radius:7px;padding:8px 9px;font:500 13px/1.5 var(--ui-font);color:var(--ui-ink);resize:vertical;user-select:text;-webkit-user-select:text}
#ed input[type=number],#ed select{width:100%;background:var(--ui-field-ed);border:1px solid rgba(255,255,255,.14);border-radius:7px;padding:6px 8px;user-select:text;-webkit-user-select:text}
#ed .ed-slider{display:grid;grid-template-columns:1fr 46px;align-items:center;gap:2px 8px;font-size:13px;color:var(--ui-mute)}#ed .ed-slider input{grid-column:1;width:100%;accent-color:var(--ui-gold)}
#ed .ed-slider output{grid-row:1 / span 2;grid-column:2;text-align:right;color:var(--ui-ink);font-variant-numeric:tabular-nums;font-size:13px}
#ed .ed-row{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:10px;font-size:13px;color:var(--ui-mute)}#ed .ed-check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ui-mute);cursor:pointer}#ed .ed-check input{accent-color:var(--ui-gold);width:16px;height:16px}
#ed .ed-btns{display:flex;gap:6px;flex-wrap:wrap}#ed .ed-sub{margin:4px 0 0;font-size:12px;color:var(--ui-mute)}#ed .ed-sw{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
#ed .ed-sw button[data-col]{width:26px;height:26px;padding:0;border-radius:50%;background:var(--c);border:2px solid rgba(255,255,255,.25)}#ed .ed-sw button.txt{min-width:30px;padding:3px 8px}
#ed .ed-link{background:none;border:none;color:var(--ui-sky);padding:0;text-align:left;text-decoration:underline;text-underline-offset:3px}#ed .ed-link:hover{background:none}
#ed .ed-foot{margin-top:auto;border-top:1px solid rgba(255,255,255,.08);padding-top:10px;display:flex;flex-direction:column;gap:8px}
#ed .ed-status{font-size:12px;color:var(--ui-mute);min-height:1.4em}#ed .ed-status.ok{color:var(--ui-leaf)}#ed .ed-status.warn{color:var(--ui-coral)}
#ed .ed-tips{font-size:12px;color:var(--ui-mute)}#ed .ed-tips summary{cursor:pointer;color:var(--ui-ink)}#ed .ed-tips p{margin:6px 0 0}
#ed .ed-sz{display:inline-flex;gap:4px;margin:0 6px 0 2px;align-self:end}#ed .ed-sz button{min-width:34px;padding:4px 8px}`;
  const SECS = A.sections || [], TG = A.targets || [], COLS = A.colors || [], SP = A.speed || null;
  const sec = at => SECS.map((p, i) => p.at === at ? `<div class="ed-plug" data-pi="${i}">${p.at === 'section' ? '' : p.html || ''}</div>` : '').join('');
  const MARKUP = `<aside id="ed" hidden aria-label="Slide editor">
 <div class="ed-head"><div class="ed-title"><b>Edit</b> <span id="ed-num">1 / ${slides.length}</span></div><div class="ed-nav"><button type="button" id="ed-prev" aria-label="Previous slide">‹</button><button type="button" id="ed-next" aria-label="Next slide">›</button><button type="button" id="ed-done" class="primary">Done</button></div></div>
 <p class="ed-name" id="ed-name"></p>
 <section class="ed-sec"><h3>Selected</h3>
  <p class="ed-what" id="ed-what"></p>
  <div id="ed-props" hidden>
   <div class="ed-grid">
    <label>Left/right<input type="number" id="ed-x" step="1"></label><label>Up/down<input type="number" id="ed-y" step="1"></label>
    <label><span id="ed-sl">Size %</span><input type="number" id="ed-s" step="1" min="10" max="500"></label><span class="ed-sz"><button type="button" id="ed-sm" title="Smaller (Alt + −)">A−</button><button type="button" id="ed-sp" title="Larger (Alt + =)">A+</button></span>
    <label id="ed-wl">Width<input type="number" id="ed-w" step="10" min="40" placeholder="auto"></label>
   </div>
   ${sec('selected')}
   <div class="ed-btns"><button type="button" id="ed-text">Edit text</button><button type="button" id="ed-hide">Hide</button><button type="button" id="ed-reset">Reset</button></div>
   <div id="ed-colors" hidden><p class="ed-sub">Color the selected words</p><div class="ed-sw">${COLS.map(c => `<button type="button" data-col="${esc(c.cls)}" style="--c:${esc(c.hex)}" title="${esc(c.title || c.cls)}"></button>`).join('')}<button type="button" data-cmd="italic" class="txt"><i>I</i></button><button type="button" data-cmd="bold" class="txt"><b>B</b></button></div></div>
  </div>
  ${TG.map((t, i) => t.link ? `<button type="button" class="ed-link" data-ti="${i}">${esc(t.link)}</button>` : '').join('')}
 </section>
 ${SP ? `<section class="ed-sec" id="ed-speed"><h3>Animation speed</h3><label class="ed-slider">All slides<input type="range" id="ed-gs" min="${SP.min || .25}" max="${SP.max || 2.5}" step="0.05"><output id="ed-gs-o"></output></label><label class="ed-slider">This slide<input type="range" id="ed-ss" min="${SP.min || .25}" max="${SP.max || 2.5}" step="0.05"><output id="ed-ss-o"></output></label>${SP.play ? '<div class="ed-btns"><button type="button" id="ed-play">Play the way in</button></div>' : ''}</section>` : ''}
 ${SECS.map((p, i) => p.at === 'section' ? `<section class="ed-sec ed-plug" data-pi="${i}"><h3>${esc(p.title || '')}</h3>${p.html || ''}</section>` : '').join('')}
 ${A.bar || SECS.some(p => p.at === 'deck') ? `<section class="ed-sec" id="ed-deck"><h3>Whole deck</h3>${sec('deck')}${A.bar ? '<label class="ed-check"><input type="checkbox" id="ed-bar"> Progress bar at the bottom</label>' : ''}</section>` : ''}
 <div class="ed-foot">
  <div class="ed-btns"><button type="button" id="ed-undo">Undo</button><button type="button" id="ed-redo">Redo</button><button type="button" id="ed-rslide">Reset slide</button></div>
  <button type="button" id="ed-save" class="primary wide">Save</button><button type="button" id="ed-saveas" class="wide">Save as…</button>
  <p class="ed-status" id="ed-status"></p>
  <details class="ed-tips"><summary>How editing works</summary>
   <p>Click to select. Click again to select inside a group. Double-click (or Enter) to edit text; Esc to finish. Drag to move (hold Alt to place freely); drag the corner to resize, the side to change the width. Arrow keys nudge (Shift for 10). A− / A+ or Alt + − / Alt + = change the size by 5%. Delete hides. Ctrl or Cmd+Z undoes, Shift+Z redoes, Ctrl or Cmd+S saves. ‹ › or Page Up/Down change slides; E or Done returns to presenting.</p>
   <p>Edits are kept in this browser as you go. Save writes them into the deck file itself, so they travel with it.</p>
  </details>
 </div>
</aside>`;
  { const st = document.createElement('style'); st.id = 'deck-editor-css'; st.textContent = CSS; document.head.appendChild(st);
    const box = document.createElement('div'); box.innerHTML = MARKUP; document.body.append(...box.childNodes);
    const ov = document.createElement('div'); ov.innerHTML = '<div id="hov" aria-hidden="true"></div><div id="sel" aria-hidden="true"><i class="hd hd-w" data-h="w" title="Drag to change the width"></i><i class="hd hd-s" data-h="s" title="Drag to resize"></i></div><div id="guides" aria-hidden="true"></div>'; stage.append(...ov.childNodes); }
  const ed = $('ed'), selBox = $('sel'), hovBox = $('hov'), guides = $('guides');
  let on = false, sel = null, editingEl = null, hist = [], hi = -1, drag = null, hovTarget = null;
  const isEl = t => t instanceof Element, isText = el => isEl(el) && !!A.isText(el);
  const blockOf = el => { let b = el; for (let p = el.parentElement; p && p !== stage; p = p.parentElement) if (p.matches('[data-e]')) b = p; return b; };
  const childToward = (parent, leaf) => { let c = leaf; for (let p = leaf.parentElement; p && p !== parent; p = p.parentElement) if (p.matches('[data-e]')) c = p; return c; };
  const ctx = { get sel() { return sel; }, get target() { return isEl(sel) ? null : sel; }, get slide() { return slides[cur()]; }, cur, commit: () => commit(), commitSoon: () => commitSoon(), status: (m, k) => status(m, k), refresh: () => refresh(), select: t => select(t) };
  SECS.forEach((p, i) => { const root = ed.querySelector(`.ed-plug[data-pi="${i}"]`); if (root && p.mount) p.mount(root, ctx); });

  /* undo: every change is a snapshot of the edit state */
  function commit() { A.prune(); const sn = A.snapshot(); if (sn !== hist[hi]) { hist = hist.slice(0, hi + 1); hist.push(sn); if (hist.length > 300) hist.shift(); hi = hist.length - 1; } A.persist(); refresh(); }
  let commitT; const commitSoon = () => { clearTimeout(commitT); commitT = setTimeout(commit, 450); };
  function restore(sn) { A.restore(sn); A.persist(); refresh(); }
  function undo() { clearTimeout(commitT); if (hi > 0) { hi--; restore(hist[hi]); } }
  function redo() { if (hi < hist.length - 1) { hi++; restore(hist[hi]); } }

  function enter() {
    if (on) return;
    on = true; document.body.classList.add('edit'); ed.hidden = false;
    if (!hist.length) { A.prune(); hist = [A.snapshot()]; hi = 0; }
    A.fit && A.fit(); A.enter && A.enter(); refresh(); requestAnimationFrame(loop);
  }
  function exit() {
    if (!on) return;
    if (editingEl) commitText(); clearTimeout(commitT); commit(); deselect();
    on = false; document.body.classList.remove('edit'); ed.hidden = true; hovBox.classList.remove('on'); selBox.classList.remove('on'); clearGuides();
    A.fit && A.fit(); A.exit && A.exit(); A.refresh && A.refresh();
  }
  function loop() { if (!on) return; drawSel(); requestAnimationFrame(loop); }

  /* geometry in design units (the stage at its design size) */
  const scale = () => (stage.getBoundingClientRect().width / W) || 1;
  function rectOf(el) { const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(), k = scale(); return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k }; }
  function toStage(cx, cy) { const s = stage.getBoundingClientRect(), k = scale(); return [(cx - s.left) / k, (cy - s.top) / k]; }
  const tRect = t => isEl(t) ? rectOf(t) : t.rect();
  function box(el, r) { if (!r) { el.classList.remove('on'); return; } el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = Math.max(4, r.w) + 'px'; el.style.height = Math.max(4, r.h) + 'px'; el.classList.add('on'); }
  function drawSel() {
    if (!on) return; const inv = (1 / scale()).toFixed(4); selBox.style.setProperty('--inv', inv); hovBox.style.setProperty('--inv', inv); guides.style.setProperty('--inv', inv);
    box(selBox, sel && (isEl(sel) ? sel.isConnected : true) ? tRect(sel) : null);
    selBox.classList.toggle('tgt', !!sel && !isEl(sel)); selBox.classList.toggle('typing', !!editingEl);
    if (hovTarget && hovTarget !== sel && !drag && !editingEl) box(hovBox, tRect(hovTarget)); else box(hovBox, null);
  }
  function hit(x, y) { // the deepest editable element under a screen point, on the current slide
    const s = slides[cur()];
    for (const el of document.elementsFromPoint(x, y)) { if (el.closest('#ed,#sel,#hov')) continue; if (!stage.contains(el)) return null; const d = el.closest('[data-e]'); if (d && s.contains(d)) return d; }
    return null;
  }
  const tgtAt = (x, y) => { const [px, py] = toStage(x, y); return TG.find(t => { const r = t.rect(); return r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }) || null; };
  function targetFor(leaf) {
    if (!leaf) return null;
    if (isEl(sel)) {
      if (sel === leaf || sel.contains(leaf)) return sel;
      const par = sel.parentElement && sel.parentElement.closest('[data-e]');
      if (par && par.contains(leaf) && stage.contains(par)) return childToward(par, leaf); // a sibling inside the same group
    }
    return blockOf(leaf);
  }
  function select(t) { if (editingEl && t !== editingEl) commitText(); sel = t; refresh(); drawSel(); }
  function deselect() { if (editingEl) commitText(); sel = null; hovTarget = null; if (on) { refresh(); drawSel(); } }
  const rec = (el, make) => A.ed(el, make);
  const posOf = t => { if (!isEl(t)) return t.pos(); const m = rec(t); return { x: +(m && m.x) || 0, y: +(m && m.y) || 0 }; };
  const sizeOf = t => isEl(t) ? (+(rec(t) || {}).s || 1) : (+t.size() || 1);
  function setPos(t, x, y) { x = Math.round(x); y = Math.round(y); if (!isEl(t)) t.setPos(x, y); else { const e = rec(t, true); e.x = x; e.y = y; A.apply(t); } drawSel(); props(); }
  function setScale(t, v, anchor) {
    v = Math.round(clamp(v, .1, 5) * 1000) / 1000;
    if (!isEl(t)) { t.setSize(v); drawSel(); props(); return; }
    // the top left stays put while it grows or shrinks
    const before = anchor || rectOf(t), e = rec(t, true); e.s = v; A.apply(t);
    const after = rectOf(t); e.x = Math.round((+e.x || 0) + before.x - after.x); e.y = Math.round((+e.y || 0) + before.y - after.y); A.apply(t);
    drawSel(); props();
  }
  function bumpSize(d) { if (!sel) return; setScale(sel, Math.round((sizeOf(sel) + d) * 20) / 20); commit(); }

  /* pointer: click selects, click again drills into a group, drag moves, the handles resize */
  surf.addEventListener('pointerdown', e => {
    if (!on || e.button !== 0) return;
    const h = e.target.closest && e.target.closest('#sel .hd');
    if (h && sel) {
      e.preventDefault(); e.stopPropagation(); const [px, py] = toStage(e.clientX, e.clientY);
      drag = { h: h.dataset.h, x0: e.clientX, y0: e.clientY, moved: false, target: sel, r0: tRect(sel), s0: sizeOf(sel), p0: [px, py] };
      try { surf.setPointerCapture(e.pointerId); } catch (er) {} return;
    }
    const leaf = hit(e.clientX, e.clientY);
    if (editingEl && leaf && editingEl.contains(leaf)) return; // placing the caret inside the text being typed
    if (editingEl) commitText();
    e.preventDefault(); e.stopPropagation();
    let target = targetFor(leaf);
    if (!target) target = tgtAt(e.clientX, e.clientY);
    drag = { x0: e.clientX, y0: e.clientY, moved: false, target, leaf, wasSel: sel, start: target ? posOf(target) : null, r0: isEl(target) ? rectOf(target) : null };
    if (target !== sel) { if (target) select(target); else deselect(); }
    try { surf.setPointerCapture(e.pointerId); } catch (er) {}
  }, true);
  surf.addEventListener('pointermove', e => {
    if (!on) return;
    if (!drag) { if (!editingEl) hovTarget = targetFor(hit(e.clientX, e.clientY)) || tgtAt(e.clientX, e.clientY); return; }
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
    drag.moved = true;
    const k = scale(), dx = (e.clientX - drag.x0) / k, dy = (e.clientY - drag.y0) / k;
    if (drag.h) {
      const [px, py] = toStage(e.clientX, e.clientY), r0 = drag.r0;
      if (!isEl(drag.target)) { if (drag.h !== 's') return; const cx = r0.x + r0.w / 2, cy = r0.y + r0.h / 2, d0 = Math.hypot(drag.p0[0] - cx, drag.p0[1] - cy) || 1; setScale(drag.target, drag.s0 * Math.hypot(px - cx, py - cy) / d0); }
      else if (drag.h === 's') setScale(drag.target, drag.s0 * Math.max(.05, (px - r0.x) / Math.max(10, r0.w)), r0);
      else if (drag.h === 'w') { const ee = rec(drag.target, true); ee.w = Math.round(clamp((px - r0.x) / drag.s0, 40, 4000)); A.apply(drag.target); drawSel(); props(); }
      return;
    }
    if (!drag.target) return;
    let nx = drag.start.x + dx, ny = drag.start.y + dy;
    if (isEl(drag.target) && !e.altKey) [nx, ny] = snapTo(drag, nx, ny); else clearGuides();
    setPos(drag.target, nx, ny);
  }, true);
  function endDrag() {
    if (!on || !drag) return;
    const d = drag; drag = null; clearGuides();
    if (d.moved) { commit(); return; }
    if (d.h) return;
    // a click without moving: inside an already-selected group, go one level deeper
    if (d.leaf && isEl(d.wasSel) && d.target === d.wasSel && d.wasSel !== d.leaf) select(childToward(d.wasSel, d.leaf));
  }
  surf.addEventListener('pointerup', endDrag, true); surf.addEventListener('pointercancel', endDrag, true);
  // the drag's pointer capture retargets the double-click, so look under the pointer
  surf.addEventListener('dblclick', e => { if (!on) return; let t = hit(e.clientX, e.clientY); while (t && !isText(t)) { const p = t.parentElement && t.parentElement.closest('[data-e]'); t = p && stage.contains(p) ? p : null; } if (t && t !== editingEl) { select(t); startText(t, e); } }, true);
  surf.addEventListener('dragstart', e => { if (on) e.preventDefault(); });

  /* snapping to the margins, the centre and other elements (hold Alt to place freely) */
  function clearGuides() { guides.textContent = ''; }
  function snapTo(d, nx, ny) {
    const th = 7 / scale(), r0 = d.r0; if (!r0) return [nx, ny];
    const ox = nx - d.start.x, oy = ny - d.start.y, L = r0.x + ox, Tp = r0.y + oy, Wd = r0.w, Ht = r0.h;
    const xs = (A.snap && A.snap.x || [120, 960, 1800]).slice(), ys = (A.snap && A.snap.y || [540]).slice();
    slides[cur()].querySelectorAll('[data-e]').forEach(o => { if (o === d.target || d.target.contains(o) || o.contains(d.target)) return; if (blockOf(o) !== o) return; const r = rectOf(o); if (r.w < 2) return; xs.push(r.x); ys.push(r.y, r.y + r.h); });
    let bx = null, by = null;
    for (const gx of xs) for (const [edge, off] of [[L, 0], [L + Wd / 2, Wd / 2], [L + Wd, Wd]]) { const dd = Math.abs(edge - gx); if (dd < th && (!bx || dd < bx.d)) bx = { d: dd, x: gx - off - r0.x + d.start.x, g: gx }; }
    for (const gy of ys) for (const [edge, off] of [[Tp, 0], [Tp + Ht / 2, Ht / 2], [Tp + Ht, Ht]]) { const dd = Math.abs(edge - gy); if (dd < th && (!by || dd < by.d)) by = { d: dd, y: gy - off - r0.y + d.start.y, g: gy }; }
    clearGuides();
    if (bx) { nx = bx.x; const i = document.createElement('i'); i.className = 'v'; i.style.left = bx.g + 'px'; guides.appendChild(i); }
    if (by) { ny = by.y; const i = document.createElement('i'); i.className = 'h'; i.style.top = by.g + 'px'; guides.appendChild(i); }
    return [nx, ny];
  }

  /* typing in place */
  function rgbOf(c) { c = String(c).trim(); let m = c.match(/^#([0-9a-f]{6})$/i); if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)); m = c.match(/^#([0-9a-f]{3})$/i); if (m) return [0, 1, 2].map(i => parseInt(m[1][i] + m[1][i], 16)); m = c.match(/rgba?\(([^)]+)\)/); return m ? m[1].split(',').slice(0, 3).map(Number) : null; }
  function colorClass(c) { const v = rgbOf(c); if (!v) return ''; let best = '', bd = 1e9; for (const o of COLS) { const w = rgbOf(o.hex); if (!w) continue; const d = (w[0] - v[0]) ** 2 + (w[1] - v[1]) ** 2 + (w[2] - v[2]) ** 2; if (d < bd) { bd = d; best = o.cls; } } return best; }
  function cleanHTML(html) {   // what the browser's editing left behind, back to the deck's own markup (colour classes, no inline styles)
    const t = document.createElement('template'); t.innerHTML = html;
    const walk = node => {
      for (const ch of [...node.childNodes]) {
        if (ch.nodeType === 8) { ch.remove(); continue; }
        if (ch.nodeType !== 1) continue;
        walk(ch);
        const tag = ch.tagName;
        if (tag === 'DIV' || tag === 'P') { const f = document.createDocumentFragment(); if (ch.previousSibling) f.append(document.createElement('br')); f.append(...ch.childNodes); ch.replaceWith(f); continue; }
        if (tag === 'FONT') { const sp = document.createElement('span'); const c = ch.getAttribute('color'); if (c) sp.className = colorClass(c); sp.append(...ch.childNodes); ch.replaceWith(sp); if (!sp.className) sp.replaceWith(...sp.childNodes); continue; }
        if (tag === 'SPAN') {
          const col = ch.style.color, fw = ch.style.fontWeight, fs = ch.style.fontStyle;
          if (col) { ch.classList.remove(...COLS.map(o => o.cls)); const k = colorClass(col); if (k) ch.classList.add(k); }
          const keep = [...ch.style].filter(n => n.startsWith('--')).map(n => [n, ch.style.getPropertyValue(n)]);
          ch.removeAttribute('style'); keep.forEach(([n, v]) => ch.style.setProperty(n, v)); if (fw) ch.style.fontWeight = fw; if (fs === 'italic') ch.style.fontStyle = 'italic';
          if (!ch.getAttribute('class')) ch.removeAttribute('class');
          if (!ch.attributes.length) { ch.replaceWith(...ch.childNodes); continue; }
        }
        ch.removeAttribute('contenteditable');
      }
    };
    walk(t.content);
    return t.innerHTML.replace(/&nbsp;/g, ' ').replace(/(\s*<br>\s*)+$/, '').replace(/^\s+|\s+$/g, '');
  }
  function startText(el, ev) {
    if (!isText(el)) return;
    if (editingEl && editingEl !== el) commitText();
    editingEl = el; sel = el;
    A.typing(el); // the plain words, without the reveal wrappers
    el.contentEditable = 'true'; el.spellcheck = true; el.focus({ preventScroll: true });
    const s = getSelection(); s.removeAllRanges();
    let r = null; if (ev && document.caretRangeFromPoint) { try { r = document.caretRangeFromPoint(ev.clientX, ev.clientY); } catch (x) { r = null; } }
    if (!r || !el.contains(r.startContainer)) { r = document.createRange(); r.selectNodeContents(el); }
    s.addRange(r);
    refresh(); drawSel();
  }
  function commitText(cancel) {
    const el = editingEl; if (!el) return; editingEl = null;
    el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck');
    if (!cancel) { const html = cleanHTML(el.innerHTML), pr = A.orig(el), e = rec(el, true); if (html === pr || html.replace(/\s+/g, ' ') === pr.replace(/\s+/g, ' ').trim()) delete e.html; else e.html = html; }
    A.render(el); try { getSelection().removeAllRanges(); } catch (x) {}
    commit(); drawSel();
  }
  stage.addEventListener('paste', e => { if (!editingEl || !editingEl.contains(e.target)) return; e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain') || ''; document.execCommand('insertText', false, t.replace(/\s*\n\s*/g, ' ')); });
  $('ed-colors').addEventListener('mousedown', e => e.preventDefault()); // keep the text selection while choosing a colour
  ed.querySelectorAll('#ed-colors [data-col]').forEach(b => b.addEventListener('click', () => { if (!editingEl) return; const c = COLS.find(o => o.cls === b.dataset.col); try { document.execCommand('styleWithCSS', false, true); } catch (x) {} document.execCommand('foreColor', false, c.hex); }));
  ed.querySelectorAll('#ed-colors [data-cmd]').forEach(b => b.addEventListener('click', () => { if (editingEl) document.execCommand(b.dataset.cmd); }));

  /* hide, reset */
  function toggleHide() { if (!isEl(sel)) return; const e = rec(sel, true); e.hide = !e.hide; if (!e.hide) delete e.hide; A.apply(sel); commit(); A.toast(e.hide ? 'Hidden while presenting. Ctrl or Cmd+Z to undo.' : 'Shown again.', 2600); }
  function resetSel() {
    if (!sel) return;
    if (!isEl(sel)) { sel.reset && sel.reset(); }
    else { const sd = A.slideEd(slides[cur()].id); if (sd && sd.els) delete sd.els[keyOf(sel)]; A.render(sel); }
    commit(); drawSel();
  }
  let resetArm = 0;
  function resetSlide() {
    const b = $('ed-rslide');
    if (Date.now() - resetArm > 3000) { resetArm = Date.now(); b.textContent = 'Click again to reset'; setTimeout(() => { b.textContent = 'Reset slide'; }, 3000); return; }
    resetArm = 0; b.textContent = 'Reset slide';
    // everything on this slide goes back to the original, except its notes (those are edited in the speaker view)
    const sd = A.slideEd(slides[cur()].id); if (sd) Object.keys(sd).forEach(k => { if (k !== 'notes') delete sd[k]; });
    deselect(); A.restore(A.snapshot()); commit();
  }

  /* the panel */
  const fmtX = v => `${+(+v).toFixed(2)}×`;
  function setVal(id, v) { const el = $(id); if (el && document.activeElement !== el) el.value = v; }
  function props() {
    if (!sel) return;
    const p = posOf(sel); setVal('ed-x', p.x); setVal('ed-y', p.y); setVal('ed-s', Math.round(sizeOf(sel) * 100));
    $('ed-sl').textContent = isText(sel) ? 'Text size %' : 'Size %';
    if (isEl(sel)) { const e = rec(sel) || {}; setVal('ed-w', e.w ? Math.round(+e.w) : ''); $('ed-w').placeholder = Math.round(sel.offsetWidth) + ' (auto)'; }
  }
  function status(msg, cls = '') { const el = $('ed-status'); el.textContent = msg; el.className = 'ed-status' + (cls ? ' ' + cls : ''); }
  function refresh() {
    if (!on) return;
    const s = slides[cur()]; if (!s) return;
    $('ed-num').textContent = `${cur() + 1} / ${slides.length}`; $('ed-name').textContent = s.dataset.title || '';
    const what = $('ed-what'), pr = $('ed-props');
    if (!sel) { what.innerHTML = 'Click any text to select it.' + (TG.length ? ' ' + TG.map(t => t.hint0 || '').join(' ') : ''); pr.hidden = true; }
    else if (!isEl(sel)) { what.innerHTML = `<b>${esc(sel.name || 'Selection')}</b> · ${sel.hint || 'drag to move it, drag the corner to resize it'}`; pr.hidden = false; $('ed-wl').hidden = true; $('ed-text').hidden = true; $('ed-hide').hidden = true; }
    else {
      const txt = sel.textContent.replace(/\s+/g, ' ').trim(), e = rec(sel) || {};
      what.innerHTML = `<b>${isText(sel) ? 'Text' : 'Group'}</b> · “${esc(txt.slice(0, 70))}${txt.length > 70 ? '…' : ''}”` + (editingEl ? '<br>Typing. Esc or click outside to finish.' : '');
      pr.hidden = false; $('ed-wl').hidden = false; $('ed-text').hidden = !isText(sel) || !!editingEl; $('ed-hide').hidden = false; $('ed-hide').textContent = e.hide ? 'Show' : 'Hide';
    }
    selBox.classList.toggle('nowidth', !!sel && !isEl(sel));
    $('ed-colors').hidden = !editingEl;
    props();
    if (SP) { const gs = +SP.all() || 1, ss = +SP.slide(s.id) || 1; setVal('ed-gs', gs); $('ed-gs-o').textContent = fmtX(gs); setVal('ed-ss', ss); $('ed-ss-o').textContent = fmtX(ss); }
    if (A.bar) $('ed-bar').checked = A.bar() !== false;
    SECS.forEach((p, i) => { const root = ed.querySelector(`.ed-plug[data-pi="${i}"]`); if (!root) return; const vis = p.show ? !!p.show(ctx) : p.at !== 'selected' || !!sel; root.hidden = !vis; if (vis && p.update) p.update(root, ctx); });
    $('ed-undo').disabled = hi <= 0; $('ed-redo').disabled = hi >= hist.length - 1;
    $('ed-save').textContent = A.saver.label();
  }
  const ebtn = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', e => { e.preventDefault(); fn(); }); };
  const goto = i => { if (i < 0 || i >= slides.length) return; if (editingEl) commitText(); deselect(); A.goto(i); refresh(); };
  ebtn('ed-prev', () => goto(cur() - 1)); ebtn('ed-next', () => goto(cur() + 1)); ebtn('ed-done', exit);
  ebtn('ed-text', () => { if (isText(sel)) startText(sel); }); ebtn('ed-hide', toggleHide); ebtn('ed-reset', resetSel);
  ebtn('ed-undo', undo); ebtn('ed-redo', redo); ebtn('ed-rslide', resetSlide);
  ebtn('ed-save', () => A.saver.save()); ebtn('ed-saveas', () => A.saver.saveAs());
  ebtn('ed-sm', () => bumpSize(-.05)); ebtn('ed-sp', () => bumpSize(.05));
  ed.querySelectorAll('.ed-link[data-ti]').forEach(b => b.addEventListener('click', () => { const t = TG[+b.dataset.ti]; if (t.rect()) select(t); else status(t.none || 'Nothing like that on this slide.', 'warn'); }));
  $('ed-x').addEventListener('input', e => { if (!sel || e.target.value === '') return; setPos(sel, +e.target.value, posOf(sel).y); commitSoon(); });
  $('ed-y').addEventListener('input', e => { if (!sel || e.target.value === '') return; setPos(sel, posOf(sel).x, +e.target.value); commitSoon(); });
  $('ed-s').addEventListener('input', e => { if (!sel || e.target.value === '') return; setScale(sel, (+e.target.value || 100) / 100); commitSoon(); });
  $('ed-w').addEventListener('input', e => { if (!isEl(sel)) return; const ee = rec(sel, true); if (e.target.value === '') delete ee.w; else ee.w = clamp(+e.target.value, 40, 4000); A.apply(sel); drawSel(); commitSoon(); });
  ['ed-x', 'ed-y', 'ed-s', 'ed-w'].forEach(id => $(id).addEventListener('change', commit));
  if (SP) {
    $('ed-gs').addEventListener('input', e => { SP.setAll(+e.target.value); $('ed-gs-o').textContent = fmtX(+e.target.value); commitSoon(); });
    $('ed-ss').addEventListener('input', e => { SP.setSlide(slides[cur()].id, +e.target.value); $('ed-ss-o').textContent = fmtX(+e.target.value); commitSoon(); });
    ebtn('ed-play', () => { deselect(); SP.play(); });
  }
  if (A.bar) $('ed-bar').addEventListener('change', e => { A.bar(e.target.checked); commit(); });

  /* keys: the editor's run first (capture) and keep the presenting keys out of the way */
  addEventListener('keydown', e => {
    const k = e.key, mod = e.metaKey || e.ctrlKey, stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (mod && (k === 's' || k === 'S')) { stop(); if (!on) enter(); A.saver.save(); return; }
    if (!on) return;
    if (editingEl) {
      if (k === 'Escape') { stop(); commitText(); }
      else if (k === 'Enter') { stop(); document.execCommand('insertLineBreak'); }
      else e.stopImmediatePropagation(); // everything else is typing
      return;
    }
    const field = e.target.closest && e.target.closest('input,select,textarea');
    if (field) {
      const texty = field.tagName === 'TEXTAREA' || /^(text|number|search)$/i.test(field.type);
      if (k === 'Escape') { field.blur(); stop(); return; }
      if (texty || (!mod && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', ' ', 'Enter'].includes(k))) { e.stopImmediatePropagation(); return; }
    }
    if (mod && (k === 'z' || k === 'Z')) { stop(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && (k === 'y' || k === 'Y')) { stop(); redo(); return; }
    if (e.altKey && sel && (e.code === 'Minus' || e.code === 'Equal')) { stop(); bumpSize(e.code === 'Minus' ? -.05 : .05); return; }
    if (mod || e.altKey) return;
    if (A.overlay && A.overlay()) return;   // the slide list or help is open: its keys
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[k] && sel) { const st = e.shiftKey ? 10 : 1, p = posOf(sel); setPos(sel, p.x + arrows[k][0] * st, p.y + arrows[k][1] * st); commitSoon(); stop(); return; }
    if (k === 'Escape') { if (isEl(sel) && blockOf(sel) !== sel) select(sel.parentElement.closest('[data-e]')); else if (sel) deselect(); else exit(); stop(); }
    else if (k === 'e' || k === 'E') { stop(); exit(); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') { stop(); goto(cur() - 1); }
    else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ') { stop(); goto(cur() + 1); }
    else if (k === 'Home') { stop(); goto(0); } else if (k === 'End') { stop(); goto(slides.length - 1); }
    else if ((k === 'Enter' || k === 'F2') && isText(sel)) { stop(); startText(sel); }
    else if ((k === 'Delete' || k === 'Backspace') && isEl(sel)) { stop(); toggleHide(); }
    else if (!/^[fFsSmMgGoO?hHpP]$/.test(k)) e.stopImmediatePropagation();   // fullscreen, speaker view, sound, slide list, help and the bar still work
  }, true);
  addEventListener('beforeunload', () => { if (editingEl) commitText(); });

  return {
    get on() { return on; }, get sel() { return sel; }, get typing() { return editingEl; },
    enter, exit, toggle: () => on ? exit() : enter(), refresh, select, deselect, startText, commitText, commit, commitSoon, undo, redo, status,
    inset: () => on ? ed.offsetWidth : 0, flush() { if (editingEl) commitText(); clearTimeout(commitT); }
  };
}
