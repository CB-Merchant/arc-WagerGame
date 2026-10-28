/**
 * WagerGame logo — SVG inline component.
 * A hexagonal coin with a stylised "W" and a gold/blue gradient.
 */

interface LogoProps {
  size?: number
  className?: string
}

export function Logo({ size = 40, className }: LogoProps) {
  const id = 'wg-logo'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="WagerGame logo"
    >
      <defs>
        {/* Coin background gradient — deep blue to purple */}
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1a2a6c" />
          <stop offset="50%" stopColor="#2d1b69" />
          <stop offset="100%" stopColor="#11998e" />
        </linearGradient>
        {/* W letter gradient — gold */}
        <linearGradient id={`${id}-w`} x1="8" y1="14" x2="32" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffd700" />
          <stop offset="100%" stopColor="#ffaa00" />
        </linearGradient>
        {/* Outer ring gradient */}
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5b8af5" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>

      {/* Hexagon shape */}
      <path
        d="M20 2 L36 11 L36 29 L20 38 L4 29 L4 11 Z"
        fill={`url(#${id}-bg)`}
        stroke={`url(#${id}-ring)`}
        strokeWidth="1.5"
      />

      {/* Inner coin ring */}
      <path
        d="M20 5.5 L33.5 12.75 L33.5 27.25 L20 34.5 L6.5 27.25 L6.5 12.75 Z"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="0.75"
      />

      {/* Stylised W — thick, bold */}
      <path
        d="M9 14 L13 26 L17 19 L20 24 L23 19 L27 26 L31 14"
        stroke={`url(#${id}-w)`}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Small USDC dot — bottom centre */}
      <circle cx="20" cy="31" r="2" fill="#ffd700" opacity="0.85" />
      <circle cx="20" cy="31" r="1.1" fill="#1a2a6c" />
    </svg>
  )
}
