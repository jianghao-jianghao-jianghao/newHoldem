import type { HandCategory } from './types';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'obsidian';

export type AchievementId =
  | 'first_blood'
  | 'streak_3'
  | 'streak_5'
  | 'allin_winner'
  | 'allin_jackpot'
  | 'mega_pot'
  | 'bluff_king'
  | 'trips_master'
  | 'flush_full'
  | 'royal_legend'
  | 'chip_doubler'
  | 'club_tycoon';

export interface AchievementDef {
  id: AchievementId;
  name: string;
  description: string;
  tier: AchievementTier;
  /** Higher weight appears first in compact medal row beside avatar */
  priority: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'royal_legend',
    name: '殿堂传奇',
    description: '摊牌亮出四条、同花顺或皇家同花顺',
    tier: 'obsidian',
    priority: 120,
  },
  {
    id: 'mega_pot',
    name: '金池主宰',
    description: '单局赢下至少 60 倍大盲注的超大底池',
    tier: 'obsidian',
    priority: 110,
  },
  {
    id: 'streak_5',
    name: '五连封神',
    description: '连续赢下 5 局牌局',
    tier: 'gold',
    priority: 100,
  },
  {
    id: 'allin_jackpot',
    name: '豪赌巨赏',
    description: '单局全押 (All-in) 并赢取至少 1,000 筹码奖金',
    tier: 'gold',
    priority: 95,
  },
  {
    id: 'club_tycoon',
    name: '俱乐部大亨',
    description: '累计赢下 10 局对局，或累计净胜筹码达到 2,000',
    tier: 'gold',
    priority: 90,
  },
  {
    id: 'streak_3',
    name: '三连胜',
    description: '连续赢下 3 局牌局',
    tier: 'silver',
    priority: 80,
  },
  {
    id: 'allin_winner',
    name: '破釜沉舟',
    description: '在牌局中全押 (All-in) 并最终赢下底池',
    tier: 'silver',
    priority: 75,
  },
  {
    id: 'flush_full',
    name: '花船精英',
    description: '摊牌亮出顺子、同花或葫芦赢下对局',
    tier: 'silver',
    priority: 70,
  },
  {
    id: 'chip_doubler',
    name: '筹码翻倍',
    description: '在牌桌中将持有筹码增至初始筹码的 2 倍以上',
    tier: 'silver',
    priority: 65,
  },
  {
    id: 'trips_master',
    name: '三条猎手',
    description: '摊牌亮出三条或更高牌型',
    tier: 'bronze',
    priority: 50,
  },
  {
    id: 'bluff_king',
    name: '气场压制',
    description: '迫使所有对手弃牌不战而胜累计 3 次',
    tier: 'bronze',
    priority: 45,
  },
  {
    id: 'first_blood',
    name: '初露锋芒',
    description: '赢下个人第 1 局德州扑克胜利',
    tier: 'bronze',
    priority: 40,
  },
];

export const ACHIEVEMENT_MAP = new Map<AchievementId, AchievementDef>(
  ACHIEVEMENTS.map((a) => [a.id, a])
);

export type AchievementDatesMap = Partial<Record<AchievementId, number>>;

export const ACHIEVEMENT_TIER_LABELS: Record<AchievementTier, string> = {
  bronze: '铜章',
  silver: '银章',
  gold: '金章',
  obsidian: '传奇黑金',
};

export function sanitizeAchievementIds(raw: unknown): AchievementId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<AchievementId>();
  for (const item of raw) {
    if (typeof item === 'string' && ACHIEVEMENT_MAP.has(item as AchievementId)) {
      seen.add(item as AchievementId);
    }
  }
  return Array.from(seen).sort(
    (a, b) =>
      (ACHIEVEMENT_MAP.get(b)?.priority ?? 0) -
      (ACHIEVEMENT_MAP.get(a)?.priority ?? 0)
  );
}

export function sanitizeAchievementDates(raw: unknown): AchievementDatesMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: AchievementDatesMap = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (
      ACHIEVEMENT_MAP.has(key as AchievementId) &&
      typeof val === 'number' &&
      Number.isFinite(val) &&
      val > 0
    ) {
      result[key as AchievementId] = Math.floor(val);
    }
  }
  return result;
}

export function mergeAchievementDates(
  existingDates: AchievementDatesMap | undefined,
  unlockedIds: AchievementId[],
  newlyUnlocked: AchievementId[],
  nowMs: number = Date.now()
): AchievementDatesMap {
  const next: AchievementDatesMap = sanitizeAchievementDates(existingDates);
  for (const id of newlyUnlocked) {
    if (!next[id]) {
      next[id] = nowMs;
    }
  }
  for (const id of unlockedIds) {
    if (!next[id]) {
      next[id] = nowMs;
    }
  }
  return next;
}

