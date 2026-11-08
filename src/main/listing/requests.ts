/** Shape checks for listing-view IPC requests. The renderer is never trusted. Pure. */
import type {
  DetailsFileMode,
  SaveDetailsRequest,
  SaveNoteRequest,
  TrashPhotosRequest
} from '../../shared/ipc'

export const MAX_NOTE_LENGTH = 10_000
const MAX_TRASH_BATCH = 5000
const FILE_MODES: readonly DetailsFileMode[] = ['ask', 'overwrite', 'keep']

export const isId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0

const asRecord = (raw: unknown): Record<string, unknown> | null =>
  typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null

export function parseTrashRequest(raw: unknown): TrashPhotosRequest | null {
  const r = asRecord(raw)
  if (!r || !isId(r.listingId) || !Array.isArray(r.photoIds)) return null
  const ids = r.photoIds as unknown[]
  if (ids.length === 0 || ids.length > MAX_TRASH_BATCH || !ids.every(isId)) return null
  return { listingId: r.listingId, photoIds: [...new Set(ids as number[])] }
}

/** The fields themselves are checked by validateListingFields. */
export function parseSaveDetailsRequest(raw: unknown): SaveDetailsRequest | null {
  const r = asRecord(raw)
  if (!r || !isId(r.listingId) || !asRecord(r.fields)) return null
  if (!FILE_MODES.includes(r.fileMode as DetailsFileMode)) return null
  return {
    listingId: r.listingId,
    fields: r.fields as SaveDetailsRequest['fields'],
    fileMode: r.fileMode as DetailsFileMode
  }
}

export function parseSaveNoteRequest(raw: unknown): SaveNoteRequest | null {
  const r = asRecord(raw)
  if (!r || !isId(r.listingId) || !isId(r.personId)) return null
  if (typeof r.text !== 'string' || r.text.length > MAX_NOTE_LENGTH) return null
  return { listingId: r.listingId, personId: r.personId, text: r.text }
}
