import type express from 'express';
import { BOT_PERSONALITY_PROFILES } from '../botAi';
import { evaluateGtoSpotWithCoach, type GtoCoachRequest } from '../gtoCoach';
import { auditSessionGtoLeaks, solveGtoSpotServer, solveNodeLockServer } from '../gtoSolver';
import { generateHandReview } from '../handReview';
import type { EmailAuthStore } from '../authStore';
import type { LeaderboardStore } from '../leaderboard';
import type { SessionOpponentProfiler } from '../opponentProfiler';
import { analyzePlayerPersonaWithGemini } from '../personaAi';
import type { SlidingWindowRateLimiter } from '../rateLimiter';
import { secretsMatch } from '../roomAuth';
import { sanitizeBehaviorStats, type PlayerBehaviorStats } from '../../src/shared/playerInsights';
import type { TableState } from '../../src/shared/types';

export interface GtoRouteRoomView {
  state: TableState;
  seatSecrets: Map<string, string>;
  opponentProfiler: SessionOpponentProfiler;
}

export interface RegisterGtoRoutesDeps {
  app: express.Express;
  getClientIp: (req: express.Request) => string;
  extractBearerToken: (req: express.Request) => string | null;
  normalizeRoomId: (raw?: string) => string;
  getRoom: (roomId: string) => GtoRouteRoomView | undefined;
  gtoEvalLimiter: SlidingWindowRateLimiter;
  personaAiLimiter: SlidingWindowRateLimiter;
  authStore: EmailAuthStore;
  leaderboard: LeaderboardStore;
  onRateLimitRejected: () => void;
}

