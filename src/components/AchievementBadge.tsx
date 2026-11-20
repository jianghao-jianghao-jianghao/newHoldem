import { useState } from 'react';
import { Flame } from 'lucide-react';
import {
  ACHIEVEMENT_MAP,
  ACHIEVEMENT_TIER_LABELS,
  formatAchievementDateTime,
  type AchievementDatesMap,
  type AchievementId,
  type AchievementTier,
} from '../shared/achievements';

interface AchievementMedalIconProps {
  id: AchievementId;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  locked?: boolean;
  showNativeTitle?: boolean;
}

const TIER_STYLES: Record<
  AchievementTier,
  { bg: string; border: string; fg: string; text: string }
> = {
  bronze: {
    bg: '#2A1B12',
    border: '#B87A4B',
    fg: '#E3A778',
    text: 'text-[#D89A6C]',
  },
  silver: {
    bg: '#1A2026',
    border: '#9FB0C0',
    fg: '#DCE6F0',
    text: 'text-[#C8D4E0]',
  },
  gold: {
    bg: '#251D0D',
    border: '#D4A853',
    fg: '#F2D27A',
    text: 'text-[#E8CF96]',
  },
  obsidian: {
    bg: '#151218',
    border: '#D4A853',
    fg: '#F7DB82',
    text: 'text-[#F3DA8B]',
  },
};

const SIZE_CLASSES: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'h-4 w-4',
  sm: 'h-[18px] w-[18px]',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

function renderMedalGlyph(id: AchievementId, fg: string) {
  switch (id) {
    case 'first_blood':
      return (
        <polygon
          points="12,4 14.5,9.2 20,10 16,13.9 17,19.5 12,16.8 7,19.5 8,13.9 4,10 9.5,9.2"
          fill={fg}
        />
      );
    case 'streak_3':
      return (
        <path
          d="M12 4 C14.5 7 17 9.5 17 13 A5 5 0 1 1 7 13 C7 10.5 8.5 8.5 10 7 C10 9 11 9.5 12 8.5 Z"
          fill={fg}
        />
      );
    case 'streak_5':
      return (
        <>
          <polygon points="5,17 6.5,8 10,12 12,6 14,12 17.5,8 19,17" fill={fg} />
          <rect x="5" y="18" width="14" height="2" rx="1" fill={fg} />
        </>
      );
    case 'allin_winner':
      return (
        <>
          <polygon points="12,4 19,12 12,20 5,12" fill={fg} />
          <circle cx="12" cy="12" r="2.6" fill="#14181A" />
        </>
      );
    case 'allin_jackpot':
      return (
        <>
          <circle cx="12" cy="12" r="6.8" fill="none" stroke={fg} strokeWidth="2.2" />
          <path
            d="M12 7.2 V16.8 M9.5 9.8 C9.5 8.6 14.5 8.6 14.5 10.2 C14.5 11.8 9.5 11.8 9.5 13.6 C9.5 15.2 14.5 15.2 14.5 13.8"
            fill="none"
            stroke={fg}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      );
    case 'mega_pot':
      return (
        <>
          <polygon points="12,3.5 18.5,8.5 16.2,18.5 7.8,18.5 5.5,8.5" fill={fg} />
          <polygon points="12,7 15,10 13.8,15.5 10.2,15.5 9,10" fill="#151218" />
        </>
      );
    case 'bluff_king':
      return (
        <>
          <path
            d="M5 12 C7.5 8.5 10 7.5 12 7.5 C14 7.5 16.5 8.5 19 12 C16.5 15.5 14 16.5 12 16.5 C10 16.5 7.5 15.5 5 12 Z"
            fill="none"
            stroke={fg}
            strokeWidth="2"
          />
          <circle cx="12" cy="12" r="2.3" fill={fg} />
        </>
      );
    case 'trips_master':
      return (
        <>
          <circle cx="12" cy="8.2" r="2.7" fill={fg} />
          <circle cx="8.2" cy="14.5" r="2.7" fill={fg} />
          <circle cx="15.8" cy="14.5" r="2.7" fill={fg} />
          <rect x="11" y="14.5" width="2" height="4.5" fill={fg} />
        </>
      );
    case 'flush_full':
      return (
        <path
          d="M12 5 C8.5 9.5 6.5 11.8 6.5 14.2 A3.5 3.5 0 0 0 12 16.5 A3.5 3.5 0 0 0 17.5 14.2 C17.5 11.8 15.5 9.5 12 5 Z M10.5 16.5 L9 19.5 L15 19.5 L13.5 16.5 Z"
          fill={fg}
        />
      );
    case 'royal_legend':
      return (
        <>
          <path d="M6 17 L5 8 L10 11 L12 5 L14 11 L19 8 L18 17 Z" fill={fg} />
          <circle cx="12" cy="13.5" r="1.6" fill="#151218" />
        </>
      );
    case 'chip_doubler':
      return (
        <>
          <path
            d="M6 16 L10.5 11.5 L13.5 14.2 L18 8.5"
            fill="none"
            stroke={fg}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="14,8.5 18,8.5 18,12.5"
            fill="none"
            stroke={fg}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case 'club_tycoon':
    default:
      return (
        <>
          <path d="M7 6 H17 V11 C17 14 14.8 16 12 16 C9.2 16 7 14 7 11 Z" fill={fg} />
          <rect x="11" y="15.5" width="2" height="3" fill={fg} />
          <rect x="8.5" y="18.2" width="7" height="1.8" rx="0.8" fill={fg} />
        </>
      );
  }
}

export function AchievementMedalIcon({
  id,
  size = 'sm',
  locked = false,
  showNativeTitle = false,
}: AchievementMedalIconProps) {
  const def = ACHIEVEMENT_MAP.get(id);
  if (!def) return null;
  const style = TIER_STYLES[def.tier];
  const sizeClass = SIZE_CLASSES[size];

  return (
    <span
      title={showNativeTitle ? `${def.name} · ${def.description}` : undefined}
      aria-label={def.name}
      className={`${sizeClass} relative inline-flex shrink-0 items-center justify-center rounded-full border select-none shadow-[0_2px_6px_rgba(0,0,0,0.6)] ${
        locked ? 'opacity-35 grayscale' : ''
      }`}
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
      }}
    >
      <svg viewBox="0 0 24 24" className="h-[74%] w-[74%]" aria-hidden="true">
        {renderMedalGlyph(id, style.fg)}
      </svg>
    </span>
  );
}

