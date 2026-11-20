import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type {
  BlindRoleTarget,
  ClientPlayerView,
  ClientTableView,
  ManualBlindTarget,
} from '../shared/types';

interface BlindSettingsModalProps {
  open: boolean;
  table: ClientTableView;
  onSave: (params: {
    smallBlind: number;
    bigBlind: number;
    manualBlindTarget: ManualBlindTarget | null;
  }) => void;
  onClose: () => void;
}

const BLIND_PRESETS = [
  { label: '5 / 10', sb: 5, bb: 10 },
  { label: '10 / 20', sb: 10, bb: 20 },
  { label: '25 / 50', sb: 25, bb: 50 },
  { label: '50 / 100', sb: 50, bb: 100 },
  { label: '100 / 200', sb: 100, bb: 200 },
] as const;

function previewSeatsClient(
  players: ClientPlayerView[],
  currentDealerSeat: number,
  target: ManualBlindTarget | null
): {
  dealerSeatIndex: number | null;
  smallBlindSeatIndex: number | null;
  bigBlindSeatIndex: number | null;
} {
  const eligible = [...players]
    .filter((p) => p.chips > 0)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  if (eligible.length < 2) {
    return {
      dealerSeatIndex: null,
      smallBlindSeatIndex: null,
      bigBlindSeatIndex: null,
    };
  }

  const nextAfter = (seat: number) =>
    eligible.find((p) => p.seatIndex > seat) ?? eligible[0];
  const prevBefore = (seat: number) =>
    [...eligible].reverse().find((p) => p.seatIndex < seat) ??
    eligible[eligible.length - 1];

  const matched = target
    ? eligible.find((p) => p.seatIndex === target.seatIndex) ?? null
    : null;

  let dealer: ClientPlayerView;
  let sb: ClientPlayerView;
  let bb: ClientPlayerView;

  if (matched && target) {
    if (target.role === 'dealer') {
      dealer = matched;
      sb = eligible.length === 2 ? dealer : nextAfter(dealer.seatIndex);
      bb = nextAfter(sb.seatIndex);
    } else if (target.role === 'sb') {
      sb = matched;
      if (eligible.length === 2) {
        dealer = sb;
        bb = nextAfter(sb.seatIndex);
      } else {
        dealer = prevBefore(sb.seatIndex);
        bb = nextAfter(sb.seatIndex);
      }
    } else {
      bb = matched;
      if (eligible.length === 2) {
        sb = nextAfter(bb.seatIndex);
        dealer = sb;
      } else {
        sb = prevBefore(bb.seatIndex);
        dealer = prevBefore(sb.seatIndex);
      }
    }
  } else {
    dealer = nextAfter(currentDealerSeat);
    sb = eligible.length === 2 ? dealer : nextAfter(dealer.seatIndex);
    bb = nextAfter(sb.seatIndex);
  }

  return {
    dealerSeatIndex: dealer.seatIndex,
    smallBlindSeatIndex: sb.seatIndex,
    bigBlindSeatIndex: bb.seatIndex,
  };
}

