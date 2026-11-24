import { useMemo, useState } from 'react';
import type { RangeMatrixCell } from '../shared/gtoWorkbench';

interface RangeStrategyMatrixProps {
  cells: RangeMatrixCell[];
  title: string;
  subtitle?: string;
  mode?: 'gto' | 'exploit';
  heroCanonicalHand?: string | null;
  testId?: string;
}

type MatrixFilterMode = 'all' | 'in_range';

const ACTION_COLORS = {
  raise: '#C25959', // Muted terracotta-crimson
  call: '#579D7E', // Muted sage-emerald
  check: '#52708B', // Muted slate-steel
  fold: '#191E22', // Deep obsidian charcoal
};

export function RangeStrategyMatrix({
  cells,
  title,
  subtitle,
  mode = 'gto',
  heroCanonicalHand = null,
  testId = 'gto-range-matrix',
}: RangeStrategyMatrixProps) {
  const [filterMode, setFilterMode] = useState<MatrixFilterMode>('all');
  const [pinnedHand, setPinnedHand] = useState<string | null>(heroCanonicalHand);
  const [hoveredHand, setHoveredHand] = useState<string | null>(null);

  const cellMap = useMemo(() => {
    const map = new Map<string, RangeMatrixCell>();
    for (const c of cells) {
      map.set(c.hand, c);
    }
    return map;
  }, [cells]);

  const activeCell: RangeMatrixCell | null = useMemo(() => {
    if (hoveredHand && cellMap.has(hoveredHand)) return cellMap.get(hoveredHand)!;
    if (pinnedHand && cellMap.has(pinnedHand)) return cellMap.get(pinnedHand)!;
    if (heroCanonicalHand && cellMap.has(heroCanonicalHand)) return cellMap.get(heroCanonicalHand)!;
    return cells[0] ?? null;
  }, [hoveredHand, pinnedHand, heroCanonicalHand, cellMap, cells]);

  // Aggregate macro range frequencies weighted by combos
  const macroSummary = useMemo(() => {
    let totalCombos = 0;
    let raiseW = 0;
    let callW = 0;
    let checkW = 0;
    let foldW = 0;

    for (const c of cells) {
      const w = Math.max(0.1, c.combos);
      totalCombos += w;
      raiseW += w * c.mix.raise;
      callW += w * c.mix.call;
      checkW += w * c.mix.check;
      foldW += w * c.mix.fold;
    }

    const denom = Math.max(1, totalCombos);
    return {
      raise: Math.round(raiseW / denom),
      call: Math.round(callW / denom),
      check: Math.round(checkW / denom),
      fold: Math.round(foldW / denom),
    };
  }, [cells]);

  return (
    <div data-testid={testId} className="space-y-3">
      {/* Header & Inline Filter Controls */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h4 className="text-xs font-semibold text-[#EAE6DC]">{title}</h4>
            {subtitle && <span className="text-[11px] text-[#7E8883]">{subtitle}</span>}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`cursor-pointer transition-colors ${
              filterMode === 'all' ? 'font-semibold text-[#E8CF96]' : 'text-[#7E8883] hover:text-white'
            }`}
          >
            全部 169 格
          </button>
          <span aria-hidden="true" className="text-white/15">|</span>
          <button
            type="button"
            onClick={() => setFilterMode('in_range')}
            className={`cursor-pointer transition-colors ${
              filterMode === 'in_range'
                ? 'font-semibold text-[#E8CF96]'
                : 'text-[#7E8883] hover:text-white'
            }`}
          >
            突出入池范围
          </button>
          {heroCanonicalHand && (
            <>
              <span aria-hidden="true" className="text-white/15">|</span>
              <button
                type="button"
                onClick={() => {
                  setPinnedHand(heroCanonicalHand);
                  setHoveredHand(null);
                }}
                className="cursor-pointer font-mono-num text-[#D4A853] hover:text-[#F0D9A3] transition-colors"
              >
                定位 {heroCanonicalHand}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Macro Range Bar + Legend */}
      <div className="space-y-1.5">
        <div className="flex h-1.5 w-full overflow-hidden rounded-sm bg-[#161B1E]">
          {macroSummary.raise > 0 && (
            <div
              style={{ width: `${macroSummary.raise}%`, backgroundColor: ACTION_COLORS.raise }}
              title={`加注/下注 ${macroSummary.raise}%`}
            />
          )}
          {macroSummary.call > 0 && (
            <div
              style={{ width: `${macroSummary.call}%`, backgroundColor: ACTION_COLORS.call }}
              title={`跟注 ${macroSummary.call}%`}
            />
          )}
          {macroSummary.check > 0 && (
            <div
              style={{ width: `${macroSummary.check}%`, backgroundColor: ACTION_COLORS.check }}
              title={`过牌 ${macroSummary.check}%`}
            />
          )}
          {macroSummary.fold > 0 && (
            <div
              style={{ width: `${macroSummary.fold}%`, backgroundColor: ACTION_COLORS.fold }}
              title={`弃牌 ${macroSummary.fold}%`}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 font-mono-num text-[10px] text-[#9AA5A0]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: ACTION_COLORS.raise }} />
              加注/下注 {macroSummary.raise}%
            </span>
            {macroSummary.call > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: ACTION_COLORS.call }} />
                跟注 {macroSummary.call}%
              </span>
            )}
            {macroSummary.check > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: ACTION_COLORS.check }} />
                过牌 {macroSummary.check}%
              </span>
            )}
            {macroSummary.fold > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px] border border-white/15" style={{ backgroundColor: ACTION_COLORS.fold }} />
                弃牌 {macroSummary.fold}%
              </span>
            )}
          </div>
          <span className="text-[#7E8883]">右上同花(s) · 左下非同花(o)</span>
        </div>
      </div>

      {/* 13x13 Canonical Matrix Grid */}
      <div
        className="grid grid-cols-13 gap-[1px] rounded border border-white/[0.08] bg-white/[0.07] p-[1px] select-none"
        style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}
        onMouseLeave={() => setHoveredHand(null)}
      >
        {cells.map((cell) => {
          const isSelected = activeCell?.hand === cell.hand;
          const isDimmed = filterMode === 'in_range' && cell.inRangePct < 35 && !cell.isHeroHand;
          const deltaShift = cell.deltaRaisePct ?? 0;
          const hasBigExploitShift = mode === 'exploit' && Math.abs(deltaShift) >= 8;

          // Build clean horizontal multi-stop linear gradient for exact stacked frequencies
          const rEnd = cell.mix.raise;
          const cEnd = rEnd + cell.mix.call;
          const chEnd = cEnd + cell.mix.check;
          const bgGradient = `linear-gradient(90deg, ${ACTION_COLORS.raise} 0% ${rEnd}%, ${ACTION_COLORS.call} ${rEnd}% ${cEnd}%, ${ACTION_COLORS.check} ${cEnd}% ${chEnd}%, ${ACTION_COLORS.fold} ${chEnd}% 100%)`;

          return (
            <button
              key={cell.hand}
              type="button"
              data-testid={`matrix-cell-${cell.hand}`}
              onMouseEnter={() => setHoveredHand(cell.hand)}
              onFocus={() => setHoveredHand(cell.hand)}
              onClick={() => setPinnedHand(cell.hand)}
              style={{ background: bgGradient }}
              className={`relative flex aspect-square items-center justify-center overflow-hidden text-[9px] sm:text-[10px] font-mono-num leading-none transition-opacity cursor-pointer focus:outline-none ${
                isDimmed ? 'opacity-25' : 'opacity-100'
              } ${
                cell.isHeroHand
                  ? 'ring-2 ring-inset ring-[#D4A853] z-10 font-bold text-white'
                  : isSelected
                    ? 'ring-1 ring-inset ring-white/85 z-10 font-semibold text-white'
                    : 'text-[#F3F1EC]/90 hover:ring-1 hover:ring-inset hover:ring-white/60'
              }`}
              title={`${cell.hand}: 加注 ${cell.mix.raise}% / 跟注 ${cell.mix.call}% / 过牌 ${cell.mix.check}% / 弃牌 ${cell.mix.fold}%`}
            >
              {/* Subtle top hairline for significant Node-Lock exploit delta */}
              {hasBigExploitShift && (
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 top-0 h-[2px] ${
                    deltaShift > 0 ? 'bg-[#D4A853]' : 'bg-[#8CC9AA]'
                  }`}
                />
              )}
              <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)] tracking-tight">
                {cell.hand}
              </span>
            </button>
          );
        })}
      </div>

      {/* Unboxed Cell Inspector Readout Bar (Zero Hover Jitter) */}
      {activeCell && (
        <div
          data-testid={`${testId}-inspector`}
          className="flex flex-wrap items-center justify-between gap-2 border-y border-white/[0.08] bg-[#090B0C] px-3 py-2 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono-num font-bold text-[#E8CF96]">{activeCell.hand}</span>
            {activeCell.isHeroHand && (
              <span className="text-[10px] font-semibold text-[#D4A853]">· 本局底牌</span>
            )}
            <span aria-hidden="true" className="text-white/20">|</span>
            <span className="font-mono-num text-[11px] text-[#9AA5A0]">
              存活 {activeCell.combos} 组合 · 权重 {activeCell.inRangePct}%
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono-num text-[11px]">
            <span className="text-[#E09B9B]">加注 {activeCell.mix.raise}%</span>
            {activeCell.mix.call > 0 && (
              <span className="text-[#8CC9AA]">跟注 {activeCell.mix.call}%</span>
            )}
            {activeCell.mix.check > 0 && (
              <span className="text-[#9AB5CC]">过牌 {activeCell.mix.check}%</span>
            )}
            {activeCell.mix.fold > 0 && (
              <span className="text-[#8A9490]">弃牌 {activeCell.mix.fold}%</span>
            )}
            <span aria-hidden="true" className="text-white/20">|</span>
            <span
              className={`font-semibold ${
                activeCell.evBB >= 0 ? 'text-[#8CC9AA]' : 'text-[#E07A7A]'
              }`}
            >
              EV {activeCell.evBB >= 0 ? `+${activeCell.evBB.toFixed(2)}` : activeCell.evBB.toFixed(2)} BB
            </span>
            {mode === 'exploit' && typeof activeCell.deltaRaisePct === 'number' && (
              <span
                className={`font-semibold ${
                  activeCell.deltaRaisePct > 0
                    ? 'text-[#D4A853]'
                    : activeCell.deltaRaisePct < 0
                      ? 'text-[#8CC9AA]'
                      : 'text-[#7E8883]'
                }`}
              >
                (频差 {activeCell.deltaRaisePct >= 0 ? `+${activeCell.deltaRaisePct}` : activeCell.deltaRaisePct}%)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
