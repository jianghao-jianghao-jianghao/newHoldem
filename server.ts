import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { EmailAuthStore } from './server/authStore';
import { BOT_PERSONALITY_PROFILES, chooseBotAction } from './server/botAi';
import { getSharedDatabase } from './server/db';
import { evaluateGtoSpotWithCoach, type GtoCoachRequest } from './server/gtoCoach';
import { LeaderboardStore, type LeaderboardMode } from './server/leaderboard';
import { SlidingWindowRateLimiter } from './server/rateLimiter';
import {
  addPlayerToTable,
  advanceAllInRunoutStep,
  applyPlayerAction,
  AUTO_NEXT_HAND_DELAY_MS,
  canStartHand,
  createTableState,
  DEFAULT_BIG_BLIND,
  DEFAULT_SMALL_BLIND,
  STARTING_CHIPS,
  rebuyPlayerChips,
  removePlayerFromTable,
  revealPlayerCards,
  sanitizeTableForPlayer,
  startNewHand,
  updateTableBlindSettings,
} from './src/shared/pokerEngine';
import { evaluateBestHand } from './src/shared/handEvaluator';
import { sanitizeAvatar } from './src/shared/avatarUtils';
import {
  appendChatHistory,
  MAX_CHAT_HISTORY,
  NUDGE_PHRASES,
  sanitizeChatText,
} from './src/shared/chatUtils';
import {
  applyHandToAchievementStats,
  mergeAchievementDates,
  sanitizeAchievementDates,
  sanitizeAchievementIds,
  type AchievementDatesMap,
  type AchievementId,
  type PlayerAchievementStats,
} from './src/shared/achievements';
import type {
  ChatMessage,
  ClientWsMessage,
  HandCategory,
  PlayerNudgeEvent,
  RoomSummary,
  ServerWsMessage,
  TableState,
} from './src/shared/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const TRUST_PROXY =
  process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY?.toLowerCase() === 'true';
const RAW_CORS_ORIGIN = (process.env.CORS_ORIGIN ?? '*').trim();
const ALLOWED_CORS_ORIGINS =
  RAW_CORS_ORIGIN === '*'
    ? null
    : new Set(
        RAW_CORS_ORIGIN.split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );

const MAX_CUSTOM_ROOMS = 60;
const EMPTY_ROOM_IDLE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CREATOR_GRACE_WINDOW_MS = 60 * 1000; // 60s before empty room can be deleted by non-creator
const AFK_MAX_CONSECUTIVE_TIMEOUTS = 3;
const SERVER_STARTED_AT = Date.now();

const BOT_NAMES = [
  '陈默',
  '林澈',
  '周屿',
  '苏砚',
  '陆沉',
  '沈舟',
  '顾言',
  '许嘉',
];

interface DepartedHandContributor {
  playerId: string;
  playerName: string;
  uid: string | null;
  totalContributed: number;
  handNumber: number;
}

interface RoomContext {
  tableName: string;
  createdAt: number;
  lastActivityAt: number;
  creatorId: string | null;
  isDefault: boolean;
  state: TableState;
  chatHistory: ChatMessage[];
  seatSecrets: Map<string, string>;
  playerUids: Map<string, string>;
  departedContributors: DepartedHandContributor[];
  consecutiveTimeouts: Map<string, number>;
  botStats: Map<
    string,
    {
      stats: PlayerAchievementStats;
      achievements: AchievementId[];
      achievementDates: AchievementDatesMap;
    }
  >;
  botTimer: NodeJS.Timeout | null;
  allInTimer: NodeJS.Timeout | null;
  autoNextTimer: NodeJS.Timeout | null;
  handRecordedForHandNumber: number;
}

interface ClientSession {
  ws: WebSocket;
  isAlive: boolean;
  roomId: string | null;
  playerId: string | null;
  verifiedUid: string | null;
  lastChatAt: number;
  nudgeCooldowns: Map<string, number>;
}

const runtimeMetrics = {
  handsCompleted: 0,
  wsMessagesHandled: 0,
  rateLimitRejections: 0,
  botDecisionsCount: 0,
  botDecisionTotalMs: 0,
};

const sharedDb = getSharedDatabase();
const leaderboard = new LeaderboardStore({ database: sharedDb });
const authStore = new EmailAuthStore({ database: sharedDb });

const otpSendLimiter = new SlidingWindowRateLimiter({ maxRequests: 6, windowMs: 10 * 60 * 1000 });
const otpVerifyLimiter = new SlidingWindowRateLimiter({ maxRequests: 15, windowMs: 10 * 60 * 1000 });
const roomCreateLimiter = new SlidingWindowRateLimiter({ maxRequests: 10, windowMs: 10 * 60 * 1000 });
const gtoEvalLimiter = new SlidingWindowRateLimiter({ maxRequests: 30, windowMs: 60 * 1000 });
const wsMessageLimiter = new SlidingWindowRateLimiter({ maxRequests: 45, windowMs: 10 * 1000 });

const rooms = new Map<string, RoomContext>();
const sessions = new Map<WebSocket, ClientSession>();
const disconnectTimers = new Map<string, NodeJS.Timeout>();

function getClientIp(req: express.Request): string {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      return xff.split(',')[0].trim().slice(0, 64);
    }
  }
  return (req.socket?.remoteAddress ?? req.ip ?? 'unknown').slice(0, 64);
}

function resolveDistDir(): string {
  // Supports both `tsx server.ts` (root dir -> ./dist) and bundled `node dist/server.mjs` (__dirname === dist)
  if (fs.existsSync(path.resolve(__dirname, 'index.html'))) {
    return __dirname;
  }
  return path.resolve(process.cwd(), 'dist');
}

function normalizeRoomId(raw?: string): string {
  const cleaned = (raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  return cleaned.slice(0, 12);
}

function cryptoRng(): number {
  return crypto.randomInt(0, 0x100000000) / 0x100000000;
}

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return rooms.has(code) ? generateRoomId() : code;
}

function autoRebuyBustedBots(state: TableState): boolean {
  let rebought = false;
  for (const p of state.players) {
    if (p.isBot && p.chips < state.bigBlind) {
      if (rebuyPlayerChips(state, p.id)) {
        rebought = true;
      }
    }
  }
  return rebought;
}

function ensureDefaultClubRoom(): RoomContext {
  let ctx = rooms.get('CLUB01');
  if (!ctx) {
    const now = Date.now();
    ctx = {
      tableName: '俱乐部大厅桌',
      createdAt: now,
      lastActivityAt: now,
      creatorId: null,
      isDefault: true,
      state: createTableState('CLUB01', DEFAULT_SMALL_BLIND, DEFAULT_BIG_BLIND, STARTING_CHIPS),
      chatHistory: [],
      seatSecrets: new Map(),
      playerUids: new Map(),
      departedContributors: [],
      consecutiveTimeouts: new Map(),
      botStats: new Map(),
      botTimer: null,
      allInTimer: null,
      autoNextTimer: null,
      handRecordedForHandNumber: 0,
    };
    rooms.set('CLUB01', ctx);
  }
  return ctx;
}

