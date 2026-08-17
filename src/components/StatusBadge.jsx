import { badgeState } from '../lib/epistemicModel'
import './epistemic.css'

// Track B Step 3 item 1 — shared status badge (addendum "Status badge
// system — icon plus color plus text, never color alone").
//
// Confirmed / Contested / Inferred. The three states differ in three
// redundant non-color channels — icon glyph, border style (Inferred's
// dashed ring is load-bearing: it must survive accent-color removal), and
// the always-rendered text label — so the badge stays legible in grayscale.
//
// Unknown states render NOTHING (badgeState returns null): an unrecognized
// status must never masquerade as one of the three locked states.
export default function StatusBadge({ state, className }) {
  const meta = badgeState(state)
  if (!meta) return null
  const cls = ['ep-badge', `ep-badge-${meta.tone}`, meta.dashed ? 'ep-badge-dashed' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={cls} aria-label={meta.label}>
      <span className="ep-badge-icon" aria-hidden="true">
        {meta.icon === 'check' ? (
          <svg viewBox="0 0 12 12" width="10" height="10" focusable="false">
            <path d="M2 6.2 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" width="10" height="10" focusable="false">
            <path d="M4.2 4.4a2 2 0 1 1 2.6 1.9c-.7.27-.8.77-.8 1.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="6" cy="9.6" r="0.9" fill="currentColor" />
          </svg>
        )}
      </span>
      <span className="ep-badge-label">{meta.label}</span>
    </span>
  )
}
