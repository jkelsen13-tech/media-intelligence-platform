// Sky verification (Sky tasks 5–6): pure helpers shared by the Article
// Panel and the News Feed. The verification itself is produced by the
// native companion app; the web UI only renders it and applies a small,
// visible credibility adjustment.

// Task 6: confidence boost per sensor_quality tier. Kept in one place so
// the weighting is auditable. Capped at 100.
export const SKY_BOOST = { high: 10, medium: 5, low: 2 }

// applySkyBoost(confidence, verification) → { value, boosted, delta }.
// Pure: no verification, no confidence, or an unknown sensor tier passes
// the input through unchanged with boosted:false.
export function applySkyBoost(confidence, verification) {
  if (confidence == null || !Number.isFinite(Number(confidence))) {
    return { value: confidence ?? null, boosted: false, delta: 0 }
  }
  const delta = verification ? (SKY_BOOST[verification.sensor_quality] ?? 0) : 0
  if (!delta) return { value: Number(confidence), boosted: false, delta: 0 }
  return { value: Math.min(100, Math.round(Number(confidence) + delta)), boosted: true, delta }
}

const SKY_METHOD_LABELS = {
  shadow_assisted: 'shadow-assisted measurement',
  shadow_auto: 'automatic shadow measurement',
  sky_disk: 'sky-disk measurement',
  star_field: 'star-field measurement',
}

export function skyMethodLabel(method) {
  return SKY_METHOD_LABELS[method] ?? (method ? `${String(method).replace(/_/g, ' ')} measurement` : null)
}

// Deliberately imprecise radius: 2 significant figures with a ~ prefix.
export function skyRadiusText(km) {
  const n = Number(km)
  if (!Number.isFinite(n) || n <= 0) return null
  return `~${Number(n.toPrecision(2))} km`
}

const SKY_QUALITY_LABELS = { high: 'high confidence', medium: 'medium confidence', low: 'low confidence' }

// Headline line, e.g. "Location consistent within ~80 km — high confidence".
export function skySummaryLine(verification) {
  if (!verification) return null
  const radius = skyRadiusText(verification.confidence_radius_km)
  const quality = SKY_QUALITY_LABELS[verification.sensor_quality] ?? null
  if (radius && quality) return `Location consistent within ${radius} — ${quality}`
  if (radius) return `Location consistent within ${radius}`
  if (quality) return `Location consistent with report — ${quality}`
  return 'Location consistent with report'
}
