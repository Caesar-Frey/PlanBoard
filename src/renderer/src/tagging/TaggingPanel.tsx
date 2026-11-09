import { useCallback, useMemo, useState } from 'react'
import type {
  ListingPhoto,
  Mark,
  Person,
  PhotoNote,
  PhotoTagging,
  TagSummary
} from '../../../shared/ipc'
import { MARKS, MARK_LABEL, ROOMS } from '../../../shared/tagging'
import { saveStateText, useAutosave } from '../components/useAutosave'
import { TagInput } from './TagInput'

interface TaggingPanelProps {
  photo: ListingPhoto
  people: Person[]
  currentPersonId: number | null
  tags: TagSummary[]
  onTagging(tagging: PhotoTagging): void
  /** A tag was added or removed: the library's tag list (counts) needs a refresh. */
  onTagsChanged(): void
  onNoteSaved(photoId: number, note: PhotoNote): void
}

const swatch = (person: Person): React.CSSProperties =>
  ({ '--swatch': person.colour }) as React.CSSProperties

/** Room, feature tags, mark and notes for one photo (brief 4.3), beside the large preview. */
export function TaggingPanel({
  photo,
  people,
  currentPersonId,
  tags,
  onTagging,
  onTagsChanged,
  onNoteSaved
}: TaggingPanelProps): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const me = people.find((p) => p.id === currentPersonId) ?? null

  const mineIds = useMemo(
    () => new Set(photo.tags.filter((t) => me && t.personIds.includes(me.id)).map((t) => t.tagId)),
    [photo.tags, me]
  )

  const run = async <T,>(
    call: Promise<{ ok: true; value: T } | { ok: false; error: string }>
  ): Promise<T | null> => {
    const r = await call.catch((err: unknown) => ({ ok: false as const, error: String(err) }))
    if (!r.ok) {
      setError(r.error)
      return null
    }
    setError(null)
    return r.value
  }

  const setRoom = async (room: string | null): Promise<void> => {
    const value = await run(window.planboard.setPhotoRoom({ photoIds: [photo.id], room }))
    if (value?.[0]) onTagging(value[0])
  }

  const addTag = async (name: string): Promise<boolean> => {
    if (!me) return false
    const value = await run(
      window.planboard.addPhotoTag({ photoId: photo.id, personId: me.id, name })
    )
    if (!value) return false
    onTagging(value.photo)
    onTagsChanged()
    return true
  }

  const removeTag = async (tagId: number): Promise<void> => {
    if (!me) return
    const value = await run(
      window.planboard.removePhotoTag({ photoId: photo.id, personId: me.id, tagId })
    )
    if (value) {
      onTagging(value)
      onTagsChanged()
    }
  }

  const setMark = async (mark: Mark | null): Promise<void> => {
    if (!me) return
    const value = await run(
      window.planboard.savePhotoNote({ photoId: photo.id, personId: me.id, mark })
    )
    if (value) onNoteSaved(photo.id, value)
  }

  const myNote = me ? photo.notes.find((n) => n.personId === me.id) : undefined
  const roomId = `room-${photo.id}`

  return (
    <aside className="tagging-panel" aria-label="Tagging">
      <p className="tagging-panel__who">
        {me ? (
          <>
            <span className="swatch" style={swatch(me)} aria-hidden="true" />
            Tagging as <strong>{me.name}</strong>
          </>
        ) : (
          'Choose who is tagging in the header first.'
        )}
      </p>

      {error && (
        <p className="tagging-panel__error" role="alert">
          {error}
        </p>
      )}

      <section className="tagging-panel__section" aria-labelledby={roomId}>
        <h3 className="tagging-panel__label" id={roomId}>
          — Room —
        </h3>
        <div className="chips" role="group" aria-labelledby={roomId}>
          {ROOMS.map((room) => (
            <button
              key={room}
              type="button"
              className="chip-button"
              aria-pressed={photo.room === room}
              onClick={() => void setRoom(photo.room === room ? null : room)}
            >
              {room}
            </button>
          ))}
        </div>
        <p className="tagging-panel__help">Shared by you both. Click the room again to clear it.</p>
      </section>

      <section className="tagging-panel__section" aria-labelledby={`tags-${photo.id}`}>
        <h3 className="tagging-panel__label" id={`tags-${photo.id}`}>
          — Features —
        </h3>
        {photo.tags.length > 0 && (
          <ul className="chips" aria-label="Feature tags on this photo">
            {photo.tags.map((tag) => {
              const mine = mineIds.has(tag.tagId)
              const by = people.filter((p) => tag.personIds.includes(p.id))
              return (
                <li key={tag.tagId}>
                  <button
                    type="button"
                    className="chip-button chip-button--tag"
                    aria-pressed={mine}
                    disabled={!me}
                    onClick={() => void (mine ? removeTag(tag.tagId) : addTag(tag.name))}
                    title={mine ? 'Click to remove your tag' : 'Click to add this tag as yours too'}
                  >
                    {by.map((p) => (
                      <span key={p.id} className="swatch" style={swatch(p)} aria-hidden="true" />
                    ))}
                    {tag.name}
                    {mine && <span aria-hidden="true"> ×</span>}
                    <span className="visually-hidden">
                      {`, tagged by ${by.map((p) => p.name).join(' and ')}. ${
                        mine ? 'Press to remove your tag.' : 'Press to add it as yours too.'
                      }`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <TagInput
          // Keyed by photo, so a half-typed tag never carries over to the next photo.
          key={photo.id}
          tags={tags}
          exclude={mineIds}
          disabled={!me}
          onAdd={addTag}
        />
      </section>

      <section className="tagging-panel__section" aria-labelledby={`mark-${photo.id}`}>
        <h3 className="tagging-panel__label" id={`mark-${photo.id}`}>
          — Marked as —
        </h3>
        {people.map((person) => {
          const note = photo.notes.find((n) => n.personId === person.id)
          const mine = person.id === me?.id
          return (
            <div key={person.id} className="mark-row">
              <span className="mark-row__who">
                <span className="swatch" style={swatch(person)} aria-hidden="true" />
                {person.name}
              </span>
              {mine ? (
                <div className="chips" role="group" aria-label={`${person.name}’s mark`}>
                  {MARKS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="chip-button"
                      aria-pressed={myNote?.mark === m.id}
                      onClick={() => void setMark(myNote?.mark === m.id ? null : m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="mark-row__value">
                  {note?.mark ? MARK_LABEL[note.mark] : 'Not marked'}
                </span>
              )}
            </div>
          )
        })}
      </section>

      {people.map((person) => (
        <PersonNotes
          key={person.id}
          photoId={photo.id}
          person={person}
          mine={person.id === me?.id}
          note={photo.notes.find((n) => n.personId === person.id)}
          onSaved={onNoteSaved}
        />
      ))}
    </aside>
  )
}

interface PersonNotesProps {
  photoId: number
  person: Person
  mine: boolean
  note: PhotoNote | undefined
  onSaved(photoId: number, note: PhotoNote): void
}

const FIELDS = [
  { id: 'likes', label: 'What we like', placeholder: 'The light, the tiles, the island seating…' },
  { id: 'why', label: 'Why', placeholder: 'Why it would work for our house…' }
] as const

function PersonNotes({
  photoId,
  person,
  mine,
  note,
  onSaved
}: PersonNotesProps): React.JSX.Element {
  const headingId = `notes-${photoId}-${person.id}`
  return (
    <section
      className={`tagging-panel__section person-notes${mine ? ' person-notes--mine' : ''}`}
      aria-labelledby={headingId}
    >
      <h3 className="person-notes__head" id={headingId}>
        <span className="swatch swatch--large" style={swatch(person)} aria-hidden="true" />
        {person.name}
        {mine && <span className="chip">You · editing</span>}
      </h3>
      {FIELDS.map((field) =>
        mine ? (
          <NoteField
            // A fresh editor per photo, person and field: switching never mixes texts.
            key={`${photoId}-${person.id}-${field.id}`}
            photoId={photoId}
            person={person}
            field={field.id}
            label={field.label}
            placeholder={field.placeholder}
            initial={note?.[field.id] ?? ''}
            onSaved={onSaved}
          />
        ) : (
          <div key={field.id} className="person-notes__field">
            <span className="person-notes__label">{field.label}</span>
            {note?.[field.id] ? (
              <p className="person-notes__text">{note[field.id]}</p>
            ) : (
              <p className="person-notes__empty">Nothing yet.</p>
            )}
          </div>
        )
      )}
    </section>
  )
}

interface NoteFieldProps {
  photoId: number
  person: Person
  field: 'likes' | 'why'
  label: string
  placeholder: string
  initial: string
  onSaved(photoId: number, note: PhotoNote): void
}

function NoteField({
  photoId,
  person,
  field,
  label,
  placeholder,
  initial,
  onSaved
}: NoteFieldProps): React.JSX.Element {
  const send = useCallback(
    (text: string) =>
      window.planboard.savePhotoNote({ photoId, personId: person.id, [field]: text }),
    [photoId, person.id, field]
  )
  const saved = useCallback((note: PhotoNote) => onSaved(photoId, note), [onSaved, photoId])
  const { text, state, change, flush } = useAutosave(initial, send, saved)
  const inputId = `${field}-${photoId}-${person.id}`
  const statusId = `${inputId}-status`
  return (
    <div className="person-notes__field">
      <label className="person-notes__label" htmlFor={inputId}>
        {label}
      </label>
      <textarea
        id={inputId}
        className="field__textarea field__textarea--prose person-notes__input"
        rows={2}
        value={text}
        placeholder={placeholder}
        onChange={(e) => change(e.target.value)}
        onBlur={flush}
        aria-describedby={statusId}
        maxLength={10_000}
      />
      <p
        id={statusId}
        className={`why-note__status why-note__status--${state.kind}`}
        aria-live="polite"
      >
        {saveStateText(state)}
      </p>
    </div>
  )
}
