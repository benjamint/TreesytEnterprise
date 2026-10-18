import { cn } from '@/lib/utils';

/**
 * Placeholder art built in code (PRD 6.1b) until the painterly illustrations arrive:
 * layered SVG savanna — sky gradient, soft clouds, rolling fields, shea trees, sun glow, grain.
 */
export function Landscape({ className, variant = 'shea' }: { className?: string; variant?: 'shea' | 'cocoa' }) {
  const id = variant;
  return (
    <svg viewBox="0 0 800 1000" preserveAspectRatio="xMidYMid slice" className={cn('h-full w-full', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2F7FC8" />
          <stop offset="0.65" stopColor="#9CC8EE" />
          <stop offset="1" stopColor="#F4E3B5" />
        </linearGradient>
        <radialGradient id={`sun-${id}`} cx="0.72" cy="0.32" r="0.35">
          <stop offset="0" stopColor="#FFF4C9" stopOpacity="0.95" />
          <stop offset="0.4" stopColor="#FFE08A" stopOpacity="0.45" />
          <stop offset="1" stopColor="#FFE08A" stopOpacity="0" />
        </radialGradient>
        <filter id={`grain-${id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.08" />
          </feComponentTransfer>
        </filter>
        <filter id={`soft-${id}`}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <rect width="800" height="1000" fill={`url(#sky-${id})`} />
      <rect width="800" height="1000" fill={`url(#sun-${id})`} />
      <g fill="#FFFFFF" opacity="0.85" filter={`url(#soft-${id})`}>
        <ellipse cx="170" cy="190" rx="120" ry="34" />
        <ellipse cx="250" cy="170" rx="80" ry="30" />
        <ellipse cx="600" cy="120" rx="140" ry="30" />
        <ellipse cx="520" cy="250" rx="90" ry="22" />
      </g>
      <path d="M0 610 C 160 560 300 600 420 575 C 560 545 680 585 800 560 L800 1000 L0 1000Z" fill="#7FA35A" />
      <path d="M0 680 C 140 640 280 690 430 660 C 580 630 690 670 800 650 L800 1000 L0 1000Z" fill="#5E8C45" />
      <path d="M0 770 C 180 730 330 790 500 750 C 640 720 720 760 800 745 L800 1000 L0 1000Z" fill="#3F7438" />
      <path d="M0 860 C 200 820 360 880 560 840 C 680 815 760 845 800 835 L800 1000 L0 1000Z" fill="#2A5A30" />
      {variant === 'shea' ? (
        <g>
          {[
            [140, 620, 1], [330, 590, 0.75], [610, 600, 0.9], [720, 660, 0.6], [470, 690, 0.55],
          ].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              <path d="M-6 0 C -4 -40 -3 -70 0 -95 C 3 -70 4 -40 6 0Z" fill="#4A3424" />
              <ellipse cx="0" cy="-110" rx="62" ry="40" fill="#2F5F2E" />
              <ellipse cx="-30" cy="-98" rx="36" ry="26" fill="#3B7036" />
              <ellipse cx="28" cy="-126" rx="34" ry="24" fill="#447C3C" />
            </g>
          ))}
        </g>
      ) : (
        <g>
          {[
            [120, 640, 1], [300, 610, 0.8], [560, 620, 1.1], [700, 670, 0.7],
          ].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              <path d="M-5 0 C -3 -50 -2 -110 0 -150 C 2 -110 3 -50 5 0Z" fill="#4A3424" />
              <ellipse cx="0" cy="-160" rx="80" ry="34" fill="#2A5A30" />
              <ellipse cx="-20" cy="-60" rx="26" ry="30" fill="#3F7438" />
              <ellipse cx="-14" cy="-48" rx="5" ry="9" fill="#B5651D" />
              <ellipse cx="10" cy="-62" rx="5" ry="9" fill="#C77B2B" />
            </g>
          ))}
        </g>
      )}
      <g fill="#E8D6A0" opacity="0.7">
        {[80, 220, 380, 540, 690].map((x, i) => (
          <circle key={i} cx={x} cy={900 + (i % 2) * 30} r="5" />
        ))}
      </g>
      <rect width="800" height="1000" filter={`url(#grain-${id})`} />
    </svg>
  );
}
