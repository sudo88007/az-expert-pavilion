/* AZ EXPERT - PAVILION PROJECT : Smart Excel Analysis
   Overrides default parsers to handle messy Excel files: merged headers, totals, and Arabic. */

const numish = v => {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return NaN;
  const s = String(v).replace(/[^\d.-]/g, '');
  return s === '' || s === '-' ? NaN : parseFloat(s);
};

/* Smart Regexes for roles (English + Arabic) */
const SR = {
  budget: /budget|planned.?cost|estimate|contract.?(value|sum|amount)|boq|baseline|الميزانية|التكلفة|عقد/i,
  actual: /actual|spent|paid|to.?date|incurred|expenditure|الفعلي|المنصرف|المدفوع/i,
  amount: /cost|amount|total|price|value|payment|invoice|قيمة|مبلغ|إجمالي/i,
  progress: /progress|complete|%|percent|انجاز|نسبة/i,
  status: /status|state|حالة|موقف/i,
  start: /start|begin|from|بداية|من/i,
  end: /end|finish|due|deadline|complet.*date|to$|نهاية|إلى|تاريخ/i,
  category: /trade|category|contractor|vendor|supplier|subcontract|package|phase|discipline|zone|section|type|area|مقاول|مورد|فئة|نوع|منطقة/i,
  name: /task|activity|item|description|work|name|scope|بند|نشاط|وصف/i,
  villa: /villa|pavili?on|unit|plot|building|فيلا|وحدة|مبنى|بلوك/i
};

const _origParseSheet = parseSheet;
parseSheet = function(ws, name) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', cellDates: true, raw: true });
  // Find best header row among first 15 rows:
  let hIdx = -1, maxScore = 0;
  for (let i = 0; i < Math.min(15, aoa.length); i++) {
    const score = aoa[i].filter(c => typeof c === 'string' && c.trim() && isNaN(numish(c))).length;
    if (score > maxScore) { maxScore = score; hIdx = i; }
  }
  if (hIdx < 0) return null;
  
  // Merge two-row headers if the row above has few items (merged cells in Excel often unmerge to Blanks)
  let headers = [...aoa[hIdx]];
  if (hIdx > 0) {
    const prev = aoa[hIdx - 1];
    let top = '';
    for (let i = 0; i < headers.length; i++) {
      if (prev[i]) top = String(prev[i]).trim();
      if (top && headers[i]) headers[i] = `${top} - ${String(headers[i]).trim()}`;
      else headers[i] = String(headers[i] || top || '').trim();
    }
  } else {
    headers = headers.map(c => String(c || '').trim());
  }

  // Deduplicate headers
  const seen = {};
  headers = headers.map((h, i) => {
    let base = h || `Column ${i + 1}`;
    if (seen[base]) { let j = 2; while (seen[`${base} (${j})`]) j++; base = `${base} (${j})`; }
    seen[base] = true; return base;
  });

  const rawRows = aoa.slice(hIdx + 1);
  const rows = [];
  const notes = []; // skipped rows
  const isTotal = r => r.some(c => /total|subtotal|الإجمالي|المجموع|إجمالي/i.test(String(c)));

  rawRows.forEach(r => {
    if (!r.some(c => c !== '')) return; // empty row
    if (isTotal(r)) { notes.push('Skipped total row'); return; }
    const o = {};
    headers.forEach((k, i) => { o[k] = r[i] instanceof Date ? r[i].toISOString().slice(0, 10) : r[i]; });
    rows.push(o);
  });
  
  if (!rows.length) return null;

  const roles = detectRoles(headers, rows);

  // Fix progress column if max <= 1
  if (roles.progress) {
    const maxP = Math.max(...rows.map(r => numish(r[roles.progress])).filter(n => !isNaN(n)));
    if (maxP > 0 && maxP <= 1.0) {
      rows.forEach(r => { const p = numish(r[roles.progress]); if (!isNaN(p)) r[roles.progress] = p * 100; });
    }
  }

  return { name, headers, rows, roles, notes };
};

