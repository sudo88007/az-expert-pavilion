/* AZ EXPERT - PAVILION PROJECT : approval workflow.
   Admin edits apply immediately. Manager / editor changes (villa edits and Excel/PDF uploads) become REQUESTS that
   travel through the approval chain chosen by the admin (Approvals > Settings):
     admin          -> admin approves
     manager_admin  -> a manager approves first, then the admin
     manager        -> a manager approves
     none           -> everything applies immediately
   An admin can always approve or reject at any stage. */
const AP_CHAINS = {
  admin: { label: 'Admin approves', stages: ['admin'] },
  manager_admin: { label: 'Manager approves, then Admin', stages: ['manager', 'admin'] },
  manager: { label: 'Manager approves', stages: ['manager'] },
  none: { label: 'No approval (changes apply immediately)', stages: [] },
};
let apTab = 'inbox';
let apDirty = false;
const apE = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const apId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const apMe = () => (window.AUTH && AUTH.user) || { id: 'local', name: 'Guest', role: 'admin' };
const apSay = m => (typeof toast === 'function' ? toast(m) : alert(m));

function apInit() {
  state.requests ||= []; state.audit ||= []; state.settings ||= {};
  if (!AP_CHAINS[state.settings.chain]) state.settings.chain = 'admin';
}
function apLog(msg) {
  apInit(); const u = apMe();
  state.audit.unshift({ at: Date.now(), by: u.name, role: u.role, msg });
  if (state.audit.length > 500) state.audit.length = 500;
}
function apStagesFor(role) {
  apInit(); if (role === 'admin') return [];
  return AP_CHAINS[state.settings.chain].stages.filter(r => r !== role);
}

/* ---------- applying ---------- */
function apApply(req) {
  if (req.type === 'villa') {
    state.villas ||= {};
    if (req.payload) state.villas[req.target] = req.payload; else delete state.villas[req.target];
  } else if (req.type === 'file') {
    state.files ||= {}; state.files[req.target] = req.payload;
  }
  apDirty = true;
}

/* ---------- submit changes ---------- */
function apDiff(oldO, newO) {
  state.settings ||= {};
  const keys = ['owner', 'type', 'contractor', 'status', 'budget', 'actual', 'progress', 'start', 'end', 'notes', 'photo', ...(state.settings.customFields || [])];
  oldO = oldO || {}; newO = newO || {};
  return keys.filter(k => String(oldO[k] ?? '') !== String(newO[k] ?? '')).map(k => ({ k, from: (k === 'photo' && oldO[k]) ? '[Photo]' : oldO[k] ?? '', to: (k === 'photo' && newO[k]) ? '[New Photo]' : newO[k] ?? '' }));
}
function apCreate(type, target, label, payload, base) {
  const u = apMe(), stages = apStagesFor(u.role);
  if (!stages.length) { // applies directly
    const req = { type, target, payload };
    apApply(req); apLog(`${type === 'villa' ? 'Villa ' + target + ' updated' : 'File "' + target + '" uploaded'} (direct)`); save(true);
    return true;
  }
  apInit();
  // newer request for same target replaces older pending one by same author
  state.requests.forEach(r => { if (r.status === 'pending' && r.type === type && r.target === target && r.author.id === u.id) { r.status = 'cancelled'; r.history.push({ by: u.name, role: u.role, action: 'cancelled', comment: 'Replaced by a newer request', at: Date.now() }); } });
  state.requests.unshift({ id: apId(), type, target, label, payload, base: base ?? null, author: { id: u.id, name: u.name, role: u.role }, created: Date.now(), stages, stage: 0, status: 'pending', history: [] });
  apLog(`Request submitted: ${label}`); save(true); apBadge();
  return false;
}
function submitVillaChange(id, newObj) {
  apInit();
  const cur = (state.villas || {})[id] || null;
  if (!apDiff(cur, newObj).length && !!cur === !!newObj) return apSay('No changes to save');
  const direct = apCreate('villa', id, `Villa ${id}: ${newObj ? 'edit details' : 'clear data'}`, newObj, cur);
  apSay(direct ? `Villa ${id} saved` : `Villa ${id} change sent for approval`);
}
function stageFile(name, payload) {
  apInit();
  const exists = !!(state.files || {})[name];
  const direct = apCreate('file', name, `${exists ? 'Update' : 'Add'} file "${name}"`, payload, null);
  if (!direct) apSay(`"${name}" submitted for approval`);
  return direct;
}
function apPendingFor(villaId) {
  apInit();
  const p = state.requests.filter(r => r.status === 'pending' && r.type === 'villa' && r.target === villaId);
  if (!p.length) return '';
  return `<div class="alert med" style="margin:8px 0">⏳ ${p.length} change(s) waiting for approval – by ${p.map(r => apE(r.author.name)).join(', ')}</div>`;
}

