import { useState } from 'react';
import {
  ArrowRight,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  AchievementDatesMap,
  AchievementId,
  EquippedAchievementPref,
} from '../shared/achievements';
import { sanitizeAvatar } from '../shared/avatarUtils';
import { resolvePlayerAvatarProfile } from '../shared/playerProfile';
import type { LeaderboardEntry, RoomSummary } from '../shared/types';
import { useAuth } from '../context/AuthContext';
import type { PersonalCenterTab } from './PersonalCenterModal';
import { PlayerAvatar } from './PlayerAvatar';
import { SeatEntryModal } from './SeatEntryModal';

interface TitleScreenProps {
  initialName: string;
  initialRoom: string;
  initialAvatar: string;
  achievements?: AchievementId[];
  achievementDates?: AchievementDatesMap;
  equippedPref?: EquippedAchievementPref;
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
    turnTimeoutSec: number;
  }) => Promise<RoomSummary | null>;
  onDeleteRoom: (roomId: string) => Promise<void> | void;
  onOpenPersonalCenter: (tab?: PersonalCenterTab) => void;
  onOpenEmailLogin: () => void;
  onOpenCardGallery: () => void;
  fadingOut?: boolean;
}

const BLIND_PRESETS = [
  { label: '5 / 10', sb: 5, bb: 10 },
  { label: '10 / 20', sb: 10, bb: 20 },
  { label: '25 / 50', sb: 25, bb: 50 },
  { label: '50 / 100', sb: 50, bb: 100 },
] as const;

const CHIP_PRESETS = [1000, 2000, 5000, 10000] as const;

const TURN_TIMER_PRESETS = [
  { label: '15s', sec: 15 },
  { label: '30s', sec: 30 },
  { label: '60s', sec: 60 },
  { label: '120s', sec: 120 },
  { label: '不限时', sec: 0 },
] as const;

