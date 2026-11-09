/**
 * Inspiration library logic (brief 4.4): filters, counts for the rail, "Where they coincide",
 * search and "Same feature in". Pure functions over one `InspirationSnapshot` (removed photos are
 * never in it), shared by the renderer and the tests. No runtime imports apart from shared code.
 */
import type {
  InspirationHouse,
  InspirationPhoto,
  InspirationSnapshot,
  Mark,
  Person,
  SiteId
} from './ipc'
import { ROOMS } from './tagging'

/** House: one card per listing. Room: photos in a room. Detail: a feature across all rooms. */
export type Scope = 'house' | 'room' | 'detail'

/** Whose tags and marks count. `both`: both people picked the photo ("Both agree"). */
export type PersonFilter = 'everyone' | 'me' | 'partner' | 'both'

/** Room filter value for photos that have no room yet. */
export const NO_ROOM = ''

export interface InspirationFilter {
  scope: Scope
  /** null: every room. `NO_ROOM`: photos without a room. Ignored in Detail scope. */
  room: string | null
  /** One feature tag, or null for any. */
  tagId: number | null
  /** Empty: any mark (or none). Otherwise the photo needs one of these. */
  marks: Mark[]
  person: PersonFilter
  /** Words to find in notes, tags, suburb, city and room. */
  query: string
}

export const DEFAULT_FILTER: InspirationFilter = {
  scope: 'room',
  room: null,
  tagId: null,
  marks: [],
  person: 'everyone',
  query: ''
}

/** "Me" is the person in "Tagging as"; "Partner" is the other one. */
export interface Viewers {
  me: number | null
  partner: number | null
}

export function partnerOf(people: readonly Person[], me: number | null): number | null {
  if (me === null || people.length < 2) return null
  return people.find((p) => p.id !== me)?.id ?? null
}

// ---------------------------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------------------------

/** The people whose view decides the filter, or null for "anyone". */
function peopleFor(person: PersonFilter, viewers: Viewers): (number | null)[] | null {
  switch (person) {
    case 'everyone':
      return null
    case 'me':
      return [viewers.me]
    case 'partner':
      return [viewers.partner]
    case 'both':
      return [viewers.me, viewers.partner]
  }
}

/** Tag ids on the photo by this person (null: by anyone). */
function tagIdsBy(photo: InspirationPhoto, personId: number | null): Set<number> {
  return new Set(
    photo.tags
      .filter((t) => personId === null || t.personIds.includes(personId))
      .map((t) => t.tagId)
  )
}

/** Tag ids that count under the person filter (Both agree: tags both people put on). */
function countedTagIds(
  photo: InspirationPhoto,
  person: PersonFilter,
  viewers: Viewers
): Set<number> {
  const who = peopleFor(person, viewers)
  if (!who) return tagIdsBy(photo, null)
  if (who.some((id) => id === null)) return new Set()
  const sets = who.map((id) => tagIdsBy(photo, id))
  return new Set([...sets[0]!].filter((id) => sets.every((s) => s.has(id))))
}

function markOf(photo: InspirationPhoto, personId: number): Mark | null {
  return photo.notes.find((n) => n.personId === personId)?.mark ?? null
}

/** This person tagged, marked or wrote about the photo. */
function pickedBy(photo: InspirationPhoto, personId: number): boolean {
  if (photo.tags.some((t) => t.personIds.includes(personId))) return true
  const note = photo.notes.find((n) => n.personId === personId)
  return !!note && (note.mark !== null || !!note.likes?.trim() || !!note.why?.trim())
}

type Facet = 'room' | 'tag' | null

function personMatches(
  photo: InspirationPhoto,
  f: InspirationFilter,
  viewers: Viewers,
  skip: Facet
): boolean {
  const useTag = skip !== 'tag' && f.tagId !== null
  const who = peopleFor(f.person, viewers)
  if (!who) {
    if (useTag && !tagIdsBy(photo, null).has(f.tagId!)) return false
    if (f.marks.length > 0 && !photo.notes.some((n) => n.mark && f.marks.includes(n.mark))) {
      return false
    }
    return true
  }
  return who.every((id) => {
    if (id === null) return false
    if (useTag && !tagIdsBy(photo, id).has(f.tagId!)) return false
    if (f.marks.length > 0) {
      const mark = markOf(photo, id)
      if (!mark || !f.marks.includes(mark)) return false
    }
    return pickedBy(photo, id)
  })
}

