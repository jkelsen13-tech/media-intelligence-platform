import { eventTypeIcon } from '../lib/epistemicModel'
import './epistemic.css'

// Track B Step 3 item 2 — circular event-type icon (addendum Screens 4/5:
// scales = legislation, gavel = ruling, shield = incident, microphone =
// coverage & review). Shared by the Policy Arc key-developments list and
// the Timeline spine.
//
// eventTypeIcon() returns null for any type without an honest mapping
// (e.g. the live 'accountability' / 'geopolitical' / 'economic' event
// categories); the component then renders the NEUTRAL circular marker —
// never an icon that would assert a type the record does not have.

const ICONS = {
  scales: (
    <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
      <path d="M8 2.5v11M4.5 13.5h7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 4 3.5 5.5 8 4l4.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 5.5 1.8 9a2 2 0 0 0 3.4 0L3.5 5.5ZM12.5 5.5 10.8 9a2 2 0 0 0 3.4 0l-1.7-3.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
  gavel: (
    <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
      <path d="m6.2 6.2 3.6 3.6M5.1 3.9l4.5 4.5M9.6 2.8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.6 2.4 8.4 6.2M8.9 1.9l4.6 4.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M2 13.6h7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
      <path d="M8 1.8 13 3.6v4c0 3.4-2.1 5.6-5 7-2.9-1.4-5-3.6-5-7v-4Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
      <rect x="6" y="1.8" width="4" height="7" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 7.5a4 4 0 0 0 8 0M8 11.5v2.6M5.6 14.1h4.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
}

export default function TypeIcon({ type, className }) {
  const key = eventTypeIcon(type)
  const cls = ['ep-typeicon', key ? '' : 'ep-typeicon-neutral', className]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={cls} aria-hidden="true">
      {key ? ICONS[key] : <span className="ep-typeicon-dot" />}
    </span>
  )
}
