// R4 World View launch-minimum — unit pins for public.spatial_projection_v1.
//
// Browser matrix (documented; CI runs these unit paths):
//   empty view     — loadSpatialProjection returns status 'empty'; UI must
//                    show explicit empty/unavailable, zero pins.
//   row-present    — MOCK fixture below is injected into the loader fake
//                    only. It is never imported by the UI and is not a live
//                    public event.
//   client missing — status 'unavailable', reason 'client_not_configured'.
//
// Do not treat MOCK_* as live Cleveland / Gulf Coast / Fort Campbell data.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SPATIAL_PROJECTION_COLUMNS,
  SPATIAL_PROJECTION_TABLE,
  PRECISION_CLASS_ORDER,
  G2_DIMENSIONS,
  loadSpatialProjection,
  parseDisplayGeometry,
  plotDecision,
  mayShowLocation,
  isPrivatePersonObject,
  isFinerThanCity,
  markerRadiusForPrecision,
  revisionCoverageAt,
  revisionAtTime,
  recordedTimestampsForRows,
  rowsMatchingSelection,
  graphNodeMatchingProjection,
  selectionStubFromProjection,
  labeledG2Dimensions,
  confidenceTextDimension,
  normalizeEvidenceRefs,
  inspectorAvailability,
  weatherPanelState,
  defaultStampIndex,
  autoSelectRow,
  graphSelectionId,
  sourceNativeTimeFields,
  inspectorTitle,
  displayCoordinateText,
} from '../src/lib/spatialProjection.js'

function fakePostgrest(tables, { error } = {}) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])]
      const state = { limit: null }
      const q = {
        select: () => q,
        eq: (c, v) => {
          rows = rows.filter((r) => r[c] === v)
          return q
        },
        gt: (c, v) => {
          rows = rows.filter((r) => String(r[c]) > String(v))
          return q
        },
        order: (c, { ascending = true } = {}) => {
          rows = [...rows].sort(
            (a, b) =>
              (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : String(a[c] ?? '') > String(b[c] ?? '') ? 1 : 0) *
              (ascending ? 1 : -1),
          )
          return q
        },
        limit: (n) => {
          state.limit = n
          return q
        },
        then: (resolve) => {
          if (error) return resolve({ data: null, error })
          let r = rows
          if (state.limit) r = r.slice(0, state.limit)
          resolve({ data: r, error: null })
        },
      }
      return q
    },
  }
}

// Synthetic row matching the live column contract. Coordinates are arbitrary
// fixture numbers — not a real place, not loaded by the UI.
const MOCK_CITY_ROW = Object.freeze({
  projection_contract_version: 'spatial_projection_v1',
  mip_object_id: '00000000-0000-4000-8000-000000000001',
  object_type: 'event',
  subject_graph_node_id: '00000000-0000-4000-8000-0000000000aa',
  subject_snapshot_hash: 'hash-a',
  revision_id: '00000000-0000-4000-8000-000000000101',
  revision_ordinal: 1,
  superseded_by_revision_id: null,
  spatial_role: 'occurred_at',
  relationship_qualifier: 'reported_at',
  canonical_place_id: '00000000-0000-4000-8000-0000000000cc',
  place_snapshot_hash: 'hash-p',
  precision_class: 'city',
  valid_time_precision: 'day',
  source_native_time: null,
  valid_from_utc: '2024-04-08T00:00:00Z',
  valid_to_utc: '2024-04-09T00:00:00Z',
  revision_known_at_utc: '2024-04-08T12:00:00Z',
  review_effective_at_utc: '2024-04-08T12:00:00Z',
  release_effective_at_utc: '2024-04-08T12:00:00Z',
  review_state: 'reviewed',
  release_state: 'released',
  uncertainty_class: 'U2',
  uncertainty_note: 'City class only',
  confidence: 'corroborated',
  confidence_status: 'recorded',
  display_hint: 'mock-city-precision-fixture',
  display_geometry: { type: 'Point', coordinates: [12.34, 56.78] },
  geometry_status: 'ok',
  evidence_refs: [{ kind: 'fixture', id: 'ev-1' }],
})

