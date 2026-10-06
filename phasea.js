/* Phase A masterplan – 174 clickable villas, admin editing, Excel auto-analysis.
   Coordinates are in the same 910x719 space as the reference plan screenshot,
   so uploading that screenshot as background lines everything up. */
const PA_RAW = `155:160,83 156:153,109 157:147,133 158:137,158 159:125,181 160:113,201 161:96,222 162:80,241 163:62,261 164:58,299 165:62,321 166:65,346 167:68,368 168:73,396 169:76,417 170:79,443 171:82,467 172:87,490 173:90,513 174:94,536
154:230,113 153:283,118 152:323,118 151:369,114 150:411,108 149:456,100 148:501,93 147:547,85 146:596,77 145:650,93 144:690,130 143:713,177 142:722,231 141:711,282 140:684,330 139:655,361 138:629,404 137:613,445 136:608,494 135:607,539 134:598,586 133:588,634
026:201,181 027:251,198 025:189,207 028:241,222 024:175,228 029:227,247 023:160,251 030:214,268 022:143,272 031:197,291 021:124,293 032:186,321 020:130,326 019:135,357 033:187,349 034:190,374 018:137,378 017:140,408 035:194,401 036:198,425 016:144,432 015:150,458 037:203,453 014:153,483 038:227,481 013:157,510 039:254,491 040:278,499 012:188,531 011:216,535 041:303,511 010:239,544 042:326,522 009:267,553 008:290,566 043:349,538 007:313,580 044:369,555 045:390,574 006:334,597 046:409,593 005:354,617 047:425,614 004:369,636 048:438,637 003:388,660 049:452,661 002:401,682 050:463,685 001:413,707
074:392,185 073:327,197 075:382,212 072:316,220 076:375,236 071:305,242 077:362,262 070:293,265 078:352,285 069:283,288 079:338,309 068:268,309 080:326,335 067:251,339 081:329,367 066:257,366 065:261,387 082:350,391 083:375,405 064:269,424 084:397,418 063:294,433 062:316,442 085:420,433 061:340,452 086:443,451 060:362,466 087:464,468 059:385,481 088:482,487 058:405,496 089:501,507 057:423,511 090:517,527 056:442,531 091:535,549 055:457,552 054:475,571 053:490,591 052:505,613 051:516,637
114:451,203 113:444,228 112:434,252 111:426,277 110:413,302 109:400,323 108:387,348 107:423,360 106:447,378 105:462,328 104:473,300 103:486,279 102:500,257 101:513,231 115:480,174 116:503,169 117:533,164 118:557,159 119:583,155 120:619,160 121:638,181 122:651,209 123:652,236 124:644,265 125:629,288 126:613,305 127:598,329 128:581,351 129:568,375 130:558,399 131:550,427 132:544,451 093:485,405 092:506,424 094:513,365 095:526,339 096:538,315 097:553,292 098:570,272 099:588,252 100:588,213`;
const PA_VILLAS = PA_RAW.split(/\s+/).map(t => { const [id, xy] = t.split(':'); const [x, y] = xy.split(',').map(Number); return { id, x, y }; }).sort((a, b) => a.id.localeCompare(b.id));
const PA_STATUS = ['Not started', 'In progress', 'Completed', 'On hold'];
const PA_COL = { 'Not started': '#64748b', 'In progress': '#60a5fa', 'Completed': '#34d399', 'On hold': '#a78bfa', 'No data': '#334155' };
let paSel = null, paAdmin = false, paMode = 'status', paVB = { x: 0, y: 0, w: 910, h: 719 }, paSearch = '';
const has = v => v !== undefined && v !== null && v !== '';

