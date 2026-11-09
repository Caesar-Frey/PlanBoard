# Milestone 5 — Tagging: progress

Resumable checklist. On resume: read this file and `git log`, continue at the first unchecked step.

## Chunks

- [x] (a) Shared rooms/marks + fuzzy tag matcher + db tagging queries (rename/merge), TDD — `shared/tagging.ts`, `shared/tagMatch.ts`, `main/db/tagging.ts`, `main/tagging/service.ts` (service done early; IPC wiring is (b)). 345 tests green.
- [x] (b) Tagging service + IPC + preload typed methods — 7 channels (setPhotoRoom, addPhotoTag, removePhotoTag, savePhotoNote, listTags, renameTag, mergeTags); ListingView photos now carry room, tags, notes.
- [x] (c) Large preview: tagging panel — `tagging/TaggingPanel.tsx`, `tagging/TagInput.tsx` (combobox), `components/useAutosave.ts`. Checked in the scratch app: room, tag create, "kitchen island" → "Island?", Esc closes only the list, → in a field doesn't navigate, marks + notes for both people.
- [x] (d) Grid: room/tag-count/mark indicators + bulk room ("Set rooms for several" mode, Shift-click ranges, sticky bar with room select). Checked in the scratch app: 5 photos set to Bedroom.
- [x] (e) Tag management in Settings → Feature tags (`tagging/TagManager.tsx`): rename, merge with confirmation, rename-clash → merge offer, "Possible duplicates" from the fuzzy matcher. Checked in the scratch app: rename, Kitchen island → Island merge (db rows moved, old tag gone).
- [ ] (f) Verification in the built app (scratch profile + scratch library), CLAUDE.md update

## Decisions

- No schema migration: `photos.room`, `tags`, `photo_tags`, `photo_notes` already exist (v1 schema). Stays at user_version 3.

- Adding a tag reuses an existing one with the same name in any case, plural or word order ("Islands" → "Island"); main does this too, not only the UI.
- New tag names: trimmed, spaces collapsed, first letter capitalised; 1–40 characters.
- Renaming to a name another tag already has (same equivalence) returns `exists` so the UI offers a merge.
- Removing a tag removes only the current person's row; the partner's stays.
- Notes/marks: one `photo_notes` row per person; a save patches only the fields sent.
- "Tagged" = a room or ≥1 tag, removed photos left out (query already did this; now tested).

- Tag chips on a photo toggle *your* tag: brass = you tagged it; outlined with the partner's swatch = only they did (click to add it as yours too).
- Bulk room UX: a separate selection mode rather than reusing the Keep ticks, so removal and room selection never mix.
- Scratch test surface: `<scratchpad>/lib` (copy of the db + 3 listing folders), `<scratchpad>/profile/settings.json`, app launched with `--user-data-dir` and `--remote-debugging-port=9333`; `cdp.mjs` drives it. The user's real db is still at schema v2 (untouched).
- Git identity: commits pass the author explicitly through GIT_AUTHOR_*/GIT_COMMITTER_* env vars (no git user configured on this machine).

## Notes