const foldText = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** True when every word of the query appears in the photo's notes, tags or room, or its house's suburb or city. */
export function matchesSearch(
  photo: InspirationPhoto,
  house: InspirationHouse | undefined,
  query: string
): boolean {
  const words = foldText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = foldText(
    [
      photo.room ?? '',
      ...photo.tags.map((t) => t.name),
      ...photo.notes.flatMap((n) => [n.likes ?? '', n.why ?? '']),
      house?.suburb ?? '',
      house?.city ?? ''
    ].join('\n')
  )
  return words.every((w) => {
    if (haystack.includes(w)) return true
    // Plurals: "kitchens" finds "kitchen", "benches" finds "bench".
    if (w.length > 3 && w.endsWith('es') && haystack.includes(w.slice(0, -2))) return true
    return w.length > 3 && w.endsWith('s') && haystack.includes(w.slice(0, -1))
  })
}

function houseIndex(snapshot: InspirationSnapshot): Map<number, InspirationHouse> {
  return new Map(snapshot.houses.map((h) => [h.id, h]))
}

function filterWith(
  snapshot: InspirationSnapshot,
  f: InspirationFilter,
  viewers: Viewers,
  skip: Facet
): InspirationPhoto[] {
  const houses = houseIndex(snapshot)
  const useRoom = skip !== 'room' && f.scope !== 'detail' && f.room !== null
  return snapshot.photos.filter((p) => {
    if (useRoom && (p.room ?? NO_ROOM) !== f.room) return false
    if (!personMatches(p, f, viewers, skip)) return false
    return matchesSearch(p, houses.get(p.listingId), f.query)
  })
}

/** The photos the grid shows, in snapshot order. */
export function filterPhotos(
  snapshot: InspirationSnapshot,
  filter: InspirationFilter,
  viewers: Viewers
): InspirationPhoto[] {
  return filterWith(snapshot, filter, viewers, null)
}

// ---------------------------------------------------------------------------------------------
// Rail counts
// ---------------------------------------------------------------------------------------------

export interface RoomCount {
  /** A room from `ROOMS`, or `NO_ROOM`. */
  room: string
  count: number
}

/**
 * Photos per room under every filter except the room itself: the fixed room order, rooms with
 * photos only (plus the chosen room), and photos without a room last.
 */
export function roomCounts(
  snapshot: InspirationSnapshot,
  filter: InspirationFilter,
  viewers: Viewers
): { total: number; rooms: RoomCount[] } {
  const photos = filterWith(snapshot, filter, viewers, 'room')
  const counts = new Map<string, number>()
  for (const p of photos) {
    const room = p.room ?? NO_ROOM
    counts.set(room, (counts.get(room) ?? 0) + 1)
  }
  const order: string[] = [...ROOMS, NO_ROOM]
  for (const room of counts.keys()) if (!order.includes(room)) order.splice(-1, 0, room)
  const rooms = order
    .filter((room) => counts.has(room) || room === filter.room)
    .map((room) => ({ room, count: counts.get(room) ?? 0 }))
  return { total: photos.length, rooms }
}

export interface TagCount {
  tagId: number
  name: string
  photos: number
  houses: number
}

const byName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })

