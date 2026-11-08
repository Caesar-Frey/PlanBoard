import { describe, expect, it } from 'vitest'
import type { CaptureCounts } from './ipc'
import {
  STAGES,
  downloadWarnings,
  duplicateNote,
  expectedUnique,
  framingLabel,
  isComplete,
  overallFraction,
  stageIndex
} from './progress'

const counts = (over: Partial<CaptureCounts> = {}): CaptureCounts => ({
  found: 0,
  listed: null,
  duplicates: 0,
  expected: null,
  downloaded: 0,
  alreadyHad: 0,
  removed: 0,
  notFound: 0,
  failed: 0,
  onDisk: 0,
  ...over
})

describe('stages', () => {
  it('runs Survey → Foundation → Framing → Handover', () => {
    expect(STAGES.map((s) => s.label)).toEqual(['Survey', 'Foundation', 'Framing', 'Handover'])
    expect(stageIndex('survey')).toBe(0)
    expect(stageIndex('handover')).toBe(3)
  })
})

describe('overallFraction', () => {
  it('grows through the stages and ends at 1', () => {
    const survey = overallFraction('survey', 0, 0)
    const foundation = overallFraction('foundation', 0, 0)
    const framingStart = overallFraction('framing', 0, 56)
    const framingHalf = overallFraction('framing', 28, 56)
    const framingEnd = overallFraction('framing', 56, 56)
    expect(survey).toBeGreaterThan(0)
    expect(foundation).toBeGreaterThan(survey)
    expect(framingStart).toBeGreaterThanOrEqual(foundation)
    expect(framingHalf).toBeGreaterThan(framingStart)
    expect(framingEnd).toBe(1)
    expect(overallFraction('handover', 0, 0)).toBe(1)
  })

  it('never leaves 0..1 even with odd input', () => {
    expect(overallFraction('framing', 90, 56)).toBe(1)
    expect(overallFraction('framing', -3, 56)).toBeGreaterThan(0)
    expect(overallFraction('framing', 5, 0)).toBeLessThan(1)
  })
})

describe('framingLabel', () => {
  it('shows done / total', () => {
    expect(framingLabel(38, 56)).toBe('38 / 56')
  })
})

describe('duplicates', () => {
  it('treats the unique count as the expected count', () => {
    expect(expectedUnique(64, 1)).toBe(63)
    expect(expectedUnique(39, 0)).toBe(39)
    expect(expectedUnique(null, 2)).toBeNull()
    expect(expectedUnique(1, 5)).toBe(0)
  })

  it('writes a small note only when there are duplicates', () => {
    expect(duplicateNote(0)).toBeNull()
    expect(duplicateNote(1)).toBe('1 photo appears twice in the listing')
    expect(duplicateNote(3)).toBe('3 photos appear twice in the listing')
  })

  it('counts 63 of 63 as complete when the listing says 64 with one repeat', () => {
    const c = counts({
      found: 63,
      listed: 64,
      duplicates: 1,
      expected: 63,
      downloaded: 63,
      onDisk: 63
    })
    expect(isComplete(c)).toBe(true)
    expect(downloadWarnings(c)).toEqual([])
  })
})

describe('isComplete', () => {
  it('is false when genuinely fewer unique photos are on disk than expected', () => {
    expect(
      isComplete(counts({ found: 60, listed: 64, duplicates: 1, expected: 63, onDisk: 60 }))
    ).toBe(false)
  })

  it('counts photos the user removed as accounted for', () => {
    expect(isComplete(counts({ found: 10, expected: 10, onDisk: 8, removed: 2 }))).toBe(true)
  })

  it('without a stated count, is complete when nothing failed or went missing', () => {
    expect(isComplete(counts({ found: 5, onDisk: 5 }))).toBe(true)
    expect(isComplete(counts({ found: 5, onDisk: 4, notFound: 1 }))).toBe(false)
    expect(isComplete(counts({ found: 5, onDisk: 4, failed: 1 }))).toBe(false)
  })
})

describe('downloadWarnings', () => {
  it('explains 404s and failures in plain words', () => {
    const w = downloadWarnings(counts({ found: 10, onDisk: 7, notFound: 1, failed: 2 }))
    expect(w).toHaveLength(2)
    expect(w[0]).toMatch(/1 photo no longer exists/)
    expect(w[1]).toMatch(/2 photos couldn't be downloaded/)
    expect(w[1]).toMatch(/again/)
  })
})
