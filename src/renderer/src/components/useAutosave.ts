import { useCallback, useEffect, useRef, useState } from 'react'
import type { Result } from '../../../shared/ipc'

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string }

const AUTOSAVE_MS = 1000

/**
 * A text value that saves itself: after a second without typing, on `flush()` (call it on
 * blur), on unmount, and when the window closes (`pagehide`). Only changed text is sent.
 * Mount a fresh instance (a new `key`) for each thing being edited.
 */
export function useAutosave<T>(
  initial: string,
  send: (value: string) => Promise<Result<T>>,
  onSaved: (value: T) => void
): {
  text: string
  state: SaveState
  change(value: string): void
  flush(): void
} {
  const [text, setText] = useState(initial)
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Last text sent to main (saved, or on its way). */
  const sent = useRef(initial)
  const latest = useRef(initial)
  const live = useRef(true)

  const save = useCallback(
    async (value: string) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      if (value === sent.current) {
        if (live.current) setState((s) => (s.kind === 'pending' ? { kind: 'idle' } : s))
        return
      }
      const previous = sent.current
      sent.current = value
      if (live.current) setState({ kind: 'saving' })
      const r = await send(value).catch((err: unknown) => ({
        ok: false as const,
        error: String(err)
      }))
      if (r.ok) {
        onSaved(r.value)
        if (live.current && latest.current === value) setState({ kind: 'saved' })
      } else {
        if (sent.current === value) sent.current = previous
        if (live.current) setState({ kind: 'error', message: r.error })
      }
    },
    [send, onSaved]
  )

  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  }, [save])

  useEffect(() => {
    live.current = true
    const flushNow = (): void => void saveRef.current(latest.current)
    window.addEventListener('pagehide', flushNow)
    return () => {
      window.removeEventListener('pagehide', flushNow)
      live.current = false
      void saveRef.current(latest.current)
    }
  }, [])

  const change = useCallback((value: string) => {
    setText(value)
    latest.current = value
    setState({ kind: 'pending' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void saveRef.current(value), AUTOSAVE_MS)
  }, [])

  const flush = useCallback(() => void saveRef.current(latest.current), [])

  return { text, state, change, flush }
}

export function saveStateText(state: SaveState): string {
  switch (state.kind) {
    case 'saving':
      return 'Saving…'
    case 'saved':
      return 'Saved'
    case 'error':
      return `Couldn’t save: ${state.message}`
    case 'pending':
      return 'Saves when you pause'
    default:
      return ''
  }
}
