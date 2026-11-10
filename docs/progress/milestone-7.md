# Milestone 7 — Package: progress

Resumable checklist. On resume: read this file and `git log`, continue at the first unchecked step.

## Chunks

- [x] (1) App icon: `build/icon.svg` → 1024px PNG → `build/icon.icns` (sips + iconutil); `.gitignore` tracks `build/icon.*`; wired into electron-builder. — `scripts/make-icon.sh` (`npm run icon`) renders it with the built-in `sips`/`iconutil`, no new deps; the header gable + ◆ in brass on bottle green, double brass border. Readable at 32 px. `mac.icon` is set in chunk 2's `electron-builder.yml`.
- [x] (2) Packaging: host arch, productName/appId/dmg layout, `npm run build:mac`, output in `dist/`, unsigned. Build run. — host is arm64; `dist/PlanBoard-0.1.0-arm64.dmg` 123.5 MB (app 270 MB unpacked). Ad-hoc signed (`identity: '-'`), hardened runtime off, no notarisation; `codesign --verify --deep --strict` passes. Win/Linux better-sqlite3 binaries and its C sources left out. No blockmap / app-update.yml.
- [ ] (3) Packaged app verified from the mounted dmg on a scratch profile + scratch library (window, better-sqlite3 from app.asar.unpacked, db migrated, fonts offline, thumbnails, no console errors). dmg size noted.
- [ ] (4) README install steps (Gatekeeper: Open Anyway / xattr), library + settings locations, build from source, use notes, known limitations; CLAUDE.md Commands.
- [ ] (5) Final gates: tests, typecheck, lint, prettier, greps, `git status` clean of dist/images/db.

## Decisions

- **Apple Silicon (arm64) only.** It's the Mac this is built and tested on. better-sqlite3 v13 ships `darwin-arm64` and `darwin-x64` prebuilt binaries inside the package and picks one at run time, so the native module does not block an Intel or universal build (`npx electron-builder --mac --x64` / `--universal`), but neither is tested and universal roughly doubles the download. Revisit if the second Mac is Intel.
- **Ad-hoc signature instead of none.** With `identity: null` the Electron bundle's seal is broken (`codesign`: "code has no resources but signature indicates they must be present"); on Apple Silicon a downloaded copy is then reported as "damaged" with no Open Anyway button. An ad-hoc signature (free, no Apple account) makes it a normal "unverified developer" app. Still not notarised.
- Output moved from `release/` to `dist/` (both gitignored). `build:mac` = `npm run build` (typecheck + compile) then `electron-builder --mac`.

## Notes
