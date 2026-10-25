# CareLoop — bedside edition

One patient, one tablet, one locally saved care record. This repository is being converted in separate commit stages. **Stages 1 and 2 are complete: local storage, account removal, and the bedside interface.** Offline installation and final recovery/privacy checks are still to come.

## Run locally

Use Node.js 22.13 or newer:

```sh
npm start
```

Open **http://127.0.0.1:3000**. Set up the patient’s nickname, plan start date, time zone, routine times, and optional caregiver names. There is no sign-in. Load the fictional example from Care plan to try the workflow.

No runtime dependencies need installing. For formatting and development checks, run `npm ci` first.

## Where the data goes

- Setup, caregiver names, care plans, task records, and activity history live in **IndexedDB in this browser on this device**.
- The Node server serves only app files. It has no database, cookies, sign-in endpoints, care-data API, or upload handler. POST requests are rejected.
- Schedule calculation, document parsing, calendar generation, and backup generation all run in the browser.
- A successful save is shown only after the local database transaction commits. A failed save leaves the form open and shows an error.
- Changes in another tab are announced locally with BroadcastChannel. Transaction version checks prevent stale edits from overwriting saved records. This is not remote synchronization.
- A different browser, browser profile, tablet, host name, or port has a separate record. Keep using the same address. Private browsing, clearing site data, or browser eviction can remove the record.
- Anyone who can open this browser can access the record. Caregiver names are self-reported labels, not authenticated identities. Use the tablet’s screen lock.

The app does not upload care data, run third-party analytics, or send instructions to external AI services. The static host can still receive ordinary requests for app files. Exported files, device/browser backups, and external calendar services are separate copies outside the app’s local record.

## What Stage 1 includes

- Account-free first-time bedside setup, followed by opening directly to Today.
- Local patient profile and caregiver list, including add, rename, and remove.
- Separate task assignment and “Recorded by” labels, with a snapshot of the recorder’s name preserved in completion history.
- Local plan publication, actual completion and skip times, weight and symptom entries, corrections, and activity history.
- Existing conservative parser, meal rules, named medication spacing, exact intervals, impossible-schedule rejection, date/time-zone checks, and history preservation.
- Client-generated calendar export and a plain-text bedside backup format (`careloop-bedside-1`). Restoring validates data before replacing the record. Backups include caregivers and activity history.
- Local reset removes the active profile, caregivers, plan, tasks, and activity. It does not delete downloaded files or a previous server database.

Calendar export asks before creating a file. Importing that file into a cloud calendar can copy care details outside this device. It is a snapshot; changes do not synchronize into previously imported events.

Page notifications still require an open, awake page and browser permission. They do not guarantee alerts when the tablet is locked or the browser is closed.

## What Stage 2 includes

- A focused Today screen with a large next-task card, touch-sized recording buttons, separate completed/pending/skipped counts, and recorded entries collapsed below pending tasks.
- Today always uses the patient’s current local date. Other dates are reviewed in Records, with combined date and text filters. Earlier unrecorded tasks are linked separately rather than mixed into today’s progress.
- Four main destinations: Today, Schedule, Records, and Manage care. Plan editing, caregiver changes, reminders, exports, backup/restore, and deletion are reached through Manage care. This is navigation separation, not an access lock.
- A simpler recording dialog with Completed/Skipped choices, required recorder and actual time, optional assignment/notes, and the original instruction available for review. Opening or cancelling the dialog does not complete a task.
- Current-day entries start with the current device time. Past-day entries require an explicitly entered actual time. Corrections preserve their prior values in activity history.
- Skipping a measurement does not require a made-up weight or symptom value; correcting a measurement to skipped clears the current value while retaining the prior value in the audit entry.
- Save errors remain visible inside the recording dialog. Controls are disabled while saving, and competing-tab checks remain in place.
- A 30-second foreground refresh updates Today’s date/time state without interrupting open forms. This does not implement closed-app alarms or offline installation.

## Existing server data

This stage **does not open, migrate, or delete** the previous `data/careloop.sqlite` database. If it exists, it is left untouched and remains ignored by Git. The new app starts a separate bedside record. Previous accounts and their data do not automatically appear in the browser.

The older `careloop-1` server backup format is not accepted as a bedside backup. A deliberate migration/export path can be added in a later stage; do not delete original files if they contain data you want to keep.

## Stage boundaries and commits

1. **Local storage and account removal** — completed in Stage 1. Suggested commit: `feat: move CareLoop to account-free local bedside storage`.
2. **Bedside interaction** — completed in Stage 2. Suggested commit: `feat: simplify bedside recording and separate care management`.
3. **Offline installation** — app manifest, icons, service worker, app-file caching, offline reopening, and persistent-storage status. Not started.
4. **Recovery and privacy verification** — additional backup protection, restore and deletion safeguards, final tablet/offline tests, and accurate privacy/demo copy. Not started.

Pause between stages for the user to commit. The app currently still needs the static server for a fresh load or reload. Offline installation is not implemented in Stages 1 or 2.

## Tests

```sh
npm test
npm run format:check
```

Tests cover the original scheduler, local record mutations, setup validation, caregiver attribution, history preservation, backup validation, stale-write rejection, and removal of server data endpoints. Server tests use a temporary port.

Optional browser checks use Playwright:

```sh
npm install --no-save playwright
npx playwright install chromium
npm run test:browser
```

You can set `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing installation. Browser checks use fresh, isolated browser profiles, fictional data, and the real IndexedDB adapter. They cover reload/reopen persistence, conflicting tabs, transaction rollback, failed-save UI, separate-profile isolation, caregiver entry, recording and skipping, management navigation, current-day/date-filter separation, phone/tablet layouts, and the absence of care-data requests. Screenshots go to ignored `test-results/`.

## Structure

```text
src/domain.js              Parsing, scheduling, task generation, warnings, calendar text
src/bedside.js             Current-day grouping and next-task selection
src/care-record.js         Local record validation, mutation, attribution, backup format
src/server.js              Static development server only
public/storage.js          IndexedDB transactions and same-device change notifications
public/app.js              Interface, local setup, care workflow, file exports
public/style.css           Responsive layout
public/index.html          App entry point
public/sample.txt          Fictional document example
tests/domain.test.js       Scheduler regression tests
tests/bedside.test.js      Date grouping, next-task, and progress regression tests
tests/care-record.test.js  Local record and backup regression tests
tests/server.test.js       Static-server and endpoint-removal tests
tests/browser.mjs          Real-browser workflow and local-storage checks
```

## Configuration

Only `HOST` (default `127.0.0.1`) and `PORT` (default `3000`) are used by the static server. It does not read `.env` automatically. `DATA_DIR` and `SECURE_COOKIES` are no longer used.

This remains a prototype with no clinical validation. Food windows and supported frequency conventions are scheduling assumptions to review against the original paperwork. English text entry is supported; photo import, translations, tapering regimens, as-needed dosing, and closed-app alarms are not implemented.
