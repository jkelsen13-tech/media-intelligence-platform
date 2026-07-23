import { useEffect, useMemo, useState } from 'react'
import { loadTimeline } from '../lib/supabase'
import { EDGE_WEIGHTS } from '../graph/theme'

// Causal timeline (concept doc §2.4): events ordered by date, with causal
// links rendered between them — the connective tissue the news cycle severs.

function confidenceColor(score) {
  if (score == null) return '#6b7280'
  const hue = Math.round((score / 100) * 120)
  return `hsl(${hue}, 70%, 45%)`
}

export default function TimelineView() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadTimeline().then(setData).catch((err) => setError(err.message))
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    const eventById = new Map(data.events.map((e) => [e.id ?? e.slug, e]))
    return data.events.map((evt) => {
      const key = evt.id ?? evt.slug
      const outbound = data.causalEdges
        .filter((e) => e.source === key)
        .map((e) => ({
          ...e,
          targetLabel: eventById.get(e.target)?.label ?? e.target,
        }))
      const inbound = data.causalEdges
        .filter((e) => e.target === key)
        .map((e) => ({
          ...e,
          sourceLabel: eventById.get(e.source)?.label ?? e.source,
        }))
      return { evt, outbound, inbound }
    })
  }, [data])

  if (error) return <div className="notice error">Failed to load timeline: {error}</div>
  if (!data) return <div className="notice">Loading timeline…</div>

  return (
    <div className="timeline-view">
      <div className="timeline-intro">
        <h2>Causal Timeline</h2>
        <p>
          Events mapped causally, not just chronologically. Institutional memory that survives the
          news cycle.
        </p>
      </div>
      <ol className="timeline">
        {rows.map(({ evt, outbound, inbound }) => (
          <li key={evt.id ?? evt.slug} className="timeline-item">
            <div className="timeline-marker" />
            <div className="timeline-card">
              <div className="timeline-date">{evt.occurred_at ?? 'undated'}</div>
              <h3>{evt.label}</h3>
              {evt.confidence != null && (
                <span
                  className="timeline-confidence"
                  style={{ color: confidenceColor(evt.confidence) }}
                >
                  {evt.confidence}% documented
                </span>
              )}
              {(evt.summary ?? evt.description) && <p>{evt.summary ?? evt.description}</p>}
              {inbound.length > 0 && (
                <div className="timeline-links">
                  {inbound.map((e) => (
                    <span key={e.id} className="timeline-link inbound">
                      ← {e.sourceLabel} <em>({e.label ?? 'caused'})</em>
                      <i style={{ borderTopWidth: EDGE_WEIGHTS[e.weight] ?? 3 }} />
                    </span>
                  ))}
                </div>
              )}
              {outbound.length > 0 && (
                <div className="timeline-links">
                  {outbound.map((e) => (
                    <span key={e.id} className="timeline-link outbound">
                      → {e.targetLabel} <em>({e.label ?? 'led to'})</em>
                      <i style={{ borderTopWidth: EDGE_WEIGHTS[e.weight] ?? 3 }} />
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
