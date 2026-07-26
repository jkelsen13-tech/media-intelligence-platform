import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// ⚠️  WARNING (Phase 0 arc-membership fix): the ?reset=1 path WIPES the entire
// arc layer (story_arcs, arc_entities, arc_events, arc_milestones, nodes,
// edges, sources, citations, article_entities, entities) and resets every
// article's arc assignment. A full reprocess built the ORIGINAL poisoned arc
// layer. Do NOT run reset without (a) a fresh backup of articles.arc_id,
// story_arcs and arc_entities, and (b) a reviewed migration plan. The attach /
// originate paths below now carry the same hardening as ingest-rss
// (hub-entity exclusion, min shared-entity / primary gate, similarity floor,
// most-matches process picking, anti-snowball arc_entities, centroid
// embeddings) so a re-run cannot re-snowball — but reset is still destructive.
// ---------------------------------------------------------------------------

async function loadConfig(supabase: any) {
  const { data, error } = await supabase.from('pipeline_config').select('key, value')
  if (error) throw error
  const cfg: Record<string, any> = {}
  for (const row of data) cfg[row.key] = row.value
  return cfg
}


const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', middot: '·', bull: '•', dagger: '†', Dagger: '‡',
  prime: '′', Prime: '″', minus: '−', permil: '‰', frasl: '⁄',
  trade: '™', copy: '©', reg: '®', deg: '°', plusmn: '±', times: '×', divide: '÷',
  pound: '£', euro: '€', yen: '¥', cent: '¢', sect: '§', para: '¶', micro: 'µ',
  eacute: 'é', Eacute: 'É', egrave: 'è', Egrave: 'È', agrave: 'à', Agrave: 'À',
  ccedil: 'ç', Ccedil: 'Ç', uuml: 'ü', Uuml: 'Ü', ouml: 'ö', Ouml: 'Ö',
  auml: 'ä', Auml: 'Ä', iuml: 'ï', Iuml: 'Ï', euml: 'ë', Euml: 'Ë',
  iacute: 'í', Iacute: 'Í', oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', szlig: 'ß', oelig: 'œ', OElig: 'Œ',
  aelig: 'æ', AElig: 'Æ', aring: 'å', Aring: 'Å', oslash: 'ø', Oslash: 'Ø',
  ecirc: 'ê', Ecirc: 'Ê', acirc: 'â', Acirc: 'Â', ocirc: 'ô', Ocirc: 'Ô',
  ucirc: 'û', Ucirc: 'Û', icirc: 'î', Icirc: 'Î', atilde: 'ã', Atilde: 'Ã',
  otilde: 'õ', Otilde: 'Õ',
  rsaquo: '›', lsaquo: '‹', laquo: '«', raquo: '»', rarr: '→', larr: '←', harr: '↔',
  sup2: '²', sup3: '³', frac12: '½', frac14: '¼', frac34: '¾',
  brvbar: '¦', uml: '¨', acute: '´', cedil: '¸', ordf: 'ª', ordm: 'º',
  iexcl: '¡', iquest: '¿', shy: '',
}