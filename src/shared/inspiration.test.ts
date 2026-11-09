/** Inspiration library logic (brief 4.4): filters, coincidence, search, "Same feature in". */
import { describe, expect, it } from 'vitest'
import type {
  InspirationHouse,
  InspirationPhoto,
  InspirationSnapshot,
  Mark,
  PhotoNote
} from './ipc'
import {
  DEFAULT_FILTER,
  NO_ROOM,
  coincidence,
  coincideSentence,
  filterPhotos,
  groupByHouse,
  houseNames,
  inlineTagName,
  matchesSearch,
  noteExcerpt,
  partnerOf,
  roomCounts,
  sameFeatureIn,
  tagCounts,
  type InspirationFilter,
  type Viewers
} from './inspiration'

const ME = 1
const PARTNER = 2
const viewers: Viewers = { me: ME, partner: PARTNER }

const TAGS: Record<string, number> = {
  Island: 1,
  'Pendant lights': 2,
  'Stacker doors': 3,
  Scullery: 4,
  'Timber ceiling': 5,
  'LED strip': 6
}

function house(id: number, suburb: string | null, extra: Partial<InspirationHouse> = {}) {
  return {
    id,
    site: 'p24' as const,
    externalId: String(id),
    name: suburb ?? `House ${id}`,
    suburb,
    city: 'Pretoria',
    title: null,
    price: null,
    folderName: `${suburb ?? 'X'}_P24-${id}`,
    photoCount: 0,
    notes: [],
    createdAt: id,
    ...extra
  } satisfies InspirationHouse
}

interface PhotoSpec {
  room?: string | null
  /** Tag name → who tagged it (default: me). */
  tags?: Record<string, number[]> | string[]
  marks?: Partial<Record<number, Mark>>
  notes?: Partial<Record<number, { likes?: string; why?: string }>>
}

