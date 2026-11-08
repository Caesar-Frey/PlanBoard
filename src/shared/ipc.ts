/**
 * Types shared by the main process, the preload bridge and the renderer.
 * This file must stay free of runtime imports (no Node, no Electron, no DOM),
 * so every process can import it safely.
 */

export interface Settings {
  /** Absolute path of the library root folder (holds planboard.db and listings/). */
  libraryRoot: string
  /** id of the person currently tagging, or null before anyone is chosen. */
  currentPersonId: number | null
}

export interface Person {
  id: number
  name: string
  /** Lower-case #rrggbb hex colour. */
  colour: string
}

export interface PersonInput {
  id: number
  name: string
  colour: string
}

export interface LibraryInfo {
  root: string
  listingsDir: string
  dbPath: string
}

export interface AppState {
  settings: Settings
  library: LibraryInfo
  people: Person[]
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/** IPC channel names. One place, so main and preload can't drift apart. */
export const IPC = {
  getState: 'planboard:get-state',
  chooseLibraryFolder: 'planboard:choose-library-folder',
  updatePerson: 'planboard:update-person',
  setCurrentPerson: 'planboard:set-current-person'
} as const

/** The API the preload script exposes on `window.planboard`. */
export interface PlanBoardApi {
  getState(): Promise<AppState>
  /** Opens a folder picker. Resolves to null if the user cancels. */
  chooseLibraryFolder(): Promise<Result<AppState> | null>
  updatePerson(input: PersonInput): Promise<Result<AppState>>
  setCurrentPerson(id: number): Promise<Result<AppState>>
}
