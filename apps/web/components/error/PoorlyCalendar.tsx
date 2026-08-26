/**
 * The mascot for the maintenance page: a calendar that is off sick.
 *
 * Drawn inline rather than shipped as an asset because this renders on the error path, where
 * the thing that just failed may well be whatever would have served the image. It uses
 * currentColor for its linework so it inherits the surrounding text colour and stays legible
 * in both themes without a second asset.
 */
export const PoorlyCalendar = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 200 190"
    fill="none"
    role="img"
    aria-label="A calendar looking unwell"
    className={className}
    xmlns="http://www.w3.org/2000/svg">
    <title>A calendar looking unwell</title>

    {/* legs */}
    <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.85">
      <path d="M78 150v18" />
      <path d="M122 150v18" />
      <path d="M70 170h14" />
      <path d="M116 170h14" />
    </g>

    {/* arms — the left one hangs limply, the right holds an ice pack */}
    <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85">
      <path d="M42 108c-10 6-14 16-13 26" />
      <path d="M158 104c12 2 18 10 20 20" />
    </g>

    {/* body */}
    <rect x="42" y="46" width="116" height="104" rx="14" fill="currentColor" opacity="0.06" />
    <rect
      x="42"
      y="46"
      width="116"
      height="104"
      rx="14"
      stroke="currentColor"
      strokeWidth="5"
      opacity="0.85"
    />

    {/* header band and rings */}
    <path d="M42 74h116" stroke="currentColor" strokeWidth="5" opacity="0.85" />
    <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.85">
      <path d="M72 34v18" />
      <path d="M128 34v18" />
    </g>

    {/* droopy eyes */}
    <g stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" opacity="0.85">
      <path d="M72 98c3.5 5 10.5 5 14 0" />
      <path d="M114 98c3.5 5 10.5 5 14 0" />
    </g>

    {/* flushed cheeks */}
    <g fill="#f87171" opacity="0.5">
      <ellipse cx="68" cy="115" rx="8" ry="5" />
      <ellipse cx="132" cy="115" rx="8" ry="5" />
    </g>

    {/* queasy wavy mouth */}
    <path
      d="M84 126c4-5 8 5 12 0s8 5 12 0 8 5 12 0"
      stroke="currentColor"
      strokeWidth="4.5"
      strokeLinecap="round"
      opacity="0.85"
    />

    {/* thermometer */}
    <g transform="rotate(24 128 132) translate(0 -11)">
      <rect x="124" y="120" width="7" height="30" rx="3.5" fill="currentColor" opacity="0.25" />
      <rect x="124" y="120" width="7" height="30" rx="3.5" stroke="currentColor" strokeWidth="3" />
      <circle cx="127.5" cy="152" r="6" fill="#f87171" />
    </g>

    {/* ice pack in the right hand */}
    <g transform="rotate(-12 176 128)">
      <rect x="166" y="118" width="22" height="16" rx="8" fill="#60a5fa" opacity="0.35" />
      <rect x="166" y="118" width="22" height="16" rx="8" stroke="currentColor" strokeWidth="3.5" />
    </g>
  </svg>
);
