import './epistemic.css'

// Track B Step 3 item 1 — inline epistemic info banner (addendum "Inline
// epistemic info banners"). States one locked plain-language principle at
// the point of use (recurring instance: "Missing evidence is recorded, not
// treated as contradiction."). Not decorative; not removable for density.
export default function EpistemicBanner({ children }) {
  return (
    <div className="ep-banner" role="note">
      <span className="ep-banner-icon" aria-hidden="true">
        <svg viewBox="0 0 14 14" width="13" height="13" focusable="false">
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="7" cy="4.3" r="0.9" fill="currentColor" />
          <path d="M7 6.4v3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <p className="ep-banner-text">{children}</p>
    </div>
  )
}
