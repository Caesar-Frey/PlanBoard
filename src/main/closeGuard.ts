/**
 * Quit guard: closing the window or quitting (Cmd+Q) while the listing view has unsaved detail
 * edits asks first. The renderer reports "dirty" over IPC; on a close, main holds the window
 * open and asks the renderer to show its "Keep editing / Discard and quit" dialog. Pure: the
 * Electron calls are injected, so this is unit-tested without a window.
 */
import type { CloseKind } from '../shared/ipc'

export interface CloseGuardDeps {
  /** Ask the renderer to show the dialog. */
  ask(kind: CloseKind): void
  /** Quit the app again, now allowed (`app.quit()`). */
  quit(): void
  /** Close the window again, now allowed (`win.close()`). */
  closeWindow(): void
  /** False when the renderer has crashed or gone: nothing can answer, so let it close. */
  rendererAlive(): boolean
}

export interface CloseGuard {
  /** From the renderer: are there unsaved detail edits? */
  setDirty(dirty: boolean): void
  /** `app.on('before-quit')`: the coming close is part of quitting. */
  beforeQuit(): void
  /** `win.on('close')`. Calls `event.preventDefault()` when it has to ask first. */
  onClose(event: { preventDefault(): void }): void
  /** From the renderer's dialog. */
  answer(discard: boolean): void
}

export function createCloseGuard(deps: CloseGuardDeps): CloseGuard {
  let dirty = false
  let quitting = false
  let allowed = false
  /** The dialog the renderer is showing, if any. */
  let asking: CloseKind | null = null

  return {
    setDirty(value) {
      dirty = value
    },
    beforeQuit() {
      quitting = true
    },
    onClose(event) {
      if (allowed || !dirty || !deps.rendererAlive()) return
      event.preventDefault()
      const kind: CloseKind = quitting ? 'quit' : 'close'
      // Asked already: only ask again if a red-button close has since become a Cmd+Q.
      if (asking !== kind) {
        asking = kind
        deps.ask(kind)
      }
    },
    answer(discard) {
      if (asking === null) return
      asking = null
      if (!discard) {
        quitting = false
        return
      }
      allowed = true
      dirty = false
      if (quitting) deps.quit()
      else deps.closeWindow()
    }
  }
}
