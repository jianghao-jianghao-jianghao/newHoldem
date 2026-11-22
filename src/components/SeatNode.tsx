import { useEffect, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { isEmojiOnlyMessage } from '../shared/chatUtils';
import {
  resolvePlayerAvatarProfile,
  type ResolvedPlayerAvatarProfile,
} from '../shared/playerProfile';
import type { Card, ChatMessage, ClientPlayerView } from '../shared/types';
import type { AvatarImpactEvent } from '../utils/avatarImpactFx';
import { AvatarAchievementShowcase } from './AchievementBadge';
import { AvatarImpactBubbleCanvas } from './AvatarImpactBubbleCanvas';
import { ChipStackVisual2D } from './ChipStack2D';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayingCard } from './PlayingCard';

export interface SeatNudgeFx {
  id: string;
  message: string;
}

interface SeatNodeProps {
  player: ClientPlayerView;
  isSelf: boolean;
  isTurn: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  nextBlindRole?: 'SB' | 'BB' | 'D' | null;
  isWinner: boolean;
  winAmount?: number;
  highlightedCards: Card[];
  secondsRemaining: number | null;
  chatBubble?: ChatMessage | null;
  impactFx?: AvatarImpactEvent | null;
  nudgeFx?: SeatNudgeFx | null;
  isNewlyJoined?: boolean;
  compact?: boolean;
  canRemoveBot?: boolean;
  syncedProfile?: ResolvedPlayerAvatarProfile | null;
  onRemoveBot?: (botId: string) => void;
  onNudgePlayer?: (playerId: string) => void;
  onInspectPlayer?: (playerId: string) => void;
  onOpenAchievements?: () => void;
}

function isCardInSet(card: Card, set: Card[]): boolean {
  return set.some((c) => c.rank === card.rank && c.suit === card.suit);
}

