import { useEffect, useState } from 'react';

interface WinCompositionRingProps {
  handsPlayed: number;
  handsWon: number;
  showdownWins: number;
  foldWins: number;
}

interface RingSegment {
  key: 'showdown' | 'fold' | 'other';
  label: string;
  count: number;
  pct: number;
  color: string;
  length: number;
  offset: number;
}

const SIZE = 92;
const STROKE = 7.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function WinCompositionRing({
  handsPlayed,
  handsWon,
  showdownWins,
  foldWins,
}: WinCompositionRingProps) {
  const [mounted, setMounted] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<RingSegment['key'] | null>(null);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const safePlayed = Math.max(0, Math.round(handsPlayed));
  const safeWon = Math.min(safePlayed, Math.max(0, Math.round(handsWon)));

  // Normalize win composition so showdown + fold strictly sums to handsWon
  let cleanFold = Math.min(safeWon, Math.max(0, Math.round(foldWins)));
  let cleanShowdown = Math.min(safeWon - cleanFold, Math.max(0, Math.round(showdownWins)));
  if (cleanShowdown + cleanFold < safeWon) {
    cleanShowdown = safeWon - cleanFold;
  }
  const nonWins = Math.max(0, safePlayed - safeWon);
  const winRatePct = safePlayed > 0 ? Math.round((safeWon / safePlayed) * 100) : 0;

  const rawItems: Array<{
    key: RingSegment['key'];
    label: string;
    count: number;
    color: string;
  }> = [
    { key: 'showdown', label: '摊牌胜', count: cleanShowdown, color: '#C9A25B' },
    { key: 'fold', label: '逼弃胜', count: cleanFold, color: '#7BB598' },
    { key: 'other', label: '未胜局', count: nonWins, color: 'rgba(239, 236, 228, 0.14)' },
  ];

  const activeNonZero = rawItems.filter((item) => item.count > 0);
  const gapPx = activeNonZero.length > 1 ? 2.4 : 0;

  let cursor = 0;
  const segments: RingSegment[] = rawItems.map((item) => {
    const ratio = safePlayed > 0 ? item.count / safePlayed : 0;
    const rawLen = ratio * CIRCUMFERENCE;
    const drawLen = item.count > 0 ? Math.max(2, rawLen - gapPx) : 0;
    const seg: RingSegment = {
      ...item,
      pct: safePlayed > 0 ? Math.round(ratio * 100) : 0,
      length: drawLen,
      offset: cursor,
    };
    cursor += rawLen;
    return seg;
  });

  const focused = hoveredKey ? segments.find((s) => s.key === hoveredKey) ?? null : null;

  return (
    <div
      data-testid="pc-win-composition-ring"
      className="mt-3 rounded-xl border border-white/[0.055] bg-white/[0.025] px-3.5 py-3.5"
    >
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-[#A69F93]">胜率构成</span>
        <span className="font-mono-num text-[10px] text-[#7A736A]">
          {safePlayed > 0 ? `${safePlayed} 局` : '暂无样本'}
        </span>
      </div>

      <div className="flex items-center gap-3.5">
        {/* Lightweight Animated SVG Donut Ring */}
        <div className="relative h-[86px] w-[86px] shrink-0">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label={
              safePlayed > 0
                ? `胜率 ${winRatePct}%，摊牌胜 ${cleanShowdown} 局，逼弃胜 ${cleanFold} 局`
                : '暂无胜率构成数据'
            }
            className="h-full w-full -rotate-90 select-none"
          >
            {/* Base Track */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="rgba(239, 236, 228, 0.06)"
              strokeWidth={STROKE}
            />

            {/* Animated Data Arcs */}
            {safePlayed > 0 &&
              segments.map((seg) => {
                if (seg.count <= 0) return null;
                const isHovered = hoveredKey === seg.key;
                const dimmed = hoveredKey !== null && !isHovered;
                const dashArray = mounted
                  ? `${seg.length.toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`
                  : `0 ${CIRCUMFERENCE.toFixed(2)}`;
                return (
                  <circle
                    key={seg.key}
                    data-testid={`win-ring-arc-${seg.key}`}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={isHovered ? STROKE + 1.4 : STROKE}
                    strokeLinecap="round"
                    strokeDasharray={dashArray}
                    strokeDashoffset={(-seg.offset).toFixed(2)}
                    opacity={dimmed ? 0.35 : 1}
                    className="cursor-pointer transition-all duration-700 ease-out"
                    onMouseEnter={() => setHoveredKey(seg.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                  />
                );
              })}
          </svg>

          {/* Center Dynamic Metric */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-mono-num text-[15px] leading-none font-semibold text-[#F4F0E8]">
              {safePlayed > 0 ? `${focused ? focused.pct : winRatePct}%` : '—'}
            </span>
            <span className="mt-1 text-[9.5px] leading-none text-[#847D73]">
              {focused ? focused.label : '总胜率'}
            </span>
          </div>
        </div>

        {/* Clean Interactive Breakdown Legend */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {segments.map((seg) => {
            const active = hoveredKey === seg.key;
            return (
              <div
                key={seg.key}
                onMouseEnter={() => safePlayed > 0 && setHoveredKey(seg.key)}
                onMouseLeave={() => setHoveredKey(null)}
                className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-0.5 text-[11px] transition-colors ${
                  safePlayed > 0 ? 'cursor-pointer' : ''
                } ${active ? 'bg-white/[0.05]' : ''}`}
              >
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: seg.color }}
                    aria-hidden="true"
                  />
                  <span
                    className={`truncate ${active ? 'text-[#F4F0E8]' : 'text-[#A69F93]'}`}
                  >
                    {seg.label}
                  </span>
                </span>
                <span className="font-mono-num text-[10.5px] text-[#DED7CB] shrink-0">
                  {safePlayed > 0 ? `${seg.count}局` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
