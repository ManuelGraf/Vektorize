export type RGB = [number, number, number]

// Colors are bucketed into a 5-bit-per-channel histogram before clustering.
// Median cut then runs over at most 32768 buckets instead of every pixel,
// which keeps a 1MP image well inside the interactive budget.
const BINS = 32768
const binOf = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

function blurAxis(
  src: Uint8Array,
  dst: Uint8Array,
  major: number,
  minor: number,
  radius: number,
  majorStep: number,
  minorStep: number,
) {
  const win = radius * 2 + 1
  for (let m = 0; m < major; m++) {
    const base = m * majorStep
    for (let c = 0; c < 3; c++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) sum += src[(base + clamp(k, 0, minor - 1) * minorStep) * 4 + c]
      for (let i = 0; i < minor; i++) {
        dst[(base + i * minorStep) * 4 + c] = sum / win
        const drop = clamp(i - radius, 0, minor - 1)
        const add = clamp(i + radius + 1, 0, minor - 1)
        sum += src[(base + add * minorStep) * 4 + c] - src[(base + drop * minorStep) * 4 + c]
      }
    }
    for (let i = 0; i < minor; i++) dst[(base + i * minorStep) * 4 + 3] = 255
  }
}

/** Separable box blur. Smooths sensor noise so quantization produces clean regions. */
export function boxBlur(px: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius < 1) return px
  const tmp = new Uint8Array(px.length)
  const out = new Uint8Array(px.length)
  blurAxis(px, tmp, h, w, radius, w, 1)
  blurAxis(tmp, out, w, h, radius, 1, w)
  return out
}

export function toGrayscale(px: Uint8Array): Uint8Array {
  const out = new Uint8Array(px.length)
  for (let i = 0; i < px.length; i += 4) {
    const l = Math.round(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2])
    out[i] = out[i + 1] = out[i + 2] = l
    out[i + 3] = 255
  }
  return out
}

/** Otsu's method — picks the luminance split that best separates ink from paper. */
export function otsuThreshold(px: Uint8Array): number {
  const hist = new Uint32Array(256)
  const n = px.length / 4
  for (let i = 0; i < px.length; i += 4) {
    hist[Math.round(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2])]++
  }
  let total = 0
  for (let v = 0; v < 256; v++) total += v * hist[v]
  let sumB = 0
  let wB = 0
  let best = 0
  let bestVar = -1
  for (let v = 0; v < 256; v++) {
    wB += hist[v]
    if (wB === 0) continue
    const wF = n - wB
    if (wF === 0) break
    sumB += v * hist[v]
    const mB = sumB / wB
    const mF = (total - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > bestVar) {
      bestVar = between
      best = v
    }
  }
  return best
}

export function binarize(px: Uint8Array, threshold: number): Uint8Array {
  const out = new Uint8Array(px.length)
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
    const v = l > threshold ? 255 : 0
    out[i] = out[i + 1] = out[i + 2] = v
    out[i + 3] = 255
  }
  return out
}

interface Box {
  bins: number[]
  count: number
}

function boxExtent(bins: number[], channel: number) {
  const shift = channel === 0 ? 10 : channel === 1 ? 5 : 0
  let lo = 31
  let hi = 0
  for (const b of bins) {
    const v = (b >> shift) & 31
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return hi - lo
}

function medianCut(used: number[], count: Uint32Array, k: number): Box[] {
  let total = 0
  for (const b of used) total += count[b]
  let boxes: Box[] = [{ bins: used, count: total }]

  while (boxes.length < k) {
    let target = -1
    let score = 0
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      if (box.bins.length < 2) continue
      const spread = Math.max(boxExtent(box.bins, 0), boxExtent(box.bins, 1), boxExtent(box.bins, 2))
      const s = spread * box.count
      if (s > score) {
        score = s
        target = i
      }
    }
    if (target < 0) break

    const box = boxes[target]
    const ranges = [boxExtent(box.bins, 0), boxExtent(box.bins, 1), boxExtent(box.bins, 2)]
    const channel = ranges[0] >= ranges[1] && ranges[0] >= ranges[2] ? 0 : ranges[1] >= ranges[2] ? 1 : 2
    const shift = channel === 0 ? 10 : channel === 1 ? 5 : 0
    const sorted = box.bins.slice().sort((p, q) => ((p >> shift) & 31) - ((q >> shift) & 31))

    const half = box.count / 2
    let acc = 0
    let split = 0
    while (split < sorted.length - 1 && acc + count[sorted[split]] <= half) {
      acc += count[sorted[split]]
      split++
    }
    if (split === 0) split = 1

    const left = sorted.slice(0, split)
    const right = sorted.slice(split)
    let leftCount = 0
    for (const b of left) leftCount += count[b]
    boxes.splice(target, 1, { bins: left, count: leftCount }, { bins: right, count: box.count - leftCount })
  }
  return boxes
}