/** Tags on the photos in view (every filter except the tag), most photos first, then A–Z. */
export function tagCounts(
  snapshot: InspirationSnapshot,
  filter: InspirationFilter,
  viewers: Viewers
): TagCount[] {
  const photos = filterWith(snapshot, filter, viewers, 'tag')
  const found = new Map<number, { name: string; photos: number; houses: Set<number> }>()
  for (const p of photos) {
    for (const tagId of countedTagIds(p, filter.person, viewers)) {
      const name = p.tags.find((t) => t.tagId === tagId)!.name
      const entry = found.get(tagId) ?? { name, photos: 0, houses: new Set<number>() }
      entry.photos += 1
      entry.houses.add(p.listingId)
      found.set(tagId, entry)
    }
  }
  const list: TagCount[] = [...found].map(([tagId, e]) => ({
    tagId,
    name: e.name,
    photos: e.photos,
    houses: e.houses.size
  }))
  if (filter.tagId !== null && !found.has(filter.tagId)) {
    const name = tagName(snapshot, filter.tagId)
    if (name !== null) list.push({ tagId: filter.tagId, name, photos: 0, houses: 0 })
  }
  return list.sort((a, b) => b.photos - a.photos || byName(a, b))
}

/** A tag's name from any photo carrying it, or null. */
export function tagName(snapshot: InspirationSnapshot, tagId: number): string | null {
  for (const p of snapshot.photos) {
    const t = p.tags.find((x) => x.tagId === tagId)
    if (t) return t.name
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Where they coincide
// ---------------------------------------------------------------------------------------------

export interface CoincidePair {
  tagId: number
  name: string
  /** Houses with at least one photo carrying both tags. */
  houses: number
  /** Photos carrying both tags. */
  photos: number
}

export interface Coincidence {
  tagId: number
  name: string
  /** Houses with at least one photo in view carrying the tag. */
  houses: number
  /** Houses in the library that still have photos. */
  totalHouses: number
  photos: number
  /** Other tags on the same photos: most houses first, then most photos, then A–Z. */
  pairs: CoincidePair[]
}

/**
 * How the chosen tag (or, with none chosen, the tag found in the most houses) coincides with
 * other tags on the photos in view. Counted in houses, so one house with many photos of the
 * same island counts once. Null when no photo in view carries a tag.
 */
export function coincidence(
  snapshot: InspirationSnapshot,
  filter: InspirationFilter,
  viewers: Viewers
): Coincidence | null {
  const photos = filterWith(snapshot, filter, viewers, 'tag')
  const tagged = photos.map((p) => ({ p, tags: countedTagIds(p, filter.person, viewers) }))

  let focus = filter.tagId
  if (focus === null) {
    const top = tagCounts(snapshot, { ...filter, tagId: null }, viewers).sort(
      (a, b) => b.houses - a.houses || b.photos - a.photos || byName(a, b)
    )[0]
    if (!top) return null
    focus = top.tagId
  }

  const name = tagName(snapshot, focus)
  const withFocus = tagged.filter((t) => t.tags.has(focus))
  if (name === null || withFocus.length === 0) return null

  const pairs = new Map<number, { name: string; houses: Set<number>; photos: number }>()
  for (const { p, tags } of withFocus) {
    for (const other of tags) {
      if (other === focus) continue
      const otherName = p.tags.find((t) => t.tagId === other)!.name
      const e = pairs.get(other) ?? { name: otherName, houses: new Set<number>(), photos: 0 }
      e.houses.add(p.listingId)
      e.photos += 1
      pairs.set(other, e)
    }
  }

  return {
    tagId: focus,
    name,
    houses: new Set(withFocus.map((t) => t.p.listingId)).size,
    totalHouses: snapshot.houses.filter((h) => h.photoCount > 0).length,
    photos: withFocus.length,
    pairs: [...pairs]
      .map(([tagId, e]) => ({ tagId, name: e.name, houses: e.houses.size, photos: e.photos }))
      .sort((a, b) => b.houses - a.houses || b.photos - a.photos || byName(a, b))
  }
}

/** A tag name inside a sentence: "Pendant lights" → "pendant lights", "LED strip" stays. */
export function inlineTagName(name: string): string {
  const second = name.charAt(1)
  if (second && second === second.toLocaleUpperCase('en-ZA') && /\p{L}/u.test(second)) return name
  return name.charAt(0).toLocaleLowerCase('en-ZA') + name.slice(1)
}

/** "Island appears in 9 of 23 houses, most often paired with pendant lights (6) and …". */
export function coincideSentence(c: Coincidence, maxPairs = 2): string {
  const start = `${c.name} appears in ${c.houses} of ${c.totalHouses} ${
    c.totalHouses === 1 ? 'house' : 'houses'
  }`
  const shown = c.pairs.slice(0, maxPairs).map((p) => `${inlineTagName(p.name)} (${p.houses})`)
  if (shown.length === 0) return `${start}. It isn’t paired with another feature yet.`
  const list =
    shown.length === 1 ? shown[0]! : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)!}`
  return `${start}, most often paired with ${list}.`
}

// ---------------------------------------------------------------------------------------------
// Cards and the detail panel
// ---------------------------------------------------------------------------------------------

export interface HouseGroup {
  house: InspirationHouse
  photos: InspirationPhoto[]
}

/** House scope: the photos in view, grouped by house in snapshot (newest survey) order. */
export function groupByHouse(
  snapshot: InspirationSnapshot,
  photos: readonly InspirationPhoto[]
): HouseGroup[] {
  const byHouse = new Map<number, InspirationPhoto[]>()
  for (const p of photos) byHouse.set(p.listingId, [...(byHouse.get(p.listingId) ?? []), p])
  return snapshot.houses.flatMap((house) => {
    const list = byHouse.get(house.id)
    return list ? [{ house, photos: list }] : []
  })
}

export interface SameFeature {
  houseId: number
  /** The photo in that house sharing the most tags (first in gallery order on a tie). */
  photoId: number
  /** The shared tags, in this photo's tag order. */
  tags: string[]
}

/** Other houses with a photo sharing at least one feature tag with this one, most shared first. */
export function sameFeatureIn(snapshot: InspirationSnapshot, photoId: number): SameFeature[] {
  const photo = snapshot.photos.find((p) => p.id === photoId)
  if (!photo || photo.tags.length === 0) return []
  const best = new Map<number, SameFeature>()
  for (const p of snapshot.photos) {
    if (p.listingId === photo.listingId) continue
    const ids = new Set(p.tags.map((t) => t.tagId))
    const shared = photo.tags.filter((t) => ids.has(t.tagId)).map((t) => t.name)
    if (shared.length === 0) continue
    const current = best.get(p.listingId)
    if (!current || shared.length > current.tags.length) {
      best.set(p.listingId, { houseId: p.listingId, photoId: p.id, tags: shared })
    }
  }
  const order = new Map(snapshot.houses.map((h, i) => [h.id, i]))
  return [...best.values()].sort(
    (a, b) =>
      b.tags.length - a.tags.length || (order.get(a.houseId) ?? 0) - (order.get(b.houseId) ?? 0)
  )
}

/**
 * The note a card shows: the first non-empty "What we like" or "Why", taking people in the order
 * given (the person tagging first). Long notes are cut at a word boundary.
 */
export function noteExcerpt(
  photo: InspirationPhoto,
  personOrder: readonly number[],
  max = 140
): string | null {
  for (const personId of personOrder) {
    const note = photo.notes.find((n) => n.personId === personId)
    const text = [note?.likes, note?.why].find((t) => t && t.trim() !== '')
    if (text) return shorten(text.replace(/\s+/g, ' ').trim(), max)
  }
  return null
}

function shorten(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`
}

const SITE_SHORT: Record<SiteId, string> = { p24: 'P24', pp: 'PP' }

/**
 * Card names: the suburb, else the title, else the site and listing id. Two listings with the
 * same name both get their site and id added.
 */
export function houseNames(
  rows: readonly {
    id: number
    site: SiteId
    externalId: string
    suburb: string | null
    title: string | null
  }[]
): Map<number, string> {
  const ref = (r: (typeof rows)[number]): string => `${SITE_SHORT[r.site]}-${r.externalId}`
  const base = new Map(rows.map((r) => [r.id, r.suburb?.trim() || r.title?.trim() || ref(r)]))
  const seen = new Map<string, number>()
  for (const name of base.values()) seen.set(name, (seen.get(name) ?? 0) + 1)
  return new Map(
    rows.map((r) => {
      const name = base.get(r.id)!
      return [r.id, (seen.get(name) ?? 0) > 1 ? `${name} · ${ref(r)}` : name]
    })
  )
}
