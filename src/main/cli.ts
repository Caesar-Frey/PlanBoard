/**
 * Dev test surface: `npm run scrape -- <listing url>` runs one scrape with no main window,
 * no database and no settings, prints the result as JSON plus a summary line, and exits.
 *
 * stdout gets only the JSON and the summary line; progress and warnings go to stderr.
 */
import { scrapeListing } from './scrapers/driver'
import { ScraperError } from './scrapers/types'

function write(stream: NodeJS.WriteStream, text: string): Promise<void> {
  // Wait for the write to flush: on macOS, pipe writes are asynchronous and app.exit()
  // would otherwise cut the output short.
  return new Promise((resolve) => stream.write(text, () => resolve()))
}

/** Runs the scrape and returns the process exit code. */
export async function runScrapeCli(url: string): Promise<number> {
  if (!url) {
    await write(process.stderr, 'usage: npm run scrape -- <Property24 or Private Property URL>\n')
    return 2
  }
  try {
    const result = await scrapeListing(url, {
      log: (message) => void write(process.stderr, `[scrape] ${message}\n`)
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
  }
}