function nearestIndex(palette: RGB[], r: number, g: number, b: number): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i]
    const dr = r - p[0]
    const dg = g - p[1]
    const db = b - p[2]
    const d = dr * dr + dg * dg + db * db
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

export function nearestColor(palette: RGB[], r: number, g: number, b: number): RGB {
  return palette[nearestIndex(palette, r, g, b)]
}

/**
 * Reduces the image to exactly `k` colors (fewer only when the image itself
 * holds fewer). Returns the flattened pixels plus the palette, which the tracer
 * uses to snap vtracer's output fills back onto these exact colors.
 */
export function quantize(px: Uint8Array, k: number): { pixels: Uint8Array; palette: RGB[] } {
  const count = new Uint32Array(BINS)
  const sumR = new Float64Array(BINS)
  const sumG = new Float64Array(BINS)
  const sumB = new Float64Array(BINS)

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]
    const g = px[i + 1]
    const b = px[i + 2]
    const bin = binOf(r, g, b)
    count[bin]++
    sumR[bin] += r
    sumG[bin] += g
    sumB[bin] += b
  }

  const used: number[] = []
  for (let bin = 0; bin < BINS; bin++) if (count[bin]) used.push(bin)

  const boxes = medianCut(used, count, Math.max(2, k))
  const palette: RGB[] = boxes.map((box) => {
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (const bin of box.bins) {
      r += sumR[bin]
      g += sumG[bin]
      b += sumB[bin]
      n += count[bin]
    }
    n = n || 1
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
  })

  // Lloyd refinement over the histogram buckets — a few passes noticeably
  // improves palettes on photographic input and costs almost nothing here.
  const binR = new Float64Array(used.length)
  const binG = new Float64Array(used.length)
  const binB = new Float64Array(used.length)
  for (let i = 0; i < used.length; i++) {
    const bin = used[i]
    const n = count[bin]
    binR[i] = sumR[bin] / n
    binG[i] = sumG[bin] / n
    binB[i] = sumB[bin] / n
  }
  for (let pass = 0; pass < 3; pass++) {
    const accR = new Float64Array(palette.length)
    const accG = new Float64Array(palette.length)
    const accB = new Float64Array(palette.length)
    const accN = new Float64Array(palette.length)
    for (let i = 0; i < used.length; i++) {
      const idx = nearestIndex(palette, binR[i], binG[i], binB[i])
      const w = count[used[i]]
      accR[idx] += binR[i] * w
      accG[idx] += binG[i] * w
      accB[idx] += binB[i] * w
      accN[idx] += w
    }
    for (let i = 0; i < palette.length; i++) {
      if (accN[i]) palette[i] = [Math.round(accR[i] / accN[i]), Math.round(accG[i] / accN[i]), Math.round(accB[i] / accN[i])]
    }
  }

  const lut = new Uint8Array(BINS)
  for (let i = 0; i < used.length; i++) lut[used[i]] = nearestIndex(palette, binR[i], binG[i], binB[i])

  const pixels = new Uint8Array(px.length)
  for (let i = 0; i < px.length; i += 4) {
    const p = palette[lut[binOf(px[i], px[i + 1], px[i + 2])]]
    pixels[i] = p[0]
    pixels[i + 1] = p[1]
    pixels[i + 2] = p[2]
    pixels[i + 3] = 255
  }

  // Drop palette entries no pixel actually landed on so the reported color
  // count matches what is really in the SVG.
  const present = new Set<number>()
  for (let i = 0; i < used.length; i++) present.add(lut[used[i]])
  return { pixels, palette: palette.filter((_, i) => present.has(i)) }
}
