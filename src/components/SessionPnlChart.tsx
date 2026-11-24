import { useId, useMemo, useState } from 'react';
import type { SessionPnlPoint } from '../shared/sessionReview';

interface SessionPnlChartProps {
  points: SessionPnlPoint[];
  selectedHandNumber: number | null;
  onSelectHand: (handNumber: number) => void;
}

type PnlUnit = 'chips' | 'bb';

const CHART_W = 680;
const CHART_H = 166;
const PAD_LEFT = 46;
const PAD_RIGHT = 20;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;

function formatSigned(value: number, unit: PnlUnit): string {
  const formatted =
    unit === 'chips'
      ? Math.round(value).toLocaleString()
      : `${Number(value.toFixed(1))} BB`;
  return value > 0 ? `+${formatted}` : formatted;
}

export function SessionPnlChart({
  points,
  selectedHandNumber,
  onSelectHand,
}: SessionPnlChartProps) {
  const [unit, setUnit] = useState<PnlUnit>('chips');
  const [hoveredHand, setHoveredHand] = useState<number | null>(null);
  const gradientId = useId();

  const layout = useMemo(() => {
    const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
    const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;

    const rawValues = [0, ...points.map((p) => (unit === 'chips' ? p.cumulativeChips : p.cumulativeBB))];
    let minV = Math.min(...rawValues);
    let maxV = Math.max(...rawValues);

    if (minV === maxV) {
      const pad = unit === 'chips' ? 40 : 2;
      minV -= pad;
      maxV += pad;
    } else {
      const span = maxV - minV;
      minV -= span * 0.14;
      maxV += span * 0.14;
    }

    const toX = (index: number): number => {
      const count = points.length; // nodes are index 0 (origin) .. count
      if (count <= 0) return PAD_LEFT;
      return PAD_LEFT + (index / count) * plotW;
    };

    const toY = (v: number): number => {
      const ratio = (v - minV) / (maxV - minV);
      return PAD_TOP + (1 - ratio) * plotH;
    };

    const zeroY = toY(0);
    const originX = toX(0);
    const coords = points.map((pt, idx) => {
      const val = unit === 'chips' ? pt.cumulativeChips : pt.cumulativeBB;
      return {
        pt,
        x: toX(idx + 1),
        y: toY(val),
        val,
      };
    });

    const linePts = [
      `${originX.toFixed(1)},${zeroY.toFixed(1)}`,
      ...coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`),
    ];
    const linePath = linePts.map((xy, i) => `${i === 0 ? 'M' : 'L'} ${xy}`).join(' ');

    const lastX = coords.length > 0 ? coords[coords.length - 1].x : originX;
    const areaPath =
      coords.length > 0
        ? `${linePath} L ${lastX.toFixed(1)},${zeroY.toFixed(1)} L ${originX.toFixed(1)},${zeroY.toFixed(1)} Z`
        : '';

    const finalVal = coords.length > 0 ? coords[coords.length - 1].val : 0;
    const isPositive = finalVal >= 0;

    return {
      originX,
      zeroY,
      minV,
      maxV,
      coords,
      linePath,
      areaPath,
      isPositive,
      plotW,
    };
  }, [points, unit]);

  const activeHandNumber = hoveredHand ?? selectedHandNumber;
  const activePoint =
    points.find((p) => p.handNumber === activeHandNumber) ??
    points[points.length - 1] ??
    null;

  const strokeColor = layout.isPositive ? '#8CC9AA' : '#E07A7A';
  const hasBookmarked = points.some((p) => p.isBookmarked);
  const hasMistakes = points.some((p) => p.mistakeCount > 0);

  if (points.length === 0) return null;

  return (
    <div data-testid="session-pnl-chart" className="space-y-2.5">
      {/* Header + Dynamic Point Readout */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex flex-wrap items-baseline gap-2.5">
          <h3 className="text-xs font-semibold text-[#EAE6DC]">本场盈亏走势</h3>
          {activePoint && (
            <div
              data-testid="pnl-chart-readout"
              className="flex flex-wrap items-baseline gap-2 text-[11px] text-[#9AA5A0]"
            >
              <span className="font-mono-num text-[#D4A853]">
                第 {activePoint.handNumber} 局
              </span>
              {activePoint.canonicalHand && (
                <>
                  <span aria-hidden="true" className="text-white/20">·</span>
                  <span className="font-mono-num text-[#F3F1EC]">
                    {activePoint.canonicalHand}
                  </span>
                </>
              )}
              <span aria-hidden="true" className="text-white/20">·</span>
              <span
                className={`font-mono-num font-semibold ${
                  activePoint.netChips > 0
                    ? 'text-[#8CC9AA]'
                    : activePoint.netChips < 0
                      ? 'text-[#E07A7A]'
                      : 'text-[#C6D0CB]'
                }`}
              >
                单手 {formatSigned(unit === 'chips' ? activePoint.netChips : activePoint.netBB, unit)}
              </span>
              <span aria-hidden="true" className="text-white/20">·</span>
              <span className="font-mono-num text-[#C6D0CB]">
                累计{' '}
                {formatSigned(
                  unit === 'chips' ? activePoint.cumulativeChips : activePoint.cumulativeBB,
                  unit
                )}
              </span>
            </div>
          )}
        </div>

        {/* Restraint Unit Toggle */}
        <div className="inline-flex items-center border-b border-white/[0.08] text-[11px] shrink-0">
          <button
            type="button"
            data-testid="pnl-unit-chips"
            onClick={() => setUnit('chips')}
            className={`px-2.5 pb-1 border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
              unit === 'chips'
                ? 'border-[#D4A853] font-semibold text-[#E8CF96]'
                : 'border-transparent text-[#8B9590] hover:text-white'
            }`}
          >
            筹码
          </button>
          <button
            type="button"
            data-testid="pnl-unit-bb"
            onClick={() => setUnit('bb')}
            className={`px-2.5 pb-1 border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
              unit === 'bb'
                ? 'border-[#D4A853] font-semibold text-[#E8CF96]'
                : 'border-transparent text-[#8B9590] hover:text-white'
            }`}
          >
            BB
          </button>
        </div>
      </div>

      {/* SVG Curve (Unboxed directly on #0B0D0F ledger ground) */}
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="h-[158px] w-full select-none"
          role="img"
          aria-label="本场累计筹码盈亏走势折线图"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.24" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Subtle dashed horizontal grid lines */}
          <line
            x1={PAD_LEFT}
            y1={PAD_TOP}
            x2={CHART_W - PAD_RIGHT}
            y2={PAD_TOP}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
          <line
            x1={PAD_LEFT}
            y1={CHART_H - PAD_BOTTOM}
            x2={CHART_W - PAD_RIGHT}
            y2={CHART_H - PAD_BOTTOM}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
            strokeDasharray="2 3"
          />

          {/* Zero Baseline */}
          <line
            x1={PAD_LEFT}
            y1={layout.zeroY}
            x2={CHART_W - PAD_RIGHT}
            y2={layout.zeroY}
            stroke="rgba(255,255,255,0.16)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />

          {/* Y-Axis Labels (collision guard against 0 line) */}
          {Math.abs(layout.zeroY - PAD_TOP) >= 20 && (
            <text
              x={PAD_LEFT - 8}
              y={PAD_TOP + 4}
              textAnchor="end"
              fill="#7D8782"
              fontSize="10"
              className="font-mono-num"
            >
              {unit === 'chips'
                ? Math.round(layout.maxV).toLocaleString()
                : `${layout.maxV.toFixed(1)}`}
            </text>
          )}
          <text
            x={PAD_LEFT - 8}
            y={layout.zeroY + 3.5}
            textAnchor="end"
            fill="#9AA5A0"
            fontSize="10"
            className="font-mono-num"
          >
            0
          </text>
          {Math.abs(CHART_H - PAD_BOTTOM - layout.zeroY) >= 20 && (
            <text
              x={PAD_LEFT - 8}
              y={CHART_H - PAD_BOTTOM + 3}
              textAnchor="end"
              fill="#7D8782"
              fontSize="10"
              className="font-mono-num"
            >
              {unit === 'chips'
                ? Math.round(layout.minV).toLocaleString()
                : `${layout.minV.toFixed(1)}`}
            </text>
          )}

          {/* Area Fill */}
          {layout.areaPath && <path d={layout.areaPath} fill={`url(#${gradientId})`} />}

          {/* P&L Line */}
          <path
            d={layout.linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.85"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Origin Marker */}
          <circle
            cx={layout.originX}
            cy={layout.zeroY}
            r="2.5"
            fill="#7D8782"
          />

          {/* Interactive Hand Nodes */}
          {layout.coords.map(({ pt, x, y }) => {
            const isSelected = pt.handNumber === selectedHandNumber;
            const isHovered = pt.handNumber === hoveredHand;
            const nodeFill =
              pt.mistakeCount > 0
                ? '#E07A7A'
                : pt.isBookmarked
                  ? '#D4A853'
                  : pt.netChips >= 0
                    ? '#8CC9AA'
                    : '#9AA5A0';

            return (
              <g
                key={pt.handNumber}
                data-testid={`pnl-point-hand-${pt.handNumber}`}
                role="button"
                tabIndex={0}
                aria-label={`查看第 ${pt.handNumber} 局复盘`}
                className="cursor-pointer focus:outline-none"
                onMouseEnter={() => setHoveredHand(pt.handNumber)}
                onMouseLeave={() => setHoveredHand(null)}
                onClick={() => onSelectHand(pt.handNumber)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectHand(pt.handNumber);
                  }
                }}
              >
                {(isSelected || isHovered) && (
                  <line
                    x1={x}
                    y1={PAD_TOP}
                    x2={x}
                    y2={CHART_H - PAD_BOTTOM}
                    stroke="rgba(212,168,83,0.24)"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                  />
                )}

                <circle cx={x} cy={y} r="13" fill="transparent" />

                {pt.isBookmarked && (
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected || isHovered ? 8.5 : 7}
                    fill="none"
                    stroke="#D4A853"
                    strokeWidth="1.4"
                  />
                )}

                {isSelected && (
                  <circle
                    cx={x}
                    cy={y}
                    r="6"
                    fill="none"
                    stroke="#F5E4B8"
                    strokeWidth="1.4"
                    strokeOpacity="0.9"
                  />
                )}

                <circle
                  cx={x}
                  cy={y}
                  r={isSelected || isHovered ? 4.2 : 3}
                  fill={nodeFill}
                  stroke="#0B0D0F"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}

          {/* X-Axis Hand Labels */}
          {(() => {
            const tickIndices = new Set<number>([0, layout.coords.length - 1]);
            if (layout.coords.length >= 5) {
              tickIndices.add(Math.floor((layout.coords.length - 1) / 2));
            }
            return [...tickIndices]
              .sort((a, b) => a - b)
              .map((idx) => {
                const item = layout.coords[idx];
                if (!item) return null;
                return (
                  <text
                    key={`x-${item.pt.handNumber}`}
                    x={item.x}
                    y={CHART_H - 7}
                    textAnchor={
                      idx === 0
                        ? 'start'
                        : idx === layout.coords.length - 1
                          ? 'end'
                          : 'middle'
                    }
                    fill="#7D8782"
                    fontSize="10"
                    className="font-mono-num"
                  >
                    #{item.pt.handNumber}
                  </text>
                );
              });
          })()}
        </svg>
      </div>

      {/* Quiet Footer Hint */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#7D8782]">
        <span>点击节点可跳转至对应手牌的逐街记录</span>
        <div className="flex items-center gap-3">
          {hasBookmarked && (
            <span className="inline-flex items-center gap-1.5 text-[#E8CF96]">
              <span className="h-2 w-2 rounded-full border border-[#D4A853]" aria-hidden="true" />
              已标记
            </span>
          )}
          {hasMistakes && (
            <span className="inline-flex items-center gap-1.5 text-[#E07A7A]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E07A7A]" aria-hidden="true" />
              含失误
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