ensureDefaultClubRoom();

function createCustomRoom(params: {
  roomId?: string;
  tableName?: string;
  smallBlind?: number;
  bigBlind?: number;
  startingChips?: number;
  creatorId?: string | null;
}): { ok: true; ctx: RoomContext } | { ok: false; error: string } {
  const id = normalizeRoomId(params.roomId) || generateRoomId();
  const existing = rooms.get(id);
  if (existing) {
    existing.lastActivityAt = Date.now();
    return { ok: true, ctx: existing };
  }

  if (rooms.size >= MAX_CUSTOM_ROOMS + 1) {
    let oldestEmptyId: string | null = null;
    let oldestTs = Infinity;
    for (const [rid, rctx] of rooms.entries()) {
      if (rctx.isDefault || rid === 'CLUB01') continue;
      const hasHuman = rctx.state.players.some((p) => !p.isBot && p.connected);
      if (!hasHuman && rctx.lastActivityAt < oldestTs) {
        oldestTs = rctx.lastActivityAt;
        oldestEmptyId = rid;
      }
    }
    if (oldestEmptyId) {
      deleteRoomById(oldestEmptyId);
    } else {
      return { ok: false, error: '当前在线牌桌数量已达上限，请稍后再试' };
    }
  }

  const sb = Math.max(1, Math.min(5000, Math.floor(Number(params.smallBlind) || DEFAULT_SMALL_BLIND)));
  const rawBb = Math.floor(Number(params.bigBlind) || sb * 2);
  const bb = Math.max(sb + 1, Math.min(10000, rawBb));
  const startingChips = Math.max(
    bb * 10,
    Math.min(200_000, Math.floor(Number(params.startingChips) || STARTING_CHIPS))
  );
  const cleanName = (params.tableName ?? '').trim().slice(0, 24) || `牌桌 ${id}`;
  const now = Date.now();

  const ctx: RoomContext = {
    tableName: cleanName,
    createdAt: now,
    lastActivityAt: now,
    creatorId: params.creatorId?.trim().slice(0, 48) || null,
    isDefault: id === 'CLUB01',
    state: createTableState(id, sb, bb, startingChips),
    chatHistory: [],
    seatSecrets: new Map(),
    playerUids: new Map(),
    departedContributors: [],
    consecutiveTimeouts: new Map(),
    botStats: new Map(),
    botTimer: null,
    allInTimer: null,
    autoNextTimer: null,
    handRecordedForHandNumber: 0,
  };
  rooms.set(id, ctx);
  return { ok: true, ctx };
}

function getOrCreateRoom(roomId: string): RoomContext | null {
  const id = normalizeRoomId(roomId) || 'CLUB01';
  const existing = rooms.get(id);
  if (existing) {
    existing.lastActivityAt = Date.now();
    return existing;
  }
  const created = createCustomRoom({ roomId: id });
  return created.ok ? created.ctx : null;
}

function canRequesterDeleteRoom(
  ctx: RoomContext,
  requesterPlayerId: string | null | undefined,
  requesterSeatSecret?: string | null,
  fromVerifiedWsSession: boolean = false
): { ok: boolean; status?: number; error?: string } {
  if (ctx.isDefault || ctx.state.roomId === 'CLUB01') {
    return { ok: false, status: 403, error: '默认俱乐部大厅桌不可删除' };
  }
  const hasActiveHumans = ctx.state.players.some((p) => !p.isBot && p.connected);
  if (hasActiveHumans && ctx.state.hostId) {
    if (requesterPlayerId !== ctx.state.hostId) {
      return { ok: false, status: 403, error: '仅房主或空桌时可删除牌桌' };
    }
    if (!fromVerifiedWsSession) {
      const expectedSecret = ctx.seatSecrets.get(ctx.state.hostId);
      if (expectedSecret && requesterSeatSecret !== expectedSecret) {
        return { ok: false, status: 403, error: '房主身份校验失败，无法删除牌桌' };
      }
    }
  } else if (
    !hasActiveHumans &&
    ctx.creatorId &&
    Date.now() - ctx.createdAt < CREATOR_GRACE_WINDOW_MS &&
    requesterPlayerId !== ctx.creatorId
  ) {
    return { ok: false, status: 403, error: '该牌桌刚刚创建，暂仅创建者可删除' };
  }
  return { ok: true };
}

function clearRoomTimers(ctx: RoomContext): void {
  if (ctx.botTimer) {
    clearTimeout(ctx.botTimer);
    ctx.botTimer = null;
  }
  if (ctx.allInTimer) {
    clearTimeout(ctx.allInTimer);
    ctx.allInTimer = null;
  }
  if (ctx.autoNextTimer) {
    clearTimeout(ctx.autoNextTimer);
    ctx.autoNextTimer = null;
  }
}

function deleteRoomById(roomId: string): { ok: boolean; error?: string } {
  const id = normalizeRoomId(roomId);
  const ctx = rooms.get(id);
  if (!ctx) {
    return { ok: false, error: '牌桌不存在或已被删除' };
  }
  if (ctx.isDefault || id === 'CLUB01') {
    return { ok: false, error: '默认俱乐部大厅桌不可删除' };
  }

  clearRoomTimers(ctx);

  for (const [key, timer] of disconnectTimers.entries()) {
    if (key.startsWith(`${id}:`)) {
      clearTimeout(timer);
      disconnectTimers.delete(key);
    }
  }

  for (const session of sessions.values()) {
    if (session.roomId === id) {
      session.roomId = null;
      session.playerId = null;
      sendJson(session.ws, {
        type: 'room_deleted',
        roomId: id,
        reason: `牌桌「${ctx.tableName}」已被删除`,
      });
    }
  }

  rooms.delete(id);
  if (rooms.size === 0) {
    ensureDefaultClubRoom();
  }
  broadcastRoomsList();
  return { ok: true };
}

