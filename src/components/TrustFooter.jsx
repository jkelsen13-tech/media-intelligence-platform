import { reviewedLine } from '../lib/epistemicModel'
import './epistemic.css'

// Track B Step 3 item 1 — trust footer (addendum "Trust footer"). Renders at
// the bottom of every screen: left slot for the screen's closing content
// (sources line, closing footnote), right slot "Reviewed [date]" with a
// shield-check icon.
//
// reviewedLine() returns null when no review date exists, and the line is
// then omitted entirely — a review date is never fabricated.
export default function TrustFooter({ left, reviewedAt }) {
  const reviewed = reviewedLine(reviewedAt)
  return (
    <footer className="ep-trust">
      <div className="ep-trust-left">{left}</div>
      {reviewed && (
        <span className="ep-trust-reviewed">
          <span className="ep-trust-shield" aria-hidden="true">
            <svg viewBox="0 0 14 14" width="13" height="13" focusable="false">
              <path d="M7 1.2 11.5 3v3.4c0 3-1.9 5-4.5 6.4-2.6-1.4-4.5-3.4-4.5-6.4V3Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M4.9 7.1 6.5 8.7 9.3 5.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          {reviewed}
        </span>
      )}
    </footer>
  )
}
