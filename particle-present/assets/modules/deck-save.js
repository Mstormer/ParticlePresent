/* ---------- saving the deck back into its own file ----------
   Drop-in module. Paste this function into the deck's script unchanged and create it once:
     const saver = makeSaver({ ...adapter });
   Wire the editor's Save button and Ctrl/Cmd+S to saver.save(), a "Save as…" button to saver.saveAs(), and set the Save
   button's text to saver.label() whenever the editor redraws.

   What it does: the first Save asks once for this deck's own file (suggested by its name) and remembers that file for this
   path in this browser (IndexedDB), so every later Save, even after a reload, writes straight back to it. Save as… writes a
   copy elsewhere without changing where Save goes. A browser that can't write files (no showSaveFilePicker) downloads a copy.

   Adapter:
     buildDoc(payload)  the full HTML of the deck with this payload of edits embedded
     payloadNow()       the edits to save now ({ stamp, state }); finish any text being typed first
     rebase(stamp)      the file now holds these edits: make stamp the new base and store the working copy
     status(msg, kind)  a line in the editor; kind is 'ok', 'warn' or empty
     refresh()          redraw the editor (for the Save label)
     key                a short id for this deck, used in the picker ids and the IndexedDB key
     fallbackName()     the file name to use when the page's own path has none
*/
function makeSaver(A) {
  let fileHandle = null, saving = false;
  const HKEY = A.key + '-handle:' + decodeURIComponent(location.pathname);
  const idb = (mode, fn) => new Promise((res, rej) => { const r = indexedDB.open(A.key + '-deck', 1); r.onupgradeneeded = () => r.result.createObjectStore('h'); r.onerror = () => rej(r.error);
    r.onsuccess = () => { let tx, q; try { tx = r.result.transaction('h', mode); q = fn(tx.objectStore('h')); } catch (e) { rej(e); return; } tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }; });
  if (window.showSaveFilePicker) idb('readonly', st => st.get(HKEY)).then(h => { if (h && !fileHandle) { fileHandle = h; A.refresh(); } }).catch(() => {});
  const ownName = () => { try { return decodeURIComponent(location.pathname.split('/').pop()) || A.fallbackName(); } catch (e) { return A.fallbackName(); } };
  const types = [{ description: 'Web page', accept: { 'text/html': ['.html'] } }];
  async function writeTo(h, html) { if (h.queryPermission && (await h.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const w = await h.createWritable(); await w.write(new Blob([html], { type: 'text/html' })); await w.close(); }
  function download(html, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000); }
  async function save() {
    if (saving) return; saving = true;
    try {
      const payload = A.payloadNow(), html = A.buildDoc(payload), name = ownName();
      if (window.showSaveFilePicker) {
        try {
          if (!fileHandle) { A.status(`One time only: choose this deck file (${name}) so Save can write straight back to it.`); fileHandle = await window.showSaveFilePicker({ id: A.key + '-deck', startIn: 'documents', suggestedName: name, types }); idb('readwrite', st => st.put(fileHandle, HKEY)).catch(() => {}); }
          await writeTo(fileHandle, html);
          A.rebase(payload.stamp); A.refresh(); A.status(`Saved into ${fileHandle.name}. Ctrl or Cmd+S saves again.`, 'ok'); return;
        } catch (err) { if (err && err.name === 'AbortError') { A.status('Not saved.'); return; } fileHandle = null; }
      }
      download(html, name);
      A.rebase(payload.stamp); A.status(`This browser can’t write to the open file, so a copy named “${name}” went to your downloads. Open the deck in Chrome or Edge to save straight back to the file.`, 'warn');
    } finally { saving = false; }
  }
  async function saveAs() {
    if (saving) return; saving = true;
    try { const payload = A.payloadNow(), html = A.buildDoc(payload);
      if (window.showSaveFilePicker) { try { const h = await window.showSaveFilePicker({ id: A.key + '-deck-as', startIn: 'documents', suggestedName: ownName().replace(/\.html$/i, '') + ' copy.html', types });
          await writeTo(h, html); A.rebase(payload.stamp); A.status(`Saved a copy as ${h.name}. Save still writes to ${fileHandle ? fileHandle.name : 'this deck'}.`, 'ok'); return; } catch (err) { if (err && err.name === 'AbortError') { A.status('Not saved.'); return; } } }
      download(html, ownName());
      A.rebase(payload.stamp); A.status('Saved a copy to your downloads.', 'ok');
    } finally { saving = false; }
  }
  return { save, saveAs, label: () => window.showSaveFilePicker ? (fileHandle ? `Save to ${fileHandle.name}` : 'Save') : 'Save a copy (downloads)', get handle() { return fileHandle; } };
}