function sendJson(ws: WebSocket, payload: ServerWsMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function toRoomSummary(ctx: RoomContext): RoomSummary {
  return {
    roomId: ctx.state.roomId,
    tableName: ctx.tableName,
    playerCount: ctx.state.players.length,
    phase: ctx.state.phase,
    smallBlind: ctx.state.smallBlind,
    bigBlind: ctx.state.bigBlind,
    startingChips: ctx.state.startingChips,
    createdAt: ctx.createdAt,
  };
}

function getRoomSummaries(): RoomSummary[] {
  const list: RoomSummary[] = [];
  for (const ctx of rooms.values()) {
    list.push(toRoomSummary(ctx));
  }
  return list.sort((a, b) => {
    if (a.roomId === 'CLUB01') return -1;
    if (b.roomId === 'CLUB01') return 1;
    return b.createdAt - a.createdAt;
  });
}

function broadcastRoomsList(): void {
  const summary = getRoomSummaries();
  for (const session of sessions.values()) {
    sendJson(session.ws, { type: 'rooms_update', rooms: summary });
  }
}

function broadcastLeaderboard(): void {
  const entries = leaderboard.getRankedList(30);
  for (const session of sessions.values()) {
    sendJson(session.ws, { type: 'leaderboard_update', entries });
  }
}

function broadcastRoomChat(ctx: RoomContext, message: ChatMessage): void {
  for (const session of sessions.values()) {
    if (session.roomId === ctx.state.roomId && session.playerId) {
      sendJson(session.ws, { type: 'chat_message', message });
    }
  }
}

function broadcastRoomNudge(ctx: RoomContext, nudge: PlayerNudgeEvent): void {
  for (const session of sessions.values()) {
    if (session.roomId === ctx.state.roomId && session.playerId) {
      sendJson(session.ws, { type: 'player_nudged', nudge });
    }
  }
}

function recordShowdownIfNeeded(ctx: RoomContext): void {
  const { state } = ctx;
  if (state.phase !== 'showdown') return;
  if (ctx.handRecordedForHandNumber === state.handNumber) return;
  ctx.handRecordedForHandNumber = state.handNumber;
  runtimeMetrics.handsCompleted += 1;

  const winnerMap = new Map(state.winners.map((w) => [w.playerId, w]));
  const nonFoldedCount = state.players.filter((p) => p.inHand && !p.folded).length;
  const wonByFoldOnly = nonFoldedCount <= 1;
  const isPracticeWithBots = state.players.some((p) => p.isBot && p.inHand);
  const newlyUnlockedToNotify: Array<{ playerId: string; ids: AchievementId[] }> = [];

  leaderboard.runBatch(() => {
    // Persist completed hand snapshot to SQLite hand_history
    if (state.handHistory.length > 0 && state.handHistory[0].handNumber === state.handNumber) {
      sharedDb.recordHandHistory(state.roomId, state.handHistory[0]);
    }

    // Account for human players who left mid-hand after committing chips
    const handDeparted = ctx.departedContributors.filter(
      (d) => d.handNumber === state.handNumber && d.totalContributed > 0
    );
    ctx.departedContributors = [];
    for (const dep of handDeparted) {
      const depOutcome = leaderboard.recordHandOutcome({
        playerName: dep.playerName,
        uid: dep.uid,
        isPracticeWithBots,
        netChips: -dep.totalContributed,
        won: false,
        potWon: 0,
        wasAllIn: false,
        wonByFold: false,
        currentChips: 0,
        startingChips: state.startingChips,
        bigBlind: state.bigBlind,
      });
      if (dep.uid) {
        authStore.recordAuthoritativeHandOutcome(dep.uid, {
          netChips: -dep.totalContributed,
          normalizedPointsDelta: depOutcome.pointsDelta,
          won: false,
          potWon: 0,
          wasAllIn: false,
          wonByFold: false,
          currentChips: 0,
          startingChips: state.startingChips,
          bigBlind: state.bigBlind,
        });
      }
    }

    for (const p of state.players) {
      if (!p.inHand) continue;
      const winInfo = winnerMap.get(p.id);
      const won = Boolean(winInfo);
      const potWon = winInfo?.amount ?? 0;
      const netChips = won ? winInfo!.netChange : -p.totalContributed;

      let handName: string | undefined;
      let handScore: number | undefined;
      let handCategory: HandCategory | undefined;
      if (!p.folded && p.holeCards.length === 2 && state.communityCards.length === 5) {
        const ev = evaluateBestHand([...p.holeCards, ...state.communityCards]);
        handName = ev.categoryName;
        handScore = ev.score;
        handCategory = ev.category;
      }

      if (p.isBot) {
        const prevBot = ctx.botStats.get(p.id);
        const botRes = applyHandToAchievementStats(prevBot?.stats, prevBot?.achievements, {
          won,
          potWon,
          netChips,
          wasAllIn: p.allIn,
          wonByFold: won && wonByFoldOnly,
          handCategory: handCategory ?? null,
          currentChips: p.chips,
          startingChips: state.startingChips,
          bigBlind: state.bigBlind,
        });
        const botDates = mergeAchievementDates(
          prevBot?.achievementDates,
          botRes.unlocked,
          botRes.newlyUnlocked
        );
        ctx.botStats.set(p.id, {
          stats: botRes.nextStats,
          achievements: botRes.unlocked,
          achievementDates: botDates,
        });
        p.achievements = botRes.unlocked;
        p.achievementDates = botDates;
        p.winStreak = botRes.nextStats.currentWinStreak;
        continue;
      }

      const verifiedUid = ctx.playerUids.get(p.id) ?? null;
      const outcome = leaderboard.recordHandOutcome({
        playerName: p.name,
        uid: verifiedUid,
        isPracticeWithBots,
        netChips,
        won,
        potWon,
        wasAllIn: p.allIn,
        wonByFold: won && wonByFoldOnly,
        handName,
        handScore,
        handCategory,
        currentChips: p.chips,
        startingChips: state.startingChips,
        bigBlind: state.bigBlind,
      });

      let authoritativeAch = outcome.entry.achievements ?? [];
      let authoritativeDates = outcome.entry.achievementDates ?? {};
      let authoritativeStreak = outcome.entry.currentWinStreak ?? 0;
      let newlyUnlocked = outcome.newlyUnlocked;

      if (verifiedUid) {
        const authRes = authStore.recordAuthoritativeHandOutcome(verifiedUid, {
          netChips,
          normalizedPointsDelta: outcome.pointsDelta,
          won,
          potWon,
          wasAllIn: p.allIn,
          wonByFold: won && wonByFoldOnly,
          handName,
          handScore,
          handCategory,
          currentChips: p.chips,
          startingChips: state.startingChips,
          bigBlind: state.bigBlind,
        });
        if (authRes) {
          authoritativeAch = authRes.profile.achievements;
          authoritativeDates = authRes.profile.achievementDates;
          authoritativeStreak = authRes.profile.currentWinStreak;
          newlyUnlocked = sanitizeAchievementIds([
            ...newlyUnlocked,
            ...authRes.newlyUnlocked,
          ]);
        }
      }

      const mergedPlayerAch = sanitizeAchievementIds([
        ...(p.achievements ?? []),
        ...authoritativeAch,
      ]);
      const mergedPlayerDates = mergeAchievementDates(
        { ...(p.achievementDates ?? {}), ...authoritativeDates },
        mergedPlayerAch,
        newlyUnlocked
      );
      p.achievements = mergedPlayerAch;
      p.achievementDates = mergedPlayerDates;
      p.winStreak = authoritativeStreak;

      if (newlyUnlocked.length > 0) {
        newlyUnlockedToNotify.push({ playerId: p.id, ids: newlyUnlocked });
      }
    }
  });

  for (const item of newlyUnlockedToNotify) {
    for (const session of sessions.values()) {
      if (session.roomId === state.roomId && session.playerId === item.playerId) {
        sendJson(session.ws, {
          type: 'achievement_unlocked',
          achievementIds: item.ids,
        });
      }
    }
  }

  broadcastLeaderboard();
}

function broadcastRoomState(ctx: RoomContext): void {
  ctx.lastActivityAt = Date.now();
  recordShowdownIfNeeded(ctx);

  const { state } = ctx;
  if (
    state.phase === 'showdown' &&
    state.autoNextHandEnabled &&
    !state.nextHandAt &&
    state.players.some((p) => !p.isBot && p.connected) &&
    state.players.filter((p) => p.chips > 0 || p.isBot).length >= 2
  ) {
    state.nextHandAt = Date.now() + AUTO_NEXT_HAND_DELAY_MS;
  }

  for (const session of sessions.values()) {
    if (session.roomId === ctx.state.roomId && session.playerId) {
      sendJson(session.ws, {
        type: 'table_state',
        state: sanitizeTableForPlayer(ctx.state, session.playerId),
      });
    }
  }

  scheduleAllInStepIfNeeded(ctx);
  scheduleAutoNextHandIfNeeded(ctx);
  scheduleBotTurnIfNeeded(ctx);
}

function scheduleAllInStepIfNeeded(ctx: RoomContext): void {
  if (ctx.allInTimer) {
    clearTimeout(ctx.allInTimer);
    ctx.allInTimer = null;
  }
  const { state } = ctx;
  if (!state.allInRunout || state.phase === 'waiting' || state.phase === 'showdown') {
    return;
  }

  ctx.allInTimer = setTimeout(() => {
    ctx.allInTimer = null;
    if (!state.allInRunout || state.phase === 'showdown' || state.phase === 'waiting') return;
    const step = advanceAllInRunoutStep(state);
    if (step.ok) {
      broadcastRoomState(ctx);
    }
  }, 1150);
}

function scheduleAutoNextHandIfNeeded(ctx: RoomContext): void {
  if (ctx.autoNextTimer) {
    clearTimeout(ctx.autoNextTimer);
    ctx.autoNextTimer = null;
  }
  const { state } = ctx;
  if (state.phase !== 'showdown' || !state.autoNextHandEnabled) {
    return;
  }
  const hasHuman = state.players.some((p) => !p.isBot && p.connected);
  if (!hasHuman) return;

  const potentialNextHandPlayers = state.players.filter(
    (p) => p.chips > 0 || p.isBot
  ).length;
  if (potentialNextHandPlayers < 2) {
    return;
  }

  if (!state.nextHandAt) {
    state.nextHandAt = Date.now() + AUTO_NEXT_HAND_DELAY_MS;
  }

  const delay = Math.max(400, state.nextHandAt - Date.now());
  ctx.autoNextTimer = setTimeout(() => {
    ctx.autoNextTimer = null;
    if (state.phase !== 'showdown' || !state.autoNextHandEnabled) return;
    autoRebuyBustedBots(state);
    if (!canStartHand(state)) return;
    ctx.departedContributors = [];
    const started = startNewHand(state, cryptoRng, Date.now(), { stepAllIn: true });
    if (started.ok) {
      broadcastRoomState(ctx);
      broadcastRoomsList();
    }
  }, delay);
}

function scheduleBotTurnIfNeeded(ctx: RoomContext): void {
  if (ctx.botTimer) {
    clearTimeout(ctx.botTimer);
    ctx.botTimer = null;
  }

  const { state } = ctx;
  if (
    state.phase === 'waiting' ||
    state.phase === 'showdown' ||
    state.allInRunout ||
    !state.currentTurnPlayerId
  ) {
    return;
  }

  const hasConnectedHuman = state.players.some((p) => !p.isBot && p.connected);
  if (!hasConnectedHuman) {
    return;
  }

  const activePlayer = state.players.find((p) => p.id === state.currentTurnPlayerId);
  if (!activePlayer || !activePlayer.isBot) return;

  const thinkMs = 700 + crypto.randomInt(0, 1100);
  ctx.botTimer = setTimeout(() => {
    ctx.botTimer = null;
    if (state.currentTurnPlayerId !== activePlayer.id) return;
    if (!state.players.some((p) => !p.isBot && p.connected)) return;

    const t0 = performance.now();
    const action = chooseBotAction(state, activePlayer.id, cryptoRng);
    const elapsed = performance.now() - t0;
    runtimeMetrics.botDecisionsCount += 1;
    runtimeMetrics.botDecisionTotalMs += elapsed;

    const res = applyPlayerAction(state, activePlayer.id, action, Date.now(), { stepAllIn: true });
    if (res.ok) {
      broadcastRoomState(ctx);
    }
  }, thinkMs);
}

function recordMidHandDeparture(ctx: RoomContext, playerId: string): void {
  const { state } = ctx;
  if (state.phase === 'waiting' || state.phase === 'showdown') return;
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p || p.isBot || !p.inHand || p.totalContributed <= 0) return;
  ctx.departedContributors.push({
    playerId: p.id,
    playerName: p.name,
    uid: ctx.playerUids.get(p.id) ?? null,
    totalContributed: p.totalContributed,
    handNumber: state.handNumber,
  });
}

