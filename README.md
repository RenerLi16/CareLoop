# CareLoop

This repository contains the **blue CareLoop app**: the instructor’s compact six-tab interface, with automatic scheduling, local care records, corrections, caregiver editing, and encrypted backups. Earlier interfaces are available in Git history; no alternate app is kept in this folder.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm ci
npm start
```

Open http://127.0.0.1:3000/. Close tabs running an older CareLoop version before reopening.

## Phone and tablet layout

On screens up to 900px wide, the original six tabs stay fixed along the bottom. Tables scroll within their own area when needed, with the first column pinned and a swipe hint. Form controls use larger text and touch targets. Desktop keeps the original top navigation.

The interface uses a locally bundled Manrope variable font (SIL Open Font License in `public/Manrope-OFL.txt`). The build embeds the font in the standalone copy so typography also works offline.

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

## Interface language and schedule labels

The upper-right selector switches the interface between English, Vietnamese, Spanish, Simplified Chinese, and Korean. The preference stays in this browser, separate from care records. Patient names, medicine names, notes, and discharge instructions stay as entered; the instruction reader still accepts structured English. Translations are bundled locally and work offline.

Daily Schedule uses a colored box for each dose and a separate row for each medicine. Completed doses appear at their actual recorded time, alongside their original target. A live current-time line moves across today’s chart. Choose a date to see the saved plan for that day; swipe the timeline horizontally on phones.

Today lists every past-due pending item in a yellow card with its own Mark done button. Next up shows the earliest pending item at or after the current time, including the following day when needed. Upcoming is blue; the five-minute target window is green when the entered timing restrictions also fit.

## Scheduling

Compile schedule and Auto-resolve schedule search for times satisfying the supported instructions. They preserve doses and prescribed rules, explain moved times, and block saving if a solution is not found.

- Named spacing applies to the specified medicine. A spacing value without a target explicitly applies to all other medicines.
- Exact 6-, 8-, and 12-hour instructions use elapsed time through midnight and daylight-saving changes. The 30-day plan shows the actual local times on each date.
- Breakfast, lunch, and dinner default to 08:00, 12:00, and 18:00 and can be reviewed under Meal times.
- Supported assumptions: with food means within 30 minutes; before/after food means 15–60 minutes; morning is 08:00 and bedtime is 22:00. Ordinary twice/three-times-daily plans use daytime slots at least four hours apart. Review these assumptions against the written instructions.
- Food and spacing rules are rechecked across the dated plan. Clock-change conflicts block saving. Search uses 15-minute slots and a bounded search; failure does not establish that a prescription is impossible.
- Recording outside the target window or an entered timing restriction saves the actual event, then opens a conflict review. The preview offers revised times for pending doses, with an explicit Apply or Keep current schedule choice.
- Runtime resolution anchors completed doses at their actual times. It preserves each pending dose, day, caregiver assignment, food and spacing restrictions, and exact elapsed intervals. Past-day overdue tasks stay open for review; it does not invent replacement doses or relax instructions to make a plan fit.
- Runtime search uses five-minute candidate times plus exact interval and spacing boundaries. A bounded search that finds no solution leaves the saved timetable unchanged.
- Editing the prescription after a medicine is already recorded today still requires review. Unchanged rebuilds preserve runtime adjustments and completion records.

The reader handles structured English lines. Unsupported wording remains for review. Paragraph understanding, photo reading, translation of entered care instructions, calendar export, and remote sharing are not included. Follow-ups represent booking deadlines.

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
npm run test:mobile
npm run test:live
npm run test:language
npm run format:check
```

Browser checks use isolated profiles and fictional records. Set `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when using an existing Playwright installation. They cover the source app, built website, standalone copy, offline operation, persistence, concurrent writers, actual-time entry, corrections, clock changes, caregiver editing, encrypted recovery, stale restores, deletion, and upgrading from the retired green app with multiple tabs open.

When replacing the retired green app, the offline worker activates without waiting for all old tabs to close. Reload a CareLoop tab to open the blue app. This removes only old application-file caches; localStorage and IndexedDB records remain. Later blue-app updates wait for open tabs to close so unfinished entries are not interrupted.
