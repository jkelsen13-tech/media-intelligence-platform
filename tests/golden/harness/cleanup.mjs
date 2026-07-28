// G1 harness — cleanup detection. Mirrors the cleanup monitor semantics:
// probe/fixture/backfill rows from gate rounds and remediation passes must
// never persist in production tables. The detector is deliberately precise:
// journalism uses of 'probe' (an investigation) are NOT probes.

const PATTERNS = [
  /\bgate\b[^a-z]{0,12}\b(round\s*\d+\b[^a-z]{0,12})?\bprobe\b/i,
  /\bprobe\b[^a-z]{0,12}\bgate\b/i,
  /\bbackfill\b/i,
  /\bfixture\b/i,
  /\bprobe[-\s]?(causal|test|node|edge|validation|row|fixture)/i,
  /\b(causal|test|node|edge|validation|round)[-\s]?probe\b/i,
  /\br\d+\s+(validation|verification)\s+probe\b/i,
]

// KNOWN BUG variant: bare 'probe' matches journalism headlines too — the
// detector over-flags and the golden clean row fails.
const PATTERNS_BUG = [/\bprobe\b/i, /\bbackfill\b/i, /\bfixture\b/i]

export function isProbeRow(row, { variant = 'repaired' } = {}) {
  const hay = [row.label, row.slug].filter(Boolean).join(' ')
  const patterns = variant === 'bare-probe-regex' ? PATTERNS_BUG : PATTERNS
  return patterns.some((re) => re.test(hay))
}
