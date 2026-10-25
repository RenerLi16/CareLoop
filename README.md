# CareLoop

This repository contains the **blue CareLoop app**: the instructor’s compact six-tab interface, with automatic scheduling, local care records, corrections, caregiver editing, and encrypted backups. Earlier interfaces are available in Git history; no alternate app is kept in this folder.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm ci
npm start
```

Open http://127.0.0.1:3000/. Close tabs running an older CareLoop version before reopening.

## Folder guide

| Folder     | Contents                                                                    |
| ---------- | --------------------------------------------------------------------------- |
| `public/`  | The blue interface, styling, browser controls, and offline worker           |
| `src/`     | Instruction parser, scheduler, care records, encryption, and static hosting |
| `scripts/` | Release build                                                               |
| `tests/`   | Unit and browser checks for this app                                        |
| `dist/`    | Generated release files; recreated by the build and excluded from Git       |

`node_modules/` contains development dependencies. `test-results/` contains generated screenshots from the current tests. Neither is committed to Git.

## Build and publish

```bash
npm run build
```

The build cleans `dist/` and creates two outputs of the **same blue app**:

- **Website:** upload the entire `dist/` folder to an HTTPS static host at the domain root. Its entry point is `index.html`.
- **Standalone copy:** `dist/careloop.html` bundles the app into one HTML file that opens directly from disk.

To preview the built website locally:

```bash
STATIC_DIR=dist npm start
```

Patient records stay in the browser. Different browsers, addresses, and devices do not share a record. Browser storage behavior for local files varies, so use the same browser and address consistently. Check the final HTTPS address on the intended tablet before release.

## Scheduling

Compile schedule and Auto-resolve schedule search for times satisfying the supported instructions. They preserve doses and prescribed rules, explain moved times, and block saving if a solution is not found.

- Named spacing applies to the specified medicine. A spacing value without a target explicitly applies to all other medicines.
- Exact 6-, 8-, and 12-hour instructions use elapsed time through midnight and daylight-saving changes. The 30-day plan shows the actual local times on each date.
- Breakfast, lunch, and dinner default to 08:00, 12:00, and 18:00 and can be reviewed under Meal times.
- Supported assumptions: with food means within 30 minutes; before/after food means 15–60 minutes; morning is 08:00 and bedtime is 22:00. Ordinary twice/three-times-daily plans use daytime slots at least four hours apart. Review these assumptions against the written instructions.
- Food and spacing rules are rechecked across the dated plan. Clock-change conflicts block saving. Search uses 15-minute slots and a bounded search; failure does not establish that a prescription is impossible.
- Rebuilding preserves records. Changes around a medicine already recorded today require review rather than automatic dose compensation.
- Try a conflict example is a separate preview and never changes the saved plan.

The reader handles structured English lines. Unsupported wording remains for review. Paragraph understanding, photo reading, translation, calendar export, and remote sharing are not included. Follow-ups represent booking deadlines.

## Records and backups

- **Read Discharge:** reopen the saved plan and pasted text, or explicitly discard a draft with Reopen saved plan.
- **Today / 30-Day Plan:** record the actual time and local recorder name. Future-day tasks and future timestamps are blocked. Corrections require a reason and retain previous values. Opening an unchanged entry does not rewrite its timestamp.
- **Care Team:** add, rename, or remove local caregiver labels. Historical recorder names are preserved; future pending assignments from removed caregivers become unassigned.
- **About:** save an encrypted backup, review and restore a backup, or explicitly confirm deletion. Keep the backup passphrase separately; CareLoop cannot recover it.

Records are JSON in localStorage under `careloop_instructor_resolver_v1`. Saves use a browser Web Lock and revision checks so updated tabs and stale forms cannot overwrite newer changes. Deletion retains an empty revision marker to prevent stale updated tabs from restoring deleted data.

Safe saving requires Web Locks; backup encryption requires Web Crypto. Use a supported current browser with HTTPS, localhost, or the standalone file. Unsupported saving environments report an error. Clearing browser data can delete records; downloaded backups are separate copies. The app does not use a care-data server, account system, or remote database.

CareLoop checks supported entered rules. It is not a drug-interaction database or clinically validated dosing tool. It does not compensate for missed doses or advise the next dose. Sample data is fictional.

## Verify

```bash
npm test
npm run build
npm run test:browser
npm run test:release
npm run test:records
npm run test:upgrade
npm run format:check
```

Browser checks use isolated profiles and fictional records. Set `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when using an existing Playwright installation. They cover the source app, built website, standalone copy, offline operation, persistence, concurrent writers, actual-time entry, corrections, clock changes, caregiver editing, encrypted recovery, stale restores, deletion, and upgrading from the retired green app with multiple tabs open.

When replacing the retired green app, the offline worker activates without waiting for all old tabs to close. Reload a CareLoop tab to open the blue app. This removes only old application-file caches; localStorage and IndexedDB records remain. Later blue-app updates wait for open tabs to close so unfinished entries are not interrupted.
