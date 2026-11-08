import { useEffect, useState } from 'react'
import type { AppState, DetectedListing, Result } from '../../../shared/ipc'
import type { ViewId } from '../components/Header'
import { PageTitle, SectionLabel } from '../components/Ornament'
import { ManualFallback } from './ManualFallback'
import { Outcome } from './Outcome'
import { StageProgress } from './StageProgress'
import type { CaptureControls } from './useCapture'

interface CaptureViewProps {
  state: AppState
  apply(result: Result<AppState> | null): string | null
  capture: CaptureControls
  onNavigate(view: ViewId): void
}

const SITE_SHORT: Record<DetectedListing['site'], string> = { p24: 'P24', pp: 'PP' }

export function CaptureView({
  state,
  apply,
  capture,
  onNavigate
}: CaptureViewProps): React.JSX.Element {
  const [url, setUrl] = useState(capture.url ?? '')
  const [check, setCheck] = useState<{ url: string; result: Result<DetectedListing> } | null>(null)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)

  // Check the pasted address as the user types (no page is loaded for this).
  useEffect(() => {
    if (url.trim() === '') return
    let live = true
    const timer = setTimeout(() => {
      void window.planboard.detectListing(url).then((result) => {
        if (live) setCheck({ url, result })
      })
    }, 200)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [url, capture.outcome])

  // Only trust a check made for the text currently in the box.
  const detected = url.trim() !== '' && check?.url === url ? check.result : null
  const listing = detected?.ok ? detected.value : null
  const busy = capture.running

  const survey = (event: React.FormEvent): void => {
    event.preventDefault()
    if (listing && !busy) capture.start(listing.url)
  }

  const chooseFolder = async (): Promise<void> => {
    setChoosing(true)
    setFolderError(null)
    try {
      setFolderError(apply(await window.planboard.chooseLibraryFolder()))
    } finally {
      setChoosing(false)
    }
  }

  const outcome = capture.outcome
  const showManual = !busy && outcome?.error?.manualFallback === true && capture.url !== null

  return (
    <section className="page" aria-label="Capture">
      <PageTitle kicker="Paste a listing" title="Capture" />

      <form className="panel" onSubmit={survey} aria-labelledby="capture-heading">
        <SectionLabel id="capture-heading">Listing address</SectionLabel>
        <div className="url-row">
          <label className="visually-hidden" htmlFor="listing-url">
            Property24 or Private Property listing address
          </label>
          <input
            id="listing-url"
            className="field__input url-row__input"
            type="url"
            inputMode="url"
            placeholder="https://www.property24.com/for-sale/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            aria-invalid={detected && !detected.ok ? true : undefined}
            aria-describedby="listing-url-status"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="submit"
            className="pill pill--primary pill--wide"
            disabled={!listing || busy}
          >
            {busy ? 'Surveying…' : 'Survey'}
          </button>
        </div>
        <div id="listing-url-status" className="url-status">
          {listing && (
            <>
              <span className="site-badge" title={listing.siteName}>
                <span className="site-badge__code">{SITE_SHORT[listing.site]}</span>
                {listing.siteName}
              </span>
              <span className="url-status__id">Listing {listing.externalId}</span>
            </>
          )}
          {detected && !detected.ok && (
            <span className="field-error" role="alert">
              {detected.error}
            </span>
          )}
          {!detected && (
            <span className="panel__help">
              Paste one listing from Property24 or Private Property.
            </span>
          )}
        </div>
        {listing?.existing && !busy && (
          <p className="panel__help">
            Already in your library ({listing.existing.photosOnDisk} photos). Surveying again only
            downloads photos that aren’t in the folder yet, and updates the details.
          </p>
        )}

        <div className="folder-row folder-row--compact">
          <span className="field__label">Saving to</span>
          <code className="folder-row__path" title={state.library.listingsDir}>
            {state.library.listingsDir}
          </code>
          <button
            type="button"
            className="pill"
            onClick={() => void chooseFolder()}
            disabled={choosing || busy}
          >
            Change folder
          </button>
        </div>
        {folderError && (
          <p className="field-error" role="alert">
            {folderError}
          </p>
        )}
      </form>

      {(busy || outcome) && (
        <div className="panel" aria-labelledby="progress-heading">
          <SectionLabel id="progress-heading">
            {outcome?.status === 'complete' ? 'Handover' : 'Progress'}
          </SectionLabel>
          <StageProgress progress={capture.progress} outcome={outcome} running={busy} />
          {busy && (
            <div className="actions">
              <button
                type="button"
                className="pill"
                onClick={capture.cancel}
                disabled={capture.cancelling}
              >
                {capture.cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
              <span className="panel__help">Photos already downloaded are kept.</span>
            </div>
          )}
          {!busy && outcome && (
            <Outcome
              outcome={outcome}
              onShowRecent={() => onNavigate('recent')}
              onReset={() => {
                capture.reset()
                setUrl('')
              }}
              onRetry={() => capture.url && capture.start(capture.url)}
            />
          )}
        </div>
      )}

      {showManual && capture.url && (
        <div className="panel">
          <SectionLabel>Manual fallback</SectionLabel>
          <ManualFallback
            key={capture.url}
            url={capture.url}
            site={outcome?.error?.site ?? listing?.site ?? null}
            knownSuburb={listing?.existing?.suburb ?? null}
            inLibrary={Boolean(listing?.existing)}
            disabled={busy}
            onSubmit={capture.startManual}
          />
        </div>
      )}
    </section>
  )
}
