import { app, BrowserWindow, dialog, ipcMain, net, shell, type IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  IPC,
  type AppState,
  type CaptureOutcome,
  type CaptureProgress,
  type DetectedListing,
  type LibraryInfo,
  type ListingNote,
  type ListingView,
  type ManualCaptureRequest,
  type RecentListing,
  type SaveDetailsOutcome,
  type TrashReport,
  type Result,
  type Settings
} from '../shared/ipc'
import { failureOutcome, runCapture, type CaptureDeps, type CaptureInput } from './capture/run'
import type { DB } from './db'
import { countPhotos, findListing, getListing, listRecentListings } from './db/listings'
import { saveListingNote } from './db/notes'
import { listPeople, updatePerson } from './db/queries'
import { openLibrary } from './library'
import { regenerateDetailsFile, saveListingDetails } from './listing/details'
import {
  isId,
  parseSaveDetailsRequest,
  parseSaveNoteRequest,
  parseTrashRequest
} from './listing/requests'
import { trashPhotos } from './listing/trash'
import { loadListingView } from './listing/view'
import { mediaUrl } from './media'
import { isKnownListingUrl, listingFolderPath } from './pathGuard'
import { LISTINGS_DIR_NAME } from './paths'
import { validatePersonInput } from './people'
import { detectListing } from './scrapers/detect'
import { scrapeListing, scraperUserAgent } from './scrapers/driver'
import { SITE_NAME } from './scrapers/types'
import { loadSettings, saveSettings } from './settings'

/** Holds the open library and settings for the lifetime of the app. */
class AppContext {
  private readonly settingsFile = join(app.getPath('userData'), 'settings.json')
  settings: Settings
  library: LibraryInfo
  db: DB
  /** The running capture, if any. Only one at a time. */
  capture: AbortController | null = null

  constructor() {
    this.settings = loadSettings(this.settingsFile, homedir())
    const { info, db } = openLibrary(this.settings.libraryRoot)
    this.library = info
    this.db = db
    this.ensureCurrentPerson()
    saveSettings(this.settingsFile, this.settings)
  }

  state(): AppState {
    return {
      settings: { ...this.settings },
      library: { ...this.library },
      people: listPeople(this.db)
    }
  }

  /** Opens the new library first, so a failure leaves the old one in place. */
  switchLibrary(root: string): void {
    if (this.capture) {
      throw new Error('Wait for the survey to finish (or cancel it) before changing the folder.')
    }
    const { info, db } = openLibrary(root)
    this.db.close()
    this.db = db
    this.library = info
    this.settings.libraryRoot = root
    this.ensureCurrentPerson()
    saveSettings(this.settingsFile, this.settings)
  }

  setCurrentPerson(id: number): void {
    if (!listPeople(this.db).some((p) => p.id === id)) throw new Error(`No person with id ${id}`)
    this.settings.currentPersonId = id
    saveSettings(this.settingsFile, this.settings)
  }

  close(): void {
    this.capture?.abort()
    this.db.close()
  }

  private ensureCurrentPerson(): void {
    const people = listPeople(this.db)
    if (!people.some((p) => p.id === this.settings.currentPersonId)) {
      this.settings.currentPersonId = people[0]?.id ?? null
    }
  }
}

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : String(err) }
}

const log = (message: string): void => console.info(`[capture] ${message}`)

function captureDeps(ctx: AppContext): CaptureDeps {
  return {
    db: ctx.db,
    libraryRoot: ctx.library.root,
    scrape: (url, { signal, onStage }) => scrapeListing(url, { signal, onStage, log }),
    // Chromium's network stack (system proxy settings etc.); no cookies are set on it.
    fetch: (url, init) => net.fetch(url, { signal: init.signal, headers: init.headers }),
    sleep: (ms, signal) => delay(ms, undefined, { signal }),
    now: Date.now,
    headers: {
      'User-Agent': scraperUserAgent(),
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
    },
    log
  }
}

function toRecent(row: ReturnType<typeof listRecentListings>[number]): RecentListing {
  return {
    id: row.id,
    site: row.site,
    externalId: row.external_id,
    url: row.url,
    title: row.title,
    price: row.price,
    suburb: row.suburb,
    city: row.city,
    folderName: row.folder_path.slice(LISTINGS_DIR_NAME.length + 1),
    photosOnDisk: row.photos_on_disk,
    photosExpected: row.photo_count_expected,
    taggedPhotos: row.tagged_photos,
    taggedPercent:
      row.photos_on_disk > 0 ? Math.floor((row.tagged_photos * 100) / row.photos_on_disk) : 0,
    createdAt: row.created_at,
    thumbnailUrl: row.first_photo ? mediaUrl(`${row.folder_path}/${row.first_photo}`) : null
  }
}