export function TitleScreen({
  initialName,
  initialRoom,
  initialAvatar,
  achievements = [],
  achievementDates = {},
  equippedPref,
  isDesktop = true,
  rooms,
  leaderboard = [],
  errorMessage,
  onEnterTable,
  onCreateRoom,
  onDeleteRoom,
  onOpenPersonalCenter,
  onOpenEmailLogin,
  onOpenCardGallery,
  fadingOut = false,
}: TitleScreenProps) {
  const { profile, authError, clearAuthError } = useAuth();
  const [customCodeOpen, setCustomCodeOpen] = useState(false);
  const [customRoomCode, setCustomRoomCode] = useState(initialRoom || '');
  const [pendingSeatRoom, setPendingSeatRoom] = useState<{
    roomId: string;
    tableName: string;
  } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [customSb, setCustomSb] = useState(10);
  const [customBb, setCustomBb] = useState(20);
  const [startingChips, setStartingChips] = useState<number>(2000);
  const [turnTimeoutSec, setTurnTimeoutSec] = useState<number>(30);
  const [creating, setCreating] = useState(false);

  const avatar = sanitizeAvatar(initialAvatar);

  const previewProfile = resolvePlayerAvatarProfile(
    {
      name: initialName.trim() || profile?.displayName || 'V',
      avatar,
      achievements: achievements.length > 0 ? achievements : (profile?.achievements ?? []),
      achievementDates:
        Object.keys(achievementDates).length > 0
          ? achievementDates
          : (profile?.achievementDates ?? {}),
      equippedAchievement: equippedPref ?? profile?.equippedAchievement,
      winStreak: profile?.currentWinStreak ?? 0,
      isBot: false,
    },
    leaderboard
  );

  const openSeatModalForRoom = (roomId: string, tableName?: string) => {
    const cleanId = roomId.trim().toUpperCase() || 'CLUB01';
    const matched = rooms.find((r) => r.roomId === cleanId);
    setPendingSeatRoom({
      roomId: cleanId,
      tableName: tableName || matched?.tableName || '私人牌桌',
    });
  };

  const handleCustomCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = customRoomCode.trim().toUpperCase();
    if (!cleanCode) return;
    openSeatModalForRoom(cleanCode);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    const sb = Math.max(1, Math.min(5000, Math.floor(Number(customSb) || 10)));
    const bb = Math.max(sb + 1, Math.min(10000, Math.floor(Number(customBb) || sb * 2)));
    setCreating(true);
    const safeStarting = Math.max(
      bb * 10,
      Math.min(200_000, Math.floor(Number(startingChips) || 2000))
    );
    const safeTurnTimeout =
      turnTimeoutSec <= 0 ? 0 : Math.max(10, Math.min(180, Math.floor(Number(turnTimeoutSec) || 30)));
    try {
      const created = await onCreateRoom({
        tableName: newTableName.trim(),
        smallBlind: sb,
        bigBlind: bb,
        startingChips: safeStarting,
        turnTimeoutSec: safeTurnTimeout,
      });
      if (created) {
        setNewTableName('');
        setCreateOpen(false);
        openSeatModalForRoom(created.roomId, created.tableName);
      }
    } finally {
      setCreating(false);
    }
  };

  const displayError = authError || errorMessage;

  return (
    <main
      data-testid="title-screen"
      aria-hidden={fadingOut || undefined}
      className={`${
        fadingOut
          ? 'fixed inset-0 z-30 pointer-events-none animate-lobby-fade-out'
          : 'relative z-10'
      } flex min-h-dvh flex-col justify-between overflow-x-hidden ${
        isDesktop
          ? 'bg-gradient-to-b from-[#080A0B]/74 via-[#080A0B]/34 to-[#080A0B]/78 lg:bg-gradient-to-r lg:from-[#080A0B]/92 lg:via-[#080A0B]/58 lg:to-[#080A0B]/12'
          : 'bg-[radial-gradient(ellipse_at_top,#10261E_0%,#090B0C_68%)]'
      }`}
    >
      {/* Slim Architectural Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3.5 sm:gap-4 sm:px-8 sm:py-4">
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
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
          className="flex items-center gap-3.5 sm:gap-5 text-xs font-medium shrink-0"
        >
          <button
            type="button"
            data-testid="open-card-gallery-btn"
            onClick={onOpenCardGallery}
            className="touch-manipulation py-1.5 text-[#A8B2AD] hover:text-[#F5F2EB] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            牌面图鉴
          </button>

          <span aria-hidden="true" className="h-3.5 w-px bg-white/[0.1]" />

          {profile ? (
            <button
              type="button"
              data-testid="open-personal-center-btn"
              onClick={() => onOpenPersonalCenter('achievements')}
              className="touch-manipulation inline-flex items-center gap-2 py-1 text-[#E6CF96] hover:text-[#F8E6B3] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PlayerAvatar
                avatar={previewProfile.avatar}
                name={initialName.trim() || profile.displayName || 'V'}
                size="xs"
              />
              <span>个人中心</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="email-signin-btn"
              onClick={() => {
                clearAuthError();
                onOpenEmailLogin();
              }}
              className="touch-manipulation py-1.5 text-[#E6CF96] hover:text-[#F8E6B3] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              登录
            </button>
          )}
        </nav>
      </header>

      {/* Open Salon Canvas: Left Editorial Directory, Right Open 3D Table */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-6 sm:px-8 sm:py-8">
        <section className="w-full max-w-[540px]">
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
          <div className="mt-8 flex items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
            <div className="flex items-center gap-2 text-xs text-[#8D9792]">
              <span className="font-medium text-[#DEDAD2]">牌桌大厅</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">{rooms.length} 桌在线</span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                data-testid="toggle-room-code-btn"
                onClick={() => setCustomCodeOpen((prev) => !prev)}
                className="touch-manipulation text-xs text-[#9AA5A0] hover:text-[#E8CF96] transition-colors whitespace-nowrap cursor-pointer"
              >
                {customCodeOpen ? '收起房号' : '输房号加入'}
              </button>

              <button
                type="button"
                data-testid="toggle-create-room-btn"
                onClick={() => setCreateOpen((prev) => !prev)}
                className="touch-manipulation inline-flex h-8 items-center gap-1.5 rounded-md border border-[#D4A853]/50 bg-[#0D1012]/85 px-3 text-xs font-semibold text-[#F0D99F] backdrop-blur-sm hover:border-[#D4A853]/75 hover:bg-[#191710]/95 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
          </div>

          {/* Compact Join-by-Room-Code Bar */}
          {customCodeOpen && (
            <form
              onSubmit={handleCustomCodeSubmit}
              className="mt-3 flex items-center gap-2"
            >
              <input
                id="room-code-input"
                type="text"
                maxLength={12}
                placeholder="输入好友分享的房间号"
                value={customRoomCode}
                onChange={(e) => setCustomRoomCode(e.target.value.toUpperCase())}
                className="font-mono-num h-9 flex-1 rounded border border-white/[0.12] bg-[#080A0B]/95 px-3 text-sm text-[#E8CF96] placeholder:text-[#5B6460] focus:border-[#D4A853] focus:outline-none"
              />
              <button
                type="submit"
                className="touch-manipulation inline-flex h-9 items-center gap-1 rounded bg-[#D4A853] px-3.5 text-xs font-bold text-[#0F1210] hover:bg-[#E1B968] transition-colors whitespace-nowrap cursor-pointer"
              >
                <span>进入</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </form>
          )}

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
                  className="h-9 w-full rounded border border-white/[0.12] bg-[#080A0B] px-3 text-sm text-[#F3F1EC] placeholder:text-[#5B6460] focus:border-[#D4A853] focus:outline-none"
                />
              </div>

              <div>
                <span className="block text-[11px] font-medium text-[#A1ABA6] mb-1.5">
                  盲注级别
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
                        className={`touch-manipulation font-mono-num h-8 rounded border text-xs font-semibold transition-colors cursor-pointer ${
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
                  <div className="flex items-center gap-2 rounded border border-white/[0.1] bg-[#080A0B] px-2.5 h-8">
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
                  <div className="flex items-center gap-2 rounded border border-white/[0.1] bg-[#080A0B] px-2.5 h-8">
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
                      className={`touch-manipulation font-mono-num h-8 rounded border text-xs font-semibold transition-colors cursor-pointer ${
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
                    className="font-mono-num h-8 w-full rounded border border-white/[0.12] bg-[#080A0B] px-2 text-center text-xs text-[#E8CF96] focus:border-[#D4A853] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-[#A1ABA6]">回合倒计时</span>
                  <span className="font-mono-num text-[11px] text-[#8CC9AA]">
                    {turnTimeoutSec === 0 ? '已取消倒计时' : `每回合 ${turnTimeoutSec} 秒`}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {TURN_TIMER_PRESETS.map((preset) => {
                    const active = turnTimeoutSec === preset.sec;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        data-testid={`turn-timer-preset-${preset.sec}`}
                        onClick={() => setTurnTimeoutSec(preset.sec)}
                        className={`touch-manipulation font-mono-num h-8 rounded border text-xs font-semibold transition-colors cursor-pointer ${
                          active
                            ? preset.sec === 0
                              ? 'border-[#34D399]/75 bg-[#34D399]/16 text-[#8CE7C1]'
                              : 'border-[#D4A853] bg-[#D4A853]/18 text-[#F5E4B8]'
                            : 'border-white/[0.1] bg-[#080A0B] text-[#949E99] hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    id="create-turn-timeout-slider"
                    data-testid="turn-timeout-slider"
                    type="range"
                    min={10}
                    max={185}
                    step={5}
                    aria-label="回合倒计时滑块（拉至最右取消倒计时）"
                    value={turnTimeoutSec === 0 ? 185 : turnTimeoutSec}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setTurnTimeoutSec(v > 180 ? 0 : v);
                    }}
                    className="poker-slider flex-1"
                  />
                  <span className="font-mono-num w-14 text-right text-[11px] text-[#C8D0CC] shrink-0">
                    {turnTimeoutSec === 0 ? '不限时' : `${turnTimeoutSec}s`}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                data-testid="confirm-create-room-btn"
                disabled={creating}
                className="touch-manipulation flex h-9 w-full items-center justify-center gap-1.5 rounded bg-[#D4A853] px-4 text-xs font-bold text-[#0F1210] hover:bg-[#E1B968] disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{creating ? '创建中...' : '确认创建牌桌'}</span>
              </button>
            </form>
          )}

          {displayError && (
            <p role="alert" className="mt-3 text-xs font-medium text-[#F87171]">
              {displayError}
            </p>
          )}

          {/* Architectural Hairline Table Directory */}
          <div className="mt-1 max-h-80 overflow-y-auto divide-y divide-white/[0.07]">
            {rooms.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#7E8782]">
                暂无活跃牌桌，点击上方「创建牌桌」开设新桌。
              </div>
            ) : (
              rooms.map((room) => (
                <div
                  key={room.roomId}
                  className="flex items-center justify-between gap-3 py-4 px-1 hover:bg-white/[0.02] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => openSeatModalForRoom(room.roomId, room.tableName)}
                    className="min-w-0 flex-1 text-left cursor-pointer"
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
                      <span
                        className={`font-mono-num ${
                          room.turnTimeoutSec === 0 ? 'text-[#8CC9AA]' : ''
                        }`}
                      >
                        {room.turnTimeoutSec === 0 ? '不限时' : `${room.turnTimeoutSec ?? 30}s`}
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
                      data-testid={`enter-room-btn-${room.roomId}`}
                      onClick={() => openSeatModalForRoom(room.roomId, room.tableName)}
                      className="touch-manipulation h-8 rounded border border-[#D4A853]/40 bg-[#14181B]/90 px-3.5 text-xs font-semibold text-[#E8CF96] hover:border-[#D4A853] hover:bg-[#D4A853] hover:text-[#0F1210] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      进入
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRoom(room.roomId)}
                      aria-label={`删除牌桌 ${room.tableName}`}
                      title="删除牌桌"
                      className="touch-manipulation flex h-8 w-8 items-center justify-center rounded border border-white/[0.08] text-[#8E9893] hover:border-[#DC2626]/50 hover:bg-[#DC2626]/15 hover:text-[#FCA5A5] transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Quiet Footer */}
      <footer className="mx-auto w-full max-w-6xl border-t border-white/[0.06] px-5 py-3.5 sm:px-8 text-center sm:text-left text-xs text-[#6F7873]">
        {isDesktop
          ? '快捷键：F 弃牌 · C / 空格 让牌或跟注 · R 加注 · T 对话 · M 静音'
          : '移动端极简 2D 牌桌模式 · 点击下方按钮操作'}
      </footer>

      {/* Lightweight Pre-Table Seat Registration Popup */}
      <SeatEntryModal
        open={Boolean(pendingSeatRoom)}
        roomId={pendingSeatRoom?.roomId ?? 'CLUB01'}
        tableName={pendingSeatRoom?.tableName ?? '私人牌桌'}
        initialName={initialName || profile?.displayName || ''}
        initialAvatar={avatar}
        onClose={() => setPendingSeatRoom(null)}
        onConfirm={(chosenName, chosenAvatar) => {
          if (!pendingSeatRoom) return;
          const targetId = pendingSeatRoom.roomId;
          setPendingSeatRoom(null);
          onEnterTable(chosenName, targetId, chosenAvatar);
        }}
      />
    </main>
  );
}
