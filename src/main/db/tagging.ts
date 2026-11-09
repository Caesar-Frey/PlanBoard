/**
 * Rooms, feature tags, marks and per-person photo notes (brief 4.3).
 * The room is shared; tags, marks and notes are recorded per person.
 */
import type { Mark, PhotoNote, PhotoTag, PhotoTagging } from '../../shared/ipc'
import { findEquivalentTag } from '../../shared/tagMatch'
import { cleanTagName } from '../../shared/tagging'
import type { DB } from './index'

export interface TagRow {
  id: number
  name: string
  created_by: number | null
  created_at: number
}

export interface TagSummaryRow {
  id: number
  name: string
  photo_count: number
  created_at: number
}

const GONE = 'One of these photos is no longer in the library.'

/** Ids as one JSON parameter, for `IN (SELECT value FROM json_each(?))`. */
const idList = (ids: readonly number[]): string => JSON.stringify(ids)

function countLivePhotos(db: DB, photoIds: readonly number[]): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM photos
       WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))`
    )
    .get(idList(photoIds)) as { n: number }
  return row.n
}

/** True when every id is a photo that hasn't been removed. */
export function photosExist(db: DB, photoIds: readonly number[]): boolean {
  const unique = [...new Set(photoIds)]
  return countLivePhotos(db, unique) === unique.length
}

/** Sets (or, with null, clears) the room of every photo. All or nothing. Returns the count. */
export function setRoom(db: DB, photoIds: readonly number[], room: string | null): number {
  const unique = [...new Set(photoIds)]
  return db.transaction(() => {
    if (countLivePhotos(db, unique) !== unique.length) throw new Error(GONE)
    return db
      .prepare('UPDATE photos SET room = ? WHERE id IN (SELECT value FROM json_each(?))')
      .run(room, idList(unique)).changes
  })()
}

/** The tagging state of each photo, in the order given. Unknown ids are left out. */
export function getPhotoTagging(db: DB, photoIds: readonly number[]): PhotoTagging[] {
  const ids = idList(photoIds)
  const rooms = db
    .prepare('SELECT id, room FROM photos WHERE id IN (SELECT value FROM json_each(?))')
    .all(ids) as { id: number; room: string | null }[]
  const tagRows = db
    .prepare(
      `SELECT pt.photo_id, t.id AS tag_id, t.name, pt.person_id
       FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id
       WHERE pt.photo_id IN (SELECT value FROM json_each(?))
       ORDER BY t.name COLLATE NOCASE, t.id, pt.person_id`
    )
    .all(ids) as { photo_id: number; tag_id: number; name: string; person_id: number }[]
  const noteRows = db
    .prepare(
      `SELECT photo_id, person_id, likes, why, mark, updated_at FROM photo_notes
       WHERE photo_id IN (SELECT value FROM json_each(?)) ORDER BY person_id`
    )
    .all(ids) as (NoteRow & { photo_id: number })[]

  const byId = new Map<number, PhotoTagging>()
  for (const r of rooms) byId.set(r.id, { photoId: r.id, room: r.room, tags: [], notes: [] })
  for (const r of tagRows) {
    const photo = byId.get(r.photo_id)
    if (!photo) continue
    const last: PhotoTag | undefined = photo.tags.at(-1)
    if (last && last.tagId === r.tag_id) last.personIds.push(r.person_id)
    else photo.tags.push({ tagId: r.tag_id, name: r.name, personIds: [r.person_id] })
  }
  for (const r of noteRows) byId.get(r.photo_id)?.notes.push(toNote(r))
  return photoIds.flatMap((id) => byId.get(id) ?? [])
}

function getTag(db: DB, id: number): TagRow | undefined {
  return db.prepare('SELECT id, name, created_by, created_at FROM tags WHERE id = ?').get(id) as
    TagRow | undefined
}

function allTags(db: DB): TagRow[] {
  return db
    .prepare('SELECT id, name, created_by, created_at FROM tags ORDER BY id')
    .all() as TagRow[]
}

/**
 * The tag for this name: an existing one with the same name in any case, or the same apart from
 * plurals and word order ("Islands" → "Island"), else a new one. Throws for a blank name.
 */
export function findOrCreateTag(
  db: DB,
  rawName: string,
  personId: number,
  now: number
): { tag: TagRow; created: boolean } {
  const name = cleanTagName(rawName)
  if (!name) throw new Error('A tag needs a name of 1 to 40 letters.')
  return db.transaction(() => {
    const same = db
      .prepare('SELECT id, name, created_by, created_at FROM tags WHERE name = ?')
      .get(name) as TagRow | undefined
    const existing = same ?? findEquivalentTag(name, allTags(db))
    if (existing) return { tag: existing, created: false }
    const tag = db
      .prepare(
        `INSERT INTO tags (name, created_by, created_at) VALUES (?, ?, ?)
         RETURNING id, name, created_by, created_at`
      )
      .get(name, personId, now) as TagRow
    return { tag, created: true }
  })()
}

/** Records this person's tag on the photo. False when they had already added it. */
export function addPhotoTag(
  db: DB,
  photoId: number,
  tagId: number,
  personId: number,
  now: number
): boolean {
  return (
    db
      .prepare(
        `INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, person_id, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(photoId, tagId, personId, now).changes === 1
  )
}

