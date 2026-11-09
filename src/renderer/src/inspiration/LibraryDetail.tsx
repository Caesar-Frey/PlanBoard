import { useMemo, useState } from 'react'
import type {
  InspirationHouse,
  InspirationPhoto,
  InspirationSnapshot,
  Person,
  PhotoNote,
  PhotoTagging,
  TagSummary
} from '../../../shared/ipc'
import { sameFeatureIn } from '../../../shared/inspiration'
import { TaggingPanel } from '../tagging/TaggingPanel'

interface LibraryDetailProps {
  snapshot: InspirationSnapshot
  photo: InspirationPhoto
  house: InspirationHouse | undefined
  houses: Map<number, InspirationHouse>
  people: Person[]
  currentPersonId: number | null
  tags: TagSummary[]
  onSelect(photoId: number): void
  onClose(): void
  onOpenListing(listingId: number): void
  onTagging(tagging: PhotoTagging): void
  onTagsChanged(): void
  onNoteSaved(photoId: number, note: PhotoNote): void
}

const SAME_LIMIT = 8

/** The selected photo (brief 4.4): large photo, its house, "Same feature in", tags and notes. */
export function LibraryDetail({
  snapshot,
  photo,
  house,
  houses,
  people,
  currentPersonId,
  tags,
  onSelect,
  onClose,
  onOpenListing,
  onTagging,
  onTagsChanged,
  onNoteSaved
}: LibraryDetailProps): React.JSX.Element {
  const [linkError, setLinkError] = useState<string | null>(null)
  const same = useMemo(() => sameFeatureIn(snapshot, photo.id), [snapshot, photo.id])

  const openOriginal = async (): Promise<void> => {
    const r = await window.planboard
      .openListingUrl(photo.listingId)
      .catch((err: unknown) => ({ ok: false as const, error: String(err) }))
    setLinkError(r.ok ? null : r.error)
  }

  return (
    <section className="lib-detail" aria-labelledby="lib-detail-title">
      <div className="lib-detail__inner">
        <div className="lib-detail__head">
          <h2 className="lib-detail__label" id="lib-detail-title">
            Selected photo
          </h2>
          <button
            type="button"
            className="lib-detail__close"
            onClick={onClose}
            aria-label="Close the selected photo"
          >
            ×
          </button>
        </div>

        <figure className="lib-detail__figure">
          <img src={photo.url} alt={`${photo.room ?? 'Photo'} in ${house?.name ?? 'this house'}`} />
          <figcaption className="lib-detail__room">{photo.room ?? 'No room yet'}</figcaption>
        </figure>

        {house && (
          <div className="lib-detail__house">
            <p className="lib-detail__house-name">{house.name}</p>
            {(house.price || house.city) && (
              <p className="lib-detail__house-sub">
                {[house.price, house.city].filter(Boolean).join(' · ')}
              </p>
            )}
            <div className="lib-detail__links">
              <button
                type="button"
                className="pill pill--brass"
                onClick={() => onOpenListing(house.id)}
              >
                Open listing
              </button>
              <button
                type="button"
                className="pill pill--on-green"
                onClick={() => void openOriginal()}
              >
                Original listing ↗
              </button>
            </div>
            {linkError && (
              <p className="lib-detail__error" role="alert">
                {linkError}
              </p>
            )}
          </div>
        )}

        <div className="lib-detail__same">
          <h3 className="lib-detail__label" id="lib-same">
            Same feature in
          </h3>
          {same.length === 0 ? (
            <p className="lib-detail__none">
              {photo.tags.length === 0
                ? 'Tag this photo to see which other houses share its features.'
                : 'No other house has these features yet.'}
            </p>
          ) : (
            <ul className="same-list" aria-labelledby="lib-same">
              {same.slice(0, SAME_LIMIT).map((s) => (
                <li key={s.houseId}>
                  <button
                    type="button"
                    className="same-list__row"
                    onClick={() => onSelect(s.photoId)}
                  >
                    <span>{houses.get(s.houseId)?.name ?? 'Another house'}</span>
                    <span className="same-list__tags">{s.tags.join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {same.length > SAME_LIMIT && (
            <p className="lib-detail__none">and {same.length - SAME_LIMIT} more houses</p>
          )}
        </div>

        <TaggingPanel
          photo={photo}
          people={people}
          currentPersonId={currentPersonId}
          tags={tags}
          onTagging={onTagging}
          onTagsChanged={onTagsChanged}
          onNoteSaved={onNoteSaved}
        />
      </div>
    </section>
  )
}

/** Shown in the detail column before a photo is chosen. */
export function LibraryDetailEmpty(): React.JSX.Element {
  return (
    <section className="lib-detail lib-detail--empty" aria-label="Selected photo">
      <div className="lib-detail__inner">
        <div className="lib-detail__figure lib-detail__figure--blank" aria-hidden="true" />
        <p className="lib-detail__hint">
          Choose a photo to see its tags, both your notes and the other houses with the same
          feature.
        </p>
      </div>
    </section>
  )
}
