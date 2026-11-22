import { useRef, useState } from 'react';
import {
  ArrowRight,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  AVATAR_PRESETS,
  isCustomAvatarDataUrl,
  MAX_CUSTOM_AVATAR_BYTES,
  sanitizeAvatar,
} from '../shared/avatarUtils';
import { resolvePlayerAvatarProfile } from '../shared/playerProfile';
import type { LeaderboardEntry, RoomSummary } from '../shared/types';
import { useAuth, type AccountProfile } from '../context/AuthContext';
import { AvatarAchievementShowcase } from './AchievementBadge';
import { EmailOtpModal } from './EmailOtpModal';
import { PlayerAvatar } from './PlayerAvatar';

interface TitleScreenProps {
  initialName: string;
  initialRoom: string;
  initialAvatar: string;
  isDesktop?: boolean;
  rooms: RoomSummary[];
  leaderboard?: LeaderboardEntry[];
  errorMessage: string | null;
  onEnterTable: (playerName: string, roomId: string, avatar: string) => void;
  onCreateRoom: (params: {
    tableName: string;
    roomId?: string;
    smallBlind: number;
    bigBlind: number;
    startingChips: number;
  }) => Promise<RoomSummary | null>;
  onDeleteRoom: (roomId: string) => Promise<void> | void;
  onOpenAchievements: () => void;
  onOpenCardGallery: () => void;
}

const BLIND_PRESETS = [
  { label: '5 / 10', sb: 5, bb: 10 },
  { label: '10 / 20', sb: 10, bb: 20 },
  { label: '25 / 50', sb: 25, bb: 50 },
  { label: '50 / 100', sb: 50, bb: 100 },
] as const;

const CHIP_PRESETS = [1000, 2000, 5000, 10000] as const;

