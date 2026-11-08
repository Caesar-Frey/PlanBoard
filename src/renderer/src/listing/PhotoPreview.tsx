import type { ListingPhoto } from '../../../shared/ipc'
import { Modal } from '../components/Modal'

interface PhotoPreviewProps {
  photos: ListingPhoto[]
  index: number
  marked: ReadonlySet<number>
  onIndex(index: number): void
  onToggle(photoId: number): void
  onClose(): void
}

/** Large preview: ← / → or the buttons step through, Esc closes. */
export function PhotoPreview({
  photos,
  index,
  marked,
  onIndex,
  onToggle,
  onClose
}: PhotoPreviewProps): React.JSX.Element | null {
  const photo = photos[index]
  if (!photo) return null
  const total = photos.length
  const isMarked = marked.has(photo.id)
  const hasPrev = index > 0
  const hasNext = index < total - 1

  const keyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    // Leave arrow keys alone inside a text field (none today, but cheap to keep right).
    if ((event.target as HTMLElement).tagName === 'INPUT') return
    if (event.key === 'ArrowLeft' && hasPrev) {
      event.preventDefault()
      onIndex(index - 1)
    } else if (event.key === 'ArrowRight' && hasNext) {
      event.preventDefault()
      onIndex(index + 1)
    }
  }

  return (
    <Modal
      labelledBy="preview-title"
      onClose={onClose}
      tone="dark"
      className="preview"
      onKeyDown={keyDown}
    >
      <div className="preview__bar">
        <h2 id="preview-title" className="preview__title" aria-live="polite">
          Photo {index + 1} of {total}
        </h2>
        <button type="button" className="pill pill--on-green" onClick={onClose} data-autofocus>
          Close
        </button>
      </div>
      <div className={`preview__stage${isMarked ? ' preview__stage--marked' : ''}`}>
        <button
          type="button"
          className="preview__step preview__step--prev"
          onClick={() => onIndex(index - 1)}
          disabled={!hasPrev}
          aria-label="Previous photo"
        >
          ‹
        </button>
        <figure className="preview__figure">
          <img key={photo.id} src={photo.url} alt={`Photo ${index + 1} of ${total}`} />
        </figure>
        <button
          type="button"
          className="preview__step preview__step--next"
          onClick={() => onIndex(index + 1)}
          disabled={!hasNext}
          aria-label="Next photo"
        >
          ›
        </button>
      </div>
      <div className="preview__foot">
        <span className="preview__file">{photo.fileName}</span>
        <button type="button" className="pill pill--on-green" onClick={() => onToggle(photo.id)}>
          {isMarked ? 'Keep this photo' : 'Mark for removal'}
        </button>
        <span className="preview__hint">← → to step · Esc to close</span>
      </div>
    </Modal>
  )
}
