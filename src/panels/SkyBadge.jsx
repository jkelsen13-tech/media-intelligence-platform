import { skySummaryLine, skyMethodLabel } from '../lib/sky'

// Sky verification badge (Sky task 5). Renders nothing when there is no
// verification — this is a native-companion feature, so absence is the
// normal state on web. Visual language matches the classifier-transparency
// style (muted, honest, small caps + mono numbers), never a green check.
export default function SkyBadge({ verification }) {
  if (!verification) return null
  const line = skySummaryLine(verification)
  const method = skyMethodLabel(verification.method)
  const err = Number(verification.angular_error_deg)
  return (
    <div className="sky-badge" role="note" aria-label={`Sky verification: ${line}`}>
      <span className="sky-badge-label">Sky verification</span>
      <span className="sky-badge-line">{line}</span>
      <span className="sky-badge-caption">
        {method}
        {method && Number.isFinite(err) && ' · '}
        {Number.isFinite(err) && (
          <>
            angular error <span className="num">{err.toFixed(1)}°</span>
          </>
        )}
      </span>
    </div>
  )
}
