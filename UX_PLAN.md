# CareLoop UX refinement

Branch: `refine-ux`

Goal: make daily care easy to scan and record, with substantial improvements to hierarchy and phone use. Keep the existing scheduling, local storage, corrections, and backup protections.

## Implementation

1. Rebuild Today around the next pending task, attention items, remaining tasks, and completed records. Show recorded completion instead of an adherence score.
2. Put Today, Plan, and Care Team first. Group setup, the 30-day record, and settings under More. Keep every destination accessible on phones and by keyboard.
3. Guide setup through instructions, editable review, and a schedule preview with explicit saving. Backing out must preserve the saved plan.
4. Replace timeline dots with medication groups by time. Explain food and spacing beside each medicine; collapse the detailed rules and demonstration tools.
5. Use readable task rows for the 30-day record and simple caregiver summaries. Remove pitch content from the care experience.
6. Consolidate the visual styles: calm navy/teal, readable type, fewer cards, clear status labels, and comfortable touch targets.

## Verification

Run unit, browser, release, records, upgrade, build, and formatting checks. Add focused browser coverage for preview cancellation, Today recording/corrections, and mobile navigation. Inspect desktop and phone screenshots using fictional data.

## Delivered

All six implementation steps are complete. The core scheduling and record modules are unchanged. No new runtime dependencies, accounts, or external services were added.

Verified: 47 unit tests; source browser flows; built release and offline use; records, corrections, encrypted recovery and concurrent edits; legacy upgrade; focused UX flows; formatting and build. Desktop and phone screens were visually reviewed. Responsive checks cover 320px, 390px, 768px, and desktop widths.
