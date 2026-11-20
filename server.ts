import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { EmailAuthStore } from './server/authStore';
import { chooseBotAction } from './server/botAi';
import { LeaderboardStore } from './server/leaderboard';
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

interface RoomContext {
  tableName: string;
  createdAt: number;
  isDefault: boolean;
  state: TableState;
  chatHistory: ChatMessage[];
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
  roomId: string | null;
  playerId: string | null;
  lastChatAt: number;
  nudgeCooldowns: Map<string, number>;
}

const leaderboard = new LeaderboardStore();
const authStore = new EmailAuthStore();
const rooms = new Map<string, RoomContext>();
const sessions = new Map<WebSocket, ClientSession>();
const disconnectTimers = new Map<string, NodeJS.Timeout>();

function normalizeRoomId(raw?: string): string {
  const cleaned = (raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  return cleaned.slice(0, 12);
}

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomId() : code;
}

function ensureDefaultClubRoom(): RoomContext {
  let ctx = rooms.get('CLUB01');
  if (!ctx) {
    ctx = {
      tableName: '俱乐部大厅桌',
      createdAt: Date.now(),
      isDefault: true,
      state: createTableState('CLUB01', DEFAULT_SMALL_BLIND, DEFAULT_BIG_BLIND, STARTING_CHIPS),
      chatHistory: [],
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

// Initialize default lobby table
ensureDefaultClubRoom();

function createCustomRoom(params: {
  roomId?: string;
  tableName?: string;
  smallBlind?: number;
  bigBlind?: number;
  startingChips?: number;
}): RoomContext {
  const id = normalizeRoomId(params.roomId) || generateRoomId();
  const existing = rooms.get(id);
  if (existing) return existing;

  const sb = Math.max(1, Math.min(5000, Math.floor(Number(params.smallBlind) || DEFAULT_SMALL_BLIND)));
  const rawBb = Math.floor(Number(params.bigBlind) || sb * 2);
  const bb = Math.max(sb + 1, Math.min(10000, rawBb));
  const startingChips = Math.max(
    bb * 10,
    Math.min(200_000, Math.floor(Number(params.startingChips) || STARTING_CHIPS))
  );
  const cleanName = (params.tableName ?? '').trim().slice(0, 24) || `牌桌 ${id}`;

  const ctx: RoomContext = {
    tableName: cleanName,
    createdAt: Date.now(),
    isDefault: id === 'CLUB01',
    state: createTableState(id, sb, bb, startingChips),
    chatHistory: [],
    botStats: new Map(),
    botTimer: null,
    allInTimer: null,
    autoNextTimer: null,
    handRecordedForHandNumber: 0,
  };
  rooms.set(id, ctx);
  return ctx;
}

function getOrCreateRoom(roomId: string): RoomContext {
  const id = normalizeRoomId(roomId) || 'CLUB01';
  return rooms.get(id) ?? createCustomRoom({ roomId: id });
}

function deleteRoomById(roomId: string): { ok: boolean; error?: string } {
  const id = normalizeRoomId(roomId);
  const ctx = rooms.get(id);
  if (!ctx) {
    return { ok: false, error: '牌桌不存在或已被删除' };
  }

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

  // Clear any pending disconnect timers for this room
  for (const [key, timer] of disconnectTimers.entries()) {
    if (key.startsWith(`${id}:`)) {
      clearTimeout(timer);
      disconnectTimers.delete(key);
    }
  }

  // Notify and detach any active sessions in this room
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
  // Keep at least default lobby table available if it wasn't explicitly recreated
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

function getRoomSummaries(): RoomSummary[] {
  const list: RoomSummary[] = [];
  for (const ctx of rooms.values()) {
    list.push({
      roomId: ctx.state.roomId,
      tableName: ctx.tableName,
      playerCount: ctx.state.players.length,
      phase: ctx.state.phase,
      smallBlind: ctx.state.smallBlind,
      bigBlind: ctx.state.bigBlind,
      startingChips: ctx.state.startingChips,
      createdAt: ctx.createdAt,
    });
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

  const winnerMap = new Map(state.winners.map((w) => [w.playerId, w]));
  const nonFoldedCount = state.players.filter((p) => p.inHand && !p.folded).length;
  const wonByFoldOnly = nonFoldedCount <= 1;

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

    const outcome = leaderboard.recordHandOutcome({
      playerName: p.name,
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

    const mergedPlayerAch = sanitizeAchievementIds([
      ...(p.achievements ?? []),
      ...(outcome.entry.achievements ?? []),
    ]);
    const mergedPlayerDates = mergeAchievementDates(
      { ...(p.achievementDates ?? {}), ...(outcome.entry.achievementDates ?? {}) },
      mergedPlayerAch,
      outcome.newlyUnlocked
    );
    p.achievements = mergedPlayerAch;
    p.achievementDates = mergedPlayerDates;
    p.winStreak = outcome.entry.currentWinStreak ?? 0;

    if (outcome.newlyUnlocked.length > 0) {
      for (const session of sessions.values()) {
        if (session.roomId === state.roomId && session.playerId === p.id) {
          sendJson(session.ws, {
            type: 'achievement_unlocked',
            achievementIds: outcome.newlyUnlocked,
          });
        }
      }
    }
  }

  broadcastLeaderboard();
}

function broadcastRoomState(ctx: RoomContext): void {
  recordShowdownIfNeeded(ctx);

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
  if (
    state.phase !== 'showdown' ||
    !state.autoNextHandEnabled ||
    !state.nextHandAt ||
    !canStartHand(state)
  ) {
    return;
  }
  const hasHuman = state.players.some((p) => !p.isBot && p.connected);
  if (!hasHuman) return;

  const delay = Math.max(400, state.nextHandAt - Date.now());
  ctx.autoNextTimer = setTimeout(() => {
    ctx.autoNextTimer = null;
    if (state.phase !== 'showdown' || !state.autoNextHandEnabled || !canStartHand(state)) return;
    for (const p of state.players) {
      if (p.isBot && p.chips < state.bigBlind) {
        rebuyPlayerChips(state, p.id);
      }
    }
    const started = startNewHand(state, Math.random, Date.now(), { stepAllIn: true });
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

  const activePlayer = state.players.find((p) => p.id === state.currentTurnPlayerId);
  if (!activePlayer || !activePlayer.isBot) return;

  ctx.botTimer = setTimeout(() => {
    ctx.botTimer = null;
    if (state.currentTurnPlayerId !== activePlayer.id) return;
    const action = chooseBotAction(state, activePlayer.id);
    const res = applyPlayerAction(state, activePlayer.id, action, Date.now(), { stepAllIn: true });
    if (res.ok) {
      broadcastRoomState(ctx);
    }
  }, 650);
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
    removePlayerFromTable(ctx.state, playerId);
    // Keep created rooms alive in lobby so players can re-enter or explicitly delete them
    if (ctx.state.players.every((p) => p.isBot)) {
      if (ctx.botTimer) clearTimeout(ctx.botTimer);
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
        removePlayerFromTable(ctx.state, playerId);
        broadcastRoomState(ctx);
        broadcastRoomsList();
      }
    }, 15_000)
  );
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Allow external frontend origins if deployed separately on user's server
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  const extractBearerToken = (req: express.Request): string | null => {
    const raw = req.headers.authorization;
    if (!raw || !raw.startsWith('Bearer ')) return null;
    return raw.slice(7).trim() || null;
  };

  app.post('/api/auth/send-code', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const result = await authStore.requestOtp(email);
    if (!result.ok) {
      res.status(result.retryAfterSec ? 429 : 400).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/auth/verify-code', (req, res) => {
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
    if (!entry || typeof entry !== 'object') {
      res.status(400).json({ error: '缺少战绩数据' });
      return;
    }
    const updated = authStore.syncMatchOutcome(
      existing.uid,
      entry,
      typeof avatar === 'string' ? avatar : undefined
    );
    res.json({ profile: updated });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ entries: leaderboard.getRankedList(30) });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: getRoomSummaries() });
  });

  app.post('/api/rooms', (req, res) => {
    const { tableName, roomId, smallBlind, bigBlind, startingChips } = req.body ?? {};
    const ctx = createCustomRoom({ tableName, roomId, smallBlind, bigBlind, startingChips });
    broadcastRoomsList();
    res.status(201).json({
      room: {
        roomId: ctx.state.roomId,
        tableName: ctx.tableName,
        playerCount: ctx.state.players.length,
        phase: ctx.state.phase,
        smallBlind: ctx.state.smallBlind,
        bigBlind: ctx.state.bigBlind,
        startingChips: ctx.state.startingChips,
        createdAt: ctx.createdAt,
      } satisfies RoomSummary,
    });
  });

  app.delete('/api/rooms/:roomId', (req, res) => {
    const result = deleteRoomById(req.params.roomId);
    if (!result.ok) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const session: ClientSession = {
      ws,
      roomId: null,
      playerId: null,
      lastChatAt: 0,
      nudgeCooldowns: new Map(),
    };
    sessions.set(ws, session);

    sendJson(ws, { type: 'rooms_update', rooms: getRoomSummaries() });
    sendJson(ws, { type: 'leaderboard_update', entries: leaderboard.getRankedList(30) });

    ws.on('message', (raw) => {
      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientWsMessage;
      } catch {
        sendJson(ws, { type: 'error', message: '无效的消息格式' });
        return;
      }

      if (msg.type === 'ping') {
        sendJson(ws, { type: 'pong' });
        return;
      }

      if (msg.type === 'create_room') {
        createCustomRoom({
          tableName: msg.tableName,
          roomId: msg.roomId,
          smallBlind: msg.smallBlind,
          bigBlind: msg.bigBlind,
          startingChips: msg.startingChips,
        });
        broadcastRoomsList();
        return;
      }

      if (msg.type === 'delete_room') {
        const result = deleteRoomById(msg.roomId);
        if (!result.ok) {
          sendJson(ws, { type: 'error', message: result.error ?? '删除牌桌失败' });
        }
        return;
      }

      if (msg.type === 'join_room') {
        const cleanName = msg.playerName.trim().slice(0, 18);
        const cleanId = msg.playerId.trim().slice(0, 48);
        if (!cleanName || !cleanId) {
          sendJson(ws, { type: 'error', message: '请输入有效的玩家昵称' });
          return;
        }

        const targetRoomId = normalizeRoomId(msg.roomId) || 'CLUB01';
        if (session.roomId && session.roomId !== targetRoomId) {
          cleanupPlayerFromCurrentRoom(session, true);
        }

        const key = `${targetRoomId}:${cleanId}`;
        const pendingDisconnect = disconnectTimers.get(key);
        if (pendingDisconnect) {
          clearTimeout(pendingDisconnect);
          disconnectTimers.delete(key);
        }

        const ctx = getOrCreateRoom(targetRoomId);
        const profile = leaderboard.getPlayerProfile(cleanName);
        const clientAch = sanitizeAchievementIds(msg.achievements);
        const clientDates = sanitizeAchievementDates(msg.achievementDates);
        const mergedAch = sanitizeAchievementIds([
          ...profile.achievements,
          ...clientAch,
        ]);
        const mergedDates: AchievementDatesMap = {
          ...clientDates,
          ...profile.achievementDates,
        };
        const res = addPlayerToTable(ctx.state, {
          id: cleanId,
          name: cleanName,
          avatar: sanitizeAvatar(msg.avatar),
          achievements: mergedAch,
          achievementDates: mergedDates,
          winStreak: profile.currentWinStreak,
        });

        if (!res.ok) {
          sendJson(ws, { type: 'error', message: res.error ?? '无法加入牌桌' });
          return;
        }

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

      if (msg.type === 'start_hand') {
        if (!canStartHand(ctx.state)) {
          sendJson(ws, { type: 'error', message: '至少需要 2 名有筹码的玩家才能开始' });
          return;
        }
        for (const p of ctx.state.players) {
          if (p.isBot && p.chips < ctx.state.bigBlind) {
            rebuyPlayerChips(ctx.state, p.id);
          }
        }
        const started = startNewHand(ctx.state, Math.random, Date.now(), { stepAllIn: true });
        if (!started.ok) {
          sendJson(ws, { type: 'error', message: started.error ?? '无法开始牌局' });
          return;
        }
        broadcastRoomState(ctx);
        broadcastRoomsList();
        return;
      }

      if (msg.type === 'player_action') {
        const res = applyPlayerAction(ctx.state, session.playerId, msg.action, Date.now(), {
          stepAllIn: true,
        });
        if (!res.ok) {
          sendJson(ws, { type: 'error', message: res.error ?? '操作无效' });
          return;
        }
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
        const sender = ctx.state.players.find((p) => p.id === session.playerId);
        const target = ctx.state.players.find((p) => p.id === msg.targetPlayerId);
        if (!sender || !target || sender.id === target.id) return;

        const now = Date.now();
        const lastAt = session.nudgeCooldowns.get(target.id) ?? 0;
        if (now - lastAt < 3500) {
          sendJson(ws, { type: 'error', message: '催促冷却中，请稍后再试' });
          return;
        }
        session.nudgeCooldowns.set(target.id, now);
        const phrase = NUDGE_PHRASES[Math.floor(Math.random() * NUDGE_PHRASES.length)];
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
          ctx.state.nextHandAt =
            ctx.state.autoNextHandEnabled && canStartHand(ctx.state)
              ? Date.now() + AUTO_NEXT_HAND_DELAY_MS
              : null;
        }
        broadcastRoomState(ctx);
        return;
      }

      if (msg.type === 'add_bot') {
        const usedNames = new Set(ctx.state.players.map((p) => p.name));
        const nextName =
          BOT_NAMES.find((n) => !usedNames.has(n)) ??
          `陪练 Bot ${ctx.state.players.length + 1}`;
        const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
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
          sendJson(ws, { type: 'error', message: '当前筹码充足或牌局进行中，暂不可补充' });
          return;
        }
        broadcastRoomState(ctx);
        return;
      }

      if (msg.type === 'update_blind_settings') {
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
          id: `chat_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
          roomId: ctx.state.roomId,
          playerId: player.id,
          playerName: player.name,
          text: cleanText,
          createdAt: now,
        };
        ctx.chatHistory = appendChatHistory(ctx.chatHistory, chatMsg, MAX_CHAT_HISTORY);
        broadcastRoomChat(ctx, chatMsg);
      }
    });

    ws.on('close', () => {
      sessions.delete(ws);
      cleanupPlayerFromCurrentRoom(session, false);
    });
  });

  // Turn timeout watchdog (every 1s)
  setInterval(() => {
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
          broadcastRoomState(ctx);
        }
      }
    }
  }, 1000);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Velvet Hold'em server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
