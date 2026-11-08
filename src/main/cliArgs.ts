/** Command-line flags. Kept free of Electron imports so it is unit-testable. */

export const SCRAPE_FLAG = '--scrape'

/** The URL after `--scrape`, `''` if the flag has no URL, or null when not in scrape mode. */
export function scrapeUrlFromArgv(argv: string[]): string | null {
  const i = argv.indexOf(SCRAPE_FLAG)
  if (i === -1) return null
  return argv[i + 1] ?? ''
}
