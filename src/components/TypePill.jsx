import { typePillLabel } from '../lib/epistemicModel'
import './epistemic.css'

// Track B Step 3 item 1 — category/type pill (addendum "Category and type
// pills"). Small rounded outline pill over the locked seven-type vocabulary
// (Legislation / Ruling / Incident / Coverage & review / Policy / News /
// Evidence). Unknown types humanize via the pure seam; unrenderable input
// renders nothing.
export default function TypePill({ type, className }) {
  const label = typePillLabel(type)
  if (!label) return null
  const cls = ['ep-pill', className].filter(Boolean).join(' ')
  return <span className={cls}>{label}</span>
}
