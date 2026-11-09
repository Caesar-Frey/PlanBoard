# CLAUDE.md — PlanBoard

This is a Mac-only Electron + TypeScript app. It downloads property listing photos from Property24 and Private Property and lets two people tag them for house-design inspiration.

**Read `PROJECT_BRIEF.md` first.** It has the agreed decisions, the scraping research, the data model, the theme tokens and the milestones. Don't reopen decisions it records without asking the user.

## Working rules
- Build in the milestone order in the brief. Finish and demo each one before starting the next.
- Keep all site-specific scraping logic in `src/main/scrapers/<site>.ts`. Unit-test the URL parsing and the image-URL filtering with Vitest, using saved HTML and URL fixtures. Don't depend on live sites in tests.
- Security: `contextIsolation: true`, `nodeIntegration: false`, and a typed preload bridge. The hidden scraping window never gets Node access.
- Match the Cape Dutch / Art Deco theme in `design/` and section 8 of the brief. Use the colour tokens as CSS variables.
- Never commit downloaded images, `planboard.db` or the user's library folder.
- Ask before adding sync between two Macs (an open question in the brief).
- The user is an "AI-powered builder". Explain setup steps concretely: the exact commands, and what each one does.

## Commands
Run all of these from the project folder (`cd "/Users/sandbox2/Documents/Vibe coding/PlanBoard"`). Needs Node 22.12+.

- `npm install` — installs packages, then `postinstall` downloads the Electron binary (`install-electron`) and runs `electron-builder install-app-deps`. Its "space in the path" warning is harmless: better-sqlite3 v13 is a Node-API addon and loads its prebuilt binary in both Node and Electron.
- `npm run dev` — builds main + preload, starts the Vite dev server and opens the app with hot reload. Main-process logs (`[planboard] ...`) print in this terminal.
- `npm test` — runs the Vitest unit tests once (`npm run test:watch` re-runs on save). DB tests use real better-sqlite3 under system Node.
- `npm run typecheck` — `tsc --noEmit` for the Node side (main/preload/shared) and the web side (renderer).
- `npm run lint` — ESLint (TypeScript rules, React hooks rules, no stray `console.log`).
- `npm run format` — rewrites files with Prettier (`npm run format:check` only reports).
- `npm run build` — typechecks, then compiles everything into `out/`. `npm start` runs that build.
- `npm run scrape -- "<listing URL>"` — dev test for the scrapers. Builds into `out/`, then runs Electron with `--scrape <url>`: no app window, no dock icon, no database or settings (it uses a throwaway profile in the temp folder). It opens the listing in a hidden window, prints the `ScrapeResult` as JSON and then `found X / expected Y` on stdout; progress (`[scrape] ...`) and warnings go to stderr. Exit code 0 = success, 1 = scrape error, 2 = no URL. Add `-s` (`npm run -s scrape -- ...`) to hide npm's own header, e.g. `npm run -s scrape -- "<url>" > result.json`. It loads the live site, so use it sparingly: one listing at a time, never search pages. Add `--dump <folder>` (outside the project) to also save page snapshots, page-script results and a request log for building fixtures; they hold real agent names, so redact anything copied into `test/fixtures/`.
- Packaging (`.dmg`) is milestone 7: `npx electron-builder --mac` using `electron-builder.yml`.

## Where things live
- `src/shared/ipc.ts` — IPC channel names and types used by main, preload and renderer.
- `src/main/` — app window (`index.ts`), IPC handlers (`ipc.ts`), settings (`settings.ts`, stored in `~/Library/Application Support/planboard/settings.json`), library folder + db (`library.ts`, `db/`), the `--scrape` dev CLI (`cli.ts`, `cliArgs.ts`).
- `src/main/scrapers/` — `types.ts` (shared contracts, `ScraperError`), `detect.ts` (URL → site + id, folder names), `property24.ts` / `privateproperty.ts` (all site-specific URL patterns, selectors and page scripts, plus pure parsers), `driver.ts` (shared hidden-window driver), `manual.ts` (pasted ids/URLs fallback), `html.ts` (site-neutral HTML helpers). Fixtures for their tests are in `test/fixtures/<site>/` (trimmed real pages, agent names redacted; no images).
- `src/main/capture/` — the capture flow: `run.ts` (scrape or manual paste → folder → skip existing → download → db → details; all outside effects injected), `download.ts` (one photo: retries, content-type check, Private Property fallback URL, temp-file-then-rename), `retry.ts` (1 s pacing, 3 retries with 1/2/4 s backoff, skip 404), `files.ts`, `details.ts` (`Property_Details.txt`; its last line holds a checksum, and a re-run only rewrites the file if nobody edited it).
- `src/main/db/listings.ts` — listing upsert, photo rows, Recent surveys query. `folder_path` is stored relative to the library root (`listings/<name>`). Re-survey rule: a re-survey only fills detail fields that are empty; it never overwrites a value. `db/notes.ts` — "Why we saved this house" (one `listing_notes` row per person). `db/migrate.ts` — step-up migrations on `PRAGMA user_version` (now 3: agent contact + bond columns, and a one-off repair of Private Property's doubled apostrophes; `schema.sql` is always the newest shape).
- `src/main/listing/` — listing view logic: `trash.ts` (untick → `shell.trashItem`, path checks, `deleted_at`), `details.ts` (save edited details, regenerate `Property_Details.txt`, hand-edit detection), `view.ts` (the `ListingView` object), `requests.ts` (IPC request shape checks).
- `src/shared/listingFields.ts` — the editable listing fields, labels and validation shared by the form and main.
- `src/main/closeGuard.ts` — quit guard: the renderer reports unsaved listing details (`setUnsavedDetails`); a window close or Cmd+Q is held and the renderer asks "Keep editing / Discard and quit" (`closeRequested` → `answerClose`). Notes save on `pagehide`.
- Agent contact: only `tel:`/`mailto:` links the page shows. "Show number" on both sites opens a CAPTCHA check, so the scrapers never click it. Bond figures come from each listing's own calculator (`pageScripts` in the site modules read the rendered values).
- `src/main/media.ts` + `mediaProtocol.ts` — the `planboard-media://library/listings/<folder>/<image>` protocol the renderer uses for local photos (only image files whose real path is inside `listings/`). `pathGuard.ts` checks folders and URLs before Open folder / Open original listing.
- `src/shared/progress.ts` — stage and progress maths shared by main and renderer (Survey → Foundation → Framing → Handover; duplicate-aware completeness).
- `src/renderer/src/capture/` — Capture screen (`CaptureView`, `StageProgress`, `Outcome`, `ManualFallback`, `useCapture` hook that lives at App level so progress survives switching screens). Recent surveys is `components/RecentView.tsx`; clicking a row opens the listing view (`src/renderer/src/listing/`: `ListingView`, `PhotoGrid`, `PhotoPreview`, `DetailsPanel`, `ListingNotes`). `components/Modal.tsx` is the shared dialog (focus trap, Esc).
- `src/renderer/src/styles/tokens.css` — the only file allowed to contain raw colour values.
