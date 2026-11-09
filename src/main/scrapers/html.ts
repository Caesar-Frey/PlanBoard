/**
 * Site-neutral helpers for reading saved listing HTML. Selectors belong in the site modules.
 */
import { parse, type HTMLElement } from 'node-html-parser'

export type { HTMLElement }

export function parseHtml(html: string): HTMLElement {
  return parse(html, { comment: false })
}

/** Collapses whitespace (including non-breaking spaces) and trims. Empty → null. */
export function cleanText(text: string | null | undefined): string | null {
  if (text == null) return null
  const cleaned = text
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned === '' ? null : cleaned
}

/** Text of the first element matching `selector`, cleaned. */
export function textOf(root: HTMLElement, selector: string): string | null {
  const el = root.querySelector(selector)
  return el ? cleanText(el.text) : null
}

/** First number in a string: "4", "2.5 Bathrooms", "3,5" → 4, 2.5, 3.5. */
export function firstNumber(text: string | null | undefined): number | null {
  if (!text) return null
  const m = /\d+(?:[.,]\d+)?/.exec(text)
  if (!m) return null
  const n = Number(m[0].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Text of a block element with paragraph and line breaks kept as `\n`.
 * `<p>A</p><p>B</p>` → "A\nB".
 */
export function paragraphText(el: HTMLElement | null): string | null {
  if (!el) return null
  const paragraphs = el.querySelectorAll('p')
  if (paragraphs.length === 0) return cleanText(el.text)
  const lines = paragraphs
    .flatMap((p) => p.innerHTML.split(/<br\s*\/?>/i))
    .map((chunk) => cleanText(parseHtml(chunk).text))
    .filter((line): line is string => line !== null)
  return lines.length ? lines.join('\n') : null
}

/** Parses every `<script type="application/ld+json">` block; bad JSON is skipped. */
export function jsonLdBlocks(root: HTMLElement): unknown[] {
  const out: unknown[] = []
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data: unknown = JSON.parse(script.rawText)
      const graph = isRecord(data) && Array.isArray(data['@graph']) ? data['@graph'] : [data]
      out.push(...graph)
    } catch {
      // Ignore malformed blocks; other sources still apply.
    }
  }
  return out
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads a nested string from parsed JSON: `pick(obj, 'offers', 'offeredBy', 'name')`. */
export function pick(value: unknown, ...path: string[]): string | null {
  let cur: unknown = value
  for (const key of path) {
    if (!isRecord(cur)) return null
    cur = cur[key]
  }
  if (typeof cur === 'number') return String(cur)
  return typeof cur === 'string' ? cleanText(cur) : null
}

/** Parses a URL, returning null instead of throwing. */
export function tryUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/** Keeps the first occurrence of each key, preserving order. */
export function uniqueBy<T>(items: Iterable<T>, key: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const k = key(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

/** Builds the standard "fewer photos than stated" / "no count" warnings. */
export function countWarnings(found: number, expected: number | null, siteName: string): string[] {
  if (expected === null) {
    return [
      `Couldn't read the photo count from the ${siteName} page, so PlanBoard can't check that ` +
        `all ${found} photos were found.`
    ]
  }
  if (found < expected) {
    return [
      `Found ${found} of ${expected} photos the listing states. Some photos may be missing: try ` +
        `again, or add the missing ones with the manual fallback.`
    ]
  }
  return []
}

/**
 * Private Property serves some descriptions with SQL-style escaped apostrophes ("you''ll",
 * "Entertainer''s"), already in its server-rendered HTML. Two apostrophes between a letter or
 * digit and a letter are never real prose, so they become one. Anything else is left alone.
 */
export function collapseEscapedQuotes<T extends string | null>(text: T): T {
  if (text === null) return text
  return text.replace(/(?<=[\p{L}\p{N}])''(?=\p{L})/gu, "'") as T
}

/** A rand amount as the listing shows it ("R 59 898"). Bare digits get the "R". Else null. */
export function randText(text: string | null | undefined): string | null {
  const t = cleanText(text)
  if (!t) return null
  const m = /^(?:r\s*)?(\d[\d ]*(?:[.,]\d+)?)$/i.exec(t)
  return m?.[1] ? `R ${m[1].trim()}` : null
}

/** An interest rate as "10.75%". Null when the text is not a number. */
export function percentText(text: string | null | undefined): string | null {
  const t = cleanText(text)?.replace(/\s*%$/, '')
  if (!t || !/^\d{1,2}(?:[.,]\d{1,3})?$/.test(t)) return null
  return `${t.replace(',', '.')}%`
}

/** A phone number from a `tel:` link or visible text; null when it holds no number. */
export function telNumber(text: string | null | undefined): string | null {
  if (!text) return null
  let t = text.replace(/^tel:/i, '')
  try {
    t = decodeURIComponent(t)
  } catch {
    // Keep the raw text.
  }
  const cleaned = cleanText(t)
  return cleaned && /^\+?[\d ()-]{9,20}$/.test(cleaned) ? cleaned : null
}

/** An email address from a `mailto:` link or visible text; null when it holds none. */
export function mailAddress(text: string | null | undefined): string | null {
  if (!text) return null
  const t = cleanText(text.replace(/^mailto:/i, '').split('?')[0])
  return t && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null
}

/** Distinct non-empty values joined with ", "; null when there are none. */
export function joinValues(values: Iterable<string | null | undefined>): string | null {
  const out = uniqueBy(
    [...values].filter((v): v is string => !!v && v.trim() !== ''),
    (v) => v
  )
  return out.length ? out.join(', ') : null
}
