import { memo } from 'react'
import type { ListingPhoto, Person } from '../../../shared/ipc'
import { MARK_LABEL } from '../../../shared/tagging'

interface PhotoGridProps {
  photos: ListingPhoto[]
  people: Person[]
  marked: ReadonlySet<number>
  /** Bulk room mode: clicking a photo selects it instead of opening the preview. */
  selecting: boolean
  selected: ReadonlySet<number>
  onOpen(index: number): void
  onToggle(photoId: number): void
  /** `range`: shift-click, select everything from the last clicked photo. */
  onSelect(index: number, range: boolean): void
}

/** Arched-gable photo cards. Thumbnails load lazily: listings can have 100+ photos. */
export function PhotoGrid({
  photos,
  people,
  marked,
  selecting,
  selected,
  onOpen,
  onToggle,
  onSelect
}: PhotoGridProps): React.JSX.Element {
  return (
    <ul className={`photo-grid${selecting ? ' photo-grid--selecting' : ''}`} aria-label="Photos">
      {photos.map((photo, i) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          people={people}
          index={i}
          total={photos.length}
          marked={marked.has(photo.id)}
          selecting={selecting}
          selected={selected.has(photo.id)}
          onOpen={onOpen}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </ul>
  )
}

interface PhotoCardProps {
  photo: ListingPhoto
  people: Person[]
  index: number
  total: number
  marked: boolean
  selecting: boolean
  selected: boolean
  onOpen(index: number): void
  onToggle(photoId: number): void
  onSelect(index: number, range: boolean): void
}

const swatch = (person: Person): React.CSSProperties =>
  ({ '--swatch': person.colour }) as React.CSSProperties

const SHORT_MARK = { must: 'Must', nice: 'Nice', maybe: 'Maybe' } as const

const PhotoCard = memo(function PhotoCard({
  photo,
  people,
  index,
  total,
  marked,
  selecting,
  selected,
  onOpen,
  onToggle,
  onSelect
}: PhotoCardProps): React.JSX.Element {
  const n = index + 1
  const tickId = `keep-${photo.id}`
  const marks = photo.notes.flatMap((note) => {
    const person = people.find((p) => p.id === note.personId)
    return note.mark && person ? [{ person, mark: note.mark }] : []
  })
  const tagCount = photo.tags.length
  const summary = [
    photo.room ?? 'no room',
    tagCount > 0 ? `${tagCount} ${tagCount === 1 ? 'tag' : 'tags'}` : null,
    ...marks.map((m) => `${m.person.name}: ${MARK_LABEL[m.mark]}`)
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <li
      className={`photo-card${marked ? ' photo-card--marked' : ''}${selected ? ' photo-card--selected' : ''}`}
    >
      {selecting ? (
        <button
          type="button"
          className="photo-card__open photo-card__open--select"
          onClick={(e) => onSelect(index, e.shiftKey)}
          aria-pressed={selected}
          aria-label={`Photo ${n} of ${total} (${summary}). ${selected ? 'Selected' : 'Select'} for setting the room.`}
        >
          <span className="photo-card__frame">
            <img src={photo.url} alt="" loading="lazy" decoding="async" draggable={false} />
            <span className="photo-card__check" aria-hidden="true">
              {selected ? '✓' : ''}
            </span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          className="photo-card__open"
          onClick={() => onOpen(index)}
          aria-label={`Open photo ${n} of ${total} in the large preview (${summary})${marked ? ' (marked for removal)' : ''}`}
        >
          <span className="photo-card__frame">
            <img src={photo.url} alt="" loading="lazy" decoding="async" draggable={false} />
            {marked && <span className="photo-card__flag">To Trash</span>}
          </span>
        </button>
      )}
      <div className="photo-card__meta" aria-hidden="true">
        <span className={`photo-card__room${photo.room ? '' : ' photo-card__room--none'}`}>
          {photo.room ?? 'No room'}
        </span>
        {tagCount > 0 && (
          <span className="photo-card__tags">
            {tagCount} {tagCount === 1 ? 'tag' : 'tags'}
          </span>
        )}
        {marks.map((m) => (
          <span key={m.person.id} className="photo-card__mark" title={`${m.person.name}`}>
            <span className="swatch" style={swatch(m.person)} />
            {SHORT_MARK[m.mark]}
          </span>
        ))}
      </div>
      <div className="photo-card__foot">
        <input
          id={tickId}
          type="checkbox"
          className="tick"
          checked={!marked}
          onChange={() => onToggle(photo.id)}
        />
        <label htmlFor={tickId} className="photo-card__keep">
          {marked ? 'Marked for removal' : 'Keep'}
          <span className="visually-hidden"> photo {n}</span>
        </label>
        <span className="photo-card__n" aria-hidden="true">
          {n}
        </span>
      </div>
    </li>
  )
})
