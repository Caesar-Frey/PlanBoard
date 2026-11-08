import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaptureOutcome, CaptureProgress, ManualCaptureRequest } from '../../../shared/ipc'

export interface CaptureState {
  running: boolean
  cancelling: boolean
  /** Latest progress event of the current (or last) run. */
  progress: CaptureProgress | null
  outcome: CaptureOutcome | null
  /** Listing URL of the current (or last) run, for the manual fallback and "try again". */
  url: string | null
}

export interface CaptureControls extends CaptureState {
  start(url: string): void
  startManual(request: ManualCaptureRequest): void
  cancel(): void
  /** Clears the last result, back to an empty form. */
  reset(): void
}

const IDLE: CaptureState = {
  running: false,
  cancelling: false,
  progress: null,
  outcome: null,
  url: null
}

/**
 * Capture state lives at app level, so switching screens mid-run keeps the progress.
 * `onFinished` runs after every run (e.g. to refresh Recent surveys).
 */
export function useCapture(onFinished: () => void): CaptureControls {
  const [state, setState] = useState<CaptureState>(IDLE)
  const finished = useRef(onFinished)
  useEffect(() => {
    finished.current = onFinished
  }, [onFinished])

  useEffect(
    () =>
      window.planboard.onCaptureProgress((progress) =>
        setState((s) => (s.running ? { ...s, progress } : s))
      ),
    []
  )

  const run = useCallback((url: string, begin: () => Promise<CaptureOutcome>) => {
    setState({ running: true, cancelling: false, progress: null, outcome: null, url })
    begin()
      .then((outcome) => setState((s) => ({ ...s, running: false, cancelling: false, outcome })))
      .catch((err: unknown) =>
        setState((s) => ({
          ...s,
          running: false,
          cancelling: false,
          outcome: {
            status: 'failed',
            listing: null,
            counts: {
              found: 0,
              listed: null,
              duplicates: 0,
              expected: null,
              downloaded: 0,
              alreadyHad: 0,
              removed: 0,
              notFound: 0,
              failed: 0,
              onDisk: 0
            },
            notes: [],
            warnings: [],
            detailsFile: 'not-written',
            error: {
              code: 'unexpected',
              message: `The app lost track of the survey (${err instanceof Error ? err.message : String(err)}).`,
              manualFallback: false,
              site: null
            },
            rejected: [],
            durationMs: 0
          }
        }))
      )
      .finally(() => finished.current())
  }, [])

  const start = useCallback(
    (url: string) => run(url, () => window.planboard.startCapture(url)),
    [run]
  )
  const startManual = useCallback(
    (request: ManualCaptureRequest) =>
      run(request.url, () => window.planboard.startManualCapture(request)),
    [run]
  )
  const cancel = useCallback(() => {
    setState((s) => (s.running ? { ...s, cancelling: true } : s))
    void window.planboard.cancelCapture()
  }, [])
  const reset = useCallback(() => setState((s) => (s.running ? s : IDLE)), [])

  return { ...state, start, startManual, cancel, reset }
}
