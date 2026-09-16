import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { IconChevrons } from './Icons'
import type { Compare, Layout } from '../engine/types'

const COMPARE: { id: Compare; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'split', label: 'Split' },
  { id: 'result', label: 'Vector' },
]

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8

interface PreviewProps {
  origUrl: string
  resultUrl: string | null
  imgWidth: number
  imgHeight: number
  busy: boolean
  shapes: number
  colorLabel: string
  layout: Layout
}

export function Preview({
  origUrl,
  resultUrl,
  imgWidth,
  imgHeight,
  busy,
  shapes,
  colorLabel,
  layout,
}: PreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const [box, setBox] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [animate, setAnimate] = useState(false)
  const [gesture, setGesture] = useState<'pan' | 'split' | null>(null)
  const [compare, setCompare] = useState<Compare>('split')
  const [split, setSplit] = useState(55)

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number; mid: { x: number; y: number }; pan: { x: number; y: number } } | null>(null)
  const drag = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null)

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setAnimate(true)
  }, [origUrl])

  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setBox({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fit the image inside the measured area, leaving room for the floating
  // pills — more at the bottom on desktop, where stats and zoom both sit.
  const availW = Math.max(0, box.w - 32)
  const availH = Math.max(0, box.h - (layout === 'desktop' ? 148 : 32))
  const ratio = imgWidth / imgHeight
  let fitW = availW
  let fitH = availH
  if (availW > 0 && availH > 0) {
    if (availW / availH > ratio) {
      fitH = availH
      fitW = Math.round(availH * ratio)
    } else {
      fitW = availW
      fitH = Math.round(availW / ratio)
    }
  }

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setAnimate(false)
    setZoom((prevZoom) => {
      const next = clampZoom(prevZoom * factor)
      const r = next / prevZoom
      setPan((p) => ({ x: cx - (cx - p.x) * r, y: cy - (cy - p.y) * r }))
      return next
    })
  }, [])

  // Native listener: React's synthetic wheel handler is passive, so it cannot
  // preventDefault and the page would scroll while zooming.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomAt(
        Math.exp(-e.deltaY * 0.0015),
        e.clientX - rect.left - rect.width / 2,
        e.clientY - rect.top - rect.height / 2,
      )
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* capture is best-effort */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        pan,
      }
      drag.current = null
    } else if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, pan }
      setGesture('pan')
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const active = pinch.current
    if (active && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const next = clampZoom((active.zoom * dist) / active.dist)
      const r = next / active.zoom
      const rect = e.currentTarget.getBoundingClientRect()
      const cx = active.mid.x - rect.left - rect.width / 2
      const cy = active.mid.y - rect.top - rect.height / 2
      setAnimate(false)
      setZoom(next)
      setPan({
        x: cx - (cx - active.pan.x) * r + (mid.x - active.mid.x),
        y: cy - (cy - active.pan.y) * r + (mid.y - active.mid.y),
      })
    } else if (drag.current) {
      const d = drag.current
      setAnimate(false)
      setPan({ x: d.pan.x + e.clientX - d.x, y: d.pan.y + e.clientY - d.y })
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) {
      drag.current = null
      setGesture(null)
    }
  }

  const onSplitDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    setGesture('split')
    const move = (ev: globalThis.PointerEvent) => {
      if (!rect.width) return
      setSplit(Math.round(Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100))))
    }
    const up = () => {
      setGesture(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const step = (factor: number) => {
    setAnimate(true)
    setZoom((z) => clampZoom(z * factor))
  }

  const reset = () => {
    setAnimate(true)
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const isSplit = compare === 'split'
  // Only actually split once there is a vector to split against.
  const splitting = isSplit && resultUrl !== null

  return (
    <div className="preview" ref={previewRef}>
      <div className="checker" />
      <div
        className="stage-wrap"
        ref={wrapRef}
        style={{ cursor: gesture === 'pan' ? 'grabbing' : gesture === 'split' ? 'ew-resize' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
      >
        <div
          className="stage"
          ref={stageRef}
          style={{
            width: fitW,
            height: fitH,
            transform: `translate(${Math.round(pan.x)}px,${Math.round(pan.y)}px) scale(${zoom})`,
            transition: animate ? 'transform .2s cubic-bezier(.4,0,.2,1)' : 'none',
          }}
        >
          <img
            className="layer"
            src={origUrl}
            alt=""
            draggable={false}
            style={{
              opacity: compare === 'result' ? 0 : 1,
              // The traced SVG keeps its transparency, so the original has to be
              // clipped away on the vector side or it shows through the shapes.
              clipPath: splitting ? `inset(0 0 0 ${split}%)` : 'none',
            }}
          />
          {resultUrl && (
            <img
              className="layer result"
              src={resultUrl}
              alt=""
              draggable={false}
              style={{
                opacity: compare === 'original' ? 0 : 1,
                clipPath: isSplit ? `inset(0 ${100 - split}% 0 0)` : 'none',
              }}
            />
          )}
          {isSplit && (
            <>
              <div className="split-line" style={{ left: `${split}%`, width: `${(2 / zoom).toFixed(2)}px` }}>
                <div className="split-handle" style={{ transform: `translate(-50%,-50%) scale(${(1 / zoom).toFixed(3)})` }}>
                  <IconChevrons />
                </div>
              </div>
              <div className="split-hit" style={{ left: `${split}%` }} onPointerDown={onSplitDown} />
            </>
          )}
        </div>
      </div>

      <div className="pill compare">
        {COMPARE.map((c) => (
          <button
            key={c.id}
            className={compare === c.id ? 'active' : ''}
            onClick={() => setCompare(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {busy && (
        <div className="pill busy">
          <span className="spinner" />
          Tracing…
        </div>
      )}

      <div className="preview-foot">
        <div className="pill stats">
          <span>
            <b>{shapes.toLocaleString()}</b> shapes
          </span>
          <span>
            <b>{colorLabel}</b>
          </span>
        </div>
        <div className="pill zoom">
          <button className="zoom-step" aria-label="Zoom out" onClick={() => step(1 / 1.5)}>
            −
          </button>
          <button
            className={`zoom-level ${zoom !== 1 ? 'off' : ''}`}
            aria-label="Reset zoom"
            onClick={reset}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button className="zoom-step" aria-label="Zoom in" onClick={() => step(1.5)}>
            +
          </button>
        </div>
      </div>
    </div>
  )
}
