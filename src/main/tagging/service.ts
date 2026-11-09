/**
 * Tagging requests from the renderer (brief 4.3). The renderer is never trusted: every request
 * is shape-checked here, rooms must be on the fixed list, and tags, marks and notes can only be
 * written for the person in "Tagging as". The room is shared, so anyone can set it.
 * Electron-free, so it is tested with a real in-memory database.
 */
import type {
  AddPhotoTagOutcome,
  MergeTagsOutcome,
  PhotoNote,
  PhotoTagging,
  RenameTagOutcome,
  Result,
  TagSummary
} from '../../shared/ipc'
import { MAX_TAG_LENGTH, isMark, isRoom } from '../../shared/tagging'
import type { DB } from '../db'
import {
  addPhotoTag,
  findOrCreateTag,
  getPhotoTagging,
  getTagSummary,
  listTagSummaries,
  mergeTags,
  photosExist,
  removePhotoTag,
  renameTag,
  savePhotoNote,
  setRoom,
  type NotePatch,
  type TagSummaryRow
} from '../db/tagging'
import { MAX_NOTE_LENGTH, isId } from '../listing/requests'

export interface TaggingContext {
  db: DB
  /** The person in "Tagging as" (settings), or null before anyone is chosen. */
  currentPersonId: number | null
  now(): number
}

const MAX_ROOM_BATCH = 5000
const INVALID = { ok: false, error: 'Invalid request' } as const
const NOT_YOU = {
  ok: false,
  error: 'Switch “Tagging as” to this person to change their tags, mark or notes.'
} as const
const PHOTO_GONE = { ok: false, error: 'This photo is no longer in the library.' } as const
const TAG_GONE = { ok: false, error: 'That tag no longer exists.' } as const

const asRecord = (raw: unknown): Record<string, unknown> | null =>
  typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null

const fail = (err: unknown): { ok: false; error: string } => ({
  ok: false,
  error: err instanceof Error ? err.message : String(err)
})

const toSummary = (r: TagSummaryRow): TagSummary => ({
  id: r.id,
  name: r.name,
  photoCount: r.photo_count,
  createdAt: r.created_at
})

const tagName = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '' && v.length <= MAX_TAG_LENGTH * 4

function onePhoto(ctx: TaggingContext, photoId: number): PhotoTagging {
  return getPhotoTagging(ctx.db, [photoId])[0]!
}

export function setPhotoRoomRequest(ctx: TaggingContext, raw: unknown): Result<PhotoTagging[]> {
  const r = asRecord(raw)
  if (!r || !Array.isArray(r.photoIds)) return INVALID
  const ids = r.photoIds as unknown[]
  if (ids.length === 0 || ids.length > MAX_ROOM_BATCH || !ids.every(isId)) return INVALID
  if (r.room !== null && !isRoom(r.room)) return INVALID
  const photoIds = [...new Set(ids as number[])]
  try {
    setRoom(ctx.db, photoIds, r.room)
    return { ok: true, value: getPhotoTagging(ctx.db, photoIds) }
  } catch (err) {
    return fail(err)
  }
}

export function addPhotoTagRequest(ctx: TaggingContext, raw: unknown): Result<AddPhotoTagOutcome> {
  const r = asRecord(raw)
  if (!r || !isId(r.photoId) || !isId(r.personId) || !tagName(r.name)) return INVALID
  if (r.personId !== ctx.currentPersonId) return NOT_YOU
  const { photoId, personId, name } = r as { photoId: number; personId: number; name: string }
  try {
    if (!photosExist(ctx.db, [photoId])) return PHOTO_GONE
    const outcome = ctx.db.transaction(() => {
      const { tag, created } = findOrCreateTag(ctx.db, name, personId, ctx.now())
      addPhotoTag(ctx.db, photoId, tag.id, personId, ctx.now())
      return { tagId: tag.id, created }
    })()
    return {
      ok: true,
      value: {
        photo: onePhoto(ctx, photoId),
        tag: toSummary(getTagSummary(ctx.db, outcome.tagId)!),
        created: outcome.created
      }
    }
  } catch (err) {
    return fail(err)
  }
}

export function removePhotoTagRequest(ctx: TaggingContext, raw: unknown): Result<PhotoTagging> {
  const r = asRecord(raw)
  if (!r || !isId(r.photoId) || !isId(r.personId) || !isId(r.tagId)) return INVALID
  if (r.personId !== ctx.currentPersonId) return NOT_YOU
  try {
    if (!photosExist(ctx.db, [r.photoId])) return PHOTO_GONE
    removePhotoTag(ctx.db, r.photoId, r.tagId, r.personId)
    return { ok: true, value: onePhoto(ctx, r.photoId) }
  } catch (err) {
    return fail(err)
  }
}

export function savePhotoNoteRequest(ctx: TaggingContext, raw: unknown): Result<PhotoNote> {
  const r = asRecord(raw)
  if (!r || !isId(r.photoId) || !isId(r.personId)) return INVALID
  const patch: NotePatch = {}
  for (const field of ['likes', 'why'] as const) {
    const v = r[field]
    if (v === undefined) continue
    if (typeof v !== 'string' || v.length > MAX_NOTE_LENGTH) return INVALID
    patch[field] = v
  }
  if (r.mark !== undefined) {
    if (r.mark !== null && !isMark(r.mark)) return INVALID
    patch.mark = r.mark
  }
  if (Object.keys(patch).length === 0) return INVALID
  if (r.personId !== ctx.currentPersonId) return NOT_YOU
  try {
    if (!photosExist(ctx.db, [r.photoId])) return PHOTO_GONE
    return { ok: true, value: savePhotoNote(ctx.db, r.photoId, r.personId, patch, ctx.now()) }
  } catch (err) {
    return fail(err)
  }
}

export function listTags(ctx: TaggingContext): Result<TagSummary[]> {
  try {
    return { ok: true, value: listTagSummaries(ctx.db).map(toSummary) }
  } catch (err) {
    return fail(err)
  }
}

export function renameTagRequest(ctx: TaggingContext, raw: unknown): Result<RenameTagOutcome> {
  const r = asRecord(raw)
  if (!r || !isId(r.tagId) || !tagName(r.name)) return INVALID
  try {
    const outcome = renameTag(ctx.db, r.tagId, r.name)
    if (outcome.status === 'not-found') return TAG_GONE
    if (outcome.status === 'exists') {
      return { ok: true, value: { status: 'exists', existing: toSummary(outcome.existing) } }
    }
    return { ok: true, value: { status: 'renamed', tag: toSummary(outcome.tag) } }
  } catch (err) {
    return fail(err)
  }
}

export function mergeTagsRequest(ctx: TaggingContext, raw: unknown): Result<MergeTagsOutcome> {
  const r = asRecord(raw)
  if (!r || !isId(r.fromTagId) || !isId(r.intoTagId)) return INVALID
  try {
    const { moved, duplicates } = mergeTags(ctx.db, r.fromTagId, r.intoTagId)
    return {
      ok: true,
      value: { into: toSummary(getTagSummary(ctx.db, r.intoTagId)!), moved, duplicates }
    }
  } catch (err) {
    return fail(err)
  }
}
