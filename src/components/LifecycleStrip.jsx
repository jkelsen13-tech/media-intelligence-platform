import './epistemic.css'

// Track B Step 3 item 2 — policy lifecycle strip (addendum Screen 4).
//
// Legislation → Ruling → Enforcement, with icons. The strip shows position
// in a documented lifecycle, NOT progress toward a good outcome. It is
// deliberately static: the arc schema has no lifecycle-position field, so
// no stage is ever filled, highlighted, or marked complete.
//
// The caption "Orientation only. Not a score." is load-bearing — without
// it the strip reads as a progress bar, which would be a composite-score
// violation (Amendment A). It is therefore hardcoded here, NOT a prop: no
// caller can drop it. The static guard in tests/policyArcModel.test.mjs
// pins the verbatim string in this file.

const STAGES = [
  {
    key: 'legislation',
    label: 'Legislation',
    icon: (
      <svg viewBox="0 0 16 16" width="15" height="15" focusable="false">
        {/* scales */}
        <path d="M8 2.5v11M4.5 13.5h7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M8 4 3.5 5.5 8 4l4.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.5 5.5 1.8 9a2 2 0 0 0 3.4 0L3.5 5.5ZM12.5 5.5 10.8 9a2 2 0 0 0 3.4 0l-1.7-3.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'ruling',
    label: 'Ruling',
    icon: (
      <svg viewBox="0 0 16 16" width="15" height="15" focusable="false">
        {/* gavel */}
        <path d="m6.2 6.2 3.6 3.6M5.1 3.9l4.5 4.5M9.6 2.8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M4.6 2.4 8.4 6.2M8.9 1.9l4.6 4.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M2 13.6h7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'enforcement',
    label: 'Enforcement',
    icon: (
      <svg viewBox="0 0 16 16" width="15" height="15" focusable="false">
        {/* institution / columns */}
        <path d="M2.5 6 8 2.5 13.5 6M3.5 6.8v5M6.5 6.8v5M9.5 6.8v5M12.5 6.8v5M2.5 13.2h11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export default function LifecycleStrip() {
  return (
    <div className="ep-lifecycle">
      <div className="ep-lifecycle-stages">
        {STAGES.map((stage, i) => (
          <div key={stage.key} className="ep-lifecycle-stage-wrap">
            {i > 0 && (
              <span className="ep-lifecycle-arrow" aria-hidden="true">
                <svg viewBox="0 0 20 10" width="20" height="10" focusable="false">
                  <path d="M1 5h15M12.5 1.8 16 5l-3.5 3.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
            <div className="ep-lifecycle-stage">
              <span className="ep-lifecycle-icon" aria-hidden="true">
                {stage.icon}
              </span>
              <span className="ep-lifecycle-label">{stage.label}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="ep-lifecycle-caption">Orientation only. Not a score.</p>
    </div>
  )
}