test('column contract matches the live view and invents no extras', () => {
  assert.equal(SPATIAL_PROJECTION_TABLE, 'spatial_projection_v1')
  assert.deepEqual([...SPATIAL_PROJECTION_COLUMNS], [
    'projection_contract_version',
    'mip_object_id',
    'object_type',
    'subject_graph_node_id',
    'subject_snapshot_hash',
    'revision_id',
    'revision_ordinal',
    'superseded_by_revision_id',
    'spatial_role',
    'relationship_qualifier',
    'canonical_place_id',
    'place_snapshot_hash',
    'precision_class',
    'valid_time_precision',
    'source_native_time',
    'valid_from_utc',
    'valid_to_utc',
    'revision_known_at_utc',
    'review_effective_at_utc',
    'release_effective_at_utc',
    'review_state',
    'release_state',
    'uncertainty_class',
    'uncertainty_note',
    'confidence',
    'confidence_status',
    'display_hint',
    'display_geometry',
    'geometry_status',
    'evidence_refs',
  ])
  assert.ok(!SPATIAL_PROJECTION_COLUMNS.includes('weather'))
  assert.ok(!SPATIAL_PROJECTION_COLUMNS.includes('temperature'))
})

test('empty view → status empty, no rows', async () => {
  const result = await loadSpatialProjection({
    supabaseClient: fakePostgrest({ spatial_projection_v1: [] }),
  })
  assert.equal(result.status, 'empty')
  assert.equal(result.reason, 'zero_rows')
  assert.deepEqual(result.rows, [])
})

test('missing client → unavailable, never demo spatial data', async () => {
  const result = await loadSpatialProjection({ supabaseClient: null })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.reason, 'client_not_configured')
  assert.deepEqual(result.rows, [])
})

test('read error → unavailable with the error message', async () => {
  const result = await loadSpatialProjection({
    supabaseClient: fakePostgrest({}, { error: { message: 'relation does not exist' } }),
  })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.reason, 'read_error')
  assert.match(result.error, /relation does not exist/)
  assert.equal(result.rows.length, 0)
})

test('mocked row-present path returns the fixture and nothing else', async () => {
  const result = await loadSpatialProjection({
    supabaseClient: fakePostgrest({ spatial_projection_v1: [MOCK_CITY_ROW] }),
  })
  assert.equal(result.status, 'ok')
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].mip_object_id, MOCK_CITY_ROW.mip_object_id)
  assert.equal(result.rows[0].precision_class, 'city')
  assert.deepEqual(result.rows[0].display_geometry, MOCK_CITY_ROW.display_geometry)
})

test('plot uses display_geometry only; missing geometry is not invented', () => {
  const plotted = plotDecision(MOCK_CITY_ROW)
  assert.equal(plotted.plot, true)
  assert.deepEqual(plotted.geometry, { type: 'Point', coordinates: [12.34, 56.78] })

  const noGeom = plotDecision({ ...MOCK_CITY_ROW, display_geometry: null })
  assert.equal(noGeom.plot, false)
  assert.equal(noGeom.reason, 'no_display_geometry')

  const withheld = plotDecision({ ...MOCK_CITY_ROW, geometry_status: 'withheld' })
  assert.equal(withheld.plot, false)
  assert.equal(withheld.reason, 'geometry_status_withheld')
})

test('private-person precise location is never plottable', () => {
  assert.equal(isPrivatePersonObject('person'), true)
  assert.equal(isFinerThanCity('facility'), true)
  assert.equal(isFinerThanCity('city'), false)
  const personFacility = {
    ...MOCK_CITY_ROW,
    object_type: 'person',
    precision_class: 'facility',
  }
  assert.equal(mayShowLocation(personFacility), false)
  assert.equal(plotDecision(personFacility).reason, 'private_person_precise')
  const personCity = { ...MOCK_CITY_ROW, object_type: 'person', precision_class: 'city' }
  assert.equal(mayShowLocation(personCity), true)
  const personUnknown = { ...MOCK_CITY_ROW, object_type: 'person', precision_class: null }
  assert.equal(mayShowLocation(personUnknown), false)
})

test('precision class order is country → region → city → area → facility', () => {
  assert.deepEqual([...PRECISION_CLASS_ORDER], ['country', 'region', 'city', 'area', 'facility'])
  assert.ok(markerRadiusForPrecision('country') > markerRadiusForPrecision('city'))
  assert.ok(markerRadiusForPrecision('city') > markerRadiusForPrecision('facility'))
})

