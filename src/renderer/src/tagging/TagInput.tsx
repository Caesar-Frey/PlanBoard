import { useId, useMemo, useState } from 'react'
import type { TagSummary } from '../../../shared/ipc'
import { findEquivalentTag, suggestTags, type MatchKind } from '../../../shared/tagMatch'
import { MAX_TAG_LENGTH, cleanTagName } from '../../../shared/tagging'

interface TagInputProps {
  /** Every tag in the library, for auto-complete. */
  tags: TagSummary[]
  /** Tags this person already put on the photo: not suggested again. */
  exclude: ReadonlySet<number>
  disabled?: boolean
  /** Resolves true when the tag was added (the field then empties). */
  onAdd(name: string): Promise<boolean>
}

type Option =
  { kind: 'existing'; tag: TagSummary; match: MatchKind } | { kind: 'create'; name: string }

const HINT: Partial<Record<MatchKind, string>> = {
  contained: 'existing tag',
  typo: 'did you mean?',
  same: 'existing tag'
}

/**
 * Free-text tag entry with auto-complete. Existing tags are offered first, so a near-copy is
 * only made on purpose: "kitchen island" suggests "Island?" above "Create “Kitchen island”".
 * When the typed name is the same as an existing tag (case, plural, word order), only that
 * tag is offered.
 */
export function TagInput({ tags, exclude, disabled, onAdd }: TagInputProps): React.JSX.Element {
  const id = useId()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)

  const options = useMemo((): Option[] => {
    const pool = tags.filter((t) => !exclude.has(t.id))
    const found: Option[] = suggestTags(text, pool).map((s) => ({
      kind: 'existing',
      tag: s.tag,
      match: s.kind
    }))
    const name = cleanTagName(text)
    if (name && !findEquivalentTag(name, tags)) found.push({ kind: 'create', name })
    return found
  }, [text, tags, exclude])

  const shown = open && options.length > 0
  const current = shown ? Math.min(active, options.length - 1) : -1

  const pick = async (option: Option | undefined): Promise<void> => {
    if (!option || busy) return
    setBusy(true)
    const added = await onAdd(option.kind === 'create' ? option.name : option.tag.name)
    setBusy(false)
    if (added) {
      setText('')
      setActive(0)
      setOpen(false)
    }
  }

  const keyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault()
      setOpen(true)
      setActive((i) => (shown ? (Math.min(i, options.length - 1) + 1) % options.length : 0))
    } else if (event.key === 'ArrowUp' && shown) {
      event.preventDefault()
      setActive((i) => (Math.min(i, options.length - 1) - 1 + options.length) % options.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      void pick(options[current] ?? options[0])
    } else if (event.key === 'Escape' && shown) {
      // Close the list only; the preview stays open.
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
  }

  const listId = `${id}-list`
  const optionId = (i: number): string => `${id}-opt-${i}`

  return (
    <div className="tag-input">
      <label className="visually-hidden" htmlFor={`${id}-input`}>
        Add a feature tag
      </label>
      <input
        id={`${id}-input`}
        className="field__input tag-input__field"
        type="text"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={current >= 0 ? optionId(current) : undefined}
        placeholder="Add a feature: island, pendant lights…"
        value={text}
        maxLength={MAX_TAG_LENGTH}
        disabled={disabled || busy}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={keyDown}
      />
      {shown && (
        <ul className="tag-input__list" id={listId} role="listbox" aria-label="Tag suggestions">
          {options.map((option, i) => (
            <li
              key={option.kind === 'create' ? 'create' : option.tag.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === current}
              className={`tag-input__option${i === current ? ' tag-input__option--active' : ''}`}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault()
                void pick(option)
              }}
              onMouseEnter={() => setActive(i)}
            >
              {option.kind === 'create' ? (
                <span>
                  Create <strong>“{option.name}”</strong>
                </span>
              ) : (
                <>
                  <span className="tag-input__name">
                    {option.tag.name}
                    {option.match === 'contained' || option.match === 'typo' ? '?' : ''}
                  </span>
                  <span className="tag-input__meta">
                    {HINT[option.match] ? `${HINT[option.match]} · ` : ''}
                    {option.tag.photoCount} {option.tag.photoCount === 1 ? 'photo' : 'photos'}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
