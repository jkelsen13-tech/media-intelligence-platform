// 20_IDEA capability 1 — Graph lineage projection read path (brief Section 5).
//
// Reads the read-only `article_lineage_graph` view. It never reads
// article_lineage_assertions directly: the view is the seam that guarantees
// only verified, current assertions are visible, and going around it would
// discard that guarantee at the first careless query.
//
// Gate: pipeline_config.lineage_graph_mode must be exactly true. Flag false or
// unreadable -> no table reads at all and a disabled result. Same withhold
// posture as phase3ReadPath / source_comparison_beta / track_b_light_theme.
//
// Hard rules honored here:
//   - no composite lineage or independence score is computed or served;
//     relationship_type, confidence_band and origin_status stay separate;
//   - shadow / unreviewed / rejected assertions cannot appear, by the view's
//     WHERE clause and by the base table's RLS policy independently;
//   - a parentless assertion is an origin ANNOTATION, never an edge, and
//     never a confident independence claim — it carries origin_status
//     ('independent_origin_candidate' or
//     'no_shared_origin_detected_within_corpus') plus its detection method,
//     corpus scope and check date, per locked guardrail 4.

const VIEW = 'article_lineage_graph'

const COLUMNS = [
  'assertion_id',
  'child_article_id',
  'parent_article_id',
  'projection_kind',
  'relationship_class',
  'relationship_type',
  'origin_status',
  'detection_method',
  'confidence_band',
  'evidence_basis',
  'rule_version',
  'created_at',
  'reviewed_at',
].join(', ')

/** Flag read. Exactly-true only when the DB value is boolean true. */
export async function loadLineageGraphFlag({ supabaseClient } = {}) {
  const supabase = supabaseClient ?? (await import('./supabase.js')).supabase
  if (!supabase) return false
  const { data, error } = await supabase
    .from('pipeline_config')
    .select('value')
    .eq('key', 'lineage_graph_mode')
    .maybeSingle()
  if (error) return false
  return data?.value === true
}

/**
 * Presentation shape for one projected row.
 *
 * `label` is the relationship_type verbatim. Brief Section 5: lineage edges
 * are labeled by relationship_type using the EXISTING Track B edge-type
 * label/color conventions — new relationship types, not a new visual system.
 * Mapping a type to its display string and color belongs to the Graph theme,
 * not to this read path, so nothing is invented here.
 */
function toProjection(row) {
  return {
    assertionId: row.assertion_id,
    childArticleId: row.child_article_id,
    parentArticleId: row.parent_article_id ?? null,
    kind: row.projection_kind,
    relationshipClass: row.relationship_class,
    relationshipType: row.relationship_type,
    originStatus: row.origin_status ?? null,
    detectionMethod: row.detection_method,
    confidenceBand: row.confidence_band,
    evidence: row.evidence_basis ?? {},
    ruleVersion: row.rule_version,
    reviewedAt: row.reviewed_at ?? null,
  }
}

/**
 * Load the lineage projection.
 *
 * Returns { enabled, edges, originAnnotations, loadError? }.
 *
 * `edges` are drawable article-to-article relationships. `originAnnotations`
 * are statements about a single article whose origin was not resolved to a
 * corpus row — they have nothing to draw an edge to and must render as a
 * deliberate state rather than as a missing edge (brief Section 7: the
 * independent_origin_candidate state must look intentional, not broken).
 *
 * An empty projection is a normal empty state, not an error: with no verified
 * lineage recorded there is nothing to show, and we must not imply otherwise.
 */
export async function loadLineageGraph({ supabaseClient } = {}) {
  const supabase = supabaseClient ?? (await import('./supabase.js')).supabase
  const disabled = { enabled: false, edges: [], originAnnotations: [] }
  if (!supabase) return disabled

  const { data: flagRow, error: flagError } = await supabase
    .from('pipeline_config')
    .select('value')
    .eq('key', 'lineage_graph_mode')
    .maybeSingle()
  if (flagError || flagRow?.value !== true) return disabled

  // Doc 13: paginate past the PostgREST 1000-row ceiling. Keyset on the
  // unique assertion_id, matching the in-repo precedent — an unranged select
  // silently truncates at 1000 and would drop lineage without erroring.
  const rows = []
  let last = null
  for (;;) {
    let q = supabase.from(VIEW).select(COLUMNS).order('assertion_id', { ascending: true })
    if (last !== null) q = q.gt('assertion_id', last)
    const { data, error } = await q.limit(1000)
    if (error) return { enabled: true, edges: [], originAnnotations: [], loadError: error.message }
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
    last = data[data.length - 1].assertion_id
  }

  const projections = rows.map(toProjection)
  return {
    enabled: true,
    // Defense in depth: the view already guarantees a parent for 'edge' rows,
    // but an edge without two endpoints is undrawable, so never trust it blind.
    edges: projections.filter((p) => p.kind === 'edge' && p.parentArticleId),
    originAnnotations: projections.filter((p) => p.kind === 'origin_annotation'),
  }
}

/**
 * Scope line for an origin annotation — locked guardrail 4: an absence or
 * origin finding without its scope stated is unfalsifiable and must not ship.
 * Returns null when the evidence cannot support the statement, so the caller
 * renders nothing rather than an unfalsifiable claim.
 */
export function originScopeLine(annotation) {
  const ev = annotation?.evidence ?? {}
  const scope = ev.corpus_scope ?? {}
  const scanned = scope.articles_scanned
  const checked = ev.checked_at
  if (typeof scanned !== 'number' || !checked) return null
  return `Checked ${scanned} articles in the monitored corpus as of ${String(checked).slice(0, 10)} · method: ${annotation.detectionMethod}`
}
