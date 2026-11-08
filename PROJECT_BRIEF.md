# PlanBoard — Project Brief

*Working name, taken from the project folder. Agreed in planning on 8 November 2026.*

## 1. What it is

PlanBoard is a Mac desktop app for collecting design inspiration for a new house. You paste a property listing URL from **Property24** or **Private Property**. The app downloads every gallery photo and the listing details. Then two people tag the photos by room and feature and write notes on what they like and why.

The point is that, months later, there isn't a pile of 50 houses' photos to sift through. Instead, you can ask the library questions like:

- "Show me every kitchen island we liked, and why."
- "Which features keep showing up across houses?"
- "What did *both* of us mark as must-have for the patio?"

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Platform | **macOS only** for now. |
| Stack | **Electron + TypeScript**. The UI is web tech (HTML/CSS). The scraping uses Electron's built-in Chromium, so there's **no Playwright or Python**. |
| Input | **One listing URL at a time.** |
| Save location | The user picks the root folder and can change it in settings. Default: `~/Pictures/PlanBoard`. |
| Listing details | Write `Property_Details.txt` filled in with everything the listing shows. It can be edited in the app. |
| Theme | **Cape Dutch / Art Deco** (see section 8). |
| Users | **Two people** share the library. Every tag and note records who made it. |
| Tags | **Fixed room list** plus **free-form feature tags** with auto-complete. This prevents duplicates like "Island" and "kitchen island". |
| Extras | Untick photos to delete them. A "Recent surveys" list of downloaded listings. |
| Packaging | An unsigned `.dmg` via electron-builder. First launch needs right-click → Open, which is fine for personal use. |
| Code hosting | GitHub, under the user's profile. |

## 3. How the scraping works (researched 8 Nov 2026)

### Property24 (`property24.com/for-sale/.../<listingId>`)
- Image host: `https://images.prop24.com/<numericId>`, with optional size suffixes such as `/Ensure1280x720`, `/Ensure960x540` and `/Crop162x108`.
- **Download full size by dropping the suffix**: `https://images.prop24.com/<id>`. This is confirmed: it returns `image/jpeg`, about 220 KB.
- **The page HTML is not enough.** On a test listing with 56 photos, only the first 3 IDs were in the HTML. The rest were grey/black placeholder PNGs that only load at runtime when you open the gallery.
- Photo IDs are **not sequential**. Gaps are common, for example `377176739–743` next to `377176804/807`. Never count up from a start ID.
- The same image host also serves **agent photos and agency logos**. Filter them out by their suffix (`UpperCrop200x200` and `Fit450x225`). Keep gallery suffixes (`Ensure…`) and bare IDs.
- The page shows the total photo count ("Photos (56)", "See all 56 images"). Use it to check you got everything.

**Approach:** load the listing in a hidden `BrowserWindow`, listen with `session.webRequest.onCompleted` for `images.prop24.com` requests, close any cookie or alert pop-ups, open the gallery ("See all N images"), and scroll or step through it until the number of unique gallery IDs equals N (or a timeout is hit). Then download each ID with no suffix.

### Private Property (`privateproperty.co.za/for-sale/.../<slug>/T<number>`)
- Image host pattern: `https://images.pp.co.za/listing/<listingId>/<photoKey>/<width>/<height>/contain/jpegorpng`
  - Example: `.../listing/12159256/kdUN0dCAEZq08ZukpkarZ6/1600/1066/contain/jpegorpng`
- `photoKey` is a random string, so photos can't be guessed. They must be read from the page.
- **Every gallery URL contains the listing's own ID.** Filter on it to exclude other listings.
- Width and height are in the path. **Ask for 1600/1066** (or larger, if the server allows) even when the page shows 600/450 thumbnails.
- The plain HTML had 9 unique photos plus a "View All" link, so there are probably more behind it. Use the same hidden-window approach as Property24: click "View All" and collect URLs.

### Shared rules
- Wait about 1 second between downloads. Retry 3 times on network errors. Skip 404s.
- Skip files that already exist, so the user can re-run the same listing.
- If fewer photos are found than the listing states, **warn the user**. Don't fail silently.
- Keep all site-specific selectors and patterns in **one module per site** (`src/main/scrapers/property24.ts` and `privateproperty.ts`), so a site redesign is a small fix.
- Manual fallback: paste a list of image IDs or URLs.
- Legacy reference: `reference/images_downloader.py` is the original Python script.

## 4. Features (v1)

### 4.1 Capture
- Paste URL → **Survey** button. The site is detected automatically.
- The progress bar uses building stages: **Survey** (reading listing) → **Foundation** (opening gallery) → **Framing** (downloading, `38 / 56`) → **Handover** (done).
- The save folder is shown with a **Change folder** button.

### 4.2 Listing view (after download)
- Photo grid with a large preview.
- Untick photos to remove them (they move to the macOS Trash, not permanent delete).
- Listing details panel with the scraped fields, all editable. Saving writes `Property_Details.txt` and the database.
- A **"Why we saved this house"** note per listing, per person.
- **Open folder** button and **Open original listing** link.

### 4.3 Tagging
- **Room** (one per photo, from a fixed list): Whole house / Exterior, Facade, Entrance, Lounge, Dining, Kitchen, Scullery, Main bedroom, Bedroom, Bathroom, Study, Patio, Braai area, Garden, Pool, Garage, Other.
- **Feature tags** (many per photo): free text with auto-complete from existing tags. Matching ignores case and is fuzzy. Suggest an existing tag before creating a new one ("kitchen island" → "Island?"). Allow merging and renaming tags later.
- **Mark**: Must-have / Nice / Maybe, **per person**.
- **What we like** and **Why**: free-text notes, **per person**, each showing its author.

