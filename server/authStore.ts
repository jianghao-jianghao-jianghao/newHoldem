import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Transporter } from 'nodemailer';
import {
  applyHandToAchievementStats,
  createEmptyAchievementStats,
  mergeAchievementDates,
  sanitizeAchievementDates,
  sanitizeAchievementIds,
  sanitizeEquippedAchievement,
  type AchievementDatesMap,
  type AchievementId,
  type EquippedAchievementPref,
  type PlayerAchievementStats,
} from '../src/shared/achievements';
import { MAX_CUSTOM_AVATAR_BYTES, sanitizeAvatar } from '../src/shared/avatarUtils';
import type { Card, HandCategory, LeaderboardEntry } from '../src/shared/types';
import { getSharedDatabase, resolveDataDir, type HoldemDatabase } from './db';

export interface EmailAccountProfile {
  uid: string;
  email: string;
  displayName: string;
  avatar: string;
  points: number;
  netChips: number;
  handsPlayed: number;
  handsWon: number;
  bestHandName: string;
  bestHandScore: number;
  achievements: AchievementId[];
  achievementDates: AchievementDatesMap;
  equippedAchievement?: EquippedAchievementPref;
  currentWinStreak: number;
  maxWinStreak: number;
  bgmEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LinkedAchievementProfile {
  avatar?: string;
  equippedAchievement?: EquippedAchievementPref;
  points?: number;
  netChips?: number;
  handsPlayed?: number;
  handsWon?: number;
  bestHandName?: string;
  bestHandScore?: number;
  achievements?: AchievementId[];
  achievementDates?: AchievementDatesMap;
  currentWinStreak?: number;
  maxWinStreak?: number;
}

interface InternalAccountRecord extends EmailAccountProfile {
  tokenVersion: number;
  stats: PlayerAchievementStats;
}

interface PendingOtpRecord {
  email: string;
  salt: string;
  codeHash: string;
  expiresAt: number;
  requestedAt: number;
  attemptsLeft: number;
}

export type OtpDeliveryMode = 'email' | 'preview';

export interface RequestOtpResult {
  ok: boolean;
  error?: string;
  retryAfterSec?: number;
  expiresInSec?: number;
  deliveryMode?: OtpDeliveryMode;
  previewCode?: string;
}

export interface VerifyOtpResult {
  ok: boolean;
  error?: string;
  token?: string;
  profile?: EmailAccountProfile;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

let cachedSmtpKey: string | null = null;
let cachedSmtpTransport: Transporter | null = null;

function getLegacyAccountsFile(): string {
  return path.join(resolveDataDir(), 'accounts.json');
}

function getSessionSecretFile(): string {
  return path.join(resolveDataDir(), '.session_secret');
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 160);
}

export function isValidEmail(email: string): boolean {
  return email.length >= 5 && email.length <= 160 && EMAIL_RE.test(email);
}

function clampName(val: string | undefined, fallback: string): string {
  const cleaned = (val ?? '').trim();
  if (!cleaned) return fallback;
  return Array.from(cleaned).slice(0, 32).join('');
}

function clampAvatar(raw: string | undefined): string {
  const safe = sanitizeAvatar(raw);
  return safe.length <= MAX_CUSTOM_AVATAR_BYTES ? safe : 'default';
}

function hashOtp(salt: string, code: string): string {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function toPublicProfile(rec: InternalAccountRecord): EmailAccountProfile {
  return {
    uid: rec.uid,
    email: rec.email,
    displayName: rec.displayName,
    avatar: rec.avatar,
    points: rec.points,
    netChips: rec.netChips,
    handsPlayed: rec.handsPlayed,
    handsWon: rec.handsWon,
    bestHandName: rec.bestHandName,
    bestHandScore: rec.bestHandScore,
    achievements: rec.achievements,
    achievementDates: rec.achievementDates,
    equippedAchievement: rec.equippedAchievement,
    currentWinStreak: rec.currentWinStreak,
    maxWinStreak: rec.maxWinStreak,
    bgmEnabled: rec.bgmEnabled,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

function resolveSessionSecret(customSecret?: string): string {
  if (customSecret && customSecret.trim().length >= 16) {
    return customSecret.trim();
  }
  const envSecret = process.env.AUTH_SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }
  try {
    const dataDir = resolveDataDir();
    const secretFile = getSessionSecretFile();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (fs.existsSync(secretFile)) {
      const stored = fs.readFileSync(secretFile, 'utf-8').trim();
      if (stored.length >= 32) return stored;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, generated, { encoding: 'utf-8', mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

async function deliverOtpEmail(
  toEmail: string,
  code: string
): Promise<{ delivered: boolean; mode: OtpDeliveryMode }> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress =
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "Velvet Hold'em <noreply@velvetholdem.local>";

  const subject = `Velvet Hold'em 登录验证码：${code}`;
  const textBody = `您的 Velvet Hold'em 邮箱登录验证码为：${code}（10 分钟内有效，请勿泄露给他人）。`;
  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#090B0C; color:#F3F1EC; padding:28px; border-radius:8px; max-width:460px;">
      <div style="font-size:13px; letter-spacing:0.12em; color:#D4A853; font-weight:700; margin-bottom:12px;">VELVET HOLD'EM</div>
      <h2 style="margin:0 0 10px; font-size:18px; color:#F3F1EC;">邮箱登录验证码</h2>
      <p style="margin:0 0 18px; font-size:13px; color:#9DA7A2; line-height:1.6;">请输入以下 6 位数字验证码完成登录，10 分钟内有效：</p>
      <div style="background:#111615; border:1px solid rgba(212,168,83,0.45); border-radius:6px; padding:16px; text-align:center; font-size:30px; font-weight:700; letter-spacing:0.28em; color:#F5E4B8; font-family:monospace;">
        ${code}
      </div>
      <p style="margin:16px 0 0; font-size:11px; color:#6F7873;">如非本人操作，请忽略此邮件。</p>
    </div>
  `;

  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [toEmail],
        subject,
        text: textBody,
        html: htmlBody,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Resend 邮件发送失败 (${res.status}): ${errText || '未知错误'}`);
    }
    return { delivered: true, mode: 'email' };
  }

  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  if (smtpHost && smtpUser && smtpPass) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const key = `${smtpHost}:${port}:${smtpUser}`;
    if (!cachedSmtpTransport || cachedSmtpKey !== key) {
      const { default: nodemailer } = await import('nodemailer');
      cachedSmtpKey = key;
      cachedSmtpTransport = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: port === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
    }
    await cachedSmtpTransport.sendMail({
      from: fromAddress,
      to: toEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });
    return { delivered: true, mode: 'email' };
  }

  return { delivered: false, mode: 'preview' };
}

export interface AuthStoreOptions {
  database?: HoldemDatabase;
  legacyJsonFile?: string;
  sessionSecret?: string;
  disableDiskPersistence?: boolean;
  emailSender?: (email: string, code: string) => Promise<{ delivered: boolean; mode: OtpDeliveryMode }>;
}

export class EmailAuthStore {
  private accountsByEmail = new Map<string, InternalAccountRecord>();
  private accountsByUid = new Map<string, InternalAccountRecord>();
  private pendingOtps = new Map<string, PendingOtpRecord>();
  private readonly holdemDb: HoldemDatabase | null;
  private readonly legacyJsonFile: string;
  private readonly sessionSecret: string;
  private readonly emailSender: (
    email: string,
    code: string
  ) => Promise<{ delivered: boolean; mode: OtpDeliveryMode }>;

  constructor(options: AuthStoreOptions = {}) {
    this.legacyJsonFile = options.legacyJsonFile ?? getLegacyAccountsFile();
    this.holdemDb = options.disableDiskPersistence
      ? null
      : (options.database ?? getSharedDatabase());
    this.sessionSecret = resolveSessionSecret(options.sessionSecret);
    this.emailSender = options.emailSender ?? deliverOtpEmail;
    if (this.holdemDb) {
      this.loadFromDb();
    }
  }

  private loadFromDb(): void {
    if (!this.holdemDb) return;
    try {
      const rows = this.holdemDb.db
        .prepare('SELECT * FROM accounts')
        .all() as Array<Record<string, unknown>>;

      if (rows.length === 0) {
        this.migrateLegacyJsonIfPresent();
        return;
      }

      for (const row of rows) {
        const email = normalizeEmail(String(row.email ?? ''));
        const uid = String(row.uid ?? '');
        if (!email || !uid) continue;

        let parsedAch: unknown = [];
        let parsedDates: unknown = {};
        let parsedStats: PlayerAchievementStats | null = null;
        try {
          parsedAch = JSON.parse(String(row.achievements_json ?? '[]'));
        } catch {
          parsedAch = [];
        }
        try {
          parsedDates = JSON.parse(String(row.achievement_dates_json ?? '{}'));
        } catch {
          parsedDates = {};
        }
        try {
          if (row.stats_json) {
            parsedStats = JSON.parse(String(row.stats_json)) as PlayerAchievementStats;
          }
        } catch {
          parsedStats = null;
        }

        const handsPlayed = Number(row.hands_played) || 0;
        const handsWon = Number(row.hands_won) || 0;
        const currentWinStreak = Number(row.current_win_streak) || 0;
        const maxWinStreak = Number(row.max_win_streak) || 0;
        const netChips = Number(row.net_chips) || 0;

        const rec: InternalAccountRecord = {
          uid,
          email,
          displayName: clampName(String(row.display_name ?? ''), email.split('@')[0] || '牌手'),
          avatar: clampAvatar(String(row.avatar ?? 'default')),
          points: Number(row.points) || 1000,
          netChips,
          handsPlayed,
          handsWon,
          bestHandName: clampName(String(row.best_hand_name ?? '高牌'), '高牌'),
          bestHandScore: Number(row.best_hand_score) || 0,
          achievements: sanitizeAchievementIds(parsedAch),
          achievementDates: sanitizeAchievementDates(parsedDates),
          equippedAchievement: sanitizeEquippedAchievement(row.equipped_achievement),
          currentWinStreak,
          maxWinStreak,
          bgmEnabled: Number(row.bgm_enabled) !== 0,
          tokenVersion: Math.max(1, Number(row.token_version) || 1),
          stats: parsedStats ?? {
            ...createEmptyAchievementStats(),
            handsPlayed,
            handsWon,
            currentWinStreak,
            maxWinStreak,
            netChips,
          },
          createdAt: Number(row.created_at) || Date.now(),
          updatedAt: Number(row.updated_at) || Date.now(),
        };
        this.accountsByEmail.set(email, rec);
        this.accountsByUid.set(uid, rec);
      }
    } catch (err) {
      console.error('[AuthStore] Failed to load SQLite accounts:', err);
    }
  }

  private migrateLegacyJsonIfPresent(): void {
    try {
      if (!fs.existsSync(this.legacyJsonFile)) return;
      const raw = fs.readFileSync(this.legacyJsonFile, 'utf-8');
      const parsed = JSON.parse(raw) as EmailAccountProfile[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;

      for (const acc of parsed) {
        if (!acc || typeof acc.email !== 'string' || typeof acc.uid !== 'string') continue;
        const email = normalizeEmail(acc.email);
        const rec: InternalAccountRecord = {
          uid: acc.uid,
          email,
          displayName: clampName(acc.displayName, email.split('@')[0] || '牌手'),
          avatar: clampAvatar(acc.avatar),
          points: typeof acc.points === 'number' ? acc.points : 1000,
          netChips: typeof acc.netChips === 'number' ? acc.netChips : 0,
          handsPlayed: typeof acc.handsPlayed === 'number' ? Math.floor(acc.handsPlayed) : 0,
          handsWon: typeof acc.handsWon === 'number' ? Math.floor(acc.handsWon) : 0,
          bestHandName: clampName(acc.bestHandName, '高牌'),
          bestHandScore: typeof acc.bestHandScore === 'number' ? acc.bestHandScore : 0,
          achievements: sanitizeAchievementIds(acc.achievements),
          achievementDates: sanitizeAchievementDates(acc.achievementDates),
          equippedAchievement: sanitizeEquippedAchievement(acc.equippedAchievement),
          currentWinStreak:
            typeof acc.currentWinStreak === 'number' ? Math.floor(acc.currentWinStreak) : 0,
          maxWinStreak: typeof acc.maxWinStreak === 'number' ? Math.floor(acc.maxWinStreak) : 0,
          bgmEnabled: acc.bgmEnabled !== false,
          tokenVersion: 1,
          stats: {
            ...createEmptyAchievementStats(),
            handsPlayed: typeof acc.handsPlayed === 'number' ? Math.floor(acc.handsPlayed) : 0,
            handsWon: typeof acc.handsWon === 'number' ? Math.floor(acc.handsWon) : 0,
            currentWinStreak:
              typeof acc.currentWinStreak === 'number' ? Math.floor(acc.currentWinStreak) : 0,
            maxWinStreak: typeof acc.maxWinStreak === 'number' ? Math.floor(acc.maxWinStreak) : 0,
            netChips: typeof acc.netChips === 'number' ? acc.netChips : 0,
          },
          createdAt: typeof acc.createdAt === 'number' ? acc.createdAt : Date.now(),
          updatedAt: typeof acc.updatedAt === 'number' ? acc.updatedAt : Date.now(),
        };
        this.accountsByEmail.set(email, rec);
        this.accountsByUid.set(rec.uid, rec);
        this.persistAccount(rec);
      }
    } catch {
      // Ignore corrupt legacy file
    }
  }

  private persistAccount(rec: InternalAccountRecord): void {
    if (!this.holdemDb) return;
    try {
      this.holdemDb.db
        .prepare(
          `INSERT INTO accounts (
            uid, email, display_name, avatar, points, net_chips,
            hands_played, hands_won, best_hand_name, best_hand_score,
            achievements_json, achievement_dates_json, equipped_achievement,
            current_win_streak, max_win_streak, stats_json, bgm_enabled,
            token_version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(uid) DO UPDATE SET
            display_name = excluded.display_name,
            avatar = excluded.avatar,
            points = excluded.points,
            net_chips = excluded.net_chips,
            hands_played = excluded.hands_played,
            hands_won = excluded.hands_won,
            best_hand_name = excluded.best_hand_name,
            best_hand_score = excluded.best_hand_score,
            achievements_json = excluded.achievements_json,
            achievement_dates_json = excluded.achievement_dates_json,
            equipped_achievement = excluded.equipped_achievement,
            current_win_streak = excluded.current_win_streak,
            max_win_streak = excluded.max_win_streak,
            stats_json = excluded.stats_json,
            bgm_enabled = excluded.bgm_enabled,
            token_version = excluded.token_version,
            updated_at = excluded.updated_at`
        )
        .run(
          rec.uid,
          rec.email,
          rec.displayName,
          rec.avatar,
          rec.points,
          rec.netChips,
          rec.handsPlayed,
          rec.handsWon,
          rec.bestHandName,
          rec.bestHandScore,
          JSON.stringify(rec.achievements),
          JSON.stringify(rec.achievementDates),
          rec.equippedAchievement ?? null,
          rec.currentWinStreak,
          rec.maxWinStreak,
          JSON.stringify(rec.stats),
          rec.bgmEnabled ? 1 : 0,
          rec.tokenVersion,
          rec.createdAt,
          rec.updatedAt
        );
    } catch (err) {
      console.error('[AuthStore] Failed to persist account:', err);
    }
  }

  public pruneExpiredOtps(now: number = Date.now()): void {
    for (const [email, rec] of this.pendingOtps.entries()) {
      if (now > rec.expiresAt) {
        this.pendingOtps.delete(email);
      }
    }
  }

  public getProfileByUid(uid: string): EmailAccountProfile | null {
    const rec = this.accountsByUid.get(uid);
    return rec ? toPublicProfile(rec) : null;
  }

  public async requestOtp(rawEmail: string, now: number = Date.now()): Promise<RequestOtpResult> {
    this.pruneExpiredOtps(now);
    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) {
      return { ok: false, error: '请输入有效的邮箱地址' };
    }

    const existing = this.pendingOtps.get(email);
    if (existing && now - existing.requestedAt < OTP_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((OTP_COOLDOWN_MS - (now - existing.requestedAt)) / 1000);
      return {
        ok: false,
        error: `验证码发送过于频繁，请 ${retryAfterSec} 秒后再试`,
        retryAfterSec,
      };
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = hashOtp(salt, code);

    this.pendingOtps.set(email, {
      email,
      salt,
      codeHash,
      expiresAt: now + OTP_TTL_MS,
      requestedAt: now,
      attemptsLeft: OTP_MAX_ATTEMPTS,
    });

    try {
      const delivery = await this.emailSender(email, code);
      if (delivery.mode === 'preview') {
        if (process.env.NODE_ENV === 'production' && process.env.ALLOW_OTP_PREVIEW !== 'true') {
          this.pendingOtps.delete(email);
          return {
            ok: false,
            error: '邮件服务未配置，请联系管理员设置 SMTP 或 Resend 环境变量',
          };
        }
        console.log(`[AuthOTP Preview] ${email} -> ${code}`);
        return {
          ok: true,
          expiresInSec: OTP_TTL_MS / 1000,
          deliveryMode: 'preview',
          previewCode: code,
        };
      }
      return {
        ok: true,
        expiresInSec: OTP_TTL_MS / 1000,
        deliveryMode: 'email',
      };
    } catch (err) {
      this.pendingOtps.delete(email);
      return {
        ok: false,
        error: err instanceof Error ? err.message : '验证码发送失败，请稍后重试',
      };
    }
  }

  public mergeLinkedProfile(
    uid: string,
    linked: LinkedAchievementProfile | undefined,
    now: number = Date.now()
  ): EmailAccountProfile | null {
    const profile = this.accountsByUid.get(uid);
    if (!profile || !linked) return profile ? toPublicProfile(profile) : null;

    let changed = false;
    const incomingAch = sanitizeAchievementIds(linked.achievements ?? []);
    if (incomingAch.length > 0) {
      const mergedAch = sanitizeAchievementIds([...profile.achievements, ...incomingAch]);
      const newlyAdded = mergedAch.filter((id) => !profile.achievements.includes(id));
      const mergedDates = mergeAchievementDates(
        { ...profile.achievementDates, ...sanitizeAchievementDates(linked.achievementDates) },
        mergedAch,
        newlyAdded,
        now
      );
      if (
        mergedAch.length !== profile.achievements.length ||
        Object.keys(mergedDates).length !== Object.keys(profile.achievementDates).length
      ) {
        profile.achievements = mergedAch;
        profile.achievementDates = mergedDates;
        changed = true;
      }
    }

    if (!profile.equippedAchievement && linked.equippedAchievement) {
      const safeEq = sanitizeEquippedAchievement(linked.equippedAchievement);
      if (safeEq) {
        profile.equippedAchievement = safeEq;
        changed = true;
      }
    }

    if (profile.avatar === 'default' && linked.avatar && linked.avatar !== 'default') {
      profile.avatar = clampAvatar(linked.avatar);
      changed = true;
    }

    const linkedHands = Math.max(0, Math.floor(linked.handsPlayed ?? 0));
    const linkedWon = Math.min(linkedHands, Math.max(0, Math.floor(linked.handsWon ?? 0)));
    if (linkedHands > profile.handsPlayed) {
      profile.handsPlayed = linkedHands;
      profile.handsWon = Math.max(profile.handsWon, linkedWon);
      if (typeof linked.points === 'number' && Number.isFinite(linked.points)) {
        profile.points = Math.max(0, Math.min(100_000_000, Math.floor(linked.points)));
      }
      if (typeof linked.netChips === 'number' && Number.isFinite(linked.netChips)) {
        profile.netChips = Math.max(-10_000_000, Math.min(100_000_000, Math.floor(linked.netChips)));
      }
      changed = true;
    } else if (
      typeof linked.points === 'number' &&
      Number.isFinite(linked.points) &&
      linked.points > profile.points
    ) {
      profile.points = Math.min(100_000_000, Math.floor(linked.points));
      changed = true;
    }

    const linkedCurrentStreak = Math.max(0, Math.floor(linked.currentWinStreak ?? 0));
    const linkedMaxStreak = Math.max(linkedCurrentStreak, Math.floor(linked.maxWinStreak ?? 0));
    if (linkedMaxStreak > profile.maxWinStreak) {
      profile.maxWinStreak = linkedMaxStreak;
      changed = true;
    }
    if (linkedCurrentStreak > profile.currentWinStreak) {
      profile.currentWinStreak = linkedCurrentStreak;
      changed = true;
    }

    const linkedBestScore = Number(linked.bestHandScore) || 0;
    if (linkedBestScore > profile.bestHandScore && linked.bestHandName) {
      profile.bestHandScore = linkedBestScore;
      profile.bestHandName = clampName(linked.bestHandName, profile.bestHandName);
      changed = true;
    }

    if (changed) {
      profile.updatedAt = now;
      this.persistAccount(profile);
    }
    return toPublicProfile(profile);
  }

  public quickLogin(
    rawIdentifier: string,
    defaults?: { displayName?: string; avatar?: string },
    linkedProfile?: LinkedAchievementProfile,
    now: number = Date.now()
  ): VerifyOtpResult {
    const trimmed = (rawIdentifier ?? '').trim();
    if (!trimmed) {
      return { ok: false, error: '请输入昵称或邮箱' };
    }

    const asEmail = normalizeEmail(trimmed);
    const emailMode = isValidEmail(asEmail);

    let rec: InternalAccountRecord | undefined;
    let accountKey = asEmail;
    let resolvedDisplayName = '';

    if (emailMode) {
      rec = this.accountsByEmail.get(asEmail);
      resolvedDisplayName = clampName(defaults?.displayName, asEmail.split('@')[0] || '俱乐部牌手');
    } else {
      const cleanName = clampName(trimmed, '俱乐部牌手');
      resolvedDisplayName = cleanName;
      const lower = cleanName.toLowerCase();
      for (const existing of this.accountsByEmail.values()) {
        if (existing.displayName.trim().toLowerCase() === lower) {
          rec = existing;
          accountKey = existing.email;
          break;
        }
      }
      if (!rec) {
        const slugHash = crypto
          .createHash('sha256')
          .update(`member:${lower}`)
          .digest('hex')
          .slice(0, 14);
        accountKey = `${slugHash}@club.velvet`;
        rec = this.accountsByEmail.get(accountKey);
      }
    }

    if (!rec) {
      const uid = `u_${crypto.createHash('sha256').update(accountKey).digest('hex').slice(0, 16)}`;
      rec = {
        uid,
        email: accountKey,
        displayName: resolvedDisplayName,
        avatar: clampAvatar(linkedProfile?.avatar ?? defaults?.avatar),
        points: 1000,
        netChips: 0,
        handsPlayed: 0,
        handsWon: 0,
        bestHandName: '高牌',
        bestHandScore: 0,
        achievements: [],
        achievementDates: {},
        currentWinStreak: 0,
        maxWinStreak: 0,
        bgmEnabled: true,
        tokenVersion: 1,
        stats: createEmptyAchievementStats(),
        createdAt: now,
        updatedAt: now,
      };
      this.accountsByEmail.set(accountKey, rec);
      this.accountsByUid.set(uid, rec);
      this.persistAccount(rec);
    } else {
      rec.updatedAt = now;
      this.persistAccount(rec);
    }

    if (linkedProfile) {
      this.mergeLinkedProfile(rec.uid, linkedProfile, now);
    }

    const token = this.signSessionToken(rec.uid, rec.email, rec.tokenVersion, now);
    return { ok: true, token, profile: toPublicProfile(rec) };
  }

  public verifyOtp(
    rawEmail: string,
    rawCode: string,
    defaults?: { displayName?: string; avatar?: string },
    now: number = Date.now(),
    linkedProfile?: LinkedAchievementProfile
  ): VerifyOtpResult {
    const email = normalizeEmail(rawEmail);
    const code = rawCode.trim();

    if (!isValidEmail(email)) {
      return { ok: false, error: '请输入有效的邮箱地址' };
    }
    if (!/^\d{6}$/.test(code)) {
      return { ok: false, error: '请输入 6 位数字验证码' };
    }

    const record = this.pendingOtps.get(email);
    if (!record) {
      return { ok: false, error: '请先获取邮箱验证码' };
    }
    if (now > record.expiresAt) {
      this.pendingOtps.delete(email);
      return { ok: false, error: '验证码已过期，请重新获取' };
    }
    if (record.attemptsLeft <= 0) {
      this.pendingOtps.delete(email);
      return { ok: false, error: '验证失败次数过多，请重新获取验证码' };
    }

    const candidateHash = hashOtp(record.salt, code);
    const expectedBuf = Buffer.from(record.codeHash, 'hex');
    const candidateBuf = Buffer.from(candidateHash, 'hex');
    const match =
      expectedBuf.length === candidateBuf.length &&
      crypto.timingSafeEqual(expectedBuf, candidateBuf);

    if (!match) {
      record.attemptsLeft -= 1;
      if (record.attemptsLeft <= 0) {
        this.pendingOtps.delete(email);
        return { ok: false, error: '验证码错误次数过多，请重新发送验证码' };
      }
      return {
        ok: false,
        error: `验证码不正确，还可尝试 ${record.attemptsLeft} 次`,
      };
    }

    this.pendingOtps.delete(email);

    let rec = this.accountsByEmail.get(email);
    if (!rec) {
      const uid = `u_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 16)}`;
      const fallbackName = email.split('@')[0] || '俱乐部牌手';
      rec = {
        uid,
        email,
        displayName: clampName(defaults?.displayName, fallbackName),
        avatar: clampAvatar(linkedProfile?.avatar ?? defaults?.avatar),
        points: 1000,
        netChips: 0,
        handsPlayed: 0,
        handsWon: 0,
        bestHandName: '高牌',
        bestHandScore: 0,
        achievements: [],
        achievementDates: {},
        currentWinStreak: 0,
        maxWinStreak: 0,
        bgmEnabled: true,
        tokenVersion: 1,
        stats: createEmptyAchievementStats(),
        createdAt: now,
        updatedAt: now,
      };
      this.accountsByEmail.set(email, rec);
      this.accountsByUid.set(uid, rec);
      this.persistAccount(rec);
    } else {
      rec.updatedAt = now;
      this.persistAccount(rec);
    }

    if (linkedProfile) {
      this.mergeLinkedProfile(rec.uid, linkedProfile, now);
    }

    const token = this.signSessionToken(rec.uid, rec.email, rec.tokenVersion, now);
    return { ok: true, token, profile: toPublicProfile(rec) };
  }

  public signSessionToken(
    uid: string,
    email: string,
    tokenVersion: number = 1,
    now: number = Date.now()
  ): string {
    const payload = {
      uid,
      email,
      ver: tokenVersion,
      iat: now,
      exp: now + SESSION_TTL_MS,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.sessionSecret)
      .update(payloadB64)
      .digest('base64url');
    return `${payloadB64}.${sig}`;
  }

  public verifySessionToken(
    token: string | undefined | null,
    now: number = Date.now()
  ): EmailAccountProfile | null {
    if (!token || typeof token !== 'string') return null;
    const parts = token.trim().split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    if (!payloadB64 || !sigB64) return null;

    const expectedSig = crypto
      .createHmac('sha256', this.sessionSecret)
      .update(payloadB64)
      .digest('base64url');

    const a = Buffer.from(sigB64, 'utf-8');
    const b = Buffer.from(expectedSig, 'utf-8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    try {
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as {
        uid?: string;
        email?: string;
        ver?: number;
        exp?: number;
      };
      if (!payload.uid || typeof payload.exp !== 'number' || now > payload.exp) {
        return null;
      }
      const rec = this.accountsByUid.get(payload.uid);
      if (!rec) return null;
      const tokenVer = typeof payload.ver === 'number' ? payload.ver : 1;
      if (tokenVer !== rec.tokenVersion) {
        return null;
      }
      return toPublicProfile(rec);
    } catch {
      return null;
    }
  }

  public revokeSessionToken(token: string | undefined | null, now: number = Date.now()): boolean {
    const profile = this.verifySessionToken(token, now);
    if (!profile) return false;
    const rec = this.accountsByUid.get(profile.uid);
    if (!rec) return false;
    rec.tokenVersion += 1;
    rec.updatedAt = now;
    this.persistAccount(rec);
    return true;
  }

  public updatePreferences(
    uid: string,
    patch: {
      displayName?: string;
      avatar?: string;
      bgmEnabled?: boolean;
      equippedAchievement?: EquippedAchievementPref | null;
    },
    now: number = Date.now()
  ): EmailAccountProfile | null {
    const rec = this.accountsByUid.get(uid);
    if (!rec) return null;
    if (patch.displayName !== undefined) {
      rec.displayName = clampName(patch.displayName, rec.displayName);
    }
    if (patch.avatar !== undefined) {
      rec.avatar = clampAvatar(patch.avatar);
    }
    if (patch.bgmEnabled !== undefined) {
      rec.bgmEnabled = Boolean(patch.bgmEnabled);
    }
    if (patch.equippedAchievement !== undefined) {
      rec.equippedAchievement =
        patch.equippedAchievement === null
          ? 'none'
          : sanitizeEquippedAchievement(patch.equippedAchievement);
    }
    rec.updatedAt = now;
    this.persistAccount(rec);
    return toPublicProfile(rec);
  }

  public recordAuthoritativeHandOutcome(
    uid: string,
    params: {
      netChips: number;
      normalizedPointsDelta: number;
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
    },
    now: number = Date.now()
  ): { profile: EmailAccountProfile; newlyUnlocked: AchievementId[] } | null {
    const rec = this.accountsByUid.get(uid);
    if (!rec) return null;

    const achResult = applyHandToAchievementStats(rec.stats, rec.achievements, {
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

    rec.handsPlayed += 1;
    if (params.won) {
      rec.handsWon += 1;
    }
    rec.netChips += Math.trunc(params.netChips);
    rec.points = Math.max(0, Math.round(rec.points + params.normalizedPointsDelta));

    if (
      params.handName &&
      typeof params.handScore === 'number' &&
      params.handScore > rec.bestHandScore
    ) {
      rec.bestHandName = clampName(params.handName, '高牌');
      rec.bestHandScore = params.handScore;
    }

    rec.stats = achResult.nextStats;
    rec.achievements = achResult.unlocked;
    rec.achievementDates = mergeAchievementDates(
      rec.achievementDates,
      achResult.unlocked,
      achResult.newlyUnlocked,
      now
    );
    rec.currentWinStreak = achResult.nextStats.currentWinStreak;
    rec.maxWinStreak = achResult.nextStats.maxWinStreak;
    rec.updatedAt = now;

    this.persistAccount(rec);
    return {
      profile: toPublicProfile(rec),
      newlyUnlocked: achResult.newlyUnlocked,
    };
  }

  public syncMatchOutcome(
    uid: string,
    _entry: LeaderboardEntry,
    avatar?: string,
    now: number = Date.now()
  ): EmailAccountProfile | null {
    const rec = this.accountsByUid.get(uid);
    if (!rec) return null;
    if (avatar !== undefined) {
      rec.avatar = clampAvatar(avatar);
      rec.updatedAt = now;
      this.persistAccount(rec);
    }
    return toPublicProfile(rec);
  }
}
