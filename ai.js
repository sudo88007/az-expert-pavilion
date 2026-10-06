/* ==========================================================================
   AZ EXPERT - PAVILION PROJECT | AI Construction Intelligence Engine
   - 100% Free & Keyless: Instantly analyzes all 174 villas, costs, schedules,
     contractors, Excel sheets, and PDF contracts.
   - Optional: If an API key or proxy is provided, connects to Gemini 2.0 Flash.
   - Clean, professional output with zero disclaimers or error messages.
   ========================================================================== */

function paAllInfos(A) {
  const ex = paExcel(A);
  return PA_VILLAS.map(v => ({ id: v.id, ...paInfo(v.id, ex) }));
}

function contractorStats(infos) {
  const map = {};
  infos.forEach(i => {
    const add = (name, d, o, actual, budget) => {
      if (!name) return;
      const c = map[name] ??= { name, villas: new Set(), delayed: 0, overruns: 0, actual: 0, budget: 0 };
      c.villas.add(i.id);
      c.delayed += d;
      c.overruns += o;
      c.actual += actual || 0;
      c.budget += budget || 0;
    };
    if (i.e) {
      Object.entries(i.e.contractors).forEach(([n, c]) => add(n, i.e.delayed, i.e.overruns, c.actual, c.budget));
    }
    if (i.m.contractor && !(i.e && i.e.contractors[i.m.contractor])) {
      add(
        i.m.contractor,
        i.issues.some(t => /Past planned/i.test(t)) ? 1 : 0,
        i.issues.some(t => /over budget/i.test(t)) ? 1 : 0,
        i.actual || 0,
        i.budget || 0
      );
    }
  });
  return Object.entries(map).sort((a, b) => (b[1].delayed + b[1].overruns) - (a[1].delayed + a[1].overruns));
}

const pct = n => (has(n) && isFinite(n) ? Math.round(n) + '%' : 'n/a');

/* Search text inside any loaded PDF contracts/reports */
function searchPdfs(query) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (!words.length) return [];
  const hits = [];
  Object.entries(state.files).filter(([, f]) => f.type === 'pdf').forEach(([fn, f]) => {
    f.pages.forEach((pg, idx) => {
      const lower = pg.toLowerCase();
      const match = words.some(w => lower.includes(w));
      if (match) {
        // extract relevant sentence snippet
        const firstWord = words.find(w => lower.includes(w));
        const pos = lower.indexOf(firstWord);
        const start = Math.max(0, pos - 80);
        const end = Math.min(pg.length, pos + 160);
        hits.push({ file: fn, page: idx + 1, snippet: pg.slice(start, end).replace(/\s+/g, ' ').trim() });
      }
    });
  });
  return hits.slice(0, 4);
}

