/**
 * Listing view → `Property_Details.txt`.
 *
 * Save: validate the form, update the `listings` row in one transaction, then regenerate the
 * file in exactly the capture format with a fresh checksum footer. If the file was edited
 * outside the app (checksum mismatch), nothing is changed until the user picks: overwrite the
 * file, or keep it and only save to the library.
 *
 * The file is also regenerated after photos are removed, so "Photos: N in this folder" stays
 * true, but only when it is still PlanBoard's own copy.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DetailsFileMode, DetailsFileState } from '../../shared/ipc'
import { validateListingFields, type ListingFieldErrors } from '../../shared/listingFields'
import { DETAILS_FILE_NAME, detailsFileState, formatPropertyDetails } from '../capture/details'
import { writeFileAtomic } from '../capture/files'
import type { DB } from '../db'
import { countPhotos, detailsOf, getListing, updateListingDetails } from '../db/listings'
import { listingFolderPath } from '../pathGuard'

export interface DetailsFileDeps {
  db: DB
  libraryRoot: string
  now(): number
}

export type SaveDetailsResult =
  | {
      status: 'saved'
      detailsFile: 'written' | 'kept-edited' | 'not-written'
      warning: string | null
    }
  | { status: 'invalid'; errors: ListingFieldErrors }
  | { status: 'file-edited' }
  | { status: 'not-found' }

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

function detailsPath(root: string, folderPath: string): string | null {
  const folder = listingFolderPath(root, folderPath)
  return folder ? join(folder, DETAILS_FILE_NAME) : null
}

/** For the listing view: was the file edited outside the app? Unreadable counts as missing. */
export async function readDetailsFileState(
  root: string,
  folderPath: string
): Promise<DetailsFileState> {
  const path = detailsPath(root, folderPath)
  if (!path) return 'missing'
  try {
    return detailsFileState(await readText(path))
  } catch {
    return 'missing'
  }
}

export interface SurveyFacts {
  listed: number | null
  duplicates: number | null
  surveyedAt: number | null
}

/**
 * Libraries from before version 2 don't store the stated photo count or the survey date. Read
 * them back from the `Photos:` and `Date surveyed:` lines PlanBoard wrote.
 */
export function parseSurveyFacts(text: string): SurveyFacts {
  const photos =
    /^Photos:\s+\d+ in this folder · listing shows (\d+)(?: \((\d+) photos? appears? twice\))?\s*$/m.exec(
      text
    )
  const date = /^Date surveyed:\s+(.+?)\s*$/m.exec(text)
  const parsed = date ? Date.parse(date[1]!) : NaN
  return {
    listed: photos ? Number(photos[1]) : null,
    duplicates: photos ? Number(photos[2] ?? 0) : null,
    surveyedAt: Number.isFinite(parsed) ? parsed : null
  }
}

/**
 * Rewrites the file from the db. `if-ours` leaves a hand-edited file alone; `force` overwrites
 * it. Throws on a write error.
 */
export async function regenerateDetailsFile(
  deps: DetailsFileDeps,
  listingId: number,
  mode: 'if-ours' | 'force'
): Promise<'written' | 'kept-edited' | 'not-written'> {
  const row = getListing(deps.db, listingId)
  if (!row) return 'not-written'
  const path = detailsPath(deps.libraryRoot, row.folder_path)
  if (!path) return 'not-written'
  const current = await readText(path).catch(() => null)
  if (mode === 'if-ours' && detailsFileState(current) === 'edited') return 'kept-edited'

  const legacy = current ? parseSurveyFacts(current) : null
  const listed = row.photo_count_listed ?? legacy?.listed ?? row.photo_count_expected
  const duplicates = row.photo_duplicates ?? legacy?.duplicates ?? 0
  const surveyedAt = row.surveyed_at ?? legacy?.surveyedAt ?? row.created_at
  const onDisk = countPhotos(deps.db, listingId)

  const text = formatPropertyDetails({
    site: row.site,
    externalId: row.external_id,
    url: row.url,
    details: detailsOf(row),
    counts: { found: onDisk, listed, duplicates, expected: row.photo_count_expected, onDisk },
    surveyedAt: new Date(surveyedAt),
    writtenAt: new Date(deps.now())
  })
  await writeFileAtomic(path, Buffer.from(text, 'utf8'))
  return 'written'
}

export async function saveListingDetails(
  deps: DetailsFileDeps,
  listingId: number,
  input: unknown,
  fileMode: DetailsFileMode
): Promise<SaveDetailsResult> {
  const row = getListing(deps.db, listingId)
  if (!row) return { status: 'not-found' }
  const valid = validateListingFields(input)
  if (!valid.ok) return { status: 'invalid', errors: valid.errors }

  const state = await readDetailsFileState(deps.libraryRoot, row.folder_path)
  if (state === 'edited' && fileMode === 'ask') return { status: 'file-edited' }

  deps.db.transaction(() => updateListingDetails(deps.db, listingId, valid.value))()

  if (state === 'edited' && fileMode === 'keep') {
    return { status: 'saved', detailsFile: 'kept-edited', warning: null }
  }
  try {
    const detailsFile = await regenerateDetailsFile(deps, listingId, 'force')
    return { status: 'saved', detailsFile, warning: null }
  } catch (err) {
    return {
      status: 'saved',
      detailsFile: 'not-written',
      warning:
        `Saved in the library, but couldn't write ${DETAILS_FILE_NAME} ` +
        `(${(err as Error).message}).`
    }
  }
}
