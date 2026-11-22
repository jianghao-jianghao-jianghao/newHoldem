import fs from 'fs';
import path from 'path';
import {
  applyHandToAchievementStats,
  createEmptyAchievementStats,
  mergeAchievementDates,
  sanitizeAchievementDates,
  sanitizeAchievementIds,
  type AchievementDatesMap,
  type AchievementId,
  type PlayerAchievementStats,
} from '../src/shared/achievements';
import type { HandCategory, LeaderboardEntry } from '../src/shared/types';
import { getSharedDatabase, resolveDataDir, type HoldemDatabase } from './db';

function getLegacyLeaderboardFile(): string {
  return path.join(resolveDataDir(), 'leaderboard.json');
}

export type LeaderboardMode = 'all' | 'ranked' | 'practice';

interface StoredLeaderboardEntry extends LeaderboardEntry {
  entryKey: string;
  uid?: string | null;
  isVerified?: boolean;
  mode: LeaderboardMode;
}

const SEED_ENTRIES: LeaderboardEntry[] = [
  {
    playerName: '林深',
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
    playerName: '陆行舟',
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

export function computeNormalizedPointsDelta(params: {
  netChips: number;
  bigBlind: number;
  won: boolean;
  isPracticeWithBots: boolean;
}): number {
  const bb = Math.max(1, params.bigBlind);
  const netBB = params.netChips / bb;
  const clampedBB = Math.max(-100, Math.min(100, netBB));
  const modeWeight = params.isPracticeWithBots ? 0.35 : 1.0;
  const winBonus = params.won ? (params.isPracticeWithBots ? 8 : 20) : 0;
  return Math.round(clampedBB * 10 * modeWeight + winBonus);
}

export interface LeaderboardStoreOptions {
  database?: HoldemDatabase;
  legacyJsonFile?: string;
  disableDiskPersistence?: boolean;
}

export class LeaderboardStore {
  private entries = new Map<string, StoredLeaderboardEntry>();
  private readonly holdemDb: HoldemDatabase | null;
  private readonly legacyJsonFile: string;

  constructor(options: LeaderboardStoreOptions = {}) {
    this.legacyJsonFile = options.legacyJsonFile ?? getLegacyLeaderboardFile();
    this.holdemDb = options.disableDiskPersistence
      ? null
      : (options.database ?? getSharedDatabase());
    this.load();
  }

  private toPublic(entry: StoredLeaderboardEntry): LeaderboardEntry {
    return {
      playerName: entry.playerName,
      points: entry.points,
      netChips: entry.netChips,
      handsPlayed: entry.handsPlayed,
      handsWon: entry.handsWon,
      bestHandName: entry.bestHandName,
      bestHandScore: entry.bestHandScore,
      updatedAt: entry.updatedAt,
      achievements: entry.achievements,
      achievementDates: entry.achievementDates,
      currentWinStreak: entry.currentWinStreak,
      maxWinStreak: entry.maxWinStreak,
      stats: entry.stats,
    };
  }

  private load(): void {
    if (this.holdemDb) {
      try {
        const rows = this.holdemDb.db
          .prepare('SELECT * FROM leaderboard_entries')
          .all() as Array<Record<string, unknown>>;
        if (rows.length > 0) {
          for (const row of rows) {
            const entryKey = String(row.entry_key ?? '');
            const playerName = String(row.player_name ?? '');
            if (!entryKey || !playerName) continue;

            let ach: AchievementId[] = [];
            let dates: AchievementDatesMap = {};
            let stats: PlayerAchievementStats | undefined;
            try {
              ach = sanitizeAchievementIds(JSON.parse(String(row.achievements_json ?? '[]')));
            } catch {
              ach = [];
            }
            try {
              dates = sanitizeAchievementDates(
                JSON.parse(String(row.achievement_dates_json ?? '{}'))
              );
            } catch {
              dates = {};
            }
            try {
              if (row.stats_json) {
                stats = JSON.parse(String(row.stats_json)) as PlayerAchievementStats;
              }
            } catch {
              stats = undefined;
            }

            this.entries.set(entryKey, {
              entryKey,
              uid: row.uid ? String(row.uid) : null,
              isVerified: Number(row.is_verified) === 1,
              mode:
                row.mode === 'ranked' || row.mode === 'practice'
                  ? row.mode
                  : 'all',
              playerName,
              points: Number(row.points) || 1000,
              netChips: Number(row.net_chips) || 0,
              handsPlayed: Number(row.hands_played) || 0,
              handsWon: Number(row.hands_won) || 0,
              bestHandName: String(row.best_hand_name ?? '高牌'),
              bestHandScore: Number(row.best_hand_score) || 0,
              updatedAt: Number(row.updated_at) || Date.now(),
              achievements: ach,
              achievementDates: dates,
              currentWinStreak: Number(row.current_win_streak) || 0,
              maxWinStreak: Number(row.max_win_streak) || 0,
              stats,
            });
          }
          return;
        }
      } catch (err) {
        console.error('[LeaderboardStore] Failed to load from SQLite:', err);
      }

      if (this.migrateLegacyJsonIfPresent()) {
        return;
      }
    }

    for (const seed of SEED_ENTRIES) {
      const stored: StoredLeaderboardEntry = {
        ...seed,
        entryKey: `name:${seed.playerName}`,
        uid: null,
        isVerified: false,
        mode: 'ranked',
      };
      this.entries.set(stored.entryKey, stored);
      this.persistEntry(stored);
    }
  }

  private migrateLegacyJsonIfPresent(): boolean {
    try {
      if (!fs.existsSync(this.legacyJsonFile)) return false;
      const raw = fs.readFileSync(this.legacyJsonFile, 'utf-8');
      const parsed = JSON.parse(raw) as LeaderboardEntry[];
      if (!Array.isArray(parsed) || parsed.length === 0) return false;

      const migrate = () => {
        for (const item of parsed) {
          if (!item || typeof item.playerName !== 'string' || !item.playerName.trim()) continue;
          const cleanName = item.playerName.trim();
          const stored: StoredLeaderboardEntry = {
            ...item,
            playerName: cleanName,
            entryKey: `name:${cleanName}`,
            uid: null,
            isVerified: false,
            mode: 'all',
            achievements: sanitizeAchievementIds(item.achievements),
            achievementDates: sanitizeAchievementDates(item.achievementDates),
            currentWinStreak: item.currentWinStreak ?? 0,
            maxWinStreak: item.maxWinStreak ?? 0,
          };
          this.entries.set(stored.entryKey, stored);
          this.persistEntry(stored);
        }
      };

      if (this.holdemDb) {
        this.holdemDb.runInTransaction(migrate);
      } else {
        migrate();
      }
      return this.entries.size > 0;
    } catch {
      return false;
    }
  }

  private persistEntry(entry: StoredLeaderboardEntry): void {
    if (!this.holdemDb) return;
    try {
      this.holdemDb.db
        .prepare(
          `INSERT INTO leaderboard_entries (
            entry_key, uid, player_name, is_verified, mode,
            points, net_chips, hands_played, hands_won,
            best_hand_name, best_hand_score,
            achievements_json, achievement_dates_json,
            current_win_streak, max_win_streak, stats_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(entry_key) DO UPDATE SET
            uid = excluded.uid,
            player_name = excluded.player_name,
            is_verified = excluded.is_verified,
            mode = excluded.mode,
            points = excluded.points,
            net_chips = excluded.net_chips,
            hands_played = excluded.hands_played,
            hands_won = excluded.hands_won,
            best_hand_name = excluded.best_hand_name,
            best_hand_score = excluded.best_hand_score,
            achievements_json = excluded.achievements_json,
            achievement_dates_json = excluded.achievement_dates_json,
            current_win_streak = excluded.current_win_streak,
            max_win_streak = excluded.max_win_streak,
            stats_json = excluded.stats_json,
            updated_at = excluded.updated_at`
        )
        .run(
          entry.entryKey,
          entry.uid ?? null,
          entry.playerName,
          entry.isVerified ? 1 : 0,
          entry.mode,
          entry.points,
          entry.netChips,
          entry.handsPlayed,
          entry.handsWon,
          entry.bestHandName,
          entry.bestHandScore,
          JSON.stringify(entry.achievements ?? []),
          JSON.stringify(entry.achievementDates ?? {}),
          entry.currentWinStreak ?? 0,
          entry.maxWinStreak ?? 0,
          entry.stats ? JSON.stringify(entry.stats) : null,
          entry.updatedAt
        );
    } catch (err) {
      console.error('[LeaderboardStore] Failed to persist entry:', err);
    }
  }

  public runBatch<T>(fn: () => T): T {
    if (this.holdemDb) {
      return this.holdemDb.runInTransaction(fn);
    }
    return fn();
  }

  private resolveEntryKey(playerName: string, uid?: string | null): string {
    if (uid && uid.trim()) return `uid:${uid.trim()}`;
    return `name:${playerName.trim()}`;
  }

  public getPlayerProfile(
    playerName: string,
    uid?: string | null
  ): {
    achievements: AchievementId[];
    achievementDates: AchievementDatesMap;
    currentWinStreak: number;
    stats: PlayerAchievementStats;
  } {
    const key = this.resolveEntryKey(playerName, uid);
    const existing = this.entries.get(key) ?? this.entries.get(`name:${playerName.trim()}`);
    if (!existing) {
      return {
        achievements: [],
        achievementDates: {},
        currentWinStreak: 0,
        stats: createEmptyAchievementStats(),
      };
    }
    return {
      achievements: existing.achievements ?? [],
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
    uid?: string | null;
    isPracticeWithBots?: boolean;
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
  }): { entry: LeaderboardEntry; newlyUnlocked: AchievementId[]; pointsDelta: number } {
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
        pointsDelta: 0,
      };
    }

    const cleanUid = params.uid?.trim() || null;
    const entryKey = this.resolveEntryKey(cleanName, cleanUid);
    const isPractice = Boolean(params.isPracticeWithBots);

    const existing: StoredLeaderboardEntry = this.entries.get(entryKey) ?? {
      entryKey,
      uid: cleanUid,
      isVerified: Boolean(cleanUid),
      mode: isPractice ? 'practice' : 'ranked',
      playerName: cleanName,
      points: 1000,
      netChips: 0,
      handsPlayed: 0,
      handsWon: 0,
      bestHandName: '高牌',
      bestHandScore: 0,
      updatedAt: Date.now(),
      achievements: [],
      achievementDates: {},
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
    });

    const pointsDelta = computeNormalizedPointsDelta({
      netChips: params.netChips,
      bigBlind: params.bigBlind ?? 20,
      won: params.won,
      isPracticeWithBots: isPractice,
    });

    existing.playerName = cleanName;
    if (cleanUid) {
      existing.uid = cleanUid;
      existing.isVerified = true;
    }
    if (!isPractice) {
      existing.mode = 'ranked';
    }
    existing.handsPlayed += 1;
    if (params.won) {
      existing.handsWon += 1;
    }
    existing.netChips += Math.trunc(params.netChips);
    existing.points = Math.max(0, existing.points + pointsDelta);

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
    existing.currentWinStreak = achResult.nextStats.currentWinStreak;
    existing.maxWinStreak = achResult.nextStats.maxWinStreak;
    existing.updatedAt = nowMs;

    this.entries.set(entryKey, existing);
    this.persistEntry(existing);

    return {
      entry: this.toPublic(existing),
      newlyUnlocked: achResult.newlyUnlocked,
      pointsDelta,
    };
  }

  public getRankedList(limit: number = 30, mode: LeaderboardMode = 'all'): LeaderboardEntry[] {
    return Array.from(this.entries.values())
      .filter((entry) => {
        if (mode === 'all') return true;
        if (mode === 'ranked') return entry.mode === 'ranked' || entry.mode === 'all';
        return entry.mode === 'practice';
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.handsWon !== a.handsWon) return b.handsWon - a.handsWon;
        return b.updatedAt - a.updatedAt;
      })
      .slice(0, limit)
      .map((e) => this.toPublic(e));
  }
}