test('time scrub does not invent coverage when bounds are missing or outside', () => {
  const during = Date.parse('2024-04-08T12:00:00Z')
  const before = Date.parse('2024-04-07T00:00:00Z')
  const after = Date.parse('2024-04-10T00:00:00Z')
  assert.equal(revisionCoverageAt(MOCK_CITY_ROW, during), 'covers')
  assert.equal(revisionCoverageAt(MOCK_CITY_ROW, before), 'outside')
  assert.equal(revisionCoverageAt(MOCK_CITY_ROW, after), 'outside')
  assert.equal(
    revisionCoverageAt({ ...MOCK_CITY_ROW, valid_from_utc: null, valid_to_utc: null }, during),
    'time_not_recorded',
  )
  assert.equal(revisionAtTime([MOCK_CITY_ROW], before), null)
  assert.equal(revisionAtTime([MOCK_CITY_ROW], during)?.revision_id, MOCK_CITY_ROW.revision_id)
})

test('later revision_ordinal wins when two rows cover the same instant', () => {
  const later = { ...MOCK_CITY_ROW, revision_id: 'rev-2', revision_ordinal: 2 }
  const hit = revisionAtTime([MOCK_CITY_ROW, later], Date.parse('2024-04-08T12:00:00Z'))
  assert.equal(hit.revision_id, 'rev-2')
})

test('recorded timestamps are the stored instants only', () => {
  const stamps = recordedTimestampsForRows([MOCK_CITY_ROW])
  assert.ok(stamps.every((t) => Number.isFinite(t.ms)))
  assert.ok(stamps.some((t) => t.key === 'valid_from_utc'))
  assert.ok(!stamps.some((t) => t.key === 'invented'))
})

test('selection matches mip_object_id or subject_graph_node_id', () => {
  const byObject = rowsMatchingSelection([MOCK_CITY_ROW], { id: MOCK_CITY_ROW.mip_object_id })
  const byNode = rowsMatchingSelection([MOCK_CITY_ROW], { id: MOCK_CITY_ROW.subject_graph_node_id })
  const miss = rowsMatchingSelection([MOCK_CITY_ROW], { id: 'nope' })
  assert.equal(byObject.length, 1)
  assert.equal(byNode.length, 1)
  assert.equal(miss.length, 0)
  const graphNode = graphNodeMatchingProjection(
    [{ id: MOCK_CITY_ROW.subject_graph_node_id, label: 'Graph event' }],
    MOCK_CITY_ROW,
  )
  assert.equal(graphNode.label, 'Graph event')
  const stub = selectionStubFromProjection(MOCK_CITY_ROW)
  assert.equal(stub.fromSpatialProjection, true)
  assert.equal(stub.id, MOCK_CITY_ROW.mip_object_id)
  assert.equal(stub.label, 'mock-city-precision-fixture')
})

test('G2 dimensions stay separate; confidence text is not a composite score', () => {
  const dims = labeledG2Dimensions(MOCK_CITY_ROW)
  assert.equal(dims.length, 6)
  assert.deepEqual(
    dims.map((d) => d.key),
    G2_DIMENSIONS.map((d) => d.key),
  )
  assert.ok(dims.every((d) => 'value' in d && 'unavailable' in d))
  const conf = confidenceTextDimension(MOCK_CITY_ROW)
  assert.equal(conf.value, 'corroborated')
  assert.match(conf.label, /not a composite score/)
  const empty = labeledG2Dimensions({})
  assert.ok(empty.every((d) => d.value == null && d.unavailable))
})

test('weather is always unavailable with provenance slots empty', () => {
  const w = weatherPanelState()
  assert.equal(w.status, 'unavailable')
  assert.equal(w.reason, 'no_authorized_weather_path')
  assert.equal(w.fields.temperature, null)
  assert.equal(w.fields.precipitation, null)
  assert.equal(w.fields.windSpeed, null)
  assert.equal(w.fields.windDirection, null)
  assert.equal(w.provenance.provider, null)
  assert.equal(w.provenance.observationType, null)
  assert.doesNotMatch(w.copy.toLowerCase(), /caused|due to wind|spread because/)
})

