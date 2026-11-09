import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState, CloseKind, Result } from '../../shared/ipc'
import { CaptureView } from './capture/CaptureView'
import { useCapture } from './capture/useCapture'
import { Header, type ViewId } from './components/Header'
import { Modal } from './components/Modal'
import { Placeholder } from './components/Placeholder'
import { RecentView } from './components/RecentView'
import { SettingsView } from './components/SettingsView'
import { ListingView } from './listing/ListingView'

const LIBRARY_PLACEHOLDER = {
  title: 'Library',
  milestone: 6,
  blurb: 'Browse by house, room or detail, and see where your favourite features coincide.'
}

export function App(): React.JSX.Element {
  const [view, setView] = useState<ViewId>('capture')
  /** The listing open in the listing view (shown under Recent surveys). */
  const [listingId, setListingId] = useState<number | null>(null)
  /** The listing view's "unsaved details?" check, and a navigation waiting on it. */
  const leaveGuard = useRef<(() => boolean) | null>(null)
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null)
  /** Main is holding a quit or window close for unsaved details. */
  const [pendingClose, setPendingClose] = useState<CloseKind | null>(null)
  const [recentVersion, setRecentVersion] = useState(0)
  const bumpRecent = useCallback(() => setRecentVersion((v) => v + 1), [])
  const capture = useCapture(bumpRecent)
  const [state, setState] = useState<AppState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)

  useEffect(() => {
    window.planboard
      .getState()
      .then(setState)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)))
  }, [])

  /** Applies a main-process result; returns the error message, if any. */
  const apply = useCallback((result: Result<AppState> | null): string | null => {
    if (!result) return null
    if (result.ok) {
      setState(result.value)
      return null
    }
    return result.error
  }, [])

  const switchPerson = useCallback(
    async (id: number) => {
      setSwitchError(apply(await window.planboard.setCurrentPerson(id)))
    },
    [apply]
  )

  // Quit guard: main asks before closing; answer at once when nothing is unsaved after all.
  useEffect(
    () =>
      window.planboard.onCloseRequested((kind) => {
        if (leaveGuard.current?.()) {
          setPendingLeave(null)
          setPendingClose(kind)
        } else {
          window.planboard.answerClose(true)
        }
      }),
    []
  )

  const answerClose = useCallback((discard: boolean) => {
    setPendingClose(null)
    window.planboard.answerClose(discard)
  }, [])

  const registerGuard = useCallback((isDirty: (() => boolean) | null) => {
    leaveGuard.current = isDirty
  }, [])

  /** Runs `go` now, or after the user agrees to drop unsaved listing details. */
  const leave = useCallback((go: () => void) => {
    if (leaveGuard.current?.()) setPendingLeave(() => go)
    else go()
  }, [])

  const navigate = useCallback(
    (next: ViewId) =>
      leave(() => {
        setView(next)
        setListingId(null)
      }),
    [leave]
  )

  const openListing = useCallback(
    (id: number) =>
      leave(() => {
        setView('recent')
        setListingId(id)
      }),
    [leave]
  )

  const surveyAgain = useCallback(
    (url: string) =>
      leave(() => {
        capture.start(url)
        setView('capture')
        setListingId(null)
      }),
    [leave, capture]
  )

  let content: React.JSX.Element
  if (loadError) {
    content = (
      <p className="notice notice--error" role="alert">
        {loadError}
      </p>
    )
  } else if (!state) {
    content = <p className="notice">Opening library…</p>
  } else if (view === 'settings') {
    content = <SettingsView state={state} apply={apply} />
  } else if (view === 'capture') {
    content = (
      <CaptureView state={state} apply={apply} capture={capture} onOpenListing={openListing} />
    )
  } else if (view === 'recent' && listingId !== null) {
    content = (
      <ListingView
        key={`${state.library.root}:${listingId}`}
        listingId={listingId}
        state={state}
        captureRunning={capture.running}
        onBack={() => navigate('recent')}
        onSurveyAgain={surveyAgain}
        registerGuard={registerGuard}
      />
    )
  } else if (view === 'recent') {
    content = (
      <RecentView
        key={state.library.root}
        version={recentVersion}
        onNavigate={navigate}
        onOpen={openListing}
      />
    )
  } else {
    content = <Placeholder {...LIBRARY_PLACEHOLDER} />
  }

  return (
    <div className="app">
      <Header
        view={view}
        onNavigate={navigate}
        people={state?.people ?? []}
        currentPersonId={state?.settings.currentPersonId ?? null}
        onSwitchPerson={switchPerson}
      />
      <main className="main">
        {switchError && (
          <p className="notice notice--error" role="alert">
            {switchError}
          </p>
        )}
        {content}
      </main>
      {pendingLeave && (
        <Modal labelledBy="leave-title" onClose={() => setPendingLeave(null)}>
          <h2 id="leave-title" className="modal__title">
            Leave without saving?
          </h2>
          <p className="modal__body">Your changes to the listing details haven’t been saved yet.</p>
          <div className="actions modal__actions">
            <button
              type="button"
              className="pill pill--primary"
              onClick={() => setPendingLeave(null)}
              data-autofocus
            >
              Keep editing
            </button>
            <button
              type="button"
              className="pill"
              onClick={() => {
                const go = pendingLeave
                leaveGuard.current = null
                setPendingLeave(null)
                go()
              }}
            >
              Discard changes
            </button>
          </div>
        </Modal>
      )}
      {pendingClose && (
        <Modal labelledBy="close-title" onClose={() => answerClose(false)}>
          <h2 id="close-title" className="modal__title">
            {pendingClose === 'quit' ? 'Quit without saving?' : 'Close without saving?'}
          </h2>
          <p className="modal__body">
            Your changes to the listing details haven’t been saved yet.
            {pendingClose === 'quit' ? ' Quitting now loses them.' : ' Closing now loses them.'}
          </p>
          <div className="actions modal__actions">
            <button
              type="button"
              className="pill pill--primary"
              onClick={() => answerClose(false)}
              data-autofocus
            >
              Keep editing
            </button>
            <button type="button" className="pill" onClick={() => answerClose(true)}>
              {pendingClose === 'quit' ? 'Discard and quit' : 'Discard and close'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
