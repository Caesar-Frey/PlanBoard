# Milestone 7 — Package: progress

Resumable checklist. On resume: read this file and `git log`, continue at the first unchecked step.

## Chunks

- [x] (1) App icon: `build/icon.svg` → 1024px PNG → `build/icon.icns` (sips + iconutil); `.gitignore` tracks `build/icon.*`; wired into electron-builder. — `scripts/make-icon.sh` (`npm run icon`) renders it with the built-in `sips`/`iconutil`, no new deps; the header gable + ◆ in brass on bottle green, double brass border. Readable at 32 px. `mac.icon` is set in chunk 2's `electron-builder.yml`.
- [ ] (2) Packaging: host arch, productName/appId/dmg layout, `npm run build:mac`, output in `dist/`, unsigned. Build run.
- [ ] (3) Packaged app verified from the mounted dmg on a scratch profile + scratch library (window, better-sqlite3 from app.asar.unpacked, db migrated, fonts offline, thumbnails, no console errors). dmg size noted.
- [ ] (4) README install steps (Gatekeeper: Open Anyway / xattr), library + settings locations, build from source, use notes, known limitations; CLAUDE.md Commands.
- [ ] (5) Final gates: tests, typecheck, lint, prettier, greps, `git status` clean of dist/images/db.

## Decisions

## Notes