export function formatAchievementDate(timestamp?: number): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
    return '早期解锁';
  }
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatAchievementDateTime(timestamp?: number): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
    return '早期俱乐部纪录';
  }
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export interface PlayerAchievementStats {
  handsPlayed: number;
  handsWon: number;
  currentWinStreak: number;
  maxWinStreak: number;
  allInWins: number;
  maxAllInPotWon: number;
  maxPotWon: number;
  foldWins: number;
  bestHandCategory: HandCategory;
  doubledChips: boolean;
  netChips: number;
}

export function createEmptyAchievementStats(): PlayerAchievementStats {
  return {
    handsPlayed: 0,
    handsWon: 0,
    currentWinStreak: 0,
    maxWinStreak: 0,
    allInWins: 0,
    maxAllInPotWon: 0,
    maxPotWon: 0,
    foldWins: 0,
    bestHandCategory: 0,
    doubledChips: false,
    netChips: 0,
  };
}

export interface HandAchievementInput {
  won: boolean;
  potWon: number;
  netChips: number;
  wasAllIn: boolean;
  wonByFold: boolean;
  handCategory?: HandCategory | null;
  currentChips: number;
  startingChips: number;
  bigBlind: number;
}

export function evaluateAchievementsFromStats(
  stats: PlayerAchievementStats,
  bigBlind: number = 20
): AchievementId[] {
  const unlocked: AchievementId[] = [];
  const safeBB = Math.max(1, bigBlind);

  if (stats.handsWon >= 1) unlocked.push('first_blood');
  if (stats.maxWinStreak >= 3) unlocked.push('streak_3');
  if (stats.maxWinStreak >= 5) unlocked.push('streak_5');
  if (stats.allInWins >= 1) unlocked.push('allin_winner');
  if (stats.maxAllInPotWon >= 1000) unlocked.push('allin_jackpot');
  if (stats.maxPotWon >= safeBB * 60) unlocked.push('mega_pot');
  if (stats.foldWins >= 3) unlocked.push('bluff_king');
  if (stats.bestHandCategory >= 3) unlocked.push('trips_master');
  if (stats.bestHandCategory >= 4) unlocked.push('flush_full');
  if (stats.bestHandCategory >= 7) unlocked.push('royal_legend');
  if (stats.doubledChips) unlocked.push('chip_doubler');
  if (stats.handsWon >= 10 || stats.netChips >= 2000) unlocked.push('club_tycoon');

  // Sort by priority descending so the most prestigious medals appear first
  unlocked.sort(
    (a, b) =>
      (ACHIEVEMENT_MAP.get(b)?.priority ?? 0) -
      (ACHIEVEMENT_MAP.get(a)?.priority ?? 0)
  );
  return unlocked;
}

export function applyHandToAchievementStats(
  prevStats: PlayerAchievementStats | undefined,
  prevUnlocked: AchievementId[] | undefined,
  input: HandAchievementInput
): {
  nextStats: PlayerAchievementStats;
  unlocked: AchievementId[];
  newlyUnlocked: AchievementId[];
} {
  const base = prevStats
    ? { ...prevStats }
    : createEmptyAchievementStats();

  base.handsPlayed += 1;
  base.netChips += input.netChips;

  if (input.won) {
    base.handsWon += 1;
    base.currentWinStreak += 1;
    if (base.currentWinStreak > base.maxWinStreak) {
      base.maxWinStreak = base.currentWinStreak;
    }
    if (input.potWon > base.maxPotWon) {
      base.maxPotWon = input.potWon;
    }
    if (input.wasAllIn) {
      base.allInWins += 1;
      if (input.potWon > base.maxAllInPotWon) {
        base.maxAllInPotWon = input.potWon;
      }
    }
    if (input.wonByFold) {
      base.foldWins += 1;
    }
  } else {
    base.currentWinStreak = 0;
  }

  if (
    typeof input.handCategory === 'number' &&
    input.handCategory > base.bestHandCategory
  ) {
    base.bestHandCategory = input.handCategory;
  }

  if (input.startingChips > 0 && input.currentChips >= input.startingChips * 2) {
    base.doubledChips = true;
  }

  const prevSet = new Set<AchievementId>(prevUnlocked ?? []);
  const evaluated = evaluateAchievementsFromStats(base, input.bigBlind);
  const mergedSet = new Set<AchievementId>([...prevSet, ...evaluated]);
  const unlocked = Array.from(mergedSet).sort(
    (a, b) =>
      (ACHIEVEMENT_MAP.get(b)?.priority ?? 0) -
      (ACHIEVEMENT_MAP.get(a)?.priority ?? 0)
  );
  const newlyUnlocked = evaluated.filter((id) => !prevSet.has(id));

  return {
    nextStats: base,
    unlocked,
    newlyUnlocked,
  };
}
