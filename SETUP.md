# Connecting PRS Quick View to Google Sheets

The app signs each user in with their own Google account and reads the sheet **read-only**, directly from the browser. There is no server and no client secret. People can only see the sheet if it is already shared with their Google account.

## 1. Create the Google Cloud credentials (one time, ~10 minutes)

1. Go to https://console.cloud.google.com and create a project (or pick an existing one).
2. **Enable the API:** APIs & Services → Library → search "Google Sheets API" → **Enable**.
3. **Consent screen:** APIs & Services → OAuth consent screen (called "Google Auth Platform" in newer consoles).
   - If everyone uses your company Google Workspace accounts, choose **Internal**. No review needed.
   - Otherwise choose **External** and, while in "Testing", add each user's email under **Test users** (up to 100).
   - Under Data access / Scopes, add `https://www.googleapis.com/auth/spreadsheets.readonly`.
4. **Client ID:** APIs & Services → Credentials → Create credentials → **OAuth client ID** → Application type **Web application**.
   - Under **Authorized JavaScript origins** add every address the app will be opened from, exactly (scheme + host + port, no path, no trailing slash):
     - `http://localhost:8000` for local testing
     - your hosted address, e.g. `https://prs.yourcompany.com`
   - Redirect URIs: leave empty (not used).
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) into `config.js`:

```js
google: {
  spreadsheetId: '11Psd8-mcHOwv9uVUVd8ZnpWj_qMQToLK9HeaJDShd3E',
  clientId: '1234567890-abc123.apps.googleusercontent.com',
  ...
}
```

Do **not** copy the client secret anywhere. This app does not need it.

## 2. Share the sheet

Each person who will use the app needs at least **Viewer** access to the spreadsheet with the same Google account they sign in with.

## 3. Run the app

Google sign-in refuses to run from `file://`, so serve the folder instead of double-clicking `index.html`:

```bash
cd path/to/prs-quick-view      # folder with index.html, manager.html, loader.js, ...
python3 -m http.server 8000      # or: npx serve -l 8000
```

Open http://localhost:8000, click **Connect Google Sheet**, sign in, approve read access. Use **Refresh data** to pull the latest values (it re-uses the session for about an hour, then asks again) and **Disconnect** to revoke access.

For team use, put the same files on any static host (Google Sites embed, Firebase Hosting, Netlify, an internal web server) and add that origin to step 4.

## 4. Which tabs are read

All tabs are listed in `sources` in `config.js`. For each person and day the app uses the most detailed tab that has data, and never adds tabs together, so the same work isn't counted twice:

1. **Detailed Productivity**: start/end times, targets.
2. **PRS sheets**: `Sept. PRS`, `July PRS`. Add a new month by copying the July line and changing `sheet`.
3. **Workflow logs**: `Alert Validation PRODUCTIVITY & HOURS` (AV2), `AVIP`, `LC-GC Hours`, `Realogram Correction HOURS from 1st August`, `SVm- RC Hours`, `SVm-Gap Hours`. These have no target or variance; productivity per hour is calculated and labelled. Rows whose Employee ID is empty or `#N/A` get it from `Judith Analysis-New` (columns H:I) by email.

A tab that isn't found is skipped with a note, and the rest still load. Click **Sources** next to the status line to see how many rows each tab contributed. **Show all days** lists every day with data for the chosen employee, grouped by month with subtotals; click a day to open it.

## 5. Break and planned training

For each day with data, the app tops recorded hours up to an 8-hour work day with **Planned training**, then adds a **1h break**, so a full day shows 9h. Example: 5h of queues → 3h planned training + 1h break = 9h. Training already recorded in the sheets (any queue/task containing "training") counts toward the 8h, so only the gap is added. Days over 8h get no training but still get the break.

Planned training starts at the last end time recorded that day (e.g. last queue ends 10:21 → training 10:21–15:00), and the break starts when training ends (15:00–16:00). If no training is needed, the break starts at the last recorded time. Days from sources without start/end times (PRS sheets, workflow logs) get the hours but no times. Planned training has a target of 60 per hour, so its units are 60 × training hours and its productivity is 60/h; these units are not added to the day's task units, and the real queues' productivity and variance are unchanged. If a day has rows without a duration, or conflict rows left out of totals, the gap can't be measured, so no training is added and the day shows a note. Change the numbers or labels in `shift` in `config.js`, or set `shift: null` to turn this off.

## 6. Manager view

Open `manager.html` (or click **Manager view** in the header) and connect the sheet the same way. It opens on the latest day with data; use the date box or ‹ › to move between days with data.

- **Summary cards and a day summary**: employees with data, how many were below target or met target, team units and logged time, and the workflows most often below target.
- **Team table**: everyone with records that day, those below target first (worst variance at the top). Filter by status or search by name/ID; select a row to see that person's workflows with target, productivity and variance.
- **Below target** means at least one workflow had a negative variance. Variance is taken from the sheet; if a row has a target and productivity but no variance, it is calculated and marked "calculated". People who only appear in the workflow logs show **No target recorded**, because those tabs have no target.
- **No records this day**: people with records elsewhere in that month but none on the chosen day.
- **Download CSV** saves the table as shown, for sharing or Excel.

The manager page has no separate login: anyone who can open the page **and** has access to the spreadsheet sees everyone's results. If only managers should see the team view, host `manager.html` where only managers can reach it, or rely on sheet sharing (only managers have access to the full sheet).

## 7. Check date formatting in the sheet (important)

The app reads values **as displayed** in the sheet. Each tab has a `dateRule` in `config.js`: `dmy` for `DD/MM/YYYY`, `mdy` for US-style `8/1/2026`, and `YYYY-MM-DD` is always accepted. The workflow logs are set to `mdy` because they display US dates; the AV2 log shows dates without a year (`7/1`), so it also has `year: 2026`. If a tab's dates show a different way in your sheet, change its `dateRule`. Dates that can't be read are skipped, never guessed.

## Troubleshooting

| Message / symptom | Fix |
|---|---|
| `Error 400: redirect_uri_mismatch` or `origin_mismatch` in the Google pop-up | The page's address isn't in Authorized JavaScript origins. Add it exactly (e.g. `http://localhost:8000`, not `127.0.0.1`). Changes can take a few minutes. |
| `Error 403: access_denied` in the pop-up | App is "External / Testing" and the user isn't a test user. Add them. |
| "Google Sheets API is not enabled" | Step 1.2. |
| "cannot open this spreadsheet (403)" | Share the sheet with that account (step 2). |
| "rejected the request (400)" | A range in `config.js` is invalid. Check `range` for each source. |
| "Tab … was not found" | That tab name in `config.js` doesn't match the spreadsheet. Fix `sheet`, or add the real name to `aliases`. |
| "column … not found" | A header in row 1 changed. Update `columns` in `config.js`. |
| Pop-up blocked / nothing happens | Allow pop-ups for the site; disable ad blockers that block `accounts.google.com`. |
| "Google app isn't verified" warning | Normal for External apps in testing. Use Internal (Workspace) or submit for verification before wide rollout. |