/* ---------- acting on requests ---------- */
function apCanAct(req) {
  const u = apMe();
  if (req.status !== 'pending') return false;
  if (u.role === 'admin') return true;
  return u.role === 'manager' && req.stages[req.stage] === 'manager' && req.author.id !== u.id;
}
async function apAct(id, action, comment) {
  if (window.AUTH && AUTH.cloud) { await AUTH.pull(); apInit(); }
  const req = state.requests.find(r => r.id === id), u = apMe();
  if (!req || req.status !== 'pending') { apSay('This request was already handled'); return render(); }
  if (action === 'cancel') {
    if (req.author.id !== u.id && u.role !== 'admin') return;
    req.status = 'cancelled';
  } else {
    if (!apCanAct(req)) return apSay('You cannot act on this request');
    if (action === 'reject') {
      req.status = 'rejected';
    } else if (u.role === 'admin' || req.stage >= req.stages.length - 1) {
      apApply(req); req.status = 'approved';
    } else req.stage++;
  }
  req.history.push({ by: u.name, role: u.role, action: action === 'approve' && req.status === 'pending' ? 'approved (next stage)' : action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled', comment: comment || '', at: Date.now() });
  if (req.status !== 'pending' || action !== 'approve') apLog(`${req.status === 'approved' ? 'Approved' : req.status === 'rejected' ? 'Rejected' : 'Cancelled'}: ${req.label} (by ${req.author.name})`);
  else apLog(`Stage approved: ${req.label}`);
  save(true); apSay(req.status === 'approved' ? 'Approved and applied' : req.status === 'rejected' ? 'Rejected' : req.status === 'cancelled' ? 'Cancelled' : 'Approved – sent to next stage'); render();
}

/* ---------- cloud merge (Team mode) ---------- */
async function apMerge() {
  if (!(window.AUTH && AUTH.cloud && AUTH.sb && AUTH.user)) return;
  const { data } = await AUTH.sb.from('app_state').select('data').eq('id', 1).maybeSingle();
  const r = data && data.data; if (!r) return;
  const mine = apDirty || AUTH.user.role === 'admin';
  const out = mine ? state : Object.assign({ files: {} }, r);
  const rank = { pending: 0, cancelled: 1, rejected: 1, approved: 1 }, map = {};
  [...(r.requests || []), ...(state.requests || [])].forEach(q => {
    const o = map[q.id];
    if (!o || q.history.length > o.history.length || (q.history.length === o.history.length && rank[q.status] > rank[o.status])) map[q.id] = q;
  });
  out.requests = Object.values(map).sort((a, b) => b.created - a.created);
  const seen = new Set(), au = [];
  [...(r.audit || []), ...(state.audit || [])].forEach(a => { const k = a.at + a.by + a.msg; if (!seen.has(k)) { seen.add(k); au.push(a); } });
  out.audit = au.sort((a, b) => b.at - a.at).slice(0, 500);
  if (AUTH.user.role !== 'admin' || !state.settings) out.settings = r.settings || state.settings;
  state = out; apDirty = false;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

/* ---------- badge + background refresh ---------- */
let lastPendingCount = -1;
function apBadge() {
  const b = document.getElementById('ap-badge'); if (!b || !(window.AUTH && AUTH.user)) return;
  apInit(); const u = apMe();
  const n = state.requests.filter(r => r.status === 'pending' && (apCanAct(r) || (!AUTH.canApprove() && r.author.id === u.id))).length;
  if (lastPendingCount >= 0 && n > lastPendingCount) {
    if (AUTH.canApprove()) apSay(`🔔 You have ${n - lastPendingCount} new approval request(s) waiting!`);
  }
  lastPendingCount = n;
  b.textContent = n || ''; b.style.display = n ? 'inline-block' : 'none';
}
setInterval(() => { try { apBadge(); } catch (e) { /* not ready */ } }, 3000);
setInterval(async () => {
  if (!(window.AUTH && AUTH.cloud && AUTH.user) || apDirty || document.hidden) return;
  const changed = await AUTH.pull(); 
  apInit(); apBadge();
  if (changed && typeof render === 'function') {
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    render();
  }
}, 6000);

// Real-time sync for Local Mode (between tabs)
window.addEventListener('storage', e => {
  if (e.key === KEY && window.AUTH && !AUTH.cloud && AUTH.user) {
    try {
      const newState = JSON.parse(e.newValue);
      if (newState) {
        state = newState; apInit(); apBadge();
        if (current === 'approvals') render();
      }
    } catch (err) {}
  }
});

/* ---------- UI ---------- */
const apFmtT = t => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
function apFlow(req) {
  const chips = req.stages.map((s, i) => {
    const st = req.status === 'approved' || i < req.stage ? 'done' : req.status === 'rejected' && i === req.stage ? 'bad' : i === req.stage && req.status === 'pending' ? 'now' : '';
    return `<span class="ap-step ${st}">${st === 'done' ? '✔ ' : st === 'bad' ? '✖ ' : ''}${s}</span>`;
  }).join('<span class="ap-arrow">→</span>');
  return `<div class="ap-flow"><span class="ap-step done">${apE(req.author.name)} (${req.author.role})</span><span class="ap-arrow">→</span>${chips}</div>`;
}
function apBody(req) {
  if (req.type === 'villa') {
    const d = apDiff(req.base, req.payload);
    const cur = (state.villas || {})[req.target] || null, stale = req.status === 'pending' && apDiff(cur, req.base).length;
    return `${stale ? '<div class="alert med">Villa data changed since this request was made – approving will overwrite the newer values.</div>' : ''}
      ${req.payload ? '' : '<p class="muted small">All manual data for this villa will be cleared.</p>'}
      <table class="ap-diff"><thead><tr><th>Field</th><th>Current</th><th>Proposed</th></tr></thead><tbody>${d.map(x => `<tr><td>${apE(x.k)}</td><td>${apE(x.from) || '<i class="muted">empty</i>'}</td><td><b>${apE(x.to) || '<i class="muted">empty</i>'}</b></td></tr>`).join('')}</tbody></table>`;
  }
  const f = req.payload || {};
  const old = (state.files || {})[req.target];
  const desc = f.type === 'pdf' ? `${(f.pages || []).length} page(s) of text` : (f.sheets || []).map(s => `${apE(s.name)}: ${s.rows.length} rows × ${s.headers.length} columns`).join('<br>');
  const oldDesc = !old ? 'New file' : old.type === 'pdf' ? `${(old.pages || []).length} page(s)` : (old.sheets || []).map(s => `${apE(s.name)}: ${s.rows.length} rows`).join(', ');
  return `<p class="small"><b>Uploaded:</b><br>${desc}</p><p class="muted small">Replaces: ${oldDesc}</p>`;
}
function apCard(req) {
  const act = apCanAct(req), mine = req.author.id === apMe().id;
  return `<div class="card ap-card ${req.status}">
    <div class="row" style="justify-content:space-between;margin:0"><h3>${apE(req.label)}</h3><span class="ap-status ${req.status}">${req.status}</span></div>
    <p class="muted small">By <b>${apE(req.author.name)}</b> · ${apFmtT(req.created)}</p>
    ${apFlow(req)}${apBody(req)}
    ${req.history.length ? `<div class="ap-hist">${req.history.map(h => `<div>• <b>${apE(h.by)}</b> (${h.role}) ${h.action}${h.comment ? ' – “' + apE(h.comment) + '”' : ''} <span class="muted">${apFmtT(h.at)}</span></div>`).join('')}</div>` : ''}
    ${act ? `<div class="row ap-act"><input type="text" id="apc-${req.id}" placeholder="Comment (optional, recommended when rejecting)" style="flex:1;min-width:200px">
      <button class="btn primary" data-ap="approve" data-id="${req.id}">✔ Approve</button><button class="btn danger" data-ap="reject" data-id="${req.id}">✖ Reject</button></div>` : ''}
    ${req.status === 'pending' && (mine || AUTH.isAdmin()) && !act ? `<div class="row"><button class="btn ghost" data-ap="cancel" data-id="${req.id}">Cancel request</button></div>` : ''}
  </div>`;
}
function viewApprovals() {
  const box = document.getElementById('view-approvals'); apInit();
  const u = apMe(), canApprove = AUTH.canApprove(), isAdmin = AUTH.isAdmin();
  const R = state.requests;
  const inbox = R.filter(r => apCanAct(r)), mineR = R.filter(r => r.author.id === u.id);
  const tabs = [['inbox', `Inbox (${inbox.length})`, canApprove], ['mine', `My requests (${mineR.length})`, true], ['all', `All requests (${R.length})`, isAdmin], ['settings', 'Approval settings', isAdmin], ['audit', 'Audit log', canApprove]].filter(t => t[2]);
  if (!tabs.some(t => t[0] === apTab)) apTab = tabs[0][0];
  let body = '';
  const list = a => a.length ? a.map(apCard).join('') : '<div class="card empty"><p>Nothing here.</p></div>';
  if (apTab === 'inbox') body = list(inbox);
  else if (apTab === 'mine') body = list(mineR);
  else if (apTab === 'all') body = list(R);
  else if (apTab === 'settings') body = `<div class="card"><h2>Approval sequence</h2>
      <p class="muted small">Choose who must approve changes made by editors and managers. Admin edits always apply immediately, and an admin can approve or reject at any stage.</p>
      ${Object.entries(AP_CHAINS).map(([k, c]) => `<label class="ap-opt"><input type="radio" name="apchain" value="${k}" ${state.settings.chain === k ? 'checked' : ''}> <b>${c.label}</b><br><span class="muted small">${c.stages.length ? 'Editor → ' + c.stages.join(' → ') : 'Editors and managers apply directly'}</span></label>`).join('')}
      <p class="muted small">Pending requests keep the route they were created with.</p></div>`;
  else body = `<div class="card"><h2>Audit log</h2><div class="tbl-wrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${state.audit.map(a => `<tr><td>${apFmtT(a.at)}</td><td>${apE(a.by)} <span class="chip">${a.role}</span></td><td>${apE(a.msg)}</td></tr>`).join('') || '<tr><td colspan="3">No activity yet</td></tr>'}</tbody></table></div></div>`;
  box.innerHTML = `<div class="ap-tabs">${tabs.map(t => `<button class="btn ${apTab === t[0] ? 'primary' : 'ghost'}" data-tab="${t[0]}">${t[1]}</button>`).join('')}</div>
    <div class="alert low" style="margin-bottom:12px">Current route: <b>${AP_CHAINS[state.settings.chain].label}</b>${!canApprove ? ' · your changes appear here until approved' : ''}</div>${body}`;
  box.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { apTab = b.dataset.tab; viewApprovals(); });
  box.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => { const i = document.getElementById('apc-' + b.dataset.id); apAct(b.dataset.id, b.dataset.ap, i ? i.value.trim() : ''); });
  box.querySelectorAll('[name=apchain]').forEach(r => r.onchange = () => { state.settings.chain = r.value; apDirty = true; apLog('Approval route set to: ' + AP_CHAINS[r.value].label); save(true); apSay('Approval route updated'); viewApprovals(); });
  apBadge();
}
