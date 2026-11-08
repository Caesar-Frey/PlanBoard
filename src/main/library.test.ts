import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listPeople } from './db/queries'
import { openLibrary } from './library'

describe('openLibrary', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'planboard lib '))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates a missing root, listings/ and planboard.db', () => {
    const root = join(dir, 'My House', 'PlanBoard')
    const { info, db } = openLibrary(root)
    expect(info.root).toBe(root)
    expect(existsSync(info.listingsDir)).toBe(true)
    expect(existsSync(info.dbPath)).toBe(true)
    expect(listPeople(db)).toHaveLength(2)
    db.close()
  })

  it('re-opens an existing library without error', () => {
    const root = join(dir, 'lib')
    openLibrary(root).db.close()
    const { db } = openLibrary(root)
    expect(listPeople(db)).toHaveLength(2)
    db.close()
  })
})
