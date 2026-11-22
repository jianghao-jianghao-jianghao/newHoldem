import {
  ACHIEVEMENT_MAP,
  createEmptyAchievementStats,
  resolveEquippedAchievement,
  sanitizeAchievementDates,
  sanitizeAchievementIds,
  sanitizeEquippedAchievement,
  type AchievementDatesMap,
  type AchievementId,
  type AchievementTier,
  type EquippedAchievementPref,
  type PlayerAchievementStats,
} from './achievements';
import { sanitizeAvatar } from './avatarUtils';
import type { ClientPlayerView, HandCategory, LeaderboardEntry } from './types';

function sortAchievementsByPrestige(ids: AchievementId[]): AchievementId[] {
  return [...ids].sort(
    (a, b) =>
      (ACHIEVEMENT_MAP.get(b)?.priority ?? 0) -
      (ACHIEVEMENT_MAP.get(a)?.priority ?? 0)
  );
}

export type RankTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export const RANK_TIER_LABELS: Record<RankTier, string> = {
  bronze: '青铜',
  silver: '白银',
  gold: '黄金',
  diamond: '钻石',
};

export interface PlayerLevelInfo {
  level: number;
  title: string;
  tier: AchievementTier;
  xp: number;
}

export interface ResolvedPlayerAvatarProfile {
  avatar: string;
  achievements: AchievementId[];
  achievementDates: AchievementDatesMap;
  equippedAchievement: AchievementId | null;
  winStreak: number;
  levelInfo: PlayerLevelInfo;
  rankTier: RankTier;
  rankTierLabel: string;
  leaderboardRank: number | null;
  points: number;
  handsPlayed: number;
  handsWon: number;
}

export interface BotClubPreset {
  name: string;
  avatar: string;
  achievements: AchievementId[];
  handsPlayed: number;
  handsWon: number;
  points: number;
  currentWinStreak: number;
  maxWinStreak: number;
  bestHandCategory: HandCategory;
}

const ACHIEVEMENT_TIER_XP: Record<AchievementTier, number> = {
  bronze: 60,
  silver: 110,
  gold: 180,
  obsidian: 280,
};

const LEVEL_THRESHOLDS: Array<{
  minXp: number;
  level: number;
  title: string;
  tier: AchievementTier;
}> = [
  { minXp: 0, level: 1, title: '新秀牌手', tier: 'bronze' },
  { minXp: 80, level: 2, title: '常驻牌客', tier: 'bronze' },
  { minXp: 200, level: 3, title: '俱乐部会员', tier: 'silver' },
  { minXp: 360, level: 4, title: '读牌熟手', tier: 'silver' },
  { minXp: 540, level: 5, title: '精算猎手', tier: 'silver' },
  { minXp: 760, level: 6, title: '底池掌控者', tier: 'gold' },
  { minXp: 1020, level: 7, title: '桌霸大师', tier: 'gold' },
  { minXp: 1320, level: 8, title: '高额常客', tier: 'gold' },
  { minXp: 1650, level: 9, title: '金丝绒元老', tier: 'gold' },
  { minXp: 2000, level: 10, title: '黑金宗师', tier: 'obsidian' },
  { minXp: 2600, level: 12, title: '传奇牌圣', tier: 'obsidian' },
];

const BOT_CLUB_PRESETS: Record<string, BotClubPreset> = {
  陈默: {
    name: '陈默',
    avatar: 'spade',
    achievements: ['flush_full', 'blind_guardian', 'trips_master', 'first_blood'],
    handsPlayed: 14,
    handsWon: 6,
    points: 1420,
    currentWinStreak: 1,
    maxWinStreak: 2,
    bestHandCategory: 5,
  },
  林澈: {
    name: '林澈',
    avatar: 'owl',
    achievements: ['bluff_king', 'preflop_bandit', 'split_peace', 'first_blood'],
    handsPlayed: 12,
    handsWon: 5,
    points: 1310,
    currentWinStreak: 1,
    maxWinStreak: 2,
    bestHandCategory: 4,
  },
  周屿: {
    name: '周屿',
    avatar: 'fox',
    achievements: ['seven_two_legend', 'allin_winner', 'streak_3', 'first_blood'],
    handsPlayed: 19,
    handsWon: 10,
    points: 1580,
    currentWinStreak: 2,
    maxWinStreak: 3,
    bestHandCategory: 6,
  },
  苏砚: {
    name: '苏砚',
    avatar: 'crown',
    achievements: ['mega_pot', 'aces_cracked', 'trips_master', 'first_blood'],
    handsPlayed: 15,
    handsWon: 7,
    points: 1460,
    currentWinStreak: 0,
    maxWinStreak: 2,
    bestHandCategory: 5,
  },
  陆沉: {
    name: '陆沉',
    avatar: 'lion',
    achievements: ['pocket_rockets', 'chip_doubler', 'allin_winner', 'first_blood'],
    handsPlayed: 24,
    handsWon: 14,
    points: 1840,
    currentWinStreak: 3,
    maxWinStreak: 4,
    bestHandCategory: 7,
  },
  沈舟: {
    name: '沈舟',
    avatar: 'phoenix',
    achievements: ['royal_legend', 'high_card_hero', 'iron_regular', 'mega_pot', 'first_blood'],
    handsPlayed: 32,
    handsWon: 19,
    points: 2180,
    currentWinStreak: 2,
    maxWinStreak: 5,
    bestHandCategory: 8,
  },
  顾言: {
    name: '顾言',
    avatar: 'spade',
    achievements: ['tuition_paid', 'first_blood'],
    handsPlayed: 6,
    handsWon: 2,
    points: 1090,
    currentWinStreak: 0,
    maxWinStreak: 1,
    bestHandCategory: 2,
  },
  许嘉: {
    name: '许嘉',
    avatar: 'owl',
    achievements: ['bad_beat_survivor', 'bluff_king', 'trips_master', 'first_blood'],
    handsPlayed: 16,
    handsWon: 8,
    points: 1490,
    currentWinStreak: 1,
    maxWinStreak: 2,
    bestHandCategory: 4,
  },
};

