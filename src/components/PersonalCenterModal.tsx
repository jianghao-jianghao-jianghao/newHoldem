import { useEffect, useRef, useState } from 'react';
import { Check, Lock, LogIn, LogOut, RotateCcw, Upload, X } from 'lucide-react';
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_MAP,
  ACHIEVEMENT_TIER_LABELS,
  ACHIEVEMENTS,
  formatAchievementDateTime,
  resolveEquippedAchievement,
  type AchievementCategory,
  type AchievementDatesMap,
  type AchievementId,
  type AchievementTier,
  type EquippedAchievementPref,
  type PlayerAchievementStats,
} from '../shared/achievements';
import {
  AVATAR_PRESETS,
  isCustomAvatarDataUrl,
  MAX_CUSTOM_AVATAR_BYTES,
  sanitizeAvatar,
} from '../shared/avatarUtils';
import { resolvePlayerAvatarProfile, type RankTier } from '../shared/playerProfile';
import type { LeaderboardEntry } from '../shared/types';
import { useAuth } from '../context/AuthContext';
import { AchievementMedalIcon, AvatarAchievementShowcase } from './AchievementBadge';
import { PlayerAvatar } from './PlayerAvatar';

export type PersonalCenterTab = 'achievements' | 'profile';

interface PersonalCenterModalProps {
  open: boolean;
  initialTab?: PersonalCenterTab;
  playerName: string;
  playerAvatar: string;
  unlockedIds: AchievementId[];
  achievementDates?: AchievementDatesMap;
  equippedPref?: EquippedAchievementPref;
  winStreak: number;
  stats?: PlayerAchievementStats | null;
  leaderboard: LeaderboardEntry[];
  onUpdateName: (nextName: string) => void;
  onUpdateAvatar: (nextAvatar: string) => void;
  onEquipAchievement: (nextPref: EquippedAchievementPref) => void;
  onRequestEmailLogin?: () => void;
  onClose: () => void;
}

const TIER_TEXT_CLASS: Record<AchievementTier, string> = {
  bronze: 'text-[#D09568]',
  silver: 'text-[#B9C7D4]',
  gold: 'text-[#E3C685]',
  obsidian: 'text-[#F0D37A]',
};

const RANK_TIER_TEXT_CLASS: Record<RankTier, string> = {
  bronze: 'text-[#D8A176]',
  silver: 'text-[#C6D4E0]',
  gold: 'text-[#E9CE84]',
  diamond: 'text-[#8CD9FA]',
};

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

