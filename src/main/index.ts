import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { runScrapeCli } from './cli'
import { scrapeUrlFromArgv } from './cliArgs'
import { registerIpc } from './ipc'
import { handleMediaProtocol, registerMediaScheme } from './mediaProtocol'

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'PlanBoard',
    backgroundColor: '#f6efe2', // cream token: avoids a white flash before CSS loads
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Never let the renderer open new windows or navigate away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  win.webContents.on('did-finish-load', () => console.info('[planboard] renderer loaded'))
  win.webContents.on('did-fail-load', (_e, code, desc) =>
    console.error(`[planboard] renderer failed to load: ${code} ${desc}`)
  )
  win.webContents.on('render-process-gone', (_e, details) =>
    console.error(`[planboard] renderer gone: ${details.reason}`)
  )

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function startApp(): void {
  registerMediaScheme()
  app
    .whenReady()
    .then(() => {
      const ctx = registerIpc(() => mainWindow)
      handleMediaProtocol(() => ctx.library.root)
      console.info(`[planboard] library: ${ctx.library.root}`)
      console.info(`[planboard] database opened: ${ctx.library.dbPath}`)

      mainWindow = createWindow()
      mainWindow.on('closed', () => (mainWindow = null))

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          mainWindow = createWindow()
          mainWindow.on('closed', () => (mainWindow = null))
        }
      })
      app.on('will-quit', () => ctx.close())
    })
    .catch((err: unknown) => {
      console.error('[planboard] failed to start', err)
      app.exit(1)
    })

  // macOS convention: the app stays running when its last window closes.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

/** `--scrape <url>`: the dev CLI (see cli.ts). No main window, no database, no settings. */
function startScrapeCli(url: string): void {
  // Separate, throwaway profile so a running copy of the app is never touched.
  app.setPath('userData', join(app.getPath('temp'), 'planboard-scrape-cli'))
  app.dock?.hide()
  // The hidden scraping window closing must not quit before the result is printed.
  app.on('window-all-closed', () => undefined)
  app
    .whenReady()
    .then(() => runScrapeCli(url))
    .then((code) => app.exit(code))
    .catch((err: unknown) => {
      console.error('[planboard] scrape CLI failed', err)
      app.exit(1)
    })
}

const scrapeUrl = scrapeUrlFromArgv(process.argv)
if (scrapeUrl !== null) startScrapeCli(scrapeUrl)
else startApp()
