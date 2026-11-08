import { PageTitle } from './Ornament'

interface PlaceholderProps {
  title: string
  milestone: number
  blurb: string
}

export function Placeholder({ title, milestone, blurb }: PlaceholderProps): React.JSX.Element {
  return (
    <section className="page page--narrow" aria-labelledby="placeholder-title">
      <PageTitle kicker={`Milestone ${milestone}`} title={title} />
      <div className="placeholder">
        <div className="gable-frame" aria-hidden="true">
          <span className="gable-frame__tag">Under construction</span>
        </div>
        <p className="placeholder__text" id="placeholder-title">
          Coming in milestone {milestone}.
        </p>
        <p className="placeholder__blurb">{blurb}</p>
      </div>
    </section>
  )
}