async function resizeAvatarImage(file: File): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('load_failed'));
      el.src = objectUrl;
    });

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const minSide = Math.min(img.width, img.height);
    const sx = (img.width - minSide) / 2;
    const sy = (img.height - minSide) / 2;
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

    for (const quality of [0.82, 0.64, 0.45]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= MAX_CUSTOM_AVATAR_BYTES) {
        const clean = sanitizeAvatar(dataUrl);
        if (clean !== 'default') return clean;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function TitleScreen({
  initialName,
  initialRoom,
  initialAvatar,
  isDesktop = true,
  rooms,
  leaderboard = [],
  errorMessage,
  onEnterTable,
  onCreateRoom,
  onDeleteRoom,
  onOpenAchievements,
  onOpenCardGallery,
}: TitleScreenProps) {
  const { profile, authError, signOutUser, clearAuthError } = useAuth();
  const [name, setName] = useState(initialName);
  const [roomId, setRoomId] = useState(initialRoom || 'CLUB01');
  const [customCodeOpen, setCustomCodeOpen] = useState(false);
  const [avatar, setAvatar] = useState(() => sanitizeAvatar(initialAvatar));
  const [localError, setLocalError] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [customSb, setCustomSb] = useState(10);
  const [customBb, setCustomBb] = useState(20);
  const [startingChips, setStartingChips] = useState<number>(2000);
  const [creating, setCreating] = useState(false);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleEmailAuthSuccess = (loaded: AccountProfile) => {
    if (!name.trim() && loaded.displayName) {
      setName(loaded.displayName);
    }
    if (loaded.avatar && avatar === 'default') {
      setAvatar(loaded.avatar);
    }
  };

  const tryEnterRoom = (targetRoomId: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('请先输入您的牌手昵称');
      setRoomId(targetRoomId);
      nameInputRef.current?.focus();
      return;
    }
    setLocalError(null);
    onEnterTable(
      trimmed,
      targetRoomId.trim().toUpperCase() || 'CLUB01',
      sanitizeAvatar(avatar)
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    tryEnterRoom(roomId);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLocalError('请选择 PNG、JPG 或 WebP 格式的头像图片');
      return;
    }
    const processed = await resizeAvatarImage(file);
    if (!processed) {
      setLocalError('头像图片处理失败或体积过大，请换一张图片');
      return;
    }
    setLocalError(null);
    setAvatar(processed);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    const sb = Math.max(1, Math.min(5000, Math.floor(Number(customSb) || 10)));
    const bb = Math.max(sb + 1, Math.min(10000, Math.floor(Number(customBb) || sb * 2)));
    setCreating(true);
    setLocalError(null);
    const safeStarting = Math.max(
      bb * 10,
      Math.min(200_000, Math.floor(Number(startingChips) || 2000))
    );
    try {
      const created = await onCreateRoom({
        tableName: newTableName.trim(),
        smallBlind: sb,
        bigBlind: bb,
        startingChips: safeStarting,
      });
      if (created) {
        setRoomId(created.roomId);
        setNewTableName('');
        setCreateOpen(false);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (targetId: string) => {
    if (roomId.toUpperCase() === targetId.toUpperCase()) {
      const next = rooms.find((r) => r.roomId !== targetId);
      setRoomId(next?.roomId ?? 'CLUB01');
    }
    onDeleteRoom(targetId);
  };

  const displayError = localError || authError || errorMessage;
  const activePresetLabel = isCustomAvatarDataUrl(avatar)
    ? '自定义图片'
    : AVATAR_PRESETS.find((p) => p.id === avatar)?.label ?? '默认';

  return (
    <main
      className={`relative z-10 flex min-h-dvh flex-col justify-between overflow-x-hidden ${
        isDesktop
          ? 'bg-gradient-to-b from-[#080A0B]/78 via-[#080A0B]/42 to-[#080A0B]/84 lg:bg-gradient-to-r lg:from-[#080A0B]/86 lg:via-[#080A0B]/48 lg:to-[#080A0B]/82'
          : 'bg-[radial-gradient(ellipse_at_top,#10261E_0%,#090B0C_68%)]'
      }`}
    >
      {/* Slim Architectural Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-3.5 sm:gap-4 sm:px-8 sm:py-4">
        <div className="flex items-center gap-2 sm:gap-3 whitespace-nowrap shrink-0">
          <svg
            viewBox="0 0 36 36"
            className="h-6 w-6 sm:h-7 sm:w-7 shrink-0"
            aria-hidden="true"
          >
            <rect
              x="1"
              y="1"
              width="34"
              height="34"
              rx="6"
              fill="#0E261D"
              stroke="#D4A853"
              strokeWidth="1.2"
            />
            <path
              d="M18 8 C13.5 14 9.5 17.5 9.5 21.5 C9.5 24.5 11.8 26.5 14.5 26.5 C16.2 26.5 17.3 25.6 18 24.5 C18.7 25.6 19.8 26.5 21.5 26.5 C24.2 26.5 26.5 24.5 26.5 21.5 C26.5 17.5 22.5 14 18 8 Z M16.3 26.5 L14.5 30 L21.5 30 L19.7 26.5 Z"
              fill="#D4A853"
            />
          </svg>
          <span className="font-display text-lg sm:text-xl font-bold tracking-[0.08em] text-[#F3F1EC]">
            VELVET
          </span>
        </div>

        <nav
          aria-label="大厅导航"
          className="flex items-center gap-3 sm:gap-5 text-xs font-medium shrink-0"
        >
          <button
            type="button"
            data-testid="open-card-gallery-btn"
            onClick={onOpenCardGallery}
            className="touch-manipulation py-1.5 text-[#A8B2AD] hover:text-[#F5F2EB] transition-colors whitespace-nowrap shrink-0"
          >
            牌面图鉴
          </button>

          <button
            type="button"
            data-testid="open-achievements-btn"
            onClick={onOpenAchievements}
            className="touch-manipulation py-1.5 text-[#A8B2AD] hover:text-[#F5F2EB] transition-colors whitespace-nowrap shrink-0"
          >
            成就勋章
          </button>

          <span aria-hidden="true" className="h-3.5 w-px bg-white/[0.1]" />

          {profile ? (
            <div className="flex items-center gap-2 text-xs">
              <span
                title={profile.email}
                className="hidden sm:inline truncate max-w-[150px] text-[#E6CF96]"
              >
                {profile.email}
              </span>
              <button
                type="button"
                data-testid="email-signout-btn"
                onClick={() => void signOutUser()}
                className="touch-manipulation py-1.5 text-[#8E9993] hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                退出
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="email-signin-btn"
              onClick={() => {
                clearAuthError();
                setEmailModalOpen(true);
              }}
              className="touch-manipulation py-1.5 text-[#E6CF96] hover:text-[#F8E6B3] transition-colors whitespace-nowrap shrink-0"
            >
              登录
            </button>
          )}
        </nav>
      </header>

      {/* Main Split Salon */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-6 sm:px-8 sm:py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12 lg:items-start">
          {/* Left 7 Cols: Editorial Title + Table Directory */}
          <section className="lg:col-span-7 lg:border-r lg:border-white/[0.07] lg:pr-12">
            <h1
              className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[#F5F2EB] leading-[1.15]"
              style={{ textWrap: 'balance' }}
            >
              德州扑克私人牌室
            </h1>
            <p className="mt-2.5 max-w-md text-sm tracking-wide text-[#9DA7A2]">
              无上限德州扑克 · 两人即开，自定义盲注与筹码深度
            </p>

            {/* Directory Toolbar */}
            <div className="mt-7 flex items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2 text-xs text-[#8D9792]">
                <span className="font-medium text-[#DEDAD2]">牌桌大厅</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">{rooms.length} 桌在线</span>
              </div>

              <button
                type="button"
                onClick={() => setCreateOpen((prev) => !prev)}
                className="touch-manipulation inline-flex h-9 sm:h-8 items-center gap-1.5 rounded-md border border-[#D4A853]/45 bg-[#D4A853]/10 px-3 text-xs font-semibold text-[#E8CF96] hover:bg-[#D4A853]/20 transition-colors whitespace-nowrap shrink-0"
              >
                {createOpen ? (
                  <>
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>收起</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>创建牌桌</span>
                  </>
                )}
              </button>
            </div>

            {/* Inline Create Table Form */}
            {createOpen && (
              <form
                onSubmit={handleCreateSubmit}
                className="mt-4 border border-[#D4A853]/30 bg-[#0E1113]/95 p-4 sm:p-5 rounded-md space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="create-table-name"
                      className="text-[11px] font-medium text-[#A1ABA6]"
                    >
                      牌桌名称（可选）
                    </label>
                    <span className="text-[11px] text-[#78837E]">房间号将自动生成</span>
                  </div>
                  <input
                    id="create-table-name"
                    type="text"
                    maxLength={24}
                    placeholder="例：周末好友局"
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    className="h-10 sm:h-9 w-full rounded border border-white/[0.12] bg-[#080A0B] px-3 text-sm text-[#F3F1EC] placeholder:text-[#5B6460] focus:border-[#D4A853] focus:outline-none"
                  />
                </div>

                <div>
                  <span className="block text-[11px] font-medium text-[#A1ABA6] mb-1.5">
                    盲注级别（预设或自定义小盲 / 大盲）
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {BLIND_PRESETS.map((preset) => {
                      const active = customSb === preset.sb && customBb === preset.bb;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setCustomSb(preset.sb);
                            setCustomBb(preset.bb);
                          }}
                          className={`touch-manipulation font-mono-num h-9 sm:h-8 rounded border text-xs font-semibold transition-colors ${
                            active
                              ? 'border-[#D4A853] bg-[#D4A853]/18 text-[#F5E4B8]'
                              : 'border-white/[0.1] bg-[#080A0B] text-[#949E99] hover:text-white'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 rounded border border-white/[0.1] bg-[#080A0B] px-2.5 h-9 sm:h-8">
                      <span className="text-[11px] text-[#8E9893] shrink-0">小盲</span>
                      <input
                        type="number"
                        min={1}
                        max={5000}
                        aria-label="自定义小盲"
                        value={customSb}
                        onChange={(e) => setCustomSb(Number(e.target.value))}
                        className="font-mono-num w-full bg-transparent text-right text-xs text-[#F3F1EC] focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2 rounded border border-white/[0.1] bg-[#080A0B] px-2.5 h-9 sm:h-8">
                      <span className="text-[11px] text-[#8E9893] shrink-0">大盲</span>
                      <input
                        type="number"
                        min={2}
                        max={10000}
                        aria-label="自定义大盲"
                        value={customBb}
                        onChange={(e) => setCustomBb(Number(e.target.value))}
                        className="font-mono-num w-full bg-transparent text-right text-xs text-[#E8CF96] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="create-starting-chips"
                      className="text-[11px] font-medium text-[#A1ABA6]"
                    >
                      初始筹码
                    </label>
                    <span className="font-mono-num text-[11px] text-[#7D8782]">
                      最低 {(Math.max(2, customBb) * 10).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {CHIP_PRESETS.map((chips) => (
                      <button
                        key={chips}
                        type="button"
                        onClick={() => setStartingChips(chips)}
                        className={`touch-manipulation font-mono-num h-9 sm:h-8 rounded border text-xs font-semibold transition-colors ${
                          startingChips === chips
                            ? 'border-[#D4A853] bg-[#D4A853]/18 text-[#F5E4B8]'
                            : 'border-white/[0.1] bg-[#080A0B] text-[#949E99] hover:text-white'
                        }`}
                      >
                        {chips.toLocaleString()}
                      </button>
                    ))}
                    <input
                      id="create-starting-chips"
                      type="number"
                      min={Math.max(2, customBb) * 10}
                      max={200000}
                      step={100}
                      aria-label="自定义初始筹码"
                      value={startingChips}
                      onChange={(e) => setStartingChips(Number(e.target.value))}
                      className="font-mono-num h-9 sm:h-8 w-full rounded border border-white/[0.12] bg-[#080A0B] px-2 text-center text-xs text-[#E8CF96] focus:border-[#D4A853] focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="touch-manipulation flex h-10 sm:h-9 w-full items-center justify-center gap-1.5 rounded bg-[#D4A853] px-4 text-xs font-bold text-[#0F1210] hover:bg-[#E1B968] disabled:opacity-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{creating ? '创建中...' : '确认创建牌桌'}</span>
                </button>
              </form>
            )}

            {/* Architectural Hairline Table Directory */}
            <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.07]">
              {rooms.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#7E8782]">
                  暂无活跃牌桌，点击上方「创建牌桌」开设新桌。
                </div>
              ) : (
                rooms.map((room) => {
                  const selected = roomId.toUpperCase() === room.roomId;
                  return (
                    <div
                      key={room.roomId}
                      className={`flex items-center justify-between gap-3 py-3.5 px-2 transition-colors ${
                        selected ? 'bg-[#D4A853]/[0.07]' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setRoomId(room.roomId)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="truncate text-sm font-semibold text-[#F3F1EC]">
                            {room.tableName}
                          </span>
                          <span className="font-mono-num shrink-0 text-xs font-bold text-[#D4A853]">
                            {room.roomId}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#8D9792]">
                          <span className="font-mono-num">
                            盲注 {room.smallBlind}/{room.bigBlind}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-num">
                            初始 {room.startingChips.toLocaleString()}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-mono-num text-[#B5BEB9]">
                            <Users className="h-3 w-3" aria-hidden="true" />
                            {room.playerCount}人
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{room.phase === 'waiting' ? '等待开局' : '对局中'}</span>
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => tryEnterRoom(room.roomId)}
                          className="touch-manipulation h-9 sm:h-8 rounded border border-white/[0.14] bg-[#14181B] px-3 text-xs font-semibold text-[#E8CF96] hover:border-[#D4A853] hover:bg-[#D4A853] hover:text-[#0F1210] transition-colors whitespace-nowrap"
                        >
                          进入
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(room.roomId)}
                          aria-label={`删除牌桌 ${room.tableName}`}
                          title="删除牌桌"
                          className="touch-manipulation flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded border border-white/[0.08] text-[#8E9893] hover:border-[#DC2626]/50 hover:bg-[#DC2626]/15 hover:text-[#FCA5A5] transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Right 5 Cols: Restrained Seat Registration + Avatar Selector */}
          <section className="lg:col-span-5">
            <div className="border border-white/[0.08] bg-[#0B0E10]/86 backdrop-blur-md p-5 sm:p-6 rounded-md">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-4">
                <h2 className="text-sm font-semibold tracking-wide text-[#F3F1EC]">入座登记</h2>
                <span className="text-[11px] text-[#7D8782]">{activePresetLabel}</span>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Avatar Selector (single elevation, no nested box-in-box) */}
                <div data-testid="avatar-selector" className="border-b border-white/[0.06] pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      {(() => {
                        const previewProfile = resolvePlayerAvatarProfile(
                          {
                            name: name.trim() || 'V',
                            avatar,
                            achievements: profile?.achievements ?? [],
                            achievementDates: profile?.achievementDates ?? {},
                            winStreak: profile?.currentWinStreak ?? 0,
                            isBot: false,
                          },
                          leaderboard
                        );

                        return (
                          <>
                            <div className="relative shrink-0 overflow-visible">
                              <PlayerAvatar
                                avatar={previewProfile.avatar}
                                name={name || 'V'}
                                size="xl"
                                level={previewProfile.levelInfo.level}
                                levelTier={previewProfile.levelInfo.tier}
                                levelTitle={previewProfile.levelInfo.title}
                                rankTier={previewProfile.rankTier}
                                showLevelBadge
                                showRankAura
                              />
                              <AvatarAchievementShowcase
                                achievements={previewProfile.achievements}
                                achievementDates={previewProfile.achievementDates}
                                winStreak={previewProfile.winStreak}
                                maxVisible={3}
                                size="xs"
                                tooltipPlacement="top"
                                onOpenAchievements={onOpenAchievements}
                                className="absolute -top-2 -right-2.5 z-20"
                              />
                            </div>
                            <div className="min-w-0 pl-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-semibold text-[#F3F1EC]">
                                  {name.trim() || '未命名牌手'}
                                </p>
                                <span className="font-mono-num text-[11px] text-[#C8B27A] shrink-0">
                                  {previewProfile.rankTierLabel}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-[#7E8782]">
                                {profile ? profile.email : '选择徽章或上传头像'}
                              </p>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isCustomAvatarDataUrl(avatar) && (
                        <button
                          type="button"
                          onClick={() => setAvatar('default')}
                          aria-label="恢复默认头像"
                          title="恢复默认头像"
                          className="touch-manipulation flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded border border-white/[0.1] bg-white/[0.03] text-[#A9B3AE] hover:text-white transition-colors"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid="upload-avatar-btn"
                        onClick={() => fileInputRef.current?.click()}
                        className="touch-manipulation inline-flex h-9 sm:h-8 items-center gap-1.5 rounded border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs font-medium text-[#D5DDD8] hover:border-[#D4A853]/45 hover:text-[#F0DFB3] transition-colors whitespace-nowrap"
                      >
                        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>上传</span>
                      </button>
                      <input
                        ref={fileInputRef}
                        data-testid="avatar-file-input"
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        className="hidden"
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                    {AVATAR_PRESETS.map((preset) => {
                      const selected = avatar === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          data-testid={`avatar-preset-${preset.id}`}
                          aria-pressed={selected}
                          onClick={() => {
                            setLocalError(null);
                            setAvatar(preset.id);
                          }}
                          className={`touch-manipulation flex flex-col items-center justify-center gap-1.5 rounded py-2 px-1 transition-colors ${
                            selected
                              ? 'bg-[#D4A853]/16 text-[#F5E4B8] ring-1 ring-[#D4A853]/65'
                              : 'bg-white/[0.02] text-[#8E9893] hover:bg-white/[0.06] hover:text-white'
                          }`}
                        >
                          <PlayerAvatar
                            avatar={preset.id}
                            name={name || 'V'}
                            size="sm"
                          />
                          <span className="text-[11px] leading-none whitespace-nowrap">
                            {preset.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="player-name-input"
                    className="block text-xs font-medium text-[#B3BCB7] mb-1.5"
                  >
                    玩家昵称
                  </label>
                  <input
                    ref={nameInputRef}
                    id="player-name-input"
                    type="text"
                    maxLength={18}
                    placeholder="输入昵称（例如：林深）"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (localError) setLocalError(null);
                    }}
                    className="h-11 w-full rounded border border-white/[0.12] bg-[#080A0B] px-3.5 text-sm text-[#F3F1EC] placeholder:text-[#5B6460] focus:border-[#D4A853] focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
                  <div className="min-w-0 flex items-center gap-2 text-[#9AA5A0]">
                    <span className="shrink-0">目标牌桌</span>
                    <span className="truncate font-medium text-[#F3F1EC]">
                      {rooms.find((r) => r.roomId === roomId.toUpperCase())?.tableName ?? '私人牌桌'}
                    </span>
                    <span className="font-mono-num shrink-0 font-semibold text-[#D4A853]">
                      {roomId}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomCodeOpen((prev) => !prev)}
                    className="shrink-0 text-[11px] text-[#8A948F] hover:text-[#E8CF96] transition-colors"
                  >
                    {customCodeOpen ? '收起' : '输房号加入'}
                  </button>
                </div>

                {customCodeOpen && (
                  <input
                    id="room-code-input"
                    type="text"
                    maxLength={12}
                    placeholder="输入好友分享的房间号"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    className="font-mono-num h-10 w-full rounded border border-white/[0.12] bg-[#080A0B] px-3 text-sm text-[#E8CF96] placeholder:text-[#5B6460] focus:border-[#D4A853] focus:outline-none"
                  />
                )}

                {displayError && (
                  <p role="alert" className="text-xs font-medium text-[#F87171]">
                    {displayError}
                  </p>
                )}

                <button
                  type="submit"
                  data-start="true"
                  className="touch-manipulation mt-1 flex h-11 w-full items-center justify-center gap-2 rounded bg-[#D4A853] px-5 text-sm font-bold text-[#0F1210] hover:bg-[#E1B968] focus-visible:outline-2 focus-visible:outline-white transition-colors whitespace-nowrap"
                >
                  <span>进入牌桌</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>

      {/* Quiet Footer */}
      <footer className="mx-auto w-full max-w-6xl border-t border-white/[0.06] px-5 py-3.5 sm:px-8 text-center sm:text-left text-xs text-[#6F7873]">
        {isDesktop
          ? '快捷键：F 弃牌 · C / 空格 让牌或跟注 · R 加注 · T 对话 · M 静音'
          : '移动端极简 2D 牌桌模式 · 点击下方按钮操作'}
      </footer>

      <EmailOtpModal
        open={emailModalOpen}
        defaultDisplayName={name.trim() || undefined}
        defaultAvatar={avatar}
        onClose={() => setEmailModalOpen(false)}
        onSuccess={handleEmailAuthSuccess}
      />
    </main>
  );
}