export function SeatNode({
  player,
  isSelf,
  isTurn,
  isDealer,
  isSmallBlind,
  isBigBlind,
  nextBlindRole = null,
  isWinner,
  winAmount,
  highlightedCards,
  secondsRemaining,
  chatBubble = null,
  impactFx = null,
  nudgeFx = null,
  isNewlyJoined = false,
  compact = false,
  canRemoveBot = false,
  syncedProfile = null,
  onRemoveBot,
  onNudgePlayer,
  onInspectPlayer,
  onOpenAchievements,
}: SeatNodeProps) {
  const resolved = syncedProfile ?? resolvePlayerAvatarProfile(player, []);
  const clickTimerRef = useRef<number | null>(null);
  const [avatarHoverPulse, setAvatarHoverPulse] = useState(0);

  const triggerAvatarRipple = () => {
    if (impactFx) {
      setAvatarHoverPulse((n) => n + 1);
    }
  };

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  const handleOpponentAvatarClick = () => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      onInspectPlayer?.(player.id);
    }, 220);
  };

  const handleOpponentAvatarDoubleClick = () => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onNudgePlayer?.(player.id);
  };

  const dimmed = player.folded || !player.inHand;
  const turnPct =
    isTurn && secondsRemaining !== null
      ? Math.max(0, Math.min(100, (secondsRemaining / 25) * 100))
      : 0;

  if (isSelf) {
    return (
      <div
        data-testid={`seat-${player.id}`}
        className={`relative flex items-end justify-center gap-3 sm:gap-4 ${
          impactFx ? 'z-50' : ''
        } ${isNewlyJoined ? 'animate-seat-enter' : ''}`}
      >
        {/* Crisp 2D Hero Hole Cards (refined proportion complementing the 3D table) */}
        <div
          data-seat-cards={player.id}
          className="flex items-center gap-1.5"
        >
          {player.holeCards && player.holeCards.length > 0 ? (
            player.holeCards.map((card, idx) => (
              <PlayingCard
                key={`${card.suit}-${card.rank}-${idx}`}
                card={card}
                size="md"
                dimmed={player.folded && !player.revealed}
                highlighted={
                  highlightedCards.length > 0 && isCardInSet(card, highlightedCards)
                }
              />
            ))
          ) : (
            <div className="flex h-[68px] sm:h-[90px] items-center rounded border border-dashed border-white/[0.1] bg-[#0B0E10]/74 px-4 text-xs text-[#7D8782]">
              等待发牌
            </div>
          )}
        </div>

        {/* Sleek Self Nameplate */}
        <div
          data-seat-anchor={player.id}
          className={`relative overflow-visible min-w-[196px] sm:min-w-[238px] rounded-md px-3 py-2.5 backdrop-blur-md transition-all ${
            impactFx ? 'z-50' : ''
          } ${
            isWinner
              ? 'border border-[#D4A853]/85 bg-[#121613]/92 animate-chip-impact'
              : isTurn
              ? 'border border-[#E8CF96]/80 bg-[#121614]/94 animate-turn-glow'
              : 'border border-white/[0.08] bg-[#0B0E10]/86'
          } ${dimmed && !isWinner ? 'opacity-70' : ''}`}
        >
          {nudgeFx && (
            <div
              key={nudgeFx.id}
              role="status"
              data-testid={`nudge-bubble-${player.id}`}
              className="pointer-events-none absolute -top-9 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded border border-[#D4A853]/55 bg-[#12100C]/98 px-2.5 py-1 text-[11px] font-medium text-[#EED9A5] shadow-lg animate-chip-impact flex items-center gap-1.5"
            >
              <BellRing className="h-3 w-3 text-[#D4A853]" aria-hidden="true" />
              <span>{nudgeFx.message}</span>
            </div>
          )}

          {chatBubble &&
            (isEmojiOnlyMessage(chatBubble.text) ? (
              <div
                key={chatBubble.id}
                role="status"
                data-testid={`chat-bubble-${player.id}`}
                className="pointer-events-none absolute bottom-full right-3 z-30 mb-2 select-none text-[30px] leading-none tracking-tight drop-shadow-[0_6px_14px_rgba(0,0,0,0.82)] animate-emote-pop"
              >
                {chatBubble.text}
              </div>
            ) : (
              <div
                key={chatBubble.id}
                role="status"
                data-testid={`chat-bubble-${player.id}`}
                className="pointer-events-none absolute bottom-full right-0 z-30 mb-2.5 max-w-[228px] rounded-xl border border-white/[0.15] bg-[#0D1114]/92 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-[#F5F2EB] shadow-[0_10px_26px_rgba(0,0,0,0.62)] animate-chat-bubble"
              >
                <span className="block break-words leading-snug">{chatBubble.text}</span>
                <span
                  aria-hidden="true"
                  className="absolute -bottom-1 right-5 h-2 w-2 rotate-45 border-b border-r border-white/[0.15] bg-[#0D1114]"
                />
              </div>
            ))}

          {(isDealer || isSmallBlind || isBigBlind) && (
            <div className="absolute -top-3 -right-2 z-20 flex items-center gap-1">
              {isDealer && (
                <span
                  title="庄家 (Dealer)"
                  data-testid={`badge-dealer-${player.id}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#D4A853] bg-[#F7F1E3] text-[11px] font-black text-[#0F1210] shadow-[0_3px_10px_rgba(0,0,0,0.65)] ring-1 ring-black/40"
                >
                  D
                </span>
              )}
              {isSmallBlind && (
                <span
                  title="小盲位 (Small Blind)"
                  data-testid={`badge-sb-${player.id}`}
                  className="inline-flex h-6 items-center gap-1 rounded-full border-[1.5px] border-[#9CE2F4] bg-[#0D5970] px-2 text-[10px] font-bold tracking-tight text-white shadow-[0_3px_10px_rgba(0,0,0,0.65)] ring-1 ring-black/40"
                >
                  <span className="font-mono-num font-black text-[#BDF0FC]">SB</span>
                  <span>小盲</span>
                </span>
              )}
              {isBigBlind && (
                <span
                  title="大盲位 (Big Blind)"
                  data-testid={`badge-bb-${player.id}`}
                  className="inline-flex h-6 items-center gap-1 rounded-full border-[1.5px] border-[#F2C86B] bg-[#9C2218] px-2 text-[10px] font-bold tracking-tight text-white shadow-[0_3px_10px_rgba(0,0,0,0.65)] ring-1 ring-black/40"
                >
                  <span className="font-mono-num font-black text-[#FDE4A3]">BB</span>
                  <span>大盲</span>
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Self Avatar: Canvas dynamic impact bubble anchored directly above avatar */}
            <div className="relative shrink-0 overflow-visible">
              <AvatarImpactBubbleCanvas
                event={impactFx}
                playerId={player.id}
                placement="self"
                interactiveNonce={avatarHoverPulse}
              />
              <button
                type="button"
                onMouseEnter={triggerAvatarRipple}
                onClick={() => {
                  triggerAvatarRipple();
                  if (onInspectPlayer) onInspectPlayer(player.id);
                  else onOpenAchievements?.();
                }}
                data-testid={`profile-avatar-${player.id}`}
                title="单击查看我的档案与成就"
                aria-label={`查看 ${player.name} 的档案与成就`}
                className="group relative flex rounded-full focus-visible:outline-2 focus-visible:outline-[#D4A853] active:scale-95 transition-transform cursor-pointer"
              >
                {nudgeFx && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 rounded-full border-2 border-[#D4A853] animate-nudge-pulse"
                  />
                )}
                <PlayerAvatar
                  avatar={resolved.avatar}
                  name={player.name}
                  size="lg"
                  level={resolved.levelInfo.level}
                  levelTier={resolved.levelInfo.tier}
                  levelTitle={resolved.levelInfo.title}
                  rankTier={resolved.rankTier}
                  showLevelBadge
                  showRankAura
                  className="group-hover:border-[#E8CF96] transition-colors"
                />
              </button>
              {(isSmallBlind || isBigBlind) && (
                <span
                  aria-label={isSmallBlind ? '小盲位 SB' : '大盲位 BB'}
                  title={isSmallBlind ? '小盲位 (SB)' : '大盲位 (BB)'}
                  data-testid={`avatar-blind-icon-${player.id}`}
                  className={`pointer-events-none absolute -bottom-1 -left-1.5 z-20 flex h-5 min-w-5 items-center justify-center rounded-full border-[1.5px] px-1 font-mono-num text-[9px] font-black leading-none shadow-[0_2px_8px_rgba(0,0,0,0.75)] ${
                    isSmallBlind
                      ? 'border-[#9CE2F4] bg-[#0D5970] text-white'
                      : 'border-[#F2C86B] bg-[#9C2218] text-[#FFF8E6]'
                  }`}
                >
                  {isSmallBlind ? 'SB' : 'BB'}
                </span>
              )}
              <AvatarAchievementShowcase
                equippedAchievement={resolved.equippedAchievement}
                achievementDates={resolved.achievementDates}
                size="sm"
                tooltipPlacement="top"
                onOpenAchievements={() =>
                  onInspectPlayer ? onInspectPlayer(player.id) : onOpenAchievements?.()
                }
                className="absolute -top-1.5 -right-1.5 z-20"
              />
            </div>

            <div className="min-w-0 flex-1 pl-1">
              <div className="flex items-center justify-between gap-1.5">
                <span className="truncate text-xs sm:text-sm font-semibold text-[#F3F1EC] max-w-[132px] sm:max-w-[168px]">
                  {player.name}
                </span>
                {nextBlindRole && (
                  <span
                    data-testid={`next-blind-${player.id}`}
                    className={`font-mono-num rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${
                      nextBlindRole === 'SB'
                        ? 'bg-[#114E60]/70 text-[#BDE7F2]'
                        : nextBlindRole === 'BB'
                          ? 'bg-[#8E231B]/75 text-[#FCE6B5]'
                          : 'bg-[#D4A853]/18 text-[#E8CF96]'
                    }`}
                  >
                    {nextBlindRole === 'SB' ? '下局小盲' : nextBlindRole === 'BB' ? '下局大盲' : '下局庄'}
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="font-mono-num text-sm sm:text-base font-bold text-[#E8CF96]">
                  {player.chips.toLocaleString()}
                </span>
                {isTurn && secondsRemaining !== null ? (
                  <span className="inline-flex items-center gap-1.5 font-mono-num text-xs font-semibold">
                    {player.currentBet > 0 && (
                      <span className="text-[11px] font-normal text-[#9AA5A0]">
                        注 {player.currentBet}
                      </span>
                    )}
                    <span
                      className={
                        secondsRemaining <= 5 ? 'text-[#F87171]' : 'text-[#E8CF96]'
                      }
                    >
                      行动 {secondsRemaining}s
                    </span>
                  </span>
                ) : isWinner && winAmount ? (
                  <span className="font-mono-num text-xs font-semibold text-[#8CC9AA]">
                    +{winAmount}
                  </span>
                ) : player.currentBet > 0 ? (
                  <span className="inline-flex items-center gap-1 font-mono-num text-[11px] text-[#9AA5A0]">
                    <span className="md:hidden">
                      <ChipStackVisual2D amount={player.currentBet} maxLayers={4} />
                    </span>
                    <span>下注 {player.currentBet}</span>
                  </span>
                ) : player.lastActionLabel ? (
                  <span className="text-[11px] text-[#9AA5A0]">{player.lastActionLabel}</span>
                ) : null}
              </div>
            </div>
          </div>

          {isTurn && (
            <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className={`h-full transition-[width] duration-250 ease-linear ${
                  secondsRemaining !== null && secondsRemaining <= 5
                    ? 'bg-[#EF4444]'
                    : 'bg-[#D4A853]'
                }`}
                style={{ width: `${turnPct}%` }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Opponent Plate positioned in upper perimeter
  return (
    <div
      data-testid={`seat-${player.id}`}
      className={`relative flex flex-col items-center gap-1 transition-opacity duration-200 ${
        impactFx ? 'z-50' : ''
      } ${!player.connected && !player.isBot ? 'opacity-60' : ''} ${
        isNewlyJoined ? 'animate-seat-enter' : ''
      }`}
    >
      <div
        data-seat-anchor={player.id}
        className={`relative overflow-visible ${impactFx ? 'z-50' : ''} ${
          compact ? 'min-w-[152px] sm:min-w-[172px]' : 'min-w-[168px] sm:min-w-[206px]'
        } rounded-md px-2.5 py-2 backdrop-blur-md transition-all ${
          isWinner
            ? 'border border-[#D4A853]/85 bg-[#121613]/92 animate-chip-impact'
            : isTurn
            ? 'border border-[#E8CF96]/80 bg-[#121614]/94 animate-turn-glow'
            : 'border border-white/[0.08] bg-[#0B0E10]/84'
        } ${dimmed && !isWinner ? 'opacity-65' : ''}`}
      >
        {nudgeFx && (
          <div
            key={nudgeFx.id}
            role="status"
            data-testid={`nudge-bubble-${player.id}`}
            className="pointer-events-none absolute top-full left-1/2 z-40 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-[#D4A853]/55 bg-[#12100C]/98 px-2.5 py-0.5 text-[11px] font-medium text-[#EED9A5] shadow-lg animate-chip-impact flex items-center gap-1.5"
          >
            <BellRing className="h-3 w-3 text-[#D4A853]" aria-hidden="true" />
            <span>{nudgeFx.message}</span>
          </div>
        )}

        {(isDealer || isSmallBlind || isBigBlind) && (
          <div className="absolute -top-3 -right-2 z-20 flex items-center gap-1">
            {isDealer && (
              <span
                title="庄家 (Dealer)"
                data-testid={`badge-dealer-${player.id}`}
                className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#D4A853] bg-[#F7F1E3] text-[10px] font-black text-[#0F1210] shadow-[0_3px_10px_rgba(0,0,0,0.65)] ring-1 ring-black/40"
              >
                D
              </span>
            )}
            {isSmallBlind && (
              <span
                title="小盲位 (Small Blind)"
                data-testid={`badge-sb-${player.id}`}
                className="inline-flex h-5 items-center gap-0.5 rounded-full border-[1.5px] border-[#9CE2F4] bg-[#0D5970] px-1.5 text-[10px] font-bold tracking-tight text-white shadow-[0_3px_10px_rgba(0,0,0,0.65)] ring-1 ring-black/40"
              >
                <span className="font-mono-num font-black text-[#BDF0FC]">SB</span>
                <span>小盲</span>
              </span>
            )}
            {isBigBlind && (
              <span
                title="大盲位 (Big Blind)"
                data-testid={`badge-bb-${player.id}`}
                className="inline-flex h-5 items-center gap-0.5 rounded-full border-[1.5px] border-[#F2C86B] bg-[#9C2218] px-1.5 text-[10px] font-bold tracking-tight text-white shadow-[0_3px_10px_rgba(0,0,0,0.65)] ring-1 ring-black/40"
              >
                <span className="font-mono-num font-black text-[#FDE4A3]">BB</span>
                <span>大盲</span>
              </span>
            )}
          </div>
        )}

        {canRemoveBot && player.isBot && onRemoveBot && (
          <button
            type="button"
            onClick={() => onRemoveBot(player.id)}
            aria-label={`移除机器人 ${player.name}`}
            className="absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-[#14181A] text-[#9AA6A1] hover:text-white transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}

        <div className="flex items-center gap-2.5">
          {/* Opponent Avatar: Canvas dynamic impact bubble anchored directly above avatar */}
          <div className="relative shrink-0 overflow-visible">
            <AvatarImpactBubbleCanvas
              event={impactFx}
              playerId={player.id}
              placement="opponent"
              interactiveNonce={avatarHoverPulse}
            />
            <button
              type="button"
              onMouseEnter={triggerAvatarRipple}
              onClick={() => {
                triggerAvatarRipple();
                handleOpponentAvatarClick();
              }}
              onDoubleClick={handleOpponentAvatarDoubleClick}
              data-testid={`nudge-avatar-${player.id}`}
              title={`单击查看 ${player.name} 的档案与成就 · 双击提醒`}
              aria-label={`单击查看 ${player.name} 档案与成就，双击提醒`}
              className="group relative flex rounded-full focus-visible:outline-2 focus-visible:outline-[#D4A853] active:scale-95 transition-transform cursor-pointer"
            >
              {nudgeFx && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-1 rounded-full border-2 border-[#D4A853] animate-nudge-pulse"
                />
              )}
              <PlayerAvatar
                avatar={resolved.avatar}
                name={player.name}
                size="sm"
                level={resolved.levelInfo.level}
                levelTier={resolved.levelInfo.tier}
                levelTitle={resolved.levelInfo.title}
                rankTier={resolved.rankTier}
                showLevelBadge
                showRankAura
                className="group-hover:border-[#E8CF96] group-hover:ring-2 group-hover:ring-[#D4A853]/30 transition-all"
              />
            </button>

            {(isSmallBlind || isBigBlind) && (
              <span
                aria-label={isSmallBlind ? '小盲位 SB' : '大盲位 BB'}
                title={isSmallBlind ? '小盲位 (SB)' : '大盲位 (BB)'}
                data-testid={`avatar-blind-icon-${player.id}`}
                className={`pointer-events-none absolute -bottom-1 -left-1.5 z-20 flex h-4 min-w-4 items-center justify-center rounded-full border px-1 font-mono-num text-[8.5px] font-black leading-none shadow-[0_2px_6px_rgba(0,0,0,0.75)] ${
                  isSmallBlind
                    ? 'border-[#9CE2F4] bg-[#0D5970] text-white'
                    : 'border-[#F2C86B] bg-[#9C2218] text-[#FFF8E6]'
                }`}
              >
                {isSmallBlind ? 'SB' : 'BB'}
              </span>
            )}

            <AvatarAchievementShowcase
              equippedAchievement={resolved.equippedAchievement}
              achievementDates={resolved.achievementDates}
              size="xs"
              tooltipPlacement="bottom"
              onOpenAchievements={() => onInspectPlayer?.(player.id)}
              className="absolute -top-1.5 -right-1.5 z-20"
            />
          </div>

          <div className="min-w-0 flex-1 pl-0.5">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate text-xs font-semibold text-[#F3F1EC] max-w-[82px] sm:max-w-[106px]">
                  {player.name}
                </span>
                {player.isBot && (
                  <span className="shrink-0 text-[10px] font-normal text-[#7B8580]">
                    陪练
                  </span>
                )}
              </div>
              {nextBlindRole && (
                <span
                  data-testid={`next-blind-${player.id}`}
                  className={`font-mono-num rounded px-1 py-0.5 text-[10px] font-semibold shrink-0 ${
                    nextBlindRole === 'SB'
                      ? 'bg-[#114E60]/70 text-[#BDE7F2]'
                      : nextBlindRole === 'BB'
                        ? 'bg-[#8E231B]/75 text-[#FCE6B5]'
                        : 'bg-[#D4A853]/18 text-[#E8CF96]'
                  }`}
                >
                  {nextBlindRole === 'SB' ? '下局小盲' : nextBlindRole === 'BB' ? '下局大盲' : '下局庄'}
                </span>
              )}
            </div>

            <div className="mt-0.5 flex items-center justify-between gap-1.5">
              <span className="font-mono-num text-xs font-bold text-[#E8CF96]">
                {player.chips.toLocaleString()}
              </span>

              {isTurn && secondsRemaining !== null ? (
                <span className="inline-flex items-center gap-1 font-mono-num text-[11px] font-semibold">
                  {player.currentBet > 0 && (
                    <span className="font-normal text-[#9AA5A0]">注 {player.currentBet}</span>
                  )}
                  <span
                    className={
                      secondsRemaining <= 5 ? 'text-[#F87171]' : 'text-[#E8CF96]'
                    }
                  >
                    {secondsRemaining}s
                  </span>
                </span>
              ) : isWinner && winAmount ? (
                <span className="font-mono-num text-[11px] font-semibold text-[#8CC9AA]">
                  +{winAmount}
                </span>
              ) : player.currentBet > 0 ? (
                <span className="inline-flex items-center gap-1 font-mono-num text-[11px] text-[#9AA5A0]">
                  <span className="md:hidden">
                    <ChipStackVisual2D amount={player.currentBet} maxLayers={4} />
                  </span>
                  <span>注 {player.currentBet}</span>
                </span>
              ) : player.lastActionLabel ? (
                <span className="text-[11px] text-[#9AA5A0] whitespace-nowrap">
                  {player.lastActionLabel}
                </span>
              ) : !player.connected && !player.isBot ? (
                <span className="text-[11px] text-[#E07A7A]">离线</span>
              ) : null}
            </div>
          </div>
        </div>

        {isTurn && (
          <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={`h-full transition-[width] duration-250 ease-linear ${
                secondsRemaining !== null && secondsRemaining <= 5
                  ? 'bg-[#EF4444]'
                  : 'bg-[#D4A853]'
              }`}
              style={{ width: `${turnPct}%` }}
            />
          </div>
        )}
      </div>

      {/* Opponent Floating Chat Bubble / Emote Pop */}
      {chatBubble &&
        (isEmojiOnlyMessage(chatBubble.text) ? (
          <div
            key={chatBubble.id}
            role="status"
            data-testid={`chat-bubble-${player.id}`}
            className="pointer-events-none absolute top-full left-1/2 z-30 mt-1.5 -translate-x-1/2 select-none text-[28px] leading-none tracking-tight drop-shadow-[0_6px_14px_rgba(0,0,0,0.82)] animate-emote-pop"
          >
            {chatBubble.text}
          </div>
        ) : (
          <div
            key={chatBubble.id}
            role="status"
            data-testid={`chat-bubble-${player.id}`}
            className="pointer-events-none absolute top-full left-1/2 z-30 mt-2 w-max max-w-[196px] -translate-x-1/2 rounded-xl border border-white/[0.15] bg-[#0D1114]/92 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-[#F5F2EB] shadow-[0_10px_26px_rgba(0,0,0,0.62)] animate-chat-bubble"
          >
            <span
              aria-hidden="true"
              className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-white/[0.15] bg-[#0D1114]"
            />
            <span className="block break-words leading-snug text-center">{chatBubble.text}</span>
          </div>
        ))}

      {/* Showdown / All-in / Manually Revealed Opponent Cards + Hand Category */}
      {player.holeCards && player.holeCards.length > 0 ? (
        <div className="flex flex-col items-center gap-1 animate-deal">
          <div className="flex items-center gap-1">
            {player.holeCards.map((card, idx) => (
              <PlayingCard
                key={`${card.suit}-${card.rank}-${idx}`}
                card={card}
                size="sm"
                dimmed={player.folded && !player.revealed}
                highlighted={
                  highlightedCards.length > 0 && isCardInSet(card, highlightedCards)
                }
              />
            ))}
          </div>
          {player.handEvaluation?.categoryName && (
            <span
              data-testid={`opponent-hand-cat-${player.id}`}
              className={`rounded bg-[#0A0D0F]/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${
                isWinner ? 'text-[#F3DFAC]' : 'text-[#A5B0AA]'
              }`}
            >
              {player.handEvaluation.categoryName}
            </span>
          )}
        </div>
      ) : player.inHand && !player.folded && player.cardCount > 0 ? (
        <div className="md:hidden flex items-center gap-0.5" aria-hidden="true">
          <div className="h-6 w-4 rounded-[3px] border border-[#D4A853]/50 bg-[#12382A]" />
          <div className="h-6 w-4 rounded-[3px] border border-[#D4A853]/50 bg-[#12382A]" />
        </div>
      ) : null}
    </div>
  );
}