/** Removes this person's tag from the photo (the other person's stays). */
export function removePhotoTag(db: DB, photoId: number, tagId: number, personId: number): boolean {
  return (
    db
      .prepare('DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ? AND person_id = ?')
      .run(photoId, tagId, personId).changes === 1
  )
}

const SUMMARY_SQL = `SELECT t.id, t.name, t.created_at,
    (SELECT COUNT(DISTINCT pt.photo_id) FROM photo_tags pt
       JOIN photos p ON p.id = pt.photo_id
       WHERE pt.tag_id = t.id AND p.deleted_at IS NULL) AS photo_count
  FROM tags t`

/** Every tag, A–Z, with how many photos (not removed) carry it. */
export function listTagSummaries(db: DB): TagSummaryRow[] {
  return db.prepare(`${SUMMARY_SQL} ORDER BY t.name COLLATE NOCASE, t.id`).all() as TagSummaryRow[]
}

export function getTagSummary(db: DB, id: number): TagSummaryRow | undefined {
  return db.prepare(`${SUMMARY_SQL} WHERE t.id = ?`).get(id) as TagSummaryRow | undefined
}

export type RenameResult =
  | { status: 'renamed'; tag: TagSummaryRow }
  | { status: 'exists'; existing: TagSummaryRow }
  | { status: 'not-found' }

/**
 * Renames a tag (a change of case alone is fine). If another tag already has that name, or the
 * same name apart from case, plurals or word order, nothing changes and that tag is returned so
 * the caller can offer a merge. Throws for a blank name.
 */
export function renameTag(db: DB, id: number, rawName: string): RenameResult {
  const name = cleanTagName(rawName)
  if (!name) throw new Error('A tag needs a name of 1 to 40 letters.')
  return db.transaction((): RenameResult => {
    if (!getTag(db, id)) return { status: 'not-found' }
    const others = allTags(db).filter((t) => t.id !== id)
    const clash =
      others.find((t) => t.name.toLowerCase() === name.toLowerCase()) ??
      findEquivalentTag(name, others)
    if (clash) return { status: 'exists', existing: getTagSummary(db, clash.id)! }
    db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id)
    return { status: 'renamed', tag: getTagSummary(db, id)! }
  })()
}

/**
 * Moves every photo tag from `fromId` to `intoId` and deletes `fromId`. Each person's rows stay
 * theirs; a row that person already has on the target is dropped as a duplicate. All or nothing.
 */
export function mergeTags(
  db: DB,
  fromId: number,
  intoId: number
): { moved: number; duplicates: number } {
  if (fromId === intoId) throw new Error('A tag can’t be merged into itself.')
  return db.transaction(() => {
    if (!getTag(db, fromId) || !getTag(db, intoId)) throw new Error('That tag no longer exists.')
    const { n } = db
      .prepare('SELECT COUNT(*) AS n FROM photo_tags WHERE tag_id = ?')
      .get(fromId) as { n: number }
    const moved = db
      .prepare(
        `INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, person_id, created_at)
         SELECT photo_id, ?, person_id, created_at FROM photo_tags WHERE tag_id = ?`
      )
      .run(intoId, fromId).changes
    // ON DELETE CASCADE removes the old tag's photo_tags rows.
    db.prepare('DELETE FROM tags WHERE id = ?').run(fromId)
    return { moved, duplicates: n - moved }
  })()
}

interface NoteRow {
  person_id: number
  likes: string | null
  why: string | null
  mark: Mark | null
  updated_at: number
}

const toNote = (r: NoteRow): PhotoNote => ({
  personId: r.person_id,
  likes: r.likes,
  why: r.why,
  mark: r.mark,
  updatedAt: r.updated_at
})

export interface NotePatch {
  likes?: string
  why?: string
  mark?: Mark | null
}

const blankToNull = (text: string): string | null => (text.trim() === '' ? null : text)

/**
 * Upserts this person's note on the photo, changing only the fields in `patch`. Blank text is
 * stored as null. Throws for an unknown photo or person (foreign keys) or a bad mark (CHECK).
 */
export function savePhotoNote(
  db: DB,
  photoId: number,
  personId: number,
  patch: NotePatch,
  now: number
): PhotoNote {
  return db.transaction(() => {
    const current = db
      .prepare(
        `SELECT person_id, likes, why, mark, updated_at FROM photo_notes
         WHERE photo_id = ? AND person_id = ?`
      )
      .get(photoId, personId) as NoteRow | undefined
    const likes = patch.likes !== undefined ? blankToNull(patch.likes) : (current?.likes ?? null)
    const why = patch.why !== undefined ? blankToNull(patch.why) : (current?.why ?? null)
    const mark = patch.mark !== undefined ? patch.mark : (current?.mark ?? null)
    const row = db
      .prepare(
        `INSERT INTO photo_notes (photo_id, person_id, likes, why, mark, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (photo_id, person_id) DO UPDATE SET
           likes = excluded.likes, why = excluded.why, mark = excluded.mark,
           updated_at = excluded.updated_at
         RETURNING person_id, likes, why, mark, updated_at`
      )
      .get(photoId, personId, likes, why, mark, now) as NoteRow
    return toNote(row)
  })()
}
