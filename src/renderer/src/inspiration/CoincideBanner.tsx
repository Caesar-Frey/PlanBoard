import { coincideSentence, type Coincidence } from '../../../shared/inspiration'

interface CoincideBannerProps {
  coincidence: Coincidence
  /** True when the banner describes the chosen feature (not the most shared one). */
  chosen: boolean
  onChoose(tagId: number): void
}

/** "Where they coincide" (brief 4.4): how often a feature appears, and what it's paired with. */
export function CoincideBanner({
  coincidence: c,
  chosen,
  onChoose
}: CoincideBannerProps): React.JSX.Element {
  return (
    <section className="coincide" aria-labelledby="coincide-title">
      <h2 className="section-label" id="coincide-title">
        — {chosen ? 'Where they coincide' : 'Most shared feature'} —
      </h2>
      <div className="coincide__body">
        <span className="coincide__figure" aria-hidden="true">
          {c.houses} of {c.totalHouses}
        </span>
        <p className="coincide__text" aria-live="polite">
          {coincideSentence(c)}
        </p>
        {!chosen && (
          <button type="button" className="pill coincide__action" onClick={() => onChoose(c.tagId)}>
            Show {c.name}
          </button>
        )}
      </div>
    </section>
  )
}
