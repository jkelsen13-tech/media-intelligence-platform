import { useEffect, useMemo, useRef, useState } from 'react'
import GraphView from '../graph/GraphView'
import TrustFooter from '../components/TrustFooter'
import {
  loadSpatialProjection,
  plotDecision,
  collectPositions,
  recordedTimestampsForRows,
  revisionAtTime,
  revisionCoverageAt,
  rowsMatchingSelection,
  graphNodeMatchingProjection,
  selectionStubFromProjection,
  labeledG2Dimensions,
  confidenceTextDimension,
  normalizeEvidenceRefs,
  inspectorAvailability,
  weatherPanelState,
  mayShowLocation,
  defaultStampIndex,
  autoSelectRow,
  graphSelectionId,
  sourceNativeTimeFields,
  sourceNativeLocationLabel,
  displayCoordinateText,
  inspectorTitle,
  mapViewBoxForPositions,
} from '../lib/spatialProjection'
import './worldview.css'

const MODES = [
  { key: 'map', label: 'Map' },
  { key: 'graph', label: 'Graph' },
  { key: 'split', label: 'Split' },
]

const MAP_W = 960
const MAP_H = 480

function lonLatToXy(lon, lat) {
  const x = ((Number(lon) + 180) / 360) * MAP_W
  const y = ((90 - Number(lat)) / 180) * MAP_H
  return { x, y }
}

function formatWhen(iso) {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return String(iso)
  return new Date(ms).toISOString().replace('.000Z', 'Z')
}

function Field({ label, value, empty = 'Unavailable' }) {
  const present = value != null && String(value).trim() !== ''
  return (
    <div className="wv-field">
      <dt>{label}</dt>
      <dd className={present ? undefined : 'wv-empty'}>{present ? String(value) : empty}</dd>
    </div>
  )
}

function Graticule() {
  const lines = []
  for (let lon = -180; lon <= 180; lon += 30) {
    const { x } = lonLatToXy(lon, 0)
    lines.push(<line key={`lon-${lon}`} x1={x} y1={0} x2={x} y2={MAP_H} />)
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    const { y } = lonLatToXy(0, lat)
    lines.push(<line key={`lat-${lat}`} x1={0} y1={y} x2={MAP_W} y2={y} />)
  }
  return (
    <g className="wv-graticule" aria-hidden="true">
      {lines}
    </g>
  )
}

function geometryPath(geom) {
  if (!geom) return []
  const t = geom.type
  if (t === 'LineString') {
    const d = (geom.coordinates ?? [])
      .map((c, i) => {
        const { x, y } = lonLatToXy(c[0], c[1])
        return `${i === 0 ? 'M' : 'L'}${x} ${y}`
      })
      .join(' ')
    return d ? [{ kind: 'path', d }] : []
  }
  if (t === 'Polygon') {
    const d = (geom.coordinates ?? [])
      .map((ring) =>
        (ring ?? [])
          .map((c, i) => {
            const { x, y } = lonLatToXy(c[0], c[1])
            return `${i === 0 ? 'M' : 'L'}${x} ${y}`
          })
          .join(' ') + ' Z',
      )
      .join(' ')
    return d ? [{ kind: 'path', d }] : []
  }
  if (t === 'MultiLineString') {
    return (geom.coordinates ?? []).flatMap((coords) => geometryPath({ type: 'LineString', coordinates: coords }))
  }
  if (t === 'MultiPolygon') {
    return (geom.coordinates ?? []).flatMap((coords) => geometryPath({ type: 'Polygon', coordinates: coords }))
  }
  if (t === 'GeometryCollection') {
    return (geom.geometries ?? []).flatMap((g) => geometryPath(g))
  }
  return []
}

