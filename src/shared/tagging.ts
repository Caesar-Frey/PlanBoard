/**
 * Rooms, marks and tag-name rules (brief 4.3), shared by main and the renderer. Pure, no
 * runtime imports.
 */
import type { Mark } from './ipc'

/** One room per photo, from this fixed list. */
export const ROOMS = [
  'Whole house / Exterior',
  'Facade',
  'Entrance',
  'Lounge',
  'Dining',
  'Kitchen',
  'Scullery',
  'Main bedroom',
  'Bedroom',
  'Bathroom',
  'Study',
  'Patio',
  'Braai area',
  'Garden',
  'Pool',
  'Garage',
  'Other'
] as const

export type Room = (typeof ROOMS)[number]

export const isRoom = (v: unknown): v is Room =>
  typeof v === 'string' && (ROOMS as readonly string[]).includes(v)

export const MARKS: readonly { id: Mark; label: string }[] = [
  { id: 'must', label: 'Must-have' },
  { id: 'nice', label: 'Nice' },
  { id: 'maybe', label: 'Maybe' }
]

export const MARK_LABEL: Record<Mark, string> = { must: 'Must-have', nice: 'Nice', maybe: 'Maybe' }

export const isMark = (v: unknown): v is Mark =>
  typeof v === 'string' && MARKS.some((m) => m.id === v)

export const MAX_TAG_LENGTH = 40

/**
 * The name as stored: trimmed, inner spaces collapsed, first letter in capitals ("kitchen
 * island" → "Kitchen island"; "LED strip" stays). Null when empty or longer than 40 letters.
 */
export function cleanTagName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name === '' || [...name].length > MAX_TAG_LENGTH) return null
  return name.charAt(0).toLocaleUpperCase('en-ZA') + name.slice(1)
}

/** Recent surveys' "tagged" figure: 0..100, rounded down. */
export function taggedPercent(tagged: number, total: number): number {
  return total > 0 ? Math.floor((tagged * 100) / total) : 0
}
