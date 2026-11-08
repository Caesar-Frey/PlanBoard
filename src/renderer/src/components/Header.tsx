import type { Person } from '../../../shared/ipc'

export type ViewId = 'capture' | 'library' | 'recent' | 'settings'

const NAV: { id: ViewId; label: string }[] = [
  { id: 'capture', label: 'Capture' },
  { id: 'library', label: 'Library' },
  { id: 'recent', label: 'Recent surveys' },
  { id: 'settings', label: 'Settings' }
]

interface HeaderProps {
  view: ViewId
  onNavigate(view: ViewId): void
  people: Person[]
  currentPersonId: number | null
  onSwitchPerson(id: number): void
}

export function Header({
  view,
  onNavigate,
  people,
  currentPersonId,
  onSwitchPerson
}: HeaderProps): React.JSX.Element {
  return (
    <header className="header">
      <div className="brand">
        <svg
          className="brand__gable"
          width="34"
          height="30"
          viewBox="0 0 34 30"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M4 29 V14 C4 9 8 9 8 6 C8 3 11 1 17 1 C23 1 26 3 26 6 C26 9 30 9 30 14 V29 Z" />
          <path d="M13 29 V21 A4 4 0 0 1 21 21 V29" />
        </svg>
        <span className="brand__name">PlanBoard</span>
      </div>

      <nav className="nav" aria-label="Main">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className="nav__item"
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="tagging" role="group" aria-label="Tagging as">
        <span className="tagging__label">Tagging as</span>
        {people.map((person) => (
          <button
            key={person.id}
            type="button"
            className="tagging__person"
            aria-pressed={person.id === currentPersonId}
            onClick={() => onSwitchPerson(person.id)}
          >
            <span
              className="swatch"
              style={{ '--swatch': person.colour } as React.CSSProperties}
              aria-hidden="true"
            />
            {person.name}
          </button>
        ))}
      </div>
    </header>
  )
}
