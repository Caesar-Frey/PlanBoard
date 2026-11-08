/**
 * One capture, start to finish: scrape (or parse the manual fallback) → make the listing
 * folder → download missing photos → record them → write Property_Details.txt.
 *
 * Every outside effect is injected (scraper, network, clock, sleep), so the whole flow runs in
 * tests with fakes. The db and files are real.
 */
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  CaptureCounts,
  CaptureFailure,
  CaptureOutcome,
  CaptureProgress,
  CaptureStage,
  ManualCaptureRequest
} from '../../shared/ipc'
import {
  downloadWarnings,
  duplicateNote,
  expectedUnique,
  framingLabel,
  overallFraction
} from '../../shared/progress'
import type { DB } from '../db'
import {
  countPhotos,
  findListing,
  recordPhotos,
  removedFileNames,
  upsertListing,
  type ListingRow,
  type PhotoRecord
} from '../db/listings'
import { listingFolderPath } from '../pathGuard'
import { LISTINGS_DIR_NAME } from '../paths'
import { detectListing, suggestFolderName } from '../scrapers/detect'
import { parseManualInput, type ManualRejection } from '../scrapers/manual'
import { parsePpImageUrl } from '../scrapers/privateproperty'
import {
  EMPTY_DETAILS,
  MANUAL_FALLBACK_HINT,
  ScraperError,
  type ListingDetails,
  type ParsedListingUrl,
  type ScrapedPhoto,
  type ScrapeResult
} from '../scrapers/types'
import { DETAILS_FILE_NAME, detailsFileState, formatPropertyDetails } from './details'
import { CancelledError, downloadPhoto, type FetchLike } from './download'
import { hasFile, isSafeFileName, matchExisting, removePartials, writeFileAtomic } from './files'
import { REQUEST_INTERVAL_MS, createPacer } from './retry'

export interface CaptureDeps {
  db: DB
  libraryRoot: string
  /** The live scraper (driver.ts) in the app; a fake in tests. */
  scrape(
    url: string,
    options: { signal: AbortSignal; onStage(stage: 'foundation'): void }
  ): Promise<ScrapeResult>
  fetch: FetchLike
  /** Should reject when `signal` aborts. */
  sleep(ms: number, signal: AbortSignal): Promise<void>
  now(): number
  /** Sent with every image request. */
  headers: Record<string, string>
  /** Gap between image requests. Default 1 s. */
  intervalMs?: number
  log?(message: string): void
}

export type CaptureInput =
  { kind: 'scrape'; url: string } | ({ kind: 'manual' } & ManualCaptureRequest)

/** Photos in a row that got no answer at all before we call the connection down. */
const NETWORK_DOWN_AFTER = 3

/** Codes where pasting image addresses by hand can still get the photos. */
const MANUAL_FALLBACK_CODES = new Set<CaptureFailure['code']>([
  'no-photos',
  'load-failed',
  'invalid-manual-input',
  'unexpected'
])

export function toCaptureFailure(err: unknown): CaptureFailure {
  if (err instanceof ScraperError) {
    return {
      code: err.code,
      message: err.message,
      manualFallback: MANUAL_FALLBACK_CODES.has(err.code),
      site: err.site
    }
  }
  const detail = err instanceof Error ? err.message : String(err)
  return {
    code: 'unexpected',
    message: `Something went wrong while reading the listing (${detail}). ${MANUAL_FALLBACK_HINT}`,
    manualFallback: true,
    site: null
  }
}

function networkFailure(saved: number): CaptureFailure {
  return {
    code: 'network',
    message:
      `Lost the internet connection: the image server stopped answering. ${saved} ` +
      `${saved === 1 ? 'photo is' : 'photos are'} saved in the folder. Check your internet ` +
      `connection and survey the listing again; photos already saved are skipped.`,
    manualFallback: false,
    site: null
  }
}

const emptyCounts = (): CaptureCounts => ({
  found: 0,
  listed: null,
  duplicates: 0,
  expected: null,
  downloaded: 0,
  alreadyHad: 0,
  removed: 0,
  notFound: 0,
  failed: 0,
  onDisk: 0
})

function detailsOf(row: ListingRow): ListingDetails {
  const out = { ...EMPTY_DETAILS }
  for (const key of Object.keys(EMPTY_DETAILS) as (keyof ListingDetails)[]) {
    ;(out as Record<string, unknown>)[key] = row[key] ?? null
  }
  return out
}

