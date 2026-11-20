import { useId } from 'react';

type ChipDenom2D = 5 | 25 | 100 | 500 | 1000;

interface ChipPalette2D {
  denom: string;
  base: string;
  rimDark: string;
  stripe: string;
  trim: string;
  inlay: string;
  text: string;
}

const CHIP_PALETTES_2D: Record<ChipDenom2D, ChipPalette2D> = {
  5: {
    denom: '5',
    base: '#B32026',
    rimDark: '#781016',
    stripe: '#F7F3E9',
    trim: '#D8A94E',
    inlay: '#FAF7EF',
    text: '#8D1319',
  },
  25: {
    denom: '25',
    base: '#0D6B44',
    rimDark: '#07442A',
    stripe: '#F5F1E6',
    trim: '#8AD2A6',
    inlay: '#FAF7EF',
    text: '#094E31',
  },
  100: {
    denom: '100',
    base: '#191D23',
    rimDark: '#0B0D11',
    stripe: '#E2B459',
    trim: '#F6F1E4',
    inlay: '#F9F6EE',
    text: '#13161B',
  },
  500: {
    denom: '500',
    base: '#5A2B7E',
    rimDark: '#391852',
    stripe: '#EFCE88',
    trim: '#C49BE6',
    inlay: '#FAF7EF',
    text: '#411C5E',
  },
  1000: {
    denom: '1K',
    base: '#CFA03D',
    rimDark: '#8F6B1E',
    stripe: '#17191E',
    trim: '#FFF8E8',
    inlay: '#FCF9F1',
    text: '#14161A',
  },
};

function resolveChipDenom(amount: number): ChipDenom2D {
  if (amount >= 1000) return 1000;
  if (amount >= 500) return 500;
  if (amount >= 100) return 100;
  if (amount >= 25) return 25;
  return 5;
}

function breakdown2DColumns(amount: number, maxLayers: number): ChipDenom2D[][] {
  const denoms: ChipDenom2D[] = [1000, 500, 100, 25, 5];
  const counts: Record<ChipDenom2D, number> = { 1000: 0, 500: 0, 100: 0, 25: 0, 5: 0 };
  let rem = Math.max(5, Math.floor(amount));

  for (const d of denoms) {
    if (rem >= d) {
      const q = Math.floor(rem / d);
      counts[d] = q;
      rem -= q * d;
    }
  }

  let total = counts[1000] + counts[500] + counts[100] + counts[25] + counts[5];
  if (total === 0) counts[5] = 1;

  // Determine how many barrels to show (1 for compact seat bets, up to 2 for pots/large bets)
  const allowTwoBarrels = maxLayers >= 5 && amount >= 75;
  const maxCols = allowTwoBarrels ? 2 : 1;
  const targetChips = Math.min(
    maxCols * maxLayers,
    Math.max(1, Math.round(Math.log10(Math.max(10, amount)) * 2.15))
  );

  // Split down high chips when stack looks too sparse
  while (total < targetChips) {
    if (counts[1000] > 0 && total + 1 <= maxCols * maxLayers) {
      counts[1000] -= 1;
      counts[500] += 2;
      total += 1;
    } else if (counts[500] > 0 && total + 4 <= maxCols * maxLayers) {
      counts[500] -= 1;
      counts[100] += 5;
      total += 4;
    } else if (counts[100] > 0 && total + 3 <= maxCols * maxLayers) {
      counts[100] -= 1;
      counts[25] += 4;
      total += 3;
    } else if (counts[25] > 0 && total + 4 <= maxCols * maxLayers) {
      counts[25] -= 1;
      counts[5] += 5;
      total += 4;
    } else {
      break;
    }
  }

  const flat: ChipDenom2D[] = [];
  for (const d of denoms) {
    for (let i = 0; i < counts[d]; i++) flat.push(d);
  }

  // Cap and balance across 1 or 2 barrels
  const capped = flat.slice(0, maxCols * maxLayers);
  if (maxCols === 1 || capped.length <= Math.max(2, Math.floor(maxLayers * 0.65))) {
    return [capped.reverse()];
  }

  const primaryLen = Math.min(maxLayers, Math.ceil(capped.length * 0.58));
  const primary = capped.slice(0, primaryLen).reverse();
  const secondary = capped.slice(primaryLen, primaryLen + Math.max(1, maxLayers - 1)).reverse();
  return secondary.length > 0 ? [primary, secondary] : [primary];
}

