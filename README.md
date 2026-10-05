# PRS Quick View

A small web app that reads the team's productivity spreadsheet and shows, for any employee and day, what was worked on, for how long, and how it compared to target. A separate manager page shows the whole team for a chosen day, including who fell below target.

It runs entirely in the browser: no server, no database. Data is read **read-only** from Google Sheets (or from a local Excel copy) and is never uploaded anywhere.

## Pages

**Employee view (`index.html`)**
- Pick an employee (name or ID) and a date, then **Find My Data** to see that day's queues/workflows with start and end times, duration, units, target per hour, productivity per hour, variance and remarks.
- Summary cards for total units, logged time, workflows and records, plus a short written summary generated only from the rows shown.
- **Day total** with the shift rule applied (see below): queues + planned training + break.
- **Show all days** lists every day with data for that employee, grouped by month with subtotals. Click a day to open it.

**Manager view (`manager.html`)**
- Opens on the latest day with data; use the date box or ‹ › to move between days that have data.
- Cards for employees with data, how many were below target, how many met target, and team units and hours.
- A day summary sentence, including which workflows were most often below target.
- A team table with people below target listed first (worst variance at the top). Filter by status, search by name or ID, and click a row for that person's workflow details.
- A collapsible list of people with records that month but none on the chosen day.
- **Download CSV** of the table as shown.

## Quick start

1. Set up Google access once (Google Cloud project, Sheets API, OAuth Web client ID). Follow **[SETUP.md](SETUP.md)**.
2. Put the client ID and spreadsheet ID in `config.js`.
3. Serve the folder (Google sign-in does not work from `file://`):
   ```bash
   cd prs-quick-view
   python3 -m http.server 8000
   ```
4. Open http://localhost:8000 (employee view) or http://localhost:8000/manager.html (manager view), then click **Connect Google Sheet**.

To try it without Google, click **Load XLSX (demo)** and pick an Excel export of the spreadsheet. This works even from `file://`.

## How the data is used

**Sources, in order of detail.** All tabs are listed in `sources` in `config.js`. For each person and day the app uses the most detailed source that has data, and never adds sources together, so the same work is never counted twice:

1. **Detailed Productivity**: has start/end times and targets.
2. **PRS sheets** (`Sept. PRS`, `July PRS`, …): daily rows with targets, no times.
3. **Workflow logs** (AV2, AVIP, LC-GAP, LC-RC, SVm-RC, SVm-GAP): units and duration per person per day, no target. Productivity per hour is calculated and labelled. Missing Employee IDs are filled by email from `Judith Analysis-New`.

**Data-quality rules: nothing is guessed.**
- Exact duplicate rows are counted once.
- Rows with the same identifiers but different values are flagged as a **conflict** and left out of totals. On the employee view they can be included with a checkbox.
- Rows that differ only in variance or remarks are counted once, with a note.
- If Detailed Productivity has no target (or 0), its variance is hidden. The target and variance are filled from the matching PRS row when exactly one matches, labelled with its source.
- A missing duration is calculated from start/end times and labelled. Other missing values stay empty.
- Dates that can't be read are skipped. Each tab's date style is set by `dateRule` in `config.js`.

**Shift rule: planned training and break.** Each day with data is filled to an 8-hour work day plus a 1-hour break:
- Queue hours, plus any training already in the sheets, count toward the 8 hours.
- The remaining time becomes **Planned training**, starting at the last recorded end time. Its target is 60 per hour, so units = 60 × training hours, productivity = 60/h and variance = +0%.
- The **Break** starts when training ends. If no training is needed, it starts at the last recorded time.
- Example: queues end at 10:21 → Planned training 10:21–15:00 → Break 15:00–16:00 → 9h day.
- If a day has rows without a duration or conflict rows left out, the gap can't be measured, so no training is added and a note explains why.
- Planned training units are not added to the day's task units.
- Change the hours, target or labels in `shift` in `config.js`, or set `shift: null` to switch the rule off.

**Below target (manager view).** A person is below target when at least one workflow has a negative variance. If a row has a target and productivity but no variance, the variance is calculated and marked. People who only appear in the workflow logs show **No target recorded**. Planned training and break are not part of the check.

## Files

| File | Purpose |
|---|---|
| `index.html`, `app.js` | Employee view |
| `manager.html`, `manager.js` | Manager view |
| `loader.js` | Shared: Google sign-in, reading the sheet, Excel demo loading, Sources panel. **Both pages need it.** |
| `core.js` | All calculations: parsing, duplicates and conflicts, source selection, shift rule, team summary. No page or network code. |
| `config.js` | Spreadsheet ID, client ID, tab names, column headers, date rules, shift rule |
| `styles.css` | Styles for both pages (light and dark mode) |
| `SETUP.md` | Google Cloud setup, tab and date details, troubleshooting |
| `tests/run-tests.js` | Automated tests for every rule, using made-up data |

Keep all files in the same folder.

## Common changes (all in `config.js`)

- **New month's PRS tab:** copy the `July PRS` line in `sources` and change `sheet` (and `dateRule` if its dates look different).
- **Different spreadsheet:** change `google.spreadsheetId` (the part of the URL between `/d/` and `/edit`).
- **Renamed column or tab:** update that source's `columns` or `sheet`, or add the other spelling to `aliases`.
- **Different shift length, break or training target:** edit `shift`.

## Tests

```bash
node tests/run-tests.js
```

Runs every rule against made-up data and prints PASS/FAIL. It needs Node.js only and no real data. Run it after changing `core.js` or `config.js`.

## Privacy and access

- Each user signs in with their own Google account and can only load the sheet if it's shared with them. Access is read-only, and the app can't change the sheet.
- The sign-in token is kept in memory only and is cleared on **Disconnect** or when the page closes.
- Excel files are read inside the browser and never uploaded.
- The manager page has **no separate login**. Anyone who can open it and has access to the sheet sees everyone's results. To restrict it, host `manager.html` where only managers can reach it, or limit who the full sheet is shared with.

## Troubleshooting

See the table at the end of **[SETUP.md](SETUP.md)**. The most common issues:

- **Nothing happens when loading:** a file is missing from the folder, or the browser is using cached old files. Copy all files in and reload with Ctrl+Shift+R. The page now names any missing file.
- **"Access blocked / no registered origin":** add the exact page address (e.g. `http://localhost:8000`) to Authorized JavaScript origins in Google Cloud.
- **"Not in this workbook, skipped: …":** those tabs weren't found. The rest still loads. Fix the tab names in `config.js` if they should be there.