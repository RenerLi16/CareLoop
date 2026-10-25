# CareLoop — bedside edition

One patient, one tablet, one locally saved care record. This repository is being converted in separate commit stages. **All four planned implementation stages are complete.** The app uses on-device records, a bedside interface, offline support, and protected backup/recovery. Physical-tablet installation and clinical/user validation remain separate checks.

## Run locally

Use Node.js 22.13 or newer:

```sh
npm start
```

Open **http://127.0.0.1:3000**. Set up the patient’s nickname, plan start date, time zone, routine times, and optional caregiver names. There is no sign-in. Load the fictional example from Care plan to try the workflow.

No runtime dependencies need installing. For formatting and development checks, run `npm ci` first.

## Current full-feature interface

The reduced three-screen mockup has been retired. Use the working app at **http://127.0.0.1:3000**. The old preview on port 3001 only links to the full app and does not hold the care record.

Every main workflow is directly available in navigation:

| Destination    | What works                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today          | Next task, completion/pending/skipped counts, timing warnings, past-due tasks, and entered clinician instructions                                                       |
| Read discharge | Paste discharge text, load the fictional example, or enter manually; review editable medicines, timing rules, monitoring, follow-ups and warnings; save the 30-day plan |
| Daily schedule | A date-specific time diagram, a readable task agenda, medicine rules, schedule rebuilding, and a separate timing-conflict example                                       |
| 30-day plan    | A 30-date selector, individual-day or all-days task tables, status/caregiver filters, direct assignment, completion and skipping                                        |
| Care team      | Add, rename and remove names; assigned task counts, completion rate, active days, relative workload and unassigned tasks                                                |
| Calendar       | Monthly calendar, selected-day agenda and calendar-file download with 15-minute reminders                                                                               |
| Records        | Search, filter previous dates, correct records and view activity history                                                                                                |
| Settings       | Offline installation/status, reminders, encrypted backup, reviewed restore and deletion                                                                                 |

The original HTML’s useful workflows are retained. The original language dropdown only saved a preference; it did not translate the rendered screens. This version continues to describe its interface as English-only. It does not add photo import or unsupported medical rules.

The timing-conflict example is deliberately isolated: it shows a named spacing violation without changing the saved plan or generating rule-breaking patient tasks. Rebuilding the actual schedule preserves completed records.

Suggested commit for this interface update: `feat: restore full care workflows with direct navigation`.

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
- Client-generated calendar export and a bedside record format (`careloop-bedside-1`). Stage 4 wraps new backup downloads in encryption; older plaintext bedside backups can still be reviewed and restored. Backups include caregivers and activity history.
- Local reset removes the active profile, caregivers, plan, tasks, and activity. It does not delete downloaded files or a previous server database.

Calendar export asks before creating a file. Importing that file into a cloud calendar can copy care details outside this device. It is a snapshot; changes do not synchronize into previously imported events.

Page notifications still require an open, awake page and browser permission. They do not guarantee alerts when the tablet is locked or the browser is closed.

## What Stage 2 includes

- A focused Today screen with a large next-task card, touch-sized recording buttons, separate completed/pending/skipped counts, and recorded entries collapsed below pending tasks.
- Today always uses the patient’s current local date. Other dates are reviewed in Records, with combined date and text filters. Earlier unrecorded tasks are linked separately rather than mixed into today’s progress.
- The initial Stage 2 interface used four main destinations: Today, Schedule, Records, and Manage care. The full-feature update above supersedes that navigation. Plan editing, caregiver changes, reminders, exports, backup/restore, and deletion are reached through Manage care. This is navigation separation, not an access lock.
- A simpler recording dialog with Completed/Skipped choices, required recorder and actual time, optional assignment/notes, and the original instruction available for review. Opening or cancelling the dialog does not complete a task.
- Current-day entries start with the current device time. Past-day entries require an explicitly entered actual time. Corrections preserve their prior values in activity history.
- Skipping a measurement does not require a made-up weight or symptom value; correcting a measurement to skipped clears the current value while retaining the prior value in the audit entry.
- Save errors remain visible inside the recording dialog. Controls are disabled while saving, and competing-tab checks remain in place.
- A 30-second foreground refresh updates Today’s date/time state without interrupting open forms. This does not implement closed-app alarms or offline installation.

## What Stage 3 includes

- A home-screen manifest, app icons, Apple touch icon, and standalone display metadata.
- A service worker that downloads every required app file before reporting **Ready for offline use**. Patient data, backups, exports, arbitrary URLs, and query strings are not added to the app-file cache. Care records stay in their separate IndexedDB database.
- A status screen under **Settings**, with offline readiness, installation instructions, and browser-reported storage protection.
- An explicit storage-protection request. The browser may decline or not support it. A grant reduces automatic eviction; it does not prevent deliberate site-data clearing, device loss, or deletion.
- Content-hashed app-file versions. An update installs into a separate cache and waits until all CareLoop tabs/windows close. It does not force-refresh a recording form or an unsaved plan draft. Old app caches are removed after activation; the care database is not part of this cleanup.
- A static build (`npm run build`) that packages the app into `dist/`, without the old server database, accounts, or source server.

