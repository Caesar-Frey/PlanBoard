import { describe, expect, it } from 'vitest'
import { createCloseGuard } from './closeGuard'

function setup(alive = true) {
  const calls: string[] = []
  const guard = createCloseGuard({
    ask: (kind) => calls.push(`ask:${kind}`),
    quit: () => calls.push('quit'),
    closeWindow: () => calls.push('close'),
    rendererAlive: () => alive
  })
  const close = (): boolean => {
    let prevented = false
    guard.onClose({ preventDefault: () => (prevented = true) })
    return prevented
  }
  return { guard, calls, close }
}

describe('createCloseGuard', () => {
  it('lets the window close and the app quit when nothing is unsaved', () => {
    const { guard, calls, close } = setup()
    guard.beforeQuit()
    expect(close()).toBe(false)
    expect(calls).toEqual([])
  })

  it('Cmd+Q with unsaved details holds the quit and asks once', () => {
    const { guard, calls, close } = setup()
    guard.setDirty(true)
    guard.beforeQuit()
    expect(close()).toBe(true)
    expect(close()).toBe(true)
    expect(calls).toEqual(['ask:quit'])
  })

  it('"Discard and quit" quits; the next close goes through', () => {
    const { guard, calls, close } = setup()
    guard.setDirty(true)
    guard.beforeQuit()
    close()
    guard.answer(true)
    expect(calls).toEqual(['ask:quit', 'quit'])
    expect(close()).toBe(false)
  })

  it('"Keep editing" keeps the window and forgets the quit', () => {
    const { guard, calls, close } = setup()
    guard.setDirty(true)
    guard.beforeQuit()
    close()
    guard.answer(false)
    expect(calls).toEqual(['ask:quit'])
    // Later the red close button: asks again, as a window close this time.
    expect(close()).toBe(true)
    expect(calls).toEqual(['ask:quit', 'ask:close'])
    guard.answer(true)
    expect(calls.at(-1)).toBe('close')
  })

  it('asks again when a window close turns into a quit while the dialog is open', () => {
    const { guard, calls, close } = setup()
    guard.setDirty(true)
    close()
    guard.beforeQuit()
    close()
    expect(calls).toEqual(['ask:close', 'ask:quit'])
    guard.answer(true)
    expect(calls.at(-1)).toBe('quit')
  })

  it('stops asking once the details are saved', () => {
    const { guard, calls, close } = setup()
    guard.setDirty(true)
    guard.setDirty(false)
    expect(close()).toBe(false)
    expect(calls).toEqual([])
  })

  it('never traps the user when the renderer is gone', () => {
    const { guard, close } = setup(false)
    guard.setDirty(true)
    expect(close()).toBe(false)
  })

  it('ignores an answer nobody asked for', () => {
    const { guard, calls } = setup()
    guard.answer(true)
    expect(calls).toEqual([])
  })
})
