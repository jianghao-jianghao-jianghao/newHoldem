import { useEffect, useState } from 'react';
import type { AvailableActions, PlayerAction } from '../shared/types';

interface ActionDockProps {
  available: AvailableActions | null;
  pot: number;
  bigBlind: number;
  handEvaluationName?: string | null;
  statusMessage: string;
  onAction: (action: PlayerAction) => void;
}

export function ActionDock({
  available,
  pot,
  bigBlind,
  handEvaluationName,
  statusMessage,
  onAction,
}: ActionDockProps) {
  const [raiseAmount, setRaiseAmount] = useState<number>(0);

  useEffect(() => {
    if (available?.canRaise) {
      setRaiseAmount(available.minRaiseTo);
    }
  }, [available?.minRaiseTo, available?.maxRaiseTo, available?.canRaise]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!available) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'f' && available.canFold) {
        e.preventDefault();
        onAction({ type: 'fold' });
      } else if ((key === 'c' || key === ' ') && (available.canCheck || available.canCall)) {
        e.preventDefault();
        onAction({ type: available.canCheck ? 'check' : 'call' });
      } else if (key === 'r' && available.canRaise) {
        e.preventDefault();
        onAction({ type: 'raise', amount: raiseAmount });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [available, raiseAmount, onAction]);

  if (!available) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/[0.07] bg-[#0B0E10]/88 backdrop-blur-md px-4 py-2.5">
        <div className="flex items-center gap-2.5 text-xs sm:text-sm text-[#B7C0BB]">
          <span>{statusMessage}</span>
          {handEvaluationName && (
            <>
              <span aria-hidden="true" className="text-white/20">·</span>
              <span className="font-medium text-[#E8CF96]">
                {handEvaluationName}
              </span>
            </>
          )}
        </div>
        <div className="text-[11px] text-[#6E7772] hidden sm:block">
          F 弃牌 · C/空格 让牌/跟注 · R 下注/加注
        </div>
      </div>
    );
  }

  const min = available.minRaiseTo;
  const max = available.maxRaiseTo;
  const clampedRaise = Math.max(min, Math.min(max, raiseAmount));

  const halfPot = Math.min(max, Math.max(min, min + Math.round(pot * 0.5)));
  const fullPot = Math.min(max, Math.max(min, min + pot));
  const twoX = Math.min(max, Math.max(min, min + bigBlind * 2));

  const raiseVerb = available.isOpeningBet ? '下注' : '加注至';

  return (
    <div
      data-testid="action-dock"
      className="flex flex-col gap-2.5 rounded-md border border-[#D4A853]/30 bg-[#0B0E10]/94 backdrop-blur-md px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-[0_12px_32px_rgba(0,0,0,0.48)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-[#D4A853]" aria-hidden="true" />
          <span className="font-semibold text-[#F0DFB3]">轮到你行动</span>
          {handEvaluationName && (
            <>
              <span aria-hidden="true" className="text-white/20">·</span>
              <span className="font-medium text-[#C8D0CC]">{handEvaluationName}</span>
            </>
          )}
        </div>

        {/* Quick raise sizing presets */}
        {available.canRaise && max > min && (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setRaiseAmount(min)}
              className="touch-manipulation rounded border border-white/[0.1] bg-[#14191B] px-2 py-1 text-[11px] font-medium text-[#C5CECA] hover:border-[#D4A853]/50 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              最小
            </button>
            <button
              type="button"
              onClick={() => setRaiseAmount(halfPot)}
              className="touch-manipulation rounded border border-white/[0.1] bg-[#14191B] px-2 py-1 text-[11px] font-medium text-[#C5CECA] hover:border-[#D4A853]/50 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              +1/2池
            </button>
            <button
              type="button"
              onClick={() => setRaiseAmount(fullPot)}
              className="touch-manipulation rounded border border-white/[0.1] bg-[#14191B] px-2 py-1 text-[11px] font-medium text-[#C5CECA] hover:border-[#D4A853]/50 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              +满池
            </button>
            <button
              type="button"
              onClick={() => setRaiseAmount(twoX)}
              className="touch-manipulation rounded border border-white/[0.1] bg-[#14191B] px-2 py-1 text-[11px] font-medium text-[#C5CECA] hover:border-[#D4A853]/50 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              +2BB
            </button>
            <button
              type="button"
              onClick={() => setRaiseAmount(max)}
              className="touch-manipulation rounded border border-[#D4A853]/40 bg-[#231D12] px-2 py-1 text-[11px] font-semibold text-[#E8CF96] hover:bg-[#312817] transition-colors whitespace-nowrap shrink-0"
            >
              全下
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onAction({ type: 'fold' })}
          className="touch-manipulation h-11 sm:h-10 flex-1 sm:flex-none rounded border border-[#DC2626]/40 bg-[#231214] px-4 sm:px-5 text-sm font-semibold text-[#FCA5A5] hover:bg-[#34181B] hover:text-white focus-visible:outline-2 focus-visible:outline-[#D4A853] transition-colors whitespace-nowrap shrink-0"
        >
          弃牌 <span className="hidden sm:inline ml-1 text-xs opacity-60">[F]</span>
        </button>

        {available.canCheck ? (
          <button
            type="button"
            onClick={() => onAction({ type: 'check' })}
            className="touch-manipulation h-11 sm:h-10 flex-1 sm:flex-none rounded border border-[#10B981]/40 bg-[#10241C] px-4 sm:px-6 text-sm font-semibold text-[#6EE7B7] hover:bg-[#153226] hover:text-white focus-visible:outline-2 focus-visible:outline-[#D4A853] transition-colors whitespace-nowrap shrink-0"
          >
            让牌 <span className="hidden sm:inline ml-1 text-xs opacity-60">[C]</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onAction({ type: 'call' })}
            className="touch-manipulation h-11 sm:h-10 flex-1 sm:flex-none rounded border border-[#10B981]/40 bg-[#10241C] px-4 sm:px-6 text-sm font-semibold text-[#6EE7B7] hover:bg-[#153226] hover:text-white focus-visible:outline-2 focus-visible:outline-[#D4A853] transition-colors whitespace-nowrap shrink-0"
          >
            跟注 <span className="font-mono-num">{available.callAmount}</span>
            <span className="hidden sm:inline ml-1.5 text-xs opacity-60">[C]</span>
          </button>
        )}

        {available.canRaise && (
          <div className="flex w-full sm:w-auto sm:flex-1 min-w-0 items-center gap-2.5 sm:pl-1">
            {max > min && (
              <input
                type="range"
                aria-label="加注金额"
                className="poker-slider flex-1 min-w-0"
                min={min}
                max={max}
                step={Math.max(1, Math.min(10, Math.floor(bigBlind / 2)))}
                value={clampedRaise}
                onChange={(e) => setRaiseAmount(Number(e.target.value))}
              />
            )}

            <button
              type="button"
              onClick={() => onAction({ type: 'raise', amount: clampedRaise })}
              className="touch-manipulation h-11 sm:h-10 rounded bg-[#D4A853] px-4 sm:px-5 text-sm font-bold text-[#0F1210] hover:bg-[#E1B968] focus-visible:outline-2 focus-visible:outline-white transition-colors whitespace-nowrap shrink-0"
            >
              {clampedRaise >= max ? '全下' : raiseVerb}{' '}
              <span className="font-mono-num">{clampedRaise}</span>
              <span className="hidden sm:inline ml-1.5 text-xs opacity-70">[R]</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