function cleanupPlayerFromCurrentRoom(session: ClientSession, immediate: boolean): void {
  if (!session.roomId || !session.playerId) return;
  const ctx = rooms.get(session.roomId);
  const { roomId, playerId } = session;

  session.roomId = null;
  session.playerId = null;

  if (!ctx) return;
  const player = ctx.state.players.find((p) => p.id === playerId);
  if (!player) return;

  if (immediate) {
    recordMidHandDeparture(ctx, playerId);
    removePlayerFromTable(ctx.state, playerId);
    ctx.seatSecrets.delete(playerId);
    ctx.playerUids.delete(playerId);
    ctx.consecutiveTimeouts.delete(playerId);
    if (ctx.state.players.every((p) => p.isBot) && ctx.botTimer) {
      clearTimeout(ctx.botTimer);
      ctx.botTimer = null;
    }
    broadcastRoomState(ctx);
    broadcastRoomsList();
    return;
  }

  player.connected = false;
  broadcastRoomState(ctx);

  const key = `${roomId}:${playerId}`;
  const existingTimer = disconnectTimers.get(key);
  if (existingTimer) clearTimeout(existingTimer);

  disconnectTimers.set(
    key,
    setTimeout(() => {
      disconnectTimers.delete(key);
      const stillDisconnected = ctx.state.players.find(
        (p) => p.id === playerId && !p.connected
      );
      if (stillDisconnected) {
        recordMidHandDeparture(ctx, playerId);
        removePlayerFromTable(ctx.state, playerId);
        ctx.seatSecrets.delete(playerId);
        ctx.playerUids.delete(playerId);
        ctx.consecutiveTimeouts.delete(playerId);
        broadcastRoomState(ctx);
        broadcastRoomsList();
      }
    }, 15_000)
  );
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  if (TRUST_PROXY) {
    app.set('trust proxy', 1);
  }
  app.use(express.json({ limit: '128kb' }));

  // Security headers + configurable CORS
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const reqOrigin = req.headers.origin;
    if (!ALLOWED_CORS_ORIGINS) {
      res.header('Access-Control-Allow-Origin', '*');
    } else if (reqOrigin && ALLOWED_CORS_ORIGINS.has(reqOrigin)) {
      res.header('Access-Control-Allow-Origin', reqOrigin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Player-Id, X-Seat-Secret'
    );
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    const dbOk = sharedDb.ping();
    let humans = 0;
    let bots = 0;
    for (const ctx of rooms.values()) {
      for (const p of ctx.state.players) {
        if (p.isBot) bots++;
        else if (p.connected) humans++;
      }
    }
    const payload = {
      ok: dbOk,
      uptimeSec: Math.floor((Date.now() - SERVER_STARTED_AT) / 1000),
      rooms: rooms.size,
      humans,
      bots,
      activeSessions: sessions.size,
      memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      persistence: 'sqlite',
      botEngine: 'gto-v2',
    };
    res.status(dbOk ? 200 : 503).json(payload);
  });

  app.get('/api/metrics', (_req, res) => {
    const avgBotDecisionMs =
      runtimeMetrics.botDecisionsCount > 0
        ? Number((runtimeMetrics.botDecisionTotalMs / runtimeMetrics.botDecisionsCount).toFixed(2))
        : 0;
    res.json({
      uptimeSec: Math.floor((Date.now() - SERVER_STARTED_AT) / 1000),
      rooms: rooms.size,
      activeSessions: sessions.size,
      handsCompleted: runtimeMetrics.handsCompleted,
      wsMessagesHandled: runtimeMetrics.wsMessagesHandled,
      rateLimitRejections: runtimeMetrics.rateLimitRejections,
      botDecisionsCount: runtimeMetrics.botDecisionsCount,
      avgBotDecisionMs,
    });
  });

  app.get('/api/bot/profiles', (_req, res) => {
    res.json({ profiles: BOT_PERSONALITY_PROFILES });
  });

  app.post('/api/gto/evaluate', async (req, res) => {
    const ip = getClientIp(req);
    const rate = gtoEvalLimiter.consume(ip);
    if (!rate.allowed) {
      runtimeMetrics.rateLimitRejections += 1;
      res.status(429).json({
        ok: false,
        error: `GTO 评估请求过于频繁，请 ${rate.retryAfterSec} 秒后再试`,
      });
      return;
    }
    const result = await evaluateGtoSpotWithCoach((req.body ?? {}) as GtoCoachRequest);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  const extractBearerToken = (req: express.Request): string | null => {
    const raw = req.headers.authorization;
    if (!raw || !raw.startsWith('Bearer ')) return null;
    return raw.slice(7).trim() || null;
  };

  app.post('/api/auth/send-code', async (req, res) => {
    const ip = getClientIp(req);
    const rate = otpSendLimiter.consume(ip);
    if (!rate.allowed) {
      runtimeMetrics.rateLimitRejections += 1;
      res.status(429).json({
        ok: false,
        error: `请求过于频繁，请 ${rate.retryAfterSec} 秒后再试`,
        retryAfterSec: rate.retryAfterSec,
      });
      return;
    }
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const result = await authStore.requestOtp(email);
    if (!result.ok) {
      res.status(result.retryAfterSec ? 429 : 400).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/auth/verify-code', (req, res) => {
    const ip = getClientIp(req);
    const rate = otpVerifyLimiter.consume(ip);
    if (!rate.allowed) {
      runtimeMetrics.rateLimitRejections += 1;
      res.status(429).json({
        ok: false,
        error: `验证过于频繁，请 ${rate.retryAfterSec} 秒后再试`,
      });
      return;
    }
    const { email, code, displayName, avatar } = req.body ?? {};
    const result = authStore.verifyOtp(
      typeof email === 'string' ? email : '',
      typeof code === 'string' ? code : '',
      {
        displayName: typeof displayName === 'string' ? displayName : undefined,
        avatar: typeof avatar === 'string' ? avatar : undefined,
      }
    );
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.get('/api/auth/session', (req, res) => {
    const token = extractBearerToken(req);
    const profile = authStore.verifySessionToken(token);
    if (!profile) {
      res.status(401).json({ error: '登录状态已失效，请重新验证邮箱' });
      return;
    }
    res.json({ profile });
  });

  app.patch('/api/auth/profile', (req, res) => {
    const token = extractBearerToken(req);
    const existing = authStore.verifySessionToken(token);
    if (!existing) {
      res.status(401).json({ error: '请先登录邮箱账号' });
      return;
    }
    const { displayName, avatar, bgmEnabled } = req.body ?? {};
    const updated = authStore.updatePreferences(existing.uid, {
      displayName: typeof displayName === 'string' ? displayName : undefined,
      avatar: typeof avatar === 'string' ? avatar : undefined,
      bgmEnabled: typeof bgmEnabled === 'boolean' ? bgmEnabled : undefined,
    });
    res.json({ profile: updated });
  });

  app.post('/api/auth/sync-outcome', (req, res) => {
    const token = extractBearerToken(req);
    const existing = authStore.verifySessionToken(token);
    if (!existing) {
      res.status(401).json({ error: '请先登录邮箱账号' });
      return;
    }
    const { entry, avatar } = req.body ?? {};
    const updated = authStore.syncMatchOutcome(
      existing.uid,
      entry,
      typeof avatar === 'string' ? avatar : undefined
    );
    res.json({ profile: updated });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = extractBearerToken(req);
    if (token) {
      authStore.revokeSessionToken(token);
    }
    res.json({ ok: true });
  });

  app.get('/api/leaderboard', (req, res) => {
    const rawMode = typeof req.query.mode === 'string' ? req.query.mode : 'all';
    const mode: LeaderboardMode =
      rawMode === 'ranked' || rawMode === 'practice' ? rawMode : 'all';
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30));
    res.json({ entries: leaderboard.getRankedList(limit, mode), mode });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: getRoomSummaries() });
  });

  app.get('/api/rooms/:roomId', (req, res) => {
    const id = normalizeRoomId(req.params.roomId);
    const ctx = rooms.get(id);
    if (!ctx) {
      res.status(404).json({ error: '牌桌不存在或已被删除' });
      return;
    }
    res.json({ room: toRoomSummary(ctx) });
  });

  app.get('/api/rooms/:roomId/history', (req, res) => {
    const id = normalizeRoomId(req.params.roomId);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const history = sharedDb.getRoomHandHistory(id, limit);
    res.json({ roomId: id, history });
  });

  app.post('/api/rooms', (req, res) => {
    const ip = getClientIp(req);
    const rate = roomCreateLimiter.consume(ip);
    if (!rate.allowed) {
      runtimeMetrics.rateLimitRejections += 1;
      res.status(429).json({ error: `创建牌桌过于频繁，请 ${rate.retryAfterSec} 秒后再试` });
      return;
    }
    const creatorId =
      typeof req.headers['x-player-id'] === 'string' ? req.headers['x-player-id'].trim() : null;
    const { tableName, roomId, smallBlind, bigBlind, startingChips } = req.body ?? {};
    const created = createCustomRoom({
      tableName,
      roomId,
      smallBlind,
      bigBlind,
      startingChips,
      creatorId,
    });
    if (!created.ok) {
      res.status(429).json({ error: created.error });
      return;
    }
    broadcastRoomsList();
    res.status(201).json({ room: toRoomSummary(created.ctx) });
  });

  app.delete('/api/rooms/:roomId', (req, res) => {
    const id = normalizeRoomId(req.params.roomId);
    const ctx = rooms.get(id);
    if (!ctx) {
      res.status(404).json({ error: '牌桌不存在或已被删除' });
      return;
    }
    const requesterId =
      typeof req.headers['x-player-id'] === 'string'
        ? req.headers['x-player-id'].trim()
        : typeof req.query.playerId === 'string'
          ? req.query.playerId.trim()
          : null;
    const requesterSecret =
      typeof req.headers['x-seat-secret'] === 'string'
        ? req.headers['x-seat-secret'].trim().slice(0, 64)
        : null;
    const authCheck = canRequesterDeleteRoom(ctx, requesterId, requesterSecret, false);
    if (!authCheck.ok) {
      res.status(authCheck.status ?? 403).json({ error: authCheck.error });
      return;
    }
    const result = deleteRoomById(id);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  // Clean JSON body parse error handler (avoids leaking Express HTML stack traces)
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({ error: '无效的 JSON 请求体' });
        return;
      }
      next(err);
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = resolveDistDir();
    app.use(express.static(distDir, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

  wss.on('connection', (ws) => {
    const wsKey = `ws_${crypto.randomBytes(6).toString('hex')}`;
    const session: ClientSession = {
      ws,
      isAlive: true,
      roomId: null,
      playerId: null,
      verifiedUid: null,
      lastChatAt: 0,
      nudgeCooldowns: new Map(),
    };
    sessions.set(ws, session);

    ws.on('pong', () => {
      session.isAlive = true;
    });

    sendJson(ws, { type: 'rooms_update', rooms: getRoomSummaries() });
    sendJson(ws, { type: 'leaderboard_update', entries: leaderboard.getRankedList(30) });

    ws.on('message', (raw) => {
      session.isAlive = true;
      runtimeMetrics.wsMessagesHandled += 1;
      const wsRate = wsMessageLimiter.consume(wsKey);
      if (!wsRate.allowed) {
        runtimeMetrics.rateLimitRejections += 1;
        sendJson(ws, { type: 'error', message: '操作频率过高，请稍后再试' });
        return;
      }

      try {
        let msg: ClientWsMessage;
        try {
          const parsed: unknown = JSON.parse(raw.toString());
          if (!parsed || typeof parsed !== 'object' || typeof (parsed as { type?: unknown }).type !== 'string') {
            sendJson(ws, { type: 'error', message: '无效的消息格式' });
            return;
          }
          msg = parsed as ClientWsMessage;
        } catch {
          sendJson(ws, { type: 'error', message: '无效的消息格式' });
          return;
        }

        if (msg.type === 'ping') {
          sendJson(ws, { type: 'pong' });
          return;
        }

        if (msg.type === 'create_room') {
          const created = createCustomRoom({
            tableName: typeof msg.tableName === 'string' ? msg.tableName : undefined,
            roomId: typeof msg.roomId === 'string' ? msg.roomId : undefined,
            smallBlind: typeof msg.smallBlind === 'number' ? msg.smallBlind : undefined,
            bigBlind: typeof msg.bigBlind === 'number' ? msg.bigBlind : undefined,
            startingChips: typeof msg.startingChips === 'number' ? msg.startingChips : undefined,
            creatorId: session.playerId,
          });
          if (!created.ok) {
            sendJson(ws, { type: 'error', message: created.error });
            return;
          }
          broadcastRoomsList();
          return;
        }

        if (msg.type === 'delete_room') {
          if (typeof msg.roomId !== 'string') {
            sendJson(ws, { type: 'error', message: '缺少牌桌编号' });
            return;
          }
          const targetId = normalizeRoomId(msg.roomId);
          const targetCtx = rooms.get(targetId);
          if (!targetCtx) {
            sendJson(ws, { type: 'error', message: '牌桌不存在或已被删除' });
            return;
          }
          const authCheck = canRequesterDeleteRoom(targetCtx, session.playerId, null, true);
          if (!authCheck.ok) {
            sendJson(ws, { type: 'error', message: authCheck.error ?? '无权删除牌桌' });
            return;
          }
          const result = deleteRoomById(targetId);
          if (!result.ok) {
            sendJson(ws, { type: 'error', message: result.error ?? '删除牌桌失败' });
          }
          return;
        }

        if (msg.type === 'join_room') {
          if (typeof msg.playerName !== 'string' || typeof msg.playerId !== 'string') {
            sendJson(ws, { type: 'error', message: '缺少有效的玩家信息' });
            return;
          }
          const cleanName = msg.playerName.trim().slice(0, 18);
          const cleanId = msg.playerId.trim().slice(0, 48);
          if (!cleanName || !cleanId) {
            sendJson(ws, { type: 'error', message: '请输入有效的玩家昵称' });
            return;
          }
          if (cleanId.startsWith('bot_')) {
            sendJson(ws, { type: 'error', message: '无效的玩家身份标识' });
            return;
          }

          const targetRoomId =
            normalizeRoomId(typeof msg.roomId === 'string' ? msg.roomId : 'CLUB01') || 'CLUB01';
          const ctx = getOrCreateRoom(targetRoomId);
          if (!ctx) {
            sendJson(ws, { type: 'error', message: '当前在线牌桌数量已达上限' });
            return;
          }

          const existingPlayer = ctx.state.players.find((p) => p.id === cleanId);
          if (existingPlayer?.isBot) {
            sendJson(ws, { type: 'error', message: '不可接管陪练 AI 座位' });
            return;
          }

          const incomingSecret =
            typeof msg.seatSecret === 'string' ? msg.seatSecret.trim().slice(0, 64) : '';
          const storedSecret = ctx.seatSecrets.get(cleanId);

          if (existingPlayer) {
            if (storedSecret && incomingSecret !== storedSecret) {
              sendJson(ws, { type: 'error', message: '该座位已被其他会话占用' });
              return;
            }
            if (!storedSecret) {
              for (const other of sessions.values()) {
                if (
                  other !== session &&
                  other.ws.readyState === WebSocket.OPEN &&
                  other.roomId === targetRoomId &&
                  other.playerId === cleanId
                ) {
                  sendJson(ws, { type: 'error', message: '该玩家已在牌桌在线，请勿重复登录' });
                  return;
                }
              }
            } else {
              for (const other of sessions.values()) {
                if (
                  other !== session &&
                  other.roomId === targetRoomId &&
                  other.playerId === cleanId
                ) {
                  other.roomId = null;
                  other.playerId = null;
                  try {
                    other.ws.terminate();
                  } catch {
                    // Ignore already-closed zombie socket
                  }
                }
              }
            }
          }

          if (session.roomId && session.roomId !== targetRoomId) {
            cleanupPlayerFromCurrentRoom(session, true);
          }

          const key = `${targetRoomId}:${cleanId}`;
          const pendingDisconnect = disconnectTimers.get(key);
          if (pendingDisconnect) {
            clearTimeout(pendingDisconnect);
            disconnectTimers.delete(key);
          }

          const verifiedAccount =
            typeof msg.authToken === 'string'
              ? authStore.verifySessionToken(msg.authToken)
              : null;
          const verifiedUid = verifiedAccount?.uid ?? null;
          session.verifiedUid = verifiedUid;

          const lbProfile = leaderboard.getPlayerProfile(cleanName, verifiedUid);
          let authoritativeAch: AchievementId[];
          let authoritativeDates: AchievementDatesMap;
          let authoritativeStreak: number;

          if (verifiedAccount) {
            authoritativeAch = sanitizeAchievementIds([
              ...verifiedAccount.achievements,
              ...lbProfile.achievements,
            ]);
            authoritativeDates = {
              ...lbProfile.achievementDates,
              ...verifiedAccount.achievementDates,
            };
            authoritativeStreak = Math.max(
              verifiedAccount.currentWinStreak,
              lbProfile.currentWinStreak
            );
          } else {
            authoritativeAch = sanitizeAchievementIds(lbProfile.achievements);
            authoritativeDates = sanitizeAchievementDates(lbProfile.achievementDates);
            authoritativeStreak = lbProfile.currentWinStreak;
          }

          const res = addPlayerToTable(ctx.state, {
            id: cleanId,
            name: cleanName,
            avatar: sanitizeAvatar(typeof msg.avatar === 'string' ? msg.avatar : undefined),
            achievements: authoritativeAch,
            achievementDates: authoritativeDates,
            winStreak: authoritativeStreak,
          });

          if (!res.ok) {
            sendJson(ws, { type: 'error', message: res.error ?? '无法加入牌桌' });
            return;
          }

          if (incomingSecret && !ctx.seatSecrets.has(cleanId)) {
            ctx.seatSecrets.set(cleanId, incomingSecret);
          }
          if (verifiedUid) {
            ctx.playerUids.set(cleanId, verifiedUid);
          }
          ctx.consecutiveTimeouts.set(cleanId, 0);

          session.roomId = targetRoomId;
          session.playerId = cleanId;
          broadcastRoomState(ctx);
          sendJson(ws, {
            type: 'chat_history',
            roomId: ctx.state.roomId,
            messages: ctx.chatHistory,
          });
          broadcastRoomsList();
          return;
        }

        if (msg.type === 'leave_room') {
          cleanupPlayerFromCurrentRoom(session, true);
          return;
        }

        if (!session.roomId || !session.playerId) {
          sendJson(ws, { type: 'error', message: '请先加入一个牌桌' });
          return;
        }

        const ctx = rooms.get(session.roomId);
        if (!ctx) {
          sendJson(ws, { type: 'error', message: '牌桌不存在' });
          return;
        }

        const isRoomHost = !ctx.state.hostId || ctx.state.hostId === session.playerId;

        if (msg.type === 'start_hand') {
          autoRebuyBustedBots(ctx.state);
          if (!canStartHand(ctx.state)) {
            sendJson(ws, { type: 'error', message: '至少需要 2 名有筹码的玩家才能开始' });
            return;
          }
          ctx.departedContributors = [];
          const started = startNewHand(ctx.state, cryptoRng, Date.now(), { stepAllIn: true });
          if (!started.ok) {
            sendJson(ws, { type: 'error', message: started.error ?? '无法开始牌局' });
            return;
          }
          broadcastRoomState(ctx);
          broadcastRoomsList();
          return;
        }

        if (msg.type === 'player_action') {
          if (!msg.action || typeof msg.action !== 'object' || typeof msg.action.type !== 'string') {
            sendJson(ws, { type: 'error', message: '操作格式无效' });
            return;
          }
          const res = applyPlayerAction(ctx.state, session.playerId, msg.action, Date.now(), {
            stepAllIn: true,
          });
          if (!res.ok) {
            sendJson(ws, { type: 'error', message: res.error ?? '操作无效' });
            return;
          }
          ctx.consecutiveTimeouts.set(session.playerId, 0);
          broadcastRoomState(ctx);
          return;
        }

        if (msg.type === 'reveal_cards') {
          const res = revealPlayerCards(ctx.state, session.playerId);
          if (!res.ok) {
            sendJson(ws, { type: 'error', message: res.error ?? '当前无法亮牌' });
            return;
          }
          broadcastRoomState(ctx);
          return;
        }

        if (msg.type === 'nudge_player') {
          if (typeof msg.targetPlayerId !== 'string') return;
          const sender = ctx.state.players.find((p) => p.id === session.playerId);
          const target = ctx.state.players.find((p) => p.id === msg.targetPlayerId);
          if (!sender || !target || sender.id === target.id) return;

          const now = Date.now();
          // Prune stale cooldown entries to keep Map bounded
          for (const [k, ts] of session.nudgeCooldowns.entries()) {
            if (now - ts > 15_000) session.nudgeCooldowns.delete(k);
          }
          const lastAt = session.nudgeCooldowns.get(target.id) ?? 0;
          if (now - lastAt < 3500) {
            sendJson(ws, { type: 'error', message: '催促冷却中，请稍后再试' });
            return;
          }
          session.nudgeCooldowns.set(target.id, now);
          const phrase = NUDGE_PHRASES[crypto.randomInt(0, NUDGE_PHRASES.length)];
          broadcastRoomNudge(ctx, {
            fromPlayerId: sender.id,
            fromPlayerName: sender.name,
            targetPlayerId: target.id,
            targetPlayerName: target.name,
            message: `${sender.name}：${phrase}`,
            createdAt: now,
          });
          return;
        }

        if (msg.type === 'toggle_auto_next') {
          ctx.state.autoNextHandEnabled = Boolean(msg.enabled);
          if (ctx.state.phase === 'showdown') {
            const potentialCount = ctx.state.players.filter((p) => p.chips > 0 || p.isBot).length;
            ctx.state.nextHandAt =
              ctx.state.autoNextHandEnabled && potentialCount >= 2
                ? Date.now() + AUTO_NEXT_HAND_DELAY_MS
                : null;
          }
          broadcastRoomState(ctx);
          return;
        }

        if (msg.type === 'add_bot') {
          if (!isRoomHost) {
            sendJson(ws, { type: 'error', message: '仅房主可添加陪练' });
            return;
          }
          const usedNames = new Set(ctx.state.players.map((p) => p.name));
          const nextName =
            BOT_NAMES.find((n) => !usedNames.has(n)) ??
            `陪练 Bot ${ctx.state.players.length + 1}`;
          const botId = `bot_${Date.now()}_${crypto.randomInt(100, 1000)}`;
          const botAvatarPool = ['spade', 'owl', 'fox', 'lion', 'crown', 'phoenix'];
          const botAvatar = botAvatarPool[ctx.state.players.length % botAvatarPool.length];
          const added = addPlayerToTable(ctx.state, {
            id: botId,
            name: nextName,
            avatar: botAvatar,
            isBot: true,
          });
          if (!added.ok) {
            sendJson(ws, { type: 'error', message: added.error ?? '无法添加陪练' });
            return;
          }
          broadcastRoomState(ctx);
          broadcastRoomsList();
          return;
        }

        if (msg.type === 'remove_bot') {
          if (!isRoomHost) {
            sendJson(ws, { type: 'error', message: '仅房主可移除陪练' });
            return;
          }
          if (typeof msg.botId !== 'string') return;
          const target = ctx.state.players.find((p) => p.id === msg.botId && p.isBot);
          if (!target) return;
          removePlayerFromTable(ctx.state, target.id);
          broadcastRoomState(ctx);
          broadcastRoomsList();
          return;
        }

        if (msg.type === 'rebuy') {
          const ok = rebuyPlayerChips(ctx.state, session.playerId);
          if (!ok) {
            sendJson(ws, { type: 'error', message: '当前筹码已满或本局进行中，暂不可补充' });
            return;
          }
          broadcastRoomState(ctx);
          return;
        }

        if (msg.type === 'update_blind_settings') {
          if (!isRoomHost) {
            sendJson(ws, { type: 'error', message: '仅房主可调整盲注设置' });
            return;
          }
          const res = updateTableBlindSettings(ctx.state, {
            smallBlind: msg.smallBlind,
            bigBlind: msg.bigBlind,
            manualBlindTarget: msg.manualBlindTarget,
          });
          if (!res.ok) {
            sendJson(ws, { type: 'error', message: res.error ?? '大小盲设置无效' });
            return;
          }
          broadcastRoomState(ctx);
          broadcastRoomsList();
          return;
        }

        if (msg.type === 'send_chat') {
          if (typeof msg.text !== 'string') return;
          const now = Date.now();
          if (now - session.lastChatAt < 350) {
            return;
          }
          const player = ctx.state.players.find((p) => p.id === session.playerId);
          if (!player) return;

          const cleanText = sanitizeChatText(msg.text);
          if (!cleanText) return;

          session.lastChatAt = now;
          const chatMsg: ChatMessage = {
            id: `chat_${now.toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
            roomId: ctx.state.roomId,
            playerId: player.id,
            playerName: player.name,
            text: cleanText,
            createdAt: now,
          };
          ctx.chatHistory = appendChatHistory(ctx.chatHistory, chatMsg, MAX_CHAT_HISTORY);
          broadcastRoomChat(ctx, chatMsg);
        }
      } catch (err) {
        console.error('[WS Message Error]', err);
        sendJson(ws, { type: 'error', message: '请求处理异常，请重试' });
      }
    });

    ws.on('close', () => {
      sessions.delete(ws);
      cleanupPlayerFromCurrentRoom(session, false);
    });
  });

  // WebSocket heartbeat to terminate half-open/zombie sockets cleanly
  const heartbeatInterval = setInterval(() => {
    for (const [ws, session] of sessions.entries()) {
      if (!session.isAlive) {
        try {
          ws.terminate();
        } catch {
          // Ignore already closed
        }
        continue;
      }
      session.isAlive = false;
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch {
          // Ignore ping error
        }
      }
    }
  }, 15_000);

  // Idle empty custom room garbage collection + expired OTP pruning (every 5 min)
  const gcInterval = setInterval(() => {
    const now = Date.now();
    authStore.pruneExpiredOtps(now);
    const toDelete: string[] = [];
    for (const [rid, ctx] of rooms.entries()) {
      if (ctx.isDefault || rid === 'CLUB01') continue;
      const hasHuman = ctx.state.players.some((p) => !p.isBot && p.connected);
      if (!hasHuman && now - ctx.lastActivityAt > EMPTY_ROOM_IDLE_TTL_MS) {
        toDelete.push(rid);
      }
    }
    for (const rid of toDelete) {
      deleteRoomById(rid);
    }
  }, 5 * 60 * 1000);

  // Turn timeout watchdog + AFK auto-unseat protection (every 1s)
  const turnWatchdogInterval = setInterval(() => {
    const now = Date.now();
    for (const ctx of rooms.values()) {
      const { state } = ctx;
      if (
        state.phase !== 'waiting' &&
        state.phase !== 'showdown' &&
        state.currentTurnPlayerId &&
        state.turnDeadline &&
        now >= state.turnDeadline
      ) {
        const turnPlayer = state.players.find((p) => p.id === state.currentTurnPlayerId);
        if (!turnPlayer) continue;
        const canCheck = state.currentBet <= turnPlayer.currentBet;
        const res = applyPlayerAction(
          state,
          turnPlayer.id,
          { type: canCheck ? 'check' : 'fold' },
          now,
          { stepAllIn: true }
        );
        if (res.ok) {
          if (!turnPlayer.isBot) {
            const strikes = (ctx.consecutiveTimeouts.get(turnPlayer.id) ?? 0) + 1;
            ctx.consecutiveTimeouts.set(turnPlayer.id, strikes);
            if (strikes >= AFK_MAX_CONSECUTIVE_TIMEOUTS) {
              for (const s of sessions.values()) {
                if (s.roomId === state.roomId && s.playerId === turnPlayer.id) {
                  sendJson(s.ws, {
                    type: 'error',
                    message: `连续 ${AFK_MAX_CONSECUTIVE_TIMEOUTS} 次操作超时，已自动离座`,
                  });
                  cleanupPlayerFromCurrentRoom(s, true);
                  break;
                }
              }
              continue;
            }
          }
          broadcastRoomState(ctx);
        }
      }
    }
  }, 1000);

  // Graceful shutdown for Docker SIGTERM / Ctrl+C SIGINT
  let shuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Velvet Hold'em] Received ${signal}, shutting down gracefully...`);

    clearInterval(heartbeatInterval);
    clearInterval(gcInterval);
    clearInterval(turnWatchdogInterval);

    for (const ctx of rooms.values()) {
      clearRoomTimers(ctx);
    }
    for (const timer of disconnectTimers.values()) {
      clearTimeout(timer);
    }
    disconnectTimers.clear();

    for (const ws of sessions.keys()) {
      try {
        ws.close(1001, 'Server shutting down');
      } catch {
        // Ignore already closed sockets
      }
    }

    const forceExitTimer = setTimeout(() => {
      sharedDb.close();
      process.exit(0);
    }, 8_000);
    forceExitTimer.unref();

    wss.close(() => {
      server.close(() => {
        sharedDb.close();
        clearTimeout(forceExitTimer);
        console.log("[Velvet Hold'em] Shutdown complete.");
        process.exit(0);
      });
    });
  };

  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Velvet Hold'em server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
