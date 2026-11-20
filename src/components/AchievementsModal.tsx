import { Award, CheckCircle2, Flame, Lock, X } from 'lucide-react';
import {
  ACHIEVEMENT_TIER_LABELS,
  ACHIEVEMENTS,
  formatAchievementDateTime,
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

const TIER_TEXT_COLOR: Record<AchievementTier, string> = {
  bronze: 'text-[#D89A6C]',
  silver: 'text-[#C8D4E0]',
  gold: 'text-[#E8CF96]',
  obsidian: 'text-[#F3DA8B]',
};

export function AchievementsModal({
  open,
  playerName,
  unlockedIds,
  achievementDates = {},
  winStreak = 0,
  stats,
  onClose,
}: AchievementsModalProps) {
  if (!open) return null;

  const unlockedSet = new Set<AchievementId>(unlockedIds);
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id)).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="achievements-modal-title"
    >
      <div
        data-testid="achievements-modal"
        className="flex max-h-[86vh] w-full max-w-3xl flex-col rounded-md border border-white/[0.12] bg-[#0C0E10] shadow-2xl"
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
            onClick={onClose}
            aria-label="关闭成就勋章馆"
            className="flex h-8 w-8 items-center justify-center rounded border border-white/[0.1] text-[#9AA6A1] hover:bg-white/[0.05] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Hairline Career Telemetry Strip (No Nested Card Boxes) */}
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

        {/* Achievements Ledger Grid */}
        <div className="overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 gap-x-6 gap-y-1">
            {ACHIEVEMENTS.map((ach) => {
              const unlocked = unlockedSet.has(ach.id);
              const unlockedAt = achievementDates[ach.id];
              return (
                <div
                  key={ach.id}
                  data-testid={`achievement-card-${ach.id}`}
                  className={`flex items-start gap-3.5 border-b border-white/[0.07] py-3.5 transition-opacity ${
                    unlocked ? 'opacity-100' : 'opacity-55'
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
                        className={`inline-flex items-center gap-1 text-[11px] font-medium ${
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
