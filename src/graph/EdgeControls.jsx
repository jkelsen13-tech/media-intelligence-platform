// Step 7 (§6) + Step 8 (§5): graph filter controls floating near the
// legend. Reliability stepper ("Edges ≥ reliability N", 1–4 — 1 shows
// everything, the default) and the MIP hypothesis (inferred edge) toggle,
// which defaults OFF. The Topics button only renders when the topic
// tables are present (feature-detected by App).
export default function EdgeControls({
  minReliability,
  onMinReliabilityChange,
  showInferred,
  onShowInferredChange,
  inferredCount = 0,
  topicsAvailable = false,
  onOpenTopics,
}) {
  return (
    <div className="graph-controls">
      <div className="graph-control-row" role="group" aria-label="Reliability filter">
        <span className="graph-control-label">Edges ≥ reliability</span>
        <button
          type="button"
          className="graph-stepper-btn"
          aria-label="Lower reliability threshold"
          disabled={minReliability <= 1}
          onClick={() => onMinReliabilityChange(Math.max(1, minReliability - 1))}
        >
          −
        </button>
        <span className="graph-stepper-value num" aria-live="polite">
          {minReliability}
        </span>
        <button
          type="button"
          className="graph-stepper-btn"
          aria-label="Raise reliability threshold"
          disabled={minReliability >= 4}
          onClick={() => onMinReliabilityChange(Math.min(4, minReliability + 1))}
        >
          +
        </button>
      </div>
      <label className="graph-control-row graph-control-toggle">
        <input
          type="checkbox"
          checked={showInferred}
          onChange={(e) => onShowInferredChange(e.target.checked)}
        />
        <span>
          Hypotheses{inferredCount > 0 && <> (<span className="num">{inferredCount}</span>)</>}
        </span>
      </label>
      {topicsAvailable && (
        <button type="button" className="graph-topics-btn" onClick={onOpenTopics}>
          Topics
        </button>
      )}
    </div>
  )
}
