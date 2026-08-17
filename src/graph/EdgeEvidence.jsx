import { EDGE_TYPES, INFERRED_CLAIMED_BY, edgePlainLabel } from './theme'

// Step 7 (§6): edge evidence popover. Shown when an edge is tapped on the
// canvas or from the "evidence" affordance on connected-node lists. Renders
// only the fields actually present — the evidence columns land with the
// backend migration and will be mostly empty at first.
function Row({ label, value }) {
  if (value == null || value === '') return null
  const text = Array.isArray(value) ? value.join('; ') : String(value)
  if (!text.trim()) return null
  return (
    <div className="edge-evidence-row">
      <span className="edge-evidence-key">{label}</span>
      <span className="edge-evidence-val">{text}</span>
    </div>
  )
}

export function edgeIsInferred(edge) {
  return edge?.claimed_by === INFERRED_CLAIMED_BY
}

export default function EdgeEvidence({ edge, sourceLabel, targetLabel, position, onClose }) {
  if (!edge) return null
  const inferred = edgeIsInferred(edge)
  const meta = EDGE_TYPES[edge.type]
  const rel = Number(edge.reliability)

  const style =
    position != null
      ? {
          left: Math.min(Math.max(8, position.x), window.innerWidth - 300),
          top: Math.min(Math.max(8, position.y), window.innerHeight - 280),
          transform: 'none',
        }
      : undefined

  return (
    <div className="edge-evidence-backdrop" onClick={onClose}>
      <div
        className="edge-evidence"
        role="dialog"
        aria-label="Edge evidence"
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="edge-evidence-head">
          <span className={`edge-evidence-kind${inferred ? ' inferred' : ''}`}>
            {inferred ? 'MIP hypothesis' : 'Sourced edge'}
          </span>
          <button className="ap-icon-btn" aria-label="Close evidence" onClick={onClose}>
            ×
          </button>
        </div>
        {(sourceLabel || targetLabel) && (
          <p className="edge-evidence-pair">
            {sourceLabel ?? '?'} → {targetLabel ?? '?'}
          </p>
        )}
        <Row label="Type" value={meta?.label ?? edge.type} />
        {/* Item 4: the plain-language meaning in words — causal claims
            causation, sequence claims temporal order only. The raw DB
            label stays below as extraction detail ("Relation"). */}
        <Row
          label="Meaning"
          value={
            edge.type === 'sequence'
              ? `${edgePlainLabel(edge)} — temporal order only, no causation claimed`
              : edge.type === 'causal'
                ? `${edgePlainLabel(edge)} — a causation claim`
                : edgePlainLabel(edge)
          }
        />
        {edge.label && <Row label="Relation" value={edge.label} />}
        <Row label="Signal source" value={edge.signal_source} />
        <Row label="Doc strength" value={edge.doc_strength} />
        <Row label="Claimed by" value={edge.claimed_by} />
        <Row label="Stance" value={edge.stance} />
        <Row label="Disputed by" value={edge.disputed_by} />
        {Number.isFinite(rel) && <Row label="Reliability" value={`${rel} of 4 (1 = highest)`} />}
        {inferred && (
          <>
            <Row label="Counterfactual test" value={edge.counterfactual_test} />
            <Row label="Alternative causes" value={edge.alternative_causes} />
          </>
        )}
        {!edge.signal_source &&
          !edge.doc_strength &&
          !edge.claimed_by &&
          !edge.counterfactual_test && (
            <p className="ap-muted">No evidence recorded for this edge yet.</p>
          )}
      </div>
    </div>
  )
}
