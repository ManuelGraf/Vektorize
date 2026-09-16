import type { CSSProperties } from 'react'
import type { Mode, TraceParams } from '../engine/types'

interface SliderSpec {
  key: 'colors' | 'speckle' | 'smooth'
  label: string
  min: number
  max: number
  step: number
  display: string
  hint: string
}

function specs(params: TraceParams): SliderSpec[] {
  const all: SliderSpec[] = [
    {
      key: 'colors',
      label: 'Colors',
      min: 2,
      max: 64,
      step: 1,
      display: String(params.colors),
      hint: 'Fewer colors flatten the image into bolder shapes.',
    },
    {
      key: 'speckle',
      label: 'Ignore speckles',
      min: 0,
      max: 10,
      step: 1,
      display: params.speckle === 0 ? 'Off' : `${params.speckle} px`,
      hint: 'Minimum shape size — removes noise and dust.',
    },
    {
      key: 'smooth',
      label: 'Smoothness',
      min: 0,
      max: 4,
      step: 0.5,
      display: params.smooth === 0 ? 'Sharp' : params.smooth.toFixed(1),
      hint: 'Rounds corners and relaxes curve fitting.',
    },
  ]
  return params.mode === 'bw' ? all.slice(1) : all
}

interface ControlsProps {
  params: TraceParams
  onChange: (patch: Partial<TraceParams>) => void
  variant: 'inline' | 'sheet'
}

export function Controls({ params, onChange, variant }: ControlsProps) {
  const selectMode = (mode: Mode) => {
    if (mode === 'bw') onChange({ mode: 'bw', colors: 2 })
    else onChange({ mode: 'color', colors: Math.max(3, params.colors) })
  }

  const modes: { id: Mode; label: string; active: boolean }[] = [
    { id: 'color', label: 'Color', active: params.mode !== 'bw' },
    { id: 'bw', label: 'Black & White', active: params.mode === 'bw' },
  ]

  return (
    <div className={`controls controls--${variant}`}>
      <div className="mode-toggle">
        {modes.map((m) => (
          <button key={m.id} className={m.active ? 'active' : ''} onClick={() => selectMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      {specs(params).map((s) => {
        const value = params[s.key]
        const fill = `${((value - s.min) / (s.max - s.min)) * 100}%`
        return (
          <div className="slider" key={s.key}>
            <div className="slider-head">
              <span className="slider-label">{s.label}</span>
              <span className="slider-value">{s.display}</span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={value}
              style={{ '--fill': fill } as CSSProperties}
              onChange={(e) => onChange({ [s.key]: Number(e.target.value) } as Partial<TraceParams>)}
            />
            <span className="slider-hint">{s.hint}</span>
          </div>
        )
      })}
    </div>
  )
}
