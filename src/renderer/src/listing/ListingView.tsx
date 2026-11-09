import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppState,
  ListingNote,
  ListingView as ListingData,
  PhotoNote,
  PhotoTagging,
  TagSummary,
  TrashReport
} from '../../../shared/ipc'
import { Modal } from '../components/Modal'
import { Divider, SectionLabel } from '../components/Ornament'
import { DetailsPanel } from './DetailsPanel'
import { ListingNotes } from './ListingNotes'
import { PhotoGrid } from './PhotoGrid'
import { PhotoPreview } from './PhotoPreview'

interface ListingViewProps {
  listingId: number
  state: AppState
  /** A survey is running (any listing): trash, save and Survey again wait for it. */
  captureRunning: boolean
  onBack(): void
  onSurveyAgain(url: string): void
  /** Registers "are there unsaved edits?" for the app's leave guard. */
  registerGuard(isDirty: (() => boolean) | null): void
}

const SITE_SHORT: Record<ListingData['site'], string> = { p24: 'P24', pp: 'PP' }

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

type TrashSummary = Omit<TrashReport, 'view'>

export function ListingView({
  listingId,
  state,
  captureRunning,
  onBack,
  onSurveyAgain,
  registerGuard
}: ListingViewProps): React.JSX.Element {
  const [data, setData] = useState<ListingData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [marked, setMarked] = useState<ReadonlySet<number>>(() => new Set())
  const [preview, setPreview] = useState<number | null>(null)
  const [confirmTrash, setConfirmTrash] = useState(false)
  const [trashing, setTrashing] = useState(false)
  const [trashResult, setTrashResult] = useState<TrashSummary | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  /** Remounts the details form with fresh values (only when it has no unsaved edits). */
  const [formKey, setFormKey] = useState(0)
  const dirty = useRef(false)
  /** Every tag in the library, for auto-complete. */
  const [tags, setTags] = useState<TagSummary[]>([])

  useEffect(() => {
    registerGuard(() => dirty.current)
    return () => {
      registerGuard(null)
      window.planboard.setUnsavedDetails(false)
    }
  }, [registerGuard])

  const applyView = useCallback((next: ListingData) => {
    setData(next)
    setLoadError(null)
    if (!dirty.current) setFormKey((k) => k + 1)
    const ids = new Set(next.photos.map((p) => p.id))
    setMarked((m) => new Set([...m].filter((id) => ids.has(id))))
    setPreview((i) => (i === null ? null : Math.min(i, next.photos.length - 1)))
  }, [])

  // Load on open, and again when a survey finishes (it may have added photos to this one).
  useEffect(() => {
    let live = true
    window.planboard
      .getListing(listingId)
      .then((r) => {
        if (!live) return
        if (r.ok) applyView(r.value)
        else setLoadError(r.error)
      })
      .catch((err: unknown) => live && setLoadError(String(err)))
    return () => {
      live = false
    }
  }, [listingId, captureRunning, applyView])

  const loadTags = useCallback(() => {
    window.planboard
      .listTags()
      .then((r) => {
        if (r.ok) setTags(r.value)
      })
      .catch(() => undefined)
  }, [])
  useEffect(loadTags, [loadTags])

  /** Applies tagging results from main to the photos they belong to. */
  const applyTagging = useCallback((updates: PhotoTagging[]) => {
    const byId = new Map(updates.map((u) => [u.photoId, u]))
    setData((d) =>
      d
        ? {
            ...d,
            photos: d.photos.map((p) => {
              const u = byId.get(p.id)
              return u ? { ...p, room: u.room, tags: u.tags, notes: u.notes } : p
            })
          }
        : d
    )
  }, [])
  const applyOne = useCallback((t: PhotoTagging) => applyTagging([t]), [applyTagging])

  const onPhotoNoteSaved = useCallback((photoId: number, note: PhotoNote) => {
    setData((d) =>
      d
        ? {
            ...d,
            photos: d.photos.map((p) =>
              p.id === photoId
                ? {
                    ...p,
                    notes: [...p.notes.filter((n) => n.personId !== note.personId), note].sort(
                      (a, b) => a.personId - b.personId
                    )
                  }
                : p
            )
          }
        : d
    )
  }, [])

  const toggle = useCallback((photoId: number) => {
    setTrashResult(null)
    setMarked((m) => {
      const next = new Set(m)
      if (next.has(photoId)) next.delete(photoId)
      else next.add(photoId)
      return next
    })
  }, [])

  const openPreview = useCallback((index: number) => setPreview(index), [])

  // Main's quit guard needs to know too (Cmd+Q and the window's close button).
  const setDirty = useCallback((d: boolean) => {
    if (dirty.current !== d) window.planboard.setUnsavedDetails(d)
    dirty.current = d
  }, [])

  const onNoteSaved = useCallback((note: ListingNote) => {
    setData((d) =>
      d ? { ...d, notes: [...d.notes.filter((n) => n.personId !== note.personId), note] } : d
    )
  }, [])

  const onDetailsSaved = useCallback(
    (next: ListingData) => {
      setDirty(false)
      setData(next)
    },
    [setDirty]
  )

  const act = async (
    fn: (id: number) => Promise<{ ok: boolean; error?: string }>
  ): Promise<void> => {
    const r = await fn(listingId)
    setActionError(r.ok ? null : (r.error ?? 'Something went wrong'))
  }

  const moveToTrash = async (): Promise<void> => {
    setTrashing(true)
    try {
      const r = await window.planboard.trashPhotos({ listingId, photoIds: [...marked] })
      if (!r.ok) {
        setActionError(r.error)
        return
      }
      const { view, ...summary } = r.value
      setTrashResult(summary)
      setActionError(null)
      // Photos that could not be moved stay marked, so they can be tried again.
      applyView(view)
    } catch (err) {
      setActionError(String(err))
    } finally {
      setTrashing(false)
      setConfirmTrash(false)
    }
  }

  if (loadError) {
    return (
      <section className="page page--wide" aria-label="Listing">
        <div>
          <button type="button" className="pill back-link" onClick={onBack}>
            ← Recent surveys
          </button>
        </div>
        <p className="notice notice--error" role="alert">
          {loadError}
        </p>
      </section>
    )
  }
  if (!data) return <p className="notice">Opening the listing…</p>

  const f = data.fields
  const count = data.photos.length
  const short = data.photosExpected !== null && count < data.photosExpected
  const markedCount = marked.size

  return (
    <section className="page page--wide listing" aria-labelledby="listing-heading">
      <div className="listing__top">
        <button type="button" className="pill back-link" onClick={onBack}>
          ← Recent surveys
        </button>
      </div>

      <header className="page-title listing__title">
        <span className="page-title__kicker listing__kicker">
          <span className="site-badge site-badge--small" title={data.siteName}>
            <span className="site-badge__code">{SITE_SHORT[data.site]}</span>
            {data.externalId}
          </span>
          {[f.suburb, f.city].filter(Boolean).join(' · ')}
        </span>
        <h1 className="page-title__h1" id="listing-heading">
          {f.suburb ?? 'Unknown suburb'}
        </h1>
        {f.title && <p className="listing__subtitle">{f.title}</p>}
        <Divider />
      </header>

      <dl className="listing__facts">
        <div>
          <dt>Price</dt>
          <dd>{f.price ?? '—'}</dd>
        </div>
        <div>
          <dt>Photos</dt>
          <dd className={short ? 'listing__short' : undefined}>
            {data.photosExpected !== null ? `${count} / ${data.photosExpected}` : count}
          </dd>
        </div>
        <div>
          <dt>Beds · Baths · Garages</dt>
          <dd>
            {[f.bedrooms, f.bathrooms, f.garages].map((v) => (v === null ? '—' : v)).join(' · ')}
          </dd>
        </div>
        <div>
          <dt>Surveyed</dt>
          <dd>{formatDate(data.surveyedAt ?? data.createdAt)}</dd>
        </div>
      </dl>

      <div className="actions listing__actions">
        <button
          type="button"
          className="pill pill--primary"
          onClick={() => void act(window.planboard.openListingFolder)}
        >
          Open folder
        </button>
        <button
          type="button"
          className="pill"
          onClick={() => void act(window.planboard.openListingUrl)}
        >
          Open original listing
        </button>
        <button
          type="button"
          className="pill"
          onClick={() => onSurveyAgain(data.url)}
          disabled={captureRunning}
          aria-describedby="survey-again-help"
        >
          Survey again
        </button>
      </div>
      <p id="survey-again-help" className="panel__help listing__help">
        {captureRunning
          ? 'A survey is running. Wait for it to finish before surveying again.'
          : short
            ? `Only ${count} of ${data.photosExpected} photos are here. Survey again to fetch the rest; photos already in the folder, and ones you removed, are skipped.`
            : 'Survey again skips photos already in the folder and ones you removed, and only fills in empty details.'}
      </p>
      {actionError && (
        <p className="alert alert--error" role="alert">
          {actionError}
        </p>
      )}

      <div className="panel" aria-labelledby="why-heading">
        <SectionLabel id="why-heading">Why we saved this house</SectionLabel>
        <ListingNotes
          listingId={data.id}
          people={state.people}
          currentPersonId={state.settings.currentPersonId}
          notes={data.notes}
          onSaved={onNoteSaved}
        />
      </div>

      <div className="listing__photos" aria-labelledby="photos-heading">
        <div className="listing__photos-head">
          <SectionLabel id="photos-heading">{`Photos · ${count}`}</SectionLabel>
          <span className="panel__help">
            Click a photo for the large preview. Untick the ones you don’t want.
          </span>
        </div>
        {trashResult && <TrashResultNote result={trashResult} />}
        {count === 0 ? (
          <div className="placeholder">
            <div className="gable-frame" aria-hidden="true">
              <span className="gable-frame__tag">No photos</span>
            </div>
            <p className="placeholder__blurb">
              No photos in this listing’s folder. Survey it again to download them.
            </p>
          </div>
        ) : (
          <PhotoGrid photos={data.photos} marked={marked} onOpen={openPreview} onToggle={toggle} />
        )}
      </div>

      {markedCount > 0 && (
        <div className="trash-bar" role="region" aria-label="Photos marked for removal">
          <span className="trash-bar__count">{plural(markedCount, 'photo')} marked</span>
          <button
            type="button"
            className="pill pill--on-green"
            onClick={() => setMarked(new Set())}
          >
            Unmark all
          </button>
          <button
            type="button"
            className="pill pill--brass"
            onClick={() => setConfirmTrash(true)}
            disabled={captureRunning}
          >
            Move to Trash
          </button>
        </div>
      )}

      <DetailsPanel key={formKey} view={data} onDirtyChange={setDirty} onSaved={onDetailsSaved} />

      {preview !== null && data.photos[preview] && (
        <PhotoPreview
          photos={data.photos}
          index={preview}
          marked={marked}
          people={state.people}
          currentPersonId={state.settings.currentPersonId}
          tags={tags}
          onIndex={setPreview}
          onToggle={toggle}
          onClose={() => setPreview(null)}
          onTagging={applyOne}
          onTagsChanged={loadTags}
          onNoteSaved={onPhotoNoteSaved}
        />
      )}

      {confirmTrash && (
        <Modal labelledBy="trash-title" onClose={() => !trashing && setConfirmTrash(false)}>
          <h2 id="trash-title" className="modal__title">
            Move {plural(markedCount, 'photo')} to the Trash?
          </h2>
          <p className="modal__body">
            The {markedCount === 1 ? 'file goes' : `${markedCount} files go`} to the macOS Trash, so
            you can still put {markedCount === 1 ? 'it' : 'them'} back from there until you empty
            it. PlanBoard won’t download {markedCount === 1 ? 'it' : 'them'} again when you survey
            this listing again.
          </p>
          <div className="actions modal__actions">
            <button
              type="button"
              className="pill"
              onClick={() => setConfirmTrash(false)}
              disabled={trashing}
              data-autofocus
            >
              Cancel
            </button>
            <button
              type="button"
              className="pill pill--primary"
              onClick={() => void moveToTrash()}
              disabled={trashing}
            >
              {trashing ? 'Moving…' : `Move ${plural(markedCount, 'photo')} to Trash`}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}

function TrashResultNote({ result }: { result: TrashSummary }): React.JSX.Element {
  const parts: string[] = []
  if (result.trashed > 0) parts.push(`Moved ${plural(result.trashed, 'photo')} to the Trash.`)
  if (result.alreadyMissing > 0) {
    parts.push(
      `${plural(result.alreadyMissing, 'photo was', 'photos were')} already missing from the folder, so ${result.alreadyMissing === 1 ? 'it is' : 'they are'} just removed from the list.`
    )
  }
  return (
    <div className={`alert${result.failed.length > 0 ? ' alert--error' : ''}`} role="status">
      {parts.length > 0 && <p className="alert__line">{parts.join(' ')}</p>}
      {result.failed.length > 0 && (
        <>
          <p className="alert__line">
            {plural(result.failed.length, 'photo')} couldn’t be moved and{' '}
            {result.failed.length === 1 ? 'is' : 'are'} still marked:
          </p>
          <ul className="alert__list">
            {result.failed.map((f) => (
              <li key={f.photoId}>
                <code>{f.fileName || `photo ${f.photoId}`}</code> — {f.reason}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
