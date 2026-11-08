import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultSettings, loadSettings, parseSettings, saveSettings } from './settings'

const HOME = '/Users/alex'

describe('parseSettings', () => {
  it('returns defaults for non-objects', () => {
    for (const raw of [null, undefined, 42, 'x', []]) {
      expect(parseSettings(raw, HOME)).toEqual(defaultSettings(HOME))
    }
  })

  it('defaults the library root to ~/Pictures/PlanBoard', () => {
    expect(defaultSettings(HOME)).toEqual({
      libraryRoot: '/Users/alex/Pictures/PlanBoard',
      currentPersonId: null
    })
  })

  it('keeps valid values and resolves ~', () => {
    expect(parseSettings({ libraryRoot: '~/House', currentPersonId: 2 }, HOME)).toEqual({
      libraryRoot: '/Users/alex/House',
      currentPersonId: 2
    })
  })

  it('replaces invalid fields with defaults individually', () => {
    expect(parseSettings({ libraryRoot: 'relative', currentPersonId: 'two' }, HOME)).toEqual(
      defaultSettings(HOME)
    )
    expect(parseSettings({ libraryRoot: '/tmp/lib', currentPersonId: -1 }, HOME)).toEqual({
      libraryRoot: '/tmp/lib',
      currentPersonId: null
    })
    expect(parseSettings({ libraryRoot: 7, currentPersonId: 1.5 }, HOME)).toEqual(
      defaultSettings(HOME)
    )
  })
})

describe('loadSettings / saveSettings', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'planboard settings '))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns defaults when the file is missing', () => {
    expect(loadSettings(join(dir, 'settings.json'), HOME)).toEqual(defaultSettings(HOME))
  })

  it('returns defaults when the file is corrupt', () => {
    const file = join(dir, 'settings.json')
    writeFileSync(file, '{ not json')
    expect(loadSettings(file, HOME)).toEqual(defaultSettings(HOME))
  })

  it('round-trips through save and load', () => {
    const file = join(dir, 'nested', 'settings.json')
    const settings = { libraryRoot: '/Volumes/Shared/PlanBoard', currentPersonId: 1 }
    saveSettings(file, settings)
    expect(existsSync(file)).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(settings)
    expect(loadSettings(file, HOME)).toEqual(settings)
  })
})
