// 20_IDEA capability 1 — Graph lineage mode element builder (brief Section 5).
//
// Pure: projection rows + article metadata in, cytoscape elements out. No I/O,
// no cytoscape import — so the whole mapping is testable without a browser.
//
// WHY LINEAGE MODE SWAPS THE ELEMENT SET RATHER THAN OVERLAYING:
// the live `nodes` population is event/actor/policy only — there are no
// article nodes, which is precisely why `edges` was structurally invalid as a
// lineage store (brief Section 1). Article-to-article lineage therefore has
// nothing on the existing canvas to attach to. Lineage mode builds its own
// article nodes from the projection and renders them through the SAME
// GraphView with the SAME conventions. Nothing is written to nodes or edges.
//
// Guardrails honored here:
//   - no composite score: relationship type, confidence band and origin
//     status stay separate fields on the element, never combined;
//   - a parentless assertion is a STATE on one article, never an edge, and
//     never a bare independence claim;
//   - every origin state carries its detection method, corpus scope and
//     check date, or it does not render at all (locked guardrail 4).

import { LINEAGE_EDGE_TYPES, ORIGIN_STATUS_LABELS, lineagePlainLabel } from './theme.js'

/** Short display label for an article node. Falls back honestly. */
function articleLabel(article, id) {
  if (!article) return `Article ${String(id).slice(0, 8)}`
  const outlet = article.outlet || 'Unknown outlet'
  const title = article.title ? String(article.title) : ''
  return title ? `${outlet} — ${title.length > 60 ? title.slice(0, 57) + '…' : title}` : outlet
}

/**
 * Scope line for an origin state. Returns null when the evidence cannot
 * support the statement, so the caller renders nothing rather than an
 * unfalsifiable claim (locked guardrail 4).
 */
export function originStateScope(annotation) {
  const ev = annotation?.evidence ?? {}
  const scanned = ev.corpus_scope?.articles_scanned
  const checked = ev.checked_at
  if (typeof scanned !== 'number' || !checked) return null
  return {
    articlesScanned: scanned,
    checkedAt: String(checked).slice(0, 10),
    detectionMethod: annotation.detectionMethod ?? null,
  }
}

/**
 * Build cytoscape elements for lineage mode.
 *
 * @param projection { edges, originAnnotations } from loadLineageGraph
 * @param articlesById Map(articleId -> { outlet, title, url, published_at })
 * @returns { nodes, edges, unresolvedArticleIds }
 *
 * Articles referenced by lineage but absent from `articlesById` still get a
 * node, labelled honestly ("Article 2e4fd9b8"). Dropping them would silently
 * delete one end of a real relationship; showing a degraded label keeps the
 * relationship visible and the gap obvious.
 */
export function buildLineageElements(projection, articlesById = new Map()) {
  const edges = projection?.edges ?? []
  const annotations = projection?.originAnnotations ?? []

  const referenced = new Set()
  for (const e of edges) {
    if (e.childArticleId) referenced.add(e.childArticleId)
    if (e.parentArticleId) referenced.add(e.parentArticleId)
  }
  for (const a of annotations) if (a.childArticleId) referenced.add(a.childArticleId)

  // Origin states, keyed by article. An article can only carry one current
  // origin state; if several arrive, the first wins deterministically by
  // assertion id so re-renders are stable.
  const stateByArticle = new Map()
  for (const a of [...annotations].sort((x, y) => String(x.assertionId).localeCompare(String(y.assertionId)))) {
    if (!a.childArticleId || stateByArticle.has(a.childArticleId)) continue
    const vocab = ORIGIN_STATUS_LABELS[a.originStatus]
    if (!vocab) continue // unknown status -> render no claim at all
    const scope = originStateScope(a)
    if (!scope) continue // guardrail 4: no scope, no statement
    stateByArticle.set(a.childArticleId, {
      originStatus: a.originStatus,
      originLabel: vocab.label,
      originPlain: vocab.plain,
      confidenceBand: a.confidenceBand,
      detectionMethod: scope.detectionMethod,
      articlesScanned: scope.articlesScanned,
      checkedAt: scope.checkedAt,
    })
  }

  const unresolvedArticleIds = []
  const nodes = [...referenced].sort().map((id) => {
    const article = articlesById.get(id)
    if (!article) unresolvedArticleIds.push(id)
    const state = stateByArticle.get(id) ?? null
    return {
      id,
      slug: id,
      type: 'article',
      label: articleLabel(article, id),
      outlet: article?.outlet ?? null,
      url: article?.url ?? null,
      publishedAt: article?.published_at ?? null,
      resolved: !!article,
      // Separate, independently readable fields — never combined.
      originStatus: state?.originStatus ?? null,
      originLabel: state?.originLabel ?? null,
      originPlain: state?.originPlain ?? null,
      originConfidenceBand: state?.confidenceBand ?? null,
      originDetectionMethod: state?.detectionMethod ?? null,
      originArticlesScanned: state?.articlesScanned ?? null,
      originCheckedAt: state?.checkedAt ?? null,
    }
  })

  const lineageEdges = edges
    .filter((e) => e.childArticleId && e.parentArticleId)
    .map((e) => ({
      id: e.assertionId,
      // Direction: parent (origin) -> child (copy), so the arrow points the
      // way the reporting travelled.
      source: e.parentArticleId,
      target: e.childArticleId,
      type: e.relationshipType,
      label: lineagePlainLabel(e.relationshipType),
      plain: lineagePlainLabel(e.relationshipType),
      relationshipClass: e.relationshipClass,
      confidenceBand: e.confidenceBand,
      detectionMethod: e.detectionMethod,
      // A citation is not derivation. Rendering must be able to distinguish
      // them without reading the type string.
      isDerivation: e.relationshipClass === 'derivation',
      known: !!LINEAGE_EDGE_TYPES[e.relationshipType],
    }))

  return { nodes, edges: lineageEdges, unresolvedArticleIds }
}

/**
 * Honest empty-state copy. Lineage mode with nothing to draw must look
 * deliberate, not broken — the same discipline as Track B's relationship
 * panel. Returns null when there IS something to render.
 */
export function lineageEmptyState(projection) {
  if (!projection?.enabled) return null
  const edges = projection.edges?.length ?? 0
  const annotations = projection.originAnnotations?.length ?? 0
  if (edges || annotations) return null
  return {
    title: 'No verified lineage yet',
    body:
      'Lineage relationships appear here once they have been reviewed and marked verified. '
      + 'Detected relationships awaiting review, and shadow-mode candidates, are deliberately excluded from this view.',
  }
}