interface AchievementHoverCardProps {
  id: AchievementId;
  unlockedAt?: number;
  placement?: 'top' | 'bottom';
}

function AchievementHoverCard({
  id,
  unlockedAt,
  placement = 'top',
}: AchievementHoverCardProps) {
  const def = ACHIEVEMENT_MAP.get(id);
  if (!def) return null;
  const tierStyle = TIER_STYLES[def.tier];
  const placementClass =
    placement === 'bottom'
      ? 'top-full mt-2'
      : 'bottom-full mb-2';

  return (
    <div
      role="tooltip"
      data-testid={`achievement-tooltip-${id}`}
      className={`pointer-events-none absolute left-1/2 z-50 w-56 -translate-x-1/2 rounded border border-[#D4A853]/40 bg-[#0D1012]/98 p-3 text-left shadow-[0_12px_32px_rgba(0,0,0,0.75)] ${placementClass}`}
    >
      <div className="flex items-center gap-2.5 border-b border-white/[0.08] pb-2">
        <AchievementMedalIcon id={id} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-[#F3F1EC]">
            {def.name}
          </div>
          <div className={`text-[10px] font-medium ${tierStyle.text}`}>
            {ACHIEVEMENT_TIER_LABELS[def.tier]}
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
        <div>
          <span className="text-[#7E8883]">解锁条件：</span>
          <span className="text-[#D4CFC4]">{def.description}</span>
        </div>
        <div className="font-mono-num">
          <span className="text-[#7E8883]">解锁日期：</span>
          <span className="text-[#E8CF96]">{formatAchievementDateTime(unlockedAt)}</span>
        </div>
      </div>
    </div>
  );
}

interface AvatarAchievementShowcaseProps {
  achievements?: AchievementId[];
  achievementDates?: AchievementDatesMap;
  winStreak?: number;
  maxVisible?: number;
  size?: 'xs' | 'sm';
  tooltipPlacement?: 'top' | 'bottom';
  onOpenAchievements?: () => void;
  className?: string;
}

/**
 * Anchored at the top-right of the player's avatar. Hovering or focusing
 * any achievement medal reveals a club-styled card with full unlock condition and date.
 */
export function AvatarAchievementShowcase({
  achievements = [],
  achievementDates = {},
  winStreak = 0,
  maxVisible = 3,
  size = 'xs',
  tooltipPlacement = 'top',
  onOpenAchievements,
  className = 'absolute -top-2 -right-2.5 z-20',
}: AvatarAchievementShowcaseProps) {
  const [hoveredId, setHoveredId] = useState<AchievementId | null>(null);
  const [hoverExtra, setHoverExtra] = useState(false);

  if (achievements.length === 0 && winStreak < 2) return null;

  const shown = achievements.slice(0, maxVisible);
  const extraItems = achievements.slice(maxVisible);

  return (
    <div
      data-testid="avatar-badge-showcase"
      aria-label="玩家成就勋章展示"
      className={`pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/[0.12] bg-[#0B0D0F]/96 px-1 py-0.5 shadow-[0_4px_12px_rgba(0,0,0,0.65)] ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {shown.map((id) => {
        const def = ACHIEVEMENT_MAP.get(id);
        if (!def) return null;
        return (
          <div
            key={id}
            className="relative flex items-center"
            onMouseEnter={() => setHoveredId(id)}
            onMouseLeave={() => setHoveredId((curr) => (curr === id ? null : curr))}
          >
            <button
              type="button"
              data-testid={`showcase-medal-${id}`}
              aria-label={`${def.name}：${def.description}`}
              onFocus={() => setHoveredId(id)}
              onBlur={() => setHoveredId((curr) => (curr === id ? null : curr))}
              onClick={() => {
                if (onOpenAchievements) {
                  onOpenAchievements();
                } else {
                  setHoveredId((curr) => (curr === id ? null : id));
                }
              }}
              className="flex items-center justify-center rounded-full focus-visible:outline-1 focus-visible:outline-[#D4A853] hover:scale-110 transition-transform cursor-pointer"
            >
              <AchievementMedalIcon id={id} size={size} />
            </button>

            {hoveredId === id && (
              <AchievementHoverCard
                id={id}
                unlockedAt={achievementDates[id]}
                placement={tooltipPlacement}
              />
            )}
          </div>
        );
      })}

      {extraItems.length > 0 && (
        <div
          className="relative flex items-center"
          onMouseEnter={() => setHoverExtra(true)}
          onMouseLeave={() => setHoverExtra(false)}
        >
          <button
            type="button"
            onFocus={() => setHoverExtra(true)}
            onBlur={() => setHoverExtra(false)}
            onClick={onOpenAchievements}
            className="font-mono-num px-1 text-[10px] font-semibold text-[#E8CF96] hover:text-white leading-none cursor-pointer"
            aria-label={`另有 ${extraItems.length} 枚成就勋章`}
          >
            +{extraItems.length}
          </button>

          {hoverExtra && (
            <div
              role="tooltip"
              className={`pointer-events-none absolute left-1/2 z-50 w-56 -translate-x-1/2 rounded border border-[#D4A853]/40 bg-[#0D1012]/98 p-2.5 text-left shadow-[0_12px_32px_rgba(0,0,0,0.75)] ${
                tooltipPlacement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
              }`}
            >
              <div className="border-b border-white/[0.08] pb-1.5 mb-1.5 text-[11px] font-semibold text-[#E8CF96]">
                更多已解锁勋章 ({extraItems.length})
              </div>
              <div className="space-y-1.5">
                {extraItems.slice(0, 5).map((eid) => {
                  const edef = ACHIEVEMENT_MAP.get(eid);
                  if (!edef) return null;
                  return (
                    <div key={eid} className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <AchievementMedalIcon id={eid} size="xs" />
                        <span className="truncate text-[#EAE6DC]">{edef.name}</span>
                      </div>
                      <span className="font-mono-num text-[10px] text-[#8E9893] shrink-0">
                        {formatAchievementDateTime(achievementDates[eid]).split(' ')[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {winStreak >= 2 && (
        <span
          title={`当前 ${winStreak} 连胜`}
          className="font-mono-num inline-flex items-center gap-0.5 pl-0.5 pr-1 text-[10px] font-semibold text-[#E8CF96] leading-none"
        >
          <Flame className="h-2.5 w-2.5 text-[#D4A853]" aria-hidden="true" />
          {winStreak}
        </span>
      )}
    </div>
  );
}

interface AchievementMedalRowProps {
  achievements?: AchievementId[];
  achievementDates?: AchievementDatesMap;
  winStreak?: number;
  maxVisible?: number;
  size?: 'xs' | 'sm';
  onClick?: () => void;
}

export function AchievementMedalRow({
  achievements = [],
  achievementDates = {},
  winStreak = 0,
  maxVisible = 3,
  size = 'xs',
  onClick,
}: AchievementMedalRowProps) {
  const [hoveredId, setHoveredId] = useState<AchievementId | null>(null);

  if (achievements.length === 0 && winStreak < 2) return null;

  const shown = achievements.slice(0, maxVisible);
  const extra = Math.max(0, achievements.length - shown.length);

  return (
    <span
      data-testid="avatar-medal-row"
      className="inline-flex items-center gap-1"
    >
      {shown.map((id) => (
        <span
          key={id}
          className="relative inline-flex items-center"
          onMouseEnter={() => setHoveredId(id)}
          onMouseLeave={() => setHoveredId((curr) => (curr === id ? null : curr))}
        >
          <span
            onClick={onClick}
            className={onClick ? 'cursor-pointer hover:scale-110 transition-transform' : ''}
          >
            <AchievementMedalIcon id={id} size={size} />
          </span>
          {hoveredId === id && (
            <AchievementHoverCard
              id={id}
              unlockedAt={achievementDates[id]}
              placement="top"
            />
          )}
        </span>
      ))}
      {extra > 0 && (
        <span className="font-mono-num text-[10px] font-semibold text-[#D4A853]">
          +{extra}
        </span>
      )}
      {winStreak >= 2 && (
        <span
          title={`当前 ${winStreak} 连胜`}
          className="font-mono-num inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#E8CF96]"
        >
          <Flame className="h-2.5 w-2.5 text-[#D4A853]" aria-hidden="true" />
          {winStreak}
        </span>
      )}
    </span>
  );
}
