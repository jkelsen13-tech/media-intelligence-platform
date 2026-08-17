import './epistemic.css'

// Track B Step 3 item 1 — remaining-uncertainty block (addendum
// "Remaining-uncertainty block"). Purple dashed-border box with a (?)
// icon and a plain-language statement of what is still unresolved. The
// dashed border is the same load-bearing treatment as the Inferred badge:
// it must survive accent-color removal.
export default function RemainingUncertaintyBlock({ children }) {
  return (
    <div className="ep-uncertainty">
      <span className="ep-uncertainty-icon" aria-hidden="true">
        <svg viewBox="0 0 14 14" width="14" height="14" focusable="false">
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.4 1.8" />
          <path d="M5.2 5.3a1.9 1.9 0 1 1 2.5 1.8c-.6.26-.7.7-.7 1.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="7" cy="10.1" r="0.8" fill="currentColor" />
        </svg>
      </span>
      <div className="ep-uncertainty-body">
        <span className="ep-uncertainty-title">Remaining uncertainty</span>
        <p className="ep-uncertainty-text">{children}</p>
      </div>
    </div>
  )
}
