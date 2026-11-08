/** `— LABEL —` section heading. */
export function SectionLabel({
  children,
  id
}: {
  children: string
  id?: string
}): React.JSX.Element {
  return (
    <h2 className="section-label" id={id}>
      — {children} —
    </h2>
  )
}

/** Brass line ◆ brass line divider. */
export function Divider(): React.JSX.Element {
  return (
    <div className="divider" aria-hidden="true">
      <span className="divider__line" />
      <span>◆</span>
      <span className="divider__line" />
    </div>
  )
}

/** Centred page title block, as in the library mockup. */
export function PageTitle({ kicker, title }: { kicker: string; title: string }): React.JSX.Element {
  return (
    <div className="page-title">
      <span className="page-title__kicker">{kicker}</span>
      <h1 className="page-title__h1">{title}</h1>
      <Divider />
    </div>
  )
}
