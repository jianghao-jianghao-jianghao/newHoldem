import type { HandReplayRecord } from '../src/shared/types';
import type { HoldemDatabase } from './db';

/**
 * Resolves the completed hand record matching `handNumber` regardless of whether
 * `handHistory` is ordered oldest-first (push) or newest-first (unshift).
 *
 * Directly prevents the Issue #2 regression where reading `handHistory[0]`
 * skipped saving hand #2+ because `pokerEngine` appends new hands via `.push()`.
 */
export function resolveCompletedHandRecord(
  handHistory: readonly HandReplayRecord[],
  handNumber: number
): HandReplayRecord | null {
  if (!Array.isArray(handHistory) || handHistory.length === 0) return null;
  for (let i = handHistory.length - 1; i >= 0; i--) {
    const rec = handHistory[i];
    if (rec && rec.handNumber === handNumber) {
      return rec;
    }
  }
  return null;
}

/**
 * Persists the completed hand matching `handNumber` into SQLite `hand_history`
 * and returns the persisted record (or null if not found).
 */
export function persistCompletedHandRecord(
  db: HoldemDatabase,
  roomId: string,
  handHistory: readonly HandReplayRecord[],
  handNumber: number,
  maxPerRoom = 100
): HandReplayRecord | null {
  const matched = resolveCompletedHandRecord(handHistory, handNumber);
  if (!matched) return null;
  db.recordHandHistory(roomId, matched, maxPerRoom);
  return matched;
}
