/**
 * Dev test surface: `npm run scrape -- <listing url>` runs one scrape with no main window,
 * no database and no settings, prints the result as JSON plus a summary line, and exits.
 *
 * stdout gets only the JSON and the summary line; progress and warnings go to stderr.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { scrapeListing, type ScrapeDebug, type TracedRequest } from './scrapers/driver'
import { ScraperError } from './scrapers/types'

function write(stream: NodeJS.WriteStream, text: string): Promise<void> {
  // Wait for the write to flush: on macOS, pipe writes are asynchronous and app.exit()
  // would otherwise cut the output short.
  return new Promise((resolve) => stream.write(text, () => resolve()))
}

/**
 * `--dump <dir>`: raw page snapshots, page-script results and every request the page made.
 * Real agent names and numbers end up in these files, so keep the folder outside the project
 * and redact anything copied into test/fixtures.
 */
function dumper(dir: string): { debug: ScrapeDebug; flush(): void } {
  mkdirSync(dir, { recursive: true })
  const requests: TracedRequest[] = []
  return {
    debug: {
      snapshot(label, html, pageData) {
        writeFileSync(join(dir, `${label}.html`), html)
        writeFileSync(join(dir, `${label}.page-data.json`), JSON.stringify(pageData, null, 2))
      },
      request: (entry) => void requests.push(entry)
    },
    flush: () => writeFileSync(join(dir, 'requests.json'), JSON.stringify(requests, null, 2))
  }
}

/** Runs the scrape and returns the process exit code. */
export async function runScrapeCli(url: string, dumpDir: string | null = null): Promise<number> {
  if (!url) {
    await write(process.stderr, 'usage: npm run scrape -- <Property24 or Private Property URL>\n')
    return 2
  }
  const dump = dumpDir ? dumper(dumpDir) : null
  try {
    const result = await scrapeListing(url, {
      log: (message) => void write(process.stderr, `[scrape] ${message}\n`),
      debug: dump?.debug
    })
    await write(process.stdout, `${JSON.stringify(result, null, 2)}\n`)
    for (const note of result.notes) await write(process.stderr, `note: ${note}\n`)
    for (const warning of result.warnings) await write(process.stderr, `warning: ${warning}\n`)
    await write(
      process.stdout,
      `found ${result.photos.length} / expected ${result.expectedPhotoCount ?? 'unknown'}\n`
    )
    return 0
  } catch (err) {
    const message =
      err instanceof ScraperError
        ? `${err.message} [${err.code}]`
        : `Unexpected error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
    await write(process.stderr, `error: ${message}\n`)
    return 1
  } finally {
    dump?.flush()
  }
}
