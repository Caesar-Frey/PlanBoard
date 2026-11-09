# Milestone 6 — Inspiration library: progress

Resumable checklist. On resume: read this file and `git log`, continue at the first unchecked step.

## Chunks

- [x] (a) Pure filter / coincidence / search logic (`shared/inspiration.ts`) + db snapshot query (`main/db/inspiration.ts`), TDD — 46 new tests (filters incl. Both agree, coincidence in houses with tie-breaks, search, removed photos left out). 391 green.
- [x] (b) IPC channel + typed preload (`getInspiration`) — `IPC.getInspiration`, handler in `main/ipc.ts` returns `Result<InspirationSnapshot>`; no request body to check.
- [x] (c) Library screen layout + rail (scope, rooms, marked as, person) + grid of cards — `inspiration/LibraryView.tsx`, `LibraryRail.tsx`, `LibraryGrid.tsx`; replaces the Placeholder. Checked in the built app (scratch profile): Kitchen → Island 2 photos; + Must-have + Both agree → 1 (Franschhoek); House scope groups by house; Detail hides rooms.
- [x] (d) "Where they coincide" banner + search — `inspiration/CoincideBanner.tsx`, search pill (Cmd+F focuses it). In the app: Kitchen → "Island appears in 2 of 3 houses, most often paired with kitchen island (1) and open shelving (1)."; "farm table" finds Thandi's note; "zzz" → empty state + Clear filters.
- [x] (e) Detail panel (large photo, tagging panel reuse, "Same feature in", listing links) — `inspiration/LibraryDetail.tsx` reuses `TaggingPanel`. In the app: Franschhoek kitchen → Same feature in Constantia (Island), clicking it selects that photo; tag "Stacker doors", mark Nice and a note made in the panel show on the card and in the db; a photo marked removed in the db drops out (15 → 14); Open listing goes to the listing view.
- [ ] (f) Verification in the built app + CLAUDE.md "Where things live" + README Library row and screenshot

## Decisions

- One snapshot load (`loadInspiration`): every live photo with house, room, tags, marks, notes. Filtering, counts, coincidence and search run in the renderer on it (pure `shared/inspiration.ts`), so filters feel instant and the logic is unit-tested without Electron.
- Scope: **House** = one card per listing (its matching photos grouped); **Room** = photo cards in the chosen room; **Detail** = photo cards for a feature across all rooms (the room filter is ignored).
- Person filter: Everyone / Me / Partner / Both agree. "Picked by" a person = they tagged, marked or wrote a note on the photo. With a tag chosen, only that person's own tag counts; with marks chosen, only their own mark counts. Both agree = true for both people.
- Marked-as filter is multi-select (Must-have / Nice / Maybe); none chosen = no mark filter.
- Rail counts are facets: room counts ignore the room choice, tag counts ignore the tag choice, everything else applies.
- Coincidence: focal tag = the chosen tag, else the tag in the most houses in view (ties: more photos, then A–Z). Pairs counted in houses that have a photo carrying both tags; ranked houses, then photos, then A–Z. Denominator = houses that still have photos.
- Search: every word must appear in the photo's notes (both people), tags, room, or its house's suburb or city; ignores case and accents; "kitchens"/"benches" find "kitchen"/"bench". The house's "Why we saved" note is not searched (it would match every photo of that house).
- House names: suburb, else title, else `P24-123`; two houses with the same name get ` · P24-123` added.

- Feature chips sit under the title in the main column (as in the mockup) rather than in the rail; the rail keeps scope, rooms, marked as and person. More than 14 features fold behind "All features (N)".
- Person filter buttons show the two names (with swatches) instead of the words Me/Partner; screen readers hear "(me)"/"(partner)".
- Grid shows 60 cards at a time with "Show more".
- Search sits at the top of the library's main column (the header already holds "Tagging as").

- With no feature chosen, the banner describes the most shared feature in view ("Most shared feature") with a "Show <tag>" button; with one chosen it reads "Where they coincide".
- Detail panel order: photo, house + Open listing (in-app listing view) / Original listing ↗ (browser), "Same feature in" (other houses sharing any of this photo's tags, most shared first; click selects that house's photo), then the milestone-5 tagging panel for edits. Below 1180px wide it becomes a right-hand drawer.

## Notes

- `.gitignore` ignores every folder called `library/` (to protect the user's library), so the renderer folder is `src/renderer/src/inspiration/`, not `library/`.