### 4.4 Inspiration library (the main screen; see `design/`)
- **Scope:** House (whole listing) / Room / Detail (feature).
- Left rail: rooms with counts, feature tags for the current room with counts, a Marked-as filter, and a **Person filter** (Me / Partner / **Both agree**).
- Main grid: photo cards showing room, tags, note excerpt, source house and mark.
- **"Where they coincide"** banner, for example: *"Island appears in 9 of 23 houses, most often paired with pendant lights (6) and stacker doors (4)."* It's calculated from feature tags that appear together on photos across houses.
- Detail panel: large photo, tags, both people's notes, "Same feature in" (other houses), and a link to the listing.
- Search across notes, tags and suburbs.

### 4.5 Recent surveys
- List of downloaded listings with thumbnail, suburb, price, photo count and how much of it is tagged. Click to reopen.

### 4.6 Two people
- Settings has two named profiles. A switcher in the header sets who is tagging ("Tagging as: ___").
- **Open question:** one shared Mac, or two Macs? If two, put the library folder (database + images) in a shared iCloud Drive folder. SQLite over iCloud has write-conflict risks, so v1 should assume **one person writes at a time** and document that. Confirm with the user before building sync.

## 5. Data model (SQLite via `better-sqlite3`)

```
people(id, name, colour)
listings(id, site, external_id, url, title, price, suburb, city, bedrooms, bathrooms,
         garages, erf_size, floor_size, levies, rates, description, agent, agency,
         folder_path, photo_count_expected, created_at)
listing_notes(id, listing_id, person_id, why_saved, updated_at)
photos(id, listing_id, file_name, source_url, width, height, room, deleted_at)
tags(id, name UNIQUE COLLATE NOCASE, created_by, created_at)
photo_tags(photo_id, tag_id, person_id, created_at)
photo_notes(id, photo_id, person_id, likes, why, mark CHECK(mark IN ('must','nice','maybe')), updated_at)
```

The database (`planboard.db`) lives in the library root folder, so the library is self-contained and portable.

## 6. Folder layout on disk

```
<library root>/
  planboard.db
  listings/
    Cornwall-Hill_P24-117097988/
      Property_Details.txt
      image_377176739.jpg
      ...
    Centurion-Golf-Estate_PP-T5670119/
      ...
```

Folder name: `<Suburb>_<P24|PP>-<listingId>`. Image file names: `image_<photoId>.jpg` for P24, and `image_<nn>_<photoKey>.jpg` for PP.

## 7. Suggested project structure

```
src/
  main/            Electron main process: windows, IPC, scrapers, downloads, db
    scrapers/      property24.ts, privateproperty.ts, types.ts
    db/            schema.sql, queries.ts
  preload/         typed IPC bridge (contextIsolation on, no nodeIntegration)
  renderer/        UI (React + Vite recommended): Capture, Listing, Library, Settings
design/            theme mockup (reference only)
reference/         original Python script
```

Tooling: electron-vite (or Vite + electron-builder), TypeScript strict mode, ESLint and Prettier, Vitest for unit tests of the URL parsing and filtering.

## 8. Theme: Cape Dutch / Art Deco

Reference: `design/library-mockup-deco.dc.html`, the inspiration library screen. It's a design-canvas file, so read it for layout, colours and type. It doesn't run on its own. Live canvas: https://claude.ai/artifact/KMTm6oMWMWYwRMn1oR4jnn (artboard 4).

| Token | Value | Use |
|---|---|---|
| Cream | `#f6efe2` | Main background |
| Cream deep | `#ece2cf` | Side rail |
| Card | `#fbf7ef` | Cards and panels |
| Bottle green | `#1f3b33` | Header, detail panel, active states |
| Green mid | `#2c5045` | Photo placeholder on green |
| Brass | `#c9a45c` | Lines, active chips, accents on green |
| Brass dark | `#b08a3e` | Ornament lines on cream |
| Brass text | `#7a5a1e` | Small labels on cream (passes 4.5:1) |
| Pale brass | `#e3cf9f` | Labels on green |
| Ink | `#1f2a26` | Body text |

- **Type:** Marcellus (headings, spaced capitals) and Jost (body and UI), both from Google Fonts. Bundle them locally in the app.
- **Motifs:** arched gable tops on photo frames (`border-radius: 90px 90px 0 0 / 60px 60px 0 0`), faint vertical fluting on placeholders, `— LABEL —` section headings, a ◆ divider, and double brass lines under the header.
- Buttons are rounded pills. Touch targets are at least 36–44px. Keep text contrast at 4.5:1 or better.

## 9. Milestones

1. **Scaffold:** Electron + Vite + TS app opens a themed window. Settings for the library folder and two people.
2. **Scrapers:** Property24 and Private Property, tested on live listings. Photo counts match the listing.
3. **Capture flow:** download with progress stages, write `Property_Details.txt`, add to Recent surveys.
4. **Listing view:** preview, untick to delete, edit details.
5. **Tagging:** rooms, feature tags with auto-complete, marks, per-person notes.
6. **Library:** filters, search, coincide insights, detail panel.
7. **Package:** `.dmg` with electron-builder, README with install steps.

## 10. Ground rules

- Personal use only: **one listing at a time** with polite delays. Never crawl search results or suburbs.
- Never commit downloaded images or `planboard.db` to git.
- If a site changes and a scraper breaks, fail with a clear message and offer the manual fallback.