export function registerGtoAndPersonaRoutes(deps: RegisterGtoRoutesDeps): void {
  const {
    app,
    getClientIp,
    extractBearerToken,
    normalizeRoomId,
    getRoom,
    gtoEvalLimiter,
    personaAiLimiter,
    authStore,
    leaderboard,
    onRateLimitRejected,
  } = deps;

  app.get('/api/bot/profiles', (_req, res) => {
    res.json({ profiles: BOT_PERSONALITY_PROFILES });
  });

  app.post('/api/gto/evaluate', async (req, res) => {
    const ip = getClientIp(req);
    const rate = gtoEvalLimiter.consume(ip);
    if (!rate.allowed) {
      onRateLimitRejected();
      res.status(429).json({
        ok: false,
        code: 'SOLVER_RATE_LIMITED',
        error: `GTO 评估请求过于频繁，请 ${rate.retryAfterSec} 秒后再试`,
      });
      return;
    }
    const rawBody = (req.body ?? {}) as GtoCoachRequest;
    let opponentRead = rawBody.opponentRead ?? null;
    let exploitPlan = rawBody.exploitPlan ?? null;
    if (rawBody.roomId && rawBody.opponentId) {
      const ctx = getRoom(normalizeRoomId(rawBody.roomId));
      if (ctx) {
        opponentRead = ctx.opponentProfiler.getOpponentRead(rawBody.opponentId);
        exploitPlan = ctx.opponentProfiler.buildExploitPlan(rawBody.opponentId);
      }
    }
    const result = await evaluateGtoSpotWithCoach({
      ...rawBody,
      opponentRead,
      exploitPlan,
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/gto/spot-analysis', async (req, res) => {
    const ip = getClientIp(req);
    const rate = gtoEvalLimiter.consume(ip);
    if (!rate.allowed) {
      onRateLimitRejected();
      res.status(429).json({
        ok: false,
        code: 'SOLVER_RATE_LIMITED',
        error: `GTO 矩阵求解过于频繁，请 ${rate.retryAfterSec} 秒后再试`,
      });
      return;
    }
    const roomId = typeof req.body?.roomId === 'string' ? normalizeRoomId(req.body.roomId) : '';
    const ctx = roomId ? getRoom(roomId) ?? null : null;
    const result = await solveGtoSpotServer(req.body, {
      profiler: ctx?.opponentProfiler ?? null,
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/gto/node-lock', async (req, res) => {
    const ip = getClientIp(req);
    const rate = gtoEvalLimiter.consume(ip);
    if (!rate.allowed) {
      onRateLimitRejected();
      res.status(429).json({
        ok: false,
        code: 'SOLVER_RATE_LIMITED',
        error: `Node-Lock 推演过于频繁，请 ${rate.retryAfterSec} 秒后再试`,
      });
      return;
    }
    const roomId =
      typeof req.body?.spotRequest?.roomId === 'string'
        ? normalizeRoomId(req.body.spotRequest.roomId)
        : '';
    const ctx = roomId ? getRoom(roomId) ?? null : null;
    const result = await solveNodeLockServer(req.body, {
      profiler: ctx?.opponentProfiler ?? null,
    });
    if (!result.ok) {
      res.status(result.statusCode ?? 400).json({
        ok: false,
        code: result.code ?? 'INVALID_SPOT_STATE',
        error: result.error ?? 'Node-Lock 求解失败',
      });
      return;
    }
    res.json({
      ok: true,
      source: result.source,
      exploit: result.exploit,
    });
  });

  app.post('/api/gto/session-audit', (req, res) => {
    const ip = getClientIp(req);
    const rate = gtoEvalLimiter.consume(ip);
    if (!rate.allowed) {
      onRateLimitRejected();
      res.status(429).json({
        ok: false,
        code: 'SOLVER_RATE_LIMITED',
        error: `整场 EV 审计请求过于频繁，请 ${rate.retryAfterSec} 秒后再试`,
      });
      return;
    }
    const roomId = typeof req.body?.roomId === 'string' ? normalizeRoomId(req.body.roomId) : '';
    const playerId =
      typeof req.body?.playerId === 'string' && req.body.playerId.trim()
        ? req.body.playerId.trim().slice(0, 48)
        : typeof req.headers['x-player-id'] === 'string'
          ? req.headers['x-player-id'].trim().slice(0, 48)
          : '';
    const seatSecret =
      typeof req.body?.seatSecret === 'string' && req.body.seatSecret.trim()
        ? req.body.seatSecret.trim().slice(0, 64)
        : typeof req.headers['x-seat-secret'] === 'string'
          ? req.headers['x-seat-secret'].trim().slice(0, 64)
          : '';

    const ctx = roomId ? getRoom(roomId) : undefined;
    if (!ctx) {
      res.status(404).json({ ok: false, error: '牌桌不存在或已关闭' });
      return;
    }
    if (!playerId) {
      res.status(400).json({ ok: false, error: '缺少玩家标识 (playerId)' });
      return;
    }

    const requestedSet = Array.isArray(req.body?.handNumbers)
      ? new Set(
          req.body.handNumbers
            .filter((n: unknown): n is number => typeof n === 'number' && Number.isFinite(n))
            .map((n: number) => Math.floor(n))
        )
      : null;

    const heroHands = ctx.state.handHistory.filter(
      (h) =>
        h.players.some((pl) => pl.id === playerId) &&
        (!requestedSet || requestedSet.size === 0 || requestedSet.has(h.handNumber))
    );
    if (heroHands.length === 0) {
      res.status(404).json({ ok: false, error: '暂无可供审计的手牌记录' });
      return;
    }

    const storedSecret = ctx.seatSecrets.get(playerId) ?? null;
    const isVerifiedOwner = Boolean(storedSecret) && secretsMatch(storedSecret, seatSecret);

    const reports: Array<NonNullable<ReturnType<typeof generateHandReview>>> = [];
    for (const record of heroHands) {
      const safeRecord = {
        ...record,
        players: record.players.map((pl) => ({
          ...pl,
          holeCards:
            pl.id === playerId
              ? isVerifiedOwner || pl.revealed
                ? pl.holeCards
                : null
              : pl.revealed
                ? pl.holeCards
                : null,
        })),
      };
      const rep = generateHandReview({
        record: safeRecord,
        heroId: playerId,
        startingChips: ctx.state.startingChips,
        profiler: ctx.opponentProfiler,
      });
      if (rep) reports.push(rep);
    }

    res.json(auditSessionGtoLeaks(reports));
  });

  app.get('/api/rooms/:roomId/opponent-profiles', (req, res) => {
    const id = normalizeRoomId(req.params.roomId);
    const ctx = getRoom(id);
    if (!ctx) {
      res.status(404).json({ ok: false, error: '牌桌不存在或已关闭' });
      return;
    }
    const nameMap = new Map(ctx.state.players.map((p) => [p.id, { name: p.name, isBot: p.isBot }]));
    const profiles = ctx.opponentProfiler.getAllReads().map(({ read, exploitPlan }) => ({
      playerId: read.playerId,
      playerName: nameMap.get(read.playerId)?.name ?? read.playerId,
      isBot: nameMap.get(read.playerId)?.isBot ?? false,
      read,
      exploitPlan,
    }));
    res.json({ ok: true, roomId: id, profiles });
  });

  app.post('/api/persona/analyze', async (req, res) => {
    const ip = getClientIp(req);
    const rate = personaAiLimiter.consume(ip);
    if (!rate.allowed) {
      onRateLimitRejected();
      res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        error: `AI 画像分析请求过于频繁，请 ${rate.retryAfterSec} 秒后再试`,
      });
      return;
    }

    const token = extractBearerToken(req);
    const authProfile = token ? authStore.verifySessionToken(token) : null;
    const rawName =
      typeof req.body?.playerName === 'string'
        ? req.body.playerName.trim().slice(0, 24)
        : '';
    const resolvedName = rawName || authProfile?.displayName || '牌手';
    const lbProfile = resolvedName ? leaderboard.getPlayerProfile(resolvedName) : null;
    const bodyStats = req.body?.behaviorStats
      ? sanitizeBehaviorStats(req.body.behaviorStats)
      : null;

    const candidates = [
      authProfile?.behaviorStats ? sanitizeBehaviorStats(authProfile.behaviorStats) : null,
      lbProfile?.behaviorStats ? sanitizeBehaviorStats(lbProfile.behaviorStats) : null,
      bodyStats,
    ].filter((x): x is PlayerBehaviorStats => Boolean(x));

    const bestStats = candidates.sort((a, b) => b.handsPlayed - a.handsPlayed)[0] ?? null;

    const result = await analyzePlayerPersonaWithGemini({
      playerName: resolvedName,
      behaviorStats: bestStats,
      deepseekApiKey: process.env.DEEPSEEK_API_KEY,
      deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL,
      deepseekModel: process.env.DEEPSEEK_MODEL,
    });

    if (!result.ok) {
      const statusCode =
        result.code === 'NO_DATA'
          ? 400
          : result.code === 'RATE_LIMITED'
            ? 429
            : result.code === 'MISSING_API_KEY' ||
                result.code === 'API_KEY_INVALID' ||
                result.code === 'UPSTREAM_ERROR'
              ? 503
              : 500;
      res.status(statusCode).json(result);
      return;
    }

    res.json(result);
  });
}