export function getBotClubPreset(botName: string): BotClubPreset | null {
  return BOT_CLUB_PRESETS[botName.trim()] ?? null;
}

export function buildBotInitialStats(preset: BotClubPreset): {
  stats: PlayerAchievementStats;
  achievements: AchievementId[];
  achievementDates: AchievementDatesMap;
  level: number;
} {
  const now = Date.now();
  const achievements = sortAchievementsByPrestige(sanitizeAchievementIds(preset.achievements));
  const achievementDates: AchievementDatesMap = {};
  achievements.forEach((id, idx) => {
    achievementDates[id] = now - (achievements.length - idx) * 86_400_000;
  });
  const stats: PlayerAchievementStats = {
    ...createEmptyAchievementStats(),
    handsPlayed: preset.handsPlayed,
    handsWon: preset.handsWon,
    currentWinStreak: preset.currentWinStreak,
    maxWinStreak: preset.maxWinStreak,
    bestHandCategory: preset.bestHandCategory,
    netChips: Math.max(0, preset.points - 1000),
  };
  const levelInfo = computePlayerLevel({
    achievements,
    handsPlayed: preset.handsPlayed,
    handsWon: preset.handsWon,
    points: preset.points,
  });
  return {
    stats,
    achievements,
    achievementDates,
    level: levelInfo.level,
  };
}

export function computePlayerLevel(input: {
  achievements?: AchievementId[];
  handsPlayed?: number;
  handsWon?: number;
  points?: number;
  explicitLevel?: number;
}): PlayerLevelInfo {
  const achievements = sanitizeAchievementIds(input.achievements);
  let achXp = 0;
  let hasObsidian = false;
  for (const id of achievements) {
    const def = ACHIEVEMENT_MAP.get(id);
    if (!def) continue;
    achXp += ACHIEVEMENT_TIER_XP[def.tier];
    if (def.tier === 'obsidian') {
      hasObsidian = true;
    }
  }

  const handsPlayed = Math.max(0, Math.floor(input.handsPlayed ?? 0));
  const handsWon = Math.max(0, Math.floor(input.handsWon ?? 0));
  const pointsBonus = Math.max(0, Math.floor(((input.points ?? 1000) - 1000) * 0.35));
  const xp = achXp + handsWon * 35 + handsPlayed * 8 + pointsBonus;

  let matched = LEVEL_THRESHOLDS[0];
  for (const step of LEVEL_THRESHOLDS) {
    if (xp >= step.minXp) {
      matched = step;
    }
  }

  let level = matched.level;
  if (xp > 3000) {
    level = Math.min(30, 12 + Math.floor((xp - 3000) / 450));
  }

  if (
    typeof input.explicitLevel === 'number' &&
    Number.isFinite(input.explicitLevel) &&
    input.explicitLevel > level
  ) {
    level = Math.min(30, Math.max(1, Math.floor(input.explicitLevel)));
  }

  let tier: AchievementTier = matched.tier;
  let title = matched.title;
  if (level >= 10 || hasObsidian) {
    tier = 'obsidian';
    if (level >= 12) title = '传奇牌圣';
    else if (level >= 10) title = '黑金宗师';
  } else if (level >= 6) {
    tier = 'gold';
    if (level >= 9) title = '金丝绒元老';
    else if (level >= 8) title = '高额常客';
    else if (level >= 7) title = '桌霸大师';
    else title = '底池掌控者';
  } else if (level >= 3) {
    tier = 'silver';
    if (level >= 5) title = '精算猎手';
    else if (level >= 4) title = '读牌熟手';
    else title = '俱乐部会员';
  } else {
    tier = 'bronze';
    title = level >= 2 ? '常驻牌客' : '新秀牌手';
  }

  return { level, title, tier, xp };
}

