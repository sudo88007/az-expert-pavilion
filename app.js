/* BuildSight – client-side construction data analyzer. No backend required. */
const $ = (s, r = document) => r.querySelector(s);
const KEY = 'buildsight.v1';
let state = { files: {} };
let charts = [];

/* ---------- persistence ---------- */
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('Data too large to save locally – it will be lost on refresh'); }
  if (window.AUTH) AUTH.push();
}
function load() { try { state = JSON.parse(localStorage.getItem(KEY)) || { files: {} }; } catch { state = { files: {} }; } }

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3200); }

/* ---------- parsing helpers ---------- */
const num = v => {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return NaN;
  const s = String(v).replace(/[^0-9.\-]/g, '');
  return s === '' || s === '-' ? NaN : parseFloat(s);
};
function toDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5));
  if (typeof v === 'string' && /\d/.test(v)) { const d = new Date(v); if (!isNaN(d)) return d; }
  return null;
}
const ROLES = {
  budget: /budget|planned.?cost|estimate|contract.?(value|sum|amount)|boq|baseline/i,
  actual: /actual|spent|paid|to.?date|incurred|expenditure/i,
  amount: /cost|amount|total|price|value|payment|invoice/i,
  progress: /progress|complete|%|percent/i,
  status: /status|state/i,
  start: /start|begin|from/i,
  end: /end|finish|due|deadline|complet.*date|to$/i,
  category: /trade|category|contractor|vendor|supplier|subcontract|package|phase|discipline|zone|section|type|area/i,
  name: /task|activity|item|description|work|name|scope/i,
};
function detectRoles(headers, rows) {
  const roles = {}, used = new Set();
  const take = (role, test) => {
    const h = headers.find(h => !used.has(h) && ROLES[role].test(h) && (!test || test(h)));
    if (h) { roles[role] = h; used.add(h); }
  };
  const isNum = h => rows.filter(r => !isNaN(num(r[h]))).length > rows.length * .5;
  const isDate = h => rows.filter(r => toDate(r[h])).length > rows.length * .5;
  take('budget', isNum); take('actual', isNum);
  if (!roles.budget && !roles.actual) take('amount', isNum);
  take('progress', isNum); take('status');
  take('start', isDate); take('end', isDate);
  take('category', h => !isNum(h)); take('name', h => !isNum(h));
  if (!roles.category) {
    const c = headers.find(h => !used.has(h) && !isNum(h) && !isDate(h) &&
      new Set(rows.map(r => r[h])).size < Math.max(3, rows.length / 2));
    if (c) roles.category = c;
  }
  return roles;
}
function normalizeRows(rows) {
  const headers = []; rows.forEach(r => Object.keys(r).forEach(k => !headers.includes(k) && headers.push(k)));
  return headers;
}
function parseSheet(ws, name) {
  // find header row: first row with >=2 non-empty string cells
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', cellDates: true, raw: true });
  let h = aoa.findIndex(r => r.filter(c => typeof c === 'string' && c.trim()).length >= 2);
  if (h < 0) return null;
  const headers = aoa[h].map((c, i) => String(c || `Column ${i + 1}`).trim());
  const rows = aoa.slice(h + 1).filter(r => r.some(c => c !== '')).map(r => {
    const o = {}; headers.forEach((k, i) => o[k] = r[i] instanceof Date ? r[i].toISOString().slice(0, 10) : r[i]); return o;
  });
  if (!rows.length) return null;
  return { name, headers, rows, roles: detectRoles(headers, rows) };
}

/* ---------- file ingestion ---------- */
async function ingest(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const replaced = !!state.files[file.name];
  let applied = true;
  try {
    if (ext === 'pdf') {
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      let pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const c = await (await pdf.getPage(i)).getTextContent();
        pages.push(c.items.map(x => x.str).join(' '));
      }
      applied = stageFile(file.name, { type: 'pdf', pages, added: Date.now() });
    } else {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheets = wb.SheetNames.map(n => parseSheet(wb.Sheets[n], n)).filter(Boolean);
      if (!sheets.length) return toast(`No table found in ${file.name}`);
      applied = stageFile(file.name, { type: 'excel', sheets, added: Date.now() });
    }
    if (applied) toast(replaced ? `Updated ${file.name}` : `Added ${file.name}`);
  } catch (e) { console.error(e); toast(`Could not read ${file.name}`); }
}
async function handleFiles(list) { if (window.AUTH && !AUTH.canEdit()) return toast('Your account is view-only'); for (const f of list) await ingest(f); save(); render(); }

