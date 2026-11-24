import { useEffect } from 'react';
import { Award, Flame, Trophy, X } from 'lucide-react';
import {
  ACHIEVEMENT_MAP,
  ACHIEVEMENT_TIER_LABELS,
  formatAchievementDateTime,
  type AchievementTier,
} from '../shared/achievements';
import {
  resolvePlayerAvatarProfile,
  type RankTier,
  type ResolvedPlayerAvatarProfile,
} from '../shared/playerProfile';
import type {
  ClientPlayerView,
  LeaderboardEntry,
  PlayerMatchStats,
} from '../shared/types';
import { AchievementMedalIcon } from './AchievementBadge';
import { PlayerAvatar } from './PlayerAvatar';

interface PlayerProfileModalProps {
  player: ClientPlayerView | null;
  syncedProfile?: ResolvedPlayerAvatarProfile | null;
  isSelf: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  matchStats: PlayerMatchStats | null;
  leaderboardEntry: LeaderboardEntry | null;
  onClose: () => void;
  onOpenAllAchievements?: () => void;
}

const TIER_TEXT_CLASS: Record<AchievementTier, string> = {
  bronze: 'text-[#D89A6C]',
  silver: 'text-[#C8D4E0]',
  gold: 'text-[#E8CF96]',
  obsidian: 'text-[#F3DA8B]',
};

const RANK_TIER_TEXT_CLASS: Record<RankTier, string> = {
  bronze: 'text-[#C8946D]',
  silver: 'text-[#BFCBD7]',
  gold: 'text-[#E3C682]',
  platinum: 'text-[#96C7C1]',
  diamond: 'text-[#94CBE8]',
  master: 'text-[#F0D994]',
};

