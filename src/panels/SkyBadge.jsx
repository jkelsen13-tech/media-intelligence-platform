import { skySummaryLine, skyMethodLabel } from '../lib/sky'

// Location corroboration badge (formerly "Sky verification" — renamed per
// 02A Amendment B; see docs/LOCATION_CORROBORATION.md). Renders nothing when
// there is no corroboration — this is a native-companion feature, so absence
// is the normal state on web. Visual language matches the
// classifier-transparency style (muted, honest, small caps + mono numbers),
// never a green check. Language rule: corroborates / consistent with /
// does not support — never "verifies."
export default function SkyBadge({ verification }) {
  if (!verification) return null
  const line = skySummaryLine(verification)
  const method = skyMethodLabel(verification.method)
  const err = Number(verification.angular_error_deg)
  return (
    <div className="sky-badge" role="note" aria-label={`Location corroboration: ${line}`}>
      <span className="sky-badge-label">Location corroboration</span>
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