export function BlindSettingsModal({
  open,
  table,
  onSave,
  onClose,
}: BlindSettingsModalProps) {
  const [sbInput, setSbInput] = useState(
    String(table.pendingBlinds?.smallBlind ?? table.smallBlind)
  );
  const [bbInput, setBbInput] = useState(
    String(table.pendingBlinds?.bigBlind ?? table.bigBlind)
  );
  const [manualTarget, setManualTarget] = useState<ManualBlindTarget | null>(
    table.manualBlindTarget
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSbInput(String(table.pendingBlinds?.smallBlind ?? table.smallBlind));
    setBbInput(String(table.pendingBlinds?.bigBlind ?? table.bigBlind));
    setManualTarget(table.manualBlindTarget);
    setError(null);
  }, [open, table.smallBlind, table.bigBlind, table.pendingBlinds, table.manualBlindTarget]);

  const sortedPlayers = useMemo(
    () => [...table.players].sort((a, b) => a.seatIndex - b.seatIndex),
    [table.players]
  );

  const preview = useMemo(
    () => previewSeatsClient(sortedPlayers, table.dealerSeatIndex, manualTarget),
    [sortedPlayers, table.dealerSeatIndex, manualTarget]
  );

  if (!open) return null;

  const isBetweenHands = table.phase === 'waiting' || table.phase === 'showdown';
  const eligibleCount = sortedPlayers.filter((p) => p.chips > 0).length;

  const handleToggleRole = (seatIndex: number, role: BlindRoleTarget) => {
    if (
      manualTarget &&
      manualTarget.seatIndex === seatIndex &&
      manualTarget.role === role
    ) {
      setManualTarget(null);
    } else {
      setManualTarget({ role, seatIndex });
    }
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sb = Math.floor(Number(sbInput));
    const bb = Math.floor(Number(bbInput));
    if (
      !Number.isFinite(sb) ||
      !Number.isFinite(bb) ||
      sb < 1 ||
      sb > 5000 ||
      bb <= sb ||
      bb > 10000
    ) {
      setError('小盲需在 1–5000 之间，且大盲须大于小盲（上限 10000）');
      return;
    }
    onSave({
      smallBlind: sb,
      bigBlind: bb,
      manualBlindTarget: manualTarget,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="设置大小盲位"
      data-testid="blind-settings-modal"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/78 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-[#D4A853]/35 bg-[#0D1012] p-5 text-[#F3F1EC] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#D4A853]" aria-hidden="true" />
            <h2 className="text-base font-bold tracking-wide text-[#F5E4B8]">
              设置大小盲位
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭大小盲设置"
            className="flex h-8 w-8 items-center justify-center rounded border border-white/[0.1] bg-[#14181B] text-[#9AA5A0] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          {/* 1. Blind Amounts */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#DEDAD2]">
                盲注额度（小盲 SB / 大盲 BB）
              </span>
              <span className="text-[11px] text-[#8E9893]">
                {isBetweenHands ? '保存后立即生效' : '牌局进行中，保存后将在下一局生效'}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {BLIND_PRESETS.map((preset) => {
                const active =
                  Number(sbInput) === preset.sb && Number(bbInput) === preset.bb;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setSbInput(String(preset.sb));
                      setBbInput(String(preset.bb));
                      setError(null);
                    }}
                    className={`font-mono-num h-8 rounded border text-xs font-semibold transition-colors ${
                      active
                        ? 'border-[#D4A853] bg-[#D4A853]/18 text-[#F5E4B8]'
                        : 'border-white/[0.1] bg-[#080A0B] text-[#98A49F] hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="blind-sb-input"
                  className="block text-[11px] text-[#98A49F] mb-1"
                >
                  小盲 (SB)
                </label>
                <input
                  id="blind-sb-input"
                  data-testid="blind-sb-input"
                  type="number"
                  min={1}
                  max={5000}
                  value={sbInput}
                  onChange={(e) => {
                    setSbInput(e.target.value);
                    setError(null);
                  }}
                  className="font-mono-num h-9 w-full rounded border border-white/[0.12] bg-[#080A0B] px-3 text-sm text-[#F3F1EC] focus:border-[#D4A853] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="blind-bb-input"
                  className="block text-[11px] text-[#98A49F] mb-1"
                >
                  大盲 (BB)
                </label>
                <input
                  id="blind-bb-input"
                  data-testid="blind-bb-input"
                  type="number"
                  min={2}
                  max={10000}
                  value={bbInput}
                  onChange={(e) => {
                    setBbInput(e.target.value);
                    setError(null);
                  }}
                  className="font-mono-num h-9 w-full rounded border border-white/[0.12] bg-[#080A0B] px-3 text-sm text-[#E8CF96] focus:border-[#D4A853] focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* 2. Blind Seat Position Assignment */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#DEDAD2]">
                下局大小盲位安排
              </span>
              <button
                type="button"
                data-testid="blind-auto-rotate-btn"
                onClick={() => setManualTarget(null)}
                className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  manualTarget === null
                    ? 'border-[#5E9E82]/60 bg-[#0D1E17] text-[#9AD4B8]'
                    : 'border-white/[0.12] bg-[#131719] text-[#98A49F] hover:text-white'
                }`}
              >
                {manualTarget === null ? '已选：自动顺时针轮转' : '恢复自动轮转'}
              </button>
            </div>

            {eligibleCount < 2 ? (
              <div className="rounded border border-white/[0.08] bg-[#090B0C] px-3 py-3 text-xs text-[#8E9893]">
                当前有效筹码玩家不足 2 人，入座 2 人后即可指定下局小盲 (SB) / 大盲 (BB) / 庄位 (D)。
              </div>
            ) : (
              <div className="max-h-52 space-y-1.5 overflow-y-auto pr-0.5">
                {sortedPlayers.map((p) => {
                  const hasChips = p.chips > 0;
                  const isPreviewD = preview.dealerSeatIndex === p.seatIndex;
                  const isPreviewSb = preview.smallBlindSeatIndex === p.seatIndex;
                  const isPreviewBb = preview.bigBlindSeatIndex === p.seatIndex;
                  const isPinnedD =
                    manualTarget?.seatIndex === p.seatIndex &&
                    manualTarget.role === 'dealer';
                  const isPinnedSb =
                    manualTarget?.seatIndex === p.seatIndex &&
                    manualTarget.role === 'sb';
                  const isPinnedBb =
                    manualTarget?.seatIndex === p.seatIndex &&
                    manualTarget.role === 'bb';

                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded border border-white/[0.08] bg-[#090B0D] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-[#F3F1EC]">
                            {p.name}
                          </span>
                          <span className="font-mono-num text-[10px] text-[#7D8782]">
                            #{p.seatIndex + 1}
                          </span>
                          {isPreviewD && (
                            <span className="rounded bg-[#D4A853]/20 px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-[#F5E4B8]">
                              下局庄 D
                            </span>
                          )}
                          {isPreviewSb && (
                            <span className="rounded bg-[#5E9E82]/20 px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-[#9AD4B8]">
                              下局 SB
                            </span>
                          )}
                          {isPreviewBb && (
                            <span className="rounded bg-[#C97B48]/22 px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-[#F2B88B]">
                              下局 BB
                            </span>
                          )}
                        </div>
                        <div className="font-mono-num text-[11px] text-[#8E9893]">
                          筹码 {p.chips.toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={!hasChips}
                          data-testid={`assign-sb-seat-${p.seatIndex}`}
                          onClick={() => handleToggleRole(p.seatIndex, 'sb')}
                          className={`h-7 rounded border px-2 font-mono-num text-[11px] font-semibold transition-colors disabled:opacity-35 ${
                            isPinnedSb
                              ? 'border-[#5E9E82] bg-[#5E9E82]/25 text-[#B4EAD0]'
                              : 'border-white/[0.1] bg-[#121618] text-[#A2ADA8] hover:text-white'
                          }`}
                        >
                          设为小盲
                        </button>
                        <button
                          type="button"
                          disabled={!hasChips}
                          data-testid={`assign-bb-seat-${p.seatIndex}`}
                          onClick={() => handleToggleRole(p.seatIndex, 'bb')}
                          className={`h-7 rounded border px-2 font-mono-num text-[11px] font-semibold transition-colors disabled:opacity-35 ${
                            isPinnedBb
                              ? 'border-[#D4A853] bg-[#D4A853]/25 text-[#F7E5B7]'
                              : 'border-white/[0.1] bg-[#121618] text-[#A2ADA8] hover:text-white'
                          }`}
                        >
                          设为大盲
                        </button>
                        <button
                          type="button"
                          disabled={!hasChips}
                          data-testid={`assign-dealer-seat-${p.seatIndex}`}
                          onClick={() => handleToggleRole(p.seatIndex, 'dealer')}
                          className={`h-7 rounded border px-2 font-mono-num text-[11px] font-semibold transition-colors disabled:opacity-35 ${
                            isPinnedD
                              ? 'border-[#E8CF96] bg-[#E8CF96]/25 text-[#FFF0C2]'
                              : 'border-white/[0.1] bg-[#121618] text-[#A2ADA8] hover:text-white'
                          }`}
                        >
                          庄
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-[#7D8782]">
              双人桌规则：庄位 (D) 同时担任小盲位 (SB)；三人及以上桌按顺时针依次为 D → SB → BB。指定一次后下一局自动延续顺时针轮转。
            </p>
          </section>

          {error && (
            <div className="rounded border border-[#DC2626]/40 bg-[#231214] px-3 py-2 text-xs text-[#FCA5A5]">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-white/[0.08] pt-3">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded border border-white/[0.12] bg-[#131719] px-4 text-xs font-medium text-[#C5CECA] hover:text-white transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              data-testid="save-blind-settings-btn"
              className="h-9 rounded bg-[#D4A853] px-4 text-xs font-bold text-[#0F1210] hover:bg-[#E1B968] transition-colors"
            >
              保存设置
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
