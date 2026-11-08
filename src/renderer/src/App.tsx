import { useCallback, useEffect, useState } from 'react'
import type { AppState, Result } from '../../shared/ipc'
import { CaptureView } from './capture/CaptureView'
import { useCapture } from './capture/useCapture'
import { Header, type ViewId } from './components/Header'
import { Placeholder } from './components/Placeholder'
import { RecentView } from './components/RecentView'
import { SettingsView } from './components/SettingsView'

const LIBRARY_PLACEHOLDER = {
  title: 'Library',
  milestone: 6,
  blurb: 'Browse by house, room or detail, and see where your favourite features coincide.'
}

export function App(): React.JSX.Element {
  const [view, setView] = useState<ViewId>('capture')
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
    content = <CaptureView state={state} apply={apply} capture={capture} onNavigate={setView} />
  } else if (view === 'recent') {
    content = <RecentView key={state.library.root} version={recentVersion} onNavigate={setView} />
  } else {
    content = <Placeholder {...LIBRARY_PLACEHOLDER} />
  }

  return (
    <div className="app">
      <Header
        view={view}
        onNavigate={setView}
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
    </div>
  )
}