let nextPhotoId = 100
function photo(listingId: number, spec: PhotoSpec = {}): InspirationPhoto {
  const id = nextPhotoId++
  const tagSpec = Array.isArray(spec.tags)
    ? Object.fromEntries(spec.tags.map((t) => [t, [ME]]))
    : (spec.tags ?? {})
  const tags = Object.entries(tagSpec)
    .map(([name, personIds]) => ({ tagId: TAGS[name] ?? 99, name, personIds }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const people = new Set([
    ...Object.keys(spec.marks ?? {}).map(Number),
    ...Object.keys(spec.notes ?? {}).map(Number)
  ])
  const notes: PhotoNote[] = [...people].sort().map((personId) => ({
    personId,
    likes: spec.notes?.[personId]?.likes ?? null,
    why: spec.notes?.[personId]?.why ?? null,
    mark: spec.marks?.[personId] ?? null,
    updatedAt: 1
  }))
  return {
    id,
    listingId,
    fileName: `image_${id}.jpg`,
    url: `planboard-media://library/listings/x/image_${id}.jpg`,
    room: spec.room ?? null,
    tags,
    notes
  }
}

function snapshot(houses: InspirationHouse[], photos: InspirationPhoto[]): InspirationSnapshot {
  return {
    houses: houses.map((h) => ({
      ...h,
      photoCount: photos.filter((p) => p.listingId === h.id).length
    })),
    photos
  }
}

const filter = (f: Partial<InspirationFilter>): InspirationFilter => ({ ...DEFAULT_FILTER, ...f })
const ids = (photos: InspirationPhoto[]): number[] => photos.map((p) => p.id)

describe('partnerOf', () => {
  it('is the other of the two people', () => {
    const people = [
      { id: 1, name: 'A', colour: '#000000' },
      { id: 2, name: 'B', colour: '#000000' }
    ]
    expect(partnerOf(people, 1)).toBe(2)
    expect(partnerOf(people, 2)).toBe(1)
    expect(partnerOf(people.slice(0, 1), 1)).toBeNull()
    expect(partnerOf(people, null)).toBeNull()
  })
})

describe('filterPhotos', () => {
  const kitchen = photo(1, { room: 'Kitchen', tags: ['Island'] })
  const kitchen2 = photo(2, { room: 'Kitchen', tags: { Island: [PARTNER] } })
  const lounge = photo(1, { room: 'Lounge', tags: ['Timber ceiling'] })
  const unroomed = photo(2)
  const snap = snapshot(
    [house(1, 'Irene'), house(2, 'Midstream')],
    [kitchen, kitchen2, lounge, unroomed]
  )

  it('returns everything with the default filter', () => {
    expect(ids(filterPhotos(snap, DEFAULT_FILTER, viewers))).toEqual(ids(snap.photos))
  })

  it('filters by room, and NO_ROOM finds photos without one', () => {
    expect(ids(filterPhotos(snap, filter({ room: 'Kitchen' }), viewers))).toEqual([
      kitchen.id,
      kitchen2.id
    ])
    expect(ids(filterPhotos(snap, filter({ room: NO_ROOM }), viewers))).toEqual([unroomed.id])
  })

  it('ignores the room in Detail scope (a feature across all rooms)', () => {
    const f = filter({ scope: 'detail', room: 'Lounge', tagId: TAGS.Island! })
    expect(ids(filterPhotos(snap, f, viewers))).toEqual([kitchen.id, kitchen2.id])
  })

  it('filters by tag, whoever tagged it', () => {
    expect(ids(filterPhotos(snap, filter({ tagId: TAGS.Island! }), viewers))).toEqual([
      kitchen.id,
      kitchen2.id
    ])
  })

  describe('marks', () => {
    const must = photo(1, { marks: { [ME]: 'must' } })
    const nice = photo(1, { marks: { [PARTNER]: 'nice' } })
    const none = photo(1, { notes: { [ME]: { likes: 'x' } } })
    const s = snapshot([house(1, 'Irene')], [must, nice, none])

    it('keeps photos anyone marked with one of the chosen marks', () => {
      expect(ids(filterPhotos(s, filter({ marks: ['must'] }), viewers))).toEqual([must.id])
      expect(ids(filterPhotos(s, filter({ marks: ['must', 'nice'] }), viewers))).toEqual([
        must.id,
        nice.id
      ])
    })

    it('with a person filter, only that person’s mark counts', () => {
      expect(ids(filterPhotos(s, filter({ marks: ['nice'], person: 'me' }), viewers))).toEqual([])
      expect(ids(filterPhotos(s, filter({ marks: ['nice'], person: 'partner' }), viewers))).toEqual(
        [nice.id]
      )
    })
  })

  describe('person', () => {
    const mineTag = photo(1, { tags: { Island: [ME] } })
    const theirsMark = photo(1, { marks: { [PARTNER]: 'maybe' } })
    const myNote = photo(1, { notes: { [ME]: { why: 'Light' } } })
    const bothTag = photo(1, { tags: { Island: [ME, PARTNER] } })
    const splitTags = photo(1, { tags: { Island: [ME], Scullery: [PARTNER] } })
    const bothMust = photo(1, { marks: { [ME]: 'must', [PARTNER]: 'must' } })
    const mustAndMaybe = photo(1, { marks: { [ME]: 'must', [PARTNER]: 'maybe' } })
    const untouched = photo(1, { room: 'Kitchen' })
    const s = snapshot(
      [house(1, 'Irene')],
      [mineTag, theirsMark, myNote, bothTag, splitTags, bothMust, mustAndMaybe, untouched]
    )

    it('Me: photos I tagged, marked or wrote about', () => {
      expect(ids(filterPhotos(s, filter({ person: 'me' }), viewers))).toEqual([
        mineTag.id,
        myNote.id,
        bothTag.id,
        splitTags.id,
        bothMust.id,
        mustAndMaybe.id
      ])
    })

    it('Partner: photos the other person tagged, marked or wrote about', () => {
      expect(ids(filterPhotos(s, filter({ person: 'partner' }), viewers))).toEqual([
        theirsMark.id,
        bothTag.id,
        splitTags.id,
        bothMust.id,
        mustAndMaybe.id
      ])
    })

    it('Both agree: both people picked it', () => {
      expect(ids(filterPhotos(s, filter({ person: 'both' }), viewers))).toEqual([
        bothTag.id,
        splitTags.id,
        bothMust.id,
        mustAndMaybe.id
      ])
    })

    it('Both agree with a tag: both put that tag on', () => {
      const f = filter({ person: 'both', tagId: TAGS.Island! })
      expect(ids(filterPhotos(s, f, viewers))).toEqual([bothTag.id])
    })

    it('Both agree with marks: both marks are among the chosen ones', () => {
      expect(ids(filterPhotos(s, filter({ person: 'both', marks: ['must'] }), viewers))).toEqual([
        bothMust.id
      ])
      const f = filter({ person: 'both', marks: ['must', 'maybe'] })
      expect(ids(filterPhotos(s, f, viewers))).toEqual([bothMust.id, mustAndMaybe.id])
    })

    it('matches nothing for a person who is not set up', () => {
      const alone: Viewers = { me: ME, partner: null }
      expect(filterPhotos(s, filter({ person: 'partner' }), alone)).toEqual([])
      expect(filterPhotos(s, filter({ person: 'both' }), alone)).toEqual([])
    })
  })

  it('combines room, tag, mark and search', () => {
    const a = photo(1, { room: 'Kitchen', tags: ['Island'], marks: { [ME]: 'must' } })
    const b = photo(1, { room: 'Kitchen', tags: ['Island'], marks: { [ME]: 'nice' } })
    const c = photo(2, { room: 'Kitchen', tags: ['Island'], marks: { [ME]: 'must' } })
    const s = snapshot([house(1, 'Irene'), house(2, 'Midstream')], [a, b, c])
    const f = filter({ room: 'Kitchen', tagId: TAGS.Island!, marks: ['must'], query: 'irene' })
    expect(ids(filterPhotos(s, f, viewers))).toEqual([a.id])
  })
})

describe('matchesSearch', () => {
  const h = house(1, 'Cornwall Hill', { city: 'Centurion' })
  const p = photo(1, {
    room: 'Kitchen',
    tags: ['Pendant lights'],
    notes: { [PARTNER]: { likes: 'Waterfall edge in pale stone', why: 'We cook together' } }
  })

  it('finds words in notes, tags, suburb, city and room, ignoring case', () => {
    for (const q of ['waterfall', 'COOK', 'pendant', 'cornwall', 'centurion', 'kitchen']) {
      expect(matchesSearch(p, h, q)).toBe(true)
    }
    expect(matchesSearch(p, h, 'pool')).toBe(false)
  })

  it('needs every word to match somewhere', () => {
    expect(matchesSearch(p, h, 'pendant cornwall')).toBe(true)
    expect(matchesSearch(p, h, 'pendant pool')).toBe(false)
  })

  it('treats a blank query as matching everything', () => {
    expect(matchesSearch(p, h, '   ')).toBe(true)
  })

  it('tolerates plurals and accents', () => {
    expect(matchesSearch(p, h, 'lights')).toBe(true)
    expect(matchesSearch(p, h, 'kitchens')).toBe(true)
    const accent = house(2, 'Église Park')
    expect(matchesSearch(photo(2), accent, 'eglise')).toBe(true)
  })

  it('looks only at this photo and its own house', () => {
    expect(matchesSearch(photo(2), house(2, 'Irene'), 'cornwall')).toBe(false)
  })
})

describe('roomCounts', () => {
  const s = snapshot(
    [house(1, 'Irene')],
    [
      photo(1, { room: 'Kitchen', marks: { [ME]: 'must' } }),
      photo(1, { room: 'Kitchen' }),
      photo(1, { room: 'Lounge', marks: { [ME]: 'must' } }),
      photo(1)
    ]
  )

  it('counts photos per room in the fixed room order, plus those without a room', () => {
    expect(roomCounts(s, DEFAULT_FILTER, viewers)).toEqual({
      total: 4,
      rooms: [
        { room: 'Lounge', count: 1 },
        { room: 'Kitchen', count: 2 },
        { room: NO_ROOM, count: 1 }
      ]
    })
  })

  it('applies the other filters but not the room itself', () => {
    const r = roomCounts(s, filter({ room: 'Kitchen', marks: ['must'] }), viewers)
    expect(r).toEqual({
      total: 2,
      rooms: [
        { room: 'Lounge', count: 1 },
        { room: 'Kitchen', count: 1 }
      ]
    })
  })

  it('keeps the chosen room in the list even when nothing is left in it', () => {
    const r = roomCounts(s, filter({ room: 'Pool' }), viewers)
    expect(r.rooms.find((x) => x.room === 'Pool')).toEqual({ room: 'Pool', count: 0 })
  })
})

describe('tagCounts', () => {
  const s = snapshot(
    [house(1, 'Irene'), house(2, 'Midstream')],
    [
      photo(1, { room: 'Kitchen', tags: ['Island', 'Pendant lights'] }),
      photo(1, { room: 'Kitchen', tags: ['Island'] }),
      photo(2, { room: 'Kitchen', tags: ['Island', 'Scullery'] }),
      photo(2, { room: 'Lounge', tags: ['Timber ceiling'] })
    ]
  )

  it('counts photos and houses per tag in the current room, most photos first', () => {
    expect(tagCounts(s, filter({ room: 'Kitchen' }), viewers)).toEqual([
      { tagId: TAGS.Island, name: 'Island', photos: 3, houses: 2 },
      { tagId: TAGS['Pendant lights'], name: 'Pendant lights', photos: 1, houses: 1 },
      { tagId: TAGS.Scullery, name: 'Scullery', photos: 1, houses: 1 }
    ])
  })

  it('ignores the chosen tag itself, so the other tags stay available', () => {
    const r = tagCounts(s, filter({ room: 'Kitchen', tagId: TAGS.Scullery! }), viewers)
    expect(r.map((t) => t.name)).toEqual(['Island', 'Pendant lights', 'Scullery'])
  })

  it('keeps the chosen tag with zero counts when the room has none', () => {
    const r = tagCounts(s, filter({ room: 'Lounge', tagId: TAGS.Island! }), viewers)
    expect(r).toContainEqual({ tagId: TAGS.Island, name: 'Island', photos: 0, houses: 0 })
  })

  it('counts only the filtered person’s tags', () => {
    const t = snapshot(
      [house(1, 'Irene')],
      [photo(1, { tags: { Island: [PARTNER], Scullery: [ME] } })]
    )
    expect(tagCounts(t, filter({ person: 'me' }), viewers).map((x) => x.name)).toEqual(['Scullery'])
  })
})

describe('coincidence', () => {
  // 4 houses. Island in houses 1, 2, 3. Pendant lights with Island in 1 and 2 (3 photos in 1).
  // Stacker doors with Island in house 3 (2 photos). Scullery with Island in house 2.
  const houses = [house(1, 'A'), house(2, 'B'), house(3, 'C'), house(4, 'D')]
  const photos = [
    photo(1, { room: 'Kitchen', tags: ['Island', 'Pendant lights'] }),
    photo(1, { room: 'Kitchen', tags: ['Island', 'Pendant lights'] }),
    photo(1, { room: 'Kitchen', tags: ['Island', 'Pendant lights'] }),
    photo(2, { room: 'Kitchen', tags: ['Island', 'Pendant lights', 'Scullery'] }),
    photo(3, { room: 'Kitchen', tags: ['Island', 'Stacker doors'] }),
    photo(3, { room: 'Patio', tags: ['Island', 'Stacker doors'] }),
    photo(4, { room: 'Lounge', tags: ['Pendant lights'] }),
    // Pendant lights on another photo of house 3, not with Island: not a pairing.
    photo(3, { room: 'Lounge', tags: ['Pendant lights'] })
  ]
  const s = snapshot(houses, photos)

  it('counts houses, not photos, for the tag and its pairings', () => {
    const c = coincidence(s, filter({ tagId: TAGS.Island! }), viewers)
    expect(c).toMatchObject({ tagId: TAGS.Island, name: 'Island', houses: 3, totalHouses: 4 })
    expect(c?.photos).toBe(6)
    expect(c?.pairs).toEqual([
      { tagId: TAGS['Pendant lights'], name: 'Pendant lights', houses: 2, photos: 4 },
      { tagId: TAGS['Stacker doors'], name: 'Stacker doors', houses: 1, photos: 2 },
      { tagId: TAGS.Scullery, name: 'Scullery', houses: 1, photos: 1 }
    ])
  })

  it('breaks ties on houses by photos, then by name A–Z', () => {
    const t = snapshot(
      [house(1, 'A'), house(2, 'B')],
      [
        photo(1, { tags: ['Island', 'Timber ceiling'] }),
        photo(2, { tags: ['Island', 'Scullery'] }),
        photo(2, { tags: ['Island', 'LED strip'] })
      ]
    )
    const c = coincidence(t, filter({ tagId: TAGS.Island! }), viewers)
    expect(c?.pairs.map((p) => p.name)).toEqual(['LED strip', 'Scullery', 'Timber ceiling'])
  })

  it('without a chosen tag, describes the tag found in the most houses', () => {
    expect(coincidence(s, DEFAULT_FILTER, viewers)?.name).toBe('Pendant lights')
    // Inside the Kitchen, Island is in 3 houses and Pendant lights in only 2.
    expect(coincidence(s, filter({ room: 'Kitchen' }), viewers)?.name).toBe('Island')
  })

  it('respects the room and the person filter', () => {
    const c = coincidence(s, filter({ room: 'Kitchen', tagId: TAGS.Island! }), viewers)
    expect(c?.houses).toBe(3)
    expect(c?.pairs.find((p) => p.name === 'Stacker doors')).toMatchObject({ houses: 1, photos: 1 })
    expect(coincidence(s, filter({ person: 'partner' }), viewers)).toBeNull()
  })

  it('totals only houses that still have photos', () => {
    const t = snapshot([house(1, 'A'), house(2, 'B')], [photo(1, { tags: ['Island'] })])
    expect(coincidence(t, filter({ tagId: TAGS.Island! }), viewers)?.totalHouses).toBe(1)
  })

  it('is null when no photo in view carries a tag', () => {
    expect(coincidence(snapshot([house(1, 'A')], [photo(1)]), DEFAULT_FILTER, viewers)).toBeNull()
  })
})

describe('coincideSentence', () => {
  const base = {
    tagId: 1,
    name: 'Island',
    houses: 9,
    totalHouses: 23,
    photos: 14
  }
  it('reads like the brief’s example', () => {
    expect(
      coincideSentence({
        ...base,
        pairs: [
          { tagId: 2, name: 'Pendant lights', houses: 6, photos: 8 },
          { tagId: 3, name: 'Stacker doors', houses: 4, photos: 4 },
          { tagId: 4, name: 'Scullery', houses: 1, photos: 1 }
        ]
      })
    ).toBe(
      'Island appears in 9 of 23 houses, most often paired with pendant lights (6) and stacker doors (4).'
    )
  })

  it('handles one pairing, none, a single house and acronyms', () => {
    expect(
      coincideSentence({
        ...base,
        houses: 1,
        totalHouses: 1,
        pairs: [{ tagId: 6, name: 'LED strip', houses: 1, photos: 1 }]
      })
    ).toBe('Island appears in 1 of 1 house, most often paired with LED strip (1).')
    expect(coincideSentence({ ...base, pairs: [] })).toBe(
      'Island appears in 9 of 23 houses. It isn’t paired with another feature yet.'
    )
  })
})

describe('inlineTagName', () => {
  it('lower-cases the first letter unless the word is an acronym', () => {
    expect(inlineTagName('Pendant lights')).toBe('pendant lights')
    expect(inlineTagName('LED strip')).toBe('LED strip')
    expect(inlineTagName('A')).toBe('a')
  })
})

describe('groupByHouse', () => {
  it('groups photos by house in house order', () => {
    const a = photo(2)
    const b = photo(1)
    const c = photo(2)
    const s = snapshot([house(2, 'B'), house(1, 'A')], [a, c, b])
    const groups = groupByHouse(s, [b, a, c])
    expect(groups.map((g) => [g.house.id, ids(g.photos)])).toEqual([
      [2, [a.id, c.id]],
      [1, [b.id]]
    ])
  })
})

describe('sameFeatureIn', () => {
  const p = photo(1, { tags: ['Island', 'Pendant lights'] })
  const sameHouse = photo(1, { tags: ['Island'] })
  const one = photo(2, { tags: ['Island'] })
  const both = photo(3, { tags: ['Pendant lights'] })
  const bothBetter = photo(3, { tags: ['Island', 'Pendant lights'] })
  const none = photo(4, { tags: ['Scullery'] })
  const untagged = photo(2)
  const s = snapshot(
    [house(1, 'A'), house(2, 'B'), house(3, 'C'), house(4, 'D')],
    [p, sameHouse, one, both, bothBetter, none, untagged]
  )

  it('lists other houses sharing a tag, most shared first, with their best photo', () => {
    expect(sameFeatureIn(s, p.id)).toEqual([
      { houseId: 3, photoId: bothBetter.id, tags: ['Island', 'Pendant lights'] },
      { houseId: 2, photoId: one.id, tags: ['Island'] }
    ])
  })

  it('is empty for an untagged or unknown photo', () => {
    expect(sameFeatureIn(s, untagged.id)).toEqual([])
    expect(sameFeatureIn(s, 99999)).toEqual([])
  })
})

describe('noteExcerpt', () => {
  it('prefers the first person’s likes, then why, then the other person', () => {
    const p = photo(1, { notes: { [ME]: { why: 'Mine why' }, [PARTNER]: { likes: 'Their like' } } })
    expect(noteExcerpt(p, [ME, PARTNER])).toBe('Mine why')
    expect(noteExcerpt(p, [PARTNER, ME])).toBe('Their like')
    expect(noteExcerpt(photo(1), [ME, PARTNER])).toBeNull()
  })

  it('shortens long notes at a word boundary', () => {
    const p = photo(1, { notes: { [ME]: { likes: 'one two three four five six' } } })
    expect(noteExcerpt(p, [ME], 14)).toBe('one two three…')
  })
})

describe('houseNames', () => {
  it('uses the suburb, falls back to the title, and keeps names unique', () => {
    const names = houseNames([
      { id: 1, site: 'p24', externalId: '11', suburb: 'Irene', title: null },
      { id: 2, site: 'pp', externalId: 'T22', suburb: 'Irene', title: null },
      { id: 3, site: 'p24', externalId: '33', suburb: null, title: 'Farm house' },
      { id: 4, site: 'pp', externalId: 'T44', suburb: '  ', title: null }
    ])
    expect(names.get(1)).toBe('Irene · P24-11')
    expect(names.get(2)).toBe('Irene · PP-T22')
    expect(names.get(3)).toBe('Farm house')
    expect(names.get(4)).toBe('PP-T44')
  })
})
