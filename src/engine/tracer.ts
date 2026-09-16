import wasmBase64 from 'virtual:vtracer-wasm'
import * as vt from 'wasm_vtracer/wasm_vtracer_bg.js'
import { binarize, boxBlur, nearestColor, otsuThreshold, quantize, toGrayscale, type RGB } from './quantize'
import type { TraceParams } from './types'

const COLOR_MODE = { color: 0, binary: 1 } as const
const SIMPLIFY = { polygon: 0, spline: 1 } as const

let ready: Promise<void> | null = null

export function initTracer(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const raw = atob(wasmBase64)
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
      const { instance } = await WebAssembly.instantiate(bytes, {
        './wasm_vtracer_bg.js': vt as unknown as WebAssembly.ModuleImports,
      })
      vt.__wbg_set_wasm(instance.exports)
      const start = (instance.exports as Record<string, unknown>).__wbindgen_start
      if (typeof start === 'function') start()
    })()
  }
  return ready
}

const hex = (c: RGB) => '#' + c.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')

function buildConfig(params: TraceParams, binary: boolean): vt.TracerConfig {
  const config = new vt.TracerConfig()
  const { smooth, speckle } = params

  config.setColorMode(binary ? COLOR_MODE.binary : COLOR_MODE.color)
  config.setPathSimplifyMode(smooth === 0 ? SIMPLIFY.polygon : SIMPLIFY.spline)

  // The slider is "minimum shape size in pixels across"; vtracer filters by area.
  config.setFilterSpeckle(Math.round(speckle * speckle))

  // The palette is already exact by the time vtracer sees the image, so ask it
  // not to re-quantize or merge layers of its own accord.
  config.setColorPrecision(8)
  config.setLayerDifference(0)

  // Centred so the default preset (smooth 1.5) lands on vtracer's own defaults.
  config.setCornerThreshold(Math.round(30 + smooth * 20))
  config.setSpliceThreshold(Math.round(30 + smooth * 10))
  config.setLengthThreshold(3.5 + smooth * 0.4)
  config.setMaxIterations(10)
  config.setPathPrecision(2)
  return config
}

export interface TraceOutput {
  svg: string
  shapes: number
  colors: number
}

export function trace(
  source: Uint8Array,
  width: number,
  height: number,
  params: TraceParams,
  outWidth: number,
  outHeight: number,
): TraceOutput {
  const { mode, colors, smooth, speckle } = params

  const radius = Math.min(4, Math.round(smooth * 0.6 + speckle * 0.25))
  const blurred = boxBlur(source, width, height, radius)

  let pixels: Uint8Array
  let palette: RGB[] | null = null

  if (mode === 'bw') {
    pixels = binarize(blurred, otsuThreshold(blurred))
  } else {
    const base = mode === 'gray' ? toGrayscale(blurred) : blurred
    const result = quantize(base, colors)
    pixels = result.pixels
    palette = result.palette
  }

  const config = buildConfig(params, mode === 'bw')
  let svg: string
  try {
    svg = vt.convertImageToSvg(pixels, width, height, config)
  } finally {
    config.free()
  }

  return finalize(svg, palette, width, height, outWidth, outHeight)
}

function finalize(
  svg: string,
  palette: RGB[] | null,
  width: number,
  height: number,
  outWidth: number,
  outHeight: number,
): TraceOutput {
  const open = svg.indexOf('<svg')
  const openEnd = svg.indexOf('>', open)
  const close = svg.lastIndexOf('</svg>')
  let inner = open < 0 || close < 0 ? '' : svg.slice(openEnd + 1, close).trim()

  // vtracer re-averages colors where it filters speckles, which can invent
  // shades that are not in the palette. Snapping guarantees the output really
  // does contain the number of colors the UI promises.
  const seen = new Set<string>()
  if (palette) {
    inner = inner.replace(/fill="#([0-9A-Fa-f]{6})"/g, (_m, h: string) => {
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      const snapped = hex(nearestColor(palette, r, g, b))
      seen.add(snapped)
      return `fill="${snapped}"`
    })
  } else {
    inner = inner.replace(/fill="[^"]*"/g, 'fill="#000000"')
    seen.add('#000000')
  }

  const shapes = (inner.match(/<path/g) ?? []).length
  const header =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" ` +
    `viewBox="0 0 ${width} ${height}">`
  return { svg: `${header}${inner}</svg>`, shapes, colors: seen.size }
}
