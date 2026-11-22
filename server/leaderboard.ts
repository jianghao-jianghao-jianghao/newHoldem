import fs from 'fs';
import path from 'path';
import {
  applyHandToAchievementStats,
  createEmptyAchievementStats,
  mergeAchievementDates,
  type AchievementDatesMap,
  type AchievementId,
  type PlayerAchievementStats,
} from '../src/shared/achievements';
import { sanitizeAvatar } from '../src/shared/avatarUtils';
import { computePlayerLevel } from '../src/shared/playerProfile';
import type { Card, HandCategory, LeaderboardEntry } from '../src/shared/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

const SEED_ENTRIES: LeaderboardEntry[] = [
  {
    playerName: '林深',
    avatar: 'crown',
    level: 7,
    points: 1680,
    netChips: 680,
    handsPlayed: 18,
    handsWon: 9,
    bestHandName: '葫芦',
    bestHandScore: 6 * Math.pow(15, 5),
    updatedAt: Date.now() - 3600_000,
    achievements: ['streak_3', 'flush_full', 'allin_winner', 'first_blood'],
    achievementDates: {
      first_blood: Date.now() - 86400_000 * 5,
      allin_winner: Date.now() - 86400_000 * 3,
      flush_full: Date.now() - 86400_000 * 2,
      streak_3: Date.now() - 3600_000 * 4,
    },
    currentWinStreak: 2,
    maxWinStreak: 3,
    stats: {
      handsPlayed: 18,
      handsWon: 9,
      currentWinStreak: 2,
      maxWinStreak: 3,
      allInWins: 1,
      maxAllInPotWon: 640,
      maxPotWon: 720,
      foldWins: 2,
      bestHandCategory: 6,
      doubledChips: false,
      netChips: 680,
    },
  },
  {
    playerName: '陈默',
    avatar: 'spade',
    level: 5,
    points: 1420,
    netChips: 420,
    handsPlayed: 14,
    handsWon: 6,
    bestHandName: '同花',
    bestHandScore: 5 * Math.pow(15, 5),
    updatedAt: Date.now() - 7200_000,
    achievements: ['flush_full', 'trips_master', 'first_blood'],
    achievementDates: {
      first_blood: Date.now() - 86400_000 * 6,
      trips_master: Date.now() - 86400_000 * 4,
      flush_full: Date.now() - 86400_000 * 1,
    },
    currentWinStreak: 1,
    maxWinStreak: 2,
    stats: {
      handsPlayed: 14,
      handsWon: 6,
      currentWinStreak: 1,
      maxWinStreak: 2,
      allInWins: 0,
      maxAllInPotWon: 0,
      maxPotWon: 520,
      foldWins: 1,
      bestHandCategory: 5,
      doubledChips: false,
      netChips: 420,
    },
  },
  {
    playerName: '苏晚',
    avatar: 'phoenix',
    level: 4,
    points: 1240,
    netChips: 240,
    handsPlayed: 11,
    handsWon: 5,
    bestHandName: '顺子',
    bestHandScore: 4 * Math.pow(15, 5),
    updatedAt: Date.now() - 10800_000,
    achievements: ['flush_full', 'first_blood'],
    achievementDates: {
      first_blood: Date.now() - 86400_000 * 4,
      flush_full: Date.now() - 86400_000 * 2,
    },
    currentWinStreak: 0,
    maxWinStreak: 2,
    stats: {
      handsPlayed: 11,
      handsWon: 5,
      currentWinStreak: 0,
      maxWinStreak: 2,
      allInWins: 0,
      maxAllInPotWon: 0,
      maxPotWon: 380,
      foldWins: 1,
      bestHandCategory: 4,
      doubledChips: false,
      netChips: 240,
    },
  },
  {
    playerName: '顾北',
    avatar: 'owl',
    level: 3,
    points: 1090,
    netChips: 90,
    handsPlayed: 9,
    handsWon: 3,
    bestHandName: '三条',
    bestHandScore: 3 * Math.pow(15, 5),
    updatedAt: Date.now() - 14400_000,
    achievements: ['trips_master', 'first_blood'],
    achievementDates: {
      first_blood: Date.now() - 86400_000 * 3,
      trips_master: Date.now() - 86400_000 * 1,
    },
    currentWinStreak: 1,
    maxWinStreak: 1,
    stats: {
      handsPlayed: 9,
      handsWon: 3,
      currentWinStreak: 1,
      maxWinStreak: 1,
      allInWins: 0,
      maxAllInPotWon: 0,
      maxPotWon: 240,
      foldWins: 0,
      bestHandCategory: 3,
      doubledChips: false,
      netChips: 90,
    },
  },
];

