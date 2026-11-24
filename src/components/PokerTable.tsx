import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  Copy,
  Eye,
  LogOut,
  Music,
  Play,
  RefreshCw,
  SlidersHorizontal,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  CHAT_BUBBLE_TTL_MS,
  CHAT_WHISPER_TTL_MS,
  getActiveBubbleMap,
} from '../shared/chatUtils';
import type {
  AchievementDatesMap,
  AchievementId,
  EquippedAchievementPref,
} from '../shared/achievements';
import {
  resolvePlayerAvatarProfile,
  type ResolvedPlayerAvatarProfile,
} from '../shared/playerProfile';
import { getHandOverviewStats, PHASE_STAGE_LABELS } from '../shared/tableOverview';
import type {
  BotChatStatus,
  ChatMessage,
  ClientPlayerView,
  ClientTableView,
  LeaderboardEntry,
  ManualBlindTarget,
  PlayerAction,
  PlayerNudgeEvent,
} from '../shared/types';
import type { AvatarImpactEvent, ImpactBubbleKind } from '../utils/avatarImpactFx';
import { ActionDock } from './ActionDock';
import { BlindSettingsModal, type BotChatConfigRequest } from './BlindSettingsModal';
import { ChipStackVisual2D } from './ChipStack2D';
import { type SessionReviewFetchResult, HandReviewModal } from './HandReviewModal';
import { PlayerProfileModal } from './PlayerProfileModal';
import { PlayingCard } from './PlayingCard';
import type { CameraPreset } from './PokerScene3D';
import { type SeatNudgeFx, SeatNode } from './SeatNode';
import { type AnalyticsTab, TableAnalyticsDrawer } from './TableAnalyticsDrawer';
import { TableChatPanel } from './TableChatPanel';

interface PokerTableProps {
  table: ClientTableView;
  myPlayerId: string;
  leaderboard: LeaderboardEntry[];
  selfProfileFallback?: {
    avatar?: string;
    achievements?: AchievementId[];
    achievementDates?: AchievementDatesMap;
    equippedAchievement?: EquippedAchievementPref;
  };
  chatMessages: ChatMessage[];
  lastNudge: PlayerNudgeEvent | null;
  botChatStatus: BotChatStatus;
  muted: boolean;
  bgmEnabled: boolean;
  isDesktop?: boolean;
  externalModalOpen?: boolean;
  isReconnecting?: boolean;
  cameraPreset: CameraPreset;
  onToggleCameraPreset: () => void;
  onToggleMute: () => void;
  onToggleBgm: () => void;
  onOpenAchievements: () => void;
  onOpenPersonalInsights: () => void;
  onFetchSessionReview: (bookmarkedHandNumbers: number[]) => Promise<SessionReviewFetchResult>;
  onLeaveRoom: () => void;
  onStartHand: () => void;
  onRevealCards: () => void;
  onToggleAutoNext: (enabled: boolean) => void;
  onNudgePlayer: (targetPlayerId: string) => void;
  onAddBot: () => void;
  onRemoveBot: (botId: string) => void;
  onRebuy: () => void;
  onUpdateBlindSettings: (params: {
    smallBlind: number;
    bigBlind: number;
    manualBlindTarget: ManualBlindTarget | null;
  }) => void;
  onAction: (action: PlayerAction) => void;
  onSendChat: (text: string) => void;
  onConfigureBotChat: (
    params: BotChatConfigRequest
  ) => Promise<{ ok: boolean; error?: string; status?: BotChatStatus }>;
}

const PHASE_LABELS = PHASE_STAGE_LABELS;

function inferImpactKind(label: string): ImpactBubbleKind {
  if (label.includes('全下')) return 'allin';
  if (label.includes('加注') || label.includes('下注')) return 'raise';
  if (label.includes('跟注')) return 'call';
  if (label.includes('弃牌')) return 'fold';
  if (label.includes('亮牌')) return 'reveal';
  return 'check';
}

function getImpactTtlMs(kind: ImpactBubbleKind): number {
  if (kind === 'pot_win') return 3750;
  if (kind === 'allin') return 3350;
  if (kind === 'raise') return 1750;
  return 1550;
}

