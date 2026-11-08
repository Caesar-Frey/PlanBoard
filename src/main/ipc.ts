import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { IPC, type AppState, type LibraryInfo, type Result, type Settings } from '../shared/ipc'
import type { DB } from './db'
import { listPeople, updatePerson } from './db/queries'
import { openLibrary } from './library'
import { validatePersonInput } from './people'
import { loadSettings, saveSettings } from './settings'

/** Holds the open library and settings for the lifetime of the app. */
class AppContext {
  private readonly settingsFile = join(app.getPath('userData'), 'settings.json')
  settings: Settings
  library: LibraryInfo
  db: DB

  constructor() {
    this.settings = loadSettings(this.settingsFile, homedir())
    const { info, db } = openLibrary(this.settings.libraryRoot)
    this.library = info
    this.db = db
    this.ensureCurrentPerson()
    saveSettings(this.settingsFile, this.settings)
  }

  state(): AppState {
    return {
      settings: { ...this.settings },
      library: { ...this.library },
      people: listPeople(this.db)
    }
  }

  /** Opens the new library first, so a failure leaves the old one in place. */
  switchLibrary(root: string): void {
    const { info, db } = openLibrary(root)
    this.db.close()
    this.db = db
    this.library = info
    this.settings.libraryRoot = root
    this.ensureCurrentPerson()
    saveSettings(this.settingsFile, this.settings)
  }

  setCurrentPerson(id: number): void {
    if (!listPeople(this.db).some((p) => p.id === id)) throw new Error(`No person with id ${id}`)
    this.settings.currentPersonId = id
    saveSettings(this.settingsFile, this.settings)
  }

  close(): void {
    this.db.close()
  }

  private ensureCurrentPerson(): void {
    const people = listPeople(this.db)
    if (!people.some((p) => p.id === this.settings.currentPersonId)) {
      this.settings.currentPersonId = people[0]?.id ?? null
    }
  }
}

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : String(err) }
}

export function registerIpc(getWindow: () => BrowserWindow | null): AppContext {
  const ctx = new AppContext()

  /** Only accept calls from our own main window. */
  const trusted = (event: IpcMainInvokeEvent): boolean => event.sender === getWindow()?.webContents

  const handle = <A extends unknown[], R>(
    channel: string,
    fn: (...args: A) => Promise<R> | R
  ): void => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!trusted(event)) throw new Error('Untrusted IPC sender')
      return fn(...(args as A))
    })
  }

  handle(IPC.getState, (): AppState => ctx.state())

  handle(IPC.chooseLibraryFolder, async (): Promise<Result<AppState> | null> => {
    const win = getWindow()
    const options = {
      title: 'Choose PlanBoard library folder',
      defaultPath: ctx.library.root,
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>
    }
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    const folder = picked.filePaths[0]
    if (picked.canceled || !folder) return null
    try {
      ctx.switchLibrary(folder)
      return { ok: true, value: ctx.state() }
    } catch (err) {
      return fail(err)
    }
  })

  handle(IPC.updatePerson, (input: unknown): Result<AppState> => {
    const valid = validatePersonInput(input)
    if (!valid.ok) return valid
    try {
      updatePerson(ctx.db, valid.value)
      return { ok: true, value: ctx.state() }
    } catch (err) {
      return fail(err)
    }
  })

  handle(IPC.setCurrentPerson, (id: unknown): Result<AppState> => {
    if (typeof id !== 'number' || !Number.isInteger(id)) return { ok: false, error: 'Invalid id' }
    try {
      ctx.setCurrentPerson(id)
      return { ok: true, value: ctx.state() }
    } catch (err) {
      return fail(err)
    }
  })

  return ctx
}