export function PlayerProfileModal({
  player,
  syncedProfile = null,
  isSelf,
  isDealer,
  isSmallBlind,
  isBigBlind,
  matchStats,
  leaderboardEntry,
  onClose,
  onOpenAllAchievements,
}: PlayerProfileModalProps) {
  useEffect(() => {
    if (!player) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, onClose]);

  if (!player) return null;

  const handsPlayed = matchStats?.handsPlayed ?? 0;
  const vpipPct =
    handsPlayed > 0
      ? Math.round(((matchStats?.vpipHands ?? 0) / handsPlayed) * 100)
      : null;
  const winPct =
    handsPlayed > 0
      ? Math.round(((matchStats?.handsWon ?? 0) / handsPlayed) * 100)
      : null;
  const showdownPct =
    (matchStats?.showdownReached ?? 0) > 0
      ? Math.round(
          ((matchStats?.showdownWon ?? 0) / (matchStats?.showdownReached ?? 1)) * 100
        )
      : null;
  const sessionNet = matchStats?.sessionNetChips ?? 0;

  const resolved =
    syncedProfile ??
    resolvePlayerAvatarProfile(player, leaderboardEntry ? [leaderboardEntry] : []);
  const achievements = resolved.achievements;
  const achievementDates = resolved.achievementDates;
  const winStreak = resolved.winStreak;

  const positionLabels: string[] = [];
  if (isDealer) positionLabels.push('庄位 D');
  if (isSmallBlind) positionLabels.push('小盲 SB');
  if (isBigBlind) positionLabels.push('大盲 BB');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${player.name} 的牌手档案与成就`}
      data-testid="player-profile-modal"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/74 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-white/[0.1] bg-[#0B0D0F] text-[#F3F1EC] shadow-[0_24px_64px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Clean Identity & Rank Tier (zero clipped corner popovers) */}
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <PlayerAvatar
              avatar={resolved.avatar}
              name={player.name}
              size="lg"
              rankTier={resolved.rankTier}
              showRankAura
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold tracking-tight text-[#F6F3EC]">
                  {player.name}
                </h2>
                <span
                  data-testid="profile-level-label"
                  className={`text-xs font-semibold shrink-0 ${RANK_TIER_TEXT_CLASS[resolved.rankTier]}`}
                >
                  {resolved.rankTierLabel}段位
                </span>
                {winStreak >= 2 && (
                  <span className="font-mono-num inline-flex items-center gap-0.5 text-xs font-medium text-[#E8CF96] shrink-0">
                    <Flame className="h-3 w-3 text-[#D4A853]" aria-hidden="true" />
                    {winStreak}连胜
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#8E9993]">
                <span>{isSelf ? '我' : player.isBot ? '牌桌陪练' : '牌桌玩家'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">座位 #{player.seatIndex + 1}</span>
                {positionLabels.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#DEC386]">{positionLabels.join(' / ')}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            data-testid="profile-close-btn"
            onClick={onClose}
            aria-label="关闭档案弹窗"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/[0.08] text-[#8E9993] hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Live Table Metrics Strip (unboxed hairline ledger matching data panel) */}
          <div>
            <div className="mb-2.5 flex items-center justify-between text-xs text-[#87928C]">
              <span className="font-medium text-[#C8D0CC]">本桌实时数据</span>
              <span className="font-mono-num">
                {handsPlayed > 0 ? `已战 ${handsPlayed} 局` : '尚未结算对局'}
              </span>
            </div>

            <div className="grid grid-cols-4 divide-x divide-white/[0.08] border-y border-white/[0.08] py-3 text-center">
              <div className="px-2">
                <div className="text-[11px] text-[#7E8883]">当前筹码</div>
                <div className="mt-1 font-mono-num text-sm font-bold text-[#E8CF96]">
                  {player.chips.toLocaleString()}
                </div>
              </div>

              <div className="px-2">
                <div className="text-[11px] text-[#7E8883]">本桌盈亏</div>
                <div
                  className={`mt-1 font-mono-num text-sm font-bold ${
                    sessionNet > 0
                      ? 'text-[#8CC9AA]'
                      : sessionNet < 0
                        ? 'text-[#E07A7A]'
                        : 'text-[#C8D0CC]'
                  }`}
                >
                  {sessionNet > 0 ? `+${sessionNet.toLocaleString()}` : sessionNet.toLocaleString()}
                </div>
              </div>

              <div className="px-2">
                <div className="text-[11px] text-[#7E8883]">入池率</div>
                <div className="mt-1 font-mono-num text-sm font-semibold text-[#F1EFE9]">
                  {vpipPct !== null ? `${vpipPct}%` : '—'}
                </div>
              </div>

              <div className="px-2">
                <div className="text-[11px] text-[#7E8883]">胜率</div>
                <div className="mt-1 font-mono-num text-sm font-semibold text-[#F1EFE9]">
                  {winPct !== null ? `${winPct}%` : '—'}
                </div>
              </div>
            </div>

            {showdownPct !== null && (
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#8A948F]">
                <span>摊牌胜率 (W$SD)</span>
                <span className="font-mono-num text-[#D6DDD9]">
                  {showdownPct}% ({matchStats?.showdownWon ?? 0}/{matchStats?.showdownReached ?? 0})
                </span>
              </div>
            )}
          </div>

          {/* Career Leaderboard Summary (when available) */}
          {leaderboardEntry && (
            <div className="border-t border-white/[0.08] pt-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[#C8D0CC]">
                <Trophy className="h-3.5 w-3.5 text-[#D4A853]" aria-hidden="true" />
                <span>俱乐部生涯战绩</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#9AA5A0]">
                <span>
                  积分{' '}
                  <strong className="font-mono-num font-semibold text-[#E8CF96]">
                    {leaderboardEntry.points.toLocaleString()}
                  </strong>
                </span>
                <span aria-hidden="true" className="text-white/20">·</span>
                <span>
                  生涯 {leaderboardEntry.handsWon}/{leaderboardEntry.handsPlayed} 胜
                </span>
                {leaderboardEntry.bestHandName && (
                  <>
                    <span aria-hidden="true" className="text-white/20">·</span>
                    <span>最佳牌型 {leaderboardEntry.bestHandName}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Unlocked Achievements Ledger (unboxed hairlines matching TableAnalyticsDrawer) */}
          <div className="border-t border-white/[0.08] pt-4">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#C8D0CC]">
                <Award className="h-3.5 w-3.5 text-[#D4A853]" aria-hidden="true" />
                <span>荣誉勋章</span>
              </div>
              <span className="font-mono-num text-xs text-[#8A948F]">
                {achievements.length} 枚
              </span>
            </div>

            {achievements.length === 0 ? (
              <div className="border-y border-white/[0.08] py-4 text-center text-xs text-[#79847F]">
                暂未解锁荣誉勋章，完成对局即可逐步点亮
              </div>
            ) : (
              <div className="chat-scroll max-h-48 divide-y divide-white/[0.07] border-y border-white/[0.08] overflow-y-auto pr-1">
                {achievements.map((id) => {
                  const def = ACHIEVEMENT_MAP.get(id);
                  if (!def) return null;
                  const isEquipped = resolved.equippedAchievement === id;
                  return (
                    <div
                      key={id}
                      data-testid={`profile-achievement-${id}`}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <AchievementMedalIcon id={id} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 truncate text-xs font-semibold text-[#F3F1EC]">
                            <span className="truncate">{def.name}</span>
                            {isEquipped && (
                              <span className="shrink-0 text-[10px] font-medium text-[#D4A853]">
                                · 佩戴中
                              </span>
                            )}
                          </span>
                          <span
                            className={`text-[10px] font-medium shrink-0 ${
                              TIER_TEXT_CLASS[def.tier]
                            }`}
                          >
                            {ACHIEVEMENT_TIER_LABELS[def.tier]}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-[#8E9993]">
                          <span className="truncate">{def.description}</span>
                          {achievementDates[id] && (
                            <span className="font-mono-num text-[10px] text-[#737D78] shrink-0">
                              {formatAchievementDateTime(achievementDates[id]).split(' ')[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 rounded-b-lg border-t border-white/[0.08] bg-[#090B0C] px-6 py-3.5">
          <span className="text-[11px] text-[#76807B]">
            Esc 或点击外部关闭
          </span>
          <div className="flex items-center gap-2.5 shrink-0">
            {isSelf && onOpenAllAchievements && (
              <button
                type="button"
                data-testid="profile-open-all-achievements-btn"
                onClick={() => {
                  onClose();
                  onOpenAllAchievements();
                }}
                className="touch-manipulation inline-flex h-8 items-center rounded bg-[#D4A853] px-3.5 text-xs font-bold text-[#0F1210] hover:bg-[#E1B968] transition-colors whitespace-nowrap cursor-pointer"
              >
                前往个人中心
              </button>
            )}
            <button
              type="button"
              data-testid="profile-close-footer-btn"
              onClick={onClose}
              className="touch-manipulation inline-flex h-8 items-center rounded border border-white/[0.12] bg-transparent px-3.5 text-xs font-medium text-[#C8D0CC] hover:bg-white/[0.05] hover:text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
