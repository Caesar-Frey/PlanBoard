import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AppState,
  InspirationSnapshot,
  PhotoNote,
  PhotoTagging,
  TagSummary
} from '../../../shared/ipc'
import {
  DEFAULT_FILTER,
  NO_ROOM,
  filterPhotos,
  groupByHouse,
  partnerOf,
  roomCounts,
  tagCounts,
  tagName,
  type InspirationFilter,
  type Viewers
} from '../../../shared/inspiration'
import type { ViewId } from '../components/Header'
import { Divider } from '../components/Ornament'
import { LibraryGrid } from './LibraryGrid'
import { LibraryRail, roomLabel } from './LibraryRail'

interface LibraryViewProps {
  state: AppState
  onNavigate(view: ViewId): void
  /** Opens the listing view for a house. */
  onOpenListing(listingId: number): void
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** How many feature chips show before "All features". */
const CHIP_LIMIT = 14

/** The inspiration library (brief 4.4): filter, search and compare every tagged photo. */
export function LibraryView({ state, onNavigate }: LibraryViewProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<InspirationSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, setTags] = useState<TagSummary[]>([])
  const [filter, setFilter] = useState<InspirationFilter>(DEFAULT_FILTER)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [allChips, setAllChips] = useState(false)

  useEffect(() => {
    let live = true
    window.planboard
      .getInspiration()
      .then((r) => {
        if (!live) return
        if (r.ok) setSnapshot(r.value)
        else setError(r.error)
      })
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      live = false
    }
  }, [])

  const loadTags = useCallback(() => {
    window.planboard
      .listTags()
      .then((r) => {
        if (r.ok) setTags(r.value)
      })
      .catch(() => undefined)
  }, [])
  useEffect(loadTags, [loadTags])

  const people = state.people
  const meId = state.settings.currentPersonId
  const viewers: Viewers = useMemo(
    () => ({ me: meId, partner: partnerOf(people, meId) }),
    [people, meId]
  )
  const me = people.find((p) => p.id === viewers.me) ?? null
  const partner = people.find((p) => p.id === viewers.partner) ?? null
  const personOrder = useMemo(
    () => [viewers.me, viewers.partner].filter((id): id is number => id !== null),
    [viewers]
  )

  const empty: InspirationSnapshot = useMemo(() => ({ houses: [], photos: [] }), [])
  const snap = snapshot ?? empty
  const houses = useMemo(() => new Map(snap.houses.map((h) => [h.id, h])), [snap])
  const photos = useMemo(() => filterPhotos(snap, filter, viewers), [snap, filter, viewers])
  const rooms = useMemo(() => roomCounts(snap, filter, viewers), [snap, filter, viewers])
  const features = useMemo(() => tagCounts(snap, filter, viewers), [snap, filter, viewers])
  const groups = useMemo(() => groupByHouse(snap, photos), [snap, photos])

  const change = useCallback((patch: Partial<InspirationFilter>) => {
    setFilter((f) => ({ ...f, ...patch }))
  }, [])

  /** Applies tagging results from the detail panel to the snapshot. */
  const applyTagging = useCallback((t: PhotoTagging) => {
    setSnapshot((s) =>
      s
        ? {
            ...s,
            photos: s.photos.map((p) =>
              p.id === t.photoId ? { ...p, room: t.room, tags: t.tags, notes: t.notes } : p
            )
          }
        : s
    )
  }, [])

  const applyNote = useCallback((photoId: number, note: PhotoNote) => {
    setSnapshot((s) =>
      s
        ? {
            ...s,
            photos: s.photos.map((p) =>
              p.id === photoId
                ? {
                    ...p,
                    notes: [...p.notes.filter((n) => n.personId !== note.personId), note].sort(
                      (a, b) => a.personId - b.personId
                    )
                  }
                : p
            )
          }
        : s
    )
  }, [])
  void applyTagging
  void applyNote

  if (error) {
    return (
      <p className="notice notice--error" role="alert">
        {error}
      </p>
    )
  }
  if (!snapshot) return <p className="notice">Opening the library…</p>
  if (snapshot.photos.length === 0) {
    return (
      <div className="placeholder">
        <div className="gable-frame" aria-hidden="true">
          <span className="gable-frame__tag">No photos yet</span>
        </div>
        <p className="placeholder__blurb">
          Survey a listing on the Capture screen, then tag its photos to build the library.
        </p>
        <button type="button" className="pill pill--primary" onClick={() => onNavigate('capture')}>
          Go to Capture
        </button>
      </div>
    )
  }

  const room = filter.scope === 'detail' ? null : filter.room
  const tag = filter.tagId !== null ? tagName(snap, filter.tagId) : null
  const title =
    tag ??
    (room !== null
      ? roomLabel(room)
      : { house: 'Every house', room: 'Every room', detail: 'Every feature' }[filter.scope])
  const subtitle =
    tag && room !== null && room !== NO_ROOM
      ? `In the ${room.toLowerCase()}`
      : filter.scope === 'detail'
        ? 'Across every room'
        : null
  const shownChips = allChips ? features : features.slice(0, CHIP_LIMIT)
  const filtered =
    filter.room !== null ||
    filter.tagId !== null ||
    filter.marks.length > 0 ||
    filter.person !== 'everyone' ||
    filter.query.trim() !== ''

  return (
    <div className="library">
      <LibraryRail filter={filter} onChange={change} rooms={rooms} me={me} partner={partner} />

      <section className="lib-main" aria-labelledby="lib-title">
        <div className="page-title">
          <span className="page-title__kicker" aria-live="polite">
            {plural(photos.length, 'photograph')} · {plural(groups.length, 'house')}
          </span>
          <h1 className="page-title__h1 lib-main__title" id="lib-title">
            {title}
          </h1>
          {subtitle && <p className="lib-main__subtitle">{subtitle}</p>}
          <Divider />
        </div>

        {features.length > 0 && (
          <div className="lib-features">
            <h2 className="visually-hidden" id="lib-features">
              Features
            </h2>
            <div className="chips lib-features__chips" role="group" aria-labelledby="lib-features">
              {shownChips.map((f) => (
                <button
                  key={f.tagId}
                  type="button"
                  className="chip-button lib-features__chip"
                  aria-pressed={filter.tagId === f.tagId}
                  onClick={() => change({ tagId: filter.tagId === f.tagId ? null : f.tagId })}
                >
                  {f.name} · {f.photos}
                  <span className="visually-hidden">
                    {` ${f.photos === 1 ? 'photo' : 'photos'} in ${plural(f.houses, 'house')}`}
                  </span>
                </button>
              ))}
              {features.length > CHIP_LIMIT && (
                <button
                  type="button"
                  className="chip-button chip-button--more"
                  aria-expanded={allChips}
                  onClick={() => setAllChips((v) => !v)}
                >
                  {allChips ? 'Fewer' : `All features (${features.length})`}
                </button>
              )}
            </div>
          </div>
        )}

        {photos.length === 0 ? (
          <div className="lib-empty">
            <p>Nothing matches these filters.</p>
            {filtered && (
              <button
                type="button"
                className="pill"
                onClick={() => setFilter({ ...DEFAULT_FILTER, scope: filter.scope })}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <LibraryGrid
            // A fresh page count whenever the filter changes.
            key={JSON.stringify(filter)}
            {...(filter.scope === 'house'
              ? { kind: 'houses' as const, groups }
              : { kind: 'photos' as const, photos, houses })}
            people={people}
            personOrder={personOrder}
            selectedPhotoId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </section>
    </div>
  )
}
