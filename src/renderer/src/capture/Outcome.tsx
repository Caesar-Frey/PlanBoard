import { useState } from 'react'
import type { CaptureOutcome } from '../../../shared/ipc'
import { isComplete } from '../../../shared/progress'

interface OutcomeProps {
  outcome: CaptureOutcome
  onShowListing(listingId: number): void
  onReset(): void
  onRetry(): void
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

function seconds(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}

/** Handover summary, cancelled summary or error (without the manual form, see CaptureView). */
export function Outcome({
  outcome,
  onShowListing,
  onReset,
  onRetry
}: OutcomeProps): React.JSX.Element {
  const [openError, setOpenError] = useState<string | null>(null)
  const c = outcome.counts
  const complete = isComplete(c)
  const listing = outcome.listing

  const openFolder = async (): Promise<void> => {
    if (!listing) return
    const r = await window.planboard.openListingFolder(listing.id)
    setOpenError(r.ok ? null : r.error)
  }

  let heading: string
  if (outcome.status === 'complete') {
    heading = complete
      ? `${plural(c.onDisk, 'photo')} in the folder`
      : `Only ${c.onDisk} of ${c.expected ?? c.found} photos in the folder`
  } else if (outcome.status === 'cancelled') {
    heading = listing
      ? `Survey cancelled — ${plural(c.onDisk, 'photo')} kept`
      : 'Survey cancelled before any photos were saved'
  } else {
    heading = listing ? 'The survey stopped part-way' : 'The survey could not start'
  }

  const rows: [string, number][] = (
    [
      ['Downloaded now', c.downloaded],
      ['Already in the folder', c.alreadyHad],
      ['Removed earlier (not downloaded again)', c.removed],
      ['No longer on the site', c.notFound],
      ['Failed', c.failed]
    ] as [string, number][]
  ).filter(([label, n]) => n > 0 || label === 'Downloaded now')

  return (
    <div className="outcome" aria-live="polite">
      <p className={`outcome__heading outcome__heading--${outcome.status}`}>{heading}</p>
      {listing && (
        <p className="outcome__folder">
          <code>listings/{listing.folderName}</code>
        </p>
      )}

      {outcome.error && (
        <p className="alert alert--error" role="alert">
          {outcome.error.message}
        </p>
      )}

      {!complete && outcome.status === 'complete' && (
        <p className="alert" role="alert">
          Fewer photos than the listing states. Survey it again to retry, or add the missing ones by
          hand.
        </p>
      )}

      {outcome.warnings.length > 0 && (
        <ul className="alert alert--list">
          {outcome.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {listing && (
        <dl className="tally">
          {rows.map(([label, n]) => (
            <div key={label} className="tally__row">
              <dt>{label}</dt>
              <dd>{n}</dd>
            </div>
          ))}
          <div className="tally__row">
            <dt>Listing shows</dt>
            <dd>{c.listed ?? 'not stated'}</dd>
          </div>
          <div className="tally__row">
            <dt>Time taken</dt>
            <dd>{seconds(outcome.durationMs)}</dd>
          </div>
        </dl>
      )}

      {outcome.notes.length > 0 && (
        <ul className="notes">
          {outcome.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {outcome.rejected.length > 0 && (
        <details className="rejected">
          <summary>
            {plural(outcome.rejected.length, 'pasted entry', 'pasted entries')} skipped
          </summary>
          <ul>
            {outcome.rejected.map((r) => (
              <li key={r.token}>
                <code>{r.token}</code> — {r.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="actions">
        {listing && (
          <button type="button" className="pill pill--primary" onClick={() => void openFolder()}>
            Open folder
          </button>
        )}
        {listing && (
          <button type="button" className="pill" onClick={() => onShowListing(listing.id)}>
            See listing
          </button>
        )}
        {outcome.status !== 'complete' && outcome.error?.code !== 'unsupported-site' && (
          <button type="button" className="pill" onClick={onRetry}>
            Survey again
          </button>
        )}
        <button type="button" className="pill" onClick={onReset}>
          Survey another listing
        </button>
      </div>
      {openError && (
        <p className="field-error" role="alert">
          {openError}
        </p>
      )}
    </div>
  )
}
