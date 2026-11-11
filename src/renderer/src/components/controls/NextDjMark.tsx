import { useId } from 'react'

interface NextDjMarkProps {
  className?: string
}

export function NextDjMark({ className }: NextDjMarkProps): JSX.Element {
  const id = useId()
  const diskId = `${id}-disk`
  const ringMaskId = `${id}-ring-mask`
  const slashMaskId = `${id}-slash-mask`

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id={diskId}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>

        <mask id={ringMaskId}>
          <rect width="100" height="100" fill="white" />
          <path d="M0 0 100 100" stroke="black" strokeWidth="6" strokeLinecap="butt" />
        </mask>

        <mask id={slashMaskId}>
          <rect width="100" height="100" fill="white" />
          <path d="M39 42.5V63" stroke="black" strokeLinecap="round" strokeWidth="13" />
          <path d="M50 26V73" stroke="black" strokeLinecap="round" strokeWidth="13" />
          <path d="M61 37.5V58.5" stroke="black" strokeLinecap="round" strokeWidth="13" />
        </mask>
      </defs>

      <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="10" mask={`url(#${ringMaskId})`} />

      <g clipPath={`url(#${diskId})`} mask={`url(#${slashMaskId})`}>
        <path d="M10 0 100 90" stroke="currentColor" strokeWidth="8" strokeLinecap="butt" />
        <path d="M0 10 90 100" stroke="currentColor" strokeWidth="8" strokeLinecap="butt" />
      </g>

      <path d="M39 42.5V63" stroke="currentColor" strokeLinecap="round" strokeWidth="7" />
      <path d="M50 26V73" stroke="currentColor" strokeLinecap="round" strokeWidth="7" />
      <path d="M61 37.5V58.5" stroke="currentColor" strokeLinecap="round" strokeWidth="7" />
    </svg>
  )
}