export function PersonalCenterModal({
  open,
  initialTab = 'achievements',
  playerName,
  playerAvatar,
  unlockedIds,
  achievementDates = {},
  equippedPref,
  winStreak,
  stats,
  leaderboard,
  onUpdateName,
  onUpdateAvatar,
  onEquipAchievement,
  onRequestEmailLogin,
  onClose,
}: PersonalCenterModalProps) {
  const { profile, signOutUser } = useAuth();
  const [activeTab, setActiveTab] = useState<PersonalCenterTab>(initialTab);
  const [category, setCategory] = useState<'all' | AchievementCategory>('all');
  const [draftName, setDraftName] = useState(playerName);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setDraftName(playerName);
      setUploadError(null);
    }
  }, [open, initialTab, playerName]);

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

  const unlockedSet = new Set<AchievementId>(unlockedIds);
  const activeEquippedId = resolveEquippedAchievement(equippedPref, unlockedIds);
  const activeEquippedDef = activeEquippedId ? ACHIEVEMENT_MAP.get(activeEquippedId) : null;

  const previewProfile = resolvePlayerAvatarProfile(
    {
      name: draftName.trim() || playerName || '牌手',
      avatar: playerAvatar,
      achievements: unlockedIds,
      achievementDates,
      equippedAchievement: equippedPref,
      winStreak,
      isBot: false,
    },
    leaderboard
  );

  const filteredAchievements = ACHIEVEMENTS.filter(
    (item) => category === 'all' || item.category === category
  );
  const unlockedList = filteredAchievements
    .filter((item) => unlockedSet.has(item.id))
    .sort((a, b) => b.priority - a.priority);
  const lockedList = filteredAchievements
    .filter((item) => !unlockedSet.has(item.id))
    .sort((a, b) => b.priority - a.priority);

  const handsPlayed = Math.max(
    stats?.handsPlayed ?? 0,
    profile?.handsPlayed ?? 0,
    previewProfile.handsPlayed
  );
  const handsWon = Math.max(
    stats?.handsWon ?? 0,
    profile?.handsWon ?? 0,
    previewProfile.handsWon
  );
  const winRate = handsPlayed > 0 ? `${Math.round((handsWon / handsPlayed) * 100)}%` : '—';
  const maxWinStreak = Math.max(
    stats?.maxWinStreak ?? 0,
    profile?.maxWinStreak ?? 0,
    winStreak
  );
  const maxPotWon = stats?.maxPotWon ?? 0;

  const showRealEmail = Boolean(profile?.email && !profile.email.endsWith('@club.velvet'));

  const commitName = () => {
    const clean = draftName.trim().slice(0, 18);
    if (clean && clean !== playerName) {
      onUpdateName(clean);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('仅支持 PNG、JPG 或 WebP 图片');
      return;
    }
    const processed = await resizeAvatarImage(file);
    if (!processed) {
      setUploadError('图片处理失败，请更换一张重试');
      return;
    }
    setUploadError(null);
    onUpdateAvatar(processed);
  };

  const handleToggleEquip = (id: AchievementId) => {
    if (!unlockedSet.has(id)) return;
    if (activeEquippedId === id) {
      onEquipAchievement('none');
    } else {
      onEquipAchievement(id);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="个人中心"
      data-testid="personal-center-modal"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/76 backdrop-blur-sm p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-[820px] flex-col md:flex-row overflow-hidden rounded-lg border border-white/[0.09] bg-[#0B0E10] text-[#F3F1EC] shadow-[0_32px_84px_rgba(0,0,0,0.82)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Identity Spine */}
        <aside className="flex w-full md:w-[258px] shrink-0 flex-col justify-between border-b md:border-b-0 md:border-r border-white/[0.07] bg-[#090B0D] px-6 py-6">
          <div>
            {/* Mobile Close Row */}
            <div className="mb-4 flex items-center justify-between md:hidden">
              <span className="font-display text-sm font-semibold tracking-wide text-[#DEDAD2]">
                牌手档案
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭个人中心"
                className="flex h-8 w-8 items-center justify-center rounded-md text-[#86918B] hover:bg-white/[0.06] hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Portrait Pedestal */}
            <div className="flex flex-col items-center text-center">
              <div className="relative overflow-visible">
                <PlayerAvatar
                  avatar={previewProfile.avatar}
                  name={draftName.trim() || playerName || 'V'}
                  size="xl"
                  level={previewProfile.levelInfo.level}
                  levelTier={previewProfile.levelInfo.tier}
                  levelTitle={previewProfile.levelInfo.title}
                  rankTier={previewProfile.rankTier}
                  showLevelBadge
                  showRankAura
                />
                <AvatarAchievementShowcase
                  equippedAchievement={activeEquippedId}
                  achievementDates={achievementDates}
                  size="sm"
                  tooltipPlacement="bottom"
                  className="absolute -top-1.5 -right-1.5 z-20"
                />
              </div>

              {/* Quiet Inline Editable Name */}
              <div className="mt-4 w-full">
                <input
                  id="pc-nickname-input"
                  data-testid="pc-name-input"
                  type="text"
                  maxLength={18}
                  aria-label="牌手昵称"
                  placeholder="未命名牌手"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitName();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  className="w-full border-b border-transparent bg-transparent pb-0.5 text-center font-display text-lg font-bold tracking-tight text-[#F6F3EC] placeholder:text-[#5B6460] hover:border-white/[0.14] focus:border-[#D4A853] focus:outline-none transition-colors"
                />
              </div>

              <div className="mt-1.5 flex items-center justify-center gap-2 text-xs">
                <span
                  className={`font-medium ${RANK_TIER_TEXT_CLASS[previewProfile.rankTier]}`}
                >
                  {previewProfile.rankTierLabel}
                </span>
                <span aria-hidden="true" className="text-white/20">
                  ·
                </span>
                <span className="font-mono-num text-[#9DA8A3]">
                  Lv.{previewProfile.levelInfo.level}
                </span>
              </div>

              {showRealEmail && (
                <p className="mt-1 max-w-full truncate text-[11px] text-[#6E7873]">
                  {profile?.email}
                </p>
              )}
            </div>

            {/* 2x2 Hairline Telemetry Ledger (zero nested boxes) */}
            <div className="mt-6 grid grid-cols-2 border-t border-white/[0.07]">
              <div className="border-r border-b border-white/[0.07] py-3.5 pr-3">
                <div className="text-[11px] text-[#75807B]">积分</div>
                <div className="mt-1 font-mono-num text-base font-semibold text-[#ECCF8E]">
                  {previewProfile.points.toLocaleString()}
                </div>
              </div>
              <div className="border-b border-white/[0.07] py-3.5 pl-4">
                <div className="text-[11px] text-[#75807B]">胜率</div>
                <div className="mt-1 font-mono-num text-base font-semibold text-[#F3F1EC]">
                  {winRate}
                </div>
              </div>
              <div className="border-r border-white/[0.07] py-3.5 pr-3">
                <div className="text-[11px] text-[#75807B]">最高连胜</div>
                <div className="mt-1 font-mono-num text-base font-semibold text-[#F3F1EC]">
                  {maxWinStreak}
                  <span className="ml-0.5 text-xs font-normal text-[#7E8984]">局</span>
                </div>
              </div>
              <div className="py-3.5 pl-4">
                <div className="text-[11px] text-[#75807B]">最大底池</div>
                <div className="mt-1 font-mono-num text-base font-semibold text-[#F3F1EC]">
                  {maxPotWon > 0 ? maxPotWon.toLocaleString() : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Quiet Account Action */}
          <div className="mt-6 border-t border-white/[0.07] pt-4">
            {profile ? (
              <button
                type="button"
                data-testid="pc-signout-btn"
                onClick={() => void handleSignOut()}
                className="touch-manipulation inline-flex w-full items-center justify-center gap-1.5 py-1.5 text-xs text-[#8A9590] hover:text-[#F3F1EC] transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>退出登录</span>
              </button>
            ) : onRequestEmailLogin ? (
              <button
                type="button"
                data-testid="pc-login-btn"
                onClick={() => {
                  onClose();
                  onRequestEmailLogin();
                }}
                className="touch-manipulation inline-flex h-9 w-full items-center justify-center gap-1.5 rounded border border-[#D4A853]/45 bg-[#D4A853]/10 text-xs font-medium text-[#EED9A5] hover:bg-[#D4A853]/20 transition-colors cursor-pointer"
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>登录账号</span>
              </button>
            ) : null}
          </div>
        </aside>

        {/* Right Editorial Canvas */}
        <section className="flex min-h-0 flex-1 flex-col bg-[#0D1012]">
          {/* Hairline Tab Header */}
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-6">
            <div role="tablist" aria-label="个人中心分区" className="flex items-center gap-6">
              <button
                type="button"
                role="tab"
                data-testid="pc-tab-achievements"
                aria-selected={activeTab === 'achievements'}
                onClick={() => setActiveTab('achievements')}
                className={`relative py-4 text-xs font-semibold tracking-wide transition-colors cursor-pointer ${
                  activeTab === 'achievements'
                    ? 'text-[#F2DC9F]'
                    : 'text-[#848F8A] hover:text-[#D5DDD8]'
                }`}
              >
                <span>勋章陈列</span>
                <span className="ml-1.5 font-mono-num text-[11px] font-normal text-[#78837E]">
                  {unlockedIds.length}/{ACHIEVEMENTS.length}
                </span>
                {activeTab === 'achievements' && (
                  <span className="absolute right-0 bottom-0 left-0 h-[2px] bg-[#D4A853]" />
                )}
              </button>

              <button
                type="button"
                role="tab"
                data-testid="pc-tab-profile"
                aria-selected={activeTab === 'profile'}
                onClick={() => setActiveTab('profile')}
                className={`relative py-4 text-xs font-semibold tracking-wide transition-colors cursor-pointer ${
                  activeTab === 'profile'
                    ? 'text-[#F2DC9F]'
                    : 'text-[#848F8A] hover:text-[#D5DDD8]'
                }`}
              >
                形象设置
                {activeTab === 'profile' && (
                  <span className="absolute right-0 bottom-0 left-0 h-[2px] bg-[#D4A853]" />
                )}
              </button>
            </div>

            <button
              type="button"
              data-testid="personal-center-close-btn"
              onClick={onClose}
              aria-label="关闭个人中心"
              className="hidden md:flex h-8 w-8 items-center justify-center rounded-md text-[#86918B] hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {activeTab === 'achievements' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Quiet Category Filter + Current Equipped Line */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-6 py-2.5">
                <div className="flex items-center gap-4 text-xs">
                  {(['all', 'glory', 'fun', 'tactics'] as const).map((cat) => {
                    const active = category === cat;
                    const label = cat === 'all' ? '全部' : ACHIEVEMENT_CATEGORY_LABELS[cat];
                    return (
                      <button
                        key={cat}
                        type="button"
                        data-testid={`pc-ach-cat-${cat}`}
                        onClick={() => setCategory(cat)}
                        className={`py-0.5 font-medium transition-colors cursor-pointer ${
                          active
                            ? 'text-[#F0DFB3]'
                            : 'text-[#7A8580] hover:text-[#D5DDD8]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {activeEquippedDef && (
                  <div className="flex items-center gap-2 text-[11px] text-[#8E9893]">
                    <span>
                      佩戴中
                      <strong className="ml-1.5 font-medium text-[#E8CF96]">
                        {activeEquippedDef.name}
                      </strong>
                    </span>
                    <button
                      type="button"
                      data-testid="pc-ach-unequip-btn"
                      onClick={() => onEquipAchievement('none')}
                      className="text-[#8E9893] underline underline-offset-2 hover:text-white cursor-pointer"
                    >
                      卸下
                    </button>
                  </div>
                )}
              </div>

              {/* Hairline Architectural Ledger of Medals (zero nested card walls) */}
              <div className="chat-scroll flex-1 overflow-y-auto px-6 py-2">
                {unlockedList.length > 0 && (
                  <div className="divide-y divide-white/[0.06]">
                    {unlockedList.map((ach) => {
                      const equipped = activeEquippedId === ach.id;
                      const unlockDate = achievementDates[ach.id]
                        ? formatAchievementDateTime(achievementDates[ach.id]).split(' ')[0]
                        : null;
                      return (
                        <div
                          key={ach.id}
                          data-testid={`pc-achievement-card-${ach.id}`}
                          className={`flex items-center gap-3.5 py-3.5 pl-3 -ml-3 pr-1 ${
                            equipped
                              ? 'border-l-2 border-[#D4A853] bg-[#D4A853]/[0.05]'
                              : 'border-l-2 border-transparent'
                          }`}
                        >
                          <AchievementMedalIcon id={ach.id} size="md" />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-semibold text-[#F4F1EA]">
                                {ach.name}
                              </span>
                              <span
                                className={`text-[10px] font-medium shrink-0 ${TIER_TEXT_CLASS[ach.tier]}`}
                              >
                                {ACHIEVEMENT_TIER_LABELS[ach.tier]}
                              </span>
                              {unlockDate && (
                                <span className="hidden sm:inline font-mono-num text-[10px] text-[#69746F]">
                                  {unlockDate}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-[#8A948F]">
                              {ach.description}
                            </p>
                          </div>

                          <button
                            type="button"
                            data-testid={`equip-medal-btn-${ach.id}`}
                            aria-pressed={equipped}
                            onClick={() => handleToggleEquip(ach.id)}
                            className={`touch-manipulation inline-flex h-7 shrink-0 items-center gap-1 rounded px-2.5 text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                              equipped
                                ? 'bg-[#D4A853] text-[#0F1210] hover:bg-[#E1B968]'
                                : 'border border-white/[0.12] text-[#C8D0CC] hover:border-[#D4A853]/60 hover:text-[#F0DFB3]'
                            }`}
                          >
                            {equipped ? (
                              <>
                                <Check className="h-3 w-3" aria-hidden="true" />
                                <span>已佩戴</span>
                              </>
                            ) : (
                              <span>佩戴</span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {lockedList.length > 0 && (
                  <div className={unlockedList.length > 0 ? 'mt-4' : ''}>
                    <div className="border-b border-white/[0.06] pb-2 text-[11px] font-medium text-[#6C7772]">
                      未解锁 · {lockedList.length}
                    </div>
                    <div className="divide-y divide-white/[0.05]">
                      {lockedList.map((ach) => (
                        <div
                          key={ach.id}
                          data-testid={`pc-achievement-card-${ach.id}`}
                          className="flex items-center gap-3.5 py-3 opacity-55"
                        >
                          <AchievementMedalIcon id={ach.id} size="md" locked />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-medium text-[#CFD6D2]">
                                {ach.name}
                              </span>
                              <span
                                className={`text-[10px] shrink-0 ${TIER_TEXT_CLASS[ach.tier]}`}
                              >
                                {ACHIEVEMENT_TIER_LABELS[ach.tier]}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-[#79847F]">
                              {ach.description}
                            </p>
                          </div>

                          <Lock className="h-3.5 w-3.5 shrink-0 text-[#5D6863]" aria-hidden="true" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="chat-scroll flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {/* Emblem Gallery */}
              <div>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#DEDAD2]">俱乐部徽章</span>

                  <div className="flex items-center gap-2">
                    {isCustomAvatarDataUrl(playerAvatar) && (
                      <button
                        type="button"
                        onClick={() => onUpdateAvatar('default')}
                        className="touch-manipulation inline-flex h-8 items-center gap-1 rounded border border-white/[0.1] px-2.5 text-xs text-[#9AA5A0] hover:text-white transition-colors cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        <span>恢复默认</span>
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="upload-avatar-btn"
                      onClick={() => fileInputRef.current?.click()}
                      className="touch-manipulation inline-flex h-8 items-center gap-1.5 rounded border border-white/[0.12] px-3 text-xs font-medium text-[#D5DDD8] hover:border-[#D4A853]/50 hover:text-[#F0DFB3] transition-colors cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>上传图片</span>
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

                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {AVATAR_PRESETS.map((preset) => {
                    const selected = playerAvatar === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        data-testid={`avatar-preset-${preset.id}`}
                        aria-pressed={selected}
                        onClick={() => {
                          setUploadError(null);
                          onUpdateAvatar(preset.id);
                        }}
                        className={`touch-manipulation flex flex-col items-center justify-center gap-1.5 rounded-md py-3 px-1 transition-colors cursor-pointer ${
                          selected
                            ? 'bg-[#D4A853]/14 text-[#F5E4B8] ring-1 ring-[#D4A853]/65'
                            : 'text-[#87928C] hover:bg-white/[0.04] hover:text-white'
                        }`}
                      >
                        <PlayerAvatar
                          avatar={preset.id}
                          name={draftName || playerName || 'V'}
                          size="sm"
                        />
                        <span className="text-[11px] leading-none whitespace-nowrap">
                          {preset.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {uploadError && (
                  <p role="alert" className="mt-2.5 text-xs text-[#F87171]">
                    {uploadError}
                  </p>
                )}
              </div>

              {/* Quiet Equipped Medal Summary */}
              <div className="border-t border-white/[0.07] pt-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {activeEquippedId && activeEquippedDef ? (
                    <>
                      <AchievementMedalIcon id={activeEquippedId} size="md" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#F3F1EC]">
                          {activeEquippedDef.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#7D8883]">
                          当前佩戴勋章 · {ACHIEVEMENT_TIER_LABELS[activeEquippedDef.tier]}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div>
                      <div className="text-xs font-medium text-[#CFD6D2]">未佩戴勋章</div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeEquippedId && (
                    <button
                      type="button"
                      data-testid="pc-unequip-medal-btn"
                      onClick={() => onEquipAchievement('none')}
                      className="touch-manipulation h-8 px-2.5 text-xs text-[#9AA5A0] hover:text-white transition-colors cursor-pointer"
                    >
                      卸下
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="pc-goto-medals-btn"
                    onClick={() => setActiveTab('achievements')}
                    className="touch-manipulation h-8 rounded border border-white/[0.12] px-3 text-xs font-medium text-[#EED9A5] hover:border-[#D4A853]/60 transition-colors cursor-pointer"
                  >
                    {activeEquippedId ? '更换' : '挑选勋章'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