export function PokerTable({
  table,
  myPlayerId,
  leaderboard,
  selfProfileFallback,
  chatMessages,
  lastNudge,
  botChatStatus,
  muted,
  bgmEnabled,
  isDesktop = true,
  externalModalOpen = false,
  isReconnecting = false,
  cameraPreset,
  onToggleCameraPreset,
  onToggleMute,
  onToggleBgm,
  onOpenAchievements,
  onOpenPersonalInsights,
  onFetchSessionReview,
  onLeaveRoom,
  onStartHand,
  onRevealCards,
  onToggleAutoNext,
  onNudgePlayer,
  onAddBot,
  onRemoveBot,
  onRebuy,
  onUpdateBlindSettings,
  onAction,
  onSendChat,
  onConfigureBotChat,
}: PokerTableProps) {
  const [now, setNow] = useState(() => Date.now());
  const [chatNow, setChatNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [inspectedPlayerId, setInspectedPlayerId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [blindModalOpen, setBlindModalOpen] = useState(false);
  const [handReviewOpen, setHandReviewOpen] = useState(false);
  const [handReviewMode, setHandReviewMode] = useState<'browse' | 'leaving'>('browse');
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [bookmarkedHands, setBookmarkedHands] = useState<number[]>([]);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [requestedAnalyticsTab, setRequestedAnalyticsTab] = useState<{
    tab: AnalyticsTab;
    nonce: number;
  } | null>(null);
  const [lastSeenCount, setLastSeenCount] = useState(0);

  const [impactFxMap, setImpactFxMap] = useState<Record<string, AvatarImpactEvent>>({});
  const [nudgeFxMap, setNudgeFxMap] = useState<Record<string, SeatNudgeFx>>({});
  const [newlyJoinedIds, setNewlyJoinedIds] = useState<Record<string, boolean>>({});

  const prevPlayersRef = useRef<
    Map<string, { label?: string; handNumber: number; revealed?: boolean; allIn: boolean }>
  >(new Map());
  const initializedPlayersRef = useRef(false);
  const lastWinFxKeyRef = useRef<string>('');
  const impactFxTimersRef = useRef<Map<string, number>>(new Map());
  const nudgeFxTimersRef = useRef<Map<string, number>>(new Map());
  const joinedTimersRef = useRef<Map<string, number>>(new Map());

  // Clean up all independent per-player FX timers on unmount
  useEffect(() => {
    const impactTimers = impactFxTimersRef.current;
    const nudgeTimers = nudgeFxTimersRef.current;
    const joinedTimers = joinedTimersRef.current;
    return () => {
      impactTimers.forEach((id) => window.clearTimeout(id));
      impactTimers.clear();
      nudgeTimers.forEach((id) => window.clearTimeout(id));
      nudgeTimers.clear();
      joinedTimers.forEach((id) => window.clearTimeout(id));
      joinedTimers.clear();
    };
  }, []);

  // Reset per-room bookmarked hands when switching rooms
  useEffect(() => {
    setBookmarkedHands([]);
    setLeavePromptOpen(false);
    setHandReviewOpen(false);
  }, [table.roomId]);

  useEffect(() => {
    if (!leavePromptOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setLeavePromptOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [leavePromptOpen]);

  // Tick timer for turn countdown AND next-hand countdown
  useEffect(() => {
    if (!table.turnDeadline && !table.nextHandAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [table.turnDeadline, table.nextHandAt]);

  // Detect player join entrances & action transitions for Canvas dynamic impact bubbles
  useEffect(() => {
    const prevMap = prevPlayersRef.current;
    const isInitial = !initializedPlayersRef.current;
    initializedPlayersRef.current = true;

    const joinedBatch: string[] = [];
    const fxBatch: { id: string; fx: AvatarImpactEvent }[] = [];

    for (const p of table.players) {
      const prev = prevMap.get(p.id);
      if (!prev && !isInitial) {
        joinedBatch.push(p.id);
      }
      const label = p.lastActionLabel;
      const isBlind = label?.startsWith('小盲') || label?.startsWith('大盲');
      const newlyAllIn = Boolean(prev && !prev.allIn && p.allIn && table.phase !== 'waiting');
      const labelChanged = Boolean(
        prev &&
          label &&
          !isBlind &&
          (prev.label !== label || prev.handNumber !== table.handNumber)
      );

      if (newlyAllIn || (labelChanged && label && label.includes('全下'))) {
        const wager = p.currentBet > 0 ? p.currentBet : undefined;
        fxBatch.push({
          id: p.id,
          fx: {
            id: `${p.id}_allin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            kind: 'allin',
            title: 'ALL-IN 全下',
            subtitle: wager ? `全押 ${wager.toLocaleString()}` : '全押决胜',
            amount: wager,
          },
        });
      } else if (labelChanged && label) {
        const kind = inferImpactKind(label);
        fxBatch.push({
          id: p.id,
          fx: {
            id: `${p.id}_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            kind,
            title: label,
            amount: p.currentBet > 0 ? p.currentBet : undefined,
          },
        });
      }
    }

    const nextSnapshot = new Map<
      string,
      { label?: string; handNumber: number; revealed?: boolean; allIn: boolean }
    >();
    for (const p of table.players) {
      nextSnapshot.set(p.id, {
        label: p.lastActionLabel,
        handNumber: table.handNumber,
        revealed: p.revealed,
        allIn: p.allIn,
      });
    }
    prevPlayersRef.current = nextSnapshot;

    if (joinedBatch.length > 0) {
      setNewlyJoinedIds((curr) => {
        const next = { ...curr };
        joinedBatch.forEach((id) => {
          next[id] = true;
        });
        return next;
      });
      joinedBatch.forEach((id) => {
        const existing = joinedTimersRef.current.get(id);
        if (existing) window.clearTimeout(existing);
        const timerId = window.setTimeout(() => {
          joinedTimersRef.current.delete(id);
          setNewlyJoinedIds((curr) => {
            if (!curr[id]) return curr;
            const next = { ...curr };
            delete next[id];
            return next;
          });
        }, 700);
        joinedTimersRef.current.set(id, timerId);
      });
    }

    if (fxBatch.length > 0) {
      const winnerIdsAtShowdown =
        table.phase === 'showdown'
          ? new Set(table.winners.map((w) => w.playerId))
          : null;

      const filteredBatch = fxBatch.filter(({ id, fx }) => {
        if (winnerIdsAtShowdown?.has(id) && fx.kind !== 'allin') {
          return false;
        }
        return true;
      });

      if (filteredBatch.length > 0) {
        setImpactFxMap((curr) => {
          const next = { ...curr };
          filteredBatch.forEach(({ id, fx }) => {
            if (curr[id]?.kind === 'pot_win' && fx.kind !== 'allin') {
              return;
            }
            next[id] = fx;
          });
          return next;
        });
        filteredBatch.forEach(({ id, fx }) => {
          const existing = impactFxTimersRef.current.get(id);
          if (existing) window.clearTimeout(existing);
          const timerId = window.setTimeout(() => {
            impactFxTimersRef.current.delete(id);
            setImpactFxMap((curr) => {
              if (curr[id]?.id !== fx.id) return curr;
              const next = { ...curr };
              delete next[id];
              return next;
            });
          }, getImpactTtlMs(fx.kind));
          impactFxTimersRef.current.set(id, timerId);
        });
      }
    }
  }, [table.players, table.handNumber, table.phase, table.winners]);

  // Trigger celebratory Canvas Pot Win chip splash fountain above every winning player's avatar
  useEffect(() => {
    if (table.phase !== 'showdown' || table.winners.length === 0) return;
    const winKey = `${table.handNumber}:${table.winners
      .map((w) => `${w.playerId}:${w.amount}`)
      .join(',')}`;
    if (lastWinFxKeyRef.current === winKey) return;
    lastWinFxKeyRef.current = winKey;

    const winBatch: { id: string; fx: AvatarImpactEvent }[] = table.winners.map((w) => ({
      id: w.playerId,
      fx: {
        id: `${w.playerId}_win_${table.handNumber}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        kind: 'pot_win',
        title: `+${w.amount.toLocaleString()}`,
        subtitle: w.handName ? `赢取底池 · ${w.handName}` : '赢取底池',
        amount: w.amount,
        handName: w.handName,
      },
    }));

    setImpactFxMap((curr) => {
      const next = { ...curr };
      winBatch.forEach(({ id, fx }) => {
        next[id] = fx;
      });
      return next;
    });

    winBatch.forEach(({ id, fx }) => {
      const existing = impactFxTimersRef.current.get(id);
      if (existing) window.clearTimeout(existing);
      const timerId = window.setTimeout(() => {
        impactFxTimersRef.current.delete(id);
        setImpactFxMap((curr) => {
          if (curr[id]?.id !== fx.id) return curr;
          const next = { ...curr };
          delete next[id];
          return next;
        });
      }, getImpactTtlMs('pot_win'));
      impactFxTimersRef.current.set(id, timerId);
    });
  }, [table.phase, table.handNumber, table.winners]);

  // Display synchronized nudge bubble & pulse on target seat with independent per-player timer
  useEffect(() => {
    if (!lastNudge) return;
    const targetId = lastNudge.targetPlayerId;
    const fxId = `${targetId}_${lastNudge.createdAt}`;
    setNudgeFxMap((curr) => ({
      ...curr,
      [targetId]: {
        id: fxId,
        message: lastNudge.message,
      },
    }));
    const existing = nudgeFxTimersRef.current.get(targetId);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      nudgeFxTimersRef.current.delete(targetId);
      setNudgeFxMap((curr) => {
        if (curr[targetId]?.id !== fxId) return curr;
        const next = { ...curr };
        delete next[targetId];
        return next;
      });
    }, 3200);
    nudgeFxTimersRef.current.set(targetId, timer);
  }, [lastNudge]);

  useEffect(() => {
    if (chatOpen) {
      setLastSeenCount(chatMessages.length);
    }
  }, [chatOpen, chatMessages.length]);

  useEffect(() => {
    setChatNow(Date.now());
  }, [chatMessages]);

  useEffect(() => {
    const current = Date.now();
    let nextExpiry = Infinity;
    for (const msg of chatMessages) {
      const bubbleExp = msg.createdAt + CHAT_BUBBLE_TTL_MS;
      if (bubbleExp > current && bubbleExp < nextExpiry) {
        nextExpiry = bubbleExp;
      }
      const whisperExp = msg.createdAt + CHAT_WHISPER_TTL_MS;
      if (whisperExp > current && whisperExp < nextExpiry) {
        nextExpiry = whisperExp;
      }
    }
    if (!Number.isFinite(nextExpiry)) return;
    const delay = Math.max(50, nextExpiry - current + 40);
    const id = window.setTimeout(() => setChatNow(Date.now()), delay);
    return () => window.clearTimeout(id);
  }, [chatMessages, chatNow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (externalModalOpen || blindModalOpen || handReviewOpen || inspectedPlayerId !== null) return;
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
      if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        setChatOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [externalModalOpen, blindModalOpen, handReviewOpen, inspectedPlayerId]);

  const activeBubbles = useMemo(
    () => getActiveBubbleMap(chatMessages, chatNow, CHAT_BUBBLE_TTL_MS),
    [chatMessages, chatNow]
  );

  const unreadCount = chatOpen ? 0 : Math.max(0, chatMessages.length - lastSeenCount);

  const { selfPlayer, opponents } = useMemo(() => {
    const idx = table.players.findIndex((p) => p.id === myPlayerId);
    if (idx === -1) {
      return { selfPlayer: null, opponents: table.players };
    }
    const ordered: ClientPlayerView[] = [];
    for (let i = 0; i < table.players.length; i++) {
      ordered.push(table.players[(idx + i) % table.players.length]);
    }
    return { selfPlayer: ordered[0], opponents: ordered.slice(1) };
  }, [table.players, myPlayerId]);

  const winnerMap = useMemo(() => {
    return new Map(table.winners.map((w) => [w.playerId, w]));
  }, [table.winners]);

  const highlightedCards = useMemo(() => {
    if (table.phase !== 'showdown' || table.winners.length === 0) return [];
    return table.winners.flatMap((w) => w.bestCards);
  }, [table.phase, table.winners]);

  const activeTurnPlayer = table.players.find(
    (p) => p.id === table.currentTurnPlayerId
  );

  const isHost = !table.hostId || table.hostId === myPlayerId;

  const canStart =
    (table.phase === 'waiting' || table.phase === 'showdown') &&
    table.players.filter((p) => p.chips > 0 || p.isBot).length >= 2;

  const canAddBot =
    isHost &&
    (table.phase === 'waiting' || table.phase === 'showdown') &&
    table.players.length < 22;

  const isSelfIdleForRebuy =
    Boolean(selfPlayer) &&
    (table.phase === 'waiting' ||
      table.phase === 'showdown' ||
      !selfPlayer!.inHand ||
      selfPlayer!.folded);

  const isSelfBusted =
    Boolean(selfPlayer) && selfPlayer!.chips < table.bigBlind && isSelfIdleForRebuy;

  const canTopUp =
    Boolean(selfPlayer) &&
    selfPlayer!.chips < table.startingChips &&
    isSelfIdleForRebuy;

  const canRemoveBots = isHost && (table.phase === 'waiting' || table.phase === 'showdown');
  const completedHeroHands = useMemo(
    () =>
      table.analytics.handHistory.filter((h) => h.players.some((p) => p.id === myPlayerId)).length,
    [table.analytics.handHistory, myPlayerId]
  );
  const myMatchStats = table.analytics.playerStats[myPlayerId] ?? null;
  const hasCompletedHands = completedHeroHands > 0;
  const isCurrentHandBookmarked =
    table.handNumber > 0 && bookmarkedHands.includes(table.handNumber);

  const handleToggleBookmarkHand = (handNumber: number) => {
    if (!Number.isFinite(handNumber) || handNumber <= 0) return;
    setBookmarkedHands((prev) =>
      prev.includes(handNumber)
        ? prev.filter((n) => n !== handNumber)
        : [...prev, handNumber]
    );
  };

  const handleRequestLeave = () => {
    if (hasCompletedHands) {
      setLeavePromptOpen(true);
    } else {
      onLeaveRoom();
    }
  };

  const compactOpponents = opponents.length >= 4;
  const usePreviewBlinds = table.phase === 'waiting';
  const displayDealerSeat = usePreviewBlinds
    ? table.previewNextBlinds.dealerSeatIndex
    : table.dealerSeatIndex;
  const displaySbSeat = usePreviewBlinds
    ? table.previewNextBlinds.smallBlindSeatIndex
    : table.smallBlindSeatIndex;
  const displayBbSeat = usePreviewBlinds
    ? table.previewNextBlinds.bigBlindSeatIndex
    : table.bigBlindSeatIndex;

  const getNextBlindRole = (seatIndex: number): 'SB' | 'BB' | 'D' | null => {
    if (table.phase !== 'showdown') return null;
    if (table.previewNextBlinds.smallBlindSeatIndex === seatIndex) return 'SB';
    if (table.previewNextBlinds.bigBlindSeatIndex === seatIndex) return 'BB';
    if (table.previewNextBlinds.dealerSeatIndex === seatIndex) return 'D';
    return null;
  };

  const nextHandSeconds =
    table.phase === 'showdown' && table.autoNextHandEnabled && table.nextHandAt
      ? Math.max(0, Math.ceil((table.nextHandAt - now) / 1000))
      : null;

  const handleCopyInvite = async () => {
    const url = `${window.location.origin}/?room=${encodeURIComponent(table.roomId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const getSecondsLeft = (playerId: string): number | null => {
    if (table.currentTurnPlayerId !== playerId || !table.turnDeadline) return null;
    return Math.max(0, Math.ceil((table.turnDeadline - now) / 1000));
  };

  const statusText = useMemo(() => {
    if (table.allInRunout) {
      return '全员全下 · 正在自动逐街翻牌决胜…';
    }
    if (table.phase === 'waiting') {
      return table.players.length < 2
        ? '当前需 2 人以上即可开局，可复制邀请或添加陪练'
        : `牌桌已就绪（${table.players.length} 人），点击「开始发牌」`;
    }
    if (table.phase === 'showdown') {
      if (table.winners.length > 0) {
        const names = table.winners.map((w) => `${w.playerName} (+${w.amount})`).join('、');
        return `本局结束：${names}`;
      }
      return '本局结算完成';
    }
    if (activeTurnPlayer) {
      return `等待 ${activeTurnPlayer.name} 行动…`;
    }
    return '发牌中…';
  }, [table.allInRunout, table.phase, table.players.length, table.winners, activeTurnPlayer]);

  return (
    <div className="pointer-events-none relative z-10 flex min-h-dvh flex-col justify-between text-[#F3F1EC]">
      {/* Slim Perimeter Top Bar (clean unboxed luxury nav, zero duplicate chat/emoji buttons) */}
      <header className="pointer-events-auto flex items-center justify-between gap-2 border-b border-white/[0.06] bg-[#0A0C0E]/82 backdrop-blur-md px-3 py-2 sm:gap-4 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            data-testid="leave-table-btn"
            onClick={handleRequestLeave}
            aria-label="退出房间"
            className="touch-manipulation flex h-8 items-center gap-1.5 px-1.5 text-xs text-[#9BA6A1] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">离桌</span>
          </button>

          <span aria-hidden="true" className="h-3.5 w-px bg-white/[0.09] hidden sm:inline-block" />

          <div className="flex items-center gap-1.5 sm:gap-2.5 text-xs min-w-0">
            <span className="font-mono-num font-semibold tracking-wider text-[#E5C989] whitespace-nowrap truncate max-w-[74px] sm:max-w-none">
              {table.roomId}
            </span>
            <span aria-hidden="true" className="text-white/15 hidden sm:inline">·</span>
            <button
              type="button"
              data-testid="open-blind-settings-btn"
              onClick={() => setBlindModalOpen(true)}
              title="查看或调整牌桌盲注与设置"
              className="touch-manipulation inline-flex items-center gap-1 font-mono-num text-[11px] sm:text-xs text-[#CBD3CF] hover:text-[#F0DFB3] transition-colors whitespace-nowrap shrink-0"
            >
              <span className="hidden sm:inline text-[#7D8883]">盲注</span>
              <span>
                {table.smallBlind}/{table.bigBlind}
              </span>
              {table.pendingBlinds && (
                <span className="text-[10px] text-[#8CC9AA]">
                  → {table.pendingBlinds.smallBlind}/{table.pendingBlinds.bigBlind}
                </span>
              )}
            </button>
            <span aria-hidden="true" className="text-white/15 hidden sm:inline">·</span>
            <span
              data-testid="table-turn-timer-label"
              className={`font-mono-num text-[11px] sm:text-xs whitespace-nowrap hidden sm:inline ${
                table.turnTimeoutSec === 0 ? 'text-[#8CC9AA]' : 'text-[#7D8883]'
              }`}
            >
              {table.turnTimeoutSec === 0 ? '不限时' : `${table.turnTimeoutSec}s`}
            </span>
            {table.handNumber > 0 && (
              <>
                <span aria-hidden="true" className="text-white/15 hidden md:inline">·</span>
                <span className="font-mono-num text-xs text-[#7D8883] whitespace-nowrap hidden md:inline">
                  第 {table.handNumber} 局
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyInvite}
            aria-label="复制邀请链接"
            className="touch-manipulation flex h-7 items-center gap-1 px-1.5 text-xs text-[#939E99] hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#34D399]" aria-hidden="true" />
                <span className="text-[#34D399] hidden sm:inline">已复制</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">邀请</span>
              </>
            )}
          </button>
        </div>

        <div className="hidden xl:block font-display text-xs tracking-[0.2em] text-[#7D8782]/80 uppercase select-none">
          VELVET HOLD&apos;EM
        </div>

        {/* Clean Unboxed Right Controls */}
        <nav aria-label="牌桌工具" className="flex items-center gap-1 sm:gap-3 shrink-0">
          {isDesktop && (
            <button
              type="button"
              data-testid="camera-toggle-btn"
              onClick={onToggleCameraPreset}
              aria-label={cameraPreset === 'classic' ? '切换俯瞰视角' : '切换经典视角'}
              className="touch-manipulation h-8 px-2 text-xs text-[#B5C0BA] hover:text-white transition-colors whitespace-nowrap"
            >
              {cameraPreset === 'classic' ? '俯瞰视角' : '经典视角'}
            </button>
          )}

          {hasCompletedHands && (
            <button
              type="button"
              data-testid="open-hand-review-btn"
              disabled={isReconnecting}
              onClick={() => {
                setHandReviewMode('browse');
                setHandReviewOpen(true);
              }}
              aria-label="打开本场复盘"
              className="touch-manipulation h-8 px-2 text-xs text-[#E4CB96] hover:text-[#F5E4B8] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              复盘
              <span className="ml-1 font-mono-num text-[11px] text-[#9A9388]">
                {completedHeroHands}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (!analyticsOpen) {
                setRequestedAnalyticsTab((prev) => ({
                  tab: 'trends',
                  nonce: (prev?.nonce ?? 0) + 1,
                }));
              }
              setAnalyticsOpen((prev) => !prev);
            }}
            aria-label={analyticsOpen ? '收起牌局数据' : '打开牌局数据与局内排行'}
            aria-expanded={analyticsOpen}
            data-testid="toggle-analytics-btn"
            className={`touch-manipulation h-8 px-2 text-xs transition-colors whitespace-nowrap ${
              analyticsOpen
                ? 'text-[#F0DFB3] font-medium'
                : 'text-[#B5C0BA] hover:text-white'
            }`}
          >
            数据
          </button>

          <button
            type="button"
            data-testid="open-table-settings-btn"
            onClick={() => setBlindModalOpen(true)}
            aria-label="打开牌桌设置"
            className="touch-manipulation flex h-8 items-center gap-1 px-2 text-xs text-[#B5C0BA] hover:text-[#F0DFB3] transition-colors whitespace-nowrap"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-[#C8A153]" aria-hidden="true" />
            <span className="hidden sm:inline">设置</span>
          </button>

          <button
            type="button"
            data-testid="toggle-bgm-btn"
            onClick={onToggleBgm}
            aria-pressed={bgmEnabled && !muted}
            aria-label={bgmEnabled && !muted ? '关闭爵士背景乐' : '开启爵士背景乐'}
            title={bgmEnabled && !muted ? '关闭爵士背景乐' : '开启爵士背景乐'}
            className={`touch-manipulation relative flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer ${
              bgmEnabled && !muted
                ? 'text-[#E8CF96] hover:bg-white/[0.06] hover:text-[#F6E2B3]'
                : 'text-[#6F7A75] hover:bg-white/[0.06] hover:text-[#B5C0BA]'
            }`}
          >
            <Music className="h-3.5 w-3.5" aria-hidden="true" />
            {(!bgmEnabled || muted) && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute h-[1.5px] w-4 rotate-45 rounded-full bg-current opacity-85"
              />
            )}
          </button>

          <button
            type="button"
            data-testid="toggle-mute-btn"
            onClick={onToggleMute}
            aria-pressed={!muted}
            aria-label={muted ? '开启声音' : '静音'}
            title={muted ? '开启声音' : '静音'}
            className="touch-manipulation flex h-8 w-8 items-center justify-center rounded-full text-[#A7B2AC] hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </nav>
      </header>

      {/* Main Spatial Overlay */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-between px-3 py-2 sm:px-6 sm:py-3">
        {/* Top Perimeter: Whisper-Quiet Table Strip + Opponents (spaced clearly so bubbles never overlap pot bar) */}
        <div className="flex flex-col items-center gap-4 sm:gap-5">
          {(() => {
            const overview = getHandOverviewStats(table);
            return (
              <section
                data-testid="hand-overview-panel"
                aria-label="本局状态"
                className="pointer-events-auto relative z-30 inline-flex items-center gap-3 sm:gap-4 rounded-full border border-white/[0.08] bg-[#0A0C0E]/82 backdrop-blur-md px-4 py-1 text-xs shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[11px] text-[#85908B]">底池</span>
                  <span
                    data-testid="pot-amount"
                    className="font-mono-num text-sm font-bold text-[#ECCF8E]"
                  >
                    {overview.pot.toLocaleString()}
                  </span>
                </div>

                <span aria-hidden="true" className="h-3 w-px bg-white/[0.1]" />

                <div
                  data-testid="current-phase-label"
                  className="text-xs font-medium text-[#E5E2D9] whitespace-nowrap"
                >
                  {table.allInRunout ? '全下翻牌' : overview.phaseLabel}
                </div>

                <span aria-hidden="true" className="h-3 w-px bg-white/[0.1]" />

                <div
                  data-testid="remaining-players"
                  className="font-mono-num text-xs text-[#A5AFA9] whitespace-nowrap"
                >
                  {overview.remainingPlayers < overview.totalPlayers
                    ? `${overview.remainingPlayers}/${overview.totalPlayers} 人`
                    : `${overview.remainingPlayers} 人`}
                </div>

                {table.handNumber > 0 && (
                  <>
                    <span aria-hidden="true" className="h-3 w-px bg-white/[0.1]" />
                    <button
                      type="button"
                      data-testid="bookmark-hand-btn"
                      aria-pressed={isCurrentHandBookmarked}
                      title={
                        isCurrentHandBookmarked
                          ? '取消标记本手（整场复盘时优先展示）'
                          : '标记本手，打完后置顶复盘'
                      }
                      onClick={() => handleToggleBookmarkHand(table.handNumber)}
                      className={`touch-manipulation inline-flex items-center gap-1 text-[11px] transition-colors whitespace-nowrap cursor-pointer ${
                        isCurrentHandBookmarked
                          ? 'font-medium text-[#E4CB96]'
                          : 'text-[#8C9590] hover:text-[#EFECE4]'
                      }`}
                    >
                      <Bookmark
                        className={`h-3 w-3 ${
                          isCurrentHandBookmarked ? 'fill-[#C9A25B] text-[#C9A25B]' : ''
                        }`}
                        aria-hidden="true"
                      />
                      <span>{isCurrentHandBookmarked ? '已标记' : '标记本手'}</span>
                    </button>
                  </>
                )}
              </section>
            );
          })()}

          <section
            aria-label="对手座位"
            className="pointer-events-auto relative z-40 flex flex-wrap items-start justify-center gap-2 sm:gap-3"
          >
            {opponents.length === 0 ? (
              <div className="rounded border border-white/[0.08] bg-[#0B0D0E]/88 px-4 py-2 text-center text-xs text-[#9BA5A0]">
                当前牌桌仅你 1 人 · 2 人以上即可开局，可复制邀请或添加陪练
              </div>
            ) : (
              opponents.map((opp) => {
                const win = winnerMap.get(opp.id);
                const oppProfile = resolvePlayerAvatarProfile(opp, leaderboard);
                return (
                  <SeatNode
                    key={opp.id}
                    player={opp}
                    syncedProfile={oppProfile}
                    isSelf={false}
                    isTurn={table.currentTurnPlayerId === opp.id}
                    isDealer={displayDealerSeat === opp.seatIndex}
                    isSmallBlind={displaySbSeat === opp.seatIndex}
                    isBigBlind={displayBbSeat === opp.seatIndex}
                    nextBlindRole={getNextBlindRole(opp.seatIndex)}
                    isWinner={Boolean(win)}
                    winAmount={win?.amount}
                    highlightedCards={highlightedCards}
                    secondsRemaining={getSecondsLeft(opp.id)}
                    turnTimeoutSec={table.turnTimeoutSec}
                    chatBubble={activeBubbles.get(opp.id) ?? null}
                    impactFx={impactFxMap[opp.id] ?? null}
                    nudgeFx={nudgeFxMap[opp.id] ?? null}
                    isNewlyJoined={Boolean(newlyJoinedIds[opp.id])}
                    compact={compactOpponents}
                    canRemoveBot={canRemoveBots}
                    onRemoveBot={onRemoveBot}
                    onNudgePlayer={onNudgePlayer}
                    onInspectPlayer={setInspectedPlayerId}
                  />
                );
              })
            )}
          </section>
        </div>

        {/* Center: Clean 2D Felt Board on Mobile (<768px) or Open 3D Arena on Desktop */}
        <div className="flex flex-1 flex-col items-center justify-end gap-2 pb-2">
          {!isDesktop && (
            <section
              data-testid="mobile-2d-board"
              aria-label="移动端 2D 牌桌"
              className="pointer-events-auto my-auto w-full rounded-2xl border border-[#D4A853]/35 bg-gradient-to-b from-[#134230] to-[#0A251B] px-3 py-3 shadow-[inset_0_0_24px_rgba(0,0,0,0.45)]"
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2.5 mb-3.5">
                <div className="flex items-center gap-2.5">
                  <ChipStackVisual2D amount={Math.max(5, table.pot)} maxLayers={7} />
                  <div>
                    <div className="text-[11px] text-[#9BC4B2]">
                      {table.allInRunout ? 'All-in 自动逐街发牌' : PHASE_LABELS[table.phase]}
                    </div>
                    <div className="font-mono-num text-sm font-bold text-[#F5E4B8]">
                      底池 {table.pot.toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono-num text-[11px] text-[#9BC4B2]">
                  <div>盲注 {table.smallBlind}/{table.bigBlind}</div>
                  {(() => {
                    const activeSb =
                      table.phase === 'waiting'
                        ? table.previewNextBlinds.smallBlindSeatIndex
                        : table.smallBlindSeatIndex;
                    const activeBb =
                      table.phase === 'waiting'
                        ? table.previewNextBlinds.bigBlindSeatIndex
                        : table.bigBlindSeatIndex;
                    const sbName = table.players.find((p) => p.seatIndex === activeSb)?.name;
                    const bbName = table.players.find((p) => p.seatIndex === activeBb)?.name;
                    if (!sbName && !bbName) {
                      return table.handNumber > 0 ? <div>第 {table.handNumber} 局</div> : null;
                    }
                    return (
                      <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px]">
                        {sbName && <span className="text-[#9ED7E6]">小盲 {sbName}</span>}
                        {bbName && <span className="text-[#F5DA9A]">大盲 {bbName}</span>}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="flex items-center justify-center gap-1.5">
                {Array.from({ length: 5 }).map((_, idx) => {
                  const card = table.communityCards[idx];
                  if (!card) {
                    return (
                      <div
                        key={`empty-${idx}`}
                        className="h-[68px] w-12 rounded-md border border-dashed border-[#D4A853]/25 bg-[#081D15]/55"
                        aria-hidden="true"
                      />
                    );
                  }
                  const isHighlighted =
                    highlightedCards.length > 0 &&
                    highlightedCards.some(
                      (hc) => hc.rank === card.rank && hc.suit === card.suit
                    );
                  return (
                    <PlayingCard
                      key={`${card.suit}-${card.rank}-${idx}`}
                      card={card}
                      size="md"
                      highlighted={isHighlighted}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* All-in Runout Indicator */}
          {table.allInRunout && (
            <div
              data-testid="allin-runout-banner"
              className="pointer-events-auto flex items-center gap-2 rounded border border-[#D4A853]/45 bg-[#0C0E10]/94 px-4 py-1.5 text-xs sm:text-sm font-medium text-[#E8CF96] shadow-lg animate-chip-impact"
            >
              <span className="text-[#D4A853]" aria-hidden="true">◆</span>
              <span>全员全下 · 正在逐街自动翻牌决胜</span>
            </div>
          )}

          {/* Showdown Winner Banner */}
          {table.phase === 'showdown' && table.winners.length > 0 && (
            <div
              data-testid="winner-banner"
              className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded border border-[#D4A853]/45 bg-[#0B0D0E]/94 px-4 py-1.5 text-xs sm:text-sm animate-chip-impact"
            >
              {table.winners.map((w, idx) => (
                <span key={w.playerId} className="flex items-center gap-1.5">
                  {idx > 0 && <span className="text-white/25">·</span>}
                  <strong className="text-[#F3F1EC]">{w.playerName}</strong>
                  <span className="text-[#D4A853] font-medium">{w.handName}</span>
                  <span className="font-mono-num font-bold text-[#8CC9AA]">
                    +{w.amount}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Pre-hand / Between-hands Controls */}
          {(table.phase === 'waiting' || table.phase === 'showdown') && (
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
              {canStart && (
                <button
                  type="button"
                  data-testid="start-hand-btn"
                  disabled={isReconnecting}
                  onClick={onStartHand}
                  className="touch-manipulation flex h-11 sm:h-9 items-center gap-1.5 rounded bg-[#D4A853] px-4 text-xs sm:text-sm font-bold text-[#0F1210] hover:bg-[#E1B968] transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  <span>
                    {table.phase === 'showdown'
                      ? nextHandSeconds !== null
                        ? `立即下一局 (${nextHandSeconds}s)`
                        : '下一局'
                      : '开始发牌'}
                  </span>
                </button>
              )}

              {table.canRevealMyCards && (
                <button
                  type="button"
                  data-testid="reveal-cards-btn"
                  disabled={isReconnecting}
                  onClick={onRevealCards}
                  className="touch-manipulation flex h-11 sm:h-9 items-center gap-1.5 rounded border border-[#D4A853]/50 bg-[#0D1012]/94 px-3.5 text-xs sm:text-sm font-semibold text-[#E8CF96] hover:bg-[#171C1F] transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Eye className="h-3.5 w-3.5 text-[#D4A853]" aria-hidden="true" />
                  <span>亮牌</span>
                </button>
              )}

              {table.phase === 'showdown' && canStart && (
                <button
                  type="button"
                  data-testid="toggle-auto-next-btn"
                  disabled={isReconnecting}
                  onClick={() => onToggleAutoNext(!table.autoNextHandEnabled)}
                  className={`touch-manipulation flex h-11 sm:h-9 items-center gap-1.5 rounded border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed ${
                    table.autoNextHandEnabled
                      ? 'border-[#5E9E82]/45 bg-[#0D1713]/92 text-[#9AD4B8]'
                      : 'border-white/[0.14] bg-[#0D1012]/92 text-[#9AA5A0]'
                  }`}
                >
                  <span>
                    自动开局: {table.autoNextHandEnabled ? '开' : '关'}
                  </span>
                </button>
              )}

              {canAddBot && (
                <button
                  type="button"
                  data-testid="add-bot-btn"
                  disabled={isReconnecting}
                  onClick={onAddBot}
                  className="touch-manipulation flex h-11 sm:h-9 items-center gap-1.5 rounded border border-white/[0.1] bg-[#0B0E10]/88 backdrop-blur-sm px-3.5 text-xs sm:text-sm font-medium text-[#D6DDD9] hover:bg-[#151A1D] hover:text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <UserPlus className="h-3.5 w-3.5 text-[#C8A153]" aria-hidden="true" />
                  <span>添加陪练</span>
                </button>
              )}

              {canTopUp && !isSelfBusted && (
                <button
                  type="button"
                  data-testid="topup-chips-btn"
                  disabled={isReconnecting}
                  onClick={onRebuy}
                  className="touch-manipulation flex h-11 sm:h-9 items-center gap-1.5 rounded border border-[#34D399]/35 bg-[#0F2119]/90 px-3.5 text-xs sm:text-sm font-semibold text-[#6EE7B7] hover:bg-[#152E23] transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>补满筹码 ({table.startingChips.toLocaleString()})</span>
                </button>
              )}
            </div>
          )}

          {/* Always-Accessible Busted Rebuy Banner (works even mid-hand when auto-next moved on) */}
          {isSelfBusted && (
            <div
              data-testid="busted-rebuy-banner"
              className="pointer-events-auto flex flex-wrap items-center justify-center gap-2.5 rounded-lg border border-[#34D399]/40 bg-[#0C1D16]/94 px-4 py-2 text-xs sm:text-sm text-[#D8F3E5] shadow-lg"
            >
              <span>筹码不足无法参与本局，可立即补充筹码并在下局继续上桌</span>
              <button
                type="button"
                data-testid="rebuy-chips-btn"
                disabled={isReconnecting}
                onClick={onRebuy}
                className="touch-manipulation inline-flex h-9 sm:h-8 items-center gap-1.5 rounded bg-[#10B981] px-3.5 text-xs font-bold text-[#071510] hover:bg-[#34D399] transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>立即补充筹码 ({table.startingChips.toLocaleString()})</span>
              </button>
              {hasCompletedHands && (
                <button
                  type="button"
                  data-testid="busted-review-session-btn"
                  disabled={isReconnecting}
                  onClick={() => {
                    setHandReviewMode('leaving');
                    setHandReviewOpen(true);
                  }}
                  className="touch-manipulation inline-flex h-9 sm:h-8 items-center gap-1.5 rounded border border-[#C9A25B]/55 bg-[#16130E]/92 px-3.5 text-xs font-medium text-[#EFE3C4] hover:bg-[#221D15] transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span>结束并复盘</span>
                </button>
              )}
            </div>
          )}

          {table.actionLog.length > 0 && (
            <div className="rounded bg-[#0B0D0E]/82 px-3 py-0.5 text-[11px] text-[#98A49F] truncate max-w-full sm:max-w-md md:hidden">
              {table.actionLog[0]}
            </div>
          )}
        </div>

        {/* Bottom Zone: Local Player Seat + Action Dock */}
        <section
          aria-label="我的手牌与操作区"
          className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-col gap-2"
        >
          {selfPlayer && (
            <SeatNode
              player={selfPlayer}
              syncedProfile={resolvePlayerAvatarProfile(
                selfPlayer,
                leaderboard,
                selfProfileFallback
              )}
              isSelf
              isTurn={table.currentTurnPlayerId === selfPlayer.id}
              isDealer={displayDealerSeat === selfPlayer.seatIndex}
              isSmallBlind={displaySbSeat === selfPlayer.seatIndex}
              isBigBlind={displayBbSeat === selfPlayer.seatIndex}
              nextBlindRole={getNextBlindRole(selfPlayer.seatIndex)}
              isWinner={winnerMap.has(selfPlayer.id)}
              winAmount={winnerMap.get(selfPlayer.id)?.amount}
              highlightedCards={highlightedCards}
              secondsRemaining={getSecondsLeft(selfPlayer.id)}
              turnTimeoutSec={table.turnTimeoutSec}
              chatBubble={activeBubbles.get(selfPlayer.id) ?? null}
              impactFx={impactFxMap[selfPlayer.id] ?? null}
              nudgeFx={nudgeFxMap[selfPlayer.id] ?? null}
              isNewlyJoined={Boolean(newlyJoinedIds[selfPlayer.id])}
              onInspectPlayer={setInspectedPlayerId}
              onOpenAchievements={onOpenAchievements}
            />
          )}

          <ActionDock
            available={table.myAvailableActions}
            pot={table.pot}
            bigBlind={table.bigBlind}
            myCurrentBet={selfPlayer?.currentBet ?? 0}
            handEvaluationName={table.myHandEvaluation?.categoryName ?? null}
            statusMessage={isReconnecting ? '网络重连中，恢复后可继续操作…' : statusText}
            disabled={isReconnecting}
            disabledReason={isReconnecting ? '网络重连中，请稍候…' : undefined}
            hotkeysDisabled={
              isReconnecting ||
              externalModalOpen ||
              inspectedPlayerId !== null ||
              chatOpen ||
              blindModalOpen ||
              handReviewOpen ||
              leavePromptOpen ||
              analyticsOpen
            }
            onAction={onAction}
          />
        </section>
      </main>

      <TableChatPanel
        open={chatOpen}
        messages={chatMessages}
        myPlayerId={myPlayerId}
        unreadCount={unreadCount}
        nowMs={chatNow}
        onOpenChange={setChatOpen}
        onSendChat={onSendChat}
      />

      <TableAnalyticsDrawer
        open={analyticsOpen}
        table={table}
        myPlayerId={myPlayerId}
        requestedTab={requestedAnalyticsTab}
        onClose={() => setAnalyticsOpen(false)}
      />

      <BlindSettingsModal
        open={blindModalOpen}
        table={table}
        isHost={isHost}
        botChatStatus={botChatStatus}
        bgmEnabled={bgmEnabled}
        muted={muted}
        onToggleBgm={onToggleBgm}
        onToggleMute={onToggleMute}
        onSave={onUpdateBlindSettings}
        onConfigureBotChat={onConfigureBotChat}
        onClose={() => setBlindModalOpen(false)}
      />

      {/* End-of-Session Leave Prompt */}
      {leavePromptOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="离开牌桌确认"
          data-testid="leave-session-prompt"
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/72 backdrop-blur-sm p-4"
          onClick={() => setLeavePromptOpen(false)}
        >
          <div
            className="w-full max-w-[400px] overflow-hidden rounded-lg border border-white/[0.1] bg-[#0B0D0F] text-[#F3F1EC] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Editorial Header */}
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-3.5">
              <h2 className="font-display text-base font-bold tracking-tight text-[#F5F2EB]">
                离开前，要复盘本场吗？
              </h2>
              <button
                type="button"
                aria-label="留在牌桌"
                onClick={() => setLeavePromptOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/[0.08] text-[#9AA5A0] hover:bg-white/[0.05] hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Unboxed Ledger Body */}
            <div className="px-5 py-4 space-y-3.5">
              <div className="grid grid-cols-3 divide-x divide-white/[0.08] border-y border-white/[0.08] py-2.5">
                <div className="pr-2">
                  <div className="text-[11px] text-[#7E8883]">本场手数</div>
                  <div className="font-mono-num mt-0.5 text-sm font-semibold text-[#F3F1EC]">
                    {completedHeroHands} 手
                  </div>
                </div>
                <div className="px-3">
                  <div className="text-[11px] text-[#7E8883]">本场净盈亏</div>
                  <div
                    className={`font-mono-num mt-0.5 text-sm font-semibold ${
                      myMatchStats
                        ? myMatchStats.sessionNetChips > 0
                          ? 'text-[#8CC9AA]'
                          : myMatchStats.sessionNetChips < 0
                            ? 'text-[#E07A7A]'
                            : 'text-[#E8CF96]'
                        : 'text-[#9AA5A0]'
                    }`}
                  >
                    {myMatchStats
                      ? myMatchStats.sessionNetChips >= 0
                        ? `+${myMatchStats.sessionNetChips.toLocaleString()}`
                        : myMatchStats.sessionNetChips.toLocaleString()
                      : '—'}
                  </div>
                </div>
                <div className="pl-3">
                  <div className="text-[11px] text-[#7E8883]">已标记手牌</div>
                  <div className="font-mono-num mt-0.5 text-sm font-semibold text-[#E8CF96]">
                    {bookmarkedHands.length} 手
                  </div>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-[#9AA5A0]">
                本场盈亏走势与关键转折手牌已归档，复盘完成后可直接离桌返回大厅。
              </p>
            </div>

            {/* Restraint Footer */}
            <div className="flex items-center justify-end gap-2.5 border-t border-white/[0.08] bg-[#090B0C] px-5 py-3">
              <button
                type="button"
                data-testid="prompt-leave-direct-btn"
                onClick={() => {
                  setLeavePromptOpen(false);
                  onLeaveRoom();
                }}
                className="h-9 rounded border border-white/[0.12] bg-transparent px-4 text-xs text-[#C6D0CB] hover:bg-white/[0.05] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                直接离开
              </button>
              <button
                type="button"
                data-testid="prompt-review-session-btn"
                onClick={() => {
                  setLeavePromptOpen(false);
                  setHandReviewMode('leaving');
                  setHandReviewOpen(true);
                }}
                className="h-9 rounded bg-[#D4A853] px-4 text-xs font-bold text-[#0F1210] hover:bg-[#E1B968] transition-colors cursor-pointer whitespace-nowrap"
              >
                复盘本场
              </button>
            </div>
          </div>
        </div>
      )}

      <HandReviewModal
        open={handReviewOpen}
        roomId={table.roomId}
        mode={handReviewMode}
        bookmarkedHands={bookmarkedHands}
        onToggleBookmark={handleToggleBookmarkHand}
        onFetchSessionReview={onFetchSessionReview}
        onOpenPersonalInsights={onOpenPersonalInsights}
        onConfirmLeave={onLeaveRoom}
        onClose={() => setHandReviewOpen(false)}
      />

      {(() => {
        const inspectedPlayer = inspectedPlayerId
          ? table.players.find((p) => p.id === inspectedPlayerId) ?? null
          : null;
        const inspectedLeaderboard = inspectedPlayer
          ? leaderboard.find((e) => e.playerName === inspectedPlayer.name) ?? null
          : null;
        const inspectedSyncedProfile: ResolvedPlayerAvatarProfile | null = inspectedPlayer
          ? resolvePlayerAvatarProfile(
              inspectedPlayer,
              leaderboard,
              inspectedPlayer.id === myPlayerId ? selfProfileFallback : undefined
            )
          : null;
        return (
          <PlayerProfileModal
            player={inspectedPlayer}
            syncedProfile={inspectedSyncedProfile}
            isSelf={inspectedPlayer?.id === myPlayerId}
            isDealer={Boolean(inspectedPlayer && displayDealerSeat === inspectedPlayer.seatIndex)}
            isSmallBlind={Boolean(inspectedPlayer && displaySbSeat === inspectedPlayer.seatIndex)}
            isBigBlind={Boolean(inspectedPlayer && displayBbSeat === inspectedPlayer.seatIndex)}
            matchStats={
              inspectedPlayer ? table.analytics.playerStats[inspectedPlayer.id] ?? null : null
            }
            leaderboardEntry={inspectedLeaderboard}
            onClose={() => setInspectedPlayerId(null)}
            onOpenAllAchievements={onOpenAchievements}
          />
        );
      })()}
    </div>
  );
}
