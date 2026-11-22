import { useEffect, useRef, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { AVATAR_PRESETS, isCustomAvatarDataUrl, sanitizeAvatar } from '../shared/avatarUtils';
import { PlayerAvatar } from './PlayerAvatar';

interface SeatEntryModalProps {
  open: boolean;
  roomId: string;
  tableName: string;
  initialName: string;
  initialAvatar: string;
  onClose: () => void;
  onConfirm: (playerName: string, avatar: string) => void;
}

export function SeatEntryModal({
  open,
  roomId,
  tableName,
  initialName,
  initialAvatar,
  onClose,
  onConfirm,
}: SeatEntryModalProps) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState(() => sanitizeAvatar(initialAvatar));
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setAvatar(sanitizeAvatar(initialAvatar));
    setLocalError(null);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [open, initialName, initialAvatar]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('请输入昵称');
      inputRef.current?.focus();
      return;
    }
    setLocalError(null);
    onConfirm(trimmed, sanitizeAvatar(avatar));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="seat-entry-title"
      data-testid="seat-entry-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[388px] overflow-hidden rounded-lg border border-white/[0.09] bg-[#0C0F11] text-[#F3F1EC] shadow-[0_28px_72px_rgba(0,0,0,0.78)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-6 py-4">
          <div className="min-w-0">
            <h2
              id="seat-entry-title"
              className="font-display text-lg font-bold tracking-tight text-[#F6F3EC]"
            >
              入座登记
            </h2>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-[#87928C]">
              <span className="truncate">{tableName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num font-semibold text-[#D4A853]">{roomId}</span>
            </div>
          </div>

          <button
            type="button"
            data-testid="seat-entry-close-btn"
            onClick={onClose}
            aria-label="关闭入座登记"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#86918B] hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Minimal Form: Nickname + Avatar only */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div>
            <label
              htmlFor="seat-entry-name-input"
              className="block text-xs font-medium text-[#A9B3AE] mb-2"
            >
              昵称
            </label>
            <input
              ref={inputRef}
              id="seat-entry-name-input"
              data-testid="seat-entry-name-input"
              type="text"
              maxLength={18}
              placeholder="输入牌手昵称"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (localError) setLocalError(null);
              }}
              className="h-10 w-full rounded border border-white/[0.12] bg-[#080A0B] px-3 text-sm text-[#F3F1EC] placeholder:text-[#555E5A] focus:border-[#D4A853] focus:outline-none transition-colors"
            />
          </div>

          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-medium text-[#A9B3AE]">头像</span>
              {isCustomAvatarDataUrl(avatar) && (
                <span className="text-[11px] text-[#D4A853]">已使用自定义头像</span>
              )}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {AVATAR_PRESETS.map((preset) => {
                const selected = avatar === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`seat-avatar-${preset.id}`}
                    aria-label={`选择头像 ${preset.label}`}
                    aria-pressed={selected}
                    onClick={() => setAvatar(preset.id)}
                    className={`touch-manipulation flex flex-col items-center justify-center gap-1 rounded-md py-2 transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#D4A853]/16 text-[#F5E4B8] ring-1 ring-[#D4A853]/70'
                        : 'text-[#848F8A] hover:bg-white/[0.05] hover:text-[#E2E8E5]'
                    }`}
                  >
                    <PlayerAvatar
                      avatar={preset.id}
                      name={name.trim() || 'V'}
                      size="sm"
                    />
                    <span className="text-[10px] leading-none whitespace-nowrap">
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {localError && (
            <p role="alert" className="text-xs font-medium text-[#F87171]">
              {localError}
            </p>
          )}

          <button
            type="submit"
            data-testid="seat-entry-confirm-btn"
            className="touch-manipulation flex h-11 w-full items-center justify-center gap-2 rounded bg-[#D4A853] px-4 text-sm font-bold text-[#0F1210] hover:bg-[#E1B968] transition-colors cursor-pointer"
          >
            <span>确认入座</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
