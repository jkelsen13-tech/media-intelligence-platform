import { useCallback, useEffect, useRef } from 'react'

// Virtual joystick for one-handed pan/zoom of the cytoscape canvas.
// Dragging the nub pans the view continuously (speed proportional to
// deflection, capped at MAX_SPEED px/frame); the + / − pair above the
// base zooms around the viewport center. Rendered bottom-right in the
// graph floating layer on all viewport sizes (harmless on desktop —
// mouse users still get a precise zoom control). The container captures
// its own pointer events (touch-action: none + stopPropagation +
// setPointerCapture) so touches never reach cytoscape's pinch/drag.
//
// `dimmed` fades and disables the control while a mobile bottom sheet
// (article/policy panel) is open so it never sits under the sheet's
// drag-handle zone.

const BASE_SIZE = 72
const NUB_SIZE = 28
const MAX_DEFLECT = (BASE_SIZE - NUB_SIZE) / 2 // 22px nub travel
const MAX_SPEED = 14 // px per frame at full deflection
const ZOOM_IN = 1.25
const ZOOM_OUT = 0.8
const ZOOM_MS = 150

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export default function PanJoystick({ cyRef, dimmed = false }) {
  const baseRef = useRef(null)
  const nubRef = useRef(null)
  const pointerIdRef = useRef(null)
  const vecRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef(0)

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    vecRef.current = { x: 0, y: 0 }
  }, [])

  const tick = useCallback(() => {
    const cy = cyRef.current
    const v = vecRef.current
    if (!cy || cy.destroyed() || (v.x === 0 && v.y === 0)) {
      rafRef.current = 0
      return
    }
    cy.panBy({ x: v.x, y: v.y })
    rafRef.current = requestAnimationFrame(tick)
  }, [cyRef])

  const applyVector = useCallback(
    (clientX, clientY) => {
      const base = baseRef.current
      const nub = nubRef.current
      if (!base || !nub) return
      const rect = base.getBoundingClientRect()
      let dx = clientX - (rect.left + rect.width / 2)
      let dy = clientY - (rect.top + rect.height / 2)
      const dist = Math.hypot(dx, dy)
      if (dist > MAX_DEFLECT) {
        dx = (dx / dist) * MAX_DEFLECT
        dy = (dy / dist) * MAX_DEFLECT
      }
      nub.style.transform = `translate(${dx}px, ${dy}px)`
      // Speed scales linearly with deflection; dragging right pans the
      // view right (content follows the finger, like canvas drag-pan).
      vecRef.current = {
        x: (dx / MAX_DEFLECT) * MAX_SPEED,
        y: (dy / MAX_DEFLECT) * MAX_SPEED,
      }
      if (!rafRef.current) rafRef.current = requestAnimationFrame(tick)
    },
    [tick],
  )

  const onPointerDown = useCallback(
    (e) => {
      if (dimmed) return
      e.stopPropagation()
      e.preventDefault()
      pointerIdRef.current = e.pointerId
      baseRef.current?.setPointerCapture(e.pointerId)
      // No spring-back transition while dragging.
      nubRef.current?.classList.add('dragging')
      applyVector(e.clientX, e.clientY)
    },
    [applyVector, dimmed],
  )

  const onPointerMove = useCallback(
    (e) => {
      if (e.pointerId !== pointerIdRef.current) return
      e.stopPropagation()
      applyVector(e.clientX, e.clientY)
    },
    [applyVector],
  )

  const endDrag = useCallback(
    (e) => {
      if (e.pointerId !== pointerIdRef.current) return
      e.stopPropagation()
      pointerIdRef.current = null
      stopLoop()
      const nub = nubRef.current
      if (nub) {
        nub.classList.remove('dragging') // re-enables the 120ms spring
        nub.style.transform = 'translate(0px, 0px)'
      }
    },
    [stopLoop],
  )

  // Cancel any in-flight pan if the component unmounts or dims.
  useEffect(() => stopLoop, [stopLoop])
  useEffect(() => {
    if (dimmed) {
      stopLoop()
      const nub = nubRef.current
      if (nub) {
        nub.classList.remove('dragging')
        nub.style.transform = 'translate(0px, 0px)'
      }
    }
  }, [dimmed, stopLoop])

  const zoomBy = useCallback(
    (factor) => {
      const cy = cyRef.current
      if (!cy || cy.destroyed()) return
      const { width, height } = cy.container().getBoundingClientRect()
      const level = Math.min(
        cy.maxZoom(),
        Math.max(cy.minZoom(), cy.zoom() * factor),
      )
      cy.animate(
        { zoom: { level, renderedPosition: { x: width / 2, y: height / 2 } } },
        { duration: prefersReducedMotion() ? 0 : ZOOM_MS, easing: 'ease-out' },
      )
    },
    [cyRef],
  )

  return (
    <div
      className={`pan-joystick-stack${dimmed ? ' dimmed' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="pan-zoom-btns">
        <button
          type="button"
          className="pan-zoom-btn"
          aria-label="Zoom in"
          onClick={() => zoomBy(ZOOM_IN)}
        >
          +
        </button>
        <button
          type="button"
          className="pan-zoom-btn"
          aria-label="Zoom out"
          onClick={() => zoomBy(ZOOM_OUT)}
        >
          −
        </button>
      </div>
      <div
        ref={baseRef}
        className="pan-joystick"
        role="application"
        aria-label="Pan the graph: drag the knob in the direction to move"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <div ref={nubRef} className="pan-joystick-nub" />
      </div>
    </div>
  )
}
