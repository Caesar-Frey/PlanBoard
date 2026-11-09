/**
 * Fuzzy matching of feature tags (brief 4.3): ignores case, spacing, punctuation, plurals and
 * word order, and forgives small typos, so an existing tag is suggested before a near-copy is
 * made ("kitchen island" → "Island?"). Pure, no runtime imports: main uses it to reuse an
 * equivalent tag, the renderer for auto-complete.
 */

export interface TagLike {
  id: number
  name: string
}

/** How a suggestion matched, best first. */
export type MatchKind =
  /** The same tag: only case, spacing, plurals or word order differ. */
  | 'same'
  /** What's typed so far starts the tag (or one of its words). */
  | 'prefix'
  /** The whole tag appears inside what's typed ("kitchen island" → "Island"). */
  | 'contained'
  /** Every typed word is in the tag ("lights" → "Pendant lights"). */
  | 'words'
  /** One or two letters off ("iland" → "Island"). */
  | 'typo'

export interface TagSuggestion<T extends TagLike = TagLike> {
  tag: T
  kind: MatchKind
}

const SCORE: Record<MatchKind, number> = {
  same: 100,
  prefix: 90,
  contained: 80,
  words: 70,
  typo: 55
}

/** Lower case, letters and digits only, one space between words ("Built-in" → "built in"). */
function phrase(text: string): string {
  return text
    .toLocaleLowerCase('en-ZA')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** English plurals, simply: benches → bench, pantries → pantry, shelves → shelf, doors → door. */
function singular(word: string): string {
  if (word.length <= 3) return word
  if (word.endsWith('lves')) return `${word.slice(0, -3)}f`
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (/(?:ss|ch|sh|x|z)es$/.test(word)) return word.slice(0, -2)
  if (/(?:ss|us|is)$/.test(word)) return word
  if (word.endsWith('s')) return word.slice(0, -1)
  return word
}

function words(text: string): string[] {
  const p = phrase(text)
  return p === '' ? [] : p.split(' ').map(singular)
}

/** Two names with the same key are the same tag. Empty for a name with no letters or digits. */
export function tagKey(name: string): string {
  return words(name).sort().join(' ')
}

/** Typos allowed for a word or key of this length: none under 4 letters, 2 from 8. */
const allowedTypos = (length: number): number => (length >= 8 ? 2 : length >= 4 ? 1 : 0)

/** Optimal-string-alignment distance: insert, delete, change, or swap two neighbours. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const rows: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    const row: number[] = [i]
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) {
        row.push(j)
        continue
      }
      const prev = rows[i - 1]!
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, rows[i - 2]![j - 2]! + 1)
      }
      row.push(d)
    }
    rows.push(row)
  }
  return rows[a.length]![b.length]!
}

const closeEnough = (a: string, b: string): boolean => {
  const max = allowedTypos(Math.min(a.length, b.length))
  return max > 0 && distance(a, b, max) <= max
}

interface Typed {
  phrase: string
  words: string[]
  key: string
}

function match(typed: Typed, name: string): MatchKind | null {
  const tagWords = words(name)
  if (tagWords.length === 0) return null
  const key = [...tagWords].sort().join(' ')
  if (key === typed.key) return 'same'

  const tagPhrase = phrase(name)
  if (tagPhrase.startsWith(typed.phrase)) return 'prefix'
  // The last word is still being typed: earlier words must be in the tag, the last starts one.
  const last = typed.phrase.split(' ').at(-1)!
  const earlier = typed.words.slice(0, -1)
  if (
    earlier.every((w) => tagWords.includes(w)) &&
    tagPhrase.split(' ').some((w) => w.startsWith(last))
  ) {
    return 'prefix'
  }

  if (tagWords.length < typed.words.length && tagWords.every((w) => typed.words.includes(w))) {
    return 'contained'
  }
  if (typed.words.every((w) => tagWords.includes(w))) return 'words'

  if (closeEnough(typed.key, key)) return 'typo'
  // Each typed word is in the tag, or a typo of one of its words.
  if (typed.words.every((w) => tagWords.some((t) => t === w || closeEnough(w, t)))) return 'typo'
  return null
}

/**
 * Existing tags that match what's typed, best first: same, prefix, contained, words, typo;
 * then shorter names, then A–Z. Empty input suggests nothing.
 */
export function suggestTags<T extends TagLike>(
  input: string,
  tags: readonly T[],
  limit = 6
): TagSuggestion<T>[] {
  const typedWords = words(input)
  if (typedWords.length === 0) return []
  const typed: Typed = {
    phrase: phrase(input),
    words: typedWords,
    key: [...typedWords].sort().join(' ')
  }
  const found: TagSuggestion<T>[] = []
  for (const tag of tags) {
    const kind = match(typed, tag.name)
    if (kind) found.push({ tag, kind })
  }
  found.sort(
    (a, b) =>
      SCORE[b.kind] - SCORE[a.kind] ||
      a.tag.name.length - b.tag.name.length ||
      a.tag.name.localeCompare(b.tag.name, 'en-ZA')
  )
  return found.slice(0, limit)
}

/** The existing tag that is the same as `name` (case, spacing, plurals, word order), if any. */
export function findEquivalentTag<T extends TagLike>(name: string, tags: readonly T[]): T | null {
  const key = tagKey(name)
  if (key === '') return null
  return tags.find((t) => tagKey(t.name) === key) ?? null
}
