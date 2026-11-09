/** Command-line flags. Kept free of Electron imports so it is unit-testable. */

export const SCRAPE_FLAG = '--scrape'

/** The URL after `--scrape`, `''` if the flag has no URL, or null when not in scrape mode. */
export function scrapeUrlFromArgv(argv: string[]): string | null {
  const i = argv.indexOf(SCRAPE_FLAG)
  if (i === -1) return null
  return argv[i + 1] ?? ''
}

export const DUMP_FLAG = '--dump'

/**
 * Dev only: `--dump <folder>` with `--scrape` saves the page HTML, the page-script results and
 * the request log there, for building test fixtures. Null when absent or without a folder.
 */
export function dumpDirFromArgv(argv: string[]): string | null {
  const i = argv.indexOf(DUMP_FLAG)
  if (i === -1) return null
  const dir = argv[i + 1]
  return dir && !dir.startsWith('--') ? dir : null
}
