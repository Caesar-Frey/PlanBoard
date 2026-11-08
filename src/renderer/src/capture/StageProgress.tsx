import type { CaptureOutcome, CaptureProgress } from '../../../shared/ipc'
import { STAGES, framingLabel, stageIndex } from '../../../shared/progress'

const NUMERALS = ['I', 'II', 'III', 'IV']

interface StageProgressProps {
  progress: CaptureProgress | null
  outcome: CaptureOutcome | null
  running: boolean
}

/** Survey → Foundation → Framing → Handover, with a brass-lined bar underneath. */
export function StageProgress({
  progress,
  outcome,
  running
}: StageProgressProps): React.JSX.Element {
  const current = stageIndex(progress?.stage ?? 'survey')
  const stopped = !running && outcome !== null && outcome.status !== 'complete'
  const finished = outcome?.status === 'complete'
  const fraction = finished ? 1 : (progress?.fraction ?? 0)

  let status: string
  if (finished) status = 'Handover: every photo is in the folder'
  else if (stopped) status = outcome?.status === 'cancelled' ? 'Cancelled' : 'Stopped'
  else if (progress?.stage === 'framing' && progress.total > 0)
    status = `Framing — ${framingLabel(progress.done, progress.total)} photos`
  else status = `${STAGES[current]?.label ?? 'Survey'} — ${STAGES[current]?.hint ?? ''}`

  return (
    <div className="stages">
      <ol className="stages__list" aria-label="Survey stages">
        {STAGES.map((stage, i) => {
          const state =
            finished || i < current
              ? 'done'
              : i === current
                ? stopped
                  ? 'stopped'
                  : 'active'
                : 'pending'
          return (
            <li
              key={stage.id}
              className={`stage stage--${state}`}
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <span className="stage__gable" aria-hidden="true">
                {state === 'done' ? '◆' : NUMERALS[i]}
              </span>
              <span className="stage__label">{stage.label}</span>
              <span className="stage__hint">{stage.hint}</span>
            </li>
          )
        })}
      </ol>
      <div
        className="bar"
        role="progressbar"
        aria-label="Survey progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuetext={status}
      >
        <span className="bar__fill" style={{ width: `${Math.round(fraction * 1000) / 10}%` }} />
      </div>
      <p className="stages__status" aria-live="polite">
        {status}
      </p>
    </div>
  )
}
