import { app, BrowserWindow, ipcMain, shell, type WebContents } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import { runScrapeCli } from './cli'
import { dumpDirFromArgv, scrapeUrlFromArgv } from './cliArgs'
import { createCloseGuard, type CloseGuard } from './closeGuard'
import { registerIpc } from './ipc'
import { handleMediaProtocol, registerMediaScheme } from './mediaProtocol'

let mainWindow: BrowserWindow | null = null

/** One quit guard per app window, found by the renderer that sends to it. */
const closeGuards = new Map<WebContents, CloseGuard>()

function attachCloseGuard(win: BrowserWindow): void {
  const wc = win.webContents
  const guard = createCloseGuard({
    ask: (kind) => {
      console.info(`[planboard] unsaved listing details: asking before ${kind}`)
      if (!win.isDestroyed()) wc.send(IPC.closeRequested, kind)
    },
    quit: () => app.quit(),
    closeWindow: () => {
      if (!win.isDestroyed()) win.close()
    },
    rendererAlive: () => !win.isDestroyed() && !wc.isCrashed()
  })
  closeGuards.set(wc, guard)
  win.on('close', (event) => guard.onClose(event))
  win.on('closed', () => closeGuards.delete(wc))
  // A reload or a crashed renderer has no edits any more.
  wc.on('did-navigate', () => guard.setDirty(false))
  wc.on('render-process-gone', () => guard.setDirty(false))
}

function registerCloseGuardIpc(): void {
  ipcMain.on(IPC.setUnsavedDetails, (event, dirty: unknown) => {
    closeGuards.get(event.sender)?.setDirty(dirty === true)
  })
  ipcMain.on(IPC.answerClose, (event, discard: unknown) => {
    closeGuards.get(event.sender)?.answer(discard === true)
  })
  app.on('before-quit', () => {
    for (const guard of closeGuards.values()) guard.beforeQuit()
  })
}

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
  attachCloseGuard(win)

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
      registerCloseGuardIpc()
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
function startScrapeCli(url: string, dumpDir: string | null): void {
  // Separate, throwaway profile so a running copy of the app is never touched.
  app.setPath('userData', join(app.getPath('temp'), 'planboard-scrape-cli'))
  app.dock?.hide()
  // The hidden scraping window closing must not quit before the result is printed.
  app.on('window-all-closed', () => undefined)
  app
    .whenReady()
    .then(() => runScrapeCli(url, dumpDir))
    .then((code) => app.exit(code))
    .catch((err: unknown) => {
      console.error('[planboard] scrape CLI failed', err)
      app.exit(1)
    })
}

const scrapeUrl = scrapeUrlFromArgv(process.argv)
if (scrapeUrl !== null) startScrapeCli(scrapeUrl, dumpDirFromArgv(process.argv))
else startApp()
