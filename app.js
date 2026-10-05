(function () {
  if (typeof PRSLoader === 'undefined' || typeof PRS === 'undefined' || typeof PRS_CONFIG === 'undefined') { // a file is missing or out of date: say so instead of failing silently
    const miss = [typeof PRS_CONFIG === 'undefined' && 'config.js', typeof PRS === 'undefined' && 'core.js', typeof PRSLoader === 'undefined' && 'loader.js'].filter(Boolean).join(', ');
    document.getElementById('out').innerHTML = `<div class="alert b"><b>The page could not start.</b> Missing or failed to load: ${miss}. Put all files from the download in the same folder as this page, then reload with Ctrl+Shift+R.</div>`;
    return;
  }
  const $ = id => document.getElementById(id), cfg = PRS_CONFIG; let ix = null, last = null, view = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const out = h => { $('out').innerHTML = h; };
  const alertBox = (cls, h) => `<div class="alert ${cls}">${h}</div>`;
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], wd = iso => WD[new Date(iso + 'T00:00:00Z').getUTCDay()];

  PRSLoader.init({ cfg, emptyText: 'Load the Google Sheet or the XLSX demo copy to begin.',
    onData: (data, msgs) => {
      ix = data; last = null; view = null;
      $('empList').innerHTML = [...ix.emps].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => `<option value="${esc(n)} (${id})">`).join('');
      const off = !ix.emps.size; $('find').disabled = off; $('all').disabled = off;
      if (!msgs.length) out('<div class="card muted">Pick an employee, then choose a day or show all days.</div>');
    },
    onReset: () => { ix = null; last = null; view = null; $('empList').innerHTML = ''; $('find').disabled = true; $('all').disabled = true; $('hint').textContent = ''; }
  });
  function pickEmp(v) {
    v = v.trim().toLowerCase(); const m = v.match(/\((\d+)\)\s*$/); if (m && ix.emps.has(m[1])) return m[1];
    if (ix.emps.has(v)) return v; const hit = [...ix.emps].filter(([, n]) => n.toLowerCase() === v); return hit.length === 1 ? hit[0][0] : null;
  }
  $('emp').oninput = () => { const id = ix && pickEmp($('emp').value), d = id ? PRS.datesFor(ix, id) : [];
    $('hint').textContent = d.length ? `Data on ${d.length} day${d.length > 1 ? 's' : ''}, ${PRS.fmtD(d[0])} – ${PRS.fmtD(d[d.length - 1])}` : ''; };
  const needEmp = () => { const id = pickEmp($('emp').value); if (!id) out(alertBox('b', '<b>Pick an employee.</b> Choose a name from the list or enter an exact ID.')); return id; };
  $('find').onclick = () => {
    const id = needEmp(); if (!id) return; const d = $('date').value;
    if (!d) return out(alertBox('b', '<b>Pick a date,</b> or use "Show all days".'));
    last = PRS.query(ix, id, d); render(false);
  };
  $('all').onclick = () => { const id = needEmp(); if (!id) return; view = { id }; renderAll(); };

  const vtxt = v => v == null ? '—' : `<span class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${v}%</span>`;
  const cell = (r, f, txt) => txt + (r.from[f] && !/^calculated/.test(r.from[f]) ? `<span class="tag">${esc(r.from[f])}</span>` : r.from[f] ? `<span class="tag">calculated</span>` : '');
  const SRC_NOTE = {
    primary: s => `From ${s}.`,
    prs: s => `From ${s}. Start and end times aren't recorded in this sheet.`,
    logs: s => `From the workflow logs (${s}). Target and variance aren't recorded there; productivity per hour is calculated from units and duration.`
  };
  const fmtU = n => (Math.round(n * 100) / 100).toLocaleString();

  function renderAll() {
    const id = view.id, name = ix.emps.get(id) || '', days = PRS.daily(ix, id), t = PRS.totals(days);
    if (!days.length) return out(alertBox('i', `<b>No data found</b> for ${esc(name)} in any source.`));
    const byMonth = new Map(); days.forEach(d => { const k = d.date.slice(0, 7); (byMonth.get(k) || byMonth.set(k, []).get(k)).push(d); });
    const SH = cfg.shift, fill = d => d.planned ? PRS.fmtH(d.planned) : d.fillNote ? '<span class="tag w" title="' + esc(d.fillNote) + '">not added</span>' : '—';
    const body = t.months.map(m => `<tr class="mh"><th colspan="3">${PRS.fmtMonth(m.month)}</th><th class="n">${m.days} day${m.days > 1 ? 's' : ''}</th><th class="n">${fmtU(m.units)}</th><th class="n">${PRS.fmtH(m.hours)}</th>`
      + (SH ? `<th class="n">${PRS.fmtH(m.planned)}</th><th class="n">${PRS.fmtH(m.dayTotal)}</th>` : '') + `</tr>`
      + byMonth.get(m.month).map(d => `<tr class="day" data-d="${d.date}" tabindex="0"><td><b>${PRS.fmtD(d.date)}</b> <span class="muted">${wd(d.date)}</span></td>
        <td>${d.sources.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</td><td>${esc(d.workflows.join(', '))}${d.conflicts ? '<span class="tag b">conflict</span>' : ''}</td>
        <td class="n">${d.n}</td><td class="n">${fmtU(d.units)}</td><td class="n">${PRS.fmtH(d.hours)}</td>`
        + (SH ? `<td class="n">${fill(d)}</td><td class="n"><b>${PRS.fmtH(d.dayTotal)}</b></td>` : '') + `</tr>`).join('')).join('');
    out(`<div class="card"><div class="meta"><div><span>Employee</span><b>${esc(name)}</b></div><div><span>Employee ID</span><b>${esc(id)}</b></div>
      <div><span>Period</span><b>${PRS.fmtD(days[0].date)} – ${PRS.fmtD(days[days.length - 1].date)}</b></div></div>
      <p class="muted note">Each day uses its most detailed source: Detailed Productivity first, then the PRS sheets, then the workflow logs. Rows in data-quality conflict are left out of totals.${SH ? ` Day total = logged time + planned training (fills each day to ${SH.workHours}h when needed) + ${SH.breakHours}h break.` : ''} Select a day to see its records.</p></div>
      <div class="cards"><div class="stat"><span>Total units</span><b>${fmtU(t.units)}</b></div><div class="stat"><span>Logged time</span><b>${PRS.fmtH(t.hours)}</b></div>
      ${SH ? `<div class="stat"><span>Day total</span><b>${PRS.fmtH(t.dayTotal)}</b><small>incl. ${PRS.fmtH(t.planned)} planned training, ${PRS.fmtH(t.brk)} break</small></div>` : ''}
      <div class="stat"><span>Days with data</span><b>${t.days}</b><small>${t.months.length} month${t.months.length > 1 ? 's' : ''}</small></div><div class="stat"><span>Workflows</span><b>${t.workflows}</b></div></div>
      <div class="card tw"><table><thead><tr><th>Date</th><th>Source</th><th>Workflows</th><th class="n">Records</th><th class="n">Units</th><th class="n">Logged time</th>${SH ? `<th class="n">${esc(SH.trainingLabel)}</th><th class="n">Day total</th>` : ''}</tr></thead><tbody>${body}</tbody></table></div>`);
    $('out').querySelectorAll('tr.day').forEach(tr => { const go = () => { $('date').value = tr.dataset.d; last = PRS.query(ix, id, tr.dataset.d); render(false, true); };
      tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
  }
  function render(inc, fromAll) {
    const r = last, back = view && view.id === r.empId ? '<button class="link" id="back" type="button">← All days</button>' : '';
    if (r.mode === 'none') { const d = PRS.datesFor(ix, r.empId);
      out(back + alertBox('i', `<b>No data found</b> for ${esc(r.empName)} on ${PRS.fmtD(r.date)}.` + (d.length ? ` Records exist on ${d.length} day${d.length > 1 ? 's' : ''} from ${PRS.fmtD(d[0])} to ${PRS.fmtD(d[d.length - 1])}. Use "Show all days" to see them.` : '')));
      return wireBack(); }
    const t = PRS.summarize(r.rows, inc), A = [];
    if (r.conflicts.length) A.push(alertBox('b', `<b>Data-quality conflict:</b> ${r.conflicts.map(c => `${esc(c.label)} (rows ${c.rows.join(', ')}; differ in ${c.diff.join(', ')})`).join('; ')}. Same identifiers, different values; ${inc ? 'currently <b>included</b> in totals' : `<b>${t.excluded} row(s) excluded</b> from totals`}. <label><input type="checkbox" id="inc" ${inc ? 'checked' : ''}> include in totals</label>`));
    if (r.softDups.length) A.push(alertBox('i', `Duplicate rows with identical activity but differing ${r.softDups.map(c => c.diff.join('/')).join(', ')} were counted once.`));
    if (t.missingUnits || t.missingHours) A.push(alertBox('', `Some rows have no ${t.missingUnits ? 'units' : ''}${t.missingUnits && t.missingHours ? ' / ' : ''}${t.missingHours ? 'duration' : ''}; totals only include recorded values.`));
    const clock = t.mergedMin != null && Math.abs(t.mergedMin / 60 - t.hours) > 0.02 ? `<small>clock time ${PRS.fmtH(t.mergedMin / 60)} (overlaps merged)</small>` : t.mergedMin != null ? '<small>matches clock time</small>' : '';
    const rows = r.rows.map(x => `<tr class="${x.conflict ? 'cf' : ''}"><td>${esc(x.subtask)}${x.conflict ? '<span class="tag b">conflict</span>' : ''}<div class="muted">${esc(x.task)}</div></td>
      <td>${x.start != null && x.end != null ? PRS.fmtT(x.start) + '–' + PRS.fmtT(x.end) : '—'}</td><td class="n">${x.hours != null ? cell(x, 'hours', PRS.fmtH(x.hours)) : '—'}</td>
      <td class="n">${x.units != null ? cell(x, 'units', x.units.toLocaleString()) : '—'}</td><td class="n">${x.target != null ? cell(x, 'target', x.target) : '—'}</td>
      <td class="n">${x.prod != null ? cell(x, 'prod', x.prod) : '—'}</td><td class="n">${x.variance != null ? cell(x, 'variance', vtxt(x.variance)) : '—'}</td>
      <td>${esc(x.remarks) || '—'}${x.notes.map(n => `<div class="muted">${esc(n)}</div>`).join('')}</td></tr>`).join('');
    const SH = cfg.shift, F = PRS.shiftFill(r.rows, t, SH, inc);
    if (F && F.reason) A.push(alertBox('', `<b>${esc(SH.trainingLabel)} not added:</b> ${esc(F.reason)}. Day total is logged time + ${SH.breakHours}h break.`));
    const tm = (s, e) => s != null && e != null ? PRS.fmtT(s) + '–' + PRS.fmtT(e) : '—';
    const trainRow = F && F.planned ? `<tr><td>${esc(SH.trainingLabel)}</td><td>${tm(F.trainStart, F.trainEnd)}</td><td class="n">${PRS.fmtH(F.planned)}</td>
      <td class="n">${F.trainUnits != null ? fmtU(F.trainUnits) : '—'}</td><td class="n">${F.trainTarget != null ? F.trainTarget : '—'}</td><td class="n">${F.trainTarget != null ? F.trainTarget : '—'}</td><td class="n">${F.trainTarget != null ? vtxt(0) : '—'}</td><td>—</td></tr>` : '';
    const breakRow = F && F.break ? `<tr><td>${esc(SH.breakLabel)}</td><td>${tm(F.breakStart, F.breakEnd)}</td><td class="n">${PRS.fmtH(F.break)}</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td>—</td></tr>` : '';
    const extra = trainRow + breakRow;
    const parts = F ? [`${PRS.fmtH(F.queue)} queues`, F.recordedTraining ? `${PRS.fmtH(F.recordedTraining)} training (recorded)` : '', F.planned ? `${PRS.fmtH(F.planned)} planned training` : '', F.break ? `${PRS.fmtH(F.break)} break` : ''].filter(Boolean).join(' + ') : '';
    const sm = PRS.aiSummary(r, t), note = SRC_NOTE[r.mode](r.sources.map(esc).join(', ')) + (r.repaired ? ' Dates in this sheet are stored with day and month swapped, and were read accordingly.' : '');
    out(`${back}<div class="card"><div class="meta"><div><span>Employee</span><b>${esc(r.empName)}</b></div><div><span>Employee ID</span><b>${esc(r.empId)}</b></div><div><span>Date</span><b>${PRS.fmtD(r.date)}</b></div><div><span>Project</span><b>${esc(r.rows[0].project) || '—'}</b></div></div>
      <p class="muted note">${note}</p></div>
      ${A.join('')}<div class="cards"><div class="stat"><span>Total tasks (units)</span><b>${t.units.toLocaleString()}</b></div><div class="stat"><span>Logged time</span><b>${PRS.fmtH(t.hours)}</b>${clock}</div>
      ${F ? `<div class="stat"><span>Day total</span><b>${PRS.fmtH(F.total)}</b><small>${esc(parts)}${F.over ? `; ${PRS.fmtH(F.over)} over ${SH.workHours}h` : ''}</small></div>` : ''}
      <div class="stat"><span>Workflows</span><b>${t.workflows}</b></div><div class="stat"><span>Records</span><b>${t.n}</b><small>${t.excluded} excluded</small></div></div>
      ${sm ? `<div class="card sum"><b>Summary</b> <span class="tag">generated from the rows below only</span><p>${esc(sm)}</p></div>` : ''}
      <div class="card tw"><table><thead><tr><th>Queue / workflow</th><th>Time</th><th class="n">Duration</th><th class="n">Units</th><th class="n">Target/h</th><th class="n">Productivity/h</th><th class="n">Variance</th><th>Remarks</th></tr></thead><tbody>${rows}${extra}</tbody></table></div>`);
    const c = $('inc'); if (c) c.onchange = () => render(c.checked); wireBack();
  }
  function wireBack() { const b = $('back'); if (b) b.onclick = () => renderAll(); }
})();
