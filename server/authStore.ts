import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import {
  mergeAchievementDates,
  sanitizeAchievementDates,
  sanitizeAchievementIds,
  type AchievementDatesMap,
  type AchievementId,
} from '../src/shared/achievements';
import { sanitizeAvatar } from '../src/shared/avatarUtils';
import type { LeaderboardEntry } from '../src/shared/types';

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
  currentWinStreak: number;
  maxWinStreak: number;
  bgmEnabled: boolean;
  createdAt: number;
  updatedAt: number;
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

const DATA_DIR = path.resolve(process.cwd(), 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const SESSION_SECRET_FILE = path.join(DATA_DIR, '.session_secret');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  return safe.length <= 32768 ? safe : 'default';
}

function hashOtp(salt: string, code: string): string {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
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
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SESSION_SECRET_FILE)) {
      const stored = fs.readFileSync(SESSION_SECRET_FILE, 'utf-8').trim();
      if (stored.length >= 32) return stored;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SESSION_SECRET_FILE, generated, { encoding: 'utf-8', mode: 0o600 });
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
    'Velvet Hold\'em <noreply@velvetholdem.local>';

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
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
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
  persistenceFile?: string;
  sessionSecret?: string;
  disableDiskPersistence?: boolean;
  emailSender?: (email: string, code: string) => Promise<{ delivered: boolean; mode: OtpDeliveryMode }>;
}

export class EmailAuthStore {
  private accountsByEmail = new Map<string, EmailAccountProfile>();
  private accountsByUid = new Map<string, EmailAccountProfile>();
  private pendingOtps = new Map<string, PendingOtpRecord>();
  private readonly persistenceFile: string;
  private readonly disableDiskPersistence: boolean;
  private readonly sessionSecret: string;
  private readonly emailSender: (
    email: string,
    code: string
  ) => Promise<{ delivered: boolean; mode: OtpDeliveryMode }>;

  constructor(options: AuthStoreOptions = {}) {
    this.persistenceFile = options.persistenceFile ?? ACCOUNTS_FILE;
    this.disableDiskPersistence = Boolean(options.disableDiskPersistence);
    this.sessionSecret = resolveSessionSecret(options.sessionSecret);
    this.emailSender = options.emailSender ?? deliverOtpEmail;
    if (!this.disableDiskPersistence) {
      this.load();
    }
  }

  private load(): void {
    try {
      const dir = path.dirname(this.persistenceFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(this.persistenceFile)) return;
      const raw = fs.readFileSync(this.persistenceFile, 'utf-8');
      const parsed = JSON.parse(raw) as EmailAccountProfile[];
      if (!Array.isArray(parsed)) return;
      for (const acc of parsed) {
        if (!acc || typeof acc.email !== 'string' || typeof acc.uid !== 'string') continue;
        const email = normalizeEmail(acc.email);
        const normalized: EmailAccountProfile = {
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
          currentWinStreak:
            typeof acc.currentWinStreak === 'number' ? Math.floor(acc.currentWinStreak) : 0,
          maxWinStreak: typeof acc.maxWinStreak === 'number' ? Math.floor(acc.maxWinStreak) : 0,
          bgmEnabled: acc.bgmEnabled !== false,
          createdAt: typeof acc.createdAt === 'number' ? acc.createdAt : Date.now(),
          updatedAt: typeof acc.updatedAt === 'number' ? acc.updatedAt : Date.now(),
        };
        this.accountsByEmail.set(email, normalized);
        this.accountsByUid.set(normalized.uid, normalized);
      }
    } catch {
      // Ignore corrupt disk state
    }
  }

  private save(): void {
    if (this.disableDiskPersistence) return;
    try {
      const dir = path.dirname(this.persistenceFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.persistenceFile,
        JSON.stringify(Array.from(this.accountsByEmail.values()), null, 2),
        'utf-8'
      );
    } catch {
      // Ignore write failures on read-only systems
    }
  }

