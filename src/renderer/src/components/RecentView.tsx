import { useEffect, useState } from 'react'
import type { RecentListing } from '../../../shared/ipc'
import type { ViewId } from './Header'
import { PageTitle } from './Ornament'

interface RecentViewProps {
  /** Bumped after every capture so the list reloads. */
  version: number
  onNavigate(view: ViewId): void
  /** Opens the listing view. */
  onOpen(listingId: number): void
}

const SITE_SHORT: Record<RecentListing['site'], string> = { p24: 'P24', pp: 'PP' }

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function RecentView({ version, onNavigate, onOpen }: RecentViewProps): React.JSX.Element {
  const [rows, setRows] = useState<RecentListing[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    window.planboard
      .listRecent()
      .then((r) => {
        if (!live) return
        if (r.ok) {
          setRows(r.value)
          setError(null)
        } else setError(r.error)
      })
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      live = false
    }
  }, [version])

  let body: React.JSX.Element
  if (error) {
    body = (
      <p className="notice notice--error" role="alert">
        {error}
      </p>
    )
  } else if (!rows) {
    body = <p className="notice">Opening the survey book…</p>
  } else if (rows.length === 0) {
    body = (
      <div className="placeholder">
        <div className="gable-frame" aria-hidden="true">
          <span className="gable-frame__tag">No surveys yet</span>
        </div>
        <p className="placeholder__blurb">Paste a listing on the Capture screen to start.</p>
        <button type="button" className="pill pill--primary" onClick={() => onNavigate('capture')}>
          Go to Capture
        </button>
      </div>
    )
  } else {
    body = (
      <ul className="surveys">
        {rows.map((row) => (
          <SurveyRow key={row.id} row={row} onOpen={() => onOpen(row.id)} />
        ))}
      </ul>
    )
  }

  return (
    <section className="page page--wide" aria-label="Recent surveys">
      <PageTitle kicker="Newest first" title="Recent surveys" />
      {body}
    </section>
  )
}

interface SurveyRowProps {
  row: RecentListing
  onOpen(): void
}

function SurveyRow({ row, onOpen }: SurveyRowProps): React.JSX.Element {
  const [thumbFailed, setThumbFailed] = useState(false)
  const name = row.suburb ?? 'Unknown suburb'

  const photos =
    row.photosExpected !== null
      ? `${row.photosOnDisk} / ${row.photosExpected} photos`
      : `${row.photosOnDisk} photos`
  const short = row.photosExpected !== null && row.photosOnDisk < row.photosExpected

  return (
    <li className="survey">
      <button type="button" className="survey__row" onClick={onOpen}>
        <span className="survey__thumb" aria-hidden="true">
          {row.thumbnailUrl && !thumbFailed ? (
            <img
              src={row.thumbnailUrl}
              alt=""
              loading="lazy"
              onError={() => setThumbFailed(true)}
            />
          ) : null}
        </span>
        <span className="survey__main">
          <span className="survey__suburb">{name}</span>
          <span className="survey__title">{row.title ?? row.folderName}</span>
          <span className="survey__site">
            <span className="site-badge site-badge--small">
              <span className="site-badge__code">{SITE_SHORT[row.site]}</span>
              {row.externalId}
            </span>
            {row.city && <span className="survey__city">{row.city}</span>}
          </span>
        </span>
        <span className="survey__stat">
          <span className="survey__stat-label">Price</span>
          <span className="survey__stat-value">{row.price ?? '—'}</span>
        </span>
        <span className="survey__stat">
          <span className="survey__stat-label">Photos</span>
          <span className={`survey__stat-value${short ? ' survey__stat-value--short' : ''}`}>
            {photos}
          </span>
        </span>
        <span className="survey__stat">
          <span className="survey__stat-label">Tagged</span>
          <span className="survey__stat-value">{row.taggedPercent}%</span>
        </span>
        <span className="survey__stat">
          <span className="survey__stat-label">Surveyed</span>
          <span className="survey__stat-value">{formatDate(row.createdAt)}</span>
        </span>
      </button>
    </li>
  )
}
