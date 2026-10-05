(function () {
  'use strict';
  const { FIELDS, parsePayload } = CFParse;
  const $ = s => document.querySelector(s);
  const COLS = ['booth', 'company', 'contact', 'title', 'phone', 'email', 'wechat', 'whatsapp', 'website', 'address', 'products', 'category', 'phase', 'rating', 'followup', 'notes', 'created', 'updated'];

  // ---------- storage (IndexedDB, with in-memory fallback) ----------
  let db = null, mem = [];
  function openDB() {
    return new Promise(res => {
      try {
        const r = indexedDB.open('cf-ledger', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('entries', { keyPath: 'id' });
        r.onsuccess = () => { db = r.result; res(); };
        r.onerror = () => res();
      } catch (e) { res(); }
    });
  }
  const tx = (mode) => db.transaction('entries', mode).objectStore('entries');
  const prom = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const dbAll = () => db ? prom(tx('readonly').getAll()) : Promise.resolve(mem.slice());
  const dbPut = e => db ? prom(tx('readwrite').put(e)) : (mem = mem.filter(x => x.id !== e.id).concat(e), Promise.resolve());
  const dbDel = id => db ? prom(tx('readwrite').delete(id)) : (mem = mem.filter(x => x.id !== id), Promise.resolve());
  const dbClear = () => db ? prom(tx('readwrite').clear()) : (mem = [], Promise.resolve());

  let entries = [];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
  const toast = (m, ms = 2200) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').toLowerCase().replace(/[\s\-().]/g, '');

  // ---------- sticky context ----------
  const ctx = { booth: '', company: '' };
  try { Object.assign(ctx, JSON.parse(localStorage.getItem('cf-ctx') || '{}')); } catch (e) { }
  const saveCtx = () => { try { localStorage.setItem('cf-ctx', JSON.stringify(ctx)); } catch (e) { } };
  $('#ctxBooth').value = ctx.booth; $('#ctxCompany').value = ctx.company;
  $('#ctxBooth').oninput = e => { ctx.booth = e.target.value; saveCtx(); };
  $('#ctxCompany').oninput = e => { ctx.company = e.target.value; saveCtx(); };
  $('#ctxClear').onclick = () => { ctx.booth = ctx.company = ''; $('#ctxBooth').value = $('#ctxCompany').value = ''; saveCtx(); };

  let autoSave = false;
  try { autoSave = localStorage.getItem('cf-auto') === '1'; } catch (e) { }
  const setAuto = v => { autoSave = v; $('#optAuto').checked = $('#scanAuto').checked = v; try { localStorage.setItem('cf-auto', v ? '1' : '0'); } catch (e) { } };
  $('#optAuto').onchange = e => setAuto(e.target.checked);
  $('#scanAuto').onchange = e => setAuto(e.target.checked);
  setAuto(autoSave);

  // ---------- ledger list ----------
  function render() {
    const q = norm($('#search').value), ph = $('#filterPhase').value, st = +$('#filterStar').value || 0;
    const rows = entries.filter(e =>
      (!ph || e.phase === ph) && (!st || (+e.rating || 0) >= st) &&
      (!q || norm(COLS.slice(0, 16).map(c => e[c]).join(' ')).includes(q)))
      .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    const booths = new Set(entries.map(e => e.booth)).size;
    $('#count').textContent = `${rows.length} shown · ${entries.length} entries · ${booths} booths`;
    $('#list').innerHTML = rows.map(e => `<li class="item" data-id="${esc(e.id)}">
      ${e.photo ? `<img src="${e.photo}" alt="">` : ''}
      <div class="b">${esc(e.booth)}</div>
      <div class="t"><div class="c">${esc(e.company)}${e.phase ? `<span class="tag">P${esc(e.phase)}</span>` : ''}${e.followup ? `<span class="tag">${esc(e.followup)}</span>` : ''}</div>
      <div class="s">${esc([e.contact, e.title, e.phone || e.email || e.wechat].filter(Boolean).join(' · '))}</div>
      <div class="s">${'★'.repeat(+e.rating || 0)} ${esc(e.products || e.notes || '')}</div></div></li>`).join('');
  }
  async function reload() { entries = await dbAll(); render(); }
  $('#list').onclick = ev => { const li = ev.target.closest('.item'); if (li) openEditor(entries.find(e => e.id === li.dataset.id)); };
  ['#search', '#filterPhase', '#filterStar'].forEach(s => $(s).addEventListener('input', render));

  // ---------- tabs ----------
  function tab(name) {
    $('#viewLedger').hidden = name !== 'ledger'; $('#viewMore').hidden = name !== 'more';
    document.querySelectorAll('nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  }
  document.querySelectorAll('nav [data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));

  // ---------- merge / dedupe ----------
  function findMatch(f) {
    const keys = ['email', 'wechat', 'whatsapp'];
    for (const e of entries) {
      for (const k of keys) if (f[k] && e[k] && norm(f[k]) === norm(e[k])) return e;
      if (f.phone && e.phone && norm(f.phone).length > 6 && norm(f.phone) === norm(e.phone)) return e;
    }
    if (f.company && f.booth) return entries.find(e => norm(e.company) === norm(f.company) && norm(e.booth) === norm(f.booth)) || null;
    return null;
  }
  const blank = () => Object.fromEntries(FIELDS.map(k => [k, '']));
  function withCtx(f) {
    const o = Object.assign(blank(), f);
    if (!o.booth) o.booth = ctx.booth;
    if (!o.company) o.company = ctx.company;
    return o;
  }
  async function saveEntry(f, existing) {
    const t = now();
    let e;
    if (existing) {
      e = Object.assign({}, existing);
      for (const k of FIELDS) if (f[k] !== undefined && f[k] !== '') e[k] = f[k];
      if (f.photo) e.photo = f.photo;
      e.updated = t;
    } else {
      e = Object.assign({ id: uid(), created: t, updated: t }, blank(), f);
    }
    await dbPut(e);
    await reload();
    return e;
  }

  // ---------- editor ----------
  let editing = null, curPhoto = '', afterSave = null, scanning = false;
  function setStars(n) {
    n = +n || 0; $('#form').rating.value = n || '';
    $('#stars').innerHTML = [1, 2, 3, 4, 5].map(i => `<span data-n="${i}" class="${i <= n ? 'on' : ''}">★</span>`).join('');
  }
  $('#stars').onclick = ev => { const s = ev.target.closest('span'); if (s) setStars(+$('#form').rating.value === +s.dataset.n ? 0 : s.dataset.n); };
  function setPhoto(d) { curPhoto = d || ''; $('#photoPrev').hidden = $('#photoDel').hidden = !d; if (d) $('#photoPrev').src = d; }

  function openEditor(entry, prefill, kind) {
    editing = entry || null;
    const f = $('#form');
    const data = entry ? entry : withCtx(prefill || {});
    FIELDS.forEach(k => { if (f[k] && f[k].type !== 'hidden') f[k].value = data[k] || ''; });
    setStars(data.rating); setPhoto(data.photo);
    $('#formTitle').textContent = entry ? 'Edit entry' : 'New entry';
    $('#formKind').textContent = kind ? `from ${kind}` : '';
    $('#formDel').hidden = !entry;
    $('#formSaveScan').hidden = !!entry || !scanning && !prefill;
    $('#editor').hidden = false; $('#editor').scrollTop = 0;
  }
  function closeEditor() { $('#editor').hidden = true; editing = null; }
  $('#formCancel').onclick = () => { closeEditor(); if (afterSave) { afterSave = null; if (scanning) resumeScan(); } };
  $('#btnAdd').onclick = () => { afterSave = null; openEditor(null); };
  $('#formDel').onclick = async () => { if (editing && confirm('Delete this entry?')) { await dbDel(editing.id); closeEditor(); await reload(); } };
  $('#photoDel').onclick = () => setPhoto('');
  $('#photoIn').onchange = async ev => { const file = ev.target.files[0]; if (file) setPhoto(await shrink(file, 900)); ev.target.value = ''; };

  function readForm() {
    const f = $('#form'), o = {};
    FIELDS.forEach(k => o[k] = (f[k].value || '').trim());
    if (curPhoto) o.photo = curPhoto; else if (editing) o.photo = '';
    return o;
  }
  async function commit() {
    const f = $('#form');
    if (!f.reportValidity()) return false;
    const o = readForm();
    if (editing) {
      Object.assign(editing, o, { updated: now() }); if (!o.photo) delete editing.photo;
      await dbPut(editing); await reload();
    } else {
      const dup = findMatch(o);
      if (dup && confirm(`Looks like "${dup.company}" (booth ${dup.booth}) is already in the ledger. OK = merge into it, Cancel = save as new entry.`)) await saveEntry(o, dup);
      else await saveEntry(o);
    }
    if (o.booth) { ctx.booth = o.booth; $('#ctxBooth').value = o.booth; }
    if (o.company && !editing) { ctx.company = o.company; $('#ctxCompany').value = o.company; }
    saveCtx();
    return true;
  }
  $('#form').onsubmit = async ev => {
    ev.preventDefault();
    if (await commit()) { closeEditor(); toast('Saved'); if (afterSave) { afterSave = null; if (scanning) resumeScan(); } }
  };
  $('#formSaveScan').onclick = async () => { if (await commit()) { closeEditor(); toast('Saved'); openScanner(); } };

  // ---------- image helpers ----------
  async function loadBitmap(file) {
    if (window.createImageBitmap) { try { return await createImageBitmap(file); } catch (e) { } }
    return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
  }
  async function shrink(file, max) {
    const bm = await loadBitmap(file), w = bm.width || bm.naturalWidth, h = bm.height || bm.naturalHeight, s = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  }
  async function decodeFile(file) {
    const bm = await loadBitmap(file), w = bm.width || bm.naturalWidth, h = bm.height || bm.naturalHeight;
    if ('BarcodeDetector' in window) { try { const r = await new BarcodeDetector({ formats: ['qr_code'] }).detect(bm); if (r.length) return r[0].rawValue; } catch (e) { } }
    for (const max of [1600, 1000, 600]) {
      const s = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
      c.width = Math.round(w * s); c.height = Math.round(h * s);
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height), r = jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' });
      if (r) return r.data;
    }
    return null;
  }

  // ---------- scanner ----------
  let stream = null, rafOff = false, detector = null, last = { text: '', t: 0 }, paused = false;
  const vid = $('#video'), cv = document.createElement('canvas'), cg = cv.getContext('2d', { willReadFrequently: true });
  async function openScanner() {
    scanning = true; paused = false; $('#scanner').hidden = false; $('#scanMsg').textContent = 'Starting camera…';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#scanMsg').textContent = 'Live camera needs HTTPS. Use "Photo / image" below to scan from a photo.'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      vid.srcObject = stream; await vid.play();
      if ('BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; } }
      $('#scanMsg').textContent = autoSave ? `Auto-save ON → booth ${ctx.booth || '(none)'}` : 'Point at a QR code';
      rafOff = false; tick();
    } catch (e) { $('#scanMsg').textContent = 'Camera unavailable (' + (e.name || 'error') + '). Use "Photo / image" below.'; }
  }
  function closeScanner() {
    scanning = false; rafOff = true; paused = false;
    if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; vid.srcObject = null;
    $('#scanner').hidden = true;
  }
  function resumeScan() { paused = false; $('#scanMsg').textContent = autoSave ? `Auto-save ON → booth ${ctx.booth || '(none)'}` : 'Point at a QR code'; }
  async function tick() {
    if (rafOff) return;
    if (!paused && vid.videoWidth) {
      let text = null;
      try {
        if (detector) { const r = await detector.detect(vid); if (r.length) text = r[0].rawValue; }
        else {
          const s = Math.min(1, 720 / vid.videoWidth); cv.width = vid.videoWidth * s; cv.height = vid.videoHeight * s;
          cg.drawImage(vid, 0, 0, cv.width, cv.height);
          const d = cg.getImageData(0, 0, cv.width, cv.height), r = jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' });
          if (r) text = r.data;
        }
      } catch (e) { }
      if (text && !(text === last.text && Date.now() - last.t < 3000)) { last = { text, t: Date.now() }; await onCode(text); }
    }
    setTimeout(() => requestAnimationFrame(tick), 120);
  }
  async function onCode(text) {
    if (navigator.vibrate) navigator.vibrate(60);
    const { fields, kind } = parsePayload(text);
    const f = withCtx(fields);
    if (autoSave && f.booth && f.company) {
      const ex = findMatch(f);
      const e = await saveEntry(f, ex);
      $('#scanMsg').textContent = `✓ ${ex ? 'Merged' : 'Saved'}: ${e.company}${e.contact ? ' – ' + e.contact : ''}`;
      return;
    }
    paused = true;
    const ex = findMatch(f);
    afterSave = true;
    if (ex) { openEditor(ex, null, kind); toast('Already in ledger — merged new data'); const fm = $('#form'); FIELDS.forEach(k => { if (f[k] && !fm[k].value && fm[k].type !== 'hidden') fm[k].value = f[k]; }); }
    else openEditor(null, fields, kind);
  }
  $('#btnScan').onclick = openScanner;
  $('#scanClose').onclick = closeScanner;
  $('#scanImg').onchange = async ev => {
    const file = ev.target.files[0]; ev.target.value = ''; if (!file) return;
    $('#scanMsg').textContent = 'Reading image…';
    const t = await decodeFile(file);
    if (t) { paused = true; await onCode(t); if (!$('#editor').hidden) { } }
    else { $('#scanMsg').textContent = 'No QR found in that image. Try again closer, or add manually.'; if (confirm('No QR code found. Save the photo as a new entry (e.g. business card)?')) { paused = true; afterSave = true; scanning = true; openEditor(null, {}); setPhoto(await shrink(file, 900)); } }
  };

  // ---------- CSV / JSON ----------
  const csvCell = v => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  function download(name, text, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  $('#exCsv').onclick = () => {
    const rows = [COLS.join(',')].concat(entries.slice().sort((a, b) => String(a.booth).localeCompare(String(b.booth), undefined, { numeric: true })).map(e => COLS.map(c => csvCell(e[c])).join(',')));
    download(`canton-ledger-${stamp()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
  };
  $('#exJson').onclick = () => download(`canton-ledger-${stamp()}.json`, JSON.stringify(entries, null, 1), 'application/json');
  function parseCSV(t) {
    const rows = []; let row = [], cur = '', q = false;
    t = t.replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
  }
  async function importRecords(recs) {
    let add = 0, merged = 0;
    for (const r of recs) {
      const f = {}; FIELDS.forEach(k => { if (r[k] != null && String(r[k]).trim()) f[k] = String(r[k]).trim(); });
      if (!f.booth && !f.company) continue;
      const ex = findMatch(f);
      await saveEntry(f, ex); ex ? merged++ : add++;
    }
    toast(`Imported: ${add} new, ${merged} merged`, 3500);
  }
  $('#imFile').onchange = async ev => {
    const file = ev.target.files[0]; ev.target.value = ''; if (!file) return;
    const text = await file.text();
    try {
      if (/\.json$/i.test(file.name)) { const j = JSON.parse(text); await importRecords(Array.isArray(j) ? j : [j]); }
      else {
        const rows = parseCSV(text), head = rows.shift().map(h => h.trim().toLowerCase());
        await importRecords(rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]]))));
      }
    } catch (e) { toast('Import failed: ' + e.message, 4000); }
  };
  $('#bulkGo').onclick = async () => {
    const recs = $('#bulk').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const i = l.search(/[\t,，]/); return i < 0 ? { booth: '', company: l } : { booth: l.slice(0, i).trim(), company: l.slice(i + 1).trim() };
    });
    await importRecords(recs); $('#bulk').value = '';
  };
  $('#wipe').onclick = async () => { if (confirm('Delete ALL entries on this device? Export a backup first.') && confirm('Really delete everything?')) { await dbClear(); await reload(); toast('All data deleted'); } };

  // ---------- boot ----------
  openDB().then(reload);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
