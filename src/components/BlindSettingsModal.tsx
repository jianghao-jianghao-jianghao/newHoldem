import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type {
  BlindRoleTarget,
  BotChatStatus,
  ClientPlayerView,
  ClientTableView,
  ManualBlindTarget,
} from '../shared/types';

export interface BotChatConfigRequest {
  enabled: boolean;
  apiKey?: string;
  clearKey?: boolean;
  testConnection?: boolean;
}

type SettingsTab = 'blinds' | 'companion';

interface BlindSettingsModalProps {
  open: boolean;
  table: ClientTableView;
  isHost: boolean;
  botChatStatus?: BotChatStatus;
  bgmEnabled?: boolean;
  muted?: boolean;
  onToggleBgm?: () => void;
  onToggleMute?: () => void;
  onSave: (params: {
    smallBlind: number;
    bigBlind: number;
    manualBlindTarget: ManualBlindTarget | null;
  }) => void;
  onConfigureBotChat?: (
    params: BotChatConfigRequest
  ) => Promise<{ ok: boolean; error?: string; status?: BotChatStatus }>;
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
  isHost,
  botChatStatus = { enabled: false, configured: false, source: 'none' },
  bgmEnabled = true,
  muted = false,
  onToggleBgm,
  onToggleMute,
  onSave,
  onConfigureBotChat,
  onClose,
}: BlindSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('blinds');
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

  // Bot chat & companion settings state (moved cleanly out of TableChatPanel)
  const [botEnabledDraft, setBotEnabledDraft] = useState(botChatStatus.enabled);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [botSaving, setBotSaving] = useState(false);
  const [botFeedback, setBotFeedback] = useState<{
    tone: 'ok' | 'err';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setSbInput(String(table.pendingBlinds?.smallBlind ?? table.smallBlind));
    setBbInput(String(table.pendingBlinds?.bigBlind ?? table.bigBlind));
    setManualTarget(table.manualBlindTarget);
    setBotEnabledDraft(botChatStatus.enabled);
    setError(null);
    setBotFeedback(null);
  }, [
    open,
    table.smallBlind,
    table.bigBlind,
    table.pendingBlinds,
    table.manualBlindTarget,
    botChatStatus.enabled,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
    if (!isHost) return;
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

  const handleBlindSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHost) return;
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

  const handleSaveBotChat = async (testConnection: boolean) => {
    if (!onConfigureBotChat || botSaving) return;
    setBotSaving(true);
    setBotFeedback(null);
    const trimmedKey = apiKeyDraft.trim();
    const res = await onConfigureBotChat({
      enabled: botEnabledDraft,
      apiKey: trimmedKey || undefined,
      testConnection,
    });
    setBotSaving(false);
    if (!res.ok) {
      setBotFeedback({ tone: 'err', text: res.error ?? '保存失败，请检查配置' });
      return;
    }
    if (trimmedKey) setApiKeyDraft('');
    setBotFeedback({
      tone: 'ok',
      text: res.status?.enabled
        ? testConnection
          ? '连通成功，陪练已开启牌桌互动'
          : '已启用陪练互动'
        : '已关闭陪练互动',
    });
  };

  const handleClearBotKey = async () => {
    if (!onConfigureBotChat || botSaving) return;
    setBotSaving(true);
    setBotFeedback(null);
    const res = await onConfigureBotChat({
      enabled: false,
      clearKey: true,
    });
    setBotSaving(false);
    if (!res.ok) {
      setBotFeedback({ tone: 'err', text: res.error ?? '清除失败' });
      return;
    }
    setApiKeyDraft('');
    setBotEnabledDraft(false);
    setBotFeedback({ tone: 'ok', text: '已清除本桌密钥并关闭陪练互动' });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="牌桌设置"
      data-testid="blind-settings-modal"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/78 p-4 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-white/[0.11] bg-[#0C0F11] text-[#F3F1EC] shadow-[0_28px_72px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Clean Editorial Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <h2 className="font-display text-lg font-medium tracking-wide text-[#F4EFE4]">
              牌桌设置
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭牌桌设置"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#8B9691] hover:bg-white/[0.07] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Minimal Underline Tabs */}
        <div className="flex items-center gap-6 border-b border-white/[0.08] px-6 text-xs">
          <button
            type="button"
            data-testid="settings-tab-blinds"
            onClick={() => setActiveTab('blinds')}
            className={`relative pb-2.5 font-medium transition-colors ${
              activeTab === 'blinds'
                ? 'text-[#F0DFB3]'
                : 'text-[#87928C] hover:text-[#D5DDD8]'
            }`}
          >
            盲注与盲位
            {activeTab === 'blinds' && (
              <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#D4A853]" />
            )}
          </button>

          <button
            type="button"
            data-testid="settings-tab-companion"
            onClick={() => setActiveTab('companion')}
            className={`relative pb-2.5 font-medium transition-colors ${
              activeTab === 'companion'
                ? 'text-[#F0DFB3]'
                : 'text-[#87928C] hover:text-[#D5DDD8]'
            }`}
          >
            陪练与声音
            {activeTab === 'companion' && (
              <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#D4A853]" />
            )}
          </button>
        </div>

        {/* Tab 1: Blinds & Seat Positions */}
        {activeTab === 'blinds' && (
          <form onSubmit={handleBlindSubmit} className="p-6 space-y-5">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#D6DDD9]">
                  盲注额度（SB / BB）
                </span>
                <span className="text-[11px] text-[#7D8882]">
                  {!isHost
                    ? '仅房主可修改盲注'
                    : isBetweenHands
                      ? '保存后立即生效'
                      : '保存后将于下一局生效'}
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
                      disabled={!isHost}
                      onClick={() => {
                        setSbInput(String(preset.sb));
                        setBbInput(String(preset.bb));
                        setError(null);
                      }}
                      className={`font-mono-num h-8 rounded-md border text-xs font-medium transition-colors disabled:opacity-50 ${
                        active
                          ? 'border-[#D4A853]/80 bg-[#D4A853]/14 text-[#F5E4B8]'
                          : 'border-white/[0.08] bg-[#080A0B] text-[#94A09B] hover:text-white'
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
                    className="mb-1 block text-[11px] text-[#8E9994]"
                  >
                    小盲 (SB)
                  </label>
                  <input
                    id="blind-sb-input"
                    data-testid="blind-sb-input"
                    type="number"
                    min={1}
                    max={5000}
                    disabled={!isHost}
                    value={sbInput}
                    onChange={(e) => {
                      setSbInput(e.target.value);
                      setError(null);
                    }}
                    className="font-mono-num h-9 w-full rounded-md border border-white/[0.1] bg-[#07090A] px-3 text-sm text-[#F3F1EC] focus:border-[#D4A853]/70 focus:outline-none disabled:opacity-55"
                  />
                </div>
                <div>
                  <label
                    htmlFor="blind-bb-input"
                    className="mb-1 block text-[11px] text-[#8E9994]"
                  >
                    大盲 (BB)
                  </label>
                  <input
                    id="blind-bb-input"
                    data-testid="blind-bb-input"
                    type="number"
                    min={2}
                    max={10000}
                    disabled={!isHost}
                    value={bbInput}
                    onChange={(e) => {
                      setBbInput(e.target.value);
                      setError(null);
                    }}
                    className="font-mono-num h-9 w-full rounded-md border border-white/[0.1] bg-[#07090A] px-3 text-sm text-[#E8CF96] focus:border-[#D4A853]/70 focus:outline-none disabled:opacity-55"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#D6DDD9]">
                  下局盲位安排
                </span>
                {isHost && (
                  <button
                    type="button"
                    data-testid="blind-auto-rotate-btn"
                    onClick={() => setManualTarget(null)}
                    className={`text-[11px] transition-colors ${
                      manualTarget === null
                        ? 'text-[#88C9AA]'
                        : 'text-[#8E9994] hover:text-white underline underline-offset-2'
                    }`}
                  >
                    {manualTarget === null ? '自动顺时针轮转' : '恢复自动轮转'}
                  </button>
                )}
              </div>

              {eligibleCount < 2 ? (
                <div className="rounded-md border border-white/[0.07] bg-[#080A0C] px-3.5 py-3 text-xs text-[#84908A]">
                  入座 2 名以上有筹码玩家后可预览或指定下局庄位与大小盲位。
                </div>
              ) : (
                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
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
                        className="flex items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-[#090B0D] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-[#F3F1EC]">
                              {p.name}
                            </span>
                            <span className="font-mono-num text-[10px] text-[#6E7873]">
                              #{p.seatIndex + 1}
                            </span>
                            {isPreviewD && (
                              <span className="font-mono-num text-[10px] font-semibold text-[#E8CF96]">
                                庄 D
                              </span>
                            )}
                            {isPreviewSb && (
                              <span className="font-mono-num text-[10px] font-semibold text-[#88C9AA]">
                                SB
                              </span>
                            )}
                            {isPreviewBb && (
                              <span className="font-mono-num text-[10px] font-semibold text-[#E8AD80]">
                                BB
                              </span>
                            )}
                          </div>
                          <div className="font-mono-num text-[11px] text-[#7D8882]">
                            {p.chips.toLocaleString()}
                          </div>
                        </div>

                        {isHost && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={!hasChips}
                              data-testid={`assign-sb-seat-${p.seatIndex}`}
                              onClick={() => handleToggleRole(p.seatIndex, 'sb')}
                              className={`h-7 rounded border px-2 font-mono-num text-[11px] transition-colors disabled:opacity-35 ${
                                isPinnedSb
                                  ? 'border-[#5E9E82] bg-[#5E9E82]/22 text-[#B4EAD0]'
                                  : 'border-white/[0.09] bg-[#111517] text-[#98A49F] hover:text-white'
                              }`}
                            >
                              小盲
                            </button>
                            <button
                              type="button"
                              disabled={!hasChips}
                              data-testid={`assign-bb-seat-${p.seatIndex}`}
                              onClick={() => handleToggleRole(p.seatIndex, 'bb')}
                              className={`h-7 rounded border px-2 font-mono-num text-[11px] transition-colors disabled:opacity-35 ${
                                isPinnedBb
                                  ? 'border-[#D4A853] bg-[#D4A853]/22 text-[#F7E5B7]'
                                  : 'border-white/[0.09] bg-[#111517] text-[#98A49F] hover:text-white'
                              }`}
                            >
                              大盲
                            </button>
                            <button
                              type="button"
                              disabled={!hasChips}
                              data-testid={`assign-dealer-seat-${p.seatIndex}`}
                              onClick={() => handleToggleRole(p.seatIndex, 'dealer')}
                              className={`h-7 rounded border px-2 font-mono-num text-[11px] transition-colors disabled:opacity-35 ${
                                isPinnedD
                                  ? 'border-[#E8CF96] bg-[#E8CF96]/22 text-[#FFF0C2]'
                                  : 'border-white/[0.09] bg-[#111517] text-[#98A49F] hover:text-white'
                              }`}
                            >
                              庄
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {error && (
              <div className="text-xs text-[#FCA5A5]">{error}</div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-white/[0.07] pt-4">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-3 text-xs text-[#9AA5A0] hover:text-white transition-colors"
              >
                {isHost ? '取消' : '关闭'}
              </button>
              {isHost && (
                <button
                  type="submit"
                  data-testid="save-blind-settings-btn"
                  className="h-9 rounded-md bg-[#D4A853] px-4 text-xs font-semibold text-[#0F1210] hover:bg-[#E1B968] transition-colors"
                >
                  保存盲注
                </button>
              )}
            </div>
          </form>
        )}

        {/* Tab 2: Companion & Audio Settings */}
        {activeTab === 'companion' && (
          <div className="p-6 space-y-6">
            {/* Audio controls */}
            <section className="space-y-2.5">
              <div className="text-xs font-medium text-[#D6DDD9]">氛围与音效</div>
              <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.07] bg-[#080A0C]">
                {onToggleBgm && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={bgmEnabled}
                    data-testid="settings-bgm-toggle"
                    onClick={onToggleBgm}
                    className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs text-[#DCE2DF] hover:bg-white/[0.02] transition-colors"
                  >
                    <div>
                      <div>爵士酒吧背景乐</div>
                      <div className="mt-0.5 text-[11px] text-[#727E78]">
                        低频暖调钢琴与贝斯循环
                      </div>
                    </div>
                    <span
                      aria-hidden="true"
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                        bgmEnabled
                          ? 'border-[#D4A853]/70 bg-[#D4A853]/26'
                          : 'border-white/[0.12] bg-[#161B1D]'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                          bgmEnabled
                            ? 'translate-x-[17px] bg-[#F3DFAC]'
                            : 'translate-x-[2px] bg-[#78847E]'
                        }`}
                      />
                    </span>
                  </button>
                )}

                {onToggleMute && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!muted}
                    data-testid="settings-sfx-toggle"
                    onClick={onToggleMute}
                    className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs text-[#DCE2DF] hover:bg-white/[0.02] transition-colors"
                  >
                    <div>
                      <div>发牌与筹码音效</div>
                      <div className="mt-0.5 text-[11px] text-[#727E78]">
                        纸牌滑动、筹码落池与提醒声
                      </div>
                    </div>
                    <span
                      aria-hidden="true"
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                        !muted
                          ? 'border-[#D4A853]/70 bg-[#D4A853]/26'
                          : 'border-white/[0.12] bg-[#161B1D]'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                          !muted
                            ? 'translate-x-[17px] bg-[#F3DFAC]'
                            : 'translate-x-[2px] bg-[#78847E]'
                        }`}
                      />
                    </span>
                  </button>
                )}
              </div>
            </section>

            {/* Optional DeepSeek Companion Dialogue Config */}
            {onConfigureBotChat && (
              <section
                data-testid="bot-chat-settings-panel"
                className="space-y-3 border-t border-white/[0.07] pt-5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-xs font-medium text-[#D6DDD9]">
                    陪练牌桌互动（可选 · DeepSeek）
                  </div>
                  <span className="text-[11px] text-[#727E78]">
                    {botChatStatus.source === 'room'
                      ? '本桌已配置密钥'
                      : botChatStatus.source === 'server'
                        ? '使用服务端默认密钥'
                        : '仅存于本桌内存'}
                  </span>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={botEnabledDraft}
                  data-testid="bot-chat-enable-toggle"
                  onClick={() => setBotEnabledDraft((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-[#080A0C] px-3.5 py-2.5 text-left text-xs text-[#DCE2DF] hover:border-white/[0.14] transition-colors"
                >
                  <div>
                    <div>允许陪练参与闲聊与发表情</div>
                    <div className="mt-0.5 text-[11px] text-[#727E78]">
                      不填写密钥不影响正常牌局与陪练对弈
                    </div>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                      botEnabledDraft
                        ? 'border-[#D4A853]/70 bg-[#D4A853]/26'
                        : 'border-white/[0.12] bg-[#161B1D]'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                        botEnabledDraft
                          ? 'translate-x-[17px] bg-[#F3DFAC]'
                          : 'translate-x-[2px] bg-[#78847E]'
                      }`}
                    />
                  </span>
                </button>

                <div className="space-y-1.5">
                  <label
                    htmlFor="deepseek-apikey-input"
                    className="block text-[11px] text-[#8E9994]"
                  >
                    DeepSeek API Key（可选）
                  </label>
                  <input
                    id="deepseek-apikey-input"
                    type="password"
                    autoComplete="off"
                    data-testid="deepseek-apikey-input"
                    value={apiKeyDraft}
                    onChange={(e) => setApiKeyDraft(e.target.value)}
                    placeholder={
                      botChatStatus.configured
                        ? '留空则沿用当前已配置密钥…'
                        : 'sk-...（离桌或删房自动清空）'
                    }
                    className="h-9 w-full rounded-md border border-white/[0.1] bg-[#07090A] px-3 font-mono-num text-xs text-[#F3F1EC] placeholder:text-[#5B6560] focus:border-[#D4A853]/65 focus:outline-none"
                  />
                </div>

                {botFeedback && (
                  <div
                    role="status"
                    className={`text-xs ${
                      botFeedback.tone === 'ok' ? 'text-[#6EE7B7]' : 'text-[#FCA5A5]'
                    }`}
                  >
                    {botFeedback.text}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  {botChatStatus.source === 'room' ? (
                    <button
                      type="button"
                      disabled={botSaving}
                      onClick={() => void handleClearBotKey()}
                      className="text-xs text-[#B59292] hover:text-[#FCA5A5] disabled:opacity-45 transition-colors"
                    >
                      清除密钥
                    </button>
                  ) : (
                    <span className="text-[11px] text-[#66716C]">
                      不会持久化至磁盘
                    </span>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={botSaving || (!apiKeyDraft.trim() && !botChatStatus.configured)}
                      onClick={() => void handleSaveBotChat(true)}
                      className="h-8 rounded-md border border-white/[0.12] px-3 text-xs text-[#D6DDD9] hover:border-[#D4A853]/45 hover:text-white disabled:opacity-40 transition-colors"
                    >
                      测试连通
                    </button>
                    <button
                      type="button"
                      data-testid="save-bot-chat-btn"
                      disabled={botSaving}
                      onClick={() => void handleSaveBotChat(false)}
                      className="h-8 rounded-md bg-[#D4A853] px-3.5 text-xs font-semibold text-[#0F1210] hover:bg-[#E1B968] disabled:opacity-45 transition-colors"
                    >
                      {botSaving ? '保存中…' : '保存'}
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
