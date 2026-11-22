import { useEffect, useState } from 'react';
import { Award, CheckCircle2, Flame, Lock, X } from 'lucide-react';
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_TIER_LABELS,
  ACHIEVEMENTS,
  formatAchievementDateTime,
  type AchievementCategory,
  type AchievementDatesMap,
  type AchievementId,
  type AchievementTier,
  type PlayerAchievementStats,
} from '../shared/achievements';
import { AchievementMedalIcon } from './AchievementBadge';

interface AchievementsModalProps {
  open: boolean;
  playerName: string;
  unlockedIds: AchievementId[];
  achievementDates?: AchievementDatesMap;
  winStreak?: number;
  stats?: PlayerAchievementStats | null;
  onClose: () => void;
}

type FilterTab = 'all' | AchievementCategory;

const TIER_TEXT_COLOR: Record<AchievementTier, string> = {
  bronze: 'text-[#D89A6C]',
  silver: 'text-[#C8D4E0]',
  gold: 'text-[#E8CF96]',
  obsidian: 'text-[#F3DA8B]',
};

const FILTER_TABS: Array<{ id: FilterTab; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'glory', label: ACHIEVEMENT_CATEGORY_LABELS.glory },
  { id: 'fun', label: ACHIEVEMENT_CATEGORY_LABELS.fun },
  { id: 'tactics', label: ACHIEVEMENT_CATEGORY_LABELS.tactics },
];

export function AchievementsModal({
  open,
  playerName,
  unlockedIds,
  achievementDates = {},
  winStreak = 0,
  stats,
  onClose,
}: AchievementsModalProps) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const unlockedSet = new Set<AchievementId>(unlockedIds);
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id)).length;
  const visibleAchievements =
    activeFilter === 'all'
      ? ACHIEVEMENTS
      : ACHIEVEMENTS.filter((a) => a.category === activeFilter);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="achievements-modal-title"
      onClick={onClose}
    >
      <div
        data-testid="achievements-modal"
        className="flex max-h-[86vh] w-full max-w-3xl flex-col rounded-md border border-white/[0.12] bg-[#0C0E10] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-3">
            <Award className="h-5 w-5 text-[#D4A853]" aria-hidden="true" />
            <div>
              <h2
                id="achievements-modal-title"
                className="font-display text-xl font-bold tracking-tight text-[#F4F2EC]"
              >
                俱乐部荣誉勋章馆
              </h2>
              <p className="text-xs text-[#8E9893]">
                {playerName ? `${playerName} · ` : ''}
                已解锁 <span className="font-mono-num text-[#E8CF96]">{unlockedCount}</span> /{' '}
                <span className="font-mono-num">{ACHIEVEMENTS.length}</span> 枚勋章
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="achievements-close-btn"
            onClick={onClose}
            aria-label="关闭成就勋章馆"
            className="flex h-8 w-8 items-center justify-center rounded border border-white/[0.1] text-[#9AA6A1] hover:bg-white/[0.05] hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Hairline Career Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] border-b border-white/[0.08] bg-[#090B0C] px-4 sm:px-6 py-3">
          <div className="px-2 py-1">
            <div className="text-[11px] text-[#7E8883]">当前连胜</div>
            <div className="font-mono-num mt-0.5 flex items-center gap-1 text-base font-semibold text-[#E8CF96]">
              <Flame className="h-3.5 w-3.5 text-[#D4A853]" aria-hidden="true" />
              <span>{stats?.currentWinStreak ?? winStreak} 局</span>
            </div>
          </div>
          <div className="px-2 py-1">
            <div className="text-[11px] text-[#7E8883]">最高连胜</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[#F3F1EC]">
              {stats?.maxWinStreak ?? winStreak} 局
            </div>
          </div>
          <div className="px-2 py-1">
            <div className="text-[11px] text-[#7E8883]">全押胜场</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[#F3F1EC]">
              {stats?.allInWins ?? 0} 次
            </div>
          </div>
          <div className="px-2 py-1">
            <div className="text-[11px] text-[#7E8883]">单局最大奖金</div>
            <div className="font-mono-num mt-0.5 text-base font-semibold text-[#8CC9AA]">
              {(stats?.maxPotWon ?? 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Hairline Category Filter Tabs (no pill boxes) */}
        <div
          role="tablist"
          aria-label="成就分类筛选"
          className="flex items-center gap-5 border-b border-white/[0.08] px-6 text-xs"
        >
          {FILTER_TABS.map((tab) => {
            const tabCount =
              tab.id === 'all'
                ? ACHIEVEMENTS.length
                : ACHIEVEMENTS.filter((a) => a.category === tab.id).length;
            const tabUnlocked =
              tab.id === 'all'
                ? unlockedCount
                : ACHIEVEMENTS.filter(
                    (a) => a.category === tab.id && unlockedSet.has(a.id)
                  ).length;
            const active = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`achievement-tab-${tab.id}`}
                onClick={() => setActiveFilter(tab.id)}
                className={`relative py-2.5 font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active ? 'text-[#F0DFB3]' : 'text-[#84908A] hover:text-[#D4DCD8]'
                }`}
              >
                <span>{tab.label}</span>
                <span className="ml-1.5 font-mono-num text-[11px] opacity-70">
                  {tabUnlocked}/{tabCount}
                </span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-[#D4A853]"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Achievements Ledger Grid */}
        <div className="overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 gap-x-6 gap-y-1">
            {visibleAchievements.map((ach) => {
              const unlocked = unlockedSet.has(ach.id);
              const unlockedAt = achievementDates[ach.id];
              return (
                <div
                  key={ach.id}
                  data-testid={`achievement-card-${ach.id}`}
                  className={`flex items-start gap-3.5 border-b border-white/[0.07] py-3.5 transition-opacity ${
                    unlocked ? 'opacity-100' : 'opacity-60'
                  }`}
                >
                  <AchievementMedalIcon
                    id={ach.id}
                    size="lg"
                    locked={!unlocked}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#F3F1EC]">
                        {ach.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium shrink-0 ${
                          unlocked ? TIER_TEXT_COLOR[ach.tier] : 'text-[#6D7772]'
                        }`}
                      >
                        {unlocked ? (
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Lock className="h-3 w-3" aria-hidden="true" />
                        )}
                        <span>{ACHIEVEMENT_TIER_LABELS[ach.tier]}</span>
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#9AA5A0]">
                      {ach.description}
                    </p>
                    {unlocked && (
                      <p className="mt-1 font-mono-num text-[11px] text-[#D4A853]">
                        解锁于 {formatAchievementDateTime(unlockedAt)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
