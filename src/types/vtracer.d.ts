declare module 'virtual:vtracer-wasm' {
  const base64: string
  export default base64
}

declare module 'wasm_vtracer/wasm_vtracer_bg.js' {
  export class TracerConfig {
    constructor()
    free(): void
    /** 0 = Color, 1 = Binary */
    setColorMode(mode: number): void
    /** 0 = Stacked, 1 = Cutout */
    setHierarchical(mode: number): void
    /** 0 = Polygon, 1 = Spline, 2 = None */
    setPathSimplifyMode(mode: number): void
    setFilterSpeckle(value: number): void
    /** Bits per channel, 1-8. */
    setColorPrecision(value: number): void
    /** 0-255. */
    setLayerDifference(value: number): void
    /** Degrees, 0-180. */
    setCornerThreshold(value: number): void
    /** 3.5-10. */
    setLengthThreshold(value: number): void
    setMaxIterations(value: number): void
    /** Degrees, 0-180. */
    setSpliceThreshold(value: number): void
    /** Decimals, 0-8. */
    setPathPrecision(value: number): void
  }
  export function convertImageToSvg(
    data: Uint8Array,
    width: number,
    height: number,
    config: TracerConfig,
  ): string
  export function getVersion(): string
  export function __wbg_set_wasm(wasm: unknown): void
}
