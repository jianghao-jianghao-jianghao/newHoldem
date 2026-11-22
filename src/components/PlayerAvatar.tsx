import { useEffect, useState } from 'react';
import type { AchievementTier } from '../shared/achievements';
import { getAvatarInitial, isCustomAvatarDataUrl } from '../shared/avatarUtils';
import {
  RANK_TIER_LABELS,
  type RankTier,
  type ResolvedPlayerAvatarProfile,
} from '../shared/playerProfile';

interface PlayerAvatarProps {
  avatar?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  level?: number;
  levelTier?: AchievementTier;
  levelTitle?: string;
  rankTier?: RankTier;
  showLevelBadge?: boolean;
  showRankAura?: boolean;
  syncedProfile?: ResolvedPlayerAvatarProfile | null;
  className?: string;
}

const SIZE_MAP = {
  xs: 'h-8 w-8 text-xs',
  sm: 'h-10 w-10 text-sm',
  md: 'h-12 w-12 text-base',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-16 w-16 text-xl',
};

const RANK_BORDER_CLASS: Record<RankTier, string> = {
  bronze: 'border-[#B87D52]/70',
  silver: 'border-[#C5D3E0]/75',
  gold: 'border-[#E1BC66]/85',
  diamond: 'border-[#A5E5FF]/90',
};

const RANK_BADGE_CLASS: Record<RankTier, string> = {
  bronze: 'border-[#B87D52]/75 bg-[#17120E] text-[#E6B894]',
  silver: 'border-[#B9C9D8]/75 bg-[#10151B] text-[#E2EBF4]',
  gold: 'border-[#D4A853]/85 bg-[#16130B] text-[#F5DFA0]',
  diamond: 'border-[#8AD8FF]/90 bg-[#0A131A] text-[#D8F3FF] shadow-[0_0_10px_rgba(125,211,252,0.45)]',
};

function mapAchievementTierToRankTier(tier?: AchievementTier): RankTier | undefined {
  if (!tier) return undefined;
  if (tier === 'obsidian') return 'diamond';
  return tier;
}

function renderPresetEmblem(id: string, name: string) {
  switch (id) {
    case 'spade':
      return (
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true">
          <rect width="40" height="40" fill="#102C21" />
          <path
            d="M20 8 C14 15.5 9.5 19.5 9.5 23.8 C9.5 27 12.2 29.2 15.2 29.2 C17.1 29.2 18.7 28.2 20 26.8 C21.3 28.2 22.9 29.2 24.8 29.2 C27.8 29.2 30.5 27 30.5 23.8 C30.5 19.5 26 15.5 20 8 Z M17.8 28.5 L15.5 33.5 L24.5 33.5 L22.2 28.5 Z"
            fill="#E5B95C"
          />
        </svg>
      );
    case 'fox':
      return (
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true">
          <rect width="40" height="40" fill="#2A1614" />
          <polygon points="9,9 17,15 11,22" fill="#D95338" />
          <polygon points="31,9 23,15 29,22" fill="#D95338" />
          <polygon points="10,16 30,16 25,31 20,33 15,31" fill="#EE6C4D" />
          <polygon points="15,24 20,33 25,24" fill="#F8F3EA" />
          <circle cx="16.5" cy="21" r="1.6" fill="#151517" />
          <circle cx="23.5" cy="21" r="1.6" fill="#151517" />
          <circle cx="20" cy="30.5" r="1.8" fill="#151517" />
        </svg>
      );
    case 'owl':
      return (
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true">
          <rect width="40" height="40" fill="#171E27" />
          <path d="M10 13 L15 16 L25 16 L30 13 L29 31 L20 34 L11 31 Z" fill="#2E3F53" />
          <circle cx="15.5" cy="20.5" r="4.5" fill="#F5E4B8" />
          <circle cx="24.5" cy="20.5" r="4.5" fill="#F5E4B8" />
          <circle cx="15.5" cy="20.5" r="2" fill="#12161A" />
          <circle cx="24.5" cy="20.5" r="2" fill="#12161A" />
          <polygon points="20,23 17.5,27 22.5,27" fill="#D4A853" />
        </svg>
      );
    case 'lion':
      return (
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true">
          <rect width="40" height="40" fill="#231B12" />
          <polygon points="20,6 28,11 33,20 28,31 20,35 12,31 7,20 12,11" fill="#A67428" />
          <circle cx="20" cy="21" r="8.5" fill="#E4B85B" />
          <circle cx="16.8" cy="19.5" r="1.4" fill="#1C140C" />
          <circle cx="23.2" cy="19.5" r="1.4" fill="#1C140C" />
          <polygon points="20,22 18,24.5 22,24.5" fill="#1C140C" />
        </svg>
      );
    case 'crown':
      return (
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true">
          <rect width="40" height="40" fill="#1A1722" />
          <polygon points="8,28 10,14 16.5,21 20,11 23.5,21 30,14 32,28" fill="#D4A853" />
          <rect x="8" y="29" width="24" height="3.5" rx="1" fill="#F3D695" />
        </svg>
      );
    case 'phoenix':
      return (
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true">
          <rect width="40" height="40" fill="#241219" />
          <path d="M20 8 C24 14 29 15 31 22 C27 21 24 23 23 28 L20 33 L17 28 C16 23 13 21 9 22 C11 15 16 14 20 8 Z" fill="#E04F5F" />
          <path d="M20 13 C22 17 24 19 24 23 L20 27 L16 23 C16 19 18 17 20 13 Z" fill="#F2B857" />
        </svg>
      );
    case 'default':
    default:
      return (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1C2421] to-[#0E1311] font-display font-bold text-[#E8CF96]">
          {getAvatarInitial(name)}
        </span>
      );
  }
}

