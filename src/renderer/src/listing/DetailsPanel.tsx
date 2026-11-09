import { useEffect, useState } from 'react'
import type { DetailsFileMode, ListingView } from '../../../shared/ipc'
import {
  LISTING_FIELD_GROUPS,
  LISTING_FIELD_LABELS,
  fieldsToInput,
  isNumberField,
  sameFields,
  validateListingFields,
  type ListingFieldErrors,
  type ListingFieldKey,
  type ListingFieldsInput
} from '../../../shared/listingFields'
import { Modal } from '../components/Modal'
import { SectionLabel } from '../components/Ornament'

interface DetailsPanelProps {
  view: ListingView
  /** Tells the listing view (and the leave guard) whether there are unsaved edits. */
  onDirtyChange(dirty: boolean): void
  onSaved(view: ListingView): void
}

const WIDE = new Set<ListingFieldKey>(['title', 'description'])

const HINTS: Partial<Record<ListingFieldKey, string>> = {
  bathrooms: 'A number such as 2 or 2.5',
  bedrooms: 'A whole number',
  garages: 'A whole number',
  bond_term_years: 'A whole number of years',
  agent_email: 'Separate several with commas',
  agency_email: 'Separate several with commas'
}

const INPUT_MODE: Partial<Record<ListingFieldKey, 'tel' | 'email'>> = {
  agent_phone: 'tel',
  agency_phone: 'tel',
  agent_email: 'email',
  agency_email: 'email'
}

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; note: string | null }
  | { kind: 'error'; message: string }

const FILE = 'Property_Details.txt'