test('evidence refs and inspector empty/insufficient states', () => {
  assert.deepEqual(normalizeEvidenceRefs(MOCK_CITY_ROW.evidence_refs), [{ kind: 'fixture', id: 'ev-1' }])
  assert.equal(inspectorAvailability(null).state, 'empty')
  assert.equal(
    inspectorAvailability({ ...MOCK_CITY_ROW, display_geometry: null }).state,
    'insufficient_evidence',
  )
  assert.equal(
    inspectorAvailability({ ...MOCK_CITY_ROW, object_type: 'person', precision_class: 'facility' }).state,
    'withheld',
  )
  assert.equal(inspectorAvailability(MOCK_CITY_ROW).state, 'present')
})

test('GeoJSON Feature is unwrapped; invalid JSON is not plotted', () => {
  const fromFeature = parseDisplayGeometry({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [1, 2] },
  })
  assert.deepEqual(fromFeature, { type: 'Point', coordinates: [1, 2] })
  assert.equal(parseDisplayGeometry('not-json'), null)
  assert.equal(parseDisplayGeometry({ type: 'Point' }), null)
})

test('UI and loader never import demoData spatial events', () => {
  const spatialSrc = readFileSync(new URL('../src/lib/spatialProjection.js', import.meta.url), 'utf8')
  const worldSrc = readFileSync(new URL('../src/views/WorldView.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(spatialSrc, /demoData/)
  assert.doesNotMatch(worldSrc, /demoData/)
  assert.doesNotMatch(worldSrc, /Port Meridian|Gulf Coast|Fort Campbell|Cleveland/)
  assert.doesNotMatch(spatialSrc, /Port Meridian|Gulf Coast|Fort Campbell|Cleveland/)
})

test('paused original project is not a supabase.js fallback', () => {
  const client = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
  const urlLine = client.split('\n').find((l) => l.includes('const url ='))
  const keyLine = client.split('\n').find((l) => l.includes('const anonKey ='))
  assert.ok(urlLine && urlLine.includes('VITE_SUPABASE_URL'))
  assert.ok(keyLine && keyLine.includes('VITE_SUPABASE_ANON_KEY'))
  assert.doesNotMatch(urlLine, /niejaejtbxgakyrsntxm|yhbwnrtlqbjtcrrlpbge/)
  assert.doesNotMatch(keyLine, /niejaejtbxgakyrsntxm|yhbwnrtlqbjtcrrlpbge|sb_publishable_|eyJ/)
  assert.doesNotMatch(client, /https:\/\/niejaejtbxgakyrsntxm/)
  assert.doesNotMatch(client, /https:\/\/yhbwnrtlqbjtcrrlpbge/)
})

test('App wires World View into the existing selected-node seam', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /view === 'world'/)
  assert.match(app, /from '\.\/views\/WorldView'/)
  assert.match(app, /selected=\{selected\}/)
  assert.match(app, /onSelectGraphNode=\{handleSelect\}/)
  assert.match(app, /selectedId=\{graphSelectionId\(selected\)\}/)
  assert.match(app, /handleSelectProjection/)
})

