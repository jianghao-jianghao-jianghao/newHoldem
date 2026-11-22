import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { AvailableActions, PlayerAction } from '../shared/types';

interface ActionDockProps {
  available: AvailableActions | null;
  pot: number;
  bigBlind: number;
  myCurrentBet?: number;
  handEvaluationName?: string | null;
  statusMessage: string;
  disabled?: boolean;
  disabledReason?: string;
  hotkeysDisabled?: boolean;
  onAction: (action: PlayerAction) => void;
}

export function ActionDock({
  available,
  pot,
  bigBlind,
  myCurrentBet = 0,
  handEvaluationName,
  statusMessage,
  disabled = false,
  disabledReason,
  hotkeysDisabled = false,
  onAction,
}: ActionDockProps) {
  const [raiseAmount, setRaiseAmount] = useState<number>(0);

  useEffect(() => {
    if (available?.canRaise) {
      setRaiseAmount(available.minRaiseTo);
    }
  }, [available?.minRaiseTo, available?.maxRaiseTo, available?.canRaise]);

  const min = available?.minRaiseTo ?? 0;
  const max = available?.maxRaiseTo ?? 0;
  const clampedRaise = available
    ? Math.max(min, Math.min(max, raiseAmount || min))
    : 0;

  // Keyboard shortcuts (strictly ignores Ctrl/Meta/Alt combos, inputs, disabled state, and open modals/chat)
  useEffect(() => {
    if (!available || hotkeysDisabled || disabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (
        key === ' ' &&
        target &&
        target.closest('button, a, [role="button"], [role="menuitem"], summary')
      ) {
        return;
      }

      if (key === 'f' && available.canFold) {
        e.preventDefault();
        onAction({ type: 'fold' });
      } else if ((key === 'c' || key === ' ') && (available.canCheck || available.canCall)) {
        e.preventDefault();
        onAction({ type: available.canCheck ? 'check' : 'call' });
      } else if (key === 'r' && available.canRaise) {
        e.preventDefault();
        onAction({ type: 'raise', amount: clampedRaise });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [available, hotkeysDisabled, disabled, clampedRaise, onAction]);

  // Standard Texas Hold'em pot-fraction sizing presets, deduplicated cleanly
  const raisePresets = useMemo(() => {
    if (!available?.canRaise || max <= min) return [];
    const callToMatch = available.callAmount;
    const potAfterCall = pot + callToMatch;
    const baseAfterCall = myCurrentBet + callToMatch;

    const calcFractionTarget = (fraction: number) => {
      const raw = available.isOpeningBet
        ? Math.round(pot * fraction)
        : baseAfterCall + Math.round(potAfterCall * fraction);
      return Math.max(min, Math.min(max, raw));
    };

    const candidates: Array<{ id: string; label: string; amount: number; accent?: boolean }> = [
      { id: 'min', label: '最小', amount: min },
      { id: 'half', label: '1/2池', amount: calcFractionTarget(0.5) },
      { id: 'twothirds', label: '2/3池', amount: calcFractionTarget(2 / 3) },
      { id: 'pot', label: '满池', amount: calcFractionTarget(1) },
      { id: 'allin', label: '全下', amount: max, accent: true },
    ];

    const seen = new Set<number>();
    const deduped: typeof candidates = [];
    for (const item of candidates) {
      if (item.id !== 'allin' && seen.has(item.amount)) continue;
      if (item.id === 'allin' && seen.has(item.amount)) {
        const idx = deduped.findIndex((d) => d.amount === item.amount);
        if (idx >= 0) deduped.splice(idx, 1);
      }
      seen.add(item.amount);
      deduped.push(item);
    }
    return deduped;
  }, [available, min, max, pot, myCurrentBet]);

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

  const raiseVerb = available.isOpeningBet ? '下注' : '加注至';
  const stepUnit = Math.max(1, Math.min(bigBlind, Math.max(5, Math.floor(bigBlind / 2))));

  return (
    <div
      data-testid="action-dock"
      aria-disabled={disabled || undefined}
      className={`flex flex-col gap-2.5 rounded-md border bg-[#0B0E10]/94 backdrop-blur-md px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-[0_12px_32px_rgba(0,0,0,0.48)] ${
        disabled ? 'border-[#D4A853]/20 opacity-85' : 'border-[#D4A853]/30'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              disabled ? 'bg-[#F59E0B] animate-pulse' : 'bg-[#D4A853]'
            }`}
            aria-hidden="true"
          />
          <span
            data-testid={disabled ? 'action-dock-reconnecting' : 'action-dock-turn-label'}
            className="font-semibold text-[#F0DFB3]"
          >
            {disabled ? (disabledReason ?? '网络重连中，请稍候…') : '轮到你行动'}
          </span>
          {handEvaluationName && (
            <>
              <span aria-hidden="true" className="text-white/20">·</span>
              <span className="font-medium text-[#C8D0CC]">{handEvaluationName}</span>
            </>
          )}
        </div>

        {/* Standard Texas Hold'em pot-fraction sizing presets with exact amounts */}
        {raisePresets.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {raisePresets.map((preset) => {
              const isSelected = clampedRaise === preset.amount;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setRaiseAmount(preset.amount)}
                  className={`touch-manipulation inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed ${
                    preset.accent
                      ? isSelected
                        ? 'border-[#D4A853] bg-[#362C19] font-semibold text-[#FAF0D7]'
                        : 'border-[#D4A853]/40 bg-[#231D12] font-semibold text-[#E8CF96] hover:bg-[#312817]'
                      : isSelected
                        ? 'border-[#D4A853]/65 bg-[#D4A853]/15 text-[#F5E4B8]'
                        : 'border-white/[0.1] bg-[#14191B] text-[#C5CECA] hover:border-[#D4A853]/50 hover:text-white'
                  }`}
                >
                  <span>{preset.label}</span>
                  <span className="font-mono-num text-[10px] opacity-75">
                    {preset.amount}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAction({ type: 'fold' })}
          className="touch-manipulation h-11 sm:h-10 flex-1 sm:flex-none rounded border border-[#DC2626]/40 bg-[#231214] px-4 sm:px-5 text-sm font-semibold text-[#FCA5A5] hover:bg-[#34181B] hover:text-white focus-visible:outline-2 focus-visible:outline-[#D4A853] transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
        >
          弃牌 <span className="hidden sm:inline ml-1 text-xs opacity-60">[F]</span>
        </button>

        {available.canCheck ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction({ type: 'check' })}
            className="touch-manipulation h-11 sm:h-10 flex-1 sm:flex-none rounded border border-[#10B981]/40 bg-[#10241C] px-4 sm:px-6 text-sm font-semibold text-[#6EE7B7] hover:bg-[#153226] hover:text-white focus-visible:outline-2 focus-visible:outline-[#D4A853] transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            让牌 <span className="hidden sm:inline ml-1 text-xs opacity-60">[C]</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction({ type: 'call' })}
            className="touch-manipulation h-11 sm:h-10 flex-1 sm:flex-none rounded border border-[#10B981]/40 bg-[#10241C] px-4 sm:px-6 text-sm font-semibold text-[#6EE7B7] hover:bg-[#153226] hover:text-white focus-visible:outline-2 focus-visible:outline-[#D4A853] transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            跟注 <span className="font-mono-num">{available.callAmount}</span>
            <span className="hidden sm:inline ml-1.5 text-xs opacity-60">[C]</span>
          </button>
        )}

        {available.canRaise && (
          <div className="flex w-full sm:w-auto sm:flex-1 min-w-0 items-center gap-2 sm:pl-1">
            {max > min && (
              <>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setRaiseAmount((prev) => Math.max(min, prev - bigBlind))}
                  aria-label="减少 1 个大盲注"
                  className="touch-manipulation flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/[0.1] bg-[#14191B] text-[#B8C2BD] hover:border-[#D4A853]/50 hover:text-white transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <input
                  type="range"
                  disabled={disabled}
                  aria-label="加注金额"
                  className="poker-slider flex-1 min-w-0 disabled:opacity-45 disabled:cursor-not-allowed"
                  min={min}
                  max={max}
                  step={stepUnit}
                  value={clampedRaise}
                  onChange={(e) => setRaiseAmount(Number(e.target.value))}
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setRaiseAmount((prev) => Math.min(max, prev + bigBlind))}
                  aria-label="增加 1 个大盲注"
                  className="touch-manipulation flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/[0.1] bg-[#14191B] text-[#B8C2BD] hover:border-[#D4A853]/50 hover:text-white transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </>
            )}

            <button
              type="button"
              disabled={disabled}
              onClick={() => onAction({ type: 'raise', amount: clampedRaise })}
              className="touch-manipulation h-11 sm:h-10 rounded bg-[#D4A853] px-4 sm:px-5 text-sm font-bold text-[#0F1210] hover:bg-[#E1B968] focus-visible:outline-2 focus-visible:outline-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
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
