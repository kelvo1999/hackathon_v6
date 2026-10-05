// Shared by the employee page (index.html) and the manager page (manager.html):
// Google sign-in, reading the sheet (live, read-only), the XLSX demo path, and the "Sources" panel.
// Expects these element IDs: btnGoogle, btnRefresh, btnSignOut, fileIn, srcStatus, srcList, out.
(function (root) {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const alertBox = (cls, h) => `<div class="alert ${cls}">${h}</div>`;

  // o: { cfg, onData(ix, messages), onReset(), emptyText }
  function init(o) {
    const cfg = o.cfg, out = h => { $('out').innerHTML = h; };
    const wanted = () => [...cfg.sources, ...(cfg.idLookup ? [cfg.idLookup] : [])];
    const G = { client: null, token: null, expires: 0, pending: null };
    const showErr = (title, msg) => out(alertBox('b', `<b>${title}</b> ${esc(msg)}`));

    function setData(sheets, label, missing) {
      const ix = PRS.buildIndex(cfg, sheets);
      const all = [...ix.tiers.values()].flatMap(m => [...m.keys()].map(k => k.split('|')[1])).sort();
      $('srcStatus').innerHTML = `${esc(label)}: ${ix.emps.size} employees` + (all.length ? `, ${PRS.fmtD(all[0])} – ${PRS.fmtD(all[all.length - 1])}` : '')
        + ` <button class="link" id="srcMore" type="button">Sources</button>`;
      $('srcMore').onclick = () => { const el = $('srcList'); el.hidden = !el.hidden; };
      $('srcList').innerHTML = `<table class="mini"><thead><tr><th>Tab</th><th>Used as</th><th class="n">Rows used</th><th class="n">Rows skipped</th></tr></thead><tbody>`
        + ix.sources.map(s => `<tr><td>${esc(s.sheet)}</td><td>${['', 'Main source', 'PRS sheet', 'Workflow log'][s.tier]}</td><td class="n">${s.loaded ? s.records.toLocaleString() : 'not found'}</td><td class="n">${s.loaded ? s.skipped.toLocaleString() : '—'}</td></tr>`).join('')
        + `</tbody></table><p class="muted">Skipped rows have no readable date or Employee ID, such as daily "Total" rows. For each person and day, the most detailed source with data is used, and sources are never added together.</p>`;
      $('srcList').hidden = true;
      // Notices go in their own box above the results, so they never block the page.
      const msgs = [...ix.errors, ...(missing && missing.length ? [`Not in this workbook, skipped: ${missing.join(', ')}.`] : [])];
      const nb = $('notices');
      if (nb) nb.innerHTML = msgs.length ? alertBox(ix.emps.size ? 'i' : 'b', (ix.emps.size ? '' : '<b>No usable data found.</b><br>') + msgs.map(esc).join('<br>')) : '';
      else if (msgs.length) out(alertBox(ix.emps.size ? 'i' : 'b', msgs.map(esc).join('<br>')));
      o.onData(ix, nb ? [] : msgs);
    }

    // ---------- XLSX demo copy: read in the browser, never uploaded ----------
    const toRows = ws => XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    $('fileIn').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      if (!window.XLSX) { e.target.value = ''; return showErr('Excel reader not loaded.', 'The SheetJS script from cdnjs.cloudflare.com did not load. Check your internet connection or ad blocker, then reload the page.'); }
      out(`<div class="card muted">Loading ${esc(f.name)}…</div>`);
      try {
        const buf = await f.arrayBuffer(), titles = XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames;
        const map = wanted().map(s => ({ s, t: PRS.resolveSheet(titles, s) }));
        const wb = XLSX.read(buf, { type: 'array', sheets: map.filter(x => x.t).map(x => x.t) }), sheets = {};
        map.forEach(x => { sheets[x.s.sheet] = x.t && wb.Sheets[x.t] ? toRows(wb.Sheets[x.t]) : []; });
        setData(sheets, 'XLSX demo copy', map.filter(x => !x.t && x.s !== cfg.idLookup).map(x => x.s.sheet)); $('btnRefresh').hidden = !G.token;
      } catch (err) { showErr('Could not read the file.', (err && err.message) || String(err)); }
      e.target.value = '';
    };

    // ---------- Google Sheets: live, read-only (token stays in memory only) ----------
    const run = fn => Promise.resolve().then(fn).catch(err => showErr('Could not load the Google Sheet.', err.message));
    function googleProblem() {
      if (location.protocol === 'file:') return 'Google sign-in does not work when the page is opened as a file. Serve the folder (e.g. "python3 -m http.server 8000") and open http://localhost:8000 — see SETUP.md.';
      if (!cfg.google.clientId) return 'Set google.clientId in config.js to your OAuth Web client ID (see SETUP.md).';
      if (!cfg.google.spreadsheetId) return 'Set google.spreadsheetId in config.js.';
      if (!(window.google && google.accounts && google.accounts.oauth2)) return 'The Google sign-in script has not loaded (still loading, offline, or blocked by an ad/privacy blocker). Wait a moment and try again.';
      return null;
    }
    function apiError(status, body) {
      const msg = (body && body.error && body.error.message) || '';
      if (status === 401) return 'Your Google session expired. Click "Refresh data" to sign in again.';
      if (status === 403) return /not been used|disabled|SERVICE_DISABLED/i.test(msg)
        ? 'The Google Sheets API is not enabled in your Cloud project (APIs & Services → Library → Google Sheets API → Enable).'
        : 'Your Google account cannot open this spreadsheet (403). Ask the owner to share it with you as Viewer.';
      if (status === 404) return 'Spreadsheet not found (404). Check google.spreadsheetId in config.js.';
      if (status === 400) return `The sheet rejected the request (400): ${msg}. Check the tab names and ranges in config.js.`;
      if (status === 429) return 'Too many requests to Google (429). Wait a minute and refresh.';
      return `Sheets API error ${status}${msg ? ': ' + msg : ''}`;
    }
    async function api(url) {
      let r;
      try { r = await fetch(url, { headers: { Authorization: 'Bearer ' + G.token } }); }
      catch (e) { throw new Error('Network error reaching sheets.googleapis.com. Check your connection.'); }
      const body = await r.json().catch(() => null);
      if (!r.ok) { if (r.status === 401) G.token = null; throw new Error(apiError(r.status, body)); }
      return body;
    }
    async function loadFromSheets() {
      const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cfg.google.spreadsheetId)}`;
      out('<div class="card muted">Reading Google Sheet…</div>');
      const meta = await api(base + '?fields=sheets.properties.title'), titles = ((meta && meta.sheets) || []).map(s => s.properties.title);
      const map = wanted().map(s => ({ s, t: PRS.resolveSheet(titles, s) })), have = map.filter(x => x.t), sheets = {};
      if (have.length) {
        const q = have.map(x => 'ranges=' + encodeURIComponent(`'${x.t.replace(/'/g, "''")}'!${x.s.range}`)).join('&');
        const body = await api(`${base}/values:batchGet?${q}&valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`), vr = (body && body.valueRanges) || [];
        have.forEach((x, i) => { sheets[x.s.sheet] = (vr[i] && vr[i].values) || []; });
      }
      setData(sheets, `Google Sheet (live, read-only, loaded ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        map.filter(x => !x.t && x.s !== cfg.idLookup).map(x => x.s.sheet));
      $('btnGoogle').hidden = true; $('btnRefresh').hidden = false; $('btnSignOut').hidden = false;
    }
    function withToken(fn) {
      if (G.token && Date.now() < G.expires - 60e3) return run(fn);
      if (!G.client) G.client = google.accounts.oauth2.initTokenClient({
        client_id: cfg.google.clientId, scope: cfg.google.scope,
        callback: t => {
          if (t.error) return showErr('Authentication failed:', t.error_description || t.error);
          if (!google.accounts.oauth2.hasGrantedAllScopes(t, cfg.google.scope)) return showErr('Permission not granted.', 'Allow "See your Google Sheets spreadsheets" when signing in.');
          G.token = t.access_token; G.expires = Date.now() + (+t.expires_in || 3600) * 1000;
          const f = G.pending; G.pending = null; if (f) run(f);
        },
        error_callback: e => { G.pending = null; showErr('Sign-in did not complete.',
          e.type === 'popup_closed' ? 'The Google window was closed before finishing.' :
          e.type === 'popup_failed_to_open' ? 'The Google pop-up was blocked. Allow pop-ups for this page and try again.' : String(e.type || e.message || e)); }
      });
      G.pending = fn; out('<div class="card muted">Waiting for Google sign-in…</div>');
      G.client.requestAccessToken({ prompt: G.everSignedIn ? '' : 'consent' }); G.everSignedIn = true;
    }
    const connect = () => { const p = googleProblem(); if (p) return showErr('Google Sheet not available.', p); withToken(loadFromSheets); };
    $('btnGoogle').onclick = connect; $('btnRefresh').onclick = connect;
    $('btnSignOut').onclick = () => {
      const done = () => { G.token = null; G.expires = 0;
        $('btnGoogle').hidden = false; $('btnRefresh').hidden = true; $('btnSignOut').hidden = true; $('srcList').hidden = true;
        $('srcStatus').textContent = 'Disconnected from Google. No data loaded.'; if ($('notices')) $('notices').innerHTML = ''; o.onReset(); out(`<div class="card muted">${o.emptyText}</div>`); };
      if (G.token && window.google && google.accounts) google.accounts.oauth2.revoke(G.token, done); else done();
    };
    out(`<div class="card muted">${o.emptyText}</div>`);
  }
  root.PRSLoader = { init, esc, alertBox };
})(this);
