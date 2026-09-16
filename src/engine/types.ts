export type Mode = 'color' | 'gray' | 'bw'

export type Compare = 'original' | 'split' | 'result'

export type Layout = 'phone' | 'tablet' | 'desktop'

export interface TraceParams {
  mode: Mode
  /** 2..64 — exact number of colors in the output. Ignored in `bw` mode. */
  colors: number
  /** 0..10 — shapes smaller than this many pixels across are dropped. */
  speckle: number
  /** 0..4 — 0 keeps polygon-sharp corners, higher relaxes curve fitting. */
  smooth: number
}

export interface Preset extends TraceParams {
  id: string
  name: string
  sub: string
  /** CSS gradient shown as the card's swatch strip. */
  thumb: string
}

export interface InitMsg {
  type: 'init'
  width: number
  height: number
  /** RGBA pixels of the working (downscaled) image — transferred. */
  buffer: ArrayBuffer
}

export interface TraceMsg {
  type: 'trace'
  gen: number
  params: TraceParams
  /** Nominal size written to the exported SVG, in source-image pixels. */
  outWidth: number
  outHeight: number
}

export type WorkerRequest = InitMsg | TraceMsg

export interface TracedMsg {
  type: 'traced'
  gen: number
  svg: string
  shapes: number
  colors: number
}

export interface ErrorMsg {
  type: 'error'
  gen: number
  message: string
}

export type WorkerResponse = TracedMsg | ErrorMsg

export const PRESETS: Preset[] = [
  {
    id: 'bw',
    name: 'B&W Logo',
    sub: '2 colors · crisp',
    mode: 'bw',
    colors: 2,
    speckle: 4,
    smooth: 1,
    thumb: 'linear-gradient(90deg,#f6f6f6 50%,#0b0c0d 50%)',
  },
  {
    id: 'gray',
    name: 'Grayscale',
    sub: '6 tones',
    mode: 'gray',
    colors: 6,
    speckle: 3,
    smooth: 1.5,
    thumb: 'linear-gradient(90deg,#fff 0 17%,#cfcfcf 0 34%,#9a9a9a 0 51%,#666 0 68%,#333 0 85%,#000 0)',
  },
  {
    id: 'c3',
    name: '3 Colors',
    sub: 'poster look',
    mode: 'color',
    colors: 3,
    speckle: 5,
    smooth: 2,
    thumb: 'linear-gradient(90deg,#f2e6c8 0 33%,#1db8d1 0 66%,#22243a 0)',
  },
  {
    id: 'c6',
    name: '6 Colors',
    sub: 'illustration',
    mode: 'color',
    colors: 6,
    speckle: 3,
    smooth: 1.5,
    thumb:
      'linear-gradient(90deg,#f7f1dd 0 17%,#ffc857 0 34%,#e9724c 0 51%,#1db8d1 0 68%,#2f4858 0 85%,#141518 0)',
  },
  {
    id: 'c16',
    name: '16 Colors',
    sub: 'detailed',
    mode: 'color',
    colors: 16,
    speckle: 2,
    smooth: 1,
    thumb: 'linear-gradient(90deg,#fff8e7,#ffd166,#ef8354,#c8553d,#1db8d1,#4f9fb3,#2f4858,#1a1c24)',
  },
  {
    id: 'photo',
    name: 'Full Color',
    sub: 'photo · 64 colors',
    mode: 'color',
    colors: 64,
    speckle: 1,
    smooth: 0.5,
    thumb: 'linear-gradient(90deg,#fffaf0,#ffd166 20%,#ef8354 40%,#1db8d1 60%,#3a5a78 80%,#0b0c0d)',
  },
]

export const DEFAULT_PRESET = 'c6'
