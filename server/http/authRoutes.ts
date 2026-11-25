import type express from 'express';
import type { EmailAuthStore } from '../authStore';
import type { LeaderboardStore } from '../leaderboard';
import type { SlidingWindowRateLimiter } from '../rateLimiter';
import { sanitizeEquippedAchievement } from '../../src/shared/achievements';

export interface RegisterAuthRoutesDeps {
  app: express.Express;
  getClientIp: (req: express.Request) => string;
  extractBearerToken: (req: express.Request) => string | null;
  otpSendLimiter: SlidingWindowRateLimiter;
  otpVerifyLimiter: SlidingWindowRateLimiter;
  authStore: EmailAuthStore;
  leaderboard: LeaderboardStore;
  onRateLimitRejected: () => void;
}

export function registerAuthRoutes(deps: RegisterAuthRoutesDeps): void {
  const {
    app,
    getClientIp,
    extractBearerToken,
    otpSendLimiter,
    otpVerifyLimiter,
    authStore,
    leaderboard,
    onRateLimitRejected,
  } = deps;

  /**
   * Resolves authoritative leaderboard stats strictly by verified account UID
   * (never trusts client-submitted achievement arrays or arbitrary nickname lookups).
   */
  const buildLinkedProfileByUid = (uid: string) => {
    const lbProfile = leaderboard.getPlayerProfileByUid(uid);
    if (!lbProfile) return undefined;
    const hasLbRecord = Boolean(
      lbProfile.handsPlayed > 0 || lbProfile.achievements.length > 0 || lbProfile.avatar
    );
    if (!hasLbRecord) return undefined;
    return {
      avatar: lbProfile.avatar,
      equippedAchievement: lbProfile.equippedAchievement,
      points: lbProfile.points,
      netChips: lbProfile.netChips,
      handsPlayed: lbProfile.handsPlayed,
      handsWon: lbProfile.handsWon,
      bestHandName: lbProfile.bestHandName,
      bestHandScore: lbProfile.bestHandScore,
      achievements: lbProfile.achievements,
      achievementDates: lbProfile.achievementDates,
      currentWinStreak: lbProfile.currentWinStreak,
      maxWinStreak: lbProfile.maxWinStreak,
    };
  };

  app.post('/api/auth/quick-login', (_req, res) => {
    res.status(410).json({
      ok: false,
      error: '已启用纯邮箱验证码登录，请使用邮箱验证码完成登录',
    });
  });

  app.post('/api/auth/send-code', async (req, res) => {
    const ip = getClientIp(req);
    const rate = otpSendLimiter.consume(ip);
    if (!rate.allowed) {
      onRateLimitRejected();
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
      onRateLimitRejected();
      res.status(429).json({
        ok: false,
        error: `验证过于频繁，请 ${rate.retryAfterSec} 秒后再试`,
      });
      return;
    }
    const { email, code, displayName, avatar } = req.body ?? {};
    const rawEmail = typeof email === 'string' ? email : '';
    const result = authStore.verifyOtp(
      rawEmail,
      typeof code === 'string' ? code : '',
      {
        displayName: typeof displayName === 'string' ? displayName : undefined,
        avatar: typeof avatar === 'string' ? avatar : undefined,
      },
      Date.now()
    );
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    if (result.profile) {
      const linked = buildLinkedProfileByUid(result.profile.uid);
      if (linked) {
        result.profile = authStore.mergeLinkedProfile(result.profile.uid, linked) ?? result.profile;
      }
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
    const linked = buildLinkedProfileByUid(profile.uid);
    const hydrated = linked
      ? (authStore.mergeLinkedProfile(profile.uid, linked) ?? profile)
      : profile;
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
}
