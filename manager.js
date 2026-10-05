(function () {
  if (typeof PRSLoader === 'undefined' || typeof PRS === 'undefined' || typeof PRS_CONFIG === 'undefined') { // a file is missing or out of date: say so instead of failing silently
    const miss = [typeof PRS_CONFIG === 'undefined' && 'config.js', typeof PRS === 'undefined' && 'core.js', typeof PRSLoader === 'undefined' && 'loader.js'].filter(Boolean).join(', ');
    document.getElementById('out').innerHTML = `<div class="alert b"><b>The page could not start.</b> Missing or failed to load: ${miss}. Put all files from the download in the same folder as this page, then reload with Ctrl+Shift+R.</div>`;
    return;
  }
  const $ = id => document.getElementById(id), cfg = PRS_CONFIG, { esc, alertBox } = PRSLoader;
  let ix = null, dates = [], day = null;
  const out = h => { $('out').innerHTML = h; };
  const fmtU = n => (Math.round(n * 100) / 100).toLocaleString();
  const vtxt = v => v == null ? '—' : `<span class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${v}%</span>`;
  const STATUS = { below: ['Below target', 'b'], met: ['Met target', 'ok'], notarget: ['No target recorded', ''], conflict: ['Data conflict', 'w'] };
  const tag = st => `<span class="tag ${STATUS[st][1]}">${STATUS[st][0]}</span>`;
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], wd = iso => WD[new Date(iso + 'T00:00:00Z').getUTCDay()];

  PRSLoader.init({ cfg, emptyText: 'Load the Google Sheet or the XLSX demo copy to begin.',
    onData: (data, msgs) => {
      ix = data; day = null;
      dates = [...new Set([...ix.tiers.values()].flatMap(m => [...m.keys()].map(k => k.split('|')[1])))].sort();
      const off = !dates.length; $('show').disabled = off; $('prev').disabled = off; $('next').disabled = off;
      if (dates.length && !$('date').value) $('date').value = dates[dates.length - 1]; // default: latest day with data
      if (!msgs.length) dates.length ? show() : out(alertBox('i', 'No dated records were found in the sheet.'));
    },
    onReset: () => { ix = null; dates = []; day = null; $('show').disabled = true; $('prev').disabled = true; $('next').disabled = true; }
  });

  function step(dir) { // jump to the previous/next day that has data
    const d = $('date').value; if (!dates.length) return;
    const n = dir < 0 ? [...dates].reverse().find(x => !d || x < d) : dates.find(x => !d || x > d);
    if (n) { $('date').value = n; show(); }
  }
  $('prev').onclick = () => step(-1); $('next').onclick = () => step(1);
  $('show').onclick = () => show();
  $('date').onchange = () => { if (ix) show(); };
  $('filter').onchange = () => { if (day) render(); };
  $('q').oninput = () => { if (day) render(); };

  function show() {
    const d = $('date').value; if (!ix) return;
    if (!d) return out(alertBox('b', '<b>Pick a date.</b>'));
    day = PRS.teamDay(ix, d); render();
  }

  function summaryText(D) {
    const s = D.summary, parts = [];
    if (s.below) parts.push(`${s.below} below target`); if (s.met) parts.push(`${s.met} met target`);
    if (s.notarget) parts.push(`${s.notarget} with no target recorded`); if (s.conflict) parts.push(`${s.conflict} with data conflicts only`);
    let t = `On ${wd(D.date)} ${PRS.fmtD(D.date)}, ${s.employees} employee${s.employees === 1 ? '' : 's'} logged work across ${s.workflows} workflow${s.workflows === 1 ? '' : 's'}: `
      + `${fmtU(s.units)} units over ${PRS.fmtH(s.hours)} of logged time. ${parts.join(', ')}.`;
    const counts = new Map(); D.people.forEach(p => p.below.forEach(b => counts.set(b.subtask, (counts.get(b.subtask) || 0) + 1)));
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) t += ` Workflows most often below target: ${top.map(([w, n]) => `${w} (${n})`).join(', ')}.`;
    return t;
  }

  function render() {
    const D = day, s = D.summary, f = $('filter').value || 'all', q = $('q').value.trim().toLowerCase();
    if (!D.people.length) return out(alertBox('i', `<b>No records</b> on ${PRS.fmtD(D.date)}. Use ‹ › to jump to the nearest day with data.`));
    const list = D.people.filter(p => (f === 'all' || p.status === f) && (!q || p.empName.toLowerCase().includes(q) || p.empId.includes(q)));
    const SH = cfg.shift;
    const rows = list.map((p, i) => {
      const detail = p.perf.map(w => `<tr><td>${esc(w.subtask)}</td><td>${w.start != null && w.end != null ? PRS.fmtT(w.start) + '–' + PRS.fmtT(w.end) : '—'}</td>
        <td class="n">${w.hours != null ? PRS.fmtH(w.hours) : '—'}</td><td class="n">${w.units != null ? fmtU(w.units) : '—'}</td><td class="n">${w.target ?? '—'}</td>
        <td class="n">${w.prod ?? '—'}</td><td class="n">${vtxt(w.variance)}${w.calc ? '<span class="tag">calculated</span>' : ''}</td></tr>`).join('');
      const notes = [p.unchecked && p.checked ? `${p.unchecked} workflow${p.unchecked > 1 ? 's have' : ' has'} no target recorded and ${p.unchecked > 1 ? 'were' : 'was'} not checked.` : '',
        p.excluded ? `${p.excluded} record${p.excluded > 1 ? 's' : ''} in data conflict left out.` : '', p.fillNote ? `Planned training not added: ${p.fillNote}.` : ''].filter(Boolean);
      return `<tr class="emp" data-i="${i}" tabindex="0" aria-expanded="false"><td><b>${esc(p.empName)}</b><div class="muted">${esc(p.empId)}</div></td><td>${tag(p.status)}</td>
        <td>${p.below.length ? p.below.map(b => `${esc(b.subtask)} ${vtxt(b.variance)}`).join('<br>') : '—'}</td><td>${esc(p.workflows.join(', ')) || '—'}</td>
        <td class="n">${fmtU(p.units)}</td><td class="n">${PRS.fmtH(p.hours)}</td>${SH ? `<td class="n">${PRS.fmtH(p.dayTotal)}</td>` : ''}</tr>
        <tr class="det" id="det${i}" hidden><td colspan="${SH ? 7 : 6}"><p class="muted note">From ${esc(p.sources.join(', '))}.</p>
        <div class="tw"><table class="mini"><thead><tr><th>Workflow</th><th>Time</th><th class="n">Duration</th><th class="n">Units</th><th class="n">Target/h</th><th class="n">Productivity/h</th><th class="n">Variance</th></tr></thead><tbody>${detail || '<tr><td colspan="7">No usable records.</td></tr>'}</tbody></table></div>
        ${notes.map(n => `<p class="muted note">${esc(n)}</p>`).join('')}</td></tr>`;
    }).join('');
    const absent = D.absent.length ? `<div class="card"><details class="abs"><summary>No records this day (${D.absent.length})</summary>
      <p class="muted">People with records earlier or later in ${PRS.fmtMonth(D.date.slice(0, 7))} but none on ${PRS.fmtD(D.date)}. They may have been off, on leave, or not logged yet.</p>
      <p>${D.absent.map(a => `${esc(a.empName)} <span class="muted">(${esc(a.empId)})</span>`).join(', ')}</p></details></div>` : '';
    out(`<div class="cards">
        <div class="stat"><span>Employees with data</span><b>${s.employees}</b><small>${wd(D.date)} ${PRS.fmtD(D.date)}</small></div>
        <div class="stat bad"><span>Below target</span><b>${s.below}</b><small>at least one workflow under target</small></div>
        <div class="stat good"><span>Met target</span><b>${s.met}</b><small>${s.notarget} with no target recorded</small></div>
        <div class="stat"><span>Team units</span><b>${fmtU(s.units)}</b><small>${PRS.fmtH(s.hours)} logged</small></div></div>
      <div class="card sum"><b>Day summary</b> <span class="tag">generated from the sheet only</span><p>${esc(summaryText(D))}</p></div>
      <div class="card tw"><div class="bar"><h2>${list.length === D.people.length ? 'Everyone' : `${list.length} of ${D.people.length} employees`}</h2>
        <button class="link" id="csv" type="button">Download CSV</button></div>
        <table><thead><tr><th>Employee</th><th>Status</th><th>Below-target workflows</th><th>Workflows</th><th class="n">Units</th><th class="n">Logged</th>${SH ? '<th class="n">Day total</th>' : ''}</tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="muted">Nobody matches this filter.</td></tr>`}</tbody></table>
        <p class="muted note">A workflow is below target when its variance is negative. Workflow logs record no target, so people who only appear there show "No target recorded". Select a row for details.</p></div>
      ${absent}`);
    $('out').querySelectorAll('tr.emp').forEach(tr => {
      const toggle = () => { const d = $('det' + tr.dataset.i); d.hidden = !d.hidden; tr.setAttribute('aria-expanded', String(!d.hidden)); };
      tr.onclick = toggle; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
    });
    $('csv').onclick = () => downloadCsv(D, list);
  }

  function downloadCsv(D, list) {
    const c = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }, h2 = h => h == null ? '' : (Math.round(h * 100) / 100);
    const head = ['Date', 'Employee ID', 'Employee Name', 'Status', 'Workflows', 'Below-target workflows', 'Worst variance %', 'Units', 'Logged hours', 'Planned training hours', 'Day total hours', 'Source'];
    const lines = [head, ...list.map(p => [D.date, p.empId, p.empName, STATUS[p.status][0], p.workflows.join('; '), p.below.map(b => `${b.subtask} ${b.variance}%`).join('; '),
      p.worst, h2(p.units), h2(p.hours), h2(p.planned), h2(p.dayTotal), p.sources.join('; ')])].map(r => r.map(c).join(','));
    const url = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv' })), a = document.createElement('a');
    a.href = url; a.download = `prs-team-${D.date}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
})();
