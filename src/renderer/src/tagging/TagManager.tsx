import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TagSummary } from '../../../shared/ipc'
import { suggestTags } from '../../../shared/tagMatch'
import { MAX_TAG_LENGTH } from '../../../shared/tagging'
import { Modal } from '../components/Modal'

interface TagManagerProps {
  /** Reloads when the library folder changes. */
  libraryRoot: string
}

interface MergePlan {
  from: TagSummary
  into: TagSummary | null
  /** Opened because a rename hit an existing name. */
  fromRename?: boolean
}

const photos = (n: number): string => `${n} ${n === 1 ? 'photo' : 'photos'}`

/** Pairs that look like the same feature (plural, typo, one inside the other), smaller first. */
function likelyDuplicates(tags: TagSummary[]): { from: TagSummary; into: TagSummary }[] {
  const seen = new Set<string>()
  const pairs: { from: TagSummary; into: TagSummary }[] = []
  for (const tag of tags) {
    const others = tags.filter((t) => t.id !== tag.id)
    for (const s of suggestTags(tag.name, others, 3)) {
      if (s.kind !== 'same' && s.kind !== 'typo' && s.kind !== 'contained') continue
      const key = [tag.id, s.tag.id].sort((a, b) => a - b).join('-')
      if (seen.has(key)) continue
      seen.add(key)
      // Keep the tag used more (then the shorter name); merge the other into it.
      const keepOther =
        s.tag.photoCount > tag.photoCount ||
        (s.tag.photoCount === tag.photoCount && s.tag.name.length <= tag.name.length)
      pairs.push(keepOther ? { from: tag, into: s.tag } : { from: s.tag, into: tag })
    }
  }
  return pairs.slice(0, 8)
}