export function computeLeaderboardRankTier(params: {
  leaderboardRank: number | null;
  points: number;
  level: number;
  achievements?: AchievementId[];
}): { rankTier: RankTier; rankTierLabel: string } {
  const hasObsidian = (params.achievements ?? []).some(
    (id) => ACHIEVEMENT_MAP.get(id)?.tier === 'obsidian'
  );
  if (
    hasObsidian ||
    (params.leaderboardRank === 1 && params.points >= 1600) ||
    params.points >= 1800 ||
    params.level >= 10
  ) {
    return { rankTier: 'diamond', rankTierLabel: RANK_TIER_LABELS.diamond };
  }
  if (
    (params.leaderboardRank !== null && params.leaderboardRank <= 3 && params.points >= 1300) ||
    params.points >= 1400 ||
    params.level >= 6
  ) {
    return { rankTier: 'gold', rankTierLabel: RANK_TIER_LABELS.gold };
  }
  if (params.points >= 1150 || params.level >= 3) {
    return { rankTier: 'silver', rankTierLabel: RANK_TIER_LABELS.silver };
  }
  return { rankTier: 'bronze', rankTierLabel: RANK_TIER_LABELS.bronze };
}

export function resolvePlayerAvatarProfile(
  player: Pick<
    ClientPlayerView,
    | 'name'
    | 'avatar'
    | 'achievements'
    | 'achievementDates'
    | 'equippedAchievement'
    | 'winStreak'
    | 'level'
    | 'isBot'
  >,
  leaderboard: LeaderboardEntry[],
  fallback?: {
    avatar?: string;
    achievements?: AchievementId[];
    achievementDates?: AchievementDatesMap;
    equippedAchievement?: EquippedAchievementPref;
  }
): ResolvedPlayerAvatarProfile {
  const cleanName = player.name.trim();
  const rankedList = [...leaderboard].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.handsWon !== a.handsWon) return b.handsWon - a.handsWon;
    return b.updatedAt - a.updatedAt;
  });
  const lbIndex = rankedList.findIndex((entry) => entry.playerName.trim() === cleanName);
  const lbEntry = lbIndex >= 0 ? rankedList[lbIndex] : null;
  const leaderboardRank = lbIndex >= 0 ? lbIndex + 1 : null;

  const mergedAchievements = sortAchievementsByPrestige(
    sanitizeAchievementIds([
      ...(player.achievements ?? []),
      ...(lbEntry?.achievements ?? []),
      ...(fallback?.achievements ?? []),
    ])
  );

  const mergedDates: AchievementDatesMap = {
    ...sanitizeAchievementDates(fallback?.achievementDates),
    ...sanitizeAchievementDates(lbEntry?.achievementDates),
    ...sanitizeAchievementDates(player.achievementDates),
  };

  // Prefer explicit non-default avatar from backend table state, then synced leaderboard, then fallback
  const playerAvatar = sanitizeAvatar(player.avatar);
  const lbAvatar = lbEntry?.avatar ? sanitizeAvatar(lbEntry.avatar) : 'default';
  const fallbackAvatar = fallback?.avatar ? sanitizeAvatar(fallback.avatar) : 'default';
  const avatar =
    playerAvatar !== 'default'
      ? playerAvatar
      : lbAvatar !== 'default'
        ? lbAvatar
        : fallbackAvatar;

  const winStreak = Math.max(
    player.winStreak ?? 0,
    lbEntry?.currentWinStreak ?? 0
  );

  const botPreset = player.isBot ? getBotClubPreset(cleanName) : null;
  const handsPlayed = Math.max(
    lbEntry?.handsPlayed ?? 0,
    botPreset?.handsPlayed ?? 0
  );
  const handsWon = Math.max(
    lbEntry?.handsWon ?? 0,
    botPreset?.handsWon ?? 0
  );
  const points = lbEntry?.points ?? botPreset?.points ?? 1000;

  const levelInfo = computePlayerLevel({
    achievements: mergedAchievements,
    handsPlayed,
    handsWon,
    points,
    explicitLevel: Math.max(player.level ?? 0, lbEntry?.level ?? 0) || undefined,
  });

  const { rankTier, rankTierLabel } = computeLeaderboardRankTier({
    leaderboardRank,
    points,
    level: levelInfo.level,
    achievements: mergedAchievements,
  });

  const preferredEquipped =
    sanitizeEquippedAchievement(player.equippedAchievement) ??
    sanitizeEquippedAchievement(fallback?.equippedAchievement) ??
    sanitizeEquippedAchievement(lbEntry?.equippedAchievement);
  const equippedAchievement = resolveEquippedAchievement(preferredEquipped, mergedAchievements);

  return {
    avatar,
    achievements: mergedAchievements,
    achievementDates: mergedDates,
    equippedAchievement,
    winStreak,
    levelInfo,
    rankTier,
    rankTierLabel,
    leaderboardRank,
    points,
    handsPlayed,
    handsWon,
  };
}