detectRoles = function(headers, rows) {
  const roles = {}, used = new Set();
  const take = (role, test) => {
    const h = headers.find(h => !used.has(h) && SR[role].test(h) && (!test || test(h)));
    if (h) { roles[role] = h; used.add(h); }
  };
  const vals = h => rows.map(r => r[h]).filter(v => v !== '' && v != null);
  const isNum = h => vals(h).filter(v => !isNaN(numish(v))).length > vals(h).length * 0.5;
  const isDate = h => vals(h).filter(v => toDate(v)).length > vals(h).length * 0.5;

  take('budget', isNum); take('actual', isNum);
  if (!roles.budget && !roles.actual) take('amount', isNum);
  take('progress', isNum); take('status');
  take('start', isDate); take('end', isDate);
  take('category', h => !isNum(h)); take('name', h => !isNum(h));
  
  // New role: villa
  take('villa', h => {
    // Or if values are mostly integers 1-174
    const vls = vals(h);
    if (!vls.length) return false;
    const isV = vls.filter(v => { const n = numish(v); return !isNaN(n) && n >= 1 && n <= 174 && Number.isInteger(n); }).length;
    return isV > vls.length * 0.7;
  });

  // Content-based fallbacks
  if (!roles.status) {
    const st = headers.find(h => !used.has(h) && vals(h).some(v => /completed?|in progress|delayed|done/i.test(String(v))));
    if (st) { roles.status = st; used.add(st); }
  }
  if (!roles.category) {
    const cat = headers.find(h => !used.has(h) && !isNum(h) && !isDate(h) && new Set(vals(h)).size < Math.max(3, rows.length / 4));
    if (cat) { roles.category = cat; used.add(cat); }
  }
  if (!roles.start || !roles.end) {
    const dates = headers.filter(h => !used.has(h) && isDate(h));
    if (dates.length >= 2) {
      if (!roles.start) { roles.start = dates[0]; used.add(dates[0]); }
      if (!roles.end) { roles.end = dates[1]; used.add(dates[1]); }
    } else if (dates.length === 1 && !roles.end) {
      roles.end = dates[0]; used.add(dates[0]);
    }
  }

  return roles;
};

const _origPavilionOf = pavilionOf;
pavilionOf = function(s, row, all) {
  const clean = v => String(v).trim().replace(/\s+/g, ' ');
  if (s.roles && s.roles.villa && row[s.roles.villa] != null && row[s.roles.villa] !== '') return clean(row[s.roles.villa]);
  return _origPavilionOf(s, row, all);
};

/* ---------- Smart Insights Dashboard & Sections wrapper ---------- */

const _origViewDashboard = viewDashboard;
viewDashboard = function(A) {
  _origViewDashboard(A);
  if (!A.sheets.length) return;
  
  // Generate insights
  let insights = '';
  
  // 1. Forecast at completion
  if (A.avgProg > 0 && A.actual > 0) {
    const eac = (A.actual / (A.avgProg / 100));
    const eacVar = eac - A.budget;
    insights += `<div class="card"><div class="lbl">Forecast at Completion (EAC)</div><div class="val">${fmt(eac)}</div>
      <div class="sub ${eacVar > 0 ? 'bad' : 'ok'}">${eacVar > 0 ? '+' : ''}${fmt(eacVar)} vs budget (based on actual progress)</div></div>`;
  }
  
  // 2. Behind plan (elapsed vs progress)
  const behind = [];
  const today = new Date();
  A.sheets.forEach(s => {
    if (!s.roles.start || !s.roles.end || !s.roles.progress) return;
    s.rows.forEach(r => {
      const st = toDate(r[s.roles.start]), en = toDate(r[s.roles.end]), p = numish(r[s.roles.progress]);
      if (st && en && !isNaN(p) && p < 100 && en > st && today > st) {
        const elapsed = Math.min(100, Math.max(0, (today - st) / (en - st) * 100));
        if (elapsed - p > 20) { // more than 20% behind schedule
          behind.push({ label: r[s.roles.name] || 'Task', elapsed, p, diff: elapsed - p });
        }
      }
    });
  });
  if (behind.length) {
    behind.sort((a, b) => b.diff - a.diff);
    insights += `<div class="card"><div class="lbl">Severely Behind Plan</div><div class="val">${behind.length} items</div>
      <div class="sub bad">e.g. ${apE(behind[0].label)} is ${behind[0].p.toFixed(0)}% done but ${behind[0].elapsed.toFixed(0)}% of time elapsed</div></div>`;
  }

  // 3. Villa coverage
  const covered = new Set(Object.values(A.pav).map(p => p.name.padStart(3, '0')));
  const coverage = covered.size / 174 * 100;
  insights += `<div class="card"><div class="lbl">Phase A Coverage</div><div class="val">${coverage.toFixed(0)}%</div>
    <div class="sub ${coverage < 50 ? 'warn' : 'ok'}">${covered.size} of 174 villas linked to Excel data</div></div>`;

  if (insights) {
    const c = document.createElement('div');
    c.className = 'grid kpis';
    c.style.marginTop = '16px';
    c.innerHTML = insights;
    document.querySelector('#view-dashboard .charts').before(c);
  }
};