/* Excel rows -> villa id (last number in the pavilion/villa key, e.g. "Villa 12" -> "012") */
function paExcel(A) {
  const out = {};
  Object.values(A.pav).forEach(P => {
    const m = String(P.name).match(/(\d+)(?!.*\d)/); if (!m) return;
    const n = parseInt(m[1], 10); if (n < 1 || n > 174) return;
    const id = String(n).padStart(3, '0'), o = out[id] ??= { budget: 0, actual: 0, prog: [], delayed: 0, overruns: 0, rows: 0, worst: [], contractors: {}, files: new Set() };
    o.budget += P.budget; o.actual += P.actual; o.prog.push(...P.prog); o.delayed += P.delayed; o.overruns += P.overruns; o.rows += P.rows;
    o.worst.push(...P.worst); P.files.forEach(f => o.files.add(f));
    Object.entries(P.contractors).forEach(([k, c]) => { const x = o.contractors[k] ??= { n: 0, actual: 0 }; x.n += c.n; x.actual += c.actual; });
  });
  return out;
}
function paInfo(id, ex) {
  const m = (state.villas || {})[id] || {}, e = ex[id];
  const eProg = e && e.prog.length ? e.prog.reduce((a, b) => a + b, 0) / e.prog.length : undefined;
  const progress = has(m.progress) ? +m.progress : eProg;
  const budget = has(m.budget) ? +m.budget : (e && e.budget ? e.budget : undefined);
  const actual = has(m.actual) ? +m.actual : (e && e.actual ? e.actual : undefined);
  const status = m.status || (has(progress) ? (progress >= 100 ? 'Completed' : progress > 0 ? 'In progress' : 'Not started') : (e ? 'Not started' : 'No data'));
  const lateManual = has(m.end) && new Date(m.end) < new Date() && status !== 'Completed';
  const issues = []; if (e) { if (e.delayed) issues.push(`${e.delayed} delayed task(s) from Excel`); if (e.overruns) issues.push(`${e.overruns} over-budget item(s) from Excel`); }
  if (lateManual) issues.push('Past planned end date');
  if (has(budget) && has(actual) && budget > 0 && actual > budget * 1.1) issues.push(`Cost ${((actual / budget - 1) * 100).toFixed(0)}% over budget`);
  return { m, e, progress, budget, actual, status, issues, risk: issues.length === 0 ? 'ok' : issues.length === 1 ? 'warn' : 'bad' };
}
function paColor(i) {
  if (paMode === 'progress') return has(i.progress) ? `hsl(${Math.max(0, Math.min(130, i.progress * 1.3))} 75% 52%)` : PA_COL['No data'];
  if (paMode === 'risk') return i.status === 'No data' ? PA_COL['No data'] : HCOL[i.risk];
  if (paMode === 'cost') return !(has(i.budget) && has(i.actual) && i.budget > 0) ? PA_COL['No data'] : i.actual <= i.budget ? HCOL.ok : i.actual < i.budget * 1.1 ? HCOL.warn : HCOL.bad;
  return PA_COL[i.status];
}

function paFile(file) { return fileToMapImage(file); }

