# Milestone 6 — Inspiration library: progress

Resumable checklist. On resume: read this file and `git log`, continue at the first unchecked step.

## Chunks

- [x] (a) Pure filter / coincidence / search logic (`shared/inspiration.ts`) + db snapshot query (`main/db/inspiration.ts`), TDD — 46 new tests (filters incl. Both agree, coincidence in houses with tie-breaks, search, removed photos left out). 391 green.
- [x] (b) IPC channel + typed preload (`getInspiration`) — `IPC.getInspiration`, handler in `main/ipc.ts` returns `Result<InspirationSnapshot>`; no request body to check.
- [ ] (c) Library screen layout + rail (scope, rooms, marked as, person) + grid of cards
- [ ] (d) "Where they coincide" banner + search
- [ ] (e) Detail panel (large photo, tagging panel reuse, "Same feature in", listing links)
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

## Notes
