import { useState } from 'react'
import type { ManualCaptureRequest, SiteId } from '../../../shared/ipc'

interface ManualFallbackProps {
  url: string
  site: SiteId | null
  /** Known from an earlier survey: then no suburb question is needed. */
  knownSuburb: string | null
  inLibrary: boolean
  disabled: boolean
  onSubmit(request: ManualCaptureRequest): void
}

/** Paste image addresses (or Property24 image numbers) when the automatic scraper fails. */
export function ManualFallback({
  url,
  site,
  knownSuburb,
  inLibrary,
  disabled,
  onSubmit
}: ManualFallbackProps): React.JSX.Element {
  const [text, setText] = useState('')
  const [suburb, setSuburb] = useState('')

  const what =
    site === 'p24'
      ? 'Property24 image addresses (https://images.prop24.com/…) or image numbers'
      : site === 'pp'
        ? 'Private Property image addresses (https://images.pp.co.za/listing/…)'
        : 'image addresses'

  return (
    <form
      className="manual"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim() === '') return
        onSubmit({ url, text, suburb: inLibrary ? null : suburb.trim() || null })
      }}
    >
      <h3 className="manual__title">Add the photos by hand</h3>
      <p className="panel__help">
        Open the listing in your browser and open its gallery. For each photo, right-click →{' '}
        <em>Copy Image Address</em>, then paste them below, one per line. PlanBoard downloads them
        into the same folder as a normal survey.
      </p>
      <label className="field" htmlFor="manual-text">
        <span className="field__label">{what}</span>
        <textarea
          id="manual-text"
          className="field__textarea"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </label>
      {inLibrary ? (
        <p className="panel__help">
          This listing is already in your library{knownSuburb ? ` (${knownSuburb})` : ''}, so the
          photos go into its existing folder.
        </p>
      ) : (
        <label className="field" htmlFor="manual-suburb">
          <span className="field__label">Suburb (for the folder name)</span>
          <input
            id="manual-suburb"
            className="field__input"
            value={suburb}
            maxLength={80}
            placeholder="Leave blank to use “Listing”"
            onChange={(e) => setSuburb(e.target.value)}
          />
        </label>
      )}
      <div>
        <button
          type="submit"
          className="pill pill--primary"
          disabled={disabled || text.trim() === ''}
        >
          Download pasted photos
        </button>
      </div>
    </form>
  )
}
