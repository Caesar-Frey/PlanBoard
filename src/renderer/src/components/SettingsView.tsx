import { useState } from 'react'
import type { AppState, Person, Result } from '../../../shared/ipc'
import { TagManager } from '../tagging/TagManager'
import { PageTitle, SectionLabel } from './Ornament'

interface SettingsViewProps {
  state: AppState
  /** Applies a main-process result to app state; returns an error message or null. */
  apply(result: Result<AppState> | null): string | null
}

export function SettingsView({ state, apply }: SettingsViewProps): React.JSX.Element {
  const [folderError, setFolderError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)

  const chooseFolder = async (): Promise<void> => {
    setChoosing(true)
    setFolderError(null)
    try {
      setFolderError(apply(await window.planboard.chooseLibraryFolder()))
    } finally {
      setChoosing(false)
    }
  }

  return (
    <section className="page" aria-label="Settings">
      <PageTitle kicker="Library & people" title="Settings" />

      <div className="panel" aria-labelledby="library-heading">
        <SectionLabel id="library-heading">Library folder</SectionLabel>
        <p className="panel__help">
          Photos, listing details and the database (<code>planboard.db</code>) all live here.
        </p>
        <div className="folder-row">
          <code className="folder-row__path" title={state.library.root}>
            {state.library.root}
          </code>
          <button
            type="button"
            className="pill pill--primary"
            onClick={() => void chooseFolder()}
            disabled={choosing}
          >
            Change folder
          </button>
        </div>
        {folderError && (
          <p className="field-error" role="alert">
            {folderError}
          </p>
        )}
      </div>

      <div className="panel" aria-labelledby="people-heading">
        <SectionLabel id="people-heading">People</SectionLabel>
        <p className="panel__help">
          Two people share the library. Every tag and note records who made it.
        </p>
        <div className="people-grid">
          {state.people.map((person) => (
            <PersonEditor
              key={`${person.id}:${person.name}:${person.colour}`}
              person={person}
              isCurrent={person.id === state.settings.currentPersonId}
              apply={apply}
            />
          ))}
        </div>
      </div>

      <div className="panel" aria-labelledby="tags-heading">
        <SectionLabel id="tags-heading">Feature tags</SectionLabel>
        <p className="panel__help">
          Rename a tag, or merge two that mean the same thing. Merging keeps who tagged each photo.
        </p>
        <TagManager libraryRoot={state.library.root} />
      </div>
    </section>
  )
}

interface PersonEditorProps {
  person: Person
  isCurrent: boolean
  apply: SettingsViewProps['apply']
}

function PersonEditor({ person, isCurrent, apply }: PersonEditorProps): React.JSX.Element {
  const [name, setName] = useState(person.name)
  const [colour, setColour] = useState(person.colour)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dirty = name !== person.name || colour !== person.colour
  const nameId = `person-${person.id}-name`
  const colourId = `person-${person.id}-colour`

  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (name.trim() === '') {
      setError('Name cannot be empty')
      return
    }
    setSaving(true)
    try {
      setError(apply(await window.planboard.updatePerson({ id: person.id, name, colour })))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="person-card" onSubmit={(e) => void save(e)} noValidate>
      <div className="person-card__head">
        <span
          className="swatch swatch--large"
          style={{ '--swatch': colour } as React.CSSProperties}
          aria-hidden="true"
        />
        <span className="person-card__title">Person {person.id}</span>
        {isCurrent && <span className="chip">Tagging now</span>}
      </div>

      <label className="field" htmlFor={nameId}>
        <span className="field__label">Name</span>
        <input
          id={nameId}
          className="field__input"
          value={name}
          maxLength={40}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          aria-invalid={error ? true : undefined}
        />
      </label>

      <label className="field" htmlFor={colourId}>
        <span className="field__label">Colour</span>
        <span className="colour-field">
          <input
            id={colourId}
            type="color"
            className="colour-field__input"
            value={colour}
            onChange={(e) => setColour(e.target.value)}
          />
          <code className="colour-field__hex">{colour}</code>
        </span>
      </label>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <div className="person-card__actions">
        <button type="submit" className="pill pill--primary" disabled={!dirty || saving}>
          Save
        </button>
        {dirty && (
          <button
            type="button"
            className="pill"
            onClick={() => {
              setName(person.name)
              setColour(person.colour)
              setError(null)
            }}
          >
            Reset
          </button>
        )}
      </div>
    </form>
  )
}
