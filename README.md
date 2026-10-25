# CareLoop

A shared care planner for the first 30 days after discharge. This is a modular rebuild of the supplied single-file prototype, with a browser interface, a Node server, and a persistent SQLite database.

## Run locally

Requires **Node.js 22.13 or newer** with `node:sqlite` support. There are no runtime packages to install.

```sh
npm start
```

Open **http://127.0.0.1:3000** and create an account. Accounts require a password of at least 12 characters. Start a care plan, paste discharge text or load the fictional example, review every medication and unsupported instruction, check the schedule, and publish. Node 22 may print an experimental SQLite notice; this does not prevent startup.

Use fictional data while evaluating the app. This implementation has not received clinical validation, an independent security review, or caregiver usability testing.

## What works

- Conservative English-text import; no invented patient medications or guessed frequencies when reading fails.
- Source text retained beside medication review fields; unsupported wording remains visible for explicit review.
- Editable medication names, doses, frequencies, food rules, named spacing partners, and start/stop dates.
- Custom breakfast, lunch, dinner, morning, and bedtime anchors.
- A bounded backtracking scheduler that checks all entered pair constraints together, enforces food windows, and preserves exact interval groups. An unresolved schedule cannot be published.
- Date-specific checks reject nonexistent local times and daylight-saving transitions that would break an exact interval or spacing requirement. These cases require manual review rather than silently changing instructions.
- 30-day task generation; booking deadlines distinguished from confirmed appointment times.
- Weight amounts and units, symptom entries, actual completion/skip times, notes, assignment, and corrections.
- Past-due tasks, entered spacing violations, and duplicate-log review prompts. A duplicate-log prompt is not a clinical dosing threshold.
- Completed and skipped records retained when a plan changes; superseded pending tasks archived. Existing assignments survive schedule edits.
- Owner, editor, and viewer accounts; expiring, single-use invitation links; access removal and role changes. Invitations currently create **new accounts** in one care team per account. Share invitation links privately; the server sends no emails.
- Shared updates polled every five seconds, with version checks to prevent stale writes from overwriting another caregiver's change.
- Activity history with before/after task data stored on the server.
- Password changes invalidate other sessions.
- Calendar export with UTC event times and 15-minute alarms; optional browser notifications while the page is open and awake.
- Owner-only backup download, validated restore, and active care-data deletion.
- Responsive phone and desktop layouts, keyboard-accessible controls, escaped user content, and visible status messages.

## Supported scheduling semantics

These are software conventions, not medical recommendations. Users must check them against the original instructions.

| Input                         | Behavior                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Once daily                    | One daytime slot, preferring the morning anchor                               |
| Twice / three times daily     | Two / three daytime slots, at least four hours apart, preferring meal anchors |
| Every 6 / 8 / 12 hours        | A complete group with exact intervals, including overnight doses              |
| In the morning / at bedtime   | Fixed at the selected routine anchor                                          |
| With food                     | Within 30 minutes of a selected meal                                          |
| Before food                   | 15–60 minutes before a selected meal                                          |
| After food                    | 15–60 minutes after a selected meal                                           |
| At least N hours apart from X | Applies only to the named medication pair, across daily boundaries            |

The solver uses a 15-minute grid and a finite search budget. Failure means it could not find a plan within the supported model; it does not prove no medically appropriate arrangement exists. Tapers, as-needed medication, alternating days, changing doses, and other unsupported instructions are not automatically scheduled. At most 15 medications are accepted.

Import expects a `MEDICATIONS` heading and one medication per line, for example:

```text
MEDICATIONS
Example A 10 mg in the morning
Example B 5 mg once daily, at least 2 hours apart from Example A
FOLLOW UP
Primary care in 7 days
```

Drug and dose text remains as entered. Source-specific phrases that the parser cannot model require manual correction and acknowledgement. The user must explicitly enable any monitoring tasks requested in the paperwork.

## Reminders and sharing

The calendar file is a **snapshot**, not a live subscription. Check the receiving calendar's notification settings. If the plan changes, remove the old imported calendar before importing its replacement. Browser notifications stop when the page closes or the device sleeps.

The default server address is accessible only on this computer. To use different phones, host one shared server at an HTTPS address with persistent storage. Opening separate copies creates separate records. This repo does not provision hosting, email, SMS, push delivery, or calendar-provider integrations.

## Configuration and hosting

| Variable         | Default     | Purpose                               |
| ---------------- | ----------- | ------------------------------------- |
| `PORT`           | `3000`      | Server port                           |
| `HOST`           | `127.0.0.1` | Listening address                     |
| `DATA_DIR`       | `./data`    | SQLite database directory             |
| `SECURE_COOKIES` | unset       | Set to `true` for an HTTPS deployment |

For hosting, place the Node process behind an HTTPS reverse proxy that preserves the external Host header, set `SECURE_COOKIES=true`, bind to the appropriate internal interface, and mount a persistent private data directory. Run one server process for this SQLite deployment. Restrict access to database files and backups, use encrypted storage, and arrange tested server backups and monitoring. Database contents and downloaded JSON backups are not encrypted by the application.

Passwords are salted with scrypt. Session tokens are random, hashed in the database, and delivered in HttpOnly, SameSite=Strict cookies. Mutations enforce same-origin requests when an Origin header is supplied. The app includes a restrictive content security policy, per-team authorization, bounded input sizes, and a basic process-local sign-in rate limit. This does not replace an independent security review before real patient use. There is no email verification or forgotten-password recovery service yet.

Deleting care data removes the active plan, tasks, invitations, and old activity, leaving team accounts and one deletion activity entry. External calendar copies, downloaded files, and administrator backups require separate deletion. Account deletion and multi-team membership are not implemented.

## Tests

```sh
npm test
```

The built-in test suite covers parsing failures, review gates, named spacing, food timing, exact intervals, impossible plans, durations, history preservation, actual-time warnings, daylight saving, calendar formatting, authentication, roles, invitation reuse, competing writes, backup/restore, deletion, and cross-origin requests. Integration tests start a temporary server with a temporary database and remove it afterward.

Browser regression checks use Playwright as an optional development tool:

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/browser.mjs
```

Set `PLAYWRIGHT_MODULE` or `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing installation. The checks exercise account creation, import, review, publication, task logging, a second caregiver joining, shared records, search, and phone-width overflow. Screenshots are written to ignored `test-results/`.

## Project structure

```text
src/domain.js          Pure parsing, validation, scheduling, tasks, warnings, calendar export
src/server.js          HTTP API, authentication, permissions, SQLite persistence
public/app.js          Browser interface and shared-record refresh
public/style.css       Responsive layout and visual system
public/index.html      App entry point
public/sample.txt      Explicitly fictional import example
tests/domain.test.js   Scheduling and data-model regression tests
tests/server.test.js   End-to-end API and permission tests
tests/browser.mjs      Browser workflow and layout checks
```

## Remaining work before broader use

- Clinical review of the supported timing conventions and warning behavior, followed by caregiver usability testing.
- Hosting, operational backups, security/privacy review appropriate to the actual deployment, and account recovery/deletion.
- Professionally reviewed translations. The rebuilt interface currently supports English; it does not advertise incomplete Spanish or Vietnamese coverage.
- Optional image/PDF text recognition with mandatory human verification. Screenshot import is not implemented.
- Optional live calendar synchronization and reliable hosted push reminders.

No competition submission, deployment, or real patient-data import is performed by this repository.