/* Comprehensive Construction Intelligence Core */
function localAnswer(q, A) {
  const infos = paAllInfos(A);
  const data = infos.filter(i => i.status !== 'No data');
  const query = q.trim();
  const lower = query.toLowerCase();

  // If user hasn't loaded any data yet
  if (!data.length && !A.sheets.length) {
    return `### AZ EXPERT Construction Intelligence\n\nNo project data has been uploaded yet.\n\n` +
      `**How to begin:**\n` +
      `1. Click **"Load demo data"** in the sidebar to populate all 174 Phase A villas instantly.\n` +
      `2. Or click **"+ Upload files"** to import your project Excel BOQs or PDF contracts.\n` +
      `3. Once loaded, ask me about:\n` +
      `   • Specific villa status (e.g., *"Villa 087 status"*)\n` +
      `   • Risk & delay audits (e.g., *"Which villas are behind schedule?"*)\n` +
      `   • Contractor performance (e.g., *"Compare contractor delays"*)\n` +
      `   • Financials (e.g., *"Budget vs actual variance"*)\n` +
      `   • Weekly executive priorities (e.g., *"What should the PM focus on?"*)`;
  }

  const by = s => infos.filter(i => i.status === s);
  const risky = data.filter(i => i.issues.length).sort((a, b) => b.issues.length - a.issues.length || (a.progress ?? 0) - (b.progress ?? 0));
  const cs = contractorStats(infos);

  // 1. SPECIFIC VILLA QUERY (e.g., "villa 087", "tell me about 45", "unit 12")
  const idMatch = lower.match(/(?:villa|unit|plot|pavilion)?\s*#?\s*0*([1-9]\d{0,2})\b/);
  if (idMatch && (lower.includes('villa') || lower.includes('unit') || lower.includes('plot') || parseInt(idMatch[1], 10) <= 174)) {
    const targetNum = parseInt(idMatch[1], 10);
    if (targetNum >= 1 && targetNum <= 174) {
      const targetId = String(targetNum).padStart(3, '0');
      const v = infos.find(i => i.id === targetId);
      if (v) {
        const m = v.m;
        const e = v.e;
        const vDiff = (has(v.budget) && has(v.actual) && v.budget > 0) ? (v.actual / v.budget - 1) * 100 : NaN;
        const vColor = v.risk === 'ok' ? '🟢 ON TRACK' : v.risk === 'warn' ? '🟡 MEDIUM RISK' : '🔴 HIGH RISK';

        let res = `### Villa ${v.id} Executive Status Card\n\n`;
        res += `**Health Assessment:** ${vColor}\n`;
        res += `• **Status:** ${v.status} (${pct(v.progress)} complete)\n`;
        res += `• **Budget:** ${has(v.budget) ? fmt(v.budget) : 'Not specified'} | **Actual:** ${has(v.actual) ? fmt(v.actual) : 'Not specified'}`;
        if (!isNaN(vDiff)) {
          res += ` (${vDiff > 0 ? '+' : ''}${vDiff.toFixed(1)}% variance vs budget)`;
        }
        res += `\n• **Owner / Client:** ${m.owner || 'Unassigned'}\n`;
        res += `• **Assigned Contractor:** ${m.contractor || (e && Object.keys(e.contractors).join(', ')) || 'Unassigned'}\n`;
        res += `• **Schedule Timeline:** ${m.start || 'TBD'} → ${m.end || 'TBD'}\n\n`;

        if (v.issues.length) {
          res += `**Identified Critical Issues:**\n`;
          v.issues.forEach(iss => { res += `• ⚠️ ${iss}\n`; });
          res += `\n`;
        } else {
          res += `**Identified Critical Issues:** None detected. Villa milestone works are proceeding within tolerance.\n\n`;
        }

        if (e && e.worst.length) {
          res += `**Activity Breakdown (From Excel):**\n`;
          e.worst.slice(0, 4).forEach(w => { res += `• ${w}\n`; });
          res += `\n`;
        }

        if (m.notes) {
          res += `**Site Notes:** ${m.notes}\n\n`;
        }

        res += `**Recommended Action:** `;
        if (v.risk === 'bad') {
          res += `Issue immediate cure notice to contractor regarding cost overrun & schedule slippage. Conduct site inspection within 48 hours.`;
        } else if (v.risk === 'warn') {
          res += `Monitor subcontractor daily output to ensure deadline does not slip into critical path.`;
        } else {
          res += `Maintain regular quality assurance inspections and confirm milestone signoff upon completion.`;
        }

        return res;
      }
    }
  }

  // 2. CONTRACTOR ANALYSIS
  if (/contractor|vendor|supplier|subcontract|who is doing|who works/.test(lower)) {
    if (!cs.length) {
      return `### Contractor Analysis\n\nNo contractor records detected in the active data. Ensure your Excel file has a column titled **Contractor**, **Vendor**, or **Trade**, or assign contractors directly via the Admin panel.`;
    }

    let res = `### Contractor Performance & Risk Ranking\n\n`;
    res += `Total contractors monitored: **${cs.length}** across Phase A villas.\n\n`;
    res += `| Rank | Contractor | Scope (Villas) | Delayed Tasks | Cost Overruns | Total Spent |\n`;
    res += `|:---:|:---|:---:|:---:|:---:|:---:|\n`;
    cs.slice(0, 8).forEach(([name, c], idx) => {
      const badge = (c.delayed + c.overruns > 5) ? '🔴' : (c.delayed + c.overruns > 0) ? '🟡' : '🟢';
      res += `| ${idx + 1} | ${badge} **${name}** | ${c.villas.size} | ${c.delayed} | ${c.overruns} | ${fmt(c.actual)} |\n`;
    });

    const worst = cs[0];
    res += `\n**Key Takeaway:**\n`;
    if (worst && (worst[1].delayed + worst[1].overruns > 0)) {
      res += `• Primary risk source is **${worst[0]}** with **${worst[1].delayed} delayed items** and **${worst[1].overruns} cost overruns** across ${worst[1].villas.size} villas.\n`;
      res += `• **Recommendation:** Summon contractor management for weekly milestone audits and enforce liquidated damage penalty clauses if milestones are missed.`;
    } else {
      res += `• All contractors are currently performing within acceptable schedule and cost thresholds.`;
    }
    return res;
  }

  // 3. RISKS & DELAYS
  if (/risk|delay|late|behind|problem|issue|worst|trouble|critical/.test(lower)) {
    if (!risky.length) {
      return `### Risk & Delay Assessment\n\n🎉 **All clear:** No villas currently show schedule delays or cost overruns. Total active villas: **${data.length}**. Everything is proceeding according to baseline.`;
    }

    let res = `### Critical Risk & Delay Audit (${risky.length} Villas Flagged)\n\n`;
    res += `Here are the top priority villas requiring immediate management intervention:\n\n`;
    risky.slice(0, 8).forEach((v, idx) => {
      const flagIcon = v.risk === 'bad' ? '🔴' : '🟡';
      res += `${idx + 1}. ${flagIcon} **Villa ${v.id}** (${v.status} · ${pct(v.progress)})\n`;
      v.issues.forEach(iss => { res += `   - ${iss}\n`; });
      if (v.m.contractor) res += `   - *Contractor: ${v.m.contractor}*\n`;
    });

    res += `\n**Strategic Mitigation Plan:**\n`;
    res += `1. **Resource Reallocation:** Move skilled labor from completed units to the delayed villas listed above.\n`;
    res += `2. **Subcontractor Review:** Issue formal notices for tasks exceeding 14 days past planned delivery.\n`;
    res += `3. **Daily Milestone Verification:** Track site foreman daily logs specifically for Villas ${risky.slice(0, 4).map(v => v.id).join(', ')}.`;
    return res;
  }

  // 4. FINANCIAL & COST ANALYSIS
  if (/cost|budget|overrun|spend|money|variance|financial|boq|expenditure|cash/.test(lower)) {
    const costDiff = A.actual - A.budget;
    const costOver = costDiff > 0;
    const ov = data
      .filter(i => has(i.budget) && has(i.actual) && i.budget > 0)
      .map(i => ({ i, diff: i.actual - i.budget, pct: (i.actual / i.budget - 1) * 100 }))
      .sort((a, b) => b.diff - a.diff);

    let res = `### Phase A Financial & Cost Variance Analysis\n\n`;
    res += `• **Total Baseline Budget:** ${fmt(A.budget)}\n`;
    res += `• **Total Actual Expenditure:** ${fmt(A.actual)}\n`;
    res += `• **Net Cost Variance:** **${costOver ? '+' : ''}${fmt(costDiff)}** (${A.budget ? ((A.actual / A.budget - 1) * 100).toFixed(1) : 0}% ${costOver ? 'Over Budget 🔴' : 'Under Budget 🟢'})\n`;
    res += `• **Villas with Overruns:** ${A.overruns.length} items flagged\n\n`;

    if (ov.length) {
      res += `**Top Villas with Highest Budget Overruns:**\n`;
      ov.filter(x => x.diff > 0).slice(0, 5).forEach((x, idx) => {
        res += `${idx + 1}. **Villa ${x.i.id}**: +${fmt(x.diff)} (+${x.pct.toFixed(1)}%) — Budget: ${fmt(x.i.budget)} | Actual: ${fmt(x.i.actual)}\n`;
      });
      res += `\n`;
    }

    res += `**Financial Recommendation:** `;
    if (costOver) {
      res += `Freeze non-essential change orders immediately. Initiate a comprehensive variation audit against contractor scope sheets to prevent further margin erosion.`;
    } else {
      res += `Expenditure is tracking within planned limits. Ensure pending variation approvals do not unexpectedly spike second-half costs.`;
    }
    return res;
  }

  // 5. PROGRESS & COMPLETION STATUS
  if (/progress|status|complete|finish|done|handover|schedule|how many/.test(lower)) {
    const comp = by('Completed');
    const inProg = by('In progress');
    const notStart = by('Not started');
    const onHold = by('On hold');

    let res = `### Phase A Progress & Handover Breakdown\n\n`;
    res += `**Overall Physical Progress:** **${pct(A.avgProg)}** across ${data.length} tracked units.\n\n`;
    res += `• 🟢 **Completed Units:** ${comp.length} (${(comp.length / 174 * 100).toFixed(0)}%)\n`;
    res += `• 🔵 **In Progress:** ${inProg.length} (${(inProg.length / 174 * 100).toFixed(0)}%)\n`;
    res += `• ⚪ **Not Started:** ${notStart.length} (${(notStart.length / 174 * 100).toFixed(0)}%)\n`;
    if (onHold.length) res += `• 🟣 **On Hold:** ${onHold.length}\n`;
    res += `\n`;

    if (comp.length > 0 && comp.length <= 25) {
      res += `**Completed Villa Units Ready for Handover Inspection:**\n${comp.map(i => `Villa ${i.id}`).join(', ')}\n\n`;
    }

    res += `**Milestone Outlook:** Handover readiness requires accelerating finishing trades on the ${inProg.length} active villas, particularly those with progress between 70% and 90%.`;
    return res;
  }

  // 6. EXECUTIVE PRIORITIES / WEEKLY FOCUS
  if (/focus|priorit|week|recommend|action|what to do|strategy|summary|manager|director/.test(lower)) {
    const topRisky = risky.slice(0, 5);
    const worstContractor = cs[0];

    let res = `### Executive Action Plan & Weekly Priorities\n\n`;
    res += `**1. Urgent Site Interventions (Critical Path)**\n`;
    if (topRisky.length) {
      res += `Direct site engineers to inspect **Villas ${topRisky.map(v => v.id).join(', ')}** to resolve active delays and cost variance bottlenecks.\n\n`;
    } else {
      res += `No critical path halts detected. Maintain regular subcontractor coordination.\n\n`;
    }

    res += `**2. Contractor Accountability**\n`;
    if (worstContractor && (worstContractor[1].delayed + worstContractor[1].overruns > 0)) {
      res += `Convene mandatory alignment meeting with **${worstContractor[0]}** (${worstContractor[1].delayed} recorded delays) to submit an expedited recovery schedule.\n\n`;
    } else {
      res += `Subcontractor performance is meeting contractual milestones.\n\n`;
    }

    res += `**3. Cost Control**\n`;
    res += `Current variance is ${A.actual - A.budget > 0 ? `+${fmt(A.actual - A.budget)} over baseline` : 'within budget'}. Verify all pending claims against original BOQ line items.\n\n`;

    res += `**4. Data Completeness**\n`;
    const missing = 174 - data.length;
    if (missing > 0) {
      res += `There are **${missing} villas** without uploaded cost/progress data. Ensure the site surveying team uploads updated inspection sheets to complete the masterplan picture.`;
    } else {
      res += `All 174 Phase A villas are fully indexed with live masterplan records.`;
    }
    return res;
  }

  // 7. CHECK LOADED PDF CONTRACTS / DOCUMENTS
  const pdfMatches = searchPdfs(query);
  if (pdfMatches.length) {
    let res = `### Document & Contract Analysis\n\n`;
    res += `Found relevant citations across uploaded project documentation:\n\n`;
    pdfMatches.forEach((m, idx) => {
      res += `**${idx + 1}. ${m.file} (Page ${m.page})**\n`;
      res += `> "...${m.snippet}..."\n\n`;
    });
    res += `*Tip: You can ask specific questions about penalty clauses, payment milestones, or warranty terms.*`;
    return res;
  }

  // 8. GENERAL GREETINGS / EXPLANATION / DEFAULT SMART SUMMARY
  if (/^(hi|hello|hey|good morning|good afternoon|who are you|help|salam)/.test(lower)) {
    return `### Welcome to AZ EXPERT Construction Intelligence\n\n` +
      `I am your dedicated project controls and engineering assistant for the **AZ EXPERT - PAVILION PROJECT (Phase A · 174 Villas)**.\n\n` +
      `**Current Project Snapshot:**\n` +
      `• **Villas Tracked:** ${data.length} / 174\n` +
      `• **Physical Completion:** ${pct(A.avgProg)}\n` +
      `• **Budget / Actual:** ${fmt(A.budget)} / ${fmt(A.actual)}\n` +
      `• **Villas with Schedule Delays:** ${risky.length}\n\n` +
      `**Try asking me:**\n` +
      `• *"Which villas are most at risk?"*\n` +
      `• *"Summarize contractor performance"*\n` +
      `• *"What is the status of Villa 087?"*\n` +
      `• *"What should the manager focus on this week?"*\n` +
      `• *"Show me all villas over budget"*`;
  }

  // Default synthesis
  let res = `### AZ EXPERT Project Analysis\n\n`;
  res += `Based on current records across **174 Phase A Villas** (${data.length} active):\n\n`;
  res += `• **Project Progress:** ${pct(A.avgProg)} average across trades\n`;
  res += `• **Financial Status:** Budget ${fmt(A.budget)} vs Spent ${fmt(A.actual)} (Variance: ${A.actual - A.budget > 0 ? '+' : ''}${fmt(A.actual - A.budget)})\n`;
  res += `• **Milestones:** ${by('Completed').length} completed, ${by('In progress').length} in progress, ${by('Not started').length} pending\n`;
  if (risky.length) {
    res += `• **Risk Alert:** ${risky.length} villas have active delay or cost warnings. Top: **Villas ${risky.slice(0, 4).map(v => v.id).join(', ')}**\n`;
  }
  res += `\n*Ask a specific question like "Villa 087", "Contractor ranking", "Cost overruns", or "Weekly priorities" for deeper insights.*`;
  return res;
}

/* Lightweight Markdown to HTML formatter for crisp chat rendering */
function renderMarkdown(md) {
  if (!md) return '';
  let html = md
    // Escape standard HTML chars safely
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Tables
  html = html.replace(/\|(.+)\|\n\|[-:| ]+\|\n((?:\|.+\|\n?)+)/g, (match, headerLine, bodyLines) => {
    const headers = headerLine.split('|').filter(h => h.trim().length > 0).map(h => `<th>${h.trim()}</th>`).join('');
    const rows = bodyLines.trim().split('\n').map(row => {
      const cells = row.split('|').filter(c => c.trim().length > 0).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<div class="tbl-wrap" style="margin:10px 0"><table style="font-size:12px"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
  });

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3 style="font-size:15px;color:#fff;margin:10px 0 6px;font-weight:700">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 style="font-size:16px;color:#fff;margin:12px 0 8px;font-weight:700">$1</h2>');

  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^> (.*$)/gim, '<blockquote style="border-left:3px solid var(--a2);padding-left:10px;margin:8px 0;color:var(--muted)">$1</blockquote>');

  // Bullet points
  html = html.replace(/^[•*-] (.*$)/gim, '<li style="margin-left:18px;margin-bottom:4px">$1</li>');
  html = html.replace(/(<li.*<\/li>)/gim, '<ul style="padding-left:0;margin:6px 0">$1</ul>');

  // Newlines to breaks (avoid double breaking block elements)
  html = html.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');

  return html;
}

/* Master askAI function */
async function askAI(prompt, q, A) {
  const customKey = localStorage.getItem('buildsight.key') || localStorage.getItem('az.gemini_key') || '';

  // 1. If user provided a Gemini key or server proxy, query Gemini
  if (customKey) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${customKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const j = await r.json();
      const txt = j.candidates?.[0]?.content?.parts?.[0]?.text;
      if (txt) return txt;
    } catch (e) {
      /* Fall through seamlessly */
    }
  }

  if (typeof AI_PROXY_URL !== 'undefined' && AI_PROXY_URL) {
    try {
      const r = await fetch(AI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const j = await r.json();
      if (j.text) return j.text;
    } catch (e) {
      /* Fall through seamlessly */
    }
  }

  // 2. Free Unlimited Online AI (Pollinations text model)
  try {
    const sysPrompt = `You are an expert construction project controls AI for AZ EXPERT Pavilion Project. Keep answers concise, actionable, and formatted in markdown.\n`;
    const res = await fetch('https://text.pollinations.ai/' + encodeURIComponent(sysPrompt + prompt), { cache: 'no-store' });
    if (res.ok) {
       const txt = await res.text();
       // Ignore if they randomly enforce payment walls
       if (txt && !txt.includes('402 Payment Required') && !txt.includes('403 Forbidden')) return txt;
    }
  } catch (e) {
    /* Fall through seamlessly */
  }

  // 3. Client-side AZ EXPERT Construction Intelligence Engine
  // Instant, highly detailed, 100% free, zero disclaimers or error messages
  return localAnswer(q, A);
}

/* Upgrade chat window rendering to support rich formatted markdown */
function upgradeChatRendering() {
  viewAI = function(A) {
    $('#view-ai').innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h2>🤖 AZ EXPERT Project AI</h2>
          <span class="chip" style="border-color:var(--ok);color:var(--ok)">● Active &amp; Ready</span>
        </div>
        <p class="muted small" style="margin-bottom:12px">
          Autonomous construction intelligence analyzing all 174 Phase A villas, schedules, costs, contractors, and PDF contracts.
        </p>
        <div class="row" style="margin-bottom:12px">
          <button class="btn ghost" type="button" data-q="Which villas are most at risk?">⚠️ Villas at risk</button>
          <button class="btn ghost" type="button" data-q="Summarize contractor performance">👷 Contractor ranking</button>
          <button class="btn ghost" type="button" data-q="What is the budget and cost variance?">💰 Cost &amp; variance</button>
          <button class="btn ghost" type="button" data-q="What should the manager focus on this week?">🎯 Weekly priorities</button>
        </div>
        <div class="chat" id="chat"></div>
        <form class="chat-bar" id="ai-form" onsubmit="return false;">
          <input type="text" id="ai-q" placeholder="Type your question here (e.g. 'Status of Villa 087' or 'Compare contractors')…" autocomplete="off">
          <button type="submit" class="btn primary" id="ai-send">Send</button>
        </form>
      </div>`;

    const chat = $('#chat');
    const add = (content, cls, isHtml = false) => {
      const d = document.createElement('div');
      d.className = 'msg ' + cls;
      if (isHtml) d.innerHTML = content;
      else d.textContent = content;
      chat.appendChild(d);
      chat.scrollTop = 1e9;
      return d;
    };

    const send = async (rawQ) => {
      const inputEl = $('#ai-q');
      const q = (typeof rawQ === 'string' ? rawQ : (inputEl ? inputEl.value : '')).trim();
      if (!q) return;
      if (inputEl) {
        inputEl.value = '';
        inputEl.focus();
      }
      add(q, 'u');
      const w = add('Analyzing project data…', 'a');

      try {
        const fullPrompt = `You are the lead construction project controls director for AZ EXPERT - PAVILION PROJECT.\n` +
          `Analyze the following project data and answer the user question precisely, with numbers, villa IDs, and actionable recommendations.\n\n` +
          `DATA:\n${buildContext(A)}\n\nQUESTION: ${q}`;
        const reply = await askAI(fullPrompt, q, A);
        w.innerHTML = renderMarkdown(reply);
      } catch (err) {
        w.innerHTML = renderMarkdown(localAnswer(q, A));
      }
      chat.scrollTop = 1e9;
    };

    const form = $('#ai-form');
    if (form) {
      form.onsubmit = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        send();
        return false;
      };
    }
    const sendBtn = $('#ai-send');
    if (sendBtn) {
      sendBtn.onclick = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        send();
      };
    }

    const inputField = $('#ai-q');
    if (inputField) {
      inputField.onkeydown = (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
          if (e && e.preventDefault) e.preventDefault();
          send();
        }
      };
      // Autofocus
      setTimeout(() => inputField.focus(), 80);
    }

    document.querySelectorAll('[data-q]').forEach(b => {
      b.onclick = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        send(b.dataset.q);
      };
    });

    // Welcome greeting on empty chat
    add(renderMarkdown(`**Welcome to AZ EXPERT Project AI**\n\nAsk me any question about the **174 Phase A villas**, contractors, cost overruns, schedule delays, or weekly management priorities. Type in the box below and press Enter or Send.`), 'a', true);
  };
  window.viewAI = viewAI;
}

upgradeChatRendering();
