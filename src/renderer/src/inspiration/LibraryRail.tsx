import type { Mark, Person } from '../../../shared/ipc'
import {
  NO_ROOM,
  type InspirationFilter,
  type PersonFilter,
  type RoomCount,
  type Scope
} from '../../../shared/inspiration'
import { MARKS } from '../../../shared/tagging'

interface LibraryRailProps {
  filter: InspirationFilter
  onChange(patch: Partial<InspirationFilter>): void
  rooms: { total: number; rooms: RoomCount[] }
  me: Person | null
  partner: Person | null
}

const SCOPES: { id: Scope; label: string; help: string }[] = [
  { id: 'house', label: 'House', help: 'One card per house' },
  { id: 'room', label: 'Room', help: 'Photos in a room' },
  { id: 'detail', label: 'Detail', help: 'A feature across every room' }
]

export const roomLabel = (room: string): string => (room === NO_ROOM ? 'No room yet' : room)

const swatch = (person: Person): React.CSSProperties =>
  ({ '--swatch': person.colour }) as React.CSSProperties

/** Left rail of the library (brief 4.4): scope, rooms with counts, marked as, person. */
export function LibraryRail({
  filter,
  onChange,
  rooms,
  me,
  partner
}: LibraryRailProps): React.JSX.Element {
  const toggleMark = (mark: Mark): void =>
    onChange({
      marks: filter.marks.includes(mark)
        ? filter.marks.filter((m) => m !== mark)
        : [...filter.marks, mark]
    })

  const people: { id: PersonFilter; label: React.ReactNode; disabled: boolean }[] = [
    { id: 'everyone', label: 'Everyone', disabled: false },
    { id: 'me', label: <PersonLabel person={me} fallback="Me" />, disabled: !me },
    { id: 'partner', label: <PersonLabel person={partner} fallback="Partner" />, disabled: !partner },
    { id: 'both', label: 'Both agree', disabled: !me || !partner }
  ]

  return (
    <aside className="lib-rail" aria-label="Library filters">
      <section className="lib-rail__section" aria-labelledby="lib-scope">
        <h2 className="section-label" id="lib-scope">
          — Scope —
        </h2>
        <div className="segmented" role="group" aria-labelledby="lib-scope">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="segmented__item"
              aria-pressed={filter.scope === s.id}
              title={s.help}
              onClick={() => onChange({ scope: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="lib-rail__help">{SCOPES.find((s) => s.id === filter.scope)?.help}</p>
      </section>

      {filter.scope !== 'detail' && (
        <section className="lib-rail__section" aria-labelledby="lib-rooms">
          <h2 className="section-label" id="lib-rooms">
            — Rooms —
          </h2>
          <ul className="room-list">
            <li>
              <button
                type="button"
                className="room-list__item"
                aria-pressed={filter.room === null}
                onClick={() => onChange({ room: null })}
              >
                <span>All rooms</span>
                <span className="room-list__count">{rooms.total}</span>
              </button>
            </li>
            {rooms.rooms.map((r) => (
              <li key={r.room}>
                <button
                  type="button"
                  className="room-list__item"
                  aria-pressed={filter.room === r.room}
                  onClick={() => onChange({ room: filter.room === r.room ? null : r.room })}
                >
                  <span>{roomLabel(r.room)}</span>
                  <span className="room-list__count">
                    {r.count}
                    <span className="visually-hidden"> photos</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="lib-rail__section" aria-labelledby="lib-marks">
        <h2 className="section-label" id="lib-marks">
          — Marked as —
        </h2>
        <div className="chips" role="group" aria-labelledby="lib-marks">
          {MARKS.map((m) => (
            <button
              key={m.id}
              type="button"
              className="chip-button"
              aria-pressed={filter.marks.includes(m.id)}
              onClick={() => toggleMark(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <section className="lib-rail__section" aria-labelledby="lib-person">
        <h2 className="section-label" id="lib-person">
          — Person —
        </h2>
        <div className="chips" role="group" aria-labelledby="lib-person">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              className="chip-button"
              aria-pressed={filter.person === p.id}
              disabled={p.disabled}
              onClick={() => onChange({ person: p.id })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="lib-rail__help">
          {filter.person === 'both'
            ? 'Photos you both tagged, marked or wrote about. With a feature or mark chosen, you both need it.'
            : 'Whose tags, marks and notes count.'}
        </p>
      </section>
    </aside>
  )
}

function PersonLabel({
  person,
  fallback
}: {
  person: Person | null
  fallback: string
}): React.JSX.Element {
  if (!person) return <>{fallback}</>
  return (
    <>
      <span className="swatch" style={swatch(person)} aria-hidden="true" />
      {person.name}
      <span className="visually-hidden"> ({fallback.toLowerCase()})</span>
    </>
  )
}
