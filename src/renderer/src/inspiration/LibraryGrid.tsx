import { useState } from 'react'
import type { InspirationHouse, InspirationPhoto, Person } from '../../../shared/ipc'
import { noteExcerpt, type HouseGroup } from '../../../shared/inspiration'
import { MARK_LABEL } from '../../../shared/tagging'

const PAGE = 60

const swatch = (person: Person): React.CSSProperties =>
  ({ '--swatch': person.colour }) as React.CSSProperties

interface Common {
  people: Person[]
  /** People in excerpt order: the person tagging first. */
  personOrder: number[]
  selectedPhotoId: number | null
  onSelect(photoId: number): void
}

interface PhotoGridProps extends Common {
  kind: 'photos'
  photos: InspirationPhoto[]
  houses: Map<number, InspirationHouse>
}

interface HouseGridProps extends Common {
  kind: 'houses'
  groups: HouseGroup[]
}

/** The library's cards: one per photo (Room, Detail) or one per house (House). */
export function LibraryGrid(props: PhotoGridProps | HouseGridProps): React.JSX.Element {
  const [shown, setShown] = useState(PAGE)
  const total = props.kind === 'photos' ? props.photos.length : props.groups.length
  return (
    <>
      <ul className="lib-grid" aria-label={props.kind === 'photos' ? 'Photos' : 'Houses'}>
        {props.kind === 'photos'
          ? props.photos
              .slice(0, shown)
              .map((p) => (
                <PhotoCard
                  key={p.id}
                  photo={p}
                  house={props.houses.get(p.listingId)}
                  people={props.people}
                  personOrder={props.personOrder}
                  selected={p.id === props.selectedPhotoId}
                  onSelect={props.onSelect}
                />
              ))
          : props.groups
              .slice(0, shown)
              .map((g) => (
                <HouseCard
                  key={g.house.id}
                  group={g}
                  personOrder={props.personOrder}
                  selected={g.photos.some((p) => p.id === props.selectedPhotoId)}
                  onSelect={props.onSelect}
                />
              ))}
      </ul>
      {total > shown && (
        <div className="lib-more">
          <button type="button" className="pill" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({total - shown} left)
          </button>
        </div>
      )}
    </>
  )
}

function Marks({
  photo,
  people
}: {
  photo: InspirationPhoto
  people: Person[]
}): React.JSX.Element | null {
  const marked = people.flatMap((person) => {
    const mark = photo.notes.find((n) => n.personId === person.id)?.mark
    return mark ? [{ person, mark }] : []
  })
  if (marked.length === 0) return null
  return (
    <span className="lib-card__marks">
      {marked.map(({ person, mark }) => (
        <span key={person.id} className="lib-card__mark">
          <span className="swatch" style={swatch(person)} aria-hidden="true" />
          <span className="visually-hidden">{person.name}: </span>
          {MARK_LABEL[mark]}
        </span>
      ))}
    </span>
  )
}

interface PhotoCardProps {
  photo: InspirationPhoto
  house: InspirationHouse | undefined
  people: Person[]
  personOrder: number[]
  selected: boolean
  onSelect(photoId: number): void
}

function PhotoCard({
  photo,
  house,
  people,
  personOrder,
  selected,
  onSelect
}: PhotoCardProps): React.JSX.Element {
  const note = noteExcerpt(photo, personOrder)
  return (
    <li>
      <button
        type="button"
        className="lib-card"
        aria-pressed={selected}
        onClick={() => onSelect(photo.id)}
      >
        <span className="lib-card__frame">
          <img src={photo.url} alt="" loading="lazy" decoding="async" />
          <span className="lib-card__room">{photo.room ?? 'No room yet'}</span>
        </span>
        <span className="lib-card__body">
          {photo.tags.length > 0 && (
            <span className="lib-card__tags">
              {photo.tags.map((t) => (
                <span key={t.tagId} className="lib-tag">
                  {t.name}
                </span>
              ))}
            </span>
          )}
          {note && <span className="lib-card__note">{note}</span>}
          <span className="lib-card__foot">
            <span className="lib-card__house">{house?.name ?? ''}</span>
            <Marks photo={photo} people={people} />
          </span>
        </span>
      </button>
    </li>
  )
}

interface HouseCardProps {
  group: HouseGroup
  personOrder: number[]
  selected: boolean
  onSelect(photoId: number): void
}

const TOP_TAGS = 4

function HouseCard({ group, personOrder, selected, onSelect }: HouseCardProps): React.JSX.Element {
  const { house, photos } = group
  const cover = photos[0]!
  const counts = new Map<string, number>()
  for (const p of photos) for (const t of p.tags) counts.set(t.name, (counts.get(t.name) ?? 0) + 1)
  const topTags = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_TAGS)
  const why =
    personOrder
      .map((id) => house.notes.find((n) => n.personId === id)?.text?.trim())
      .find((t) => !!t) ?? null
  const mustHaves = photos.filter((p) => p.notes.some((n) => n.mark === 'must')).length
  return (
    <li>
      <button
        type="button"
        className="lib-card lib-card--house"
        aria-pressed={selected}
        onClick={() => onSelect(cover.id)}
      >
        <span className="lib-card__frame">
          <img src={cover.url} alt="" loading="lazy" decoding="async" />
          <span className="lib-card__room">
            {photos.length === house.photoCount
              ? `${house.photoCount} photos`
              : `${photos.length} of ${house.photoCount} photos`}
          </span>
        </span>
        <span className="lib-card__body">
          <span className="lib-card__title">{house.name}</span>
          {(house.price || house.city) && (
            <span className="lib-card__sub">
              {[house.price, house.city].filter(Boolean).join(' · ')}
            </span>
          )}
          {topTags.length > 0 && (
            <span className="lib-card__tags">
              {topTags.map(([name, n]) => (
                <span key={name} className="lib-tag">
                  {name} · {n}
                </span>
              ))}
            </span>
          )}
          {why && <span className="lib-card__note">{shortWhy(why)}</span>}
          {mustHaves > 0 && (
            <span className="lib-card__foot">
              <span className="lib-card__mark">
                {mustHaves} must-have {mustHaves === 1 ? 'photo' : 'photos'}
              </span>
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

const shortWhy = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ')
  if (flat.length <= 140) return flat
  const cut = flat.slice(0, 140)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).trimEnd()}…`
}
