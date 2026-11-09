-- PlanBoard schema (brief section 5). Idempotent: safe to run on every open.
-- Times are Unix epoch milliseconds.
-- This is always the newest shape; older libraries are stepped up by migrate.ts.

CREATE TABLE IF NOT EXISTS people (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  colour TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id                   INTEGER PRIMARY KEY,
  site                 TEXT NOT NULL CHECK (site IN ('p24', 'pp')),
  external_id          TEXT NOT NULL,
  url                  TEXT NOT NULL,
  title                TEXT,
  price                TEXT,
  suburb               TEXT,
  city                 TEXT,
  bedrooms             REAL,
  bathrooms            REAL,
  garages              REAL,
  erf_size             TEXT,
  floor_size           TEXT,
  levies               TEXT,
  rates                TEXT,
  description          TEXT,
  agent                TEXT,
  agency               TEXT,
  folder_path          TEXT NOT NULL,
  photo_count_expected INTEGER,
  created_at           INTEGER NOT NULL,
  -- Version 2: what the last survey saw, for regenerating Property_Details.txt.
  photo_count_listed   INTEGER,
  photo_duplicates     INTEGER,
  surveyed_at          INTEGER,
  -- Version 3: agent contact and the listing's bond-calculator figures, as shown.
  agent_phone            TEXT,
  agent_email            TEXT,
  agency_phone           TEXT,
  agency_email           TEXT,
  bond_interest_rate     TEXT,
  bond_term_years        REAL,
  bond_deposit           TEXT,
  bond_monthly_repayment TEXT,
  bond_once_off_costs    TEXT,
  bond_min_income        TEXT,
  bond_total_interest    TEXT,
  bond_total_repayment   TEXT,
  bond_as_of             INTEGER,
  UNIQUE (site, external_id)
);

CREATE TABLE IF NOT EXISTS listing_notes (
  id         INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  person_id  INTEGER NOT NULL REFERENCES people(id),
  why_saved  TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE (listing_id, person_id)
);

CREATE TABLE IF NOT EXISTS photos (
  id         INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  file_name  TEXT NOT NULL,
  source_url TEXT NOT NULL,
  width      INTEGER,
  height     INTEGER,
  room       TEXT,
  deleted_at INTEGER,
  UNIQUE (listing_id, file_name)
);

CREATE TABLE IF NOT EXISTS tags (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_by INTEGER REFERENCES people(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS photo_tags (
  photo_id   INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  person_id  INTEGER NOT NULL REFERENCES people(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (photo_id, tag_id, person_id)
);

CREATE TABLE IF NOT EXISTS photo_notes (
  id         INTEGER PRIMARY KEY,
  photo_id   INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  person_id  INTEGER NOT NULL REFERENCES people(id),
  likes      TEXT,
  why        TEXT,
  mark       TEXT CHECK (mark IN ('must', 'nice', 'maybe')),
  updated_at INTEGER NOT NULL,
  UNIQUE (photo_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_photos_listing ON photos(listing_id);
CREATE INDEX IF NOT EXISTS idx_photo_tags_tag ON photo_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_photo_notes_photo ON photo_notes(photo_id);
