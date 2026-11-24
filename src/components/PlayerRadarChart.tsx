import { useState } from 'react';
import type { PokerRadarAxis } from '../shared/playerInsights';

interface PlayerRadarChartProps {
  axes: PokerRadarAxis[];
  handsPlayed: number;
  aiCalibrated?: boolean;
}

const CX = 150;
const CY = 136;
const MAX_R = 84;
const RING_LEVELS = [25, 50, 75, 100];

function polarPoint(index: number, total: number, radius: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / total;
  return {
    x: CX + Math.cos(angle) * radius,
    y: CY + Math.sin(angle) * radius,
  };
}

function buildPolygonPoints(values: number[], total: number): string {
  return values
    .map((val, idx) => {
      const ratio = Math.max(0, Math.min(100, val)) / 100;
      const pt = polarPoint(idx, total, MAX_R * ratio);
      return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    })
    .join(' ');
}

export function PlayerRadarChart({
  axes,
  handsPlayed,
  aiCalibrated = false,
}: PlayerRadarChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = axes.length;
  const hasData = handsPlayed > 0;

  if (total === 0) return null;

  const benchmarkPoints = buildPolygonPoints(
    axes.map((a) => a.benchmark),
    total
  );
  const playerPoints = buildPolygonPoints(
    axes.map((a) => (hasData ? a.score : 0)),
    total
  );

  const focusedAxis = activeIndex !== null ? axes[activeIndex] ?? null : null;

  return (
    <div
      data-testid="player-radar-chart"
      className="flex flex-col justify-between"
    >
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-[#EAE6DC] whitespace-nowrap">
          六维雷达{aiCalibrated ? ' · 校准' : ''}
        </span>
        <div className="flex items-center gap-3 text-[10px] text-[#838D88] whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-2.5 bg-[#D4A853]" />
            <span>实测</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-2.5 border-t border-dashed border-[#8CC9AA]" />
            <span>GTO 基准</span>
          </span>
        </div>
      </div>

      <div className="relative mx-auto my-2 w-full max-w-[264px]">
        <svg
          viewBox="0 0 300 272"
          role="img"
          aria-label="德州扑克六维性格雷达图"
          className="h-auto w-full select-none overflow-visible"
        >
          {/* Concentric hexagonal hairline rings */}
          {RING_LEVELS.map((level) => {
            const pts = buildPolygonPoints(
              Array.from({ length: total }, () => level),
              total
            );
            return (
              <polygon
                key={level}
                points={pts}
                fill="none"
                stroke={
                  level === 100
                    ? 'rgba(255, 255, 255, 0.14)'
                    : 'rgba(255, 255, 255, 0.06)'
                }
                strokeWidth="1"
              />
            );
          })}

          {/* Spokes */}
          {axes.map((axis, idx) => {
            const outer = polarPoint(idx, total, MAX_R);
            const isActive = activeIndex === idx;
            return (
              <line
                key={axis.key}
                x1={CX}
                y1={CY}
                x2={outer.x}
                y2={outer.y}
                stroke={
                  isActive
                    ? 'rgba(212, 168, 83, 0.55)'
                    : 'rgba(255, 255, 255, 0.07)'
                }
                strokeWidth={isActive ? '1.15' : '0.9'}
              />
            );
          })}

          {/* GTO Balanced Benchmark Polygon */}
          <polygon
            points={benchmarkPoints}
            fill="rgba(140, 201, 170, 0.05)"
            stroke="rgba(140, 201, 170, 0.62)"
            strokeWidth="1.1"
            strokeDasharray="3 3"
          />

          {/* Player Persona Polygon */}
          {hasData && (
            <polygon
              data-testid="player-radar-polygon"
              points={playerPoints}
              fill="rgba(212, 168, 83, 0.18)"
              stroke="#D4A853"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          )}

          {/* Vertex Dots & Editorial Labels */}
          {axes.map((axis, idx) => {
            const valueRadius = hasData
              ? (MAX_R * Math.max(0, Math.min(100, axis.score))) / 100
              : 0;
            const dot = polarPoint(idx, total, valueRadius);
            const labelPt = polarPoint(idx, total, MAX_R + 24);
            const isActive = activeIndex === idx;

            let textAnchor: 'middle' | 'start' | 'end' = 'middle';
            let dx = 0;
            if (labelPt.x < CX - 18) {
              textAnchor = 'end';
              dx = 4;
            } else if (labelPt.x > CX + 18) {
              textAnchor = 'start';
              dx = -4;
            }

            const dyLabel = labelPt.y < CY - 45 ? -4 : labelPt.y > CY + 45 ? 4 : -1;

            return (
              <g
                key={axis.key}
                data-testid={`radar-axis-${axis.key}`}
                className="cursor-pointer"
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseLeave={() => setActiveIndex(null)}
                onClick={() => setActiveIndex((prev) => (prev === idx ? null : idx))}
              >
                {hasData && (
                  <>
                    <circle cx={dot.x} cy={dot.y} r={14} fill="transparent" />
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r={isActive ? 3.8 : 2.6}
                      fill={isActive ? '#F5E4B8' : '#D4A853'}
                      stroke="#0B0D0F"
                      strokeWidth="1.4"
                      pointerEvents="none"
                    />
                  </>
                )}

                <text
                  data-testid={`radar-axis-label-${axis.key}`}
                  x={labelPt.x + dx}
                  y={labelPt.y + dyLabel}
                  textAnchor={textAnchor}
                  className="transition-colors"
                  fill={isActive ? '#F5E4B8' : '#D2DCD7'}
                  fontSize="10.5"
                  fontWeight={isActive ? 600 : 500}
                >
                  {axis.label}
                </text>
                <text
                  x={labelPt.x + dx}
                  y={labelPt.y + dyLabel + 12}
                  textAnchor={textAnchor}
                  fill={isActive ? '#E8CF96' : '#7D8782'}
                  fontSize="9.5"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {axis.metricCode} {axis.rawLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Quiet Hairline Axis Readout */}
      <div className="flex min-h-[22px] items-center justify-between gap-2 border-t border-white/[0.08] pt-2.5 text-[10px] whitespace-nowrap">
        {focusedAxis ? (
          <>
            <span className="font-medium text-[#E8CF96] truncate">
              {focusedAxis.label} · {focusedAxis.rawLabel}
            </span>
            <span className="font-mono-num text-[#9AA5A0] shrink-0">
              {hasData ? focusedAxis.score : 0} / 基准 {focusedAxis.benchmark}
            </span>
          </>
        ) : (
          <span className="text-[#7D8782] truncate">
            {hasData ? '悬停任意维度查看实测与基准对比' : '完成首局实战后自动绘制'}
          </span>
        )}
      </div>
    </div>
  );
}