/* ---------- analysis ---------- */
const sheetsAll = () => Object.entries(state.files).filter(([, f]) => f.type === 'excel')
  .flatMap(([fn, f]) => f.sheets.map(s => ({ ...s, file: fn })));
const fmt = n => isNaN(n) ? '–' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString();
const isDone = s => /complete|done|finished|closed|100/i.test(String(s));

/* Decide which pavilion a row belongs to: a pavilion/building column, text like "Pavilion 7", the sheet name, or the file name. */
function pavilionOf(s, row, all) {
  if (s._pc === undefined) s._pc = s.headers.find(h => /pavili?on/i.test(h)) || s.headers.find(h => /building|plot|block|villa|^unit|zone|area/i.test(h)) || null;
  const clean = v => String(v).trim().replace(/\s+/g, ' ');
  if (s._pc && row[s._pc] !== '' && row[s._pc] != null) return clean(row[s._pc]);
  for (const h of s.headers) { const m = String(row[h] ?? '').match(/pavili?on\s*[-#]?\s*[\w]+(?:\s[A-Za-z]+)?/i); if (m) return clean(m[0]); }
  const sameFile = all.filter(x => x.file === s.file).length;
  return clean(sameFile > 1 ? s.name : s.file.replace(/\.[^.]+$/, ''));
}

function analyze() {
  const A = { budget: 0, actual: 0, rows: 0, prog: [], delayed: [], overruns: [], byCat: {}, status: {}, months: {}, alerts: [], pav: {}, sheets: sheetsAll() };
  const today = new Date();
  A.sheets.forEach(s => {
    const r = s.roles; A.rows += s.rows.length;
    // data quality
    const cells = s.rows.length * s.headers.length;
    const empty = s.rows.reduce((a, row) => a + s.headers.filter(h => row[h] === '' || row[h] == null).length, 0);
    if (cells && empty / cells > .15) A.alerts.push({ lv: 'low', t: `Data quality: "${s.name}" (${s.file}) has ${(empty / cells * 100).toFixed(0)}% empty cells.` });
    const conCol = s.headers.find(h => /contractor|vendor|supplier|subcontract/i.test(h)) || r.category;
    s.rows.forEach(row => {
      const d0 = A.delayed.length, o0 = A.overruns.length;
      const b = num(row[r.budget ?? r.amount]), a = num(row[r.actual]);
      const cat = row[r.category] || 'Uncategorized', label = row[r.name] || row[s.headers[0]];
      if (!isNaN(b)) A.budget += b;
      if (!isNaN(a)) A.actual += a;
      const c = A.byCat[cat] ??= { budget: 0, actual: 0 };
      if (!isNaN(b)) c.budget += b; if (!isNaN(a)) c.actual += a;
      if (!isNaN(b) && !isNaN(a) && b > 0 && a > b * 1.1) A.overruns.push({ label, cat, over: a - b, pct: (a / b - 1) * 100 });
      let p = num(row[r.progress]); if (!isNaN(p)) { if (p <= 1 && /%/.test(r.progress + '') === false && p > 0 && p <= 1) p *= 100; A.prog.push(p); }
      if (r.status) { const st = String(row[r.status] || 'Unknown'); A.status[st] = (A.status[st] || 0) + 1; }
      const end = toDate(row[r.end]);
      if (end) {
        const k = end.toISOString().slice(0, 7); A.months[k] = (A.months[k] || 0) + 1;
        const done = (r.status && isDone(row[r.status])) || p >= 100;
        if (end < today && !done) A.delayed.push({ label, cat, days: Math.floor((today - end) / 864e5), p });
      }
      const pn = pavilionOf(s, row, A.sheets), P = A.pav[pn.toLowerCase()] ??= { name: pn, budget: 0, actual: 0, prog: [], delayed: 0, overruns: 0, rows: 0, files: new Set(), contractors: {}, worst: [] };
      P.rows++; P.files.add(s.file);
      if (!isNaN(b)) P.budget += b; if (!isNaN(a)) P.actual += a; if (!isNaN(p)) P.prog.push(p);
      if (A.delayed.length > d0) { P.delayed++; P.worst.push('Delayed: ' + label); }
      if (A.overruns.length > o0) { P.overruns++; P.worst.push('Overrun: ' + label); }
      const con = row[conCol]; if (con) { const c = P.contractors[con] ??= { budget: 0, actual: 0, n: 0 }; c.n++; if (!isNaN(b)) c.budget += b; if (!isNaN(a)) c.actual += a; }
    });
  });
  A.avgProg = A.prog.length ? A.prog.reduce((a, b) => a + b, 0) / A.prog.length : NaN;
  A.var = A.actual - A.budget;
  A.overruns.sort((a, b) => b.over - a.over); A.delayed.sort((a, b) => b.days - a.days);
  if (A.budget && A.actual) {
    const pct = A.var / A.budget * 100;
    A.alerts.unshift({ lv: pct > 10 ? 'high' : pct > 0 ? 'med' : 'low', t: `Overall cost is ${Math.abs(pct).toFixed(1)}% ${pct > 0 ? 'over' : 'under'} budget (${fmt(Math.abs(A.var))}).` });
  }
  A.overruns.slice(0, 8).forEach(o => A.alerts.push({ lv: o.pct > 25 ? 'high' : 'med', t: `Cost overrun: "${o.label}" (${o.cat}) is ${o.pct.toFixed(0)}% over budget (+${fmt(o.over)}).` }));
  A.delayed.slice(0, 8).forEach(d => A.alerts.push({ lv: d.days > 30 ? 'high' : 'med', t: `Delay: "${d.label}" (${d.cat}) is ${d.days} days past due${isNaN(d.p) ? '' : ` at ${d.p.toFixed(0)}% complete`}.` }));
  return A;
}

/* ---------- views ---------- */
const empty = (msg = 'Upload an Excel or PDF file, or load the demo data, to see analysis here.') => `<div class="card empty"><h2>No data yet</h2><p>${msg}</p></div>`;
const kpi = (l, v, s = '', cls = '') => `<div class="card kpi"><div class="lbl">${l}</div><div class="val">${v}</div><div class="sub ${cls}">${s}</div></div>`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function mkChart(id, cfg) {
  const el = document.getElementById(id); if (!el) return;
  Chart.defaults.color = '#8b95b3'; Chart.defaults.font.family = 'Outfit';
  charts.push(new Chart(el, { ...cfg, options: { responsive: true, maintainAspectRatio: false, ...(cfg.options || {}) } }));
}
const PAL = ['#6d7cff', '#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#f472b6', '#60a5fa'];

function viewDashboard(A) {
  if (!A.sheets.length) return empty();
  const costOver = A.var > 0;
  $('#view-dashboard').innerHTML = `
   <div class="grid kpis">
     ${kpi('Total Budget', fmt(A.budget), `${A.rows} records · ${A.sheets.length} sections`)}
     ${kpi('Actual Cost', fmt(A.actual), A.budget ? `${(A.actual / A.budget * 100).toFixed(0)}% of budget used` : '')}
     ${kpi('Variance', (costOver ? '+' : '') + fmt(A.var), costOver ? 'Over budget' : 'Within budget', costOver ? 'bad' : 'ok')}
     ${kpi('Avg Progress', isNaN(A.avgProg) ? '–' : A.avgProg.toFixed(0) + '%', '')}
     ${kpi('Delayed Tasks', A.delayed.length, A.delayed.length ? 'Need attention' : 'On track', A.delayed.length ? 'warn' : 'ok')}
     ${kpi('Overruns', A.overruns.length, 'items >10% over budget', A.overruns.length ? 'bad' : 'ok')}
   </div>
   <div class="grid charts">
     <div class="card"><h2>Budget vs Actual by category</h2><div class="chart-box"><canvas id="c1"></canvas></div></div>
     <div class="card"><h2>Status distribution</h2><div class="chart-box"><canvas id="c2"></canvas></div></div>
     <div class="card"><h2>Deadlines per month</h2><div class="chart-box"><canvas id="c3"></canvas></div></div>
     <div class="card"><h2>Top alerts</h2>${A.alerts.slice(0, 5).map(a => `<div class="alert ${a.lv}">${esc(a.t)}</div>`).join('') || '<p class="muted">No issues detected 🎉</p>'}</div>
   </div>`;
  const cats = Object.entries(A.byCat).sort((a, b) => b[1].budget + b[1].actual - a[1].budget - a[1].actual).slice(0, 10);
  mkChart('c1', { type: 'bar', data: { labels: cats.map(c => c[0]), datasets: [{ label: 'Budget', data: cats.map(c => c[1].budget), backgroundColor: '#6d7cff', borderRadius: 6 }, { label: 'Actual', data: cats.map(c => c[1].actual), backgroundColor: '#22d3ee', borderRadius: 6 }] } });
  const st = Object.entries(A.status);
  if (st.length) mkChart('c2', { type: 'doughnut', data: { labels: st.map(s => s[0]), datasets: [{ data: st.map(s => s[1]), backgroundColor: PAL, borderWidth: 0 }] }, options: { cutout: '65%' } });
  const mo = Object.entries(A.months).sort();
  if (mo.length) mkChart('c3', { type: 'line', data: { labels: mo.map(m => m[0]), datasets: [{ label: 'Due', data: mo.map(m => m[1]), borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,.2)', fill: true, tension: .4 }] } });
}

let sortState = {};
function viewSections(A) {
  if (!A.sheets.length) return empty();
  $('#view-sections').innerHTML = A.sheets.map((s, i) => {
    const roleChips = Object.entries(s.roles).map(([k, v]) => `<span class="chip">${k}: ${esc(v)}</span>`).join(' ');
    return `<div class="card" style="margin-bottom:16px"><h2>${esc(s.name)} <span class="muted small">· ${esc(s.file)} · ${s.rows.length} rows</span></h2>
    <div class="row">${roleChips}</div>
    <div class="row"><input type="text" placeholder="Search in this section…" data-search="${i}"></div>
    <div class="tbl-wrap"><table id="tbl-${i}"></table></div></div>`;
  }).join('');
  A.sheets.forEach((s, i) => drawTable(s, i, ''));
  document.querySelectorAll('[data-search]').forEach(inp => inp.oninput = () => drawTable(A.sheets[inp.dataset.search], inp.dataset.search, inp.value));
}
function drawTable(s, i, q) {
  q = q.toLowerCase(); let rows = s.rows.filter(r => !q || s.headers.some(h => String(r[h]).toLowerCase().includes(q)));
  const ss = sortState[i]; if (ss) rows = [...rows].sort((a, b) => { const x = a[ss.h], y = b[ss.h]; const c = !isNaN(num(x)) && !isNaN(num(y)) ? num(x) - num(y) : String(x).localeCompare(String(y)); return ss.d * c; });
  $('#tbl-' + i).innerHTML = `<thead><tr>${s.headers.map(h => `<th data-h="${esc(h)}">${esc(h)}${ss?.h === h ? (ss.d > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 300).map(r => `<tr>${s.headers.map(h => `<td title="${esc(r[h])}">${esc(r[h])}</td>`).join('')}</tr>`).join('')}</tbody>`;
  $('#tbl-' + i).querySelectorAll('th').forEach(th => th.onclick = () => { const h = th.dataset.h; sortState[i] = { h, d: ss?.h === h ? -ss.d : 1 }; drawTable(s, i, q); });
}

function viewRisks(A) {
  if (!A.sheets.length) return empty();
  const rank = { high: 0, med: 1, low: 2 }, lab = { high: 'High', med: 'Medium', low: 'Info' };
  $('#view-risks').innerHTML = `<div class="card"><h2>Detected risks &amp; alerts (${A.alerts.length})</h2>
    ${[...A.alerts].sort((a, b) => rank[a.lv] - rank[b.lv]).map(a => `<div class="alert ${a.lv}"><strong>${lab[a.lv]}</strong> – ${esc(a.t)}</div>`).join('') || '<p class="muted">No issues detected.</p>'}</div>
    <div class="card" style="margin-top:16px"><h2>Category progress</h2>${Object.entries(A.byCat).map(([k, v]) => { const p = v.budget ? Math.min(100, v.actual / v.budget * 100) : 0; return `<div style="margin-bottom:12px"><div class="row" style="margin:0 0 4px;justify-content:space-between"><span>${esc(k)}</span><span class="muted small">${fmt(v.actual)} / ${fmt(v.budget)}</span></div><div class="bar"><i style="width:${p}%"></i></div></div>`; }).join('')}</div>`;
}

function viewDocs() {
  const pdfs = Object.entries(state.files).filter(([, f]) => f.type === 'pdf');
  if (!pdfs.length) return $('#view-docs').innerHTML = empty('Upload PDF files (contracts, reports, specs) to search them here and ask AI about them.');
  $('#view-docs').innerHTML = `<div class="card"><div class="row"><input type="text" id="pdf-q" placeholder="Search all PDFs (e.g. penalty, retention, deadline)…"></div><div id="pdf-res"></div></div>` +
    pdfs.map(([n, f]) => `<div class="card" style="margin-top:16px"><h2>${esc(n)} <span class="muted small">· ${f.pages.length} pages</span></h2><p class="muted small">${esc(f.pages.join(' ').slice(0, 500))}…</p></div>`).join('');
  $('#pdf-q').oninput = e => {
    const q = e.target.value.trim().toLowerCase(); if (q.length < 3) return $('#pdf-res').innerHTML = '';
    const hits = [];
    pdfs.forEach(([n, f]) => f.pages.forEach((t, i) => { let idx = t.toLowerCase().indexOf(q); while (idx >= 0 && hits.length < 40) { hits.push(`<div class="alert low"><strong>${esc(n)} p.${i + 1}</strong><br>…${esc(t.slice(Math.max(0, idx - 100), idx + 160))}…</div>`); idx = t.toLowerCase().indexOf(q, idx + 200); } }));
    $('#pdf-res').innerHTML = hits.join('') || '<p class="muted">No matches.</p>';
  };
}

/* ---------- AI (Gemini free tier, key stored only in your browser) ---------- */
function buildContext(A) {
  let c = `AZ EXPERT - PAVILION PROJECT (Phase A, 174 villas). Summary: budget ${A.budget}, actual ${A.actual}, variance ${A.var}, avg progress ${A.avgProg}, delayed ${A.delayed.length}, overruns ${A.overruns.length}.\nAlerts:\n${A.alerts.slice(0, 25).map(a => '- ' + a.t).join('\n')}\n`;
  try {
    const ex = paExcel(A);
    const lines = PA_VILLAS.map(v => { const i = paInfo(v.id, ex), m = i.m; return `Villa ${v.id}: ${i.status}, progress ${has(i.progress) ? Math.round(i.progress) + '%' : 'n/a'}, budget ${i.budget ?? 'n/a'}, actual ${i.actual ?? 'n/a'}${m.contractor ? ', contractor ' + m.contractor : ''}${m.owner ? ', owner ' + m.owner : ''}${i.issues.length ? ', issues: ' + i.issues.join('; ') : ''}`; });
    c += `\nPer-villa data:\n` + lines.join('\n') + '\n';
  } catch (e) { /* villa module unavailable */ }
  A.sheets.forEach(s => { c += `\nSheet "${s.name}" (${s.file}) columns: ${s.headers.join(', ')}\n` + s.rows.slice(0, 15).map(r => s.headers.map(h => r[h]).join(' | ')).join('\n'); });
  Object.entries(state.files).filter(([, f]) => f.type === 'pdf').forEach(([n, f]) => c += `\nPDF "${n}":\n` + f.pages.join(' ').slice(0, 4000));
  return c.slice(0, 24000);
}
/* Delegated to ai.js */
function viewAI(A) {
  if (typeof window.viewAI === 'function' && window.viewAI !== viewAI) {
    return window.viewAI(A);
  }
}

/* ---------- masterplan map ---------- */
let mpSel = null, mpEdit = false, mpMode = 'health';
function pavStats(P) {
  const prog = P.prog.length ? P.prog.reduce((a, b) => a + b, 0) / P.prog.length : NaN;
  const flagged = (P.delayed + P.overruns) / Math.max(1, P.rows), v = P.budget ? (P.actual / P.budget - 1) * 100 : NaN;
  const health = !P.rows ? 'none' : (P.delayed + P.overruns === 0 ? 'ok' : flagged > .25 ? 'bad' : 'warn');
  return { prog, v, health };
}
const HCOL = { ok: '#34d399', warn: '#fbbf24', bad: '#fb7185', none: '#64748b' };
function pavColor(P) {
  const s = pavStats(P);
  if (mpMode === 'progress') return isNaN(s.prog) ? HCOL.none : `hsl(${Math.max(0, Math.min(130, s.prog * 1.3))} 75% 52%)`;
  if (mpMode === 'cost') return isNaN(s.v) ? HCOL.none : s.v <= 0 ? HCOL.ok : s.v < 10 ? HCOL.warn : HCOL.bad;
  return HCOL[s.health];
}
function autoPos(names) {
  const n = names.length, cols = Math.ceil(Math.sqrt(n * 1.6)), rows = Math.ceil(n / cols);
  state.pos ??= {};
  names.forEach((k, i) => { if (!state.pos[k]) state.pos[k] = { x: 10 + (i % cols + .5) * (80 / cols), y: 14 + (Math.floor(i / cols) + .5) * (72 / rows) }; });
}
function fileToMapImage(file) {
  return new Promise(async res => {
    let src;
    if (/pdf$/i.test(file.name)) {
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, pg = await pdf.getPage(1), vp = pg.getViewport({ scale: 1.8 });
      const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
      await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; return res(cv.toDataURL('image/jpeg', .8));
    }
    const img = new Image(); img.onload = () => {
      const k = Math.min(1, 1800 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = img.width * k; cv.height = img.height * k; cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', .82));
    }; img.src = URL.createObjectURL(file);
  });
}
function viewMasterplan(A) {
  const names = Object.keys(A.pav);
  if (!names.length) return $('#view-masterplan').innerHTML = empty('Upload one or more Excel files. Pavilions are detected automatically and placed on the masterplan.');
  autoPos(names);
  const bg = state.map ? `background-image:url(${state.map})` : '';
  $('#view-masterplan').innerHTML = `
   <div class="row">
     <label class="btn" for="map-input">🖼 Upload masterplan (image / PDF)</label><input type="file" id="map-input" accept="image/*,.pdf" hidden>
     <button class="btn ${mpEdit ? 'primary' : ''}" id="mp-edit">${mpEdit ? '✔ Done editing' : '✋ Move pavilions'}</button>
     <button class="btn" id="mp-reset">Reset layout</button>
     ${state.map ? '<button class="btn" id="mp-nomap">Remove image</button>' : ''}
     <select id="mp-mode" style="width:auto"><option value="health">Color: Risk</option><option value="progress">Color: Progress</option><option value="cost">Color: Cost variance</option></select>
     <span class="muted small">${names.length} pavilions detected from ${Object.keys(state.files).length} file(s)</span>
   </div>
   <div class="mp-layout">
     <div class="mp-map ${state.map ? 'has-img' : ''}" id="mp-map" style="${bg}">
       ${names.map(k => { const P = A.pav[k], s = pavStats(P), p = state.pos[k]; return `<div class="pav ${mpSel === k ? 'sel' : ''} ${mpEdit ? 'edit' : ''}" data-k="${esc(k)}" style="left:${p.x}%;top:${p.y}%;--c:${pavColor(P)}"><b>${esc(P.name)}</b><span>${isNaN(s.prog) ? '' : s.prog.toFixed(0) + '%'}</span></div>`; }).join('')}
     </div>
     <div class="card" id="mp-detail"></div>
   </div>
   <div class="row muted small" style="margin-top:10px"><span class="chip" style="border-color:${HCOL.ok}">On track</span><span class="chip" style="border-color:${HCOL.warn}">Some issues</span><span class="chip" style="border-color:${HCOL.bad}">High risk</span><span class="chip">No data</span></div>`;
  $('#mp-mode').value = mpMode; $('#mp-mode').onchange = e => { mpMode = e.target.value; render(); };
  $('#map-input').onchange = async e => { const f = e.target.files[0]; if (!f) return; state.map = await fileToMapImage(f); save(); render(); toast('Masterplan loaded – click "Move pavilions" to place each one'); mpEdit = true; render(); };
  $('#mp-edit').onclick = () => { mpEdit = !mpEdit; render(); };
  $('#mp-reset').onclick = () => { state.pos = {}; save(); render(); };
  if ($('#mp-nomap')) $('#mp-nomap').onclick = () => { delete state.map; save(); render(); };
  const detail = k => {
    mpSel = k; document.querySelectorAll('.pav').forEach(el => el.classList.toggle('sel', el.dataset.k === k));
    const P = A.pav[k]; if (!P) return $('#mp-detail').innerHTML = '<p class="muted">Click a pavilion on the map to see its details.</p>';
    const s = pavStats(P), cons = Object.entries(P.contractors).sort((a, b) => b[1].actual - a[1].actual);
    $('#mp-detail').innerHTML = `<h2>${esc(P.name)}</h2><p class="muted small">${P.rows} records · ${[...P.files].map(esc).join(', ')}</p>
     <div class="grid" style="grid-template-columns:1fr 1fr;margin:12px 0">
       <div><div class="muted small">Budget</div><b>${fmt(P.budget)}</b></div><div><div class="muted small">Actual</div><b>${fmt(P.actual)}</b></div>
       <div><div class="muted small">Variance</div><b class="${s.v > 0 ? 'bad' : 'ok'}">${isNaN(s.v) ? '–' : (s.v > 0 ? '+' : '') + s.v.toFixed(1) + '%'}</b></div>
       <div><div class="muted small">Progress</div><b>${isNaN(s.prog) ? '–' : s.prog.toFixed(0) + '%'}</b></div></div>
     <div class="bar"><i style="width:${isNaN(s.prog) ? 0 : Math.min(100, s.prog)}%"></i></div>
     <h2 style="margin-top:16px">Delays &amp; risks</h2>
     ${P.worst.length ? P.worst.slice(0, 6).map(w => `<div class="alert ${/Delayed/.test(w) ? 'med' : 'high'}">${esc(w)}</div>`).join('') + (P.worst.length > 6 ? `<p class="muted small">+${P.worst.length - 6} more</p>` : '') : '<p class="ok">No delays or overruns 🎉</p>'}
     <h2 style="margin-top:16px">Contractors</h2>
     ${cons.length ? `<table><thead><tr><th>Name</th><th>Items</th><th>Actual</th></tr></thead><tbody>${cons.slice(0, 8).map(([n, c]) => `<tr><td>${esc(n)}</td><td>${c.n}</td><td>${fmt(c.actual)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">No contractor column found.</p>'}`;
  };
  detail(A.pav[mpSel] ? mpSel : null);
  // click + drag
  const map = $('#mp-map');
  map.querySelectorAll('.pav').forEach(el => {
    el.onpointerdown = ev => {
      ev.preventDefault(); detail(el.dataset.k);
      if (!mpEdit) return; el.setPointerCapture(ev.pointerId);
      el.onpointermove = m => { const r = map.getBoundingClientRect(); const x = Math.max(2, Math.min(98, (m.clientX - r.left) / r.width * 100)), y = Math.max(3, Math.min(97, (m.clientY - r.top) / r.height * 100)); state.pos[el.dataset.k] = { x, y }; el.style.left = x + '%'; el.style.top = y + '%'; };
      el.onpointerup = () => { el.onpointermove = el.onpointerup = null; save(); };
    };
  });
}

/* ---------- export ---------- */
function exportReport() {
  const A = analyze(); if (!A.sheets.length) return toast('Nothing to export');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Metric', 'Value'], ['Budget', A.budget], ['Actual', A.actual], ['Variance', A.var], ['Avg progress %', A.avgProg], ['Delayed tasks', A.delayed.length], ['Overruns', A.overruns.length]]), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.entries(A.byCat).map(([k, v]) => ({ Category: k, Budget: v.budget, Actual: v.actual, Variance: v.actual - v.budget }))), 'By Category');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(A.alerts.map(a => ({ Level: a.lv, Alert: a.t }))), 'Alerts');
  XLSX.writeFile(wb, 'BuildSight-Report.xlsx');
}

/* ---------- demo ---------- */
function loadDemo() {
  const cats = ['Concrete', 'Steel', 'Electrical', 'Plumbing', 'HVAC', 'Finishing', 'Earthworks'];
  const cons = ['Alpha Build', 'Nile Steel Co', 'Volt Masters', 'AquaPro', 'CoolAir Ltd', 'Prime Finish', 'GroundWorks'];
  const sts = ['Completed', 'In Progress', 'Not Started', 'Delayed'];
  let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const rows = Array.from({ length: 174 }, (_, i) => {
    const b = Math.round(20000 + rnd() * 180000), k = Math.floor(rnd() * cats.length), st = sts[Math.floor(rnd() * 4)];
    const s = new Date(2026, Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 25)), e = new Date(+s + (20 + rnd() * 90) * 864e5);
    const pr = st === 'Completed' ? 100 : st === 'Not Started' ? 0 : Math.round(rnd() * 90);
    return { 'Villa': String(1 + (i % 174)).padStart(3, '0'), 'Task': `${cats[k]} package ${i + 1}`, 'Trade': cats[k], 'Contractor': cons[k], 'Budget': b, 'Actual Cost': Math.round(b * (st === 'Not Started' ? 0 : .7 + rnd() * .6)), 'Progress %': pr, 'Status': st, 'Start Date': s.toISOString().slice(0, 10), 'End Date': e.toISOString().slice(0, 10) };
  });
  const headers = Object.keys(rows[0]);
  state.files['demo-project.xlsx'] = { type: 'excel', added: Date.now(), sheets: [{ name: 'Schedule & Cost', headers, rows, roles: detectRoles(headers, rows) }] };
  save(); render(); toast('Demo data loaded');
}

/* ---------- router / render ---------- */
const titles = { approvals: ['Approvals', 'Review, approve or reject changes before they go live'], users: ['User Management', 'Create accounts and control who can view or edit'], phasea: ['Phase A Masterplan', 'Click a villa – admins can edit, Excel data updates automatically'], dashboard: ['Project Dashboard', 'Live overview of cost, progress and risk'], masterplan: ['Masterplan Map', 'Every pavilion on the site, colored by status'], sections: ['Sections', 'Every sheet detected from your files'], risks: ['Risks & Alerts', 'Automatically detected problems'], docs: ['PDF Documents', 'Search contracts and reports'], ai: ['Ask AI', 'Chat with your project data'] };
let current = 'phasea';
function render() {
  charts.forEach(c => c.destroy()); charts = [];
  const A = analyze(), n = Object.keys(state.files).length;
  
  const allowed = window.AUTH && AUTH.user && state.settings && state.settings.userViews ? state.settings.userViews[AUTH.user.id] : null;
  const isAdmin = window.AUTH && AUTH.user && AUTH.user.role === 'admin';
  document.querySelectorAll('.nav-btn').forEach(b => {
     const v = b.dataset.view;
     if (v === 'users' || v === 'approvals') return; 
     if (isAdmin || !allowed || allowed.includes(v)) b.style.display = '';
     else b.style.display = 'none';
  });
  if (!isAdmin && allowed && !allowed.includes(current) && allowed.length > 0) {
     current = allowed[0];
     document.querySelectorAll('.nav-btn').forEach(x => x.classList.toggle('active', x.dataset.view === current));
  }

  $('#page-sub').textContent = n ? `${n} file(s) loaded · ${A.rows} records analyzed` : titles[current][1];
  $('#page-title').textContent = titles[current][0];
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('#view-' + current).classList.remove('hidden');
  ({ approvals: viewApprovals, users: viewUsers, phasea: viewPhaseA, dashboard: viewDashboard, masterplan: viewMasterplan, sections: viewSections, risks: viewRisks, docs: viewDocs, ai: viewAI })[current](A);
}
document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => {
  document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); current = b.dataset.view; render();
});
$('#file-input').onchange = e => { handleFiles(e.target.files); e.target.value = ''; };
$('#btn-demo').onclick = loadDemo; $('#btn-export').onclick = exportReport;
$('#btn-clear').onclick = () => { if (confirm('Delete all loaded data?')) { state = { files: {} }; save(); render(); } };
const dz = $('#dropzone');
['dragenter', 'dragover'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
window.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
load(); render();
