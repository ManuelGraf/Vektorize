import { useCallback, useEffect, useRef, useState } from 'react'
import { Controls } from './components/Controls'
import { IconDownload, IconLock, IconSliders, IconUpload } from './components/Icons'
import { Preview } from './components/Preview'
import { DEFAULT_PRESET, PRESETS, type Layout, type Preset, type TraceParams } from './engine/types'
import { useTracer, type TraceRequest, type WorkingImage } from './engine/useTracer'

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']

// Longest edge the tracer works on. Vector output stays crisp at any size, so
// this only trades detail recovery against how fast a slider drag feels.
const MAX_TRACE = 1000

// Refuse to decode a decompression bomb outright.
const MAX_SOURCE_PIXELS = 40_000_000

const PRESET_DELAY = 60
const MANUAL_DELAY = 220

const paramsOf = (preset: Preset): TraceParams => ({
  mode: preset.mode,
  colors: preset.colors,
  speckle: preset.speckle,
  smooth: preset.smooth,
})

const initial = PRESETS.find((p) => p.id === DEFAULT_PRESET) ?? PRESETS[0]

interface Loaded {
  image: WorkingImage
  origUrl: string
  name: string
}

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [layout, setLayout] = useState<Layout>('desktop')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [preset, setPreset] = useState<string | null>(DEFAULT_PRESET)
  const [request, setRequest] = useState<TraceRequest>({ params: paramsOf(initial), delay: 0 })
  const [advOpen, setAdvOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const params = request.params
  const result = useTracer(loaded?.image ?? null, request)

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 4000)
  }, [])

  useEffect(() => {
    if (result.error) notify(`Trace failed: ${result.error}`)
  }, [result.error, notify])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      setLayout(w < 640 ? 'phone' : w < 1024 ? 'tablet' : 'desktop')
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const loadBlob = useCallback(
    async (blob: Blob, name: string) => {
      if (blob.type === 'image/svg+xml' || !ACCEPTED.includes(blob.type)) {
        notify('Unsupported file type. Use PNG, JPG, WebP, GIF or BMP.')
        return
      }
      let bitmap: ImageBitmap
      try {
        bitmap = await createImageBitmap(blob)
      } catch {
        notify('Could not decode that image.')
        return
      }
      const srcWidth = bitmap.width
      const srcHeight = bitmap.height
      if (srcWidth * srcHeight > MAX_SOURCE_PIXELS) {
        bitmap.close()
        notify('That image is too large to open on this device.')
        return
      }

      const scale = Math.min(1, MAX_TRACE / Math.max(srcWidth, srcHeight))
      const width = Math.max(1, Math.round(srcWidth * scale))
      const height = Math.max(1, Math.round(srcHeight * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        bitmap.close()
        notify('Could not read that image.')
        return
      }
      // Flatten onto white: the tracer has no notion of transparency, and a
      // white ground is what a scanner or camera would have produced anyway.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(bitmap, 0, 0, width, height)
      bitmap.close()

      const pixels = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer)
      const origUrl = canvas.toDataURL('image/png')

      setLoaded((prev) => {
        if (prev?.origUrl.startsWith('blob:')) URL.revokeObjectURL(prev.origUrl)
        return {
          image: { pixels, width, height, srcWidth, srcHeight },
          origUrl,
          name: name.replace(/\.[^.]+$/, '') || 'image',
        }
      })
      setAdvOpen(false)
    },
    [notify],
  )

  const openFile = () => fileRef.current?.click()

  const selectPreset = (p: Preset) => {
    setPreset(p.id)
    setRequest({ params: paramsOf(p), delay: PRESET_DELAY })
  }

  const updateParams = (patch: Partial<TraceParams>) => {
    setPreset(null)
    setRequest((r) => ({ params: { ...r.params, ...patch }, delay: MANUAL_DELAY }))
  }

  const exportSvg = () => {
    if (!result.svg || !loaded) return
    const url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${loaded.name}.svg`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      for (const item of e.clipboardData?.items ?? []) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            void loadBlob(file, 'pasted-image')
          }
          return
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [loadBlob])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void loadBlob(file, file.name)
  }

  const advSummary = `${params.mode === 'bw' ? 'B&W' : `${params.colors} colors`} · smooth ${params.smooth.toFixed(1)}`
  const colorLabel =
    params.mode === 'bw' ? 'Black & white' : `${result.colors || params.colors} colors`
  const desktop = layout === 'desktop'
  const phone = layout === 'phone'
  const canExport = !!result.svg

  return (
    <div
      className="app"
      data-layout={layout}
      ref={rootRef}
      onDragOver={(e) => {
        e.preventDefault()
        if (e.dataTransfer.types.includes('Files')) setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED.join(',')}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void loadBlob(file, file.name)
          e.target.value = ''
        }}
      />

      <header className="header">
        <div className="brand">
          Vektor<span>ize</span>
        </div>
        {loaded ? (
          <>
            <div className="header-file">
              <span className="header-name">{loaded.name}</span>
              <span className="header-dims">
                {loaded.image.srcWidth} × {loaded.image.srcHeight}
              </span>
            </div>
            <button className="ghost-btn" onClick={openFile}>
              New image
            </button>
            {!phone && (
              <button className="primary-btn" onClick={exportSvg} disabled={!canExport}>
                <IconDownload />
                Export SVG
              </button>
            )}
          </>
        ) : (
          <>
            <div className="spacer" />
            <div className="header-local">
              <span className="header-dot" />
              Local only
            </div>
          </>
        )}
      </header>

      {loaded ? (
        <>
          <div className="body">
            <Preview
              origUrl={loaded.origUrl}
              resultUrl={result.url}
              imgWidth={loaded.image.width}
              imgHeight={loaded.image.height}
              busy={result.busy}
              shapes={result.shapes}
              colorLabel={colorLabel}
              layout={layout}
            />

            <div className="panel">
              {desktop && <div className="panel-label">Presets</div>}
              <div className="preset-grid">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className={`preset ${preset === p.id ? 'active' : ''}`}
                    onClick={() => selectPreset(p)}
                  >
                    <span className="preset-thumb" style={{ background: p.thumb }} />
                    <span className="preset-text">
                      <span className="preset-name">{p.name}</span>
                      {desktop && <span className="preset-sub">{p.sub}</span>}
                    </span>
                  </button>
                ))}
              </div>

              {!phone && (
                <button className="adv-btn" onClick={() => setAdvOpen((o) => !o)}>
                  Advanced
                  <span className="adv-summary">{advSummary}</span>
                </button>
              )}

              {desktop && advOpen && (
                <Controls params={params} onChange={updateParams} variant="inline" />
              )}
            </div>
          </div>

          {phone && (
            <nav className="bottombar">
              <button className="bottom-adv" onClick={() => setAdvOpen((o) => !o)}>
                <IconSliders />
                Advanced
              </button>
              <button className="bottom-export" onClick={exportSvg} disabled={!canExport}>
                <IconDownload />
                Export SVG
              </button>
            </nav>
          )}

          {!desktop && advOpen && (
            <>
              <div className="scrim" onClick={() => setAdvOpen(false)} />
              <div className="sheet">
                <div className="sheet-grab" />
                <div className="sheet-head">
                  <div className="sheet-title">Advanced</div>
                  <button className="sheet-done" onClick={() => setAdvOpen(false)}>
                    Done
                  </button>
                </div>
                <Controls params={params} onChange={updateParams} variant="sheet" />
              </div>
            </>
          )}
        </>
      ) : (
        <div
          className={`dropzone ${dragging ? 'over' : ''}`}
          role="button"
          tabIndex={0}
          onClick={openFile}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openFile()
            }
          }}
        >
          <div className="drop-icon">
            <IconUpload />
          </div>
          <div className="drop-copy">
            <div className="drop-title">{dragging ? 'Release to trace' : 'Drop an image to trace it'}</div>
            <div className="drop-sub">
              Tap here or drag a photo, logo or sketch onto this area. PNG, JPG, WebP.
            </div>
          </div>
          <div className="drop-cta">Choose an image</div>
          <div className="drop-trust">
            <IconLock />
            Runs entirely in your browser — nothing is uploaded, ever.
          </div>
        </div>
      )}

      {dragging && <div className="drag-overlay">Drop to trace</div>}

      {toast && (
        <div className="toasts">
          <div className="toast">{toast}</div>
        </div>
      )}
    </div>
  )
}
