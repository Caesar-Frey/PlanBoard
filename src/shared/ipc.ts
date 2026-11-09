/**
 * Types shared by the main process, the preload bridge and the renderer.
 * This file must stay free of runtime imports (no Node, no Electron, no DOM),
 * so every process can import it safely.
 */
import type { ListingFieldErrors, ListingFields, ListingFieldsInput } from './listingFields'

export interface Settings {
  /** Absolute path of the library root folder (holds planboard.db and listings/). */
  libraryRoot: string
  /** id of the person currently tagging, or null before anyone is chosen. */
  currentPersonId: number | null
}

export interface Person {
  id: number
  name: string
  /** Lower-case #rrggbb hex colour. */
  colour: string
}

export interface PersonInput {
  id: number
  name: string
  colour: string
}

export interface LibraryInfo {
  root: string
  listingsDir: string
  dbPath: string
}

export interface AppState {
  settings: Settings
  library: LibraryInfo
  people: Person[]
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

// ---------------------------------------------------------------------------------------------
// Capture (milestone 3)
// ---------------------------------------------------------------------------------------------

export type SiteId = 'p24' | 'pp'

/** Building stages shown on the progress bar (brief 4.1). */
export type CaptureStage = 'survey' | 'foundation' | 'framing' | 'handover'

export interface DetectedListing {
  site: SiteId
  siteName: string
  externalId: string
  /** Canonical listing URL. */
  url: string
  /** Set when this listing is already in the library (a re-run). */
  existing: { id: number; suburb: string | null; photosOnDisk: number } | null
}

/** Pushed from main on `IPC.captureProgress` while a capture runs. */
export interface CaptureProgress {
  stage: CaptureStage
  message: string
  /** Framing: photos handled so far (downloaded, already in the folder, or skipped). */
  done: number
  /** Framing: unique photos to handle. 0 before Framing starts. */
  total: number
  /** Whole run, 0..1, for the progress bar. */
  fraction: number
}

export interface CaptureCounts {
  /** Unique photos found by the scraper (or pasted in the manual fallback). */
  found: number
  /** Photo count the listing states, if known. */
  listed: number | null
  /** How many of `listed` are repeats of another photo in the same gallery. */
  duplicates: number
  /** Unique photos expected (`listed - duplicates`), if known. */
  expected: number | null
  downloaded: number
  /** Already in the folder from an earlier run: no request made. */
  alreadyHad: number
  /** Removed by the user earlier (milestone 4): never downloaded again. */
  removed: number
  /** The image host said 404/410. */
  notFound: number
  failed: number
  /** Photos of this listing now in the folder. */
  onDisk: number
}

export type CaptureErrorCode =
  | 'unsupported-site'
  | 'not-a-listing'
  | 'load-failed'
  | 'no-photos'
  | 'invalid-manual-input'
  | 'cancelled'
  | 'network'
  | 'busy'
  | 'unexpected'

/** A plain, serialisable error (class instances lose their type over IPC). */
export interface CaptureFailure {
  code: CaptureErrorCode
  /** Written for the user. */
  message: string
  /** Offer the paste-image-addresses fallback. */
  manualFallback: boolean
  site: SiteId | null
}

export interface CaptureListingRef {
  id: number
  site: SiteId
  externalId: string
  url: string
  title: string | null
  suburb: string | null
  /** Folder name inside `<library>/listings/`. */
  folderName: string
}

export interface CaptureOutcome {
  status: 'complete' | 'cancelled' | 'failed'
  /** Null when the run stopped before a folder was made. */
  listing: CaptureListingRef | null
  counts: CaptureCounts
  /** Small informational notes, e.g. "1 photo appears twice in the listing". */
  notes: string[]
  /** Things the user should act on, e.g. fewer photos than the listing states. */
  warnings: string[]
  /** What happened to Property_Details.txt. */
  detailsFile: 'written' | 'kept-edited' | 'not-written'
  error: CaptureFailure | null
  /** Manual fallback: pasted entries that were not usable. */
  rejected: { token: string; reason: string }[]
  durationMs: number
}

export interface ManualCaptureRequest {
  /** The listing address (needed for the site, id and folder name). */
  url: string
  /** Pasted image ids or image addresses. */
  text: string
  /** Suburb for the folder name when the listing is not in the library yet. */
  suburb: string | null
}

export interface RecentListing {
  id: number
  site: SiteId
  externalId: string
  url: string
  title: string | null
  price: string | null
  suburb: string | null
  city: string | null
  folderName: string
  photosOnDisk: number
  photosExpected: number | null
  taggedPhotos: number
  /** 0..100, rounded down. */
  taggedPercent: number
  createdAt: number
  /** `planboard-media://` URL of the first photo, or null if none. */
  thumbnailUrl: string | null
}

// ---------------------------------------------------------------------------------------------
// Listing view (milestone 4)
// ---------------------------------------------------------------------------------------------

export interface ListingPhoto {
  id: number
  fileName: string
  /** `planboard-media://` URL. */
  url: string
  room: string | null
}

export interface ListingNote {
  personId: number
  /** Null or empty: no note yet. */
  text: string | null
  updatedAt: number
}

/** `edited`: changed outside PlanBoard (checksum mismatch), so saving asks first. */
export type DetailsFileState = 'missing' | 'ours' | 'edited'

export interface ListingView {
  id: number
  site: SiteId
  siteName: string
  externalId: string
  url: string
  /** Folder name inside `<library>/listings/`. */
  folderName: string
  fields: ListingFields
  photosExpected: number | null
  createdAt: number
  /** Last survey; null for listings surveyed before milestone 4. */
  surveyedAt: number | null
  /** When the bond figures were read from the listing; null when none were. */
  bondAsOf: number | null
  /** Photos not removed, in gallery order. */
  photos: ListingPhoto[]
  detailsFile: DetailsFileState
  notes: ListingNote[]
}

export interface TrashPhotosRequest {
  listingId: number
  photoIds: number[]
}

export interface TrashReport {
  /** Moved to the macOS Trash. */
  trashed: number
  /** The file was already gone; just marked removed. */
  alreadyMissing: number
  failed: { photoId: number; fileName: string; reason: string }[]
  /** Fresh listing after the removal. */
  view: ListingView
}

/** `ask`: stop if Property_Details.txt was edited by hand. `keep`: save to the library only. */
export type DetailsFileMode = 'ask' | 'overwrite' | 'keep'

export interface SaveDetailsRequest {
  listingId: number
  fields: ListingFieldsInput
  fileMode: DetailsFileMode
}

export type SaveDetailsOutcome =
  | {
      status: 'saved'
      detailsFile: 'written' | 'kept-edited' | 'not-written'
      warning: string | null
      view: ListingView
    }
  | { status: 'invalid'; errors: ListingFieldErrors }
  /** Nothing was saved: ask the user whether to overwrite the hand-edited file. */
  | { status: 'file-edited' }

export interface SaveNoteRequest {
  listingId: number
  /** Must be the person currently tagging; main refuses anyone else. */
  personId: number
  text: string
}

// ---------------------------------------------------------------------------------------------
// Quit guard
// ---------------------------------------------------------------------------------------------

/** `quit`: Cmd+Q / PlanBoard → Quit. `close`: the window's close button. */
export type CloseKind = 'quit' | 'close'

/** IPC channel names. One place, so main and preload can't drift apart. */
export const IPC = {
  getState: 'planboard:get-state',
  chooseLibraryFolder: 'planboard:choose-library-folder',
  updatePerson: 'planboard:update-person',
  setCurrentPerson: 'planboard:set-current-person',
  detectListing: 'planboard:detect-listing',
  startCapture: 'planboard:start-capture',
  startManualCapture: 'planboard:start-manual-capture',
  cancelCapture: 'planboard:cancel-capture',
  /** main → renderer event carrying `CaptureProgress`. */
  captureProgress: 'planboard:capture-progress',
  listRecent: 'planboard:list-recent',
  openListingFolder: 'planboard:open-listing-folder',
  openListingUrl: 'planboard:open-listing-url',
  getListing: 'planboard:get-listing',
  trashPhotos: 'planboard:trash-photos',
  saveListingDetails: 'planboard:save-listing-details',
  saveListingNote: 'planboard:save-listing-note',
  /** renderer → main (send): the listing view has, or no longer has, unsaved detail edits. */
  setUnsavedDetails: 'planboard:set-unsaved-details',
  /** main → renderer event carrying a `CloseKind`: ask before closing. */
  closeRequested: 'planboard:close-requested',
  /** renderer → main (send): the answer, `true` to discard the edits and close. */
  answerClose: 'planboard:answer-close'
} as const

/** The API the preload script exposes on `window.planboard`. */
export interface PlanBoardApi {
  getState(): Promise<AppState>
  /** Opens a folder picker. Resolves to null if the user cancels. */
  chooseLibraryFolder(): Promise<Result<AppState> | null>
  updatePerson(input: PersonInput): Promise<Result<AppState>>
  setCurrentPerson(id: number): Promise<Result<AppState>>
  /** Checks a pasted URL without loading it. */
  detectListing(url: string): Promise<Result<DetectedListing>>
  /** Runs one capture; resolves when it ends (complete, cancelled or failed). */
  startCapture(url: string): Promise<CaptureOutcome>
  startManualCapture(request: ManualCaptureRequest): Promise<CaptureOutcome>
  /** Asks the running capture to stop. Files already downloaded are kept. */
  cancelCapture(): Promise<void>
  /** Subscribes to progress events. Returns the unsubscribe function. */
  onCaptureProgress(listener: (progress: CaptureProgress) => void): () => void
  listRecent(): Promise<Result<RecentListing[]>>
  openListingFolder(listingId: number): Promise<Result<null>>
  openListingUrl(listingId: number): Promise<Result<null>>
  getListing(listingId: number): Promise<Result<ListingView>>
  /** Moves the photos' files to the macOS Trash and marks them removed. */
  trashPhotos(request: TrashPhotosRequest): Promise<Result<TrashReport>>
  saveListingDetails(request: SaveDetailsRequest): Promise<Result<SaveDetailsOutcome>>
  /** Saves the current person's "Why we saved this house" note. */
  saveListingNote(request: SaveNoteRequest): Promise<Result<ListingNote>>
  /** Tells main whether quitting now would lose detail edits. */
  setUnsavedDetails(dirty: boolean): void
  /** Main is holding a close or quit for the unsaved details. Returns the unsubscribe function. */
  onCloseRequested(listener: (kind: CloseKind) => void): () => void
  /** `true`: discard the edits and go on closing or quitting. `false`: keep editing. */
  answerClose(discard: boolean): void
}
