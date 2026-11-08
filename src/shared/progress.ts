/**
 * Pure capture-progress maths shared by main (which emits progress) and the renderer (which
 * draws it). No runtime imports, so both bundles can use it.
 */
import type { CaptureCounts, CaptureStage } from './ipc'

export const STAGES: readonly { id: CaptureStage; label: string; hint: string }[] = [
  { id: 'survey', label: 'Survey', hint: 'Reading the listing' },
  { id: 'foundation', label: 'Foundation', hint: 'Opening the gallery' },
  { id: 'framing', label: 'Framing', hint: 'Downloading photos' },
  { id: 'handover', label: 'Handover', hint: 'Done' }
]

export function stageIndex(stage: CaptureStage): number {
  return STAGES.findIndex((s) => s.id === stage)
}

/** Share of the bar given to the stages before Framing (they take seconds, downloads minutes). */
const SURVEY_AT = 0.04
const FOUNDATION_AT = 0.1
const FRAMING_FROM = 0.15

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

/** Whole-run progress for the bar, 0..1. */
export function overallFraction(stage: CaptureStage, done: number, total: number): number {
  switch (stage) {
    case 'survey':
      return SURVEY_AT
    case 'foundation':
      return FOUNDATION_AT
    case 'framing': {
      const share = total > 0 ? clamp01(done / total) : 0
      return FRAMING_FROM + (1 - FRAMING_FROM) * share
    }
    case 'handover':
      return 1
  }
}

export function framingLabel(done: number, total: number): string {
  return `${done} / ${total}`
}

/** The listing's stated count minus repeats: the number of photos that makes a set complete. */
export function expectedUnique(listed: number | null, duplicates: number): number | null {
  if (listed === null) return null
  return Math.max(0, listed - Math.max(0, duplicates))
}

const photos = (n: number): string => (n === 1 ? '1 photo' : `${n} photos`)

export function duplicateNote(duplicates: number): string | null {
  if (duplicates <= 0) return null
  return duplicates === 1
    ? '1 photo appears twice in the listing'
    : `${duplicates} photos appear twice in the listing`
}

/** True when every expected photo is in the folder (or was removed on purpose). */
export function isComplete(c: CaptureCounts): boolean {
  if (c.expected !== null) return c.onDisk + c.removed >= c.expected
  return c.notFound === 0 && c.failed === 0 && c.onDisk + c.removed >= c.found
}

/** Problems from the download step, in plain words. Scrape-step warnings come from the scraper. */
export function downloadWarnings(c: CaptureCounts): string[] {
  const out: string[] = []
  if (c.notFound > 0) {
    out.push(
      `${photos(c.notFound)} no longer ${c.notFound === 1 ? 'exists' : 'exist'} on the site ` +
        `(it answered "not found"), so ${c.notFound === 1 ? 'it was' : 'they were'} skipped.`
    )
  }
  if (c.failed > 0) {
    out.push(
      `${photos(c.failed)} couldn't be downloaded. Survey the listing again to retry: ` +
        `photos already in the folder are skipped.`
    )
  }
  return out
}
