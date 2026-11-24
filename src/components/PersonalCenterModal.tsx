import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
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
import {
  buildPlayerPersonaReport,
  SESSION_PATTERN_META,
  type AiPersonaAnalysis,
  type PlayerBehaviorStats,
  type PokerRadarAxis,
} from '../shared/playerInsights';
import { resolvePlayerAvatarProfile, type RankTier } from '../shared/playerProfile';
import type { LeaderboardEntry } from '../shared/types';
import { useAuth } from '../context/AuthContext';
import { AchievementMedalIcon, AvatarAchievementShowcase } from './AchievementBadge';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerRadarChart } from './PlayerRadarChart';
import { WinCompositionRing } from './WinCompositionRing';

const SERVER_BASE_URL = (
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? ''
)
  .trim()
  .replace(/\/+$/, '');

function getPersonaApiUrl(path: string): string {
  return SERVER_BASE_URL ? `${SERVER_BASE_URL}${path}` : path;
}

export type PersonalCenterTab = 'achievements' | 'insights' | 'profile';

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
  behaviorStats?: PlayerBehaviorStats | null;
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
  behaviorStats,
  leaderboard,
  onUpdateName,
  onUpdateAvatar,
  onEquipAchievement,
  onRequestEmailLogin,
  onClose,
}: PersonalCenterModalProps) {
  const { profile, authToken, signOutUser } = useAuth();
  const [activeTab, setActiveTab] = useState<PersonalCenterTab>(initialTab);
  const [category, setCategory] = useState<'all' | AchievementCategory>('all');
  const [draftName, setDraftName] = useState(playerName);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AiPersonaAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiCacheKeyRef = useRef<string | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setDraftName(playerName);
      setUploadError(null);
    } else if (aiAbortRef.current) {
      aiAbortRef.current.abort();
      aiAbortRef.current = null;
      setAiLoading(false);
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

  const resolvedBehaviorStats = useMemo(() => {
    const cleanLookup = (draftName.trim() || playerName).trim();
    const lbMatch = cleanLookup
      ? leaderboard.find((e) => e.playerName === cleanLookup)?.behaviorStats ?? null
      : null;
    const candidates = [behaviorStats ?? null, profile?.behaviorStats ?? null, lbMatch].filter(
      (x): x is PlayerBehaviorStats => Boolean(x)
    );
    return candidates.sort((a, b) => b.handsPlayed - a.handsPlayed)[0] ?? null;
  }, [behaviorStats, profile?.behaviorStats, leaderboard, draftName, playerName]);

  const personaReport = useMemo(
    () => buildPlayerPersonaReport(resolvedBehaviorStats),
    [resolvedBehaviorStats]
  );

  const personaCacheKey = useMemo(() => {
    const cleanLookup = (draftName.trim() || playerName || '牌手').trim();
    const m = personaReport.metrics;
    return `${cleanLookup}:${personaReport.handsPlayed}:${m.vpipPct}:${m.pfrPct}:${m.aggPct}`;
  }, [draftName, playerName, personaReport]);

  const requestAiPersonaAnalysis = useCallback(
    async (forceRefresh = false) => {
      if (personaReport.handsPlayed < 1) return;
      if (!forceRefresh && aiCacheKeyRef.current === personaCacheKey && aiAnalysis) {
        return;
      }

      if (aiAbortRef.current) {
        aiAbortRef.current.abort();
      }
      const controller = new AbortController();
      aiAbortRef.current = controller;

      setAiLoading(true);
      setAiError(null);
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`;
        }
        const res = await fetch(getPersonaApiUrl('/api/persona/analyze'), {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            playerName: (draftName.trim() || playerName || '牌手').trim(),
            behaviorStats: resolvedBehaviorStats,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          analysis?: AiPersonaAnalysis;
          error?: string;
        };
        if (!res.ok || !data.ok || !data.analysis) {
          setAiError(data.error ?? '画像解读暂时不可用，请稍后重试。');
          return;
        }
        aiCacheKeyRef.current = personaCacheKey;
        setAiAnalysis(data.analysis);
        setAiError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setAiError('暂时无法获取牌风解读，请检查网络后重试。');
      } finally {
        if (aiAbortRef.current === controller) {
          aiAbortRef.current = null;
          setAiLoading(false);
        }
      }
    },
    [
      personaReport.handsPlayed,
      personaCacheKey,
      aiAnalysis,
      authToken,
      draftName,
      playerName,
      resolvedBehaviorStats,
    ]
  );

  // Auto-generate AI persona once per data snapshot when viewing the insights tab with recorded hands
  useEffect(() => {
    if (!open || activeTab !== 'insights' || personaReport.handsPlayed < 1) return;
    if (aiCacheKeyRef.current === personaCacheKey && (aiAnalysis || aiError)) return;
    if (aiLoading) return;
    aiCacheKeyRef.current = personaCacheKey;
    void requestAiPersonaAnalysis(true);
  }, [
    open,
    activeTab,
    personaReport.handsPlayed,
    personaCacheKey,
    aiAnalysis,
    aiError,
    aiLoading,
    requestAiPersonaAnalysis,
  ]);

  const activeAiAnalysis =
    aiAnalysis && aiAnalysis.analyzedHands === personaReport.handsPlayed ? aiAnalysis : null;

  const displayRadarAxes: PokerRadarAxis[] = useMemo(() => {
    if (!activeAiAnalysis?.radarScores) return personaReport.radarAxes;
    return personaReport.radarAxes.map((axis) => {
      const aiScore = activeAiAnalysis.radarScores?.[axis.key];
      return typeof aiScore === 'number' && Number.isFinite(aiScore)
        ? { ...axis, score: Math.max(5, Math.min(100, Math.round(aiScore))) }
        : axis;
    });
  }, [personaReport.radarAxes, activeAiAnalysis]);

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
  const foldWinsCount = stats?.foldWins ?? 0;
  const showdownWinsCount = Math.max(
    resolvedBehaviorStats?.wonAtShowdownHands ?? 0,
    Math.max(0, handsWon - foldWinsCount)
  );

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

  const handleEquipMedal = (id: AchievementId) => {
    if (!unlockedSet.has(id) || activeEquippedId === id) return;
    onEquipAchievement(id);
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
      className="personal-center-modal pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/76 backdrop-blur-md p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[89dvh] w-full max-w-[944px] flex-col md:flex-row overflow-hidden rounded-2xl border border-white/[0.08] bg-[#12110F] text-[#EFECE4] shadow-[0_36px_96px_rgba(0,0,0,0.84)] ring-1 ring-white/[0.04]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Identity Spine */}
        <aside className="flex w-full md:w-[272px] shrink-0 flex-col justify-between md:overflow-y-auto chat-scroll border-b md:border-b-0 md:border-r border-white/[0.06] bg-[#0F0E0C] px-6 py-6 sm:px-6 sm:py-7">
          <div>
            {/* Mobile Close Row */}
            <div className="mb-4 flex items-center justify-between md:hidden">
              <span className="font-display text-sm font-semibold tracking-wide text-[#DED7CB]">
                牌手档案
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭个人中心"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#8E877D] hover:bg-white/[0.06] hover:text-[#F4F0E8] cursor-pointer"
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
                  className="w-full border-b border-transparent bg-transparent pb-0.5 text-center font-display text-xl font-semibold tracking-tight text-[#F5F1E8] placeholder:text-[#5E584F] hover:border-white/[0.14] focus:border-[#C9A25B] focus:outline-none transition-colors"
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
                <span className="font-mono-num text-[#9F988D]">
                  Lv.{previewProfile.levelInfo.level}
                </span>
              </div>

              {showRealEmail && (
                <p className="mt-1 max-w-full truncate text-[11px] text-[#756E65]">
                  {profile?.email}
                </p>
              )}
            </div>

            {/* 2x2 Floating Stat Tiles */}
            <div className="mt-7 grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-white/[0.055] bg-white/[0.025] px-3.5 py-3 transition-colors hover:border-white/[0.1]">
                <div className="text-[11px] text-[#847D73]">积分</div>
                <div className="mt-1.5 font-mono-num text-[17px] leading-none font-semibold text-[#E4CB96]">
                  {previewProfile.points.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.055] bg-white/[0.025] px-3.5 py-3 transition-colors hover:border-white/[0.1]">
                <div className="text-[11px] text-[#847D73]">胜率</div>
                <div className="mt-1.5 font-mono-num text-[17px] leading-none font-semibold text-[#EFECE4]">
                  {winRate}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.055] bg-white/[0.025] px-3.5 py-3 transition-colors hover:border-white/[0.1]">
                <div className="text-[11px] text-[#847D73]">最高连胜</div>
                <div className="mt-1.5 font-mono-num text-[17px] leading-none font-semibold text-[#EFECE4]">
                  {maxWinStreak}
                  <span className="ml-0.5 text-xs font-normal text-[#857E74]">局</span>
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.055] bg-white/[0.025] px-3.5 py-3 transition-colors hover:border-white/[0.1]">
                <div className="text-[11px] text-[#847D73]">最大底池</div>
                <div className="mt-1.5 font-mono-num text-[17px] leading-none font-semibold text-[#EFECE4]">
                  {maxPotWon > 0 ? maxPotWon.toLocaleString() : '—'}
                </div>
              </div>
            </div>

            {/* Dynamic Win-Rate Composition Ring */}
            <WinCompositionRing
              handsPlayed={handsPlayed}
              handsWon={handsWon}
              showdownWins={showdownWinsCount}
              foldWins={foldWinsCount}
            />
          </div>

          {/* Quiet Account Action */}
          <div className="mt-6 pt-4">
            {profile ? (
              <button
                type="button"
                data-testid="pc-signout-btn"
                onClick={() => void handleSignOut()}
                className="touch-manipulation inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] text-xs text-[#948D82] hover:border-white/[0.12] hover:text-[#EFECE4] transition-colors cursor-pointer"
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
                className="touch-manipulation inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#C9A25B]/40 bg-[#C9A25B]/[0.06] text-xs font-medium text-[#E8D09B] hover:border-[#C9A25B]/75 hover:bg-[#C9A25B]/14 transition-colors cursor-pointer"
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>登录账号</span>
              </button>
            ) : null}
          </div>
        </aside>

        {/* Right Modern Card Canvas */}
        <section className="flex min-h-0 flex-1 flex-col bg-[#141310]">
          {/* Clear Hierarchical Segmented Tab Header */}
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-6 py-3.5 sm:px-7">
            <div
              role="tablist"
              aria-label="个人中心分区"
              className="inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-[#0F0E0C]/85 p-1"
            >
              <button
                type="button"
                role="tab"
                data-testid="pc-tab-achievements"
                aria-selected={activeTab === 'achievements'}
                onClick={() => setActiveTab('achievements')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium tracking-wide transition-all cursor-pointer ${
                  activeTab === 'achievements'
                    ? 'bg-[#23201B] text-[#F4E7C8] shadow-[0_2px_10px_rgba(0,0,0,0.38)] ring-1 ring-white/[0.08]'
                    : 'text-[#8C857A] hover:text-[#DFD9CE]'
                }`}
              >
                <span>勋章陈列</span>
                <span
                  className={`font-mono-num text-[11px] font-normal ${
                    activeTab === 'achievements' ? 'text-[#C9A25B]' : 'text-[#6F685F]'
                  }`}
                >
                  {unlockedIds.length}/{ACHIEVEMENTS.length}
                </span>
              </button>

              <button
                type="button"
                role="tab"
                data-testid="pc-tab-insights"
                aria-selected={activeTab === 'insights'}
                onClick={() => setActiveTab('insights')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium tracking-wide transition-all cursor-pointer ${
                  activeTab === 'insights'
                    ? 'bg-[#23201B] text-[#F4E7C8] shadow-[0_2px_10px_rgba(0,0,0,0.38)] ring-1 ring-white/[0.08]'
                    : 'text-[#8C857A] hover:text-[#DFD9CE]'
                }`}
              >
                <span>打法画像</span>
                {personaReport.handsPlayed > 0 && (
                  <span
                    className={`font-mono-num text-[11px] font-normal ${
                      activeTab === 'insights' ? 'text-[#C9A25B]' : 'text-[#6F685F]'
                    }`}
                  >
                    {personaReport.handsPlayed}手
                  </span>
                )}
              </button>

              <button
                type="button"
                role="tab"
                data-testid="pc-tab-profile"
                aria-selected={activeTab === 'profile'}
                onClick={() => setActiveTab('profile')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium tracking-wide transition-all cursor-pointer ${
                  activeTab === 'profile'
                    ? 'bg-[#23201B] text-[#F4E7C8] shadow-[0_2px_10px_rgba(0,0,0,0.38)] ring-1 ring-white/[0.08]'
                    : 'text-[#8C857A] hover:text-[#DFD9CE]'
                }`}
              >
                <span>形象设置</span>
              </button>
            </div>

            <button
              type="button"
              data-testid="personal-center-close-btn"
              onClick={onClose}
              aria-label="关闭个人中心"
              className="hidden md:flex h-8 w-8 items-center justify-center rounded-full text-[#898277] hover:bg-white/[0.06] hover:text-[#F4F0E8] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {activeTab === 'achievements' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Secondary Filter Bar (Clean Hierarchy, No Redundant Unequip Button) */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-4 pb-2 sm:px-7">
                <div className="flex items-center gap-1.5 text-xs">
                  {(['all', 'glory', 'fun', 'tactics'] as const).map((cat) => {
                    const active = category === cat;
                    const label = cat === 'all' ? '全部' : ACHIEVEMENT_CATEGORY_LABELS[cat];
                    return (
                      <button
                        key={cat}
                        type="button"
                        data-testid={`pc-ach-cat-${cat}`}
                        onClick={() => setCategory(cat)}
                        className={`rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                          active
                            ? 'bg-white/[0.07] text-[#F0DFB3]'
                            : 'text-[#80796F] hover:bg-white/[0.03] hover:text-[#D8D2C6]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {activeEquippedDef && (
                  <div className="text-[11px] text-[#8E877D]">
                    当前佩戴
                    <strong className="ml-1.5 font-medium text-[#E4CB96]">
                      {activeEquippedDef.name}
                    </strong>
                  </div>
                )}
              </div>

              {/* Airy Tactile Card Grid of Medals */}
              <div className="chat-scroll flex-1 overflow-y-auto px-6 py-4 sm:px-7 sm:py-5">
                {unlockedList.length > 0 && (
                  <div
                    data-testid="pc-unlocked-medals-grid"
                    className="grid grid-cols-2 sm:grid-cols-3 gap-4"
                  >
                    {unlockedList.map((ach) => {
                      const equipped = activeEquippedId === ach.id;
                      const unlockDate = achievementDates[ach.id]
                        ? formatAchievementDateTime(achievementDates[ach.id]).split(' ')[0]
                        : null;
                      return (
                        <button
                          key={ach.id}
                          type="button"
                          data-testid={`equip-medal-btn-${ach.id}`}
                          data-achievement-card={ach.id}
                          aria-pressed={equipped}
                          onClick={() => handleEquipMedal(ach.id)}
                          className={`group touch-manipulation relative flex flex-col items-center rounded-2xl border px-4 py-5 text-center transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:z-10 active:scale-[0.99] cursor-pointer ${
                            equipped
                              ? 'border-[#C9A25B]/65 bg-[#1D1912] shadow-[0_12px_28px_rgba(0,0,0,0.36)]'
                              : 'border-white/[0.065] bg-[#191714]/95 hover:border-[#C9A25B]/45 hover:bg-[#1F1C18] hover:shadow-[0_12px_26px_rgba(0,0,0,0.42)]'
                          }`}
                        >
                          <span
                            className={`absolute top-3 right-3 inline-flex items-center gap-0.5 text-[10px] font-medium transition-opacity ${
                              equipped
                                ? 'text-[#E4CB96]'
                                : 'text-[#A69F93] opacity-0 group-hover:opacity-100'
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
                          </span>

                          <div className="transition-transform duration-200 ease-out group-hover:scale-105">
                            <AchievementMedalIcon id={ach.id} size="md" />
                          </div>

                          <div className="mt-3.5 flex items-center justify-center gap-1.5 max-w-full">
                            <span className="truncate text-xs font-semibold text-[#F4F0E8]">
                              {ach.name}
                            </span>
                            <span
                              className={`text-[10px] font-medium shrink-0 ${TIER_TEXT_CLASS[ach.tier]}`}
                            >
                              {ACHIEVEMENT_TIER_LABELS[ach.tier]}
                            </span>
                          </div>

                          <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[#948D82]">
                            {ach.description}
                          </p>

                          {unlockDate && (
                            <span className="mt-auto pt-3 font-mono-num text-[10px] text-[#706960]">
                              {unlockDate}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {lockedList.length > 0 && (
                  <div className={unlockedList.length > 0 ? 'mt-8' : ''}>
                    <div className="mb-3.5 flex items-center justify-between text-[11px] font-medium text-[#7A736A]">
                      <span>未解锁勋章</span>
                      <span className="font-mono-num">{lockedList.length} 枚</span>
                    </div>
                    <div
                      data-testid="pc-locked-medals-grid"
                      className="grid grid-cols-2 sm:grid-cols-3 gap-4"
                    >
                      {lockedList.map((ach) => (
                        <div
                          key={ach.id}
                          data-testid={`pc-achievement-card-${ach.id}`}
                          className="relative flex flex-col items-center rounded-2xl border border-white/[0.045] bg-[#11100E]/85 px-4 py-4.5 text-center opacity-55 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:opacity-80"
                        >
                          <Lock
                            className="absolute top-3 right-3 h-3 w-3 text-[#655F56]"
                            aria-hidden="true"
                          />

                          <AchievementMedalIcon id={ach.id} size="md" locked />

                          <div className="mt-3 flex items-center justify-center gap-1.5 max-w-full">
                            <span className="truncate text-xs font-medium text-[#CFC9BE]">
                              {ach.name}
                            </span>
                            <span
                              className={`text-[10px] shrink-0 ${TIER_TEXT_CLASS[ach.tier]}`}
                            >
                              {ACHIEVEMENT_TIER_LABELS[ach.tier]}
                            </span>
                          </div>

                          <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[#7E776D]">
                            {ach.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'insights' ? (() => {
            const displayStrengths = activeAiAnalysis
              ? activeAiAnalysis.strengths.map((item, idx) => ({
                  id: `ai-str-${idx}`,
                  title: item.title,
                  evidence: item.evidence,
                  detail: item.detail,
                }))
              : personaReport.strengths;

            const displayWeaknesses = activeAiAnalysis
              ? activeAiAnalysis.weaknesses.map((item, idx) => ({
                  id: `ai-weak-${idx}`,
                  title: item.title,
                  evidence: item.evidence,
                  detail: item.detail,
                }))
              : personaReport.weaknesses;

            const displayGoodHabits = activeAiAnalysis
              ? activeAiAnalysis.habits
                  .filter((h) => h.kind === 'good')
                  .map((item, idx) => ({
                    id: `ai-gh-${idx}`,
                    title: item.title,
                    evidence: item.evidence,
                    detail: item.detail,
                  }))
              : personaReport.goodHabits;

            const displayBadHabits = activeAiAnalysis
              ? activeAiAnalysis.habits
                  .filter((h) => h.kind === 'bad')
                  .map((item, idx) => ({
                    id: `ai-bh-${idx}`,
                    title: item.title,
                    evidence: item.evidence,
                    detail: item.detail,
                  }))
              : personaReport.badHabits;

            const fallbackImprovements = [
              ...personaReport.weaknesses,
              ...personaReport.badHabits,
            ]
              .filter((item) => Boolean(item.actionableTip))
              .slice(0, 3)
              .map((item) => ({
                focus: item.title,
                targetMetric: item.evidence,
                actionPlan: item.actionableTip ?? '',
              }));

            const displayImprovements = activeAiAnalysis
              ? activeAiAnalysis.improvements
              : fallbackImprovements;

            return (
              <div
                data-testid="pc-insights-panel"
                className="chat-scroll flex-1 overflow-y-auto px-6 py-5 sm:px-7 sm:py-6 space-y-5"
              >
                {/* Archetype Masthead */}
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <h3
                        data-testid="pc-persona-archetype"
                        className="font-display text-xl font-semibold tracking-tight text-[#F5F1E8]"
                      >
                        {activeAiAnalysis?.archetypeTitle || personaReport.archetype.title}
                      </h3>
                      {!activeAiAnalysis && (
                        <span className="font-mono-num text-[11px] tracking-wider text-[#C9A25B]">
                          {personaReport.archetype.englishTag}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 font-mono-num text-[11px] text-[#857E74]">
                      <span>{personaReport.maturityLabel}</span>
                      {activeAiAnalysis && (
                        <>
                          <span aria-hidden="true" className="text-white/20">
                            ·
                          </span>
                          <span className="text-[#88B99E]">
                            已按近 {activeAiAnalysis.analyzedHands} 手实战更新
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {personaReport.handsPlayed > 0 && (
                    <button
                      type="button"
                      data-testid="pc-ai-analyze-btn"
                      disabled={aiLoading}
                      onClick={() => void requestAiPersonaAnalysis(true)}
                      className="touch-manipulation inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.025] px-3.5 text-xs font-medium text-[#DDD6C9] hover:border-[#C9A25B]/55 hover:bg-white/[0.05] hover:text-[#EFE0BC] disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {aiLoading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#C9A25B]" aria-hidden="true" />
                          <span>解读中</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3 text-[#C9A25B]" aria-hidden="true" />
                          <span>{activeAiAnalysis ? '更新解读' : '生成深度解读'}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* 6-Metric Airy Stat Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  {[
                    {
                      label: '入池 VPIP',
                      value:
                        personaReport.handsPlayed > 0 ? `${personaReport.metrics.vpipPct}%` : '—',
                      tone: 'text-[#EFECE4]',
                    },
                    {
                      label: '加注 PFR',
                      value:
                        personaReport.handsPlayed > 0 ? `${personaReport.metrics.pfrPct}%` : '—',
                      tone: 'text-[#EFECE4]',
                    },
                    {
                      label: '进攻 Agg%',
                      value:
                        personaReport.handsPlayed > 0 ? `${personaReport.metrics.aggPct}%` : '—',
                      tone: 'text-[#E4CB96]',
                    },
                    {
                      label: '持续下注 C-Bet',
                      value:
                        personaReport.metrics.cbetPct !== null
                          ? `${personaReport.metrics.cbetPct}%`
                          : '—',
                      tone: 'text-[#EFECE4]',
                    },
                    {
                      label: '摊牌胜率 W$SD',
                      value:
                        personaReport.metrics.wsdPct !== null
                          ? `${personaReport.metrics.wsdPct}%`
                          : '—',
                      tone: 'text-[#EFECE4]',
                    },
                    {
                      label: '盈亏 BB/100',
                      value:
                        personaReport.handsPlayed > 0
                          ? `${personaReport.metrics.bbPer100 >= 0 ? '+' : ''}${personaReport.metrics.bbPer100}`
                          : '—',
                      tone:
                        personaReport.metrics.bbPer100 >= 0
                          ? 'text-[#7BB598]'
                          : 'text-[#D97C72]',
                    },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="rounded-xl border border-white/[0.055] bg-[#191714]/88 px-3 py-3 transition-colors hover:border-white/[0.11]"
                    >
                      <div className="text-[10px] text-[#847D73] whitespace-nowrap">{m.label}</div>
                      <div className={`mt-1.5 font-mono-num text-[15px] leading-none font-semibold ${m.tone}`}>
                        {m.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 2-Card Hero Row: Radar Card + Executive Summary Card */}
                <div className="grid grid-cols-1 lg:grid-cols-[292px_1fr] gap-4 items-stretch">
                  <PlayerRadarChart
                    axes={displayRadarAxes}
                    handsPlayed={personaReport.handsPlayed}
                    aiCalibrated={Boolean(activeAiAnalysis?.radarScores)}
                  />

                  <div
                    data-testid="pc-ai-summary-card"
                    className="flex flex-col justify-between rounded-2xl border border-white/[0.06] bg-[#191714]/92 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.22)] space-y-4"
                  >
                    <div className="space-y-3.5">
                      <div className="flex items-baseline justify-between gap-2 border-b border-white/[0.06] pb-2.5">
                        <span className="text-xs font-medium tracking-wide text-[#E4CB96]">
                          牌风总评
                        </span>
                        <span className="font-mono-num text-[11px] text-[#857E74]">
                          AF {personaReport.handsPlayed > 0 ? personaReport.metrics.aggressionFactor : '—'}
                        </span>
                      </div>

                      {aiLoading ? (
                        <div
                          className="flex items-center gap-2 py-4 text-xs text-[#ABA397]"
                          data-testid="pc-ai-loading"
                        >
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin text-[#C9A25B]"
                            aria-hidden="true"
                          />
                          <span>正在整理近期对局指标…</span>
                        </div>
                      ) : (
                        <>
                          <p className="text-[12.5px] leading-[1.78] text-[#DDD7CC]">
                            {activeAiAnalysis?.summary ?? personaReport.archetype.summary}
                          </p>

                          {activeAiAnalysis?.radarInsight && (
                            <div className="rounded-xl bg-white/[0.025] px-3.5 py-3 space-y-1">
                              <div className="text-[10px] font-medium tracking-wide text-[#928B80]">
                                形态注记
                              </div>
                              <p className="text-[11.5px] leading-relaxed text-[#ADA69B]">
                                {activeAiAnalysis.radarInsight}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {aiError && (
                      <div
                        data-testid="pc-ai-error"
                        className="flex items-start justify-between gap-3 border-t border-[#C9A25B]/25 pt-2.5 text-[11px] leading-relaxed text-[#DFC289]"
                      >
                        <span>{aiError}</span>
                        <button
                          type="button"
                          onClick={() => void requestAiPersonaAnalysis(true)}
                          className="shrink-0 underline underline-offset-2 text-[#EFE0BC] hover:text-white cursor-pointer"
                        >
                          重试
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Modular Trait Cards + Actionable Plan Card */}
                {personaReport.handsPlayed === 0 ? (
                  <div className="rounded-2xl border border-white/[0.06] bg-[#191714]/80 px-5 py-8 text-center text-xs leading-relaxed text-[#8E877D]">
                    完成对局后，系统将结合 VPIP、PFR、Agg% 与复盘记录绘制六维雷达，并归纳你的牌风优劣、对局习惯与改进建议。
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Card 1: Core Strengths */}
                      <div className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 p-5 space-y-3.5">
                        <h4 className="border-b border-white/[0.06] pb-2 text-xs font-medium tracking-wide text-[#88B99E]">
                          核心优势
                        </h4>
                        {displayStrengths.length === 0 ? (
                          <p className="text-[11.5px] text-[#7D766C]">
                            随着对局增加将自动提炼核心优势。
                          </p>
                        ) : (
                          <div className="space-y-3.5">
                            {displayStrengths.map((item) => (
                              <div key={item.id} className="space-y-1">
                                <div className="text-xs font-semibold text-[#F2EEE6]">
                                  {item.title}
                                </div>
                                {item.evidence && (
                                  <div className="font-mono-num text-[10px] text-[#888177]">
                                    {item.evidence}
                                  </div>
                                )}
                                <p className="text-[11.5px] leading-relaxed text-[#ABA499]">
                                  {item.detail}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Card 2: Main Weaknesses */}
                      <div className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 p-5 space-y-3.5">
                        <h4 className="border-b border-white/[0.06] pb-2 text-xs font-medium tracking-wide text-[#D89A8E]">
                          主要短板与漏洞
                        </h4>
                        {displayWeaknesses.length === 0 ? (
                          <p className="text-[11.5px] text-[#7D766C]">
                            当前样本暂未检出明显结构性漏洞。
                          </p>
                        ) : (
                          <div className="space-y-3.5">
                            {displayWeaknesses.map((item) => (
                              <div key={item.id} className="space-y-1">
                                <div className="text-xs font-semibold text-[#F2EEE6]">
                                  {item.title}
                                </div>
                                {item.evidence && (
                                  <div className="font-mono-num text-[10px] text-[#888177]">
                                    {item.evidence}
                                  </div>
                                )}
                                <p className="text-[11.5px] leading-relaxed text-[#ABA499]">
                                  {item.detail}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Card 3: Good Habits */}
                      <div className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 p-5 space-y-3.5">
                        <h4 className="border-b border-white/[0.06] pb-2 text-xs font-medium tracking-wide text-[#DEC58C]">
                          良好习惯
                        </h4>
                        {displayGoodHabits.length === 0 ? (
                          <p className="text-[11.5px] text-[#7D766C]">
                            完成 3 局以上后生成稳定习惯记录。
                          </p>
                        ) : (
                          <div className="space-y-3.5">
                            {displayGoodHabits.map((item) => (
                              <div key={item.id} className="space-y-1">
                                <div className="text-xs font-semibold text-[#F2EEE6]">
                                  {item.title}
                                </div>
                                {item.evidence && (
                                  <div className="font-mono-num text-[10px] text-[#888177]">
                                    {item.evidence}
                                  </div>
                                )}
                                <p className="text-[11.5px] leading-relaxed text-[#ABA499]">
                                  {item.detail}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Card 4: Habits to Fix */}
                      <div className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 p-5 space-y-3.5">
                        <h4 className="border-b border-white/[0.06] pb-2 text-xs font-medium tracking-wide text-[#C99D6B]">
                          需戒除的习惯
                        </h4>
                        {displayBadHabits.length === 0 ? (
                          <p className="text-[11.5px] text-[#7D766C]">
                            当前暂未检出重复性坏习惯。
                          </p>
                        ) : (
                          <div className="space-y-3.5">
                            {displayBadHabits.map((item) => (
                              <div key={item.id} className="space-y-1">
                                <div className="text-xs font-semibold text-[#F2EEE6]">
                                  {item.title}
                                </div>
                                {item.evidence && (
                                  <div className="font-mono-num text-[10px] text-[#888177]">
                                    {item.evidence}
                                  </div>
                                )}
                                <p className="text-[11.5px] leading-relaxed text-[#ABA499]">
                                  {item.detail}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actionable Improvements Card */}
                    {displayImprovements.length > 0 && (
                      <div
                        data-testid="pc-ai-improvements"
                        className="rounded-2xl border border-[#C9A25B]/20 bg-[#191714]/92 p-5 space-y-3.5"
                      >
                        <div className="flex items-baseline justify-between gap-2 border-b border-white/[0.06] pb-2.5">
                          <h4 className="text-xs font-medium tracking-wide text-[#E4CB96]">
                            阶段改进建议
                          </h4>
                          <span className="font-mono-num text-[10px] text-[#80796F]">
                            {activeAiAnalysis ? '基于实测数据' : '统计基线'}
                          </span>
                        </div>
                        <div className="divide-y divide-white/[0.055]">
                          {displayImprovements.map((imp, idx) => (
                            <div
                              key={`${imp.focus}-${idx}`}
                              className="grid grid-cols-[26px_1fr] gap-2 py-3.5 first:pt-1 last:pb-0"
                            >
                              <span className="font-mono-num text-[11px] text-[#9A845A] pt-0.5">
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                  <span className="text-xs font-semibold text-[#F4F0E8]">
                                    {imp.focus}
                                  </span>
                                  {imp.targetMetric && (
                                    <span className="font-mono-num text-[10px] text-[#C9A25B]">
                                      {imp.targetMetric}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11.5px] leading-relaxed text-[#B2ABA0]">
                                  {imp.actionPlan}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Linked Per-Hand Review & Session Profiler Card */}
                {(personaReport.totalReviewedDecisions > 0 ||
                  personaReport.exposedPatterns.length > 0 ||
                  personaReport.recentSnapshots.length > 0) && (
                  <div
                    data-testid="pc-linked-session-profile"
                    className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.06] pb-2.5">
                      <h4 className="text-xs font-medium tracking-wide text-[#E4CB96]">
                        复盘与当局画像联动
                      </h4>
                      {personaReport.reviewAccuracyPct !== null && (
                        <span className="font-mono-num text-[11px] text-[#9A9388]">
                          决策达标率{' '}
                          <strong className="text-[#88B99E]">
                            {personaReport.reviewAccuracyPct}%
                          </strong>{' '}
                          （{personaReport.totalReviewedDecisions} 节点）
                        </span>
                      )}
                    </div>

                    {personaReport.exposedPatterns.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="text-[11px] text-[#847D73]">
                          牌桌上最常被对手捕捉的倾向
                        </div>
                        <div className="space-y-2.5">
                          {personaReport.exposedPatterns.map((ep) => (
                            <div
                              key={ep.pattern}
                              className="rounded-xl bg-white/[0.025] px-4 py-3 space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-semibold text-[#EFE0BC]">{ep.label}</span>
                                <span className="font-mono-num text-[11px] text-[#8A8379]">
                                  触发 {ep.count} 局
                                </span>
                              </div>
                              <p className="text-[11.5px] leading-relaxed text-[#B2ABA0]">
                                反制风险：{ep.counterRisk}
                              </p>
                              <p className="text-[11.5px] leading-relaxed text-[#88B99E]">
                                调整方向：{ep.adaptationTip}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {personaReport.recentSnapshots.length > 0 && (
                      <div className="space-y-2 border-t border-white/[0.06] pt-3.5">
                        <div className="text-[11px] text-[#847D73]">近期对局轨迹</div>
                        <div className="divide-y divide-white/[0.045]">
                          {[...personaReport.recentSnapshots]
                            .reverse()
                            .slice(0, 5)
                            .map((snap, idx) => (
                              <div
                                key={`${snap.handNumber}-${snap.timestamp}-${idx}`}
                                className="flex items-center justify-between gap-2 text-[11px] py-2"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="font-mono-num text-[#7D766C]">
                                    第 {snap.handNumber} 局
                                  </span>
                                  <span className="truncate text-[#DDD7CC]">
                                    {SESSION_PATTERN_META[snap.detectedPattern]?.label ??
                                      '均衡难读'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 font-mono-num shrink-0">
                                  <span className="text-[#8E877D]">
                                    精准 {snap.optimalCount} / 失误 {snap.mistakeCount}
                                  </span>
                                  <span
                                    className={
                                      snap.netBB >= 0 ? 'text-[#7BB598]' : 'text-[#D97C72]'
                                    }
                                  >
                                    {snap.netBB >= 0 ? `+${snap.netBB}` : snap.netBB} BB
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="chat-scroll flex-1 overflow-y-auto px-6 py-5 sm:px-7 sm:py-6 space-y-5">
              {/* Emblem Gallery Card */}
              <div className="rounded-2xl border border-white/[0.06] bg-[#191714]/92 p-5">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium tracking-wide text-[#DDD6C9]">
                    俱乐部徽章
                  </span>

                  <div className="flex items-center gap-2">
                    {isCustomAvatarDataUrl(playerAvatar) && (
                      <button
                        type="button"
                        onClick={() => onUpdateAvatar('default')}
                        className="touch-manipulation inline-flex h-8 items-center gap-1 rounded-xl border border-white/[0.1] px-2.5 text-xs text-[#9C958A] hover:text-[#F4F0E8] transition-colors cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        <span>恢复默认</span>
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="upload-avatar-btn"
                      onClick={() => fileInputRef.current?.click()}
                      className="touch-manipulation inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.025] px-3 text-xs font-medium text-[#D8D2C6] hover:border-[#C9A25B]/55 hover:text-[#EFE0BC] transition-colors cursor-pointer"
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

                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2.5">
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
                        className={`touch-manipulation flex flex-col items-center justify-center gap-2 rounded-xl py-3 px-1.5 transition-all cursor-pointer ${
                          selected
                            ? 'bg-[#C9A25B]/14 text-[#EFE0BC] ring-1 ring-[#C9A25B]/65'
                            : 'bg-white/[0.02] text-[#8C857A] hover:bg-white/[0.05] hover:text-[#F4F0E8]'
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
                  <p role="alert" className="mt-2.5 text-xs text-[#D97C72]">
                    {uploadError}
                  </p>
                )}
              </div>

              {/* Equipped Medal Summary Card (No Redundant Unequip Button) */}
              <div className="rounded-2xl border border-white/[0.06] bg-[#191714]/92 p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  {activeEquippedId && activeEquippedDef ? (
                    <>
                      <AchievementMedalIcon id={activeEquippedId} size="md" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#F4F0E8]">
                          {activeEquippedDef.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#8A8379]">
                          当前佩戴勋章 · {ACHIEVEMENT_TIER_LABELS[activeEquippedDef.tier]}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div>
                      <div className="text-xs font-medium text-[#CFC9BE]">暂未佩戴勋章</div>
                      <div className="mt-0.5 text-[11px] text-[#80796F]">
                        前往勋章陈列挑选一枚展示在头像旁
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  data-testid="pc-goto-medals-btn"
                  onClick={() => setActiveTab('achievements')}
                  className="touch-manipulation shrink-0 h-8 rounded-xl border border-white/[0.1] bg-white/[0.025] px-3.5 text-xs font-medium text-[#E6CE98] hover:border-[#C9A25B]/60 hover:bg-white/[0.05] transition-colors cursor-pointer"
                >
                  {activeEquippedId ? '更换勋章' : '挑选勋章'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