function viewPhaseA(A) {
  const ex = paExcel(A), infos = {}; PA_VILLAS.forEach(v => infos[v.id] = paInfo(v.id, ex));
  const all = Object.values(infos);
  const cnt = s => all.filter(i => i.status === s).length;
  const withProg = all.filter(i => has(i.progress)), avg = withProg.length ? withProg.reduce((a, i) => a + i.progress, 0) / withProg.length : NaN;
  const totB = all.reduce((a, i) => a + (i.budget || 0), 0), totA = all.reduce((a, i) => a + (i.actual || 0), 0);
  const atRisk = all.filter(i => i.risk !== 'ok' && i.status !== 'No data').length;
  const vb = paVB;
  $('#view-phasea').innerHTML = `
   <div class="grid kpis">
     ${kpi('Villas', PA_VILLAS.length, `${Object.keys(ex).length} linked to Excel data`)}
     ${kpi('Completed', cnt('Completed'), `${cnt('In progress')} in progress · ${cnt('Not started')} not started`, 'ok')}
     ${kpi('Avg Progress', isNaN(avg) ? '–' : avg.toFixed(0) + '%', '')}
     ${kpi('Budget / Actual', `${fmt(totB)} / ${fmt(totA)}`, totB ? `${(totA / totB * 100).toFixed(0)}% used` : '')}
     ${kpi('Villas at risk', atRisk, 'delays or overruns', atRisk ? 'warn' : 'ok')}
   </div>
   <div class="row">
     <input type="text" id="pa-search" placeholder="Find villa (e.g. 087)" style="width:170px" value="${esc(paSearch)}">
     <select id="pa-mode" style="width:auto"><option value="status">Color: Status</option><option value="progress">Color: Progress</option><option value="risk">Color: Risk</option><option value="cost">Color: Cost</option></select>
     <label class="btn" for="pa-bg">🖼 Plan background</label>
     <select id="pa-style" style="width:auto"><option value="sat">View: Satellite</option><option value="bp">View: Blueprint</option></select><input type="file" id="pa-bg" accept="image/*,.pdf" hidden>
     ${state.phaseImg ? '<button class="btn" id="pa-nobg">Remove background</button>' : ''}
     <button class="btn" id="pa-zin">＋</button><button class="btn" id="pa-zout">－</button><button class="btn" id="pa-zreset">Reset view</button>
     <button class="btn ${paAdmin ? 'primary' : ''}" id="pa-admin">${paAdmin ? '🔓 Edit mode (' + (window.AUTH && AUTH.user ? AUTH.user.role : '') + ')' : '👁 View only'}</button>
     <button class="btn" id="pa-xlsx">⬇ Villas to Excel</button>
   </div>
   <div class="mp-layout">
     <div class="pa-wrap" id="pa-wrap"><svg id="pa-svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}">
       <rect id="pa-bgrect" x="0" y="0" width="910" height="719" fill="#1f2937"/>
       ${state.phaseImg ? `<image href="${state.phaseImg}" x="0" y="0" width="910" height="719" preserveAspectRatio="none"/>` : paDrawnPlan()}
       ${PA_VILLAS.map(v => { const i = infos[v.id], c = paColor(i), sel = paSel === v.id, hit = paSearch && v.id.includes(paSearch);
         const pr = has(i.progress) ? Math.max(0, Math.min(100, i.progress)) : 0;
         return `<g class="pa-v ${sel ? 'sel' : ''} ${hit ? 'hit' : ''}" data-id="${v.id}" transform="translate(${v.x},${v.y})"><rect x="-12" y="-7" width="24" height="14" rx="3.5" fill="#0b1020" fill-opacity=".78" stroke="${sel ? '#fff' : hit ? '#fde047' : c}" stroke-width="${sel || hit ? 2 : 1.3}"/><rect x="-10" y="3.6" width="20" height="1.8" rx=".9" fill="rgba(255,255,255,.2)"/><rect x="-10" y="3.6" width="${(pr / 100 * 20).toFixed(1)}" height="1.8" rx=".9" fill="${c}"/><text y="-0.6" text-anchor="middle">${v.id}</text>${i.status !== 'No data' && i.risk !== 'ok' ? `<circle cx="11" cy="-7" r="3" fill="${i.risk === 'bad' ? '#fb7185' : '#fbbf24'}" stroke="#0b1020" stroke-width="1"/>` : ''}</g>`; }).join('')}
     </svg>
     <div id="pa-tip" class="pa-tip hidden"></div>
     <div class="pa-legend">${paLegend()}</div>
     <div class="muted small" style="padding:8px">Scroll to zoom · drag empty space to pan · hover a villa for a quick look · click for details</div></div>
     <div class="card" id="pa-detail"></div>
   </div>`;
  $('#pa-mode').value = paMode;
  $('#pa-style').value = paStyle; $('#pa-style').onchange = e => { paStyle = e.target.value; localStorage.setItem('az.planStyle', paStyle); render(); }; $('#pa-mode').onchange = e => { paMode = e.target.value; render(); };
  $('#pa-search').oninput = e => { paSearch = e.target.value.trim(); const hit = PA_VILLAS.find(v => v.id === paSearch.padStart(3, '0')); if (hit) { paSel = hit.id; paVB = { x: Math.max(0, hit.x - 160), y: Math.max(0, hit.y - 125), w: 320, h: 250 }; } render(); const el = $('#pa-search'); el.focus(); el.setSelectionRange(99, 99); };
  $('#pa-bg').onchange = async e => { const f = e.target.files[0]; if (!f) return; state.phaseImg = await paFile(f); save(); render(); toast('Plan background loaded'); };
  if ($('#pa-nobg')) $('#pa-nobg').onclick = () => { delete state.phaseImg; save(); render(); };
  const zoom = (f, cx, cy) => { const w = Math.min(910, paVB.w * f), h = w * 719 / 910; cx ??= paVB.x + paVB.w / 2; cy ??= paVB.y + paVB.h / 2; paVB = { w, h, x: Math.max(0, Math.min(910 - w, cx - (cx - paVB.x) * w / paVB.w)), y: Math.max(0, Math.min(719 - h, cy - (cy - paVB.y) * h / paVB.h)) }; $('#pa-svg').setAttribute('viewBox', `${paVB.x} ${paVB.y} ${paVB.w} ${paVB.h}`); };
  $('#pa-zin').onclick = () => zoom(.7); $('#pa-zout').onclick = () => zoom(1.4); $('#pa-zreset').onclick = () => { paVB = { x: 0, y: 0, w: 910, h: 719 }; render(); };
  const svg = $('#pa-svg');
  svg.onwheel = e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoom(e.deltaY < 0 ? .85 : 1.18, paVB.x + (e.clientX - r.left) / r.width * paVB.w, paVB.y + (e.clientY - r.top) / r.height * paVB.h); };
  let pan = null;
  svg.onpointerdown = e => { if (e.target.closest('.pa-v')) return; pan = { x: e.clientX, y: e.clientY, vb: { ...paVB } }; svg.setPointerCapture(e.pointerId); };
  svg.onpointermove = e => { if (!pan) return; const r = svg.getBoundingClientRect(), dx = (e.clientX - pan.x) / r.width * pan.vb.w, dy = (e.clientY - pan.y) / r.height * pan.vb.h; paVB.x = Math.max(0, Math.min(910 - paVB.w, pan.vb.x - dx)); paVB.y = Math.max(0, Math.min(719 - paVB.h, pan.vb.y - dy)); svg.setAttribute('viewBox', `${paVB.x} ${paVB.y} ${paVB.w} ${paVB.h}`); };
  svg.onpointerup = () => pan = null;
  svg.querySelectorAll('.pa-v').forEach(g => g.onclick = () => { paSel = g.dataset.id; svg.querySelectorAll('.pa-v').forEach(x => x.classList.toggle('sel', x === g)); paDetail(infos, ex); });
  const tip = $('#pa-tip'), wrap = $('#pa-wrap');
  svg.querySelectorAll('.pa-v').forEach(g => {
    g.onmousemove = e => { const i = infos[g.dataset.id], r = wrap.getBoundingClientRect();
      tip.innerHTML = `<b>Villa ${g.dataset.id}</b> <span class="chip" style="border-color:${PA_COL[i.status]}">${i.status}</span><br><span class="muted">Progress ${has(i.progress) ? Math.round(i.progress) + '%' : 'n/a'}${i.m.owner ? ' · ' + esc(i.m.owner) : ''}${i.m.contractor ? '<br>' + esc(i.m.contractor) : ''}</span>${i.issues.length ? `<br><span class="warn">⚠ ${esc(i.issues[0])}</span>` : ''}`;
      tip.classList.remove('hidden'); tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 220) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; };
    g.onmouseleave = () => tip.classList.add('hidden');
  });
  $('#pa-admin').onclick = () => toast(paAdmin ? 'You can edit villas: click a villa on the map' : 'Your account is view-only. Ask an administrator for editor access.');
  $('#pa-xlsx').onclick = () => {
    const rows = PA_VILLAS.map(v => { const i = infos[v.id], m = i.m; return { Villa: v.id, Owner: m.owner || '', Type: m.type || '', Contractor: m.contractor || '', Budget: i.budget ?? '', Actual: i.actual ?? '', 'Progress %': has(i.progress) ? Math.round(i.progress) : '', Status: i.status, Start: m.start || '', End: m.end || '', Issues: i.issues.join('; '), Notes: m.notes || '' }; });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Phase A Villas'); XLSX.writeFile(wb, 'PhaseA-Villas.xlsx');
  };
  paDetail(infos, ex);
}

