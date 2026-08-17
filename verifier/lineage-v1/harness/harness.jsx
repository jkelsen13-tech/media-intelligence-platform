// Screenshot harness — 20_IDEA capability 1, Section 7 acceptance evidence.
//
// FIXTURE-ONLY, by owner instruction 2026-08-17. This renders the REAL
// GraphView, the REAL Legend and the REAL buildLineageElements against seeded
// fixture rows. It touches no database: production article_lineage_assertions
// is untouched (0 rows) and source-comparison-run is not invoked. That run
// stays a separate, later, owner-authorized action with its own dry-run-first
// sequence.
//
// The seeded rows are shaped exactly like `article_lineage_graph` output, so
// what is captured is the same rendering path a verified row would take.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import GraphView from '../../../src/graph/GraphView'
import Legend from '../../../src/graph/Legend'
import { buildLineageElements, lineageEmptyState } from '../../../src/graph/lineageElements'
import '../../../src/styles/tokens.css'
import '../../../src/index.css'

const SCOPE = { corpus_scope: { articles_scanned: 752 }, checked_at: '2026-08-17T00:00:00.000Z' }

// State 1: a verified syndicated_from edge.
const SEEDED_EDGE = {
  assertionId: 'fixture-edge-1',
  parentArticleId: 'fixture-origin',
  childArticleId: 'fixture-copy',
  kind: 'edge',
  relationshipClass: 'derivation',
  relationshipType: 'syndicated_from',
  originStatus: null,
  detectionMethod: 'exact_text_hash',
  confidenceBand: 'high',
  evidence: { ...SCOPE, match_basis: 'exact_text_hash', match_percent: 100 },
  ruleVersion: 'lineage-v1',
}

// State 2: a verified independent_origin_candidate state.
const SEEDED_ANNOTATION = {
  assertionId: 'fixture-annotation-1',
  parentArticleId: null,
  childArticleId: 'fixture-independent',
  kind: 'origin_annotation',
  relationshipClass: 'origin_classification',
  relationshipType: 'origin_undetermined',
  originStatus: 'independent_origin_candidate',
  detectionMethod: 'corpus_scan',
  confidenceBand: 'low',
  evidence: SCOPE,
  ruleVersion: 'lineage-v1',
}

const ARTICLES = new Map([
  ['fixture-origin', { outlet: 'Reuters', title: 'Wire report on the redistricting ruling', url: 'https://reuters.com/x', published_at: '2026-05-01' }],
  ['fixture-copy', { outlet: 'Billings Gazette', title: 'Wire report on the redistricting ruling', url: 'https://billingsgazette.com/x', published_at: '2026-05-03' }],
  ['fixture-independent', { outlet: 'BBC', title: 'Own reporting on the ruling', url: 'https://bbc.co.uk/x', published_at: '2026-05-02' }],
])

const params = new URLSearchParams(location.search)
const state = params.get('state') ?? 'populated'

const projection =
  state === 'empty'
    ? { enabled: true, edges: [], originAnnotations: [] }
    : { enabled: true, edges: [SEEDED_EDGE], originAnnotations: [SEEDED_ANNOTATION] }

const elements = buildLineageElements(projection, ARTICLES)
const empty = lineageEmptyState(projection)

function Harness() {
  return (
    <div className="app">
      <div className="graph-body" style={{ height: '100vh' }}>
        <div className="graph-rail">
          <Legend lineageMode />
        </div>
        <div className="graph-stage" style={{ position: 'relative', flex: 1 }}>
          {empty && (
            <div className="lineage-empty" role="status">
              <h3>{empty.title}</h3>
              <p>{empty.body}</p>
            </div>
          )}
          <GraphView
            key={`lineage-${state}`}
            nodes={elements.nodes}
            edges={elements.edges}
            onSelect={() => {}}
            panelOpen={false}
            controlsDimmed={false}
            minReliability={4}
            showInferred
            onEdgeSelect={() => {}}
          />
        </div>
      </div>
      {/* Origin states are node states, not edges — rendered as text so the
          evidence shows the scope line guardrail 4 requires. */}
      <div
        className="lineage-origin-states"
        style={{
          position: 'fixed', bottom: 16, right: 16, maxWidth: 560, fontSize: 12,
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 20, padding: '12px 16px', zIndex: 5,
        }}
      >
        {elements.nodes.filter((n) => n.originStatus).map((n) => (
          <div key={n.id} className="legend-row">
            <strong>{n.label}</strong> — {n.originLabel}: “{n.originPlain}” · method {n.originDetectionMethod} ·
            {' '}checked {n.originArticlesScanned} articles as of {n.originCheckedAt} · confidence {n.originConfidenceBand}
          </div>
        ))}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>)
