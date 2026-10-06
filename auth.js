/* AZ EXPERT - PAVILION PROJECT : users, roles and login.
   Roles:  admin  = everything + manage users
           editor = edit villas, upload Excel/PDF
           viewer = read-only
   Local mode  (config.js empty): accounts stored in this browser (hashed passwords). First visitor creates the admin.
   Team mode   (Supabase set)   : real shared accounts, admin approves new sign-ups, data synced for everybody. */
const AUTH = (() => {
  const cfg = window.AZ_CONFIG || {};
  const cloud = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const ROLES = ['admin', 'manager', 'editor', 'viewer'];
  const A = { cloud, user: null, sb: null };
  const q = s => document.querySelector(s);
  const E = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const say = m => (typeof toast === 'function' ? toast(m) : alert(m));

  A.canEdit = () => !!A.user && ['admin', 'manager', 'editor'].includes(A.user.role);
  A.canApprove = () => !!A.user && (A.user.role === 'admin' || A.user.role === 'manager');
  A.isAdmin = () => !!A.user && A.user.role === 'admin';

  /* ---------- local-mode helpers ---------- */
  const getUsers = () => { try { return JSON.parse(localStorage.getItem('az.users')) || []; } catch { return []; } };
  const putUsers = u => localStorage.setItem('az.users', JSON.stringify(u));
  const rnd = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  async function hash(pw, salt) {
    const data = new TextEncoder().encode(salt + ':' + pw);
    if (window.crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
    let h = 5381; for (const c of salt + pw) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return String(h);
  }

  /* ---------- screens ---------- */
  function screen(html) { const o = q('#auth-overlay'); o.innerHTML = `<div class="auth-box"><div class="auth-brand"><svg class="logo-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:34px;height:34px;color:var(--a2)"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 11v2"/><path d="M9 15v2"/></svg><div><b>AZ EXPERT</b><small>PAVILION PROJECT</small></div></div>${html}</div>`; o.classList.add('show'); }
  function hideScreen() { q('#auth-overlay').classList.remove('show'); }
  const msg = (t, bad = true) => { const m = q('#auth-msg'); if (m) { m.textContent = t; m.className = 'auth-msg ' + (bad ? 'bad' : 'ok'); } };

  function loginScreen() {
    screen(`<h2>Sign in</h2>
      <form id="auth-form" autocomplete="on">
        <input id="au-user" type="text" placeholder="Username" autocomplete="username" required>
        <input id="au-pass" type="password" placeholder="Password" autocomplete="current-password" required>
        <button class="btn primary" type="submit">Sign in</button>
        <div id="auth-msg" class="auth-msg"></div>
      </form>
      ${cloud ? '<p class="muted small">New here? <a href="#" id="au-signup">Request access</a> – an administrator must approve your account.<br><a href="#" id="au-forgot">Forgot password?</a></p>' : '<p class="muted small">Accounts are created by the administrator.</p>'}`);
    q('#au-user').focus();
    q('#auth-form').onsubmit = async e => {
      e.preventDefault(); msg('Signing in…', false);
      const rawUser = q('#au-user').value.trim();
      const err = cloud ? await cloudLogin(rawUser, q('#au-pass').value) : await localLogin(rawUser, q('#au-pass').value);
      if (err) msg(err);
    };
    if (cloud) {
      q('#au-signup').onclick = e => { e.preventDefault(); signupScreen(); };
      q('#au-forgot').onclick = async e => { e.preventDefault(); const em = q('#au-user').value.trim(); if (!em) return msg('Type your username first'); const { error } = await A.sb.auth.resetPasswordForEmail(em.includes('@') ? em : em + '@azexpert.com'); msg(error ? error.message : 'Reset link sent', !!error); };
    }
  }
  function signupScreen() {
    screen(`<h2>Request access</h2>
      <form id="auth-form"><input id="su-name" placeholder="Full name" required><input id="su-email" type="text" placeholder="Username (no spaces)" required pattern="[A-Za-z0-9_]+">
      <input id="su-pass" type="password" placeholder="Password (min 6 characters)" minlength="6" required>
      <button class="btn primary" type="submit">Create account</button><div id="auth-msg" class="auth-msg"></div></form>
      <p class="muted small"><a href="#" id="su-back">← Back to sign in</a></p>`);
    q('#su-back').onclick = e => { e.preventDefault(); loginScreen(); };
    q('#auth-form').onsubmit = async e => {
      e.preventDefault(); msg('Creating account…', false);
      const rawUser = q('#su-email').value.trim();
      const email = rawUser.includes('@') ? rawUser : rawUser + '@azexpert.com';
      const { data, error } = await A.sb.auth.signUp({ email, password: q('#su-pass').value, options: { data: { name: q('#su-name').value.trim() } } });
      if (error) return msg(error.message);
      if (data.session) await afterCloudAuth(); else msg('Account created. Check your email to confirm, then sign in. An administrator must approve you.', false);
    };
  }

  function pendingScreen(status) {
    screen(`<h2>${status === 'disabled' ? 'Account disabled' : 'Waiting for approval'}</h2>
      <p class="muted">${status === 'disabled' ? 'Your account has been disabled. Contact the administrator.' : 'Your account was created. An administrator must approve it and give you a role. Try again later.'}</p>
      <button class="btn" id="pd-out">Sign out</button> <button class="btn" id="pd-retry">Check again</button>`);
    q('#pd-out').onclick = () => A.logout(); q('#pd-retry').onclick = () => afterCloudAuth();
  }

  /* ---------- login flows ---------- */
  async function localLogin(name, pw) {
    const u = getUsers().find(x => x.username.toLowerCase() === name.toLowerCase());
    if (!u || u.disabled || await hash(pw, u.salt) !== u.hash) return 'Invalid username or password';
    sessionStorage.setItem('az.sess', u.id); await enter({ id: u.id, name: u.name, username: u.username, role: u.role });
  }
  async function cloudLogin(username, pw) {
    const email = username.includes('@') ? username : username + '@azexpert.com';
    const { error } = await A.sb.auth.signInWithPassword({ email, password: pw });
    if (error) return error.message; await afterCloudAuth();
  }
  async function afterCloudAuth() {
    const { data: s } = await A.sb.auth.getSession(); if (!s.session) return loginScreen();
    const { data: p, error } = await A.sb.from('profiles').select('*').eq('id', s.session.user.id).maybeSingle();
    if (error || !p) { screen(`<h2>Setup incomplete</h2><p class="muted">Could not read your profile. Run the SQL from SUPABASE-SETUP.md in Supabase, then sign in again.<br><small>${E(error ? error.message : 'profile missing')}</small></p><button class="btn" id="pd-out">Sign out</button>`); q('#pd-out').onclick = () => A.logout(); return; }
    if (!ROLES.includes(p.role)) return pendingScreen(p.role);
    await enter({ id: p.id, name: p.name || p.email, username: p.email, role: p.role });
  }

  /* ---------- after login ---------- */
  async function enter(user) {
    A.user = user;
    if (cloud) await A.pull();
    paAdmin = A.canEdit();
    document.body.dataset.role = user.role;
    hideScreen(); chip();
    if (!A.isAdmin() && current === 'users') current = 'phasea';
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === current));
    render();
  }
  function chip() {
    const c = q('#auth-chip'); if (!c) return;
    c.innerHTML = `<div class="who"><span class="avatar">${E((A.user.name || '?')[0].toUpperCase())}</span><div><b>${E(A.user.name)}</b><small class="role-${A.user.role}">${A.user.role}</small></div></div>
      <div class="row" style="margin:6px 0 0"><button class="btn ghost" id="ch-pw">Password</button>${cloud ? '<button class="btn ghost" id="ch-sync">⟳ Sync</button>' : ''}<button class="btn ghost" id="ch-out">Sign out</button></div>`;
    q('#ch-out').onclick = () => A.logout();
    q('#ch-pw').onclick = () => A.changePassword();
    if (cloud) q('#ch-sync').onclick = async () => { await A.pull(); render(); say('Synced'); };
    const note = document.querySelector('.side-foot > p.muted'); if (note) note.textContent = cloud ? '☁ Team mode: data is shared with all approved users.' : '💾 Local mode: data and accounts are stored in this browser only.';
  }
  A.logout = async () => {
    if (cloud) { await A.sb.auth.signOut(); state = { files: {} }; localStorage.removeItem(KEY); } sessionStorage.removeItem('az.sess');
    A.user = null; paAdmin = false; delete document.body.dataset.role; loginScreen();
  };
  A.changePassword = async () => {
    const np = prompt('New password (min 6 characters)'); if (!np) return; if (np.length < 6) return say('Password too short');
    if (cloud) { const { error } = await A.sb.auth.updateUser({ password: np }); return say(error ? error.message : 'Password changed'); }
    const us = getUsers(), u = us.find(x => x.id === A.user.id); u.salt = rnd(); u.hash = await hash(np, u.salt); putUsers(us); say('Password changed');
  };

  /* ---------- shared data (Team mode) ---------- */
  A.pull = async () => {
    const { data, error } = await A.sb.from('app_state').select('data').eq('id', 1).maybeSingle();
    if (error) return say('Could not load shared data: ' + error.message);
    if (data && data.data) { state = Object.assign({ files: {} }, data.data); try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
    else if (A.canEdit()) A.push(true);
  };
  let timer;
  A.push = now => {
    if (!cloud || !A.user || !A.canEdit()) return; clearTimeout(timer);
    timer = setTimeout(async () => { if (typeof apMerge === 'function') { try { await apMerge(); } catch (e) { /* push local as is */ } } const { error } = await A.sb.from('app_state').upsert({ id: 1, data: state, updated_at: new Date().toISOString() }); if (error) say('Sync failed: ' + error.message); }, now ? 0 : 1200);
  };

  /* ---------- boot ---------- */
  A.boot = async () => {
    document.body.classList.add('locked');
    if (cloud) {
      try {
        if (!window.supabase) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'; s.onload = res; s.onerror = () => rej(new Error('Could not load the Supabase library (check internet)')); document.head.appendChild(s); });
        A.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
        const { data } = await A.sb.auth.getSession(); return data.session ? afterCloudAuth() : loginScreen();
      } catch (e) { return screen(`<h2>Cannot connect</h2><p class="muted">${E(e.message)}</p>`); }
    }
    let us = getUsers(); 
    if (!us.length) {
       const salt = rnd();
       us.push({ id: rnd(), username: 'admin', name: 'Administrator', role: 'admin', salt, hash: await hash('aa12345aa', salt), created: Date.now() });
       putUsers(us);
    }
    const id = sessionStorage.getItem('az.sess'), u = us.find(x => x.id === id && !x.disabled);
    return u ? enter({ id: u.id, name: u.name, username: u.username, role: u.role }) : loginScreen();
  };

  /* ---------- user management (admin) ---------- */
  A.list = async () => {
    if (!cloud) return getUsers().map(u => ({ id: u.id, name: u.name, login: u.username, role: u.disabled ? 'disabled' : u.role, created: u.created }));
    const { data } = await A.sb.from('profiles').select('*').order('created_at'); return (data || []).map(p => ({ id: p.id, name: p.name, login: p.email, role: p.role, created: p.created_at }));
  };
  A.setRole = async (id, role) => {
    if (id === A.user.id && role !== 'admin') return say('You cannot remove your own admin role');
    if (cloud) { const { error } = await A.sb.from('profiles').update({ role }).eq('id', id); if (error) return say(error.message); }
    else { const us = getUsers(), u = us.find(x => x.id === id); if (role === 'disabled') u.disabled = true; else { u.disabled = false; u.role = role; } putUsers(us); }
    say('Updated');
  };
  A.addLocal = async (name, username, pw, role) => {
    const us = getUsers(); if (us.some(x => x.username.toLowerCase() === username.toLowerCase())) return say('Username already exists');
    const salt = rnd(); us.push({ id: rnd(), username, name, role, salt, hash: await hash(pw, salt), created: Date.now() }); putUsers(us); say('User created');
  };
  A.resetLocal = async (id) => { const p = prompt('New password for this user (min 6 characters)'); if (!p || p.length < 6) return; const us = getUsers(), u = us.find(x => x.id === id); u.salt = rnd(); u.hash = await hash(p, u.salt); putUsers(us); say('Password reset'); };
  A.removeLocal = id => { if (id === A.user.id) return say('You cannot delete yourself'); putUsers(getUsers().filter(x => x.id !== id)); say('User deleted'); };
  A.resetCloud = async email => { const { error } = await A.sb.auth.resetPasswordForEmail(email); say(error ? error.message : 'Reset email sent'); };

  window.addEventListener('load', () => A.boot());
  return A;
})();