const _origViewSections = viewSections;
viewSections = function(A) {
  _origViewSections(A);
  if (!A.sheets.length) return;
  
  const box = document.getElementById('view-sections');
  const canConfig = window.AUTH && (AUTH.isAdmin() || AUTH.user.role === 'manager');
  const allRoles = ['budget', 'actual', 'amount', 'progress', 'status', 'start', 'end', 'category', 'name', 'villa'];
  
  const html = A.sheets.map((s, idx) => {
    // Generate profile
    const profile = s.headers.map(h => {
      const vals = s.rows.map(r => r[h]).filter(v => v !== '' && v != null);
      const empty = s.rows.length - vals.length;
      const type = vals.filter(v => !isNaN(numish(v))).length > vals.length / 2 ? 'number' : vals.filter(v => toDate(v)).length > vals.length / 2 ? 'date' : 'text';
      return { h, empty, type, uniq: new Set(vals).size };
    });
    
    let configHtml = '';
    if (canConfig) {
      configHtml = `<div class="card" style="margin:8px 0;background:var(--bg)"><h4 style="margin-top:0">Column Mapping</h4><div class="row" style="flex-wrap:wrap;gap:8px">`;
      allRoles.forEach(rl => {
        configHtml += `<label class="muted small">${rl}: <select data-sheet="${idx}" data-role="${rl}" style="width:120px"><option value="">-- none --</option>` +
          s.headers.map(h => `<option value="${apE(h)}" ${s.roles[rl] === h ? 'selected' : ''}>${apE(h)}</option>`).join('') +
          `</select></label>`;
      });
      configHtml += `</div></div>`;
    }
    
    return `<div class="card" style="margin-bottom:16px" id="ssec-${idx}">
      <h2>${apE(s.name)} <span class="muted small">· ${apE(s.file)} · ${s.rows.length} rows</span></h2>
      <p class="muted small">Detected columns: ${profile.map(p => `<b>${apE(p.h)}</b> (${p.type}, ${p.empty} empty)`).join(', ')}</p>
      ${s.notes && s.notes.length ? `<p class="muted small">Notes: ${s.notes.join(', ')}</p>` : ''}
      ${configHtml}
    </div>`;
  }).join('');
  
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<div class="alert med" style="margin-bottom:16px"><b>Smart Analysis Active:</b> Excel files are automatically cleaned. Managers and admins can override column mappings below.</div>${html}`;
  
  box.insertBefore(wrapper, box.firstChild);
  
  if (canConfig) {
    box.querySelectorAll('select[data-sheet]').forEach(sel => {
      sel.onchange = () => {
        const idx = sel.dataset.sheet, rl = sel.dataset.role, val = sel.value;
        const s = A.sheets[idx];
        if (val) s.roles[rl] = val; else delete s.roles[rl];
        // Mutate the actual state.files object
        const fileObj = state.files[s.file];
        const sIdx = fileObj.sheets.findIndex(sh => sh.name === s.name);
        if (sIdx >= 0) fileObj.sheets[sIdx].roles = s.roles;
        save();
        toast('Mapping updated (refresh to apply analysis)');
      };
    });
  }
};