function paDetail(infos, ex) {
  const box = $('#pa-detail'); if (!paSel) return box.innerHTML = `<h2>Phase A</h2><p class="muted">Click any villa on the map.${paAdmin ? '' : '<br><br>You have view-only access. Editors and administrators can change villa data.'}</p>`;
  const i = infos[paSel], m = i.m, e = i.e, f = k => esc(m[k] ?? '');
  const statusChip = `<span class="chip" style="border-color:${PA_COL[i.status]}">${i.status}</span>`;
  const excelBlock = e ? `<h2 style="margin-top:16px">From Excel (${e.rows} rows · ${[...e.files].map(esc).join(', ')})</h2>
     <p class="small muted">Budget ${fmt(e.budget)} · Actual ${fmt(e.actual)}</p>
     ${e.worst.slice(0, 5).map(w => `<div class="alert ${/Delayed/.test(w) ? 'med' : 'high'}">${esc(w)}</div>`).join('')}
     ${Object.keys(e.contractors).length ? `<p class="small muted">Contractors: ${Object.entries(e.contractors).map(([k, c]) => `${esc(k)} (${c.n})`).join(', ')}</p>` : ''}`
    : '<p class="small muted" style="margin-top:12px">No Excel rows found for this villa yet.</p>';
  const issues = i.issues.length ? i.issues.map(t => `<div class="alert med">${esc(t)}</div>`).join('') : '';
  if (!paAdmin) {
    box.innerHTML = `<h2>Villa ${paSel} ${statusChip}</h2>
     <p class="muted small">${[m.type && 'Type ' + esc(m.type), m.owner && 'Owner: ' + esc(m.owner), m.contractor && 'Contractor: ' + esc(m.contractor)].filter(Boolean).join(' · ') || 'No details entered yet'}</p>
     <div class="grid" style="grid-template-columns:1fr 1fr;margin:12px 0"><div><div class="muted small">Budget</div><b>${has(i.budget) ? fmt(i.budget) : '–'}</b></div><div><div class="muted small">Actual</div><b>${has(i.actual) ? fmt(i.actual) : '–'}</b></div>
     <div><div class="muted small">Start</div><b>${f('start') || '–'}</b></div><div><div class="muted small">End</div><b>${f('end') || '–'}</b></div></div>
     ${cFields.length ? `<div class="grid" style="grid-template-columns:1fr 1fr;margin:12px 0;padding-top:12px;border-top:1px solid var(--border)">` + cFields.map(cf => `<div><div class="muted small">${esc(cf)}</div><b>${f(cf) || '–'}</b></div>`).join('') + `</div>` : ''}
     ${f('photo') ? `<img src="${f('photo')}" style="max-width:100%;max-height:240px;border-radius:6px;margin:8px 0;border:1px solid var(--border);display:block">` : ''}
     <div class="bar"><i style="width:${has(i.progress) ? Math.min(100, i.progress) : 0}%"></i></div><p class="small muted">${has(i.progress) ? Math.round(i.progress) + '% complete' : 'No progress data'}</p>
     ${issues}${m.notes ? `<p class="small" style="margin-top:8px">📝 ${f('notes')}</p>` : ''}${excelBlock}`;
    return;
  }
  const inp = (k, label, type = 'text') => `<div><div class="muted small">${label}</div><input type="${type}" id="f-${k}" value="${f(k)}"></div>`;
  state.settings ||= {}; const cFields = state.settings.customFields || [];
  const cEditHTML = cFields.length ? `<div style="margin-top:10px"><b>Custom Categories</b><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">` + cFields.map(cf => inp(cf, cf, 'text')).join('') + `</div></div>` : '';

  box.innerHTML = `<h2>Edit Villa ${paSel} ${statusChip}</h2>${apPendingFor(paSel)}
   <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin:10px 0">
     ${inp('owner', 'Owner / client')}${inp('type', 'Villa type')}${inp('contractor', 'Contractor')}
     <div><div class="muted small">Status</div><select id="f-status"><option value="">Auto</option>${PA_STATUS.map(s => `<option ${m.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
     ${inp('budget', 'Budget', 'number')}${inp('actual', 'Actual cost', 'number')}${inp('progress', 'Progress %', 'number')}<div></div>
     ${inp('start', 'Start date', 'date')}${inp('end', 'End date', 'date')}</div>
   ${cEditHTML}
   <div style="margin-top:10px"><b>Site Photo</b><br>${f('photo') ? `<img src="${f('photo')}" style="max-height:160px;border-radius:4px;margin:6px 0;display:block">` : ''}<input type="file" id="f-photo-up" accept="image/*" style="font-size:12px;margin-top:4px"><input type="hidden" id="f-photo" value="${f('photo')}"></div>
   <div class="muted small" style="margin-top:10px">Notes</div><textarea id="f-notes" rows="3">${f('notes')}</textarea>
   <p class="small muted">Empty fields use Excel values when available.</p>
   <div class="row" style="margin-top:10px"><button class="btn primary" id="pa-save">Save</button><button class="btn danger" id="pa-clear">Clear data</button><button class="btn" id="pa-next">Next ›</button>${AUTH.isAdmin() ? '<button class="btn ghost small" id="pa-cats">⚙️ Manage Categories</button>' : ''}</div>
   <div class="row"><button class="btn ghost" id="pa-bk">Backup (JSON)</button><label class="btn ghost" for="pa-rs">Restore</label><input type="file" id="pa-rs" accept=".json" hidden></div>
   ${issues}${excelBlock}`;
  $('#f-photo-up').onchange = e => { const file = e.target.files[0]; if (!file) return; const r = new FileReader(); r.onload = ev => { const img = new Image(); img.onload = () => { const cv = document.createElement('canvas'), maxW = 500; let w = img.width, h = img.height; if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; } cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); $('#f-photo').value = cv.toDataURL('image/jpeg', 0.6); $('#f-photo-up').style.display = 'none'; toast('Photo attached'); }; img.src = ev.target.result; }; r.readAsDataURL(file); };
  $('#pa-save').onclick = () => { state.villas ??= {}; const o = {}; ['owner', 'type', 'contractor', 'status', 'budget', 'actual', 'progress', 'start', 'end', 'notes', 'photo', ...cFields].forEach(k => { const v = $('#f-' + k).value; if (v !== '') o[k] = v; }); submitVillaChange(paSel, o); render(); };
  $('#pa-clear').onclick = () => { submitVillaChange(paSel, null); render(); };
  $('#pa-next').onclick = () => { const k = PA_VILLAS.findIndex(v => v.id === paSel); paSel = PA_VILLAS[(k + 1) % PA_VILLAS.length].id; render(); };
  if ($('#pa-cats')) $('#pa-cats').onclick = () => { const r = prompt('Enter custom categories separated by commas (e.g. Stage, Certified Amount, Inspection Date):', cFields.join(', ')); if (r !== null) { state.settings.customFields = r.split(',').map(s => s.trim()).filter(Boolean); save(); render(); toast('Categories updated'); } };
  $('#pa-bk').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(state.villas || {}, null, 1)], { type: 'application/json' })); a.download = 'phaseA-villas-backup.json'; a.click(); };
  $('#pa-rs').onchange = async e => { if (!AUTH.isAdmin()) return toast('Only administrators can restore backups'); try { state.villas = JSON.parse(await e.target.files[0].text()); save(); render(); toast('Restored'); } catch { toast('Invalid backup file'); } };
}

/* Stylised drawn plan (used when no background image is loaded): boundary, ring roads, legend */
function paDrawnPlan() {
  return `<g fill="none" stroke-linecap="round">
   <path d="M190 78 C330 140 480 135 600 118 C690 108 742 150 745 240 C745 330 640 360 610 470 C600 560 600 620 560 660" stroke="#ef4444" stroke-width="1.2" opacity=".7"/>
   <path d="M60 280 C50 190 100 110 135 78" stroke="#ef4444" opacity=".7"/>
   <path d="M60 280 L95 545 C200 600 330 640 420 715" stroke="#ef4444" opacity=".5"/>
   <path d="M195 82 C330 148 470 142 590 125 C680 118 705 190 700 262 C690 340 585 365 570 450 C560 520 575 575 545 650" stroke="#22c55e" stroke-width="2.5"/>
   <path d="M180 160 L215 168 C300 155 380 160 412 165 L395 350 C440 390 460 400 485 405" stroke="#22c55e" stroke-width="2"/>
   <path d="M105 285 C130 250 160 200 180 160 M105 285 L130 540 C240 570 340 620 410 690" stroke="#22c55e" stroke-width="2"/>
   <path d="M215 300 C240 440 300 470 420 560 L520 660" stroke="#22c55e" stroke-width="2"/>
   <path d="M430 160 L370 340 C400 380 440 395 470 410" stroke="#d1d5db" stroke-width="3" opacity=".6"/>
   <path d="M560 215 C585 260 540 320 505 380" stroke="#d1d5db" stroke-width="3" opacity=".6"/>
  </g>
  <g font-size="9" fill="#9ca3af"><text x="14" y="705">Phase A masterplan (schematic) – upload your plan image via “Plan background” for the exact drawing</text></g>`;
}
