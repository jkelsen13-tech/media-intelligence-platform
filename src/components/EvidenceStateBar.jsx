import {
  validateEvidenceCounts,
  missingScopeRequired,
  MISSING_SCOPE_FALLBACK,
} from '../lib/epistemicModel'
import './epistemic.css'

// Track B Step 3 item 1 — evidence-state summary bar (addendum
// "Evidence-state summary bar").
//
// Supporting / Contested / Missing are ALWAYS three separate counts, shown
// as icon + count + label (+ sublabel). The Amendment A composite-score
// prohibition applies to this component: the three counts are never summed,
// averaged, or ranked into one figure. There is deliberately no total — the
// static drift guard in tests/epistemicComponents.test.mjs forbids any
// addition operator or "total" label from entering this file.
//
// Guardrail 4: the Missing count is an absence finding and carries its own
// scope (monitored corpus / period / sources checked / last-check date).
// Scope is required whenever missing > 0; if the caller fails to supply it,
// the bar says so explicitly rather than staying silent.

function Cell({ tone, icon, count, label, sublabel }) {
  return (
    <div className={`ep-esb-cell ep-esb-${tone}`}>
      <span className="ep-esb-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="ep-esb-body">
        <span className="ep-esb-label">{label}</span>
        <span className="ep-esb-count num">{count}</span>
        <span className="ep-esb-sub">{sublabel}</span>
      </span>
    </div>
  )
}

const ICONS = {
  check: (
    <svg viewBox="0 0 14 14" width="14" height="14" focusable="false">
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.4 7.2 6.3 9.1 9.8 5.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  question: (
    <svg viewBox="0 0 14 14" width="14" height="14" focusable="false">
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.2 5.3a1.9 1.9 0 1 1 2.5 1.8c-.6.26-.7.7-.7 1.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="7" cy="10.1" r="0.8" fill="currentColor" />
    </svg>
  ),
  cross: (
    <svg viewBox="0 0 14 14" width="14" height="14" focusable="false">
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.8 4.8l4.4 4.4M9.2 4.8l-4.4 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
}

export default function EvidenceStateBar({ supporting, contested, missing, missingScope }) {
  const counts = validateEvidenceCounts({ supporting, contested, missing })
  const scopeNeeded = missingScopeRequired(counts.missing)
  const scopeText =
    typeof missingScope === 'string' && missingScope.trim() ? missingScope.trim() : null
  return (
    <div className="ep-esb">
      <div className="ep-esb-cells">
        <Cell tone="supporting" icon={ICONS.check} count={counts.supporting} label="Supporting" sublabel="Confirmed reports" />
        <Cell tone="contested" icon={ICONS.question} count={counts.contested} label="Contested" sublabel="Open or disputed" />
        <Cell tone="missing" icon={ICONS.cross} count={counts.missing} label="Missing" sublabel="Not yet reported" />
      </div>
      {scopeNeeded && (
        <p className={`ep-esb-scope${scopeText ? '' : ' ep-esb-scope-absent'}`}>
          {scopeText ?? MISSING_SCOPE_FALLBACK}
        </p>
      )}
    </div>
  )
}
