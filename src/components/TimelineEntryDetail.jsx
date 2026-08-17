import { entryDetailView } from '../lib/timelineEngine'
import './epistemic.css'

// Track B Step 3 item 3 — expanded timeline entry detail card (addendum
// Screen 5). Four labeled sections — What changed / Source excerpt /
// Authentication / Remaining uncertainty — each rendered in the v16
// three-tone pattern: real data (value tone) or an explicit, intentional
// empty state (unavailable tone). Never a blank section, never a
// fabrication. The view model is derived once in the pure seam
// (src/lib/timelineEngine.js); this component only renders it.

function Section({ icon, title, children, tone }) {
  return (
    <div className={`ep-tdetail-section ep-tdetail-${tone}`}>
      <div className="ep-tdetail-head">
        <span className="ep-tdetail-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="ep-tdetail-title">{title}</span>
      </div>
      <div className="ep-tdetail-body">{children}</div>
    </div>
  )
}

const ICONS = {
  document: (
    <svg viewBox="0 0 14 14" width="13" height="13" focusable="false">
      <rect x="2.4" y="1.6" width="9.2" height="10.8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.6 4.6h4.8M4.6 6.8h4.8M4.6 9h3.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  ),
  quote: (
    <svg viewBox="0 0 14 14" width="13" height="13" focusable="false">
      <path d="M3 10.5c-1-1.6-.4-4 1.6-5.5l.6.9c-1.2 1-1.5 2-1.4 2.7.7-.3 1.9.1 1.9 1.3 0 .9-.8 1.6-1.7 1.6-.4 0-.7-.1-1-.5ZM9 10.5c-1-1.6-.4-4 1.6-5.5l.6.9c-1.2 1-1.5 2-1.4 2.7.7-.3 1.9.1 1.9 1.3 0 .9-.8 1.6-1.7 1.6-.4 0-.7-.1-1-.5Z" fill="currentColor" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 14 14" width="13" height="13" focusable="false">
      <path d="M7 1.2 11.5 3v3.4c0 3-1.9 5-4.5 6.4-2.6-1.4-4.5-3.4-4.5-6.4V3Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  questionDashed: (
    <svg viewBox="0 0 14 14" width="13" height="13" focusable="false">
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2.4 1.8" />
      <path d="M5.2 5.3a1.9 1.9 0 1 1 2.5 1.8c-.6.26-.7.7-.7 1.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="7" cy="10.1" r="0.8" fill="currentColor" />
    </svg>
  ),
}

export default function TimelineEntryDetail({ entry, article = null }) {
  const view = entryDetailView({ entry, article })
  return (
    <div className="ep-tdetail">
      <Section icon={ICONS.document} title="What changed" tone={view.whatChanged.tone}>
        <p className="ep-tdetail-text">{view.whatChanged.text}</p>
      </Section>
      <Section icon={ICONS.quote} title="Source excerpt" tone={view.sourceExcerpt.tone}>
        {view.sourceExcerpt.tone === 'value' ? (
          <figure className="ep-tdetail-figure">
            <blockquote className="ep-tdetail-quote">{view.sourceExcerpt.text}</blockquote>
            <figcaption className="ep-tdetail-attribution">
              {view.sourceExcerpt.attribution}
            </figcaption>
          </figure>
        ) : (
          <p className="ep-tdetail-text">{view.sourceExcerpt.text}</p>
        )}
      </Section>
      <Section icon={ICONS.shield} title="Authentication" tone={view.authentication.tone}>
        <p className="ep-tdetail-text">{view.authentication.text}</p>
      </Section>
      <Section
        icon={ICONS.questionDashed}
        title="Remaining uncertainty"
        tone={view.remainingUncertainty.tone}
      >
        <p className="ep-tdetail-text">{view.remainingUncertainty.text}</p>
      </Section>
    </div>
  )
}
