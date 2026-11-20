import { useEffect, useState } from 'react';
import { KeyRound, Mail, Send, ShieldCheck, X } from 'lucide-react';
import { useAuth, type AccountProfile } from '../context/AuthContext';

interface EmailOtpModalProps {
  open: boolean;
  defaultDisplayName?: string;
  defaultAvatar?: string;
  onClose: () => void;
  onSuccess: (profile: AccountProfile) => void;
}

export function EmailOtpModal({
  open,
  defaultDisplayName,
  defaultAvatar,
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

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!open) {
      setLocalError(null);
      clearAuthError();
    }
  }, [open, clearAuthError]);

  if (!open) return null;

  const handleSendCode = async () => {
    setLocalError(null);
    clearAuthError();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setLocalError('请输入有效的邮箱地址');
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
      setDeliveryNotice('当前未配置外部发信服务，已生成本地预览验证码（10 分钟有效）');
    } else {
      setPreviewCode(null);
      setDeliveryNotice(`6 位验证码已发送至 ${trimmed}，10 分钟内有效`);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      setLocalError('请输入有效的邮箱地址');
      return;
    }
    if (!/^\d{6}$/.test(trimmedCode)) {
      setLocalError('请输入完整的 6 位数字验证码');
      return;
    }

    const profile = await verifyEmailCode({
      email: trimmedEmail,
      code: trimmedCode,
      displayName: defaultDisplayName,
      avatar: defaultAvatar,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-otp-title"
    >
      <div className="w-full max-w-md rounded-md border border-white/[0.12] bg-[#0E1113] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded border border-[#D4A853]/40 bg-[#D4A853]/10">
              <Mail className="h-4 w-4 text-[#D4A853]" aria-hidden="true" />
            </div>
            <div>
              <h2 id="email-otp-title" className="text-sm font-bold text-[#F4F3EE]">
                邮箱验证码登录
              </h2>
              <p className="text-[11px] text-[#8E9893]">
                验证邮箱后自动同步战绩、成就勋章与个人偏好
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭登录弹窗"
            className="flex h-8 w-8 items-center justify-center rounded border border-white/[0.1] text-[#9AA6A1] hover:bg-white/5 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleVerifySubmit} className="space-y-4 p-5">
          <div>
            <label
              htmlFor="otp-email-input"
              className="block text-xs font-medium text-[#B3BCB7] mb-1.5"
            >
              邮箱地址
            </label>
            <div className="flex gap-2">
              <input
                id="otp-email-input"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setLocalError(null);
                  clearAuthError();
                }}
                className="h-10 flex-1 rounded border border-white/[0.12] bg-[#080A0B] px-3 text-sm text-[#F3F1EC] placeholder:text-[#5B6460] focus:border-[#D4A853] focus:outline-none"
              />
              <button
                type="button"
                data-testid="send-otp-btn"
                disabled={sendingCode || cooldown > 0}
                onClick={() => void handleSendCode()}
                className="touch-manipulation inline-flex h-10 shrink-0 items-center gap-1.5 rounded border border-[#D4A853]/50 bg-[#D4A853]/12 px-3 text-xs font-semibold text-[#F5E4B8] hover:bg-[#D4A853]/22 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {sendingCode
                    ? '发送中…'
                    : cooldown > 0
                      ? `${cooldown}s 后重发`
                      : '发送验证码'}
                </span>
              </button>
            </div>
          </div>

          {deliveryNotice && (
            <div className="rounded border border-[#D4A853]/30 bg-[#D4A853]/[0.07] px-3 py-2.5 text-xs text-[#DFD5BE]">
              <p>{deliveryNotice}</p>
              {previewCode && (
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#D4A853]/20 pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#9EA8A3]">验证码：</span>
                    <span
                      data-testid="otp-preview-code"
                      className="font-mono-num text-sm font-bold tracking-[0.2em] text-[#F5E4B8]"
                    >
                      {previewCode}
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid="fill-preview-otp-btn"
                    onClick={() => {
                      setCode(previewCode);
                      setLocalError(null);
                    }}
                    className="rounded border border-[#D4A853]/45 bg-[#D4A853]/18 px-2 py-0.5 text-[11px] font-semibold text-[#F5E4B8] hover:bg-[#D4A853]/30 transition-colors"
                  >
                    填入
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <label
              htmlFor="otp-code-input"
              className="block text-xs font-medium text-[#B3BCB7] mb-1.5"
            >
              6 位数字验证码
            </label>
            <div className="relative">
              <KeyRound
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6F7873]"
                aria-hidden="true"
              />
              <input
                id="otp-code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="输入 6 位验证码"
                value={code}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(digits);
                  setLocalError(null);
                  clearAuthError();
                }}
                className="font-mono-num h-11 w-full rounded border border-white/[0.12] bg-[#080A0B] pl-9 pr-3.5 text-base tracking-[0.28em] text-[#F3F1EC] placeholder:tracking-normal placeholder:text-sm placeholder:text-[#5B6460] focus:border-[#D4A853] focus:outline-none"
              />
            </div>
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
            className="touch-manipulation flex h-10 w-full items-center justify-center gap-2 rounded bg-[#D4A853] px-4 text-xs font-bold text-[#0F1210] hover:bg-[#E1B968] disabled:opacity-50 transition-colors"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>{verifyingCode ? '验证中…' : '验证并登录'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