/** Turns pasted text into a ScrapeResult-shaped photo list. Throws when nothing is usable. */
function manualResult(
  db: DB,
  listing: ParsedListingUrl,
  input: ManualCaptureRequest,
  rejected: ManualRejection[]
): ScrapeResult {
  // Private Property: the first full image address tells us the image listing number, so bare
  // photo keys are accepted and images of other listings are refused.
  let ppImageListingId: string | undefined
  if (listing.site === 'pp') {
    for (const token of input.text.split(/[\s,;]+/)) {
      const ref = parsePpImageUrl(token)
      if (ref) {
        ppImageListingId = ref.listingId
        break
      }
    }
  }
  const parsed = parseManualInput(
    input.text,
    listing.site,
    ppImageListingId ? { ppImageListingId } : {}
  )
  rejected.push(...parsed.rejected)
  if (parsed.photos.length === 0) {
    throw new ScraperError(
      'invalid-manual-input',
      listing.site === 'p24'
        ? 'None of the pasted lines is a Property24 image number or image address.'
        : 'None of the pasted lines is a Private Property image address ' +
            '(they start with https://images.pp.co.za/listing/).',
      listing.site
    )
  }
  const existing = findListing(db, listing.site, listing.externalId)
  const details = existing
    ? detailsOf(existing)
    : { ...EMPTY_DETAILS, suburb: input.suburb?.trim() || null }
  return {
    site: listing.site,
    externalId: listing.externalId,
    url: listing.url,
    expectedPhotoCount: null,
    duplicatePhotos: 0,
    photos: parsed.photos,
    details,
    warnings: [],
    notes: []
  }
}