// Contract pin for the live V2 row shape (2026-09-03). Used only as a unit
// fixture — World View still reads the live view, never this object.
const LIVE_CONTRACT_ROW = Object.freeze({
  projection_contract_version: 'spatial_projection_v1',
  mip_object_id: '777b3951-4a82-4dd7-befb-958991b1318f',
  object_type: 'event_spatial_relationship',
  subject_graph_node_id: 'acc55cb2-5ac2-4aed-be36-3f576d2bc443',
  revision_id: '9bf5c497-0c36-4307-9940-541265a94b0d',
  revision_ordinal: 1,
  spatial_role: 'event',
  relationship_qualifier: 'none',
  canonical_place_id: '6034fc7e-b6ab-42b4-8c52-85421bd0d42c',
  precision_class: 'city',
  valid_time_precision: 'range',
  source_native_time: Object.freeze({
    calendar_date: '2024-04-08',
    location_label: 'Cleveland, Ohio',
    source_url: 'https://science.nasa.gov/eclipses/future-eclipses/eclipse-2024/where-when/',
    timezone: 'EDT',
    partial_begins: '1:59 p.m. EDT',
    totality_begins: '3:13 p.m. EDT',
    maximum: '3:15 p.m. EDT',
    totality_ends: '3:17 p.m. EDT',
    partial_ends: '4:29 p.m. EDT',
  }),
  valid_from_utc: '2024-04-08 17:59:00+00',
  valid_to_utc: '2024-04-08 20:29:00+00',
  revision_known_at_utc: '2026-09-03 01:50:15.865651+00',
  review_state: 'operative',
  release_state: 'released',
  uncertainty_class: null,
  uncertainty_note: 'NASA looking-back article states Cleveland partial ended 4:28 PM',
  confidence: null,
  confidence_status: 'unsupported_by_governed_model',
  display_hint: 'event_location',
  display_geometry: Object.freeze({ type: 'Point', coordinates: [-81.7, 41.4] }),
  geometry_status: 'coarsened_to_precision_class',
  evidence_refs: Object.freeze([{ evidence_role: 'primary_support', evidence_snapshot_id: 'c05b4eed-d260-4e27-a029-bac330ef21e9' }]),
})

test('live-shaped city row is plottable at coarsened [-81.7, 41.4], never finer lat/lon', () => {
  const plotted = plotDecision(LIVE_CONTRACT_ROW)
  assert.equal(plotted.plot, true)
  assert.deepEqual(plotted.geometry.coordinates, [-81.7, 41.4])
  assert.notDeepEqual(plotted.geometry.coordinates, [-81.6954, 41.4995])
  assert.notDeepEqual(plotted.geometry.coordinates, [-81.6954, 41.4993])
  assert.equal(displayCoordinateText(plotted.geometry), '[-81.7, 41.4]')
  assert.equal(LIVE_CONTRACT_ROW.geometry_status, 'coarsened_to_precision_class')
  assert.equal(inspectorAvailability(LIVE_CONTRACT_ROW).state, 'present')
})

test('default stamp is inside the valid interval, not exclusive valid_to or later audit time', () => {
  const stamps = recordedTimestampsForRows([LIVE_CONTRACT_ROW])
  assert.ok(!stamps.some((t) => t.key === 'source_native_time'))
  const idx = defaultStampIndex(stamps, [LIVE_CONTRACT_ROW])
  const picked = stamps[idx]
  assert.equal(revisionCoverageAt(LIVE_CONTRACT_ROW, picked.ms), 'covers')
  assert.equal(picked.key, 'valid_from_utc')
  assert.equal(revisionAtTime([LIVE_CONTRACT_ROW], Date.parse('2024-04-08T20:29:00Z')), null)
  assert.equal(revisionAtTime([LIVE_CONTRACT_ROW], Date.parse('2026-09-03T01:50:15Z')), null)
})

test('auto-selects the unique live object; graph id prefers subject_graph_node_id', () => {
  assert.equal(autoSelectRow([LIVE_CONTRACT_ROW]).mip_object_id, LIVE_CONTRACT_ROW.mip_object_id)
  assert.equal(autoSelectRow([]), null)
  assert.equal(
    autoSelectRow([LIVE_CONTRACT_ROW, { ...LIVE_CONTRACT_ROW, mip_object_id: 'other' }]),
    null,
  )
  const stub = { id: LIVE_CONTRACT_ROW.mip_object_id, subject_graph_node_id: LIVE_CONTRACT_ROW.subject_graph_node_id }
  assert.equal(graphSelectionId(stub), LIVE_CONTRACT_ROW.subject_graph_node_id)
})

test('source_native_time NASA table is provenance, not weather, and titles from location_label', () => {
  const fields = sourceNativeTimeFields(LIVE_CONTRACT_ROW.source_native_time)
  assert.ok(fields.some((f) => f.key === 'location_label' && f.value === 'Cleveland, Ohio'))
  assert.ok(fields.some((f) => f.key === 'source_url' && /science.nasa.gov/.test(f.value)))
  assert.equal(inspectorTitle(LIVE_CONTRACT_ROW, { fromSpatialProjection: true }), 'Cleveland, Ohio')
  const weather = weatherPanelState()
  assert.equal(weather.status, 'unavailable')
})
