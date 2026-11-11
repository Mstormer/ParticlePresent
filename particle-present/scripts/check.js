// usage: node check.js "<deck offline .html>" <outdir>   -> one PNG per slide (fully built) + errors + overflow warnings
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
(async () => {
  const file = path.resolve(process.argv[2]), out = process.argv[3] || 'shots'; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 }, reducedMotion: 'reduce' });
  const errors = []; p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(require('url').pathToFileURL(file).href); await p.waitForTimeout(1500);
  if (!(await p.evaluate(() => !!window.__deck))) { console.log('deck did not start', JSON.stringify(errors)); process.exit(1); }
  const n = await p.evaluate(() => document.querySelectorAll('.slide').length), warn = [];
  for (let i = 0; i < n; i++) {
    await p.evaluate(i => window.__deck.go(i, true), i); await p.waitForTimeout(1100); await p.mouse.move(0, 0);
    await p.evaluate(() => document.body.classList.remove('awake'));
    warn.push(...await p.evaluate(() => { const s = document.querySelector('.slide.on'), out = []; const st = document.getElementById('stage').getBoundingClientRect(), k = st.width / 1920;
      const els = [...s.querySelectorAll('[data-e]')].filter(e => getComputedStyle(e).visibility !== 'hidden' && e.offsetParent);
      for (const e of els) { const r = e.getBoundingClientRect(); const x = (r.left - st.left) / k, y = (r.top - st.top) / k, w = r.width / k, h = r.height / k;
        if (x < 40 || y < 30 || x + w > 1880 || y + h > 1060) out.push(`${s.id}: ${e.dataset.e} reaches the edge (${x | 0},${y | 0} ${w | 0}×${h | 0})`); }
      const abs = els.filter(e => e.classList.contains('abs')).map(e => { const r = e.getBoundingClientRect(); return { id: e.dataset.e, r }; });
      for (let i = 0; i < abs.length; i++) for (let j = i + 1; j < abs.length; j++) { const a = abs[i].r, c = abs[j].r; if (a.left < c.right - 4 && c.left < a.right - 4 && a.top < c.bottom - 4 && c.top < a.bottom - 4) out.push(`${s.id}: ${abs[i].id} overlaps ${abs[j].id}`); }
      return out; }));
    await p.screenshot({ path: `${out}/s-${String(i + 1).padStart(2, '0')}.png` });
  }
  console.log('slides', n, '\nerrors', JSON.stringify(errors.slice(0, 8)), '\nlayout warnings:\n' + (warn.join('\n') || 'none'));
  await b.close();
})();
