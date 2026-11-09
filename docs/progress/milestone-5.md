# Milestone 5 — Tagging: progress

Resumable checklist. On resume: read this file and `git log`, continue at the first unchecked step.

## Chunks

- [x] (a) Shared rooms/marks + fuzzy tag matcher + db tagging queries (rename/merge), TDD — `shared/tagging.ts`, `shared/tagMatch.ts`, `main/db/tagging.ts`, `main/tagging/service.ts` (service done early; IPC wiring is (b)). 345 tests green.
- [x] (b) Tagging service + IPC + preload typed methods — 7 channels (setPhotoRoom, addPhotoTag, removePhotoTag, savePhotoNote, listTags, renameTag, mergeTags); ListingView photos now carry room, tags, notes.
- [x] (c) Large preview: tagging panel — `tagging/TaggingPanel.tsx`, `tagging/TagInput.tsx` (combobox), `components/useAutosave.ts`. Not yet checked in the app (see (f)).
- [ ] (d) Grid: room/mark indicators + bulk room assignment
- [ ] (e) Tag management (rename, merge, possible duplicates) in Settings
- [ ] (f) Verification in the built app (scratch profile + scratch library), CLAUDE.md update

## Decisions

- No schema migration: `photos.room`, `tags`, `photo_tags`, `photo_notes` already exist (v1 schema). Stays at user_version 3.

- Adding a tag reuses an existing one with the same name in any case, plural or word order ("Islands" → "Island"); main does this too, not only the UI.
- New tag names: trimmed, spaces collapsed, first letter capitalised; 1–40 characters.
- Renaming to a name another tag already has (same equivalence) returns `exists` so the UI offers a merge.
- Removing a tag removes only the current person's row; the partner's stays.
- Notes/marks: one `photo_notes` row per person; a save patches only the fields sent.
- "Tagged" = a room or ≥1 tag, removed photos left out (query already did this; now tested).

## Notes
