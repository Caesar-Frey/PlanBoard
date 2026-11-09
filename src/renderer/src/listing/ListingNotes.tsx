import { useCallback, useEffect, useRef, useState } from 'react'
import type { ListingNote, Person } from '../../../shared/ipc'

interface ListingNotesProps {
  listingId: number
  people: Person[]
  currentPersonId: number | null
  notes: ListingNote[]
  onSaved(note: ListingNote): void
}

const AUTOSAVE_MS = 1000

const swatch = (person: Person): React.CSSProperties =>
  ({ '--swatch': person.colour }) as React.CSSProperties

/** "Why we saved this house": both people's notes; only the person tagging can edit theirs. */
export function ListingNotes({
  listingId,
  people,
  currentPersonId,
  notes,
  onSaved
}: ListingNotesProps): React.JSX.Element {
  return (
    <div className="why-notes">
      {people.map((person) => {
        const note = notes.find((n) => n.personId === person.id)
        const mine = person.id === currentPersonId
        return (
          <article key={person.id} className={`why-note${mine ? ' why-note--mine' : ''}`}>
            <header className="why-note__head">
              <span className="swatch swatch--large" style={swatch(person)} aria-hidden="true" />
              <h3 className="why-note__name" id={`why-${person.id}`}>
                {person.name}
              </h3>
              {mine && <span className="chip">You · editing</span>}
            </header>
            {mine ? (
              <NoteEditor
                // A fresh editor per listing and person, so switching never mixes texts.
                key={`${listingId}-${person.id}`}
                listingId={listingId}
                person={person}
                initial={note?.text ?? ''}
                onSaved={onSaved}
              />
            ) : note?.text ? (
              <p className="why-note__text" aria-labelledby={`why-${person.id}`}>
                {note.text}
              </p>
            ) : (
              <p className="why-note__empty">No note from {person.name} yet.</p>
            )}
          </article>
        )
      })}
    </div>
  )
}

interface NoteEditorProps {
  listingId: number
  person: Person
  initial: string
  onSaved(note: ListingNote): void
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string }

/**
 * Saves on blur and after a second without typing. A pending change is saved on unmount and
 * when the window closes (the app quitting).
 */
function NoteEditor({ listingId, person, initial, onSaved }: NoteEditorProps): React.JSX.Element {
  const [text, setText] = useState(initial)
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Last text sent to main (saved, or on its way). */
  const sent = useRef(initial)
  const latest = useRef(initial)
  const live = useRef(true)

  const save = useCallback(
    async (value: string) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      if (value === sent.current) {
        if (live.current) setState((s) => (s.kind === 'pending' ? { kind: 'idle' } : s))
        return
      }
      const previous = sent.current
      sent.current = value
      if (live.current) setState({ kind: 'saving' })
      const r = await window.planboard
        .saveListingNote({ listingId, personId: person.id, text: value })
        .catch((err: unknown) => ({ ok: false as const, error: String(err) }))
      if (r.ok) {
        onSaved(r.value)
        if (live.current && latest.current === value) setState({ kind: 'saved' })
      } else {
        if (sent.current === value) sent.current = previous
        if (live.current) setState({ kind: 'error', message: r.error })
      }
    },
    [listingId, person.id, onSaved]
  )

  // Unmounting (leaving the listing, switching person): save what's typed but not sent.
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  }, [save])
  // Closing the window or quitting doesn't unmount anything, so save on `pagehide` too.
  useEffect(() => {
    live.current = true
    const flush = (): void => void saveRef.current(latest.current)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      live.current = false
      void saveRef.current(latest.current)
    }
  }, [])

  const change = (value: string): void => {
    setText(value)
    latest.current = value
    setState({ kind: 'pending' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(value), AUTOSAVE_MS)
  }

  const statusId = `why-status-${person.id}`
  return (
    <div className="why-note__editor">
      <label className="visually-hidden" htmlFor={`why-text-${person.id}`}>
        Why {person.name} saved this house
      </label>
      <textarea
        id={`why-text-${person.id}`}
        className="field__textarea field__textarea--prose why-note__input"
        rows={4}
        value={text}
        placeholder="What made you save this house? The light, the stoep, the kitchen…"
        onChange={(e) => change(e.target.value)}
        onBlur={() => void save(text)}
        aria-describedby={statusId}
        maxLength={10_000}
      />
      <p
        id={statusId}
        className={`why-note__status why-note__status--${state.kind}`}
        aria-live="polite"
      >
        {state.kind === 'saving' && 'Saving…'}
        {state.kind === 'saved' && 'Saved'}
        {state.kind === 'error' && `Couldn’t save: ${state.message}`}
        {state.kind === 'pending' && 'Saves when you pause'}
      </p>
    </div>
  )
}