const MAX_MANUAL_TEXT = 200_000

function parseManualRequest(raw: unknown): ManualCaptureRequest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.url !== 'string' || typeof r.text !== 'string') return null
  if (r.text.length > MAX_MANUAL_TEXT) return null
  const suburb = typeof r.suburb === 'string' ? r.suburb.trim().slice(0, 80) || null : null
  return { url: r.url, text: r.text, suburb }
}

export function registerIpc(getWindow: () => BrowserWindow | null): AppContext {
  const ctx = new AppContext()

  /** Only accept calls from our own main window. */
  const trusted = (event: IpcMainInvokeEvent): boolean => event.sender === getWindow()?.webContents

  const handle = <A extends unknown[], R>(
    channel: string,
    fn: (...args: A) => Promise<R> | R
  ): void => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!trusted(event)) throw new Error('Untrusted IPC sender')
      return fn(...(args as A))
    })
  }

  handle(IPC.getState, (): AppState => ctx.state())

  handle(IPC.chooseLibraryFolder, async (): Promise<Result<AppState> | null> => {
    const win = getWindow()
    const options = {
      title: 'Choose PlanBoard library folder',
      defaultPath: ctx.library.root,
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>
    }
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    const folder = picked.filePaths[0]
    if (picked.canceled || !folder) return null
    try {
      ctx.switchLibrary(folder)
      return { ok: true, value: ctx.state() }
    } catch (err) {
      return fail(err)
    }
  })

  handle(IPC.updatePerson, (input: unknown): Result<AppState> => {
    const valid = validatePersonInput(input)
    if (!valid.ok) return valid
    try {
      updatePerson(ctx.db, valid.value)
      return { ok: true, value: ctx.state() }
    } catch (err) {
      return fail(err)
    }
  })

  handle(IPC.detectListing, (url: unknown): Result<DetectedListing> => {
    if (typeof url !== 'string') return { ok: false, error: 'Invalid URL' }
    try {
      const listing = detectListing(url)
      const row = findListing(ctx.db, listing.site, listing.externalId)
      return {
        ok: true,
        value: {
          ...listing,
          siteName: SITE_NAME[listing.site],
          existing: row
            ? { id: row.id, suburb: row.suburb, photosOnDisk: countPhotos(ctx.db, row.id) }
            : null
        }
      }
    } catch (err) {
      return fail(err)
    }
  })

  const runOne = async (input: CaptureInput): Promise<CaptureOutcome> => {
    if (ctx.capture) {
      return failureOutcome({
        code: 'busy',
        message: 'A survey is already running. Wait for it to finish or cancel it.',
        manualFallback: false,
        site: null
      })
    }
    const controller = new AbortController()
    ctx.capture = controller
    const emit = (progress: CaptureProgress): void => {
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.send(IPC.captureProgress, progress)
    }
    try {
      const outcome = await runCapture(captureDeps(ctx), input, controller.signal, emit)
      const c = outcome.counts
      log(
        `${outcome.status}: ${outcome.listing?.folderName ?? input.url} found ${c.found}, ` +
          `downloaded ${c.downloaded}, already had ${c.alreadyHad}, not found ${c.notFound}, ` +
          `failed ${c.failed}, on disk ${c.onDisk}, ${Math.round(outcome.durationMs / 1000)} s`
      )
      return outcome
    } finally {
      ctx.capture = null
    }
  }

  handle(IPC.startCapture, (url: unknown): Promise<CaptureOutcome> | CaptureOutcome => {
    if (typeof url !== 'string') {
      return failureOutcome({
        code: 'unsupported-site',
        message: 'Invalid URL',
        manualFallback: false,
        site: null
      })
    }
    return runOne({ kind: 'scrape', url })
  })

  handle(IPC.startManualCapture, (raw: unknown): Promise<CaptureOutcome> | CaptureOutcome => {
    const request = parseManualRequest(raw)
    if (!request) {
      return failureOutcome({
        code: 'invalid-manual-input',
        message: 'The pasted text could not be read.',
        manualFallback: true,
        site: null
      })
    }
    return runOne({ kind: 'manual', ...request })
  })

  handle(IPC.cancelCapture, (): void => {
    ctx.capture?.abort()
  })

  handle(IPC.listRecent, (): Result<RecentListing[]> => {
    try {
      return { ok: true, value: listRecentListings(ctx.db).map(toRecent) }
    } catch (err) {
      return fail(err)
    }
  })

  handle(IPC.openListingFolder, async (id: unknown): Promise<Result<null>> => {
    if (!isId(id)) return { ok: false, error: 'Invalid id' }
    const row = getListing(ctx.db, id)
    if (!row) return { ok: false, error: 'This listing is no longer in the library.' }
    const folder = listingFolderPath(ctx.library.root, row.folder_path)
    if (!folder) return { ok: false, error: 'This listing’s folder is outside the library.' }
    if (!existsSync(folder)) return { ok: false, error: `The folder is missing: ${folder}` }
    const error = await shell.openPath(folder)
    return error ? { ok: false, error } : { ok: true, value: null }
  })

  handle(IPC.openListingUrl, async (id: unknown): Promise<Result<null>> => {
    if (!isId(id)) return { ok: false, error: 'Invalid id' }
    const row = getListing(ctx.db, id)
    if (!row) return { ok: false, error: 'This listing is no longer in the library.' }
    if (!isKnownListingUrl(row.url)) {
      return { ok: false, error: 'Only Property24 and Private Property links can be opened.' }
    }
    try {
      await shell.openExternal(row.url)
      return { ok: true, value: null }
    } catch (err) {
      return fail(err)
    }
  })

  const GONE = 'This listing is no longer in the library.'

  const view = async (id: number): Promise<ListingView> => {
    const v = await loadListingView(ctx.db, ctx.library.root, id)
    if (!v) throw new Error(GONE)
    return v
  }

  handle(IPC.getListing, async (id: unknown): Promise<Result<ListingView>> => {
    if (!isId(id)) return { ok: false, error: 'Invalid id' }
    try {
      return { ok: true, value: await view(id) }
    } catch (err) {
      return fail(err)
    }
  })

  handle(IPC.trashPhotos, async (raw: unknown): Promise<Result<TrashReport>> => {
    const request = parseTrashRequest(raw)
    if (!request) return { ok: false, error: 'Invalid request' }
    if (ctx.capture) {
      return { ok: false, error: 'Wait for the survey to finish before removing photos.' }
    }
    try {
      if (!getListing(ctx.db, request.listingId)) return { ok: false, error: GONE }
      const r = await trashPhotos(
        {
          db: ctx.db,
          libraryRoot: ctx.library.root,
          trashItem: (path) => shell.trashItem(path),
          now: Date.now
        },
        request.listingId,
        request.photoIds
      )
      for (const f of r.failed) log(`trash failed: ${f.fileName}: ${f.reason}`)
      // Keep "Photos: N in this folder" true (only if the file is still PlanBoard's own).
      if (r.trashed.length + r.missing.length > 0) {
        await regenerateDetailsFile(
          { db: ctx.db, libraryRoot: ctx.library.root, now: Date.now },
          request.listingId,
          'if-ours'
        ).catch((err: unknown) => log(`details file not updated: ${String(err)}`))
      }
      return {
        ok: true,
        value: {
          trashed: r.trashed.length,
          alreadyMissing: r.missing.length,
          failed: r.failed,
          view: await view(request.listingId)
        }
      }
    } catch (err) {
      return fail(err)
    }
  })

  handle(IPC.saveListingDetails, async (raw: unknown): Promise<Result<SaveDetailsOutcome>> => {
    const request = parseSaveDetailsRequest(raw)
    if (!request) return { ok: false, error: 'Invalid request' }
    if (ctx.capture) {
      return { ok: false, error: 'Wait for the survey to finish before saving the details.' }
    }
    try {
      const r = await saveListingDetails(
        { db: ctx.db, libraryRoot: ctx.library.root, now: Date.now },
        request.listingId,
        request.fields,
        request.fileMode
      )
      if (r.status === 'not-found') return { ok: false, error: GONE }
      if (r.status !== 'saved') return { ok: true, value: r }
      return { ok: true, value: { ...r, view: await view(request.listingId) } }
    } catch (err) {
      return fail(err)
    }
  })

  handle(IPC.saveListingNote, (raw: unknown): Result<ListingNote> => {
    const request = parseSaveNoteRequest(raw)
    if (!request) return { ok: false, error: 'Invalid request' }
    // Only the person in "Tagging as" can write; the other person's note is read-only.
    if (request.personId !== ctx.settings.currentPersonId) {
      return { ok: false, error: 'Switch “Tagging as” to this person to edit their note.' }
    }
    try {
      if (!getListing(ctx.db, request.listingId)) return { ok: false, error: GONE }
      const row = saveListingNote(
        ctx.db,
        request.listingId,
        request.personId,
        request.text,
        Date.now()
      )
      return {
        ok: true,
        value: { personId: row.person_id, text: row.why_saved, updatedAt: row.updated_at }
      }
    } catch (err) {
      return fail(err)
    }
  })

  handle(IPC.setCurrentPerson, (id: unknown): Result<AppState> => {
    if (typeof id !== 'number' || !Number.isInteger(id)) return { ok: false, error: 'Invalid id' }
    try {
      ctx.setCurrentPerson(id)
      return { ok: true, value: ctx.state() }
    } catch (err) {
      return fail(err)
    }
  })

  return ctx
}
