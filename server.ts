import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { EmailAuthStore } from './server/authStore';
import { chooseBotAction } from './server/botAi';
import {
  buildBotChatMessages,
  requestDeepSeekReply,
  selectRespondingBot,
  type BotChatTrigger,
} from './server/botChat';
import { LeaderboardStore } from './server/leaderboard';
import { authorizeRoomDeletion, secretsMatch } from './server/roomAuth';
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
  sanitizeEquippedAchievement,
  type AchievementDatesMap,
  type AchievementId,
  type PlayerAchievementStats,
} from './src/shared/achievements';
import {
  buildBotInitialStats,
  computePlayerLevel,
  getBotClubPreset,
} from './src/shared/playerProfile';
import type {
  BotChatStatus,
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
  creatorId: string | null;
  creatorSecret: string | null;
  state: TableState;
  chatHistory: ChatMessage[];
  seatSecrets: Map<string, string>;
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
  botChatTimer: NodeJS.Timeout | null;
  botChatEnabled: boolean;
  deepseekApiKey: string | null;
  lastBotChatAt: number;
  lastBotChatSpeakerId: string | null;
  botChatInFlight: boolean;
  handRecordedForHandNumber: number;
}

interface ClientSession {
  ws: WebSocket;
  isAlive: boolean;
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
    const hasServerKey = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
    ctx = {
      tableName: '俱乐部大厅桌',
      createdAt: Date.now(),
      isDefault: true,
      creatorId: null,
      creatorSecret: null,
      state: createTableState('CLUB01', DEFAULT_SMALL_BLIND, DEFAULT_BIG_BLIND, STARTING_CHIPS),
      chatHistory: [],
      seatSecrets: new Map(),
      botStats: new Map(),
      botTimer: null,
      allInTimer: null,
      autoNextTimer: null,
      botChatTimer: null,
      botChatEnabled: hasServerKey,
      deepseekApiKey: null,
      lastBotChatAt: 0,
      lastBotChatSpeakerId: null,
      botChatInFlight: false,
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
  creatorId?: string | null;
  creatorSecret?: string | null;
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
  const hasServerKey = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  const cleanCreatorId = params.creatorId?.trim().slice(0, 48) || null;
  const cleanCreatorSecret = params.creatorSecret?.trim().slice(0, 64) || null;

  const ctx: RoomContext = {
    tableName: cleanName,
    createdAt: Date.now(),
    isDefault: id === 'CLUB01',
    creatorId: cleanCreatorId && cleanCreatorSecret ? cleanCreatorId : null,
    creatorSecret: cleanCreatorId && cleanCreatorSecret ? cleanCreatorSecret : null,
    state: createTableState(id, sb, bb, startingChips),
    chatHistory: [],
    seatSecrets: new Map(),
    botStats: new Map(),
    botTimer: null,
    allInTimer: null,
    autoNextTimer: null,
    botChatTimer: null,
    botChatEnabled: hasServerKey,
    deepseekApiKey: null,
    lastBotChatAt: 0,
    lastBotChatSpeakerId: null,
    botChatInFlight: false,
    handRecordedForHandNumber: 0,
  };
  rooms.set(id, ctx);
  return ctx;
}

function getOrCreateRoom(roomId: string): RoomContext {
  const id = normalizeRoomId(roomId) || 'CLUB01';
  return rooms.get(id) ?? createCustomRoom({ roomId: id });
}

function canRequesterDeleteRoom(
  ctx: RoomContext,
  requesterPlayerId: string | null | undefined,
  requesterSeatSecret?: string | null,
  requireSecretCheck = false
): { ok: boolean; status?: number; error?: string } {
  return authorizeRoomDeletion(
    {
      isDefault: ctx.isDefault,
      roomId: ctx.state.roomId,
      hostId: ctx.state.hostId,
      hasAnyHumanPlayer: ctx.state.players.some((p) => !p.isBot),
      creatorId: ctx.creatorId,
      creatorSecret: ctx.creatorSecret,
      seatSecrets: ctx.seatSecrets,
    },
    requesterPlayerId,
    requesterSeatSecret,
    requireSecretCheck
  );
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
  if (ctx.botChatTimer) {
    clearTimeout(ctx.botChatTimer);
    ctx.botChatTimer = null;
  }
  ctx.deepseekApiKey = null;

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

function getEffectiveDeepSeekKey(ctx: RoomContext): string | null {
  const roomKey = ctx.deepseekApiKey?.trim();
  if (roomKey) return roomKey;
  const envKey = process.env.DEEPSEEK_API_KEY?.trim();
  return envKey || null;
}

function getBotChatStatus(ctx: RoomContext): BotChatStatus {
  const hasRoomKey = Boolean(ctx.deepseekApiKey?.trim());
  const hasServerKey = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  const source: BotChatStatus['source'] = hasRoomKey
    ? 'room'
    : hasServerKey
      ? 'server'
      : 'none';
  const configured = source !== 'none';
  return {
    enabled: ctx.botChatEnabled && configured,
    configured,
    source,
  };
}

function broadcastBotChatStatus(ctx: RoomContext): void {
  const status = getBotChatStatus(ctx);
  for (const session of sessions.values()) {
    if (session.roomId === ctx.state.roomId && session.playerId) {
      sendJson(session.ws, {
        type: 'bot_chat_status',
        roomId: ctx.state.roomId,
        status,
      });
    }
  }
}

function scheduleBotChatReaction(ctx: RoomContext, trigger: BotChatTrigger): void {
  if (!ctx.botChatEnabled) return;
  const apiKey = getEffectiveDeepSeekKey(ctx);
  if (!apiKey) return;
  if (ctx.botChatInFlight) return;
  if (!ctx.state.players.some((p) => p.isBot)) return;

  const now = Date.now();
  const minCooldownMs = trigger.kind === 'nudge' ? 2800 : 4500;
  if (now - ctx.lastBotChatAt < minCooldownMs) return;

  const bot = selectRespondingBot(
    ctx.state.players,
    trigger,
    ctx.lastBotChatSpeakerId,
    cryptoRng
  );
  if (!bot) return;

  if (ctx.botChatTimer) {
    clearTimeout(ctx.botChatTimer);
    ctx.botChatTimer = null;
  }

  const delayMs =
    trigger.kind === 'nudge'
      ? 750 + crypto.randomInt(0, 750)
      : trigger.kind === 'showdown'
        ? 1100 + crypto.randomInt(0, 900)
        : 900 + crypto.randomInt(0, 1100);

  ctx.botChatTimer = setTimeout(() => {
    ctx.botChatTimer = null;
    const activeKey = getEffectiveDeepSeekKey(ctx);
    if (!ctx.botChatEnabled || !activeKey || ctx.botChatInFlight) return;
    if (!rooms.has(ctx.state.roomId)) return;
    const stillSeated = ctx.state.players.find((p) => p.id === bot.id && p.isBot);
    if (!stillSeated) return;

    ctx.botChatInFlight = true;
    const messages = buildBotChatMessages({
      bot: stillSeated,
      table: ctx.state,
      recentChat: ctx.chatHistory,
      trigger,
    });

    void requestDeepSeekReply({
      apiKey: activeKey,
      messages,
      botName: stillSeated.name,
      timeoutMs: 9000,
    })
      .then((reply) => {
        if (!rooms.has(ctx.state.roomId)) return;
        const sentAt = Date.now();
        ctx.lastBotChatAt = sentAt;
        ctx.lastBotChatSpeakerId = stillSeated.id;
        const chatMsg: ChatMessage = {
          id: `chat_${sentAt.toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
          roomId: ctx.state.roomId,
          playerId: stillSeated.id,
          playerName: stillSeated.name,
          text: reply,
          createdAt: sentAt,
          isBot: true,
        };
        ctx.chatHistory = appendChatHistory(ctx.chatHistory, chatMsg, MAX_CHAT_HISTORY);
        broadcastRoomChat(ctx, chatMsg);
      })
      .catch(() => {
        // Silent graceful degradation: bot stays quiet if DeepSeek fails or times out
      })
      .finally(() => {
        ctx.botChatInFlight = false;
      });
  }, delayMs);
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

    const reachedShowdown =
      !p.folded && !wonByFoldOnly && state.communityCards.length === 5;
    const wasSplitPot = state.winners.length > 1;
    const isBigBlind = p.seatIndex === state.bigBlindSeatIndex;
    const startingHandChips = Math.max(0, p.chips + p.totalContributed - potWon);

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
        holeCards: p.holeCards,
        communityCardsCount: state.communityCards.length,
        wasSplitPot,
        isBigBlind,
        startingHandChips,
        reachedShowdown,
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
      p.level = computePlayerLevel({
        achievements: botRes.unlocked,
        handsPlayed: botRes.nextStats.handsPlayed,
        handsWon: botRes.nextStats.handsWon,
        points: 1000 + botRes.nextStats.netChips + botRes.nextStats.handsWon * 20,
        explicitLevel: p.level,
      }).level;
      continue;
    }

    const outcome = leaderboard.recordHandOutcome({
      playerName: p.name,
      avatar: p.avatar,
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
      holeCards: p.holeCards,
      communityCardsCount: state.communityCards.length,
      wasSplitPot,
      isBigBlind,
      startingHandChips,
      reachedShowdown,
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
    p.level = computePlayerLevel({
      achievements: mergedPlayerAch,
      handsPlayed: outcome.entry.handsPlayed,
      handsWon: outcome.entry.handsWon,
      points: outcome.entry.points,
      explicitLevel: outcome.entry.level,
    }).level;

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

  // Optional DeepSeek bot showdown commentary (never mandatory; respectful cooldown & probability)
  if (ctx.botChatEnabled && state.players.some((p) => p.isBot)) {
    const isBigPot = state.pot >= state.bigBlind * 8;
    const chance = isBigPot ? 0.78 : 0.45;
    if (cryptoRng() < chance) {
      scheduleBotChatReaction(ctx, {
        kind: 'showdown',
        winnerNames: state.winners.map((w) => w.playerName),
        pot: state.pot,
      });
    }
  }
}

function broadcastRoomState(ctx: RoomContext): void {
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

  // Ensure busted AI practice bots can rebuy before evaluating next-hand eligibility (prevents 1v1 deadlock)
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

  const activePlayer = state.players.find((p) => p.id === state.currentTurnPlayerId);
  if (!activePlayer || !activePlayer.isBot) return;

  // Natural human-like thinking cadence (700ms - 1800ms)
  const thinkMs = 700 + crypto.randomInt(0, 1100);
  ctx.botTimer = setTimeout(() => {
    ctx.botTimer = null;
    if (state.currentTurnPlayerId !== activePlayer.id) return;
    const action = chooseBotAction(state, activePlayer.id, cryptoRng);
    const res = applyPlayerAction(state, activePlayer.id, action, Date.now(), { stepAllIn: true });
    if (res.ok) {
      broadcastRoomState(ctx);
    }
  }, thinkMs);
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
    ctx.seatSecrets.delete(playerId);
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
        ctx.seatSecrets.delete(playerId);
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
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Player-Id, X-Seat-Secret');
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

  const buildLinkedProfile = (
    lookupName: string | undefined,
    localAchievements?: unknown,
    localAchievementDates?: unknown
  ) => {
    const cleanName = (lookupName ?? '').trim();
    const lbProfile = cleanName ? leaderboard.getPlayerProfile(cleanName) : null;
    const hasLbRecord = Boolean(
      lbProfile && (lbProfile.handsPlayed > 0 || lbProfile.achievements.length > 0 || lbProfile.avatar)
    );
    const extraAchievements = sanitizeAchievementIds(localAchievements);
    const extraDates = sanitizeAchievementDates(localAchievementDates);
    const mergedAch = sanitizeAchievementIds([
      ...(hasLbRecord && lbProfile ? lbProfile.achievements : []),
      ...extraAchievements,
    ]);
    const mergedDates = {
      ...(hasLbRecord && lbProfile ? lbProfile.achievementDates : {}),
      ...extraDates,
    };
    if (!hasLbRecord && mergedAch.length === 0) return undefined;
    return {
      avatar: hasLbRecord ? lbProfile?.avatar : undefined,
      equippedAchievement: hasLbRecord ? lbProfile?.equippedAchievement : undefined,
      points: hasLbRecord ? lbProfile?.points : undefined,
      netChips: hasLbRecord ? lbProfile?.netChips : undefined,
      handsPlayed: hasLbRecord ? lbProfile?.handsPlayed : undefined,
      handsWon: hasLbRecord ? lbProfile?.handsWon : undefined,
      bestHandName: hasLbRecord ? lbProfile?.bestHandName : undefined,
      bestHandScore: hasLbRecord ? lbProfile?.bestHandScore : undefined,
      achievements: mergedAch,
      achievementDates: mergedDates,
      currentWinStreak: hasLbRecord ? lbProfile?.currentWinStreak : undefined,
      maxWinStreak: hasLbRecord ? lbProfile?.maxWinStreak : undefined,
    };
  };

  app.post('/api/auth/quick-login', (req, res) => {
    const { identifier, displayName, avatar, localAchievements, localAchievementDates } =
      req.body ?? {};
    const rawId = typeof identifier === 'string' ? identifier.trim() : '';
    const lookupName =
      typeof displayName === 'string' && displayName.trim()
        ? displayName.trim()
        : rawId.includes('@')
          ? rawId.split('@')[0]
          : rawId;
    const linked = buildLinkedProfile(lookupName, localAchievements, localAchievementDates);
    const result = authStore.quickLogin(
      rawId,
      {
        displayName: typeof displayName === 'string' ? displayName : undefined,
        avatar: typeof avatar === 'string' ? avatar : undefined,
      },
      linked
    );
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

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
    const { email, code, displayName, avatar, localAchievements, localAchievementDates } =
      req.body ?? {};
    const rawEmail = typeof email === 'string' ? email : '';
    const lookupName =
      typeof displayName === 'string' && displayName.trim()
        ? displayName.trim()
        : rawEmail.split('@')[0];
    const linked = buildLinkedProfile(lookupName, localAchievements, localAchievementDates);
    const result = authStore.verifyOtp(
      rawEmail,
      typeof code === 'string' ? code : '',
      {
        displayName: typeof displayName === 'string' ? displayName : undefined,
        avatar: typeof avatar === 'string' ? avatar : undefined,
      },
      Date.now(),
      linked
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
      res.status(401).json({ error: '登录状态已失效，请重新登录' });
      return;
    }
    const linked = buildLinkedProfile(profile.displayName);
    const hydrated = linked ? (authStore.mergeLinkedProfile(profile.uid, linked) ?? profile) : profile;
    res.json({ profile: hydrated });
  });

  app.patch('/api/auth/profile', (req, res) => {
    const token = extractBearerToken(req);
    const existing = authStore.verifySessionToken(token);
    if (!existing) {
      res.status(401).json({ error: '请先登录邮箱账号' });
      return;
    }
    const { displayName, avatar, bgmEnabled, equippedAchievement } = req.body ?? {};
    const updated = authStore.updatePreferences(existing.uid, {
      displayName: typeof displayName === 'string' ? displayName : undefined,
      avatar: typeof avatar === 'string' ? avatar : undefined,
      bgmEnabled: typeof bgmEnabled === 'boolean' ? bgmEnabled : undefined,
      equippedAchievement:
        equippedAchievement === null
          ? 'none'
          : sanitizeEquippedAchievement(equippedAchievement),
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
    const creatorId =
      typeof req.headers['x-player-id'] === 'string'
        ? req.headers['x-player-id'].trim().slice(0, 48)
        : null;
    const creatorSecret =
      typeof req.headers['x-seat-secret'] === 'string'
        ? req.headers['x-seat-secret'].trim().slice(0, 64)
        : null;
    const ctx = createCustomRoom({
      tableName,
      roomId,
      smallBlind,
      bigBlind,
      startingChips,
      creatorId,
      creatorSecret,
    });
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
    const id = normalizeRoomId(req.params.roomId);
    const ctx = rooms.get(id);
    if (!ctx) {
      res.status(404).json({ error: '牌桌不存在或已被删除' });
      return;
    }
    const requesterId =
      typeof req.headers['x-player-id'] === 'string'
        ? req.headers['x-player-id'].trim().slice(0, 48)
        : null;
    const requesterSecret =
      typeof req.headers['x-seat-secret'] === 'string'
        ? req.headers['x-seat-secret'].trim().slice(0, 64)
        : null;
    const authCheck = canRequesterDeleteRoom(ctx, requesterId, requesterSecret, true);
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

  app.get('/api/rooms/:roomId/bot-chat/status', (req, res) => {
    const id = normalizeRoomId(req.params.roomId);
    const ctx = rooms.get(id);
    if (!ctx) {
      res.status(404).json({ error: '牌桌不存在' });
      return;
    }
    res.json({ status: getBotChatStatus(ctx) });
  });

  app.post('/api/rooms/:roomId/bot-chat/config', async (req, res) => {
    const id = normalizeRoomId(req.params.roomId);
    const ctx = rooms.get(id);
    if (!ctx) {
      res.status(404).json({ error: '牌桌不存在' });
      return;
    }

    const requesterId =
      typeof req.headers['x-player-id'] === 'string'
        ? req.headers['x-player-id'].trim()
        : null;
    const requesterSecret =
      typeof req.headers['x-seat-secret'] === 'string'
        ? req.headers['x-seat-secret'].trim().slice(0, 64)
        : null;

    const seatedPlayer = requesterId
      ? ctx.state.players.find((p) => p.id === requesterId && !p.isBot)
      : null;
    if (!seatedPlayer || !requesterId) {
      res.status(403).json({ error: '仅在座玩家可配置当前牌桌的陪练对话' });
      return;
    }
    const storedSecret = ctx.seatSecrets.get(requesterId) ?? null;
    if (!storedSecret || !secretsMatch(storedSecret, requesterSecret)) {
      res.status(403).json({ error: '座位身份校验失败' });
      return;
    }

    const body = (req.body ?? {}) as {
      enabled?: unknown;
      apiKey?: unknown;
      clearKey?: unknown;
      testConnection?: unknown;
    };

    const nextClearKey = body.clearKey === true;
    const rawKey =
      typeof body.apiKey === 'string' ? body.apiKey.trim().slice(0, 160) : '';
    const nextEnabled =
      typeof body.enabled === 'boolean' ? body.enabled : ctx.botChatEnabled;

    const candidateKey = nextClearKey
      ? process.env.DEEPSEEK_API_KEY?.trim() || null
      : rawKey || getEffectiveDeepSeekKey(ctx);

    if (nextEnabled && !candidateKey) {
      res.status(400).json({ error: '启用陪练对话前，请先填入 DeepSeek API Key' });
      return;
    }

    // Optional connectivity check before saving a newly entered key
    if (body.testConnection === true && candidateKey) {
      try {
        await requestDeepSeekReply({
          apiKey: candidateKey,
          messages: [
            { role: 'system', content: '你是一名德州扑克牌友，只回复一个简短的打招呼表情或词。' },
            { role: 'user', content: '打个招呼' },
          ],
          timeoutMs: 8000,
        });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'DeepSeek 连通性校验失败',
        });
        return;
      }
    }

    if (nextClearKey) {
      ctx.deepseekApiKey = null;
    } else if (rawKey) {
      ctx.deepseekApiKey = rawKey;
    }

    ctx.botChatEnabled = nextEnabled && Boolean(getEffectiveDeepSeekKey(ctx));
    broadcastBotChatStatus(ctx);
    res.json({ ok: true, status: getBotChatStatus(ctx) });
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
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

  wss.on('connection', (ws) => {
    const session: ClientSession = {
      ws,
      isAlive: true,
      roomId: null,
      playerId: null,
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
          createCustomRoom({
            tableName: typeof msg.tableName === 'string' ? msg.tableName : undefined,
            roomId: typeof msg.roomId === 'string' ? msg.roomId : undefined,
            smallBlind: typeof msg.smallBlind === 'number' ? msg.smallBlind : undefined,
            bigBlind: typeof msg.bigBlind === 'number' ? msg.bigBlind : undefined,
            startingChips: typeof msg.startingChips === 'number' ? msg.startingChips : undefined,
          });
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
          const authCheck = canRequesterDeleteRoom(targetCtx, session.playerId);
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
          // Block impersonating AI bot seats via reserved bot_ prefix
          if (cleanId.startsWith('bot_')) {
            sendJson(ws, { type: 'error', message: '无效的玩家身份标识' });
            return;
          }

          const targetRoomId =
            normalizeRoomId(typeof msg.roomId === 'string' ? msg.roomId : 'CLUB01') || 'CLUB01';
          const ctx = getOrCreateRoom(targetRoomId);
          const existingPlayer = ctx.state.players.find((p) => p.id === cleanId);

          if (existingPlayer?.isBot) {
            sendJson(ws, { type: 'error', message: '不可接管陪练 AI 座位' });
            return;
          }

          const incomingSecret =
            typeof msg.seatSecret === 'string' ? msg.seatSecret.trim().slice(0, 64) : '';
          const storedSecret = ctx.seatSecrets.get(cleanId);

          if (existingPlayer) {
            // Verify seat ownership across both live sessions and the 15s disconnect grace window
            if (storedSecret && incomingSecret !== storedSecret) {
              sendJson(ws, { type: 'error', message: '该座位已被其他会话占用' });
              return;
            }
            if (!storedSecret) {
              // Legacy client without seatSecret: reject if another open socket holds this seat
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
              // Legitimate owner reconnecting: cleanly detach any stale/zombie socket so user never self-locks
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
          const incomingAvatar = sanitizeAvatar(
            typeof msg.avatar === 'string' ? msg.avatar : undefined
          );
          const resolvedAvatar =
            incomingAvatar !== 'default'
              ? incomingAvatar
              : profile.avatar
                ? sanitizeAvatar(profile.avatar)
                : 'default';
          const incomingEquipped = sanitizeEquippedAchievement(msg.equippedAchievement);
          const resolvedEquipped = incomingEquipped ?? profile.equippedAchievement;
          let leaderboardDirty = false;
          if (leaderboard.syncPlayerAvatar(cleanName, resolvedAvatar)) {
            leaderboardDirty = true;
          }
          if (leaderboard.syncPlayerEquippedAchievement(cleanName, resolvedEquipped)) {
            leaderboardDirty = true;
          }
          if (leaderboardDirty) {
            broadcastLeaderboard();
          }
          const resolvedLevel = computePlayerLevel({
            achievements: mergedAch,
            handsPlayed: profile.handsPlayed,
            handsWon: profile.handsWon,
            points: profile.points,
            explicitLevel: profile.level,
          }).level;
          const res = addPlayerToTable(ctx.state, {
            id: cleanId,
            name: cleanName,
            avatar: resolvedAvatar,
            achievements: mergedAch,
            achievementDates: mergedDates,
            equippedAchievement: resolvedEquipped,
            winStreak: profile.currentWinStreak,
            level: resolvedLevel,
          });

          if (!res.ok) {
            sendJson(ws, { type: 'error', message: res.error ?? '无法加入牌桌' });
            return;
          }

          if (incomingSecret && !ctx.seatSecrets.has(cleanId)) {
            ctx.seatSecrets.set(cleanId, incomingSecret);
          }

          session.roomId = targetRoomId;
          session.playerId = cleanId;
          broadcastRoomState(ctx);
          sendJson(ws, {
            type: 'chat_history',
            roomId: ctx.state.roomId,
            messages: ctx.chatHistory,
          });
          sendJson(ws, {
            type: 'bot_chat_status',
            roomId: ctx.state.roomId,
            status: getBotChatStatus(ctx),
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

        if (msg.type === 'update_profile') {
          const seatPlayer = ctx.state.players.find((p) => p.id === session.playerId && !p.isBot);
          if (!seatPlayer) return;
          let changed = false;
          let lbDirty = false;
          if (typeof msg.playerName === 'string') {
            const nextName = msg.playerName.trim().slice(0, 18);
            if (nextName && nextName !== seatPlayer.name) {
              seatPlayer.name = nextName;
              changed = true;
            }
          }
          if (typeof msg.avatar === 'string') {
            const nextAvatar = sanitizeAvatar(msg.avatar);
            if (nextAvatar !== seatPlayer.avatar) {
              seatPlayer.avatar = nextAvatar;
              changed = true;
              if (leaderboard.syncPlayerAvatar(seatPlayer.name, nextAvatar)) {
                lbDirty = true;
              }
            }
          }
          if (msg.equippedAchievement !== undefined) {
            const safeEquipped = sanitizeEquippedAchievement(msg.equippedAchievement);
            if (safeEquipped && safeEquipped !== seatPlayer.equippedAchievement) {
              seatPlayer.equippedAchievement = safeEquipped;
              changed = true;
              if (leaderboard.syncPlayerEquippedAchievement(seatPlayer.name, safeEquipped)) {
                lbDirty = true;
              }
            }
          }
          if (changed) broadcastRoomState(ctx);
          if (lbDirty) broadcastLeaderboard();
          return;
        }

        const isRoomHost = !ctx.state.hostId || ctx.state.hostId === session.playerId;

        if (msg.type === 'start_hand') {
          // Auto-rebuy busted AI bots BEFORE checking canStartHand (prevents 1v1 heads-up deadlock)
          autoRebuyBustedBots(ctx.state);
          if (!canStartHand(ctx.state)) {
            sendJson(ws, { type: 'error', message: '至少需要 2 名有筹码的玩家才能开始' });
            return;
          }
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
          if (target.isBot) {
            scheduleBotChatReaction(ctx, {
              kind: 'nudge',
              fromName: sender.name,
              targetBotId: target.id,
            });
          }
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
          const fallbackAvatar = botAvatarPool[ctx.state.players.length % botAvatarPool.length];
          const botPreset = getBotClubPreset(nextName);
          const lbBotProfile = leaderboard.getPlayerProfile(nextName);
          const botInit = botPreset ? buildBotInitialStats(botPreset) : null;
          const botAchievements = sanitizeAchievementIds([
            ...(lbBotProfile.achievements ?? []),
            ...(botInit?.achievements ?? []),
          ]);
          const botDates: AchievementDatesMap = {
            ...(botInit?.achievementDates ?? {}),
            ...(lbBotProfile.achievementDates ?? {}),
          };
          const botAvatar =
            (lbBotProfile.avatar && sanitizeAvatar(lbBotProfile.avatar) !== 'default'
              ? sanitizeAvatar(lbBotProfile.avatar)
              : botPreset?.avatar) ?? fallbackAvatar;
          const botLevel = computePlayerLevel({
            achievements: botAchievements,
            handsPlayed: Math.max(lbBotProfile.handsPlayed, botPreset?.handsPlayed ?? 0),
            handsWon: Math.max(lbBotProfile.handsWon, botPreset?.handsWon ?? 0),
            points: lbBotProfile.handsPlayed > 0 ? lbBotProfile.points : (botPreset?.points ?? 1000),
            explicitLevel: Math.max(lbBotProfile.level, botInit?.level ?? 1),
          }).level;
          const botWinStreak = Math.max(
            lbBotProfile.currentWinStreak,
            botPreset?.currentWinStreak ?? 0
          );
          if (botInit) {
            ctx.botStats.set(botId, {
              stats: botInit.stats,
              achievements: botAchievements,
              achievementDates: botDates,
            });
          }
          const added = addPlayerToTable(ctx.state, {
            id: botId,
            name: nextName,
            avatar: botAvatar,
            achievements: botAchievements,
            achievementDates: botDates,
            winStreak: botWinStreak,
            level: botLevel,
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
          scheduleBotChatReaction(ctx, {
            kind: 'player_chat',
            senderName: player.name,
            text: cleanText,
          });
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
  setInterval(() => {
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
