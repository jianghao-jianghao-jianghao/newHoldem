import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AchievementDatesMap, AchievementId } from '../shared/achievements';
import { useAuth, type AccountProfile } from '../context/AuthContext';

interface EmailOtpModalProps {
  open: boolean;
  defaultDisplayName?: string;
  defaultAvatar?: string;
  localAchievements?: AchievementId[];
  localAchievementDates?: AchievementDatesMap;
  onClose: () => void;
  onSuccess: (profile: AccountProfile) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function EmailOtpModal({
  open,
  defaultDisplayName,
  defaultAvatar,
  localAchievements,
  localAchievementDates,
  onClose,
  onSuccess,
}: EmailOtpModalProps) {
  const { sendingCode, verifyingCode, authError, sendEmailCode, verifyEmailCode, clearAuthError } =
    useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (open) {
      setLocalError(null);
      clearAuthError();
      const id = window.setTimeout(() => {
        emailInputRef.current?.focus();
      }, 30);
      return () => window.clearTimeout(id);
    }
    setLocalError(null);
    clearAuthError();
  }, [open, clearAuthError]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSendCode = async () => {
    setLocalError(null);
    clearAuthError();
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setLocalError('请输入有效的邮箱地址');
      emailInputRef.current?.focus();
      return;
    }

    const res = await sendEmailCode(trimmed);
    if (!res.ok) {
      if (res.retryAfterSec) {
        setCooldown(res.retryAfterSec);
      }
      return;
    }

    setCooldown(60);
    if (res.deliveryMode === 'preview' && res.previewCode) {
      setPreviewCode(res.previewCode);
      setDeliveryNotice('本地测试模式，已生成临时验证码');
    } else {
      setPreviewCode(null);
      setDeliveryNotice(`验证码已发送至 ${trimmed}，10 分钟内有效`);
    }
    window.setTimeout(() => {
      codeInputRef.current?.focus();
    }, 30);
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
      setLocalError('请输入有效的邮箱地址');
      emailInputRef.current?.focus();
      return;
    }
    if (!/^\d{6}$/.test(trimmedCode)) {
      setLocalError('请输入 6 位数字验证码');
      codeInputRef.current?.focus();
      return;
    }

    const profile = await verifyEmailCode({
      email: trimmedEmail,
      code: trimmedCode,
      displayName: defaultDisplayName,
      avatar: defaultAvatar,
      localAchievements,
      localAchievementDates,
    });
    if (profile) {
      setCode('');
      setPreviewCode(null);
      setDeliveryNotice(null);
      onSuccess(profile);
      onClose();
    }
  };

  const errText = localError || authError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-otp-title"
      data-testid="email-otp-modal"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[392px] overflow-hidden rounded-xl border border-white/[0.09] bg-[#0D1012] p-6 text-[#F3F1EC] shadow-[0_28px_70px_rgba(0,0,0,0.78)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="email-otp-title"
              className="font-display text-xl font-bold tracking-tight text-[#F6F3EC]"
            >
              邮箱验证码登录
            </h2>
            <p className="mt-1 text-xs text-[#86918B]">
              登录后同步个人战绩、段位与成就；不登录亦可直接组局游玩
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭登录弹窗"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#86918B] hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleVerifySubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="otp-email-input"
              className="block text-xs font-medium text-[#A9B3AE] mb-1.5"
            >
              邮箱地址
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={emailInputRef}
                id="otp-email-input"
                data-testid="otp-email-input"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setLocalError(null);
                  clearAuthError();
                }}
                className="h-10 min-w-0 flex-1 rounded-md border border-white/[0.11] bg-[#080A0B] px-3 text-sm text-[#F3F1EC] placeholder:text-[#555E5A] focus:border-[#D4A853] focus:outline-none transition-colors"
              />
              <button
                type="button"
                data-testid="send-otp-btn"
                disabled={sendingCode || cooldown > 0}
                onClick={() => void handleSendCode()}
                className="touch-manipulation h-10 shrink-0 rounded-md border border-white/[0.12] bg-white/[0.04] px-3.5 text-xs font-medium text-[#E8CF96] hover:border-[#D4A853]/45 hover:bg-white/[0.07] disabled:opacity-45 transition-colors whitespace-nowrap cursor-pointer"
              >
                {sendingCode ? '发送中' : cooldown > 0 ? `${cooldown}s` : '获取验证码'}
              </button>
            </div>
          </div>

          {deliveryNotice && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-[#D4A853]/20 bg-[#D4A853]/[0.06] px-3 py-2 text-xs text-[#C7D0CC]">
              <span>
                {deliveryNotice}
                {previewCode && (
                  <strong
                    data-testid="otp-preview-code"
                    className="ml-2 font-mono-num tracking-[0.18em] text-[#F2DC9F]"
                  >
                    {previewCode}
                  </strong>
                )}
              </span>
              {previewCode && (
                <button
                  type="button"
                  data-testid="fill-preview-otp-btn"
                  onClick={() => {
                    setCode(previewCode);
                    setLocalError(null);
                  }}
                  className="shrink-0 text-xs font-medium text-[#D4A853] hover:text-[#F0D68F] transition-colors cursor-pointer"
                >
                  填入
                </button>
              )}
            </div>
          )}

          <div>
            <label
              htmlFor="otp-code-input"
              className="block text-xs font-medium text-[#A9B3AE] mb-1.5"
            >
              邮箱验证码
            </label>
            <input
              ref={codeInputRef}
              id="otp-code-input"
              data-testid="otp-code-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="输入 6 位数字验证码"
              value={code}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(digits);
                setLocalError(null);
                clearAuthError();
              }}
              className="font-mono-num h-11 w-full rounded-md border border-white/[0.11] bg-[#080A0B] px-3.5 text-base tracking-[0.32em] text-[#F3F1EC] placeholder:tracking-normal placeholder:text-sm placeholder:text-[#555E5A] focus:border-[#D4A853] focus:outline-none transition-colors"
            />
          </div>

          {errText && (
            <p role="alert" className="text-xs font-medium text-[#F87171]">
              {errText}
            </p>
          )}

          <button
            type="submit"
            data-testid="verify-otp-submit-btn"
            disabled={verifyingCode}
            className="touch-manipulation mt-1 flex h-11 w-full items-center justify-center rounded-md bg-[#D4A853] px-4 text-sm font-bold text-[#0F1210] hover:bg-[#E1B968] disabled:opacity-50 transition-colors cursor-pointer"
          >
            {verifyingCode ? '验证登录中…' : '验证并登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
