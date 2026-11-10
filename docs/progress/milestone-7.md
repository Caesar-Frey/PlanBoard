# Milestone 7 — Package: progress

Resumable checklist. On resume: read this file and `git log`, continue at the first unchecked step.

## Chunks

- [x] (1) App icon: `build/icon.svg` → 1024px PNG → `build/icon.icns` (sips + iconutil); `.gitignore` tracks `build/icon.*`; wired into electron-builder. — `scripts/make-icon.sh` (`npm run icon`) renders it with the built-in `sips`/`iconutil`, no new deps; the header gable + ◆ in brass on bottle green, double brass border. Readable at 32 px. `mac.icon` is set in chunk 2's `electron-builder.yml`.
- [x] (2) Packaging: host arch, productName/appId/dmg layout, `npm run build:mac`, output in `dist/`, unsigned. Build run. — host is arm64; `dist/PlanBoard-0.1.0-arm64.dmg` 123.5 MB (app 270 MB unpacked). Ad-hoc signed (`identity: '-'`), hardened runtime off, no notarisation; `codesign --verify --deep --strict` passes. Win/Linux better-sqlite3 binaries and its C sources left out. No blockmap / app-update.yml.
- [x] (3) Packaged app verified from the mounted dmg on a scratch profile + scratch library (window, better-sqlite3 from app.asar.unpacked, db migrated, fonts offline, thumbnails, no console errors). dmg size noted. — `hdiutil attach -readonly -nobrowse`, `ditto` the app out, detach; signature still valid. Launched `Contents/MacOS/PlanBoard --user-data-dir=<scratch> --remote-debugging-port` with a pre-seeded `settings.json` pointing at a scratch library. Renderer loads from `app.asar`; `lsof` shows `app.asar.unpacked/…/prebuilds/darwin-arm64.node` mapped; new db at `user_version` 3 with 2 people; Marcellus + Jost loaded from `file:` assets, 0 non-`file:` requests; a seeded listing's thumbnail loads via `planboard-media://` (1600 px); 0 console messages, 0 failed loads, no errors in the main log. dmg 123.5 MB. No live scrape.
- [x] (4) README install steps (Gatekeeper: Open Anyway / xattr), library + settings locations, build from source, use notes, known limitations; CLAUDE.md Commands. — README: Install (drag to Applications → Done → Privacy & Security → Open Anyway → open again; Control-click Open only on older macOS; `xattr -dr com.apple.quarantine` explained), Where your data lives (+ one person writes at a time on shared iCloud/Dropbox libraries), Build from source (each command explained, `build:mac`, `icon`, untested Intel note), Known limitations; roadmap 7 ✅; links under the hero. Existing screenshots kept, no new ones. CLAUDE.md Commands: `build:mac`, `icon`, how to test the packaged app on a scratch profile.
- [x] (5) Final gates: tests, typecheck, lint, prettier, greps, `git status` clean of dist/images/db. — 391/391 tests (34 files), typecheck, lint, format:check green; no `console.log` in src/scripts, no secrets; tracked images are only `build/icon.{png,icns}` and the README screenshots; no dist/, out/, db or dmg tracked.

## Decisions

- **Apple Silicon (arm64) only.** It's the Mac this is built and tested on. better-sqlite3 v13 ships `darwin-arm64` and `darwin-x64` prebuilt binaries inside the package and picks one at run time, so the native module does not block an Intel or universal build (`npx electron-builder --mac --x64` / `--universal`), but neither is tested and universal roughly doubles the download. Revisit if the second Mac is Intel.
- **Ad-hoc signature instead of none.** With `identity: null` the Electron bundle's seal is broken (`codesign`: "code has no resources but signature indicates they must be present"); on Apple Silicon a downloaded copy is then reported as "damaged" with no Open Anyway button. An ad-hoc signature (free, no Apple account) makes it a normal "unverified developer" app. Still not notarised.
- Output moved from `release/` to `dist/` (both gitignored). `build:mac` = `npm run build` (typecheck + compile) then `electron-builder --mac`.

## Notes

- Not verified: the Gatekeeper first-launch flow on a quarantined (downloaded) copy — the dmg was built locally, so it carries no quarantine flag. `spctl` rejects the app as expected (no Developer ID); the README steps follow current macOS behaviour for ad-hoc-signed apps. Also not verified: an Intel / universal build, a live scrape and a full capture inside the packaged app (scraper and download code paths are the same as dev).
- Not done (needs the user's OK): pushing these commits and publishing a GitHub Release with the dmg. The README already links to the Releases page.