async function viewUsers() {
  const box = document.getElementById('view-users');
  if (!AUTH.isAdmin()) return box.innerHTML = '<div class="card empty"><h2>Administrators only</h2></div>';
  const users = await AUTH.list(), roles = AUTH.cloud ? ['pending', 'viewer', 'editor', 'manager', 'admin', 'disabled'] : ['viewer', 'editor', 'manager', 'admin', 'disabled'];
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pending = users.filter(u => u.role === 'pending').length;
  
  const allViews = ['phasea', 'dashboard', 'masterplan', 'sections', 'risks', 'docs', 'ai'];
  const viewNames = { phasea: 'Phase A', dashboard: 'Dashboard', masterplan: 'Masterplan', sections: 'Sections', risks: 'Risks', docs: 'PDFs', ai: 'Ask AI' };
  state.settings ||= {}; state.settings.userViews ||= {};
  box.innerHTML = `
   ${AUTH.cloud ? '' : '<div class="alert med"><b>Local mode:</b> these accounts exist only in this browser. To give your team real logins on their own computers with shared data, connect the free Supabase backend (see SUPABASE-SETUP.md).</div>'}
   ${pending ? `<div class="alert high"><b>${pending}</b> account(s) waiting for approval – choose a role below.</div>` : ''}
   <div class="card"><h2>Users (${users.length})</h2>
    <p class="muted small"><b>admin</b> everything + manage users + final approval · <b>manager</b> edits + approves others' requests · <b>editor</b> edits &amp; uploads (needs approval) · <b>viewer</b> read-only</p>
    <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>${AUTH.cloud ? 'Email' : 'Username'}</th><th>Role</th><th>Allowed Views</th><th>Created</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr><td>${e(u.name)}${u.id === AUTH.user.id ? ' <span class="chip">you</span>' : ''}</td><td>${e(u.login)}</td>
      <td><select data-role="${u.id}" style="width:auto">${roles.map(r => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
      <td>
        ${u.role === 'admin' ? '<span class="muted small">All views (admin)</span>' : `
        <details><summary class="btn ghost small" style="padding:4px 8px">${(state.settings.userViews[u.id] || allViews).length} views</summary>
          <div style="background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:8px;width:150px;margin-top:4px;">
            ${allViews.map(v => `<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;cursor:pointer"><input type="checkbox" data-cb="${u.id}" value="${v}" ${(state.settings.userViews[u.id] || allViews).includes(v) ? 'checked' : ''}> ${viewNames[v]}</label>`).join('')}
          </div>
        </details>`}
      </td>
      <td>${u.created ? new Date(u.created).toLocaleDateString() : ''}</td>
      <td>${AUTH.cloud ? `<button class="btn ghost" data-reset-c="${e(u.login)}">Send reset email</button>` : `<button class="btn ghost" data-reset="${u.id}">Reset password</button> <button class="btn ghost danger" data-del="${u.id}">Delete</button>`}</td></tr>`).join('')}
    </tbody></table></div></div>
   ${AUTH.cloud ? '<div class="card" style="margin-top:16px"><h2>Add a user</h2><p class="muted small">Ask your team to open the site and click <b>Request access</b>. Their account appears above as <i>pending</i> – give them a role to approve.</p></div>' : `
   <div class="card" style="margin-top:16px"><h2>Add a user</h2>
    <form id="nu-form" class="row"><input id="nu-name" placeholder="Full name" required style="width:180px"><input id="nu-user" placeholder="Username" required style="width:160px" autocomplete="off">
     <input id="nu-pass" type="text" placeholder="Password (min 6)" minlength="6" required style="width:160px" autocomplete="off">
     <select id="nu-role" style="width:auto"><option>viewer</option><option>editor</option><option>manager</option><option>admin</option></select><button class="btn primary" type="submit">Create user</button></form></div>`}`;
  box.querySelectorAll('[data-role]').forEach(s => s.onchange = async () => { await AUTH.setRole(s.dataset.role, s.value); viewUsers(); });
  box.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => AUTH.resetLocal(b.dataset.reset));
  box.querySelectorAll('[data-reset-c]').forEach(b => b.onclick = () => AUTH.resetCloud(b.dataset.resetC));
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('Delete this user?')) { AUTH.removeLocal(b.dataset.del); viewUsers(); } });
  
  box.querySelectorAll('[data-cb]').forEach(cb => {
    cb.onchange = () => {
      const id = cb.dataset.cb;
      state.settings.userViews[id] = Array.from(box.querySelectorAll(`[data-cb="${id}"]:checked`)).map(x => x.value);
      save();
      const sum = cb.closest('details').querySelector('summary');
      if (sum) sum.textContent = state.settings.userViews[id].length + ' views';
    };
  });
  const f = document.getElementById('nu-form');
  if (f) f.onsubmit = async ev => { ev.preventDefault(); await AUTH.addLocal(document.getElementById('nu-name').value.trim(), document.getElementById('nu-user').value.trim(), document.getElementById('nu-pass').value, document.getElementById('nu-role').value); viewUsers(); };
}
