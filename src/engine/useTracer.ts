import { useEffect, useRef, useState } from 'react'
import type { TraceParams, WorkerResponse } from './types'

export interface WorkingImage {
  /** RGBA pixels at working resolution. */
  pixels: Uint8Array
  width: number
  height: number
  /** Size of the file the user opened — written to the exported SVG. */
  srcWidth: number
  srcHeight: number
}

export interface TraceRequest {
  params: TraceParams
  /** Debounce before the trace is dispatched. */
  delay: number
}

export interface TraceState {
  svg: string | null
  /** Blob URL of `svg`, for rendering the result in an <img>. */
  url: string | null
  shapes: number
  colors: number
  busy: boolean
  error: string | null
}

const IDLE: TraceState = { svg: null, url: null, shapes: 0, colors: 0, busy: false, error: null }

// Hold a finished result briefly before swapping it in, so a fast trace does
// not flash the busy pill on and off.
const SETTLE_MS = 120

export function useTracer(image: WorkingImage | null, request: TraceRequest): TraceState {
  const [state, setState] = useState<TraceState>(IDLE)
  const workerRef = useRef<Worker | null>(null)
  const genRef = useRef(0)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('./traceWorker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    let settle: number | undefined

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      if (msg.gen !== genRef.current) return
      window.clearTimeout(settle)
      settle = window.setTimeout(() => {
        if (msg.type === 'error') {
          setState((s) => ({ ...s, busy: false, error: msg.message }))
          return
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        const url = URL.createObjectURL(new Blob([msg.svg], { type: 'image/svg+xml' }))
        urlRef.current = url
        setState({ svg: msg.svg, url, shapes: msg.shapes, colors: msg.colors, busy: false, error: null })
      }, SETTLE_MS)
    }

    return () => {
      window.clearTimeout(settle)
      worker.terminate()
      workerRef.current = null
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!image) {
      setState(IDLE)
      return
    }
    // The worker takes ownership of the buffer it receives, so send a copy and
    // keep the original for re-initialising after a later image swap.
    const copy = image.pixels.slice()
    workerRef.current?.postMessage(
      { type: 'init', width: image.width, height: image.height, buffer: copy.buffer },
      [copy.buffer],
    )
  }, [image])

  useEffect(() => {
    if (!image) return
    setState((s) => ({ ...s, busy: true }))
    const timer = window.setTimeout(() => {
      const gen = ++genRef.current
      workerRef.current?.postMessage({
        type: 'trace',
        gen,
        params: request.params,
        outWidth: image.srcWidth,
        outHeight: image.srcHeight,
      })
    }, request.delay)
    return () => window.clearTimeout(timer)
  }, [image, request])

  return state
}