export function PlayerAvatar({
  avatar,
  name,
  size = 'sm',
  level,
  levelTier,
  levelTitle,
  rankTier,
  showLevelBadge = false,
  showRankAura = false,
  syncedProfile = null,
  className = '',
}: PlayerAvatarProps) {
  const effectiveAvatar = avatar ?? syncedProfile?.avatar ?? 'default';
  const effectiveLevel = level ?? syncedProfile?.levelInfo.level;
  const effectiveTitle = levelTitle ?? syncedProfile?.levelInfo.title;
  const effectiveRankTier: RankTier =
    rankTier ??
    syncedProfile?.rankTier ??
    mapAchievementTierToRankTier(levelTier ?? syncedProfile?.levelInfo.tier) ??
    'bronze';

  const shouldRenderAura = showRankAura || showLevelBadge;

  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [effectiveAvatar]);

  const sizeClass = SIZE_MAP[size];
  const isCustom = isCustomAvatarDataUrl(effectiveAvatar) && !imgFailed;
  const ringClass = shouldRenderAura
    ? RANK_BORDER_CLASS[effectiveRankTier]
    : 'border-[#D4A853]/40';
  const badgeToneClass = RANK_BADGE_CLASS[effectiveRankTier];
  const isLarge = size === 'lg' || size === 'xl';

  return (
    <div className="relative inline-flex shrink-0 select-none">
      {/* Dynamic Leaderboard Rank Aura (Bronze / Silver / Gold / Diamond) */}
      {shouldRenderAura && (
        <span
          aria-hidden="true"
          data-testid="avatar-rank-aura"
          data-rank-tier={effectiveRankTier}
          className="pointer-events-none absolute inset-0"
        >
          <span className={`avatar-aura-glow avatar-aura-glow-${effectiveRankTier}`} />
          <span className={`avatar-aura-ring avatar-aura-ring-${effectiveRankTier}`} />
        </span>
      )}

      <div
        className={`${sizeClass} relative z-10 shrink-0 overflow-hidden rounded-full border-[1.5px] bg-[#121618] ${ringClass} ${className}`}
      >
        {isCustom ? (
          <img
            src={effectiveAvatar}
            alt={name || '玩家头像'}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          renderPresetEmblem(effectiveAvatar, name)
        )}
      </div>

      {showLevelBadge && typeof effectiveLevel === 'number' && effectiveLevel >= 1 && (
        <span
          data-testid="avatar-level-badge"
          title={`${RANK_TIER_LABELS[effectiveRankTier]}段位 · Lv.${effectiveLevel}${
            effectiveTitle ? ` ${effectiveTitle}` : ''
          }`}
          className={`pointer-events-none absolute -bottom-1 -right-1 z-20 inline-flex items-center justify-center rounded-full border font-mono-num font-bold leading-none shadow-[0_2px_6px_rgba(0,0,0,0.82)] ${badgeToneClass} ${
            isLarge
              ? 'h-[18px] min-w-[26px] px-1.5 text-[9.5px]'
              : 'h-[15px] min-w-[22px] px-1 text-[8.5px]'
          }`}
        >
          Lv.{effectiveLevel}
        </span>
      )}
    </div>
  );
}