export class LeaderboardStore {
  private entries = new Map<string, LeaderboardEntry>();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(LEADERBOARD_FILE)) {
        const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as LeaderboardEntry[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const seedMap = new Map(SEED_ENTRIES.map((s) => [s.playerName, s]));
          for (const item of parsed) {
            const seed = seedMap.get(item.playerName);
            const ach = item.achievements ?? seed?.achievements ?? [];
            const level = computePlayerLevel({
              achievements: ach,
              handsPlayed: item.handsPlayed,
              handsWon: item.handsWon,
              points: item.points,
              explicitLevel: item.level ?? seed?.level,
            }).level;
            this.entries.set(item.playerName, {
              ...item,
              avatar: item.avatar ?? seed?.avatar,
              level,
              achievements: ach,
              achievementDates: item.achievementDates ?? seed?.achievementDates ?? {},
              currentWinStreak: item.currentWinStreak ?? seed?.currentWinStreak ?? 0,
              maxWinStreak: item.maxWinStreak ?? seed?.maxWinStreak ?? 0,
              stats: item.stats ?? seed?.stats,
            });
          }
          return;
        }
      }
    } catch {
      // Fallback to seed entries if file is unreadable
    }

    for (const seed of SEED_ENTRIES) {
      this.entries.set(seed.playerName, { ...seed });
    }
    this.save();
  }

  private save(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(
        LEADERBOARD_FILE,
        JSON.stringify(this.getRankedList(100), null, 2),
        'utf-8'
      );
    } catch {
      // Ignore disk write issues in read-only environments
    }
  }

  public syncPlayerAvatar(playerName: string, avatar?: string): boolean {
    const cleanName = playerName.trim();
    if (!cleanName || !avatar) return false;
    const cleanAvatar = sanitizeAvatar(avatar);
    if (cleanAvatar === 'default') return false;
    const existing = this.entries.get(cleanName);
    if (!existing) return false;
    if (existing.avatar === cleanAvatar) return false;
    existing.avatar = cleanAvatar;
    this.entries.set(cleanName, existing);
    this.save();
    return true;
  }

  public getPlayerProfile(playerName: string): {
    avatar?: string;
    level: number;
    points: number;
    handsPlayed: number;
    handsWon: number;
    achievements: AchievementId[];
    achievementDates: AchievementDatesMap;
    currentWinStreak: number;
    stats: PlayerAchievementStats;
  } {
    const cleanName = playerName.trim();
    const existing = this.entries.get(cleanName);
    if (!existing) {
      return {
        level: 1,
        points: 1000,
        handsPlayed: 0,
        handsWon: 0,
        achievements: [],
        achievementDates: {},
        currentWinStreak: 0,
        stats: createEmptyAchievementStats(),
      };
    }
    const achievements = existing.achievements ?? [];
    const level = computePlayerLevel({
      achievements,
      handsPlayed: existing.handsPlayed,
      handsWon: existing.handsWon,
      points: existing.points,
      explicitLevel: existing.level,
    }).level;
    return {
      avatar: existing.avatar,
      level,
      points: existing.points,
      handsPlayed: existing.handsPlayed,
      handsWon: existing.handsWon,
      achievements,
      achievementDates: existing.achievementDates ?? {},
      currentWinStreak: existing.currentWinStreak ?? existing.stats?.currentWinStreak ?? 0,
      stats: existing.stats ?? {
        ...createEmptyAchievementStats(),
        handsPlayed: existing.handsPlayed,
        handsWon: existing.handsWon,
        currentWinStreak: existing.currentWinStreak ?? 0,
        maxWinStreak: existing.maxWinStreak ?? 0,
        netChips: existing.netChips,
      },
    };
  }

  public recordHandOutcome(params: {
    playerName: string;
    avatar?: string;
    netChips: number;
    won: boolean;
    potWon?: number;
    wasAllIn?: boolean;
    wonByFold?: boolean;
    handName?: string;
    handScore?: number;
    handCategory?: HandCategory;
    currentChips?: number;
    startingChips?: number;
    bigBlind?: number;
    holeCards?: Card[];
    communityCardsCount?: number;
    wasSplitPot?: boolean;
    isBigBlind?: boolean;
    startingHandChips?: number;
    reachedShowdown?: boolean;
  }): { entry: LeaderboardEntry; newlyUnlocked: AchievementId[] } {
    const cleanName = params.playerName.trim();
    if (!cleanName) {
      return {
        entry: {
          playerName: '',
          points: 1000,
          netChips: 0,
          handsPlayed: 0,
          handsWon: 0,
          bestHandName: '高牌',
          bestHandScore: 0,
          updatedAt: Date.now(),
          achievements: [],
          currentWinStreak: 0,
          maxWinStreak: 0,
        },
        newlyUnlocked: [],
      };
    }

    const existing = this.entries.get(cleanName) ?? {
      playerName: cleanName,
      points: 1000,
      netChips: 0,
      handsPlayed: 0,
      handsWon: 0,
      bestHandName: '高牌',
      bestHandScore: 0,
      updatedAt: Date.now(),
      achievements: [],
      currentWinStreak: 0,
      maxWinStreak: 0,
    };

    const baseStats: PlayerAchievementStats = existing.stats ?? {
      ...createEmptyAchievementStats(),
      handsPlayed: existing.handsPlayed,
      handsWon: existing.handsWon,
      currentWinStreak: existing.currentWinStreak ?? 0,
      maxWinStreak: existing.maxWinStreak ?? 0,
      netChips: existing.netChips,
    };

    const achResult = applyHandToAchievementStats(baseStats, existing.achievements, {
      won: params.won,
      potWon: params.potWon ?? 0,
      netChips: params.netChips,
      wasAllIn: Boolean(params.wasAllIn),
      wonByFold: Boolean(params.wonByFold),
      handCategory: params.handCategory ?? null,
      currentChips: params.currentChips ?? 0,
      startingChips: params.startingChips ?? 2000,
      bigBlind: params.bigBlind ?? 20,
      holeCards: params.holeCards,
      communityCardsCount: params.communityCardsCount,
      wasSplitPot: params.wasSplitPot,
      isBigBlind: params.isBigBlind,
      startingHandChips: params.startingHandChips,
      reachedShowdown: params.reachedShowdown,
    });

    existing.handsPlayed += 1;
    if (params.won) {
      existing.handsWon += 1;
    }
    existing.netChips += params.netChips;
    existing.points = Math.max(0, 1000 + existing.netChips + existing.handsWon * 20);
    if (
      params.handName &&
      typeof params.handScore === 'number' &&
      params.handScore > existing.bestHandScore
    ) {
      existing.bestHandName = params.handName;
      existing.bestHandScore = params.handScore;
    }
    const nowMs = Date.now();
    existing.stats = achResult.nextStats;
    existing.achievements = achResult.unlocked;
    existing.achievementDates = mergeAchievementDates(
      existing.achievementDates,
      achResult.unlocked,
      achResult.newlyUnlocked,
      nowMs
    );
    const cleanAvatar = params.avatar ? sanitizeAvatar(params.avatar) : undefined;
    if (cleanAvatar && cleanAvatar !== 'default') {
      existing.avatar = cleanAvatar;
    }
    existing.currentWinStreak = achResult.nextStats.currentWinStreak;
    existing.maxWinStreak = achResult.nextStats.maxWinStreak;
    existing.level = computePlayerLevel({
      achievements: existing.achievements,
      handsPlayed: existing.handsPlayed,
      handsWon: existing.handsWon,
      points: existing.points,
      explicitLevel: existing.level,
    }).level;
    existing.updatedAt = nowMs;

    this.entries.set(cleanName, existing);
    this.save();

    return {
      entry: existing,
      newlyUnlocked: achResult.newlyUnlocked,
    };
  }

  public getRankedList(limit: number = 30): LeaderboardEntry[] {
    return Array.from(this.entries.values())
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.handsWon !== a.handsWon) return b.handsWon - a.handsWon;
        return b.updatedAt - a.updatedAt;
      })
      .slice(0, limit);
  }
}
