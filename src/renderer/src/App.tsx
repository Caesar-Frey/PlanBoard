import { useCallback, useEffect, useState } from 'react'
import type { AppState, Result } from '../../shared/ipc'
import { Header, type ViewId } from './components/Header'
import { Placeholder } from './components/Placeholder'
import { SettingsView } from './components/SettingsView'

const PLACEHOLDERS: Record<
  Exclude<ViewId, 'settings'>,
  { title: string; milestone: number; blurb: string }
> = {
  capture: {
    title: 'Capture',
    milestone: 3,
    blurb: 'Paste a Property24 or Private Property link and survey every photo.'
  },
  library: {
    title: 'Library',
    milestone: 6,
    blurb: 'Browse by house, room or detail, and see where your favourite features coincide.'
  },
  recent: {
    title: 'Recent surveys',
    milestone: 3,
    blurb: 'Every listing you have downloaded, with how much of it is tagged.'
  }
}

export function App(): React.JSX.Element {
  const [view, setView] = useState<ViewId>('settings')
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
  } else {
    content = <Placeholder {...PLACEHOLDERS[view]} />
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