/** Settings → Feature tags: rename and merge tags (brief 4.3). */
export function TagManager({ libraryRoot }: TagManagerProps): React.JSX.Element {
  const [tags, setTags] = useState<TagSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  const [merge, setMerge] = useState<MergePlan | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await window.planboard
      .listTags()
      .catch((err: unknown) => ({ ok: false as const, error: String(err) }))
    if (r.ok) setTags(r.value)
    else setError(r.error)
  }, [])

  useEffect(() => {
    let live = true
    window.planboard
      .listTags()
      .then((r) => {
        if (!live) return
        if (r.ok) setTags(r.value)
        else setError(r.error)
      })
      .catch((err: unknown) => live && setError(String(err)))
    return () => {
      live = false
    }
  }, [libraryRoot])

  const duplicates = useMemo(() => (tags ? likelyDuplicates(tags) : []), [tags])
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (tags ?? []).filter((t) => f === '' || t.name.toLowerCase().includes(f))
  }, [tags, filter])

  const saveRename = async (): Promise<void> => {
    if (!renaming) return
    const tag = tags?.find((t) => t.id === renaming.id)
    if (!tag) return
    setBusy(true)
    try {
      const r = await window.planboard.renameTag({ tagId: renaming.id, name: renaming.name })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setError(null)
      if (r.value.status === 'exists') {
        // That name is taken: offer to merge into the tag that has it.
        setMerge({ from: tag, into: r.value.existing, fromRename: true })
        return
      }
      setStatus(`Renamed “${tag.name}” to “${r.value.tag.name}”.`)
      setRenaming(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const doMerge = async (): Promise<void> => {
    if (!merge?.into) return
    setBusy(true)
    try {
      const r = await window.planboard.mergeTags({
        fromTagId: merge.from.id,
        intoTagId: merge.into.id
      })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setError(null)
      setStatus(
        `Merged “${merge.from.name}” into “${r.value.into.name}”: ${r.value.moved} moved` +
          (r.value.duplicates > 0 ? `, ${r.value.duplicates} already there.` : '.')
      )
      setMerge(null)
      setRenaming(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!tags) {
    return error ? (
      <p className="field-error" role="alert">
        {error}
      </p>
    ) : (
      <p className="panel__help">Loading tags…</p>
    )
  }

  return (
    <div className="tag-manager">
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="alert" role="status">
          {status}
        </p>
      )}

      {tags.length === 0 ? (
        <p className="panel__help">
          No feature tags yet. Add them in a listing’s large preview, beside the photo.
        </p>
      ) : (
        <>
          {duplicates.length > 0 && (
            <div className="tag-manager__dupes">
              <h3 className="tagging-panel__label">— Possible duplicates —</h3>
              <ul className="tag-manager__list">
                {duplicates.map(({ from, into }) => (
                  <li key={`${from.id}-${into.id}`} className="tag-manager__row">
                    <span className="tag-manager__name">
                      {from.name} <span aria-hidden="true">→</span>
                      <span className="visually-hidden"> into </span> {into.name}
                    </span>
                    <span className="tag-manager__count">
                      {photos(from.photoCount)} · {photos(into.photoCount)}
                    </span>
                    <button
                      type="button"
                      className="pill tag-manager__action"
                      onClick={() => setMerge({ from, into })}
                    >
                      Merge…
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tags.length > 8 && (
            <div className="field tag-manager__filter">
              <label className="field__label" htmlFor="tag-filter">
                Find a tag
              </label>
              <input
                id="tag-filter"
                className="field__input"
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          )}

          <ul className="tag-manager__list" aria-label="Feature tags">
            {shown.map((tag) => (
              <li key={tag.id} className="tag-manager__row">
                {renaming?.id === tag.id ? (
                  <form
                    className="tag-manager__rename"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void saveRename()
                    }}
                  >
                    <label className="visually-hidden" htmlFor={`rename-${tag.id}`}>
                      New name for {tag.name}
                    </label>
                    <input
                      id={`rename-${tag.id}`}
                      className="field__input"
                      value={renaming.name}
                      maxLength={MAX_TAG_LENGTH}
                      onChange={(e) => setRenaming({ id: tag.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="pill pill--primary tag-manager__action"
                      disabled={busy || renaming.name.trim() === ''}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="pill tag-manager__action"
                      onClick={() => setRenaming(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="tag-manager__name">{tag.name}</span>
                    <span className="tag-manager__count">{photos(tag.photoCount)}</span>
                    <button
                      type="button"
                      className="pill tag-manager__action"
                      onClick={() => {
                        setStatus(null)
                        setRenaming({ id: tag.id, name: tag.name })
                      }}
                      aria-label={`Rename ${tag.name}`}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="pill tag-manager__action"
                      onClick={() => {
                        setStatus(null)
                        setMerge({ from: tag, into: null })
                      }}
                      disabled={tags.length < 2}
                      aria-label={`Merge ${tag.name} into another tag`}
                    >
                      Merge…
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {merge && (
        <Modal labelledBy="merge-title" onClose={() => !busy && setMerge(null)}>
          <h2 id="merge-title" className="modal__title">
            {merge.into
              ? `Merge “${merge.from.name}” into “${merge.into.name}”?`
              : `Merge “${merge.from.name}”`}
          </h2>
          {merge.fromRename && merge.into && (
            <p className="modal__body">A tag called “{merge.into.name}” already exists.</p>
          )}
          <div className="field">
            <label className="field__label" htmlFor="merge-into">
              Merge into
            </label>
            <select
              id="merge-into"
              className="room-bar__select"
              value={merge.into?.id ?? ''}
              onChange={(e) =>
                setMerge({
                  from: merge.from,
                  into: tags.find((t) => t.id === Number(e.target.value)) ?? null
                })
              }
            >
              <option value="">Choose a tag…</option>
              {tags
                .filter((t) => t.id !== merge.from.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({photos(t.photoCount)})
                  </option>
                ))}
            </select>
          </div>
          <p className="modal__body">
            {merge.into
              ? `Every photo tagged “${merge.from.name}” (${photos(merge.from.photoCount)}) is tagged “${merge.into.name}” instead, keeping who tagged it. Where someone already has both on a photo, it’s kept once. “${merge.from.name}” is then removed. This can’t be undone.`
              : 'Choose the tag to keep.'}
          </p>
          <div className="actions modal__actions">
            <button
              type="button"
              className="pill"
              onClick={() => setMerge(null)}
              disabled={busy}
              data-autofocus
            >
              Cancel
            </button>
            <button
              type="button"
              className="pill pill--primary"
              onClick={() => void doMerge()}
              disabled={busy || !merge.into}
            >
              {busy ? 'Merging…' : 'Merge'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
