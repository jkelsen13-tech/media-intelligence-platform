import './epistemic.css'

// Track B Step 3 item 1 — source attribution line (addendum "Source
// attribution line"): publication icon + outlet name + region, with the
// status badge right-aligned on the same line. Missing region is simply not
// rendered; a missing outlet renders the honest "unknown outlet" fallback
// already used by the News Feed.
export default function SourceAttributionLine({ outlet, region, badge }) {
  return (
    <div className="ep-src">
      <span className="ep-src-icon" aria-hidden="true">
        <svg viewBox="0 0 14 14" width="12" height="12" focusable="false">
          <rect x="1.6" y="2" width="10.8" height="10" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M3.8 5h6.4M3.8 7.4h6.4M3.8 9.8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="ep-src-outlet">{outlet ?? 'unknown outlet'}</span>
      {region && <span className="ep-src-region">· {region}</span>}
      {badge && <span className="ep-src-badge">{badge}</span>}
    </div>
  )
}
