import crypto from 'crypto';

export interface RoomDeleteAuthSubject {
  isDefault: boolean;
  roomId: string;
  hostId: string | null;
  hasAnyHumanPlayer: boolean;
  creatorId: string | null;
  creatorSecret: string | null;
  seatSecrets: ReadonlyMap<string, string>;
}

export interface RoomDeleteAuthResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * Constant-time secret string comparison to prevent timing side-channels.
 */
export function secretsMatch(expected: string | null | undefined, provided: string | null | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verifies whether a requester is authorized to delete a room.
 * - Default CLUB01 room can never be deleted.
 * - When any human player is seated in the room (including during a transient disconnect grace period),
 *   only the room host may delete it; HTTP requests MUST also present the matching X-Seat-Secret.
 * - When a custom room is empty but bound to a creator secret, only that creator with the matching
 *   X-Player-Id + X-Seat-Secret may delete it.
 */
export function authorizeRoomDeletion(
  subject: RoomDeleteAuthSubject,
  requesterPlayerId: string | null | undefined,
  requesterSeatSecret: string | null | undefined,
  requireSecretCheck = true
): RoomDeleteAuthResult {
  if (subject.isDefault || subject.roomId === 'CLUB01') {
    return { ok: false, status: 403, error: '默认俱乐部大厅桌不可删除' };
  }

  const cleanRequesterId = requesterPlayerId?.trim() || null;
  const cleanRequesterSecret = requesterSeatSecret?.trim() || null;

  if (subject.hasAnyHumanPlayer) {
    if (!subject.hostId || cleanRequesterId !== subject.hostId) {
      return { ok: false, status: 403, error: '仅房主本人可删除当前牌桌' };
    }
    if (requireSecretCheck) {
      const hostSecret = subject.seatSecrets.get(subject.hostId) ?? null;
      if (!hostSecret || !secretsMatch(hostSecret, cleanRequesterSecret)) {
        return { ok: false, status: 403, error: 'X-Seat-Secret 校验失败，仅房主本人可删除牌桌' };
      }
    }
    return { ok: true };
  }

  // Empty custom room: enforce creator ownership if creator credentials were bound on creation
  if (subject.creatorId && subject.creatorSecret) {
    if (cleanRequesterId !== subject.creatorId) {
      return { ok: false, status: 403, error: '仅房间创建者可删除该牌桌' };
    }
    if (requireSecretCheck && !secretsMatch(subject.creatorSecret, cleanRequesterSecret)) {
      return { ok: false, status: 403, error: 'X-Seat-Secret 校验失败，仅创建者可删除牌桌' };
    }
  }

  return { ok: true };
}