function CasinoChipSvg({
  denom,
  className,
  showLabel = true,
}: {
  denom: ChipDenom2D;
  className?: string;
  showLabel?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const p = CHIP_PALETTES_2D[denom];
  const edgeSpotAngles = [0, 45, 90, 135, 180, 225, 270, 315];

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`inlay-${uid}`} cx="42%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="70%" stopColor={p.inlay} />
          <stop offset="100%" stopColor="#DFD6C3" />
        </radialGradient>
        <linearGradient id={`sheen-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.24" />
          <stop offset="48%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
      </defs>

      {/* Outer clay body */}
      <circle cx="32" cy="32" r="30.5" fill={p.base} stroke={p.rimDark} strokeWidth="1.5" />

      {/* 8 Paulson-style tri-bar trapezoid edge spots */}
      {edgeSpotAngles.map((deg) => (
        <g key={deg} transform={`rotate(${deg} 32 32)`}>
          <rect x="28.2" y="2.2" width="7.6" height="8.6" rx="1" fill={p.stripe} />
          <rect x="30.8" y="2.2" width="2.4" height="8.6" fill={p.trim} />
        </g>
      ))}

      {/* Subtle knurled rim ticks */}
      <circle
        cx="32"
        cy="32"
        r="29.4"
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1"
        strokeDasharray="1.8 2.8"
      />

      {/* Recessed collar groove */}
      <circle cx="32" cy="32" r="20.8" fill="none" stroke="rgba(0,0,0,0.42)" strokeWidth="1.4" />
      <circle cx="32" cy="32" r="19.6" fill={`url(#inlay-${uid})`} stroke={p.trim} strokeWidth="0.9" />
      <circle
        cx="32"
        cy="32"
        r="16.4"
        fill="none"
        stroke={p.text}
        strokeOpacity="0.22"
        strokeWidth="0.7"
        strokeDasharray="1.5 1.8"
      />

      {showLabel && (
        <text
          x="32"
          y="33.5"
          textAnchor="middle"
          dominantBaseline="central"
          fill={p.text}
          fontSize={p.denom.length >= 3 ? '12.5' : '15'}
          fontWeight="800"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          letterSpacing="-0.6"
        >
          {p.denom}
        </text>
      )}

      {/* Subtle top-left gloss & bevel */}
      <circle cx="32" cy="32" r="30.2" fill={`url(#sheen-${uid})`} />
    </svg>
  );
}

interface ChipBadge2DProps {
  amount: number;
  size?: 'sm' | 'md';
}

export function ChipBadge2D({ amount, size = 'md' }: ChipBadge2DProps) {
  if (amount <= 0) return null;
  const denom = resolveChipDenom(amount);
  const dim = size === 'sm' ? 'h-5 w-5' : 'h-7 w-7';

  return (
    <span
      aria-hidden="true"
      className={`${dim} relative inline-flex shrink-0 items-center justify-center rounded-full shadow-[0_2px_0_rgba(0,0,0,0.65),0_4px_8px_rgba(0,0,0,0.35)]`}
    >
      <CasinoChipSvg denom={denom} className="h-full w-full" />
    </span>
  );
}

interface ChipStackVisual2DProps {
  amount: number;
  maxLayers?: number;
}

/**
 * Tactile 2D casino chip barrel(s) with authentic edge spots, recessed bevel grooves,
 * and multi-denomination layering whose height scales dynamically with bet/pot magnitude.
 */
export function ChipStackVisual2D({ amount, maxLayers = 7 }: ChipStackVisual2DProps) {
  if (amount <= 0) return null;
  const columns = breakdown2DColumns(amount, maxLayers);
  const tallest = Math.max(...columns.map((c) => c.length), 1);
  const containerWidth = columns.length > 1 ? 'w-11' : 'w-7';

  return (
    <span
      key={`${columns.length}-${tallest}`}
      aria-hidden="true"
      className={`relative inline-flex items-end justify-center ${containerWidth} shrink-0 animate-chip-impact`}
      style={{ height: `${24 + (tallest - 1) * 3.5}px` }}
    >
      {columns.map((col, colIdx) => {
        const offsetX = columns.length > 1 ? (colIdx === 0 ? -7 : 8) : 0;
        const offsetY = columns.length > 1 && colIdx === 1 ? -1 : 0;

        return (
          <span
            key={colIdx}
            className="absolute bottom-0 left-1/2"
            style={{
              transform: `translateX(calc(-50% + ${offsetX}px))`,
              zIndex: colIdx === 0 ? 10 : 20,
            }}
          >
            {col.map((denom, i) => {
              const p = CHIP_PALETTES_2D[denom];
              const isTop = i === col.length - 1;
              const bottomPx = offsetY + i * 3.5;

              if (!isTop) {
                // Edge-on stacked chip disc showing clay body + alternating edge spots + crisp bevel shadow
                return (
                  <span
                    key={i}
                    className="absolute left-1/2 -translate-x-1/2 h-[22px] w-[22px] rounded-full border shadow-[0_2px_1px_rgba(0,0,0,0.72)] overflow-hidden"
                    style={{
                      bottom: `${bottomPx}px`,
                      backgroundColor: p.base,
                      borderColor: p.rimDark,
                      zIndex: i + 1,
                    }}
                  >
                    <span
                      className="absolute inset-x-0 bottom-0 h-[5px]"
                      style={{
                        backgroundImage: `repeating-linear-gradient(90deg, ${p.base} 0px, ${p.base} 4px, ${p.stripe} 4px, ${p.stripe} 6.5px)`,
                      }}
                    />
                  </span>
                );
              }

              return (
                <span
                  key={i}
                  className="absolute left-1/2 -translate-x-1/2 h-6 w-6 rounded-full shadow-[0_2px_3px_rgba(0,0,0,0.72)]"
                  style={{
                    bottom: `${bottomPx}px`,
                    zIndex: i + 1,
                  }}
                >
                  <CasinoChipSvg denom={denom} className="h-full w-full" />
                </span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}
