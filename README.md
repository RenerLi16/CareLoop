# CareLoop

A restart from the instructor’s `careloop.html`, preserving its six tabs, compact cards, tables, and single timeline. The original file under Documents is untouched. The previous app’s source is preserved in `archive/bedside-app/`; it is not served by this app.

## Run

```bash
npm install
npm start
```

Open http://127.0.0.1:3000/. Close previous CareLoop tabs and reopen if the old offline app is still visible.

```bash
npm run build
```

This produces `dist/careloop.html`, a standalone version that opens directly from disk without a server or internet connection. Browser storage can behave differently for local files; use the same browser and address for a persistent record.

## Automatic resolution

The existing Compile schedule and Auto-resolve schedule controls search for times that satisfy supported medication rules together. Dose amounts and entered rules are never changed. The schedule displays brief before/after explanations for moved times. An impossible plan or search-limit failure does not replace the saved plan.

- Named spacing targets stay specific to that medication. A gap with no target explicitly means all other medications.
- Exact 6-, 8-, and 12-hour intervals are preserved across midnight.
- Meal times can be reviewed in the existing instructions screen: defaults are 08:00, 12:00, 18:00. With food uses a 30-minute window; before/after food uses a 15–60-minute window. Morning and bedtime are fixed at 08:00 and 22:00. These are supported scheduling assumptions to check against the written instructions, not clinical recommendations.
- Ordinary twice/three-times-daily schedules use 07:00–21:00 slots at least four hours apart; exact interval instructions use the full 24-hour day.
- Search uses 15-minute slots and is bounded. Failure means no solution was found within supported slots and search bounds, not that a clinician’s prescription is impossible.
- The conflict example is a separate preview. It never changes the saved schedule or completion records.
- Recompilation preserves recorded tasks and pending assignments. Removed/changed recorded tasks remain in the local JSON history field.
- Actual recorded timing conflicts prompt record review and contact with the care team. The app does not compensate for missed/late doses or advise the next dose.

The line-based English reader remains limited; general paragraph understanding, OCR, translations, and remote sharing are not implemented. Unreadable medication lines are surfaced for manual review. It never substitutes sample medication into real input. Follow-up tasks represent booking deadlines.

## Local data

The new record is JSON in localStorage under `careloop_instructor_resolver_v1`. Previous instructor records (`careloop_v2`) and the previous app’s IndexedDB records are left untouched. There are no sign-ins, care-data APIs, or uploads. Clearing browser storage can delete the record. The active restart does not include the previous app’s backup interface, calendar interface, or other extra pages.

CareLoop checks only entered supported rules. It is not a drug-interaction database or clinically validated dosing tool. Sample data is fictional. A “resolved” result does not establish clinical safety.

## Checks

```bash
npm test
npm run test:browser
npm run format:check
```

Browser checks use fictional records and isolated profiles. Set `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Playwright installation. Tests for the former app remain archived and are not part of this restart’s test commands.
