interface IconProps {
  size?: number
  className?: string
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function IconUpload({ size = 52 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} strokeWidth={2.4}>
      <path d="M12 20V7" />
      <path d="M6 13l6-6 6 6" />
      <path d="M4 4h16" />
    </svg>
  )
}

export function IconDownload({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} strokeWidth={2.4}>
      <path d="M12 4v12" />
      <path d="M6 11l6 6 6-6" />
      <path d="M4 20h16" />
    </svg>
  )
}

export function IconLock({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} strokeWidth={2.2}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

export function IconSliders({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} strokeWidth={2.2}>
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <circle cx="16" cy="7" r="2.5" />
      <path d="M4 17h4" />
      <path d="M12 17h8" />
      <circle cx="10" cy="17" r="2.5" />
    </svg>
  )
}

export function IconChevrons({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} strokeWidth={2.6}>
      <path d="M9 6l-5 6 5 6" />
      <path d="M15 6l5 6-5 6" />
    </svg>
  )
}
