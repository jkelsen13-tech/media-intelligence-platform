// G1 harness — JS port of ingest-rss Step 1 sanitization (decodeEntities +
// sanitize), transcribed from supabase/functions/ingest-rss/index.ts @ 445503ee.
// Drift-guarded by drift.test.mjs. Bug variants reintroduce the known
// failures for mutation proof — they are NOT used in production.

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', middot: '·', bull: '•', dagger: '†', Dagger: '‡',
  prime: '′', Prime: '″', minus: '−', permil: '‰', frasl: '⁄',
  trade: '™', copy: '©', reg: '®', deg: '°', plusmn: '±', times: '×', divide: '÷',
  pound: '£', euro: '€', yen: '¥', cent: '¢', sect: '§', para: '¶', micro: 'µ',
  eacute: 'é', Eacute: 'É', egrave: 'è', Egrave: 'È', agrave: 'à', Agrave: 'À',
  ccedil: 'ç', Ccedil: 'Ç', uuml: 'ü', Uuml: 'Ü', ouml: 'ö', Ouml: 'Ö',
  auml: 'ä', Auml: 'Ä', iuml: 'ï', euml: 'ë', iacute: 'í', Iacute: 'Í',
  oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú', ntilde: 'ñ', Ntilde: 'Ñ',
  szlig: 'ß', oelig: 'œ', OElig: 'Œ', aelig: 'æ', AElig: 'Æ', aring: 'å', Aring: 'Å',
  oslash: 'ø', Oslash: 'Ø', ecirc: 'ê', Ecirc: 'Ê', acirc: 'â', Acirc: 'Â',
  ocirc: 'ô', Ocirc: 'Ô', ucirc: 'û', Ucirc: 'Û', icirc: 'î', Icirc: 'Î',
  atilde: 'ã', Atilde: 'Ã', otilde: 'õ', Otilde: 'Õ',
  rsaquo: '›', lsaquo: '‹', laquo: '«', raquo: '»', rarr: '→', larr: '←', harr: '↔',
  sup2: '²', sup3: '³', frac12: '½', frac14: '¼', frac34: '¾',
  brvbar: '¦', uml: '¨', acute: '´', cedil: '¸', ordf: 'ª', ordm: 'º',
  iexcl: '¡', iquest: '¿', shy: '',
}

const TRUNCATED_ENTITY_PREFIXES = new Set([
  'lt', 'gt', 'am', 'amp', 'qu', 'quo', 'quot', 'ap', 'apo', 'apos',
  'nb', 'nbs', 'nbsp', 'hel', 'hell', 'helli', 'hellip',
  'mda', 'mdas', 'mdash', 'nda', 'ndas', 'ndash',
  'lsq', 'lsqu', 'lsquo', 'rsq', 'rsqu', 'rsquo',
  'ldq', 'ldqu', 'ldquo', 'rdq', 'rdqu', 'rdquo',
  'mid', 'midd', 'middo', 'middot', 'bul', 'bull',
  'cop', 'copy', 'reg', 'tra', 'trad', 'trade', 'deg',
])

export function decodeEntities(s) {
  // Shipped (Phase 0 Tier 2): decode to a FIXPOINT (max 3 passes) so
  // double-encoded input resolves fully, and tolerate whitespace-malformed
  // entities (& apos; -> ').
  for (let pass = 0; pass < 3; pass++) {
    const before = s
    s = s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{0,9}|\s+[a-zA-Z]{2,9});/g, (m, g) => {
      if (g[0] === '#') {
        const n = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)
        if (Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)) {
          try { return String.fromCodePoint(n) } catch { return m }
        }
        return m
      }
      return NAMED_ENTITIES[g.trim()] ?? m
    })
    if (s === before) break
  }
  return s
}

// variant: 'repaired' (default) | 'delete-entities' | 'single-pass'
export function sanitize(raw, { variant = 'repaired' } = {}) {
  if (!raw) return { text: '', imageUrl: null, imageAlt: null }
  let s = String(raw).replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
  let imageUrl = null
  let imageAlt = null
  const img = s.match(/<img\b[^>]*>/i) ?? s.match(/<img\b[\s\S]*$/i)
  if (img) {
    const src = img[0].match(/src\s*=\s*"([^"]+)"/i) ?? img[0].match(/src\s*=\s*'([^']+)'/i)
    const alt = img[0].match(/alt\s*=\s*"([^"]*)"/i) ?? img[0].match(/alt\s*=\s*'([^']*)'/i)
    imageUrl = src ? src[1] : null
    imageAlt = alt ? alt[1] : null
  }
  s = s.replace(/<img\b[^>]*>?/gi, ' ')
  if (variant === 'delete-entities') {
    // KNOWN BUG (pre-repair): entities DELETED instead of decoded.
    s = s.replace(/&[a-zA-Z#0-9]{1,10};/g, ' ')
  } else if (variant === 'single-pass') {
    // KNOWN BUG: one decode pass leaves double-encoding half-resolved.
    s = s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{0,9});/g, (m, g) => NAMED_ENTITIES[g] ?? m)
  } else {
    // Shipped: decode BEFORE tag-stripping — encoded tags (&lt;b&gt;) become
    // literal markup here and are removed by the next passes.
    s = decodeEntities(s)
  }
  s = s.replace(/<[^>]+>/g, ' ') // complete tags (incl. decoded ones)
  s = s.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*&[a-zA-Z]{0,9}(?![a-zA-Z0-9]*;)/g, ' ') // broken fragments: </span&
  s = s.replace(/<\/?[a-zA-Z!][^>]{0,400}$/, ' ') // unterminated tag at end ("<a href='htt")
  s = s.replace(/<\/?$/, ' ')
  if (variant !== 'no-halfstrip' && variant !== 'single-pass' && variant !== 'delete-entities') {
    // (1) Half-stripped legacy entities ("Trump apos;s", "& apos;").
    // KNOWN BUG variants skip this repair pass.
    s = s.replace(/&?\s+apos\s*;/g, "'")
    s = s.replace(/&?\bapos\s*;/g, "'")
    s = s.replace(/&?\s+quot\s*;(?=\s|$)/g, '"')
    s = s.replace(/&?\bquot\s*;/g, '"')
    s = s.replace(/&?\s*\bnbsp\s*;/g, ' ')
    s = s.replace(/&?\bamp\s*;/g, '&')
    s = s.replace(/&?\blt\s*;/g, '<')
    s = s.replace(/&?\bgt\s*;/g, '>')
  }
  // (2) Truncated entity tails at end-of-text ("...war&", "...Asia.&lt")
  // are removed; trailing punctuation is kept (and not duplicated when it
  // already precedes the fragment: "Asia.&lt." -> "Asia.").
  s = s.replace(/&(#x?[0-9a-fA-F]{0,7}|[a-zA-Z]{2,9})([.,;:!?)\]]*)\s*$/, (m, g, punct, off, str) => {
    if (g[0] !== '#' && !TRUNCATED_ENTITY_PREFIXES.has(g.toLowerCase())) return m
    const prev = str[off - 1]
    return prev && punct.startsWith(prev) ? punct.slice(1) : punct
  })
  s = s.replace(/&(\s*[.,;:!?)\]]*)$/, '$1') // bare trailing '&' ("war&." -> "war.")
  s = s.replace(/\s+/g, ' ').trim()
  return { text: s, imageUrl, imageAlt }
}
