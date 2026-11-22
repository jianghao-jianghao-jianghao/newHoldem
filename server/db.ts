import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import type { HandReplayRecord } from '../src/shared/types';

export function resolveDataDir(): string {
  const envDir = process.env.DATA_DIR?.trim();
  if (envDir) {
    return path.resolve(envDir);
  }
  return path.resolve(process.cwd(), 'data');
}

export interface HoldemDatabaseOptions {
  dbPath?: string;
}

/**
 * ACID SQLite persistence layer built on Node 22's native `node:sqlite` (WAL mode).
 * Stores accounts, leaderboard entries, and persistent hand history with clean WAL checkpointing on shutdown.
 */
export class HoldemDatabase {
  public readonly db: DatabaseSync;
  public readonly dbPath: string;
  private closed = false;

  constructor(options: HoldemDatabaseOptions = {}) {
    this.dbPath = options.dbPath ?? path.join(resolveDataDir(), 'velvet_holdem.sqlite');
    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(this.dbPath);
    this.initialize();
  }

  private initialize(): void {
    if (this.dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
      this.db.exec('PRAGMA busy_timeout = 5000;');
    }
    this.db.exec('PRAGMA foreign_keys = ON;');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        uid TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        avatar TEXT NOT NULL DEFAULT 'default',
        points INTEGER NOT NULL DEFAULT 1000,
        net_chips INTEGER NOT NULL DEFAULT 0,
        hands_played INTEGER NOT NULL DEFAULT 0,
        hands_won INTEGER NOT NULL DEFAULT 0,
        best_hand_name TEXT NOT NULL DEFAULT '高牌',
        best_hand_score INTEGER NOT NULL DEFAULT 0,
        achievements_json TEXT NOT NULL DEFAULT '[]',
        achievement_dates_json TEXT NOT NULL DEFAULT '{}',
        current_win_streak INTEGER NOT NULL DEFAULT 0,
        max_win_streak INTEGER NOT NULL DEFAULT 0,
        stats_json TEXT,
        bgm_enabled INTEGER NOT NULL DEFAULT 1,
        token_version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);

      CREATE TABLE IF NOT EXISTS leaderboard_entries (
        entry_key TEXT PRIMARY KEY,
        uid TEXT,
        player_name TEXT NOT NULL,
        is_verified INTEGER NOT NULL DEFAULT 0,
        mode TEXT NOT NULL DEFAULT 'all',
        points INTEGER NOT NULL DEFAULT 1000,
        net_chips INTEGER NOT NULL DEFAULT 0,
        hands_played INTEGER NOT NULL DEFAULT 0,
        hands_won INTEGER NOT NULL DEFAULT 0,
        best_hand_name TEXT NOT NULL DEFAULT '高牌',
        best_hand_score INTEGER NOT NULL DEFAULT 0,
        achievements_json TEXT NOT NULL DEFAULT '[]',
        achievement_dates_json TEXT NOT NULL DEFAULT '{}',
        current_win_streak INTEGER NOT NULL DEFAULT 0,
        max_win_streak INTEGER NOT NULL DEFAULT 0,
        stats_json TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_leaderboard_rank
        ON leaderboard_entries(mode, points DESC, hands_won DESC, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_leaderboard_name
        ON leaderboard_entries(player_name);

      CREATE TABLE IF NOT EXISTS hand_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        hand_number INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        pot INTEGER NOT NULL,
        small_blind INTEGER NOT NULL,
        big_blind INTEGER NOT NULL,
        summary_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_hand_history_room
        ON hand_history(room_id, id DESC);
    `);

    // Safe idempotent schema migrations for profile tier/avatar/equipped badge columns
    this.ensureColumn('accounts', 'equipped_achievement', 'TEXT');
    this.ensureColumn('leaderboard_entries', 'avatar', 'TEXT');
    this.ensureColumn('leaderboard_entries', 'equipped_achievement', 'TEXT');
    this.ensureColumn('leaderboard_entries', 'level', 'INTEGER NOT NULL DEFAULT 1');
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
    if (!cols.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  public ping(): boolean {
    if (this.closed) return false;
    try {
      const row = this.db.prepare('SELECT 1 AS ok').get() as { ok?: number } | undefined;
      return row?.ok === 1;
    } catch {
      return false;
    }
  }

  public recordHandHistory(roomId: string, record: HandReplayRecord, maxPerRoom: number = 100): void {
    if (this.closed) return;
    try {
      // Strip private unrevealed hole cards before persisting room-level public replay
      const sanitized: HandReplayRecord = {
        ...record,
        players: record.players.map((p) => ({
          ...p,
          holeCards: p.revealed ? p.holeCards : null,
        })),
      };
      this.db
        .prepare(
          `INSERT INTO hand_history (room_id, hand_number, timestamp, pot, small_blind, big_blind, summary_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          roomId,
          record.handNumber,
          record.timestamp,
          record.pot,
          record.smallBlind,
          record.bigBlind,
          JSON.stringify(sanitized)
        );

      // Keep storage bounded per room
      this.db
        .prepare(
          `DELETE FROM hand_history
           WHERE room_id = ?
             AND id NOT IN (
               SELECT id FROM hand_history WHERE room_id = ? ORDER BY id DESC LIMIT ?
             )`
        )
        .run(roomId, roomId, Math.max(10, maxPerRoom));
    } catch (err) {
      console.error('[HoldemDatabase] Failed to record hand history:', err);
    }
  }

  public getRoomHandHistory(roomId: string, limit: number = 20): HandReplayRecord[] {
    if (this.closed) return [];
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    try {
      const rows = this.db
        .prepare(
          'SELECT summary_json FROM hand_history WHERE room_id = ? ORDER BY id DESC LIMIT ?'
        )
        .all(roomId, safeLimit) as Array<{ summary_json?: string }>;
      const list: HandReplayRecord[] = [];
      for (const row of rows) {
        if (!row.summary_json) continue;
        try {
          list.push(JSON.parse(row.summary_json) as HandReplayRecord);
        } catch {
          // Skip malformed record
        }
      }
      return list;
    } catch {
      return [];
    }
  }

  public runInTransaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback error if connection already closed
      }
      throw err;
    }
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.dbPath !== ':memory:') {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      }
    } catch {
      // Ignore checkpoint error during forced exit
    }
    this.db.close();
  }
}

let sharedDb: HoldemDatabase | null = null;

export function getSharedDatabase(): HoldemDatabase {
  if (!sharedDb) {
    sharedDb = new HoldemDatabase();
  }
  return sharedDb;
}
