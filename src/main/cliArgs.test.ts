import { describe, expect, it } from 'vitest'
import { scrapeUrlFromArgv } from './cliArgs'

describe('scrapeUrlFromArgv', () => {
  const electron = '/path/to/Electron'

  it('returns null for a normal app launch', () => {
    expect(scrapeUrlFromArgv([electron, '.'])).toBeNull()
    expect(scrapeUrlFromArgv([electron, '.', '--inspect'])).toBeNull()
  })

  it('returns the URL after --scrape', () => {
    expect(scrapeUrlFromArgv([electron, '.', '--scrape', 'https://www.property24.com/x'])).toBe(
      'https://www.property24.com/x'
    )
  })

  it('returns an empty string when the URL is missing', () => {
    expect(scrapeUrlFromArgv([electron, '.', '--scrape'])).toBe('')
  })
})