function WorldMapCanvas({ rows, selectedKeys, onSelectRow, emptyMessage }) {
  const features = useMemo(() => {
    return (rows ?? []).flatMap((row) => {
      const decision = plotDecision(row)
      if (!decision.plot) return []
      const positions = collectPositions(decision.geometry)
      const selected =
        selectedKeys.has(String(row.mip_object_id)) || selectedKeys.has(String(row.subject_graph_node_id))
      return [
        {
          row,
          geometry: decision.geometry,
          positions,
          selected,
          label: sourceNativeLocationLabel(row),
          coords: displayCoordinateText(decision.geometry),
        },
      ]
    })
  }, [rows, selectedKeys])

  const viewBox = useMemo(() => {
    const positions = features.flatMap((f) => f.positions)
    const precision = features[0]?.row?.precision_class
    return mapViewBoxForPositions(positions, precision, MAP_W, MAP_H)
  }, [features])

  const markerR = Math.max(3.5, Math.min(viewBox.w, viewBox.h) * 0.045)
  const fontSize = Math.max(1.1, Math.min(viewBox.w, viewBox.h) * 0.055)
  const coordSize = fontSize * 0.75

  return (
    <div className="wv-map" role="img" aria-label="Spatial projection map. Only display_geometry from the live view is drawn.">
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className="wv-map-svg"
      >
        <rect className="wv-map-sea" x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} />
        <Graticule />
        {features.map((f) => {
          const paths = geometryPath(f.geometry)
          const id = String(f.row.revision_id ?? f.row.mip_object_id)
          return (
            <g
              key={id}
              className={`wv-feature${f.selected ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectRow(f.row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectRow(f.row)
                }
              }}
            >
              {paths.map((p, i) => (
                <path key={`${id}-p${i}`} d={p.d} />
              ))}
              {f.positions.map((c, i) => {
                const { x, y } = lonLatToXy(c[0], c[1])
                return (
                  <g key={`${id}-c${i}`}>
                    <circle cx={x} cy={y} r={markerR} />
                    <text
                      className="wv-map-label"
                      x={x + markerR * 1.4}
                      y={y - markerR * 0.2}
                      fontSize={fontSize}
                    >
                      {f.label || f.row.precision_class || 'projected location'}
                    </text>
                    {f.coords && (
                      <text
                        className="wv-map-coords num"
                        x={x + markerR * 1.4}
                        y={y + markerR * 1.1}
                        fontSize={coordSize}
                      >
                        {f.coords} · {f.row.precision_class} · {f.row.geometry_status}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
      {features.length === 0 && (
        <div className="wv-map-empty">
          <p>{emptyMessage}</p>
          <p className="wv-map-empty-sub">No map pins are fabricated.</p>
        </div>
      )}
    </div>
  )
}

function WeatherPanel() {
  const weather = weatherPanelState()
  return (
    <section className="wv-weather" aria-label="Weather">
      <header className="wv-section-head">
        <h3>Weather</h3>
        <span className="wv-pill wv-pill-empty">Unavailable</span>
      </header>
      <p className="wv-weather-copy">{weather.copy}</p>
      <dl className="wv-weather-grid">
        <Field label="Temperature" value={null} />
        <Field label="Precipitation" value={null} />
        <Field label="Wind speed" value={null} />
        <Field label="Wind direction" value={null} />
        <Field label="Provider" value={weather.provenance.provider} />
        <Field label="Timestamp" value={weather.provenance.timestamp} />
        <Field label="Resolution" value={weather.provenance.resolution} />
        <Field
          label="Observation type"
          value={weather.provenance.observationType}
          empty="Unavailable (observed / estimated / forecast / reanalysis not sourced)"
        />
      </dl>
    </section>
  )
}

function EventInspector({ loadStatus, selected, visibleRow, atMs }) {
  const coverage = visibleRow && Number.isFinite(atMs) ? revisionCoverageAt(visibleRow, atMs) : null
  const plot = visibleRow ? plotDecision(visibleRow) : { plot: false, reason: 'no_row', geometry: null }
  const availability = inspectorAvailability(visibleRow, { plot: plot.plot })
  const g2 = visibleRow ? labeledG2Dimensions(visibleRow) : []
  const confidence = visibleRow ? confidenceTextDimension(visibleRow) : null
  const refs = visibleRow ? normalizeEvidenceRefs(visibleRow.evidence_refs) : []
  const locationHidden = visibleRow && !mayShowLocation(visibleRow)

  let body
  if (loadStatus.status === 'unavailable') {
    body = (
      <p className="wv-empty-state">
        Spatial projection unavailable
        {loadStatus.error ? `: ${loadStatus.error}` : ` (${loadStatus.reason ?? 'client_not_configured'}).`}
        {' '}
        No location is inferred.
      </p>
    )
  } else if (loadStatus.status === 'empty') {
    body = (
      <p className="wv-empty-state">
        public.spatial_projection_v1 currently has no rows. World View stays empty until Spatial publishes a projection.
      </p>
    )
  } else if (!selected) {
    body = (
      <p className="wv-empty-state">No event selected. Choose a graph node or a projected location when one exists.</p>
    )
  } else if (!visibleRow) {
    body = (
      <p className="wv-empty-state">
        No spatial projection row matches this selection at the current recorded time. Historical state is not invented.
      </p>
    )
  } else if (coverage === 'time_not_recorded' && Number.isFinite(atMs)) {
    body = (
      <p className="wv-empty-state">
        This revision has no recorded valid-time bounds, so it is not attributed to the scrubbed instant.
      </p>
    )
  } else if (coverage === 'outside') {
    body = (
      <p className="wv-empty-state">No spatial state recorded at this time for the selected object.</p>
    )
  } else {
    const nativeFields = sourceNativeTimeFields(visibleRow.source_native_time)
    body = (
      <>
        {availability.state !== 'present' && (
          <p className={`wv-callout wv-callout-${availability.state}`}>{availability.label}</p>
        )}
        <h3 className="wv-inspector-title">{inspectorTitle(visibleRow, selected)}</h3>
        <dl className="wv-fields">
          <Field label="Display hint" value={visibleRow.display_hint} />
          <Field label="Object id" value={visibleRow.mip_object_id} />
          <Field label="Graph node" value={visibleRow.subject_graph_node_id} />
          <Field label="Object type" value={visibleRow.object_type} />
          <Field label="Spatial role" value={visibleRow.spatial_role} />
          <Field label="Relationship qualifier" value={visibleRow.relationship_qualifier} empty="No source relationship recorded" />
          <Field label="Valid from (UTC)" value={formatWhen(visibleRow.valid_from_utc)} />
          <Field label="Valid to (UTC)" value={formatWhen(visibleRow.valid_to_utc)} />
          <Field label="Valid-time precision" value={visibleRow.valid_time_precision} />
          <Field label="Precision class" value={visibleRow.precision_class} />
          <Field
            label="Location (display_geometry only)"
            value={
              locationHidden
                ? null
                : plot.plot
                  ? `${visibleRow.precision_class || 'unspecified'} · ${displayCoordinateText(plot.geometry)}`
                  : null
            }
            empty={locationHidden ? 'Precise location withheld (private person)' : 'Location unavailable'}
          />
          <Field label="Canonical place id" value={visibleRow.canonical_place_id} />
          <Field label="Geometry status" value={visibleRow.geometry_status} />
          <Field label="Review state" value={visibleRow.review_state} />
          <Field label="Release state" value={visibleRow.release_state} />
          <Field label="Review effective (UTC)" value={formatWhen(visibleRow.review_effective_at_utc)} />
          <Field label="Release effective (UTC)" value={formatWhen(visibleRow.release_effective_at_utc)} />
          <Field label="Uncertainty class" value={visibleRow.uncertainty_class} />
          <Field label="Uncertainty note" value={visibleRow.uncertainty_note} />
          <Field label="Confidence status" value={visibleRow.confidence_status} />
        </dl>

        {confidence && (
          <section className="wv-g2">
            <h4>Confidence (not a truth or bias score)</h4>
            <Field label={confidence.label} value={confidence.value} empty={confidence.unavailable} />
          </section>
        )}

        <section className="wv-g2">
          <h4>G2 dimensions (separate; never combined)</h4>
          <dl className="wv-fields">
            {g2.map((dim) => (
              <Field key={dim.key} label={dim.label} value={dim.value} empty={dim.unavailable} />
            ))}
          </dl>
        </section>

        <section className="wv-evidence">
          <h4>Source-native time (as recorded)</h4>
          {nativeFields.length === 0 ? (
            <p className="wv-empty">No source_native_time on this row.</p>
          ) : (
            <dl className="wv-fields">
              {nativeFields.map((f) =>
                f.key === 'source_url' && f.value ? (
                  <div className="wv-field" key={f.key}>
                    <dt>{f.key}</dt>
                    <dd>
                      <a href={f.value} target="_blank" rel="noreferrer">
                        {f.value}
                      </a>
                    </dd>
                  </div>
                ) : (
                  <Field key={f.key} label={f.key} value={f.value} />
                ),
              )}
            </dl>
          )}
        </section>

        <section className="wv-evidence">
          <h4>Evidence refs</h4>
          {refs.length === 0 ? (
            <p className="wv-empty">No evidence_refs on this row.</p>
          ) : (
            <ul>
              {refs.map((ref, i) => (
                <li key={i} className="num">
                  {typeof ref === 'string' ? ref : JSON.stringify(ref)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="wv-context">
          <h4>Tags / context</h4>
          <p className="wv-meta">
            Only fields present on the projection row are shown. No topical tags are inferred.
          </p>
          <ul className="wv-tags">
            {[visibleRow.object_type, visibleRow.spatial_role, visibleRow.precision_class, sourceNativeLocationLabel(visibleRow)]
              .filter((t) => t && String(t).trim())
              .map((t) => (
                <li key={t}>{t}</li>
              ))}
          </ul>
          {![visibleRow.object_type, visibleRow.spatial_role, visibleRow.precision_class, sourceNativeLocationLabel(visibleRow)].some(
            (t) => t && String(t).trim(),
          ) && <p className="wv-empty">No context tags recorded.</p>}
        </section>
      </>
    )
  }

  return (
    <aside className="wv-inspector" aria-label="Selected-event inspector">
      <header className="wv-section-head">
        <h2>Inspector</h2>
      </header>
      {body}
    </aside>
  )
}

function TimelineScrubber({ stamps, index, onChange, disabledReason }) {
  if (!stamps.length) {
    return (
      <section className="wv-scrubber" aria-label="Projection time">
        <header className="wv-section-head">
          <h3>Recorded time</h3>
        </header>
        <p className="wv-empty">{disabledReason}</p>
      </section>
    )
  }
  const current = stamps[index] ?? stamps[stamps.length - 1]
  return (
    <section className="wv-scrubber" aria-label="Projection time">
      <header className="wv-section-head">
        <h3>Recorded time</h3>
        <span className="wv-meta num">{current?.iso}</span>
      </header>
      <p className="wv-meta">
        Scrubber snaps to timestamps recorded on the projection. Intermediate history is not interpolated.
      </p>
      <input
        type="range"
        min={0}
        max={stamps.length - 1}
        step={1}
        value={Math.min(index, stamps.length - 1)}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={current?.iso}
      />
      <p className="wv-meta">Source field: {current?.key}</p>
    </section>
  )
}

export default function WorldView({
  graph,
  graphError,
  selected,
  onSelectProjection,
  onSelectGraphNode,
}) {
  const [mode, setMode] = useState('map')
  const [loadStatus, setLoadStatus] = useState({
    status: 'loading',
    reason: null,
    rows: [],
    error: null,
    loadedAt: null,
  })
  const [stampIndex, setStampIndex] = useState(0)
  const didAutoSelect = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadSpatialProjection().then((result) => {
      if (!cancelled) setLoadStatus(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedRows = useMemo(
    () => rowsMatchingSelection(loadStatus.rows, selected),
    [loadStatus.rows, selected],
  )
  const stamps = useMemo(() => recordedTimestampsForRows(selectedRows), [selectedRows])

  useEffect(() => {
    setStampIndex(defaultStampIndex(stamps, selectedRows))
  }, [stamps, selectedRows])

  useEffect(() => {
    if (loadStatus.status !== 'ok' || loadStatus.rows.length === 0) return
    const row = autoSelectRow(loadStatus.rows)
    if (!row) return
    const node = graphNodeMatchingProjection(graph?.nodes, row)
    if (!didAutoSelect.current) {
      didAutoSelect.current = true
      if (!selected) onSelectProjection(node ?? selectionStubFromProjection(row))
      return
    }
    if (selected?.fromSpatialProjection && node) {
      onSelectProjection(node)
    }
  }, [loadStatus, graph, selected, onSelectProjection])

  const atMs = stamps[stampIndex]?.ms ?? null
  const visibleRow = Number.isFinite(atMs)
    ? revisionAtTime(selectedRows, atMs)
    : selectedRows.length
      ? [...selectedRows].sort((a, b) => (a.revision_ordinal ?? 0) - (b.revision_ordinal ?? 0)).at(-1)
      : null

  const mapRows = useMemo(() => {
    if (loadStatus.status !== 'ok') return []
    if (selected && selectedRows.length > 0) {
      return visibleRow ? [visibleRow] : []
    }
    return loadStatus.rows.filter((row) => plotDecision(row).plot)
  }, [loadStatus, selected, selectedRows, visibleRow])

  const selectedKeys = useMemo(() => {
    const keys = new Set()
    if (selected?.id) keys.add(String(selected.id))
    if (selected?.slug) keys.add(String(selected.slug))
    if (selected?.mip_object_id) keys.add(String(selected.mip_object_id))
    if (selected?.subject_graph_node_id) keys.add(String(selected.subject_graph_node_id))
    if (visibleRow?.mip_object_id) keys.add(String(visibleRow.mip_object_id))
    if (visibleRow?.subject_graph_node_id) keys.add(String(visibleRow.subject_graph_node_id))
    return keys
  }, [selected, visibleRow])

  const emptyMessage =
    loadStatus.status === 'unavailable'
      ? 'Spatial projection unavailable — nothing is drawn.'
      : loadStatus.status === 'empty'
        ? 'No spatial projection rows. The map stays empty.'
        : selected && selectedRows.length === 0
          ? 'This selection has no spatial projection row.'
          : selected && !visibleRow
            ? 'No spatial state recorded at this time.'
            : 'No display_geometry available to plot.'

  const handleMapSelect = (row) => {
    const node = graphNodeMatchingProjection(graph?.nodes, row)
    onSelectProjection(node ?? selectionStubFromProjection(row), row)
  }

  const showMap = mode === 'map' || mode === 'split'
  const showGraph = mode === 'graph' || mode === 'split'

  return (
    <div className="wv-view">
      <header className="wv-banner">
        <div>
          <h2>World View</h2>
          <p>
            Launch-minimum map of <code>public.spatial_projection_v1</code>. Geometry is drawn only from
            {' '}<code>display_geometry</code>. Graph, Map, and Split share one selected object id.
          </p>
        </div>
        <div className="wv-mode" role="tablist" aria-label="World View mode">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={mode === m.key}
              className={`wv-mode-btn${mode === m.key ? ' active' : ''}`}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      {loadStatus.status === 'loading' && <p className="wv-meta">Loading spatial projection…</p>}

      <div className={`wv-stage wv-stage-${mode}`}>
        {showMap && (
          <WorldMapCanvas
            rows={mapRows}
            selectedKeys={selectedKeys}
            onSelectRow={handleMapSelect}
            emptyMessage={emptyMessage}
          />
        )}
        {showGraph && (
          <div className="wv-graph">
            {graphError && <p className="wv-empty-state">Graph failed to load: {graphError}</p>}
            {!graph && !graphError && <p className="wv-meta">Loading graph…</p>}
            {graph && (
              <GraphView
                nodes={graph.nodes}
                edges={graph.edges}
                onSelect={onSelectGraphNode}
                panelOpen={false}
                selectedId={graphSelectionId(selected)}
              />
            )}
          </div>
        )}
        <EventInspector
          loadStatus={loadStatus}
          selected={selected}
          visibleRow={visibleRow}
          atMs={atMs}
        />
      </div>

      <TimelineScrubber
        stamps={stamps}
        index={stampIndex}
        onChange={setStampIndex}
        disabledReason={
          loadStatus.status === 'empty'
            ? 'No projection rows, so there is no recorded time to scrub.'
            : selected
              ? 'No recorded timestamps on the matching projection rows.'
              : 'Select an object that has a spatial projection to scrub recorded time.'
        }
      />

      <WeatherPanel />

      <TrustFooter
        left={
          loadStatus.loadedAt
            ? `Projection read at ${loadStatus.loadedAt} · ${loadStatus.rows.length} row(s)`
            : 'Projection not loaded'
        }
        reviewedAt={visibleRow?.review_effective_at_utc ?? null}
      />
    </div>
  )
}
