// G1 — causal-edge golden suite: the pipeline three-way branch plus the
// live r5 guard semantics. Mutation proof: the r4 'amidst?' guard admits
// bare-'amid' evidence — the exact gate-round-3 finding.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { causalEvidence, temporalEvidence, decideEdge, guardAllows } from './harness/causal.mjs'

const fx = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'relationships.json'), 'utf8'),
)

test('pipeline branch classifies golden relationships correctly', () => {
  for (const c of fx.pipelineCases) {
    const causal = causalEvidence(c.text, c.sharedEntities ?? [])
    const temporal = causal ? null : temporalEvidence(c.text)
    const edge = decideEdge({ causal, temporal, hasCitation: c.hasCitation, citationPrimary: c.citationPrimary })
    if (c.expectEdge === null) {
      assert.equal(edge, null, `${c.name}: expected no relationship, got ${JSON.stringify(edge)}`)
      continue
    }
    assert.ok(edge, `${c.name}: expected ${c.expectEdge}, got none`)
    assert.equal(edge.type, c.expectEdge, `${c.name}: type`)
    if (c.expectEvidence) assert.equal(edge.evidence, c.expectEvidence, `${c.name}: evidence`)
    if (c.expectTemporal) assert.match(edge.label, new RegExp(c.expectTemporal, 'i'), `${c.name}: temporal label`)
    if (c.expectSignalSource) assert.equal(edge.signal_source, c.expectSignalSource, `${c.name}: signal_source`)
    if (c.expectLabel) assert.equal(edge.label, c.expectLabel, `${c.name}: label`)
    // every pipeline-produced edge must pass the live r5 guard:
    assert.ok(guardAllows(edge, 'r5'), `${c.name}: pipeline edge fails r5 guard`)
  }
})

test('r5 guard: golden causal passes, negatives rejected', () => {
  for (const c of fx.guardCases) {
    assert.equal(guardAllows(c.edge, 'r5'), c.expectR5, `${c.name}: r5 verdict wrong`)
  }
})

test('mutation proof: r4 guard admits bare-amid evidence (gate-round-3 bug)', () => {
  const c = fx.guardCases.find((x) => x.name === 'neg_amid_evidence_r4_bug')
  assert.equal(guardAllows(c.edge, 'r4'), c.expectR4, 'r4 behavior changed — update golden')
  assert.equal(guardAllows(c.edge, 'r5'), c.expectR5, 'r5 must reject')
  // the suite "fails" on the reintroduced bug in the sense that a negative
  // relationship the repair removed is allowed back in:
  assert.ok(guardAllows(c.edge, 'r4') && !guardAllows(c.edge, 'r5'))
})

test('deployed r4 parity: phrase-space guardCases match r4 verdicts too', () => {
  // Added 2026-08-10: the pre-repair mirror diverged from the DEPLOYED r4
  // alternation as well (not just r5). Every guardCase that carries an
  // expectR4 verdict must hold under the deployed r4 form.
  for (const c of fx.guardCases) {
    if (c.expectR4 === undefined || c.name === 'neg_amid_evidence_r4_bug') continue
    assert.equal(guardAllows(c.edge, 'r4'), c.expectR4, `${c.name}: r4 verdict wrong`)
  }
})