  public async requestOtp(rawEmail: string, now: number = Date.now()): Promise<RequestOtpResult> {
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

  public verifyOtp(
    rawEmail: string,
    rawCode: string,
    defaults?: { displayName?: string; avatar?: string },
    now: number = Date.now()
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

    let profile = this.accountsByEmail.get(email);
    if (!profile) {
      const uid = `u_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 16)}`;
      const fallbackName = email.split('@')[0] || '俱乐部牌手';
      profile = {
        uid,
        email,
        displayName: clampName(defaults?.displayName, fallbackName),
        avatar: clampAvatar(defaults?.avatar),
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
        createdAt: now,
        updatedAt: now,
      };
      this.accountsByEmail.set(email, profile);
      this.accountsByUid.set(uid, profile);
      this.save();
    } else {
      profile.updatedAt = now;
      this.save();
    }

    const token = this.signSessionToken(profile.uid, profile.email, now);
    return { ok: true, token, profile };
  }

  public signSessionToken(uid: string, email: string, now: number = Date.now()): string {
    const payload = {
      uid,
      email,
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
        exp?: number;
      };
      if (!payload.uid || typeof payload.exp !== 'number' || now > payload.exp) {
        return null;
      }
      return this.accountsByUid.get(payload.uid) ?? null;
    } catch {
      return null;
    }
  }

  public updatePreferences(
    uid: string,
    patch: { displayName?: string; avatar?: string; bgmEnabled?: boolean },
    now: number = Date.now()
  ): EmailAccountProfile | null {
    const acc = this.accountsByUid.get(uid);
    if (!acc) return null;
    if (patch.displayName !== undefined) {
      acc.displayName = clampName(patch.displayName, acc.displayName);
    }
    if (patch.avatar !== undefined) {
      acc.avatar = clampAvatar(patch.avatar);
    }
    if (patch.bgmEnabled !== undefined) {
      acc.bgmEnabled = Boolean(patch.bgmEnabled);
    }
    acc.updatedAt = now;
    this.save();
    return acc;
  }

  public syncMatchOutcome(
    uid: string,
    entry: LeaderboardEntry,
    avatar?: string,
    now: number = Date.now()
  ): EmailAccountProfile | null {
    const acc = this.accountsByUid.get(uid);
    if (!acc) return null;

    const mergedAch = sanitizeAchievementIds([
      ...acc.achievements,
      ...(entry.achievements ?? []),
    ]);
    const newlyAdded = mergedAch.filter((id) => !acc.achievements.includes(id));
    const mergedDates = mergeAchievementDates(
      { ...acc.achievementDates, ...(entry.achievementDates ?? {}) },
      mergedAch,
      newlyAdded,
      now
    );

    const safeHandsPlayed = Math.max(acc.handsPlayed, Math.floor(entry.handsPlayed || 0));
    const safeHandsWon = Math.min(
      safeHandsPlayed,
      Math.max(acc.handsWon, Math.floor(entry.handsWon || 0))
    );
    const safeCurrentStreak = Math.max(0, Math.floor(entry.currentWinStreak ?? 0));
    const safeMaxStreak = Math.max(
      acc.maxWinStreak,
      safeCurrentStreak,
      Math.floor(entry.maxWinStreak ?? 0)
    );
    const safeBestScore = Math.max(acc.bestHandScore, Number(entry.bestHandScore) || 0);
    const safeBestName =
      (Number(entry.bestHandScore) || 0) > acc.bestHandScore && entry.bestHandName
        ? clampName(entry.bestHandName, '高牌')
        : acc.bestHandName;

    acc.displayName = clampName(entry.playerName || acc.displayName, acc.displayName);
    acc.avatar = clampAvatar(avatar ?? acc.avatar);
    acc.points = Math.max(0, Math.min(100_000_000, Math.floor(entry.points || 0)));
    acc.netChips = Math.max(-10_000_000, Math.min(100_000_000, Math.floor(entry.netChips || 0)));
    acc.handsPlayed = safeHandsPlayed;
    acc.handsWon = safeHandsWon;
    acc.bestHandName = safeBestName;
    acc.bestHandScore = safeBestScore;
    acc.achievements = mergedAch;
    acc.achievementDates = mergedDates;
    acc.currentWinStreak = safeCurrentStreak;
    acc.maxWinStreak = safeMaxStreak;
    acc.updatedAt = now;
    this.save();
    return acc;
  }
}