export async function runCapture(
  deps: CaptureDeps,
  input: CaptureInput,
  signal: AbortSignal,
  emit: (progress: CaptureProgress) => void
): Promise<CaptureOutcome> {
  const { db } = deps
  const log = deps.log ?? (() => {})
  const startedAt = deps.now()
  const counts = emptyCounts()
  const rejected: ManualRejection[] = []

  const report = (stage: CaptureStage, message: string, done = 0, total = 0): void =>
    emit({ stage, message, done, total, fraction: overallFraction(stage, done, total) })

  const finish = (o: Partial<CaptureOutcome> & Pick<CaptureOutcome, 'status'>): CaptureOutcome => {
    const outcome: CaptureOutcome = {
      listing: null,
      counts,
      notes: [],
      warnings: [],
      detailsFile: 'not-written',
      error: null,
      rejected,
      durationMs: Math.max(0, deps.now() - startedAt),
      ...o
    }
    const label =
      outcome.status === 'complete'
        ? 'Handover: done'
        : outcome.status === 'cancelled'
          ? 'Cancelled'
          : 'Stopped'
    report('handover', label, counts.onDisk, counts.found)
    return outcome
  }

  // ---- Survey + Foundation: get the photo list ----------------------------------------------
  report('survey', input.kind === 'manual' ? 'Reading the pasted photos' : 'Reading the listing')
  let result: ScrapeResult
  try {
    const listing = detectListing(input.url)
    result =
      input.kind === 'scrape'
        ? await deps.scrape(listing.url, {
            signal,
            onStage: () => report('foundation', 'Opening the gallery')
          })
        : manualResult(db, listing, input, rejected)
  } catch (err) {
    const cancelled = signal.aborted || (err instanceof ScraperError && err.code === 'cancelled')
    if (cancelled) return finish({ status: 'cancelled' })
    return finish({ status: 'failed', error: toCaptureFailure(err) })
  }
  if (signal.aborted) return finish({ status: 'cancelled' })

  counts.found = result.photos.length
  counts.listed = result.expectedPhotoCount
  counts.duplicates = result.duplicatePhotos
  counts.expected = expectedUnique(result.expectedPhotoCount, result.duplicatePhotos)

  // ---- Framing: folder, listing row, downloads ----------------------------------------------
  const existing = findListing(db, result.site, result.externalId)
  const suggested = `${LISTINGS_DIR_NAME}/${suggestFolderName(result.details.suburb, result.site, result.externalId)}`
  const folderRel =
    existing && listingFolderPath(deps.libraryRoot, existing.folder_path)
      ? existing.folder_path
      : suggested
  const folder = listingFolderPath(deps.libraryRoot, folderRel)
  if (!folder) {
    return finish({ status: 'failed', error: toCaptureFailure(new Error('bad folder name')) })
  }
  const folderName = folderRel.slice(LISTINGS_DIR_NAME.length + 1)

  let listingId: number
  try {
    await mkdir(folder, { recursive: true })
    const stale = await removePartials(folder)
    if (stale > 0) log(`removed ${stale} unfinished download(s) from an earlier run`)
    listingId = db.transaction(() =>
      upsertListing(db, {
        ...result.details,
        site: result.site,
        external_id: result.externalId,
        url: result.url,
        folder_path: folderRel,
        photo_count_expected: counts.expected ?? existing?.photo_count_expected ?? null,
        created_at: deps.now()
      })
    )()
  } catch (err) {
    return finish({
      status: 'failed',
      error: {
        code: 'unexpected',
        message: `Couldn't create the listing folder ${folder} (${(err as Error).message}).`,
        manualFallback: false,
        site: result.site
      }
    })
  }
  const listingRef = {
    id: listingId,
    site: result.site,
    externalId: result.externalId,
    url: result.url,
    title: result.details.title,
    suburb: result.details.suburb,
    folderName
  }

  // Skip what is already there (no request at all) and what the user removed.
  const removed = removedFileNames(db, listingId)
  const names = new Set(await readdir(folder))
  const already: PhotoRecord[] = []
  const todo: ScrapedPhoto[] = []
  for (const photo of result.photos) {
    if (!isSafeFileName(photo.fileName)) {
      log(`refused unsafe file name ${JSON.stringify(photo.fileName)}`)
      counts.failed += 1
      continue
    }
    if (matchExisting(photo.fileName, photo.photoId, removed)) {
      counts.removed += 1
      continue
    }
    const have = matchExisting(photo.fileName, photo.photoId, names)
    if (have && (await hasFile(join(folder, have)))) {
      already.push({ file_name: have, source_url: photo.sourceUrl })
      continue
    }
    todo.push(photo)
  }
  recordPhotos(db, listingId, already)
  counts.alreadyHad = already.length
  counts.onDisk = already.length

  const total = result.photos.length
  let done = total - todo.length
  report(
    'framing',
    todo.length > 0 ? framingLabel(done, total) : 'Every photo is already in the folder',
    done,
    total
  )

  const pace = createPacer(deps.intervalMs ?? REQUEST_INTERVAL_MS, deps.now, (ms) =>
    deps.sleep(ms, signal)
  )
  let status: CaptureOutcome['status'] = 'complete'
  let error: CaptureFailure | null = null
  let networkStreak = 0
  for (const photo of todo) {
    if (signal.aborted) {
      status = 'cancelled'
      break
    }
    try {
      const r = await downloadPhoto(photo, join(folder, photo.fileName), {
        fetch: deps.fetch,
        pace,
        sleep: deps.sleep,
        signal,
        headers: deps.headers
      })
      if (r.status === 'downloaded') {
        recordPhotos(db, listingId, [{ file_name: photo.fileName, source_url: r.url }])
        counts.downloaded += 1
        counts.onDisk += 1
        networkStreak = 0
      } else if (r.status === 'not-found') {
        log(`not found: ${r.url}`)
        counts.notFound += 1
        networkStreak = 0
      } else {
        log(`failed: ${photo.fileName}: ${r.reason}`)
        counts.failed += 1
        networkStreak = r.network ? networkStreak + 1 : 0
      }
    } catch (err) {
      if (err instanceof CancelledError || signal.aborted) {
        status = 'cancelled'
        break
      }
      status = 'failed'
      error = {
        code: 'unexpected',
        message: `Couldn't save photos into ${folder} (${(err as Error).message}). Check the disk has space.`,
        manualFallback: false,
        site: result.site
      }
      break
    }
    done += 1
    report('framing', framingLabel(done, total), done, total)
    if (networkStreak >= NETWORK_DOWN_AFTER) {
      status = 'failed'
      error = networkFailure(counts.onDisk)
      break
    }
  }

  // Whole listing, not just this run (a manual paste may add to an earlier survey).
  counts.onDisk = countPhotos(db, listingId)

  // ---- Property_Details.txt -------------------------------------------------------------------
  const notes: string[] = []
  const warnings = [...result.warnings, ...downloadWarnings(counts)]
  const dup = duplicateNote(counts.duplicates)
  if (dup) notes.push(dup)

  let detailsFile: CaptureOutcome['detailsFile'] = 'not-written'
  const detailsPath = join(folder, DETAILS_FILE_NAME)
  try {
    const current = await readFile(detailsPath, 'utf8').catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return null
      throw err
    })
    if (detailsFileState(current) === 'edited') {
      detailsFile = 'kept-edited'
      notes.push(`${DETAILS_FILE_NAME} was edited by hand, so it was left as it is.`)
    } else {
      const text = formatPropertyDetails({
        site: result.site,
        externalId: result.externalId,
        url: result.url,
        details: result.details,
        counts,
        surveyedAt: new Date(deps.now())
      })
      await writeFileAtomic(detailsPath, Buffer.from(text, 'utf8'))
      detailsFile = 'written'
    }
  } catch (err) {
    warnings.push(`Couldn't write ${DETAILS_FILE_NAME} (${(err as Error).message}).`)
  }

  return finish({ status, listing: listingRef, notes, warnings, detailsFile, error })
}