### Installing on a tablet

1. Open the app at a trusted **HTTPS address** and finish loading it. Localhost/127.0.0.1 are supported for development on the computer running the server. An ordinary HTTP LAN address does not provide offline installation support.
2. Open **Settings**. Wait for **Ready for offline use**.
3. Use **Install CareLoop** if offered, or the browser’s **Install app / Add to Home Screen** menu. On iPad/iPhone, use Safari’s Share menu → Add to Home Screen. Browser/OS installation options vary.
4. Open the home-screen app and check its saved record before relying on it. Test airplane mode, closing/reopening, and restarting the actual tablet. Installation may use a different browser/storage container on some platforms; install before entering important data, or use a private backup/restore to move the record if necessary.

The app files must be downloaded once. After offline readiness, the same browser/profile/address can reopen and record care while offline. Clearing site data or losing the device can still remove records and cached app files. Offline support does not provide alarms while the device is locked or the app is closed.

Sources for platform behavior: [MDN installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [MDN persistent-storage requests](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist), and [Chrome service-worker lifecycle](https://developer.chrome.com/docs/workbox/service-worker-lifecycle).

### Building for static HTTPS hosting

```sh
npm run build
```

Publish the **contents of `dist/` at the host’s root**. Do not publish the raw `public/` folder: the build includes shared modules and generates the versioned service worker. No patient record is included in this build. A host can still log ordinary app-file requests; do not put patient details into URLs.

The host must serve JavaScript and the manifest with the correct MIME types, allow `/sw.js` to control `/`, and revalidate `sw.js` rather than keeping an indefinitely stale HTTP cache. The included Node server sets these headers. You can preview the built folder with `STATIC_DIR=dist npm start`.

After changing app files, rebuild and deploy the full folder together. Existing open windows keep their installed version. Finish any unsaved work, close all CareLoop windows, and reopen to activate a downloaded update.

## What Stage 4 includes

- **Encrypted backup downloads by default.** Choose and repeat a passphrase of at least 12 characters. The file is encrypted on the device using browser-native AES-256-GCM with a random 16-byte salt, a random 12-byte IV, PBKDF2-HMAC-SHA-256 at 600,000 iterations, and an authentication tag. Its outer envelope contains no patient name, dose, or care history.
- The passphrase is not saved in the care database, app cache, or a server. Keep it separately; a lost passphrase cannot be recovered. This protects the exported file only. The working IndexedDB record is not separately encrypted by CareLoop and the app still has no sign-in.
- Restore accepts protected files (`careloop-protected-1`) and legacy plaintext bedside files. It validates the unlocked data, shows the backup and current-record summaries, and requires acknowledgement plus typing `RESTORE` before replacement.
- Restore works from first-time setup as well as Device and data. A newer change in another tab blocks replacement, requiring a fresh review. Wrong passphrases, file corruption, invalid measurements, and unsupported formats cannot silently replace the record.
- Deletion shows the current patient and record counts, offers an encrypted backup first, and requires acknowledgement plus `DELETE`. It clears the active profile, caregivers, care tasks, and activity, leaving only an empty version marker for conflict protection. Other tabs close stale recording forms. Downloaded files, external calendars, old server data, device backups, and recoverable disk blocks are outside this deletion.
- Reminder notifications contain a generic message rather than patient or medication details. Calendar export remains an explicit separate action because calendar files include care details.
- Browser regressions verify encrypted downloads and offline exports, reviewed recovery on fresh setup, cancellation, competing-tab changes, deletion, cache contents, and no care-data upload requests.

The exported file format is versioned and rejects unexpected encryption settings before key derivation. File bounds are 5 MB for the unlocked payload and 7 MB for the protected JSON file. Only new encrypted backup downloads are offered by the app; it does not fall back to plaintext when encryption is unavailable.

The implementation follows browser [Web Crypto key derivation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey) and authenticated encryption patterns. These are implementation details, not a claim of an independent security audit or clinical validation. See [PRIVACY.md](PRIVACY.md) for the data-handling statement.

## Existing server data

This stage **does not open, migrate, or delete** the previous `data/careloop.sqlite` database. If it exists, it is left untouched and remains ignored by Git. The new app starts a separate bedside record. Previous accounts and their data do not automatically appear in the browser.

The older `careloop-1` server backup format is not accepted as a bedside backup. There is no automatic server-data migration. Keep original files if they contain data you want to preserve; do not confuse them with the compatible `careloop-bedside-1` plaintext exports from Stages 1–3.

## Stage boundaries and commits

1. **Local storage and account removal** — completed in Stage 1. Suggested commit: `feat: move CareLoop to account-free local bedside storage`.
2. **Bedside interaction** — completed in Stage 2. Suggested commit: `feat: simplify bedside recording and separate care management`.
3. **Offline installation** — completed in Stage 3. Suggested commit: `feat: add offline installation and device storage status`.
4. **Recovery and privacy verification** — completed in Stage 4. Suggested commit: `feat: protect backups and harden local recovery safeguards`. Automated checks pass; physical-tablet checks remain manual.

Pause between stages for the user to commit. Stage 3 supports reopening after offline readiness without a running server; initial installation and downloading updates still need the app host. The four planned code stages are complete. Use the manual tablet checks below before relying on an installed device.

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
npm run test:offline
npm run test:recovery
npm run test:features
```

You can set `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing installation. Browser checks use fresh, isolated browser profiles, fictional data, and the real IndexedDB adapter. They cover reload/reopen persistence, conflicting tabs, transaction rollback, failed-save UI, separate-profile isolation, caregiver entry, recording and skipping, management navigation, current-day/date-filter separation, phone/tablet layouts, and the absence of care-data requests. The dedicated offline regression uses a persistent temporary browser profile: it records with networking disabled, stops the actual test server, restarts the browser, reopens the saved record offline, and checks waiting updates without losing a draft. Storage-permission grant/denial UI branches are simulated; actual device installation and permission behavior still need manual tablet testing. Screenshots go to ignored `test-results/`.

## Structure

```text
src/domain.js              Parsing, scheduling, task generation, warnings, calendar text
src/bedside.js             Current-day grouping and next-task selection
src/plan-views.js          Thirty-day summaries, timelines, calendar and caregiver loads
src/care-record.js         Local record validation, mutation, attribution, backup format
src/file-protection.js     Versioned AES-GCM backup protection and unlocking
src/server.js              Static development server only
src/static-app.js          Static asset list, versioned worker generation, build helper
scripts/build.mjs          Build the deployable dist/ folder
public/storage.js          IndexedDB transactions and same-device change notifications
public/recovery.js         Reviewed backup, restore and deletion dialogs
public/offline.js          Offline readiness, installation and storage-permission UI
public/sw.js               Worker template; build/server supplies version and asset list
public/manifest.webmanifest Home-screen installation metadata
public/icons/              App icons and editable SVG source
public/app.js              Interface, local setup, care workflow, file exports
public/style.css           Responsive layout
public/index.html          App entry point
public/sample.txt          Fictional document example
tests/domain.test.js       Scheduler regression tests
tests/bedside.test.js      Date grouping, next-task, and progress regression tests
tests/care-record.test.js  Local record and backup regression tests
tests/server.test.js       Static-server and endpoint-removal tests
tests/browser.mjs          Real-browser workflow and local-storage checks
tests/offline.test.js      Worker, manifest, asset allowlist and build tests
tests/offline-browser.mjs  Persistent-profile offline and waiting-update checks
tests/file-protection.test.js  Encryption and tamper/wrong-passphrase checks
tests/recovery-browser.mjs Backup, restore, deletion and privacy browser checks
tests/full-features-browser.mjs Full instructor-style workflow and layout checks
tests/plan-views.test.js    Calendar, timeline, workload and isolated-demo checks
```

## Configuration

`HOST` (default `127.0.0.1`) and `PORT` (default `3000`) configure the static server. Optional `STATIC_DIR` serves a built folder instead of source assets. It does not read `.env` automatically. `DATA_DIR` and `SECURE_COOKIES` are no longer used.

This remains a prototype with no clinical validation. Food windows and supported frequency conventions are scheduling assumptions to review against the original paperwork. English text entry is supported; photo import, translations, tapering regimens, as-needed dosing, and closed-app alarms are not implemented.

## Manual tablet checks still to run

Use fictional data for these checks. Browser automation does not prove that every tablet/OS installation behaves the same way.

1. Install from the intended HTTPS address, open the home-screen app, and confirm the expected patient record and time zone.
2. Enable airplane mode, close and reopen the app, record a task, then restart the tablet and verify the saved entry.
3. Export an encrypted backup, verify it exists in Downloads, then restore it on a fresh browser/profile using its passphrase. Confirm that preview, cancellation, and replacement behave as expected.
4. Confirm the browser’s actual storage-protection result. A denial must not be shown as protection granted.
5. Check the bedside controls and recording dialog in portrait and landscape, and verify the device’s screen lock.
6. Use the notification/closed-app limitations as documented; this implementation does not promise alarms while locked or closed.

Clinical review of the supported timing assumptions and caregiver usability testing have not been performed. Optional OCR, translations, background alarms, and migration of older server records remain outside this implementation.

### Instructor layout refresh

The interface follows the instructor HTML’s navy header, horizontal tabs, visible Today statistics, medication review table, daily timeline and timing-rule table, 30-day task table with a date selector, and care-team workload table. Larger touch targets, labelled timeline rows, and contained table scrolling improve readability. Calendar, Records, and Settings retain the existing device-only workflows.

The app remains modular JavaScript. Care records are JSON-compatible structured objects in IndexedDB; no React dependency or data conversion is required. `public/instructor.css` contains the visual layout, while the existing storage, scheduling, recording, and recovery modules remain in use. New screen layouts preserve the current record schema. This copies the instructor’s workflow and visual structure, while retaining corrections to the prototype’s parsing, scheduling, and history handling.
