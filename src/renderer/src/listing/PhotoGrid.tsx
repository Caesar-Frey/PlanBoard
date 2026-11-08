import { memo } from 'react'
import type { ListingPhoto } from '../../../shared/ipc'

interface PhotoGridProps {
  photos: ListingPhoto[]
  marked: ReadonlySet<number>
  onOpen(index: number): void
  onToggle(photoId: number): void
}

/** Arched-gable photo cards. Thumbnails load lazily: listings can have 100+ photos. */
export function PhotoGrid({ photos, marked, onOpen, onToggle }: PhotoGridProps): React.JSX.Element {
  return (
    <ul className="photo-grid" aria-label="Photos">
      {photos.map((photo, i) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          index={i}
          total={photos.length}
          marked={marked.has(photo.id)}
          onOpen={onOpen}
          onToggle={onToggle}
        />
      ))}
    </ul>
  )
}

interface PhotoCardProps {
  photo: ListingPhoto
  index: number
  total: number
  marked: boolean
  onOpen(index: number): void
  onToggle(photoId: number): void
}

const PhotoCard = memo(function PhotoCard({
  photo,
  index,
  total,
  marked,
  onOpen,
  onToggle
}: PhotoCardProps): React.JSX.Element {
  const n = index + 1
  const tickId = `keep-${photo.id}`
  return (
    <li className={`photo-card${marked ? ' photo-card--marked' : ''}`}>
      <button
        type="button"
        className="photo-card__open"
        onClick={() => onOpen(index)}
        aria-label={`Open photo ${n} of ${total} in the large preview${marked ? ' (marked for removal)' : ''}`}
      >
        <span className="photo-card__frame">
          <img src={photo.url} alt="" loading="lazy" decoding="async" draggable={false} />
          {marked && <span className="photo-card__flag">To Trash</span>}
        </span>
      </button>
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
