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
    case 'seven_two_legend':
      // Iconic 7-2 jester/wildcard diamond cards glyph
      return (
        <>
          <rect x="4.5" y="5.5" width="8.5" height="12" rx="1.4" fill="none" stroke={fg} strokeWidth="1.7" />
          <path d="M6.8 9.2 H10.8 L8.2 14.5" fill="none" stroke={fg} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="11" y="7" width="8.5" height="12" rx="1.4" fill="#151218" stroke={fg} strokeWidth="1.7" />
          <path d="M13.5 11.2 C13.5 10 17 10 17 11.6 C17 13 13.5 13.8 13.5 15.5 H17.2" fill="none" stroke={fg} strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
    case 'chip_whale':
      // Stylized geometric whale tail crest
      return (
        <>
          <path
            d="M12 18.5 V11.5 C12 8.5 8 5.5 5 6.8 C6.8 9.5 8.5 11 10.6 11.5 C9.4 13.8 8.2 15.8 7 17.2 M12 11.5 C12 8.5 16 5.5 19 6.8 C17.2 9.5 15.5 11 13.4 11.5 C14.6 13.8 15.8 15.8 17 17.2"
            fill="none"
            stroke={fg}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M6.5 18.8 H17.5" stroke={fg} strokeWidth="1.8" strokeLinecap="round" />
        </>
      );
    case 'high_card_hero':
      // Minimalist wind-gust / air blade glyph
      return (
        <>
          <path d="M4.5 9.5 H15.5 C17.5 9.5 17.5 6.5 15.5 6.5 C14.3 6.5 13.6 7.3 13.6 8" fill="none" stroke={fg} strokeWidth="1.9" strokeLinecap="round" />
          <path d="M4.5 13 H18.2 C19.8 13 19.8 15.8 18 15.8 C16.9 15.8 16.3 15 16.3 14.3" fill="none" stroke={fg} strokeWidth="1.9" strokeLinecap="round" />
          <path d="M6.5 16.5 H12.8" fill="none" stroke={fg} strokeWidth="1.9" strokeLinecap="round" />
        </>
      );
    case 'short_stack_ninja':
      // Razor 4-point shuriken emblem
      return (
        <>
          <polygon points="12,3.5 14.2,9.8 20.5,12 14.2,14.2 12,20.5 9.8,14.2 3.5,12 9.8,9.8" fill={fg} />
          <circle cx="12" cy="12" r="2.1" fill="#1A1710" />
        </>
      );
    case 'pocket_rockets':
      // Ascending sleek rocket / Ace chevron
      return (
        <>
          <path d="M12 4 C14.8 6.8 16 10 15.5 14.2 L12 12.6 L8.5 14.2 C8 10 9.2 6.8 12 4 Z" fill={fg} />
          <path d="M8.5 13.5 L6.2 16.5 L9.4 15.8 M15.5 13.5 L17.8 16.5 L14.6 15.8" fill={fg} />
          <path d="M12 15.2 V19.5" stroke={fg} strokeWidth="2" strokeLinecap="round" />
        </>
      );
    case 'aces_cracked':
      // Cracked Ace lightning fracture
      return (
        <>
          <polygon points="12,4 18.5,14.5 13.5,14.5 12,11 10.5,14.5 5.5,14.5" fill="none" stroke={fg} strokeWidth="1.8" strokeLinejoin="round" />
          <polyline points="13.5,5.5 10.5,11.5 13.8,12.2 10.2,19.2" fill="none" stroke={fg} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'bad_beat_survivor':
      // Broken shield / storm bolt emblem
      return (
        <>
          <path d="M12 4.2 L18 6.8 V12 C18 15.8 15.4 18.5 12 19.8 C8.6 18.5 6 15.8 6 12 V6.8 Z" fill="none" stroke={fg} strokeWidth="1.9" strokeLinejoin="round" />
          <polyline points="12.5,7.2 10.2,11.8 13.4,12.4 11.2,16.8" fill="none" stroke={fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'blind_guardian':
      // Club shield with inner fortress bar
      return (
        <>
          <path d="M12 4 L18.2 6.6 V11.8 C18.2 15.8 15.5 18.4 12 19.8 C8.5 18.4 5.8 15.8 5.8 11.8 V6.6 Z" fill={fg} />
          <rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1" fill="#1A2026" />
        </>
      );
    case 'iron_regular':
      // Classic club clock / veteran ring
      return (
        <>
          <circle cx="12" cy="12" r="7" fill="none" stroke={fg} strokeWidth="2" />
          <polyline points="12,7.8 12,12 15.2,13.8" fill="none" stroke={fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'preflop_bandit':
      // Lightning strike fast-steal bolt
      return (
        <polygon points="13.5,3.8 6.5,13 11.5,13 10.2,20.2 17.5,10.8 12.6,10.8" fill={fg} />
      );
    case 'split_peace':
      // Balanced twin halves / scales emblem
      return (
        <>
          <line x1="12" y1="5" x2="12" y2="19" stroke={fg} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="6" y1="8.5" x2="18" y2="8.5" stroke={fg} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="7.2" cy="13.8" r="2.2" fill={fg} />
          <circle cx="16.8" cy="13.8" r="2.2" fill={fg} />
        </>
      );
    case 'tuition_paid':
      // Graduation cap ("交完学费")
      return (
        <>
          <polygon points="12,6.2 19.5,10.2 12,14.2 4.5,10.2" fill={fg} />
          <path d="M7.5 12.2 V15.8 C7.5 17 9.5 18 12 18 C14.5 18 16.5 17 16.5 15.8 V12.2" fill="none" stroke={fg} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="19" y1="10.5" x2="19" y2="15.8" stroke={fg} strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
    case 'showdown_streak_3':
      // Triple showdown cards fan with strike chevron
      return (
        <>
          <rect x="4.8" y="6.8" width="6.2" height="9.4" rx="1.2" fill="none" stroke={fg} strokeWidth="1.6" transform="rotate(-14 7.9 11.5)" />
          <rect x="8.9" y="5.4" width="6.2" height="9.4" rx="1.2" fill="#1A1710" stroke={fg} strokeWidth="1.7" />
          <rect x="13" y="6.8" width="6.2" height="9.4" rx="1.2" fill="none" stroke={fg} strokeWidth="1.6" transform="rotate(14 16.1 11.5)" />
          <polyline points="8.2,17.8 12,20 15.8,17.8" fill="none" stroke={fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'doyle_brunson':
      // Classic Texas ten-deuce (T2) laurel monogram
      return (
        <>
          <rect x="4.5" y="5.5" width="8.2" height="12" rx="1.4" fill="none" stroke={fg} strokeWidth="1.6" />
          <path d="M6.4 9.2 H10.8 M8.6 9.2 V14.6" fill="none" stroke={fg} strokeWidth="1.6" strokeLinecap="round" />
          <rect x="11.2" y="7" width="8.2" height="12" rx="1.4" fill="#151218" stroke={fg} strokeWidth="1.6" />
          <path d="M13.6 11.2 C13.6 10 17 10 17 11.6 C17 13 13.6 13.8 13.6 15.5 H17.2" fill="none" stroke={fg} strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
    case 'big_slick_win':
      // Sleek twin Ace-King diamond blades
      return (
        <>
          <path d="M6 17 L9.5 6.5 L13 17 M7.3 13.6 H11.7" fill="none" stroke={fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14.5 7 V17 M18.5 7.5 L14.8 12 L18.8 17" fill="none" stroke={fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'cowboys_win':
      // Western cowboy hat & star spur crest (KK)
      return (
        <>
          <path d="M4.5 14.2 C7.5 15.8 16.5 15.8 19.5 14.2" fill="none" stroke={fg} strokeWidth="2" strokeLinecap="round" />
          <path d="M7.2 14.2 L8.8 8.2 C9.8 9.2 11 9.5 12 8.6 C13 9.5 14.2 9.2 15.2 8.2 L16.8 14.2" fill={fg} />
          <circle cx="12" cy="18.2" r="1.5" fill={fg} />
        </>
      );
    case 'snowmen_win':
      // Geometric double-8 snowman silhouette
      return (
        <>
          <circle cx="12" cy="8.2" r="3.2" fill="none" stroke={fg} strokeWidth="2" />
          <circle cx="12" cy="15.2" r="4.3" fill="none" stroke={fg} strokeWidth="2" />
          <circle cx="12" cy="14.2" r="0.9" fill={fg} />
          <circle cx="12" cy="16.6" r="0.9" fill={fg} />
        </>
      );
    case 'suited_connector_art':
      // Interlocked twin spades / sequential chain link
      return (
        <>
          <rect x="4.5" y="9" width="8.5" height="6" rx="3" fill="none" stroke={fg} strokeWidth="2" />
          <rect x="11" y="9" width="8.5" height="6" rx="3" fill="none" stroke={fg} strokeWidth="2" />
          <circle cx="12" cy="6" r="1.3" fill={fg} />
          <circle cx="12" cy="18" r="1.3" fill={fg} />
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
  /** Explicit single equipped medal (null hides medal cleanly; undefined falls back to achievements[0]) */
  equippedAchievement?: AchievementId | null;
  achievements?: AchievementId[];
  achievementDates?: AchievementDatesMap;
  size?: 'xs' | 'sm';
  tooltipPlacement?: 'top' | 'bottom';
  onOpenAchievements?: () => void;
  className?: string;
}

/**
 * Anchored cleanly at the top-right of a player's avatar frame.
 * Enforces strictly ONE equipped signature medal (zero multi-badge row or +N clutter).
 * Hovering or focusing reveals the club tooltip with unlock condition and date.
 */
export function AvatarAchievementShowcase({
  equippedAchievement,
  achievements = [],
  achievementDates = {},
  size = 'sm',
  tooltipPlacement = 'top',
  onOpenAchievements,
  className = 'absolute -top-1.5 -right-1.5 z-20',
}: AvatarAchievementShowcaseProps) {
  const [hovered, setHovered] = useState(false);

  const activeId: AchievementId | null =
    equippedAchievement !== undefined
      ? equippedAchievement
      : (achievements[0] ?? null);

  if (!activeId) return null;
  const def = ACHIEVEMENT_MAP.get(activeId);
  if (!def) return null;

  return (
    <div
      data-testid="avatar-badge-showcase"
      aria-label={`佩戴勋章：${def.name}`}
      className={`pointer-events-auto flex items-center justify-center ${className}`}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        data-testid={`showcase-medal-${activeId}`}
        aria-label={`佩戴勋章 ${def.name}：${def.description}`}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={() => {
          if (onOpenAchievements) {
            onOpenAchievements();
          } else {
            setHovered((curr) => !curr);
          }
        }}
        className="flex items-center justify-center rounded-full ring-2 ring-[#0B0E10] shadow-[0_3px_10px_rgba(0,0,0,0.75)] hover:scale-110 focus-visible:outline-1 focus-visible:outline-[#D4A853] transition-transform cursor-pointer"
      >
        <AchievementMedalIcon id={activeId} size={size} />
      </button>

      {hovered && (
        <AchievementHoverCard
          id={activeId}
          unlockedAt={achievementDates[activeId]}
          placement={tooltipPlacement}
        />
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
