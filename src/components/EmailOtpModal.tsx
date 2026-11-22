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

export function EmailOtpModal({
  open,
  defaultDisplayName,
  defaultAvatar,
  localAchievements,
  localAchievementDates,
  onClose,
  onSuccess,
}: EmailOtpModalProps) {
  const { loggingIn, authError, quickLogin, clearAuthError } = useAuth();
  const [identifier, setIdentifier] = useState(defaultDisplayName ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setIdentifier((prev) => prev || defaultDisplayName || '');
      setLocalError(null);
      clearAuthError();
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
      return () => window.clearTimeout(id);
    }
    setLocalError(null);
    clearAuthError();
  }, [open, defaultDisplayName, clearAuthError]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    const trimmed = identifier.trim();
    if (!trimmed) {
      setLocalError('请输入昵称或邮箱');
      inputRef.current?.focus();
      return;
    }

    const profile = await quickLogin({
      identifier: trimmed,
      displayName: trimmed.includes('@') ? defaultDisplayName : trimmed,
      avatar: defaultAvatar,
      localAchievements,
      localAchievementDates,
    });
    if (profile) {
      onSuccess(profile);
      onClose();
    }
  };

  const errText = localError || authError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/74 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-login-title"
      data-testid="quick-login-modal"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[368px] overflow-hidden rounded-lg border border-white/[0.09] bg-[#0C0F11] p-6 text-[#F3F1EC] shadow-[0_28px_70px_rgba(0,0,0,0.78)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="quick-login-title"
              className="font-display text-xl font-bold tracking-tight text-[#F6F3EC]"
            >
              牌手登录
            </h2>
            <p className="mt-1 text-xs text-[#86918B]">
              登录后自动关联历史战绩与成就勋章
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="quick-login-input"
              className="block text-xs font-medium text-[#A9B3AE] mb-1.5"
            >
              昵称或邮箱
            </label>
            <input
              ref={inputRef}
              id="quick-login-input"
              data-testid="quick-login-input"
              type="text"
              autoComplete="username"
              placeholder="输入牌手昵称或邮箱"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setLocalError(null);
                clearAuthError();
              }}
              className="h-10 w-full rounded border border-white/[0.12] bg-[#080A0B] px-3 text-sm text-[#F3F1EC] placeholder:text-[#555E5A] focus:border-[#D4A853] focus:outline-none transition-colors"
            />
          </div>

          {errText && (
            <p role="alert" className="text-xs font-medium text-[#F87171]">
              {errText}
            </p>
          )}

          <button
            type="submit"
            data-testid="quick-login-submit-btn"
            disabled={loggingIn}
            className="touch-manipulation flex h-10 w-full items-center justify-center rounded bg-[#D4A853] px-4 text-sm font-bold text-[#0F1210] hover:bg-[#E1B968] disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loggingIn ? '正在关联…' : '立即登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
