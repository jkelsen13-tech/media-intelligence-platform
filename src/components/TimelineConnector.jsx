import './epistemic.css'

// Track B Step 3 item 3 — timeline connector label (addendum Screen 5:
// "Connector labels between entries — the causation boundary made
// visible"). Rendered between EVERY pair of adjacent entries; never
// collapsed, abbreviated, or dropped for density.
//
// The causal-vs-sequence distinction reads from three redundant non-color
// channels: (1) the WORDS (always), (2) the link icon present only on the
// causal label, (3) line treatment matching the graph legend — dashed for
// sequence, solid with arrow for causal. Color is never the only channel.

export default function TimelineConnector({ connector }) {
  if (!connector) return null
  const causal = connector.kind === 'causal'
  return (
    <div
      className={`ep-connector ${causal ? 'ep-connector-causal' : 'ep-connector-sequence'}`}
      role="note"
      aria-label={connector.label}
    >
      <span className="ep-connector-line" aria-hidden="true">
        <svg viewBox="0 0 10 26" width="10" height="26" focusable="false">
          {causal ? (
            <>
              <path d="M5 1v18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M1.8 15.5 5 19.5l3.2-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : (
            <path d="M5 1v21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3 3" />
          )}
        </svg>
      </span>
      <span className="ep-connector-label">
        {causal && (
          <span className="ep-connector-linkicon" aria-hidden="true">
            <svg viewBox="0 0 14 14" width="11" height="11" focusable="false">
              <path d="M6 8a2.5 2.5 0 0 0 3.5.4l1.6-1.6a2.5 2.5 0 0 0-3.5-3.5l-.9.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M8 6a2.5 2.5 0 0 0-3.5-.4L2.9 7.2a2.5 2.5 0 0 0 3.5 3.5l.9-.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
        )}
        {connector.label}
      </span>
    </div>
  )
}