/** Every scraped field, editable. Saving writes the library and regenerates the details file. */
export function DetailsPanel({
  view,
  onDirtyChange,
  onSaved
}: DetailsPanelProps): React.JSX.Element {
  const [baseline, setBaseline] = useState<ListingFieldsInput>(() => fieldsToInput(view.fields))
  const [form, setForm] = useState<ListingFieldsInput>(baseline)
  const [errors, setErrors] = useState<ListingFieldErrors>({})
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [askFile, setAskFile] = useState(false)

  const dirty = !sameFields(form, baseline)
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  const set = (key: ListingFieldKey, value: string): void => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
    if (status.kind !== 'saving') setStatus({ kind: 'idle' })
  }

  const save = async (fileMode: DetailsFileMode): Promise<void> => {
    setAskFile(false)
    const local = validateListingFields(form)
    if (!local.ok) {
      setErrors(local.errors)
      setStatus({ kind: 'error', message: 'Check the highlighted fields.' })
      return
    }
    setStatus({ kind: 'saving' })
    const r = await window.planboard
      .saveListingDetails({ listingId: view.id, fields: form, fileMode })
      .catch((err: unknown) => ({ ok: false as const, error: String(err) }))
    if (!r.ok) {
      setStatus({ kind: 'error', message: r.error })
      return
    }
    const outcome = r.value
    if (outcome.status === 'invalid') {
      setErrors(outcome.errors)
      setStatus({ kind: 'error', message: 'Check the highlighted fields.' })
    } else if (outcome.status === 'file-edited') {
      setStatus({ kind: 'idle' })
      setAskFile(true)
    } else {
      const next = fieldsToInput(outcome.view.fields)
      setBaseline(next)
      setForm(next)
      setErrors({})
      setStatus({
        kind: 'saved',
        note:
          outcome.warning ??
          (outcome.detailsFile === 'kept-edited'
            ? `Saved in PlanBoard. ${FILE} was left as you edited it.`
            : outcome.detailsFile === 'written'
              ? `Saved, and ${FILE} rewritten.`
              : null)
      })
      onSaved(outcome.view)
    }
  }

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (dirty && status.kind !== 'saving') void save('ask')
  }

  const undo = (): void => {
    setForm(baseline)
    setErrors({})
    setStatus({ kind: 'idle' })
  }

  const renderField = (key: ListingFieldKey): React.JSX.Element => {
    const id = `detail-${key}`
    const error = errors[key]
    const hint = HINTS[key]
    const describedBy =
      [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') ||
      undefined
    return (
      <div key={key} className={`field${WIDE.has(key) ? ' details__wide' : ''}`}>
        <label className="field__label" htmlFor={id}>
          {LISTING_FIELD_LABELS[key]}
        </label>
        {key === 'description' ? (
          <textarea
            id={id}
            className="field__textarea field__textarea--prose"
            rows={8}
            value={form[key]}
            onChange={(e) => set(key, e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
          />
        ) : (
          <input
            id={id}
            className="field__input"
            type="text"
            inputMode={isNumberField(key) ? 'decimal' : INPUT_MODE[key]}
            value={form[key]}
            onChange={(e) => set(key, e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            autoComplete="off"
            spellCheck={key === 'title'}
          />
        )}
        {hint && !error && (
          <span id={`${id}-hint`} className="field__hint">
            {hint}
          </span>
        )}
        {error && (
          <span id={`${id}-error`} className="field-error">
            {error}
          </span>
        )}
      </div>
    )
  }

  return (
    <form className="panel details" onSubmit={submit} aria-labelledby="details-heading" noValidate>
      <SectionLabel id="details-heading">Listing details</SectionLabel>
      {view.detailsFile === 'edited' && (
        <p className="alert">
          {FILE} in the listing folder was edited outside PlanBoard. When you save, you can choose
          to overwrite it or keep it as it is.
        </p>
      )}
      {LISTING_FIELD_GROUPS.map((group) => (
        <fieldset key={group.id} className={`details__group details__group--${group.id}`}>
          {/* The property group sits under the panel heading; the description has its label. */}
          {group.id !== 'property' && group.id !== 'description' && (
            <legend className="details__legend">— {group.label} —</legend>
          )}
          {group.id === 'contact' && (
            <p className="panel__help details__group-help">
              Only what the listing shows. {view.siteName} hides the agent’s number behind a CAPTCHA
              check, so PlanBoard doesn’t fetch it; type it in if you have it.
            </p>
          )}
          {group.id === 'bond' && (
            <p className="panel__help details__group-help">
              {view.bondAsOf !== null
                ? `${view.siteName}’s own bond calculator, with its default rate and term, as on ${formatDate(view.bondAsOf)}. A reference, not a quote.`
                : `${view.siteName}’s own bond calculator figures, with its default rate and term. Survey again to fill them in. A reference, not a quote.`}
            </p>
          )}
          <div className="details__grid">{group.keys.map(renderField)}</div>
        </fieldset>
      ))}
      <div className="actions details__actions">
        <button
          type="submit"
          className="pill pill--primary pill--wide"
          disabled={!dirty || status.kind === 'saving'}
        >
          {status.kind === 'saving' ? 'Saving…' : 'Save details'}
        </button>
        <button
          type="button"
          className="pill"
          onClick={undo}
          disabled={!dirty || status.kind === 'saving'}
        >
          Undo changes
        </button>
        <span className="details__status" aria-live="polite">
          {status.kind === 'error' && (
            <span className="field-error" role="alert">
              {status.message}
            </span>
          )}
          {status.kind === 'saved' && !dirty && (status.note ?? 'Saved')}
          {status.kind !== 'error' && status.kind !== 'saving' && dirty && 'Unsaved changes'}
        </span>
      </div>

      {askFile && (
        <Modal labelledBy="file-edited-title" onClose={() => setAskFile(false)}>
          <h2 id="file-edited-title" className="modal__title">
            {FILE} was changed by hand
          </h2>
          <p className="modal__body">
            Someone edited this listing’s {FILE} outside PlanBoard (in TextEdit, for example).
            Overwrite it with these details, or keep the file as it is and save the details in
            PlanBoard only?
          </p>
          <div className="actions modal__actions">
            <button type="button" className="pill" onClick={() => setAskFile(false)} data-autofocus>
              Cancel
            </button>
            <button type="button" className="pill" onClick={() => void save('keep')}>
              Keep the file
            </button>
            <button
              type="button"
              className="pill pill--primary"
              onClick={() => void save('overwrite')}
            >
              Overwrite the file
            </button>
          </div>
        </Modal>
      )}
    </form>
  )
}
