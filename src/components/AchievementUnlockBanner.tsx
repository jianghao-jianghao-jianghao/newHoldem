import { useEffect, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import {
  ACHIEVEMENT_MAP,
  ACHIEVEMENT_TIER_LABELS,
  type AchievementId,
  type AchievementTier,
} from '../shared/achievements';
import { AchievementMedalIcon } from './AchievementBadge';

interface AchievementUnlockBannerProps {
  achievementIds: AchievementId[];
  onInspect: () => void;
  onDismiss: () => void;
  durationPerMedalMs?: number;
}

const TIER_ACCENTS: Record<
  AchievementTier,
  {
    border: string;
    ring: string;
    spark: string;
    label: string;
    bar: string;
    sheen: string;
  }
> = {
  bronze: {
    border: 'rgba(184, 122, 75, 0.58)',
    ring: 'rgba(227, 167, 120, 0.72)',
    spark: '#E3A778',
    label: 'text-[#E3A778]',
    bar: '#C58657',
    sheen: 'rgba(227, 167, 120, 0.16)',
  },
  silver: {
    border: 'rgba(159, 176, 192, 0.58)',
    ring: 'rgba(220, 230, 240, 0.75)',
    spark: '#DCE6F0',
    label: 'text-[#D6E1EC]',
    bar: '#AFC0D0',
    sheen: 'rgba(220, 230, 240, 0.16)',
  },
  gold: {
    border: 'rgba(212, 168, 83, 0.72)',
    ring: 'rgba(242, 210, 122, 0.85)',
    spark: '#F2D27A',
    label: 'text-[#F2D27A]',
    bar: '#D4A853',
    sheen: 'rgba(242, 210, 122, 0.2)',
  },
  obsidian: {
    border: 'rgba(232, 196, 108, 0.85)',
    ring: 'rgba(247, 219, 130, 0.92)',
    spark: '#F7DB82',
    label: 'text-[#F7DB82]',
    bar: '#E8C46C',
    sheen: 'rgba(247, 219, 130, 0.24)',
  },
};

const SPARK_VECTORS: Array<{ x: number; y: number; size: number }> = [
  { x: -30, y: -22, size: 4 },
  { x: -12, y: -32, size: 3 },
  { x: 14, y: -30, size: 4 },
  { x: 30, y: -18, size: 3 },
  { x: 32, y: 12, size: 4 },
  { x: 16, y: 28, size: 3 },
  { x: -16, y: 28, size: 3 },
  { x: -32, y: 10, size: 4 },
];

export function AchievementUnlockBanner({
  achievementIds,
  onInspect,
  onDismiss,
  durationPerMedalMs = 4800,
}: AchievementUnlockBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset index when a new batch of unlocked medals arrives
  const batchKey = achievementIds.join(',');
  useEffect(() => {
    setActiveIndex(0);
  }, [batchKey]);

  // Step smoothly through multiple achievements unlocked in the same hand, then auto-dismiss
  useEffect(() => {
    if (achievementIds.length === 0) return;
    const timer = window.setTimeout(() => {
      if (activeIndex + 1 < achievementIds.length) {
        setActiveIndex((prev) => prev + 1);
      } else {
        onDismiss();
      }
    }, durationPerMedalMs);
    return () => window.clearTimeout(timer);
  }, [achievementIds.length, activeIndex, durationPerMedalMs, onDismiss, batchKey]);

  if (achievementIds.length === 0) return null;

  const currentId = achievementIds[Math.min(activeIndex, achievementIds.length - 1)];
  const def = ACHIEVEMENT_MAP.get(currentId);
  if (!def) return null;

  const accent = TIER_ACCENTS[def.tier];
  const progressStyle = {
    '--ach-duration': `${durationPerMedalMs}ms`,
    backgroundColor: accent.bar,
  } as CSSProperties;

  return (
    <div
      key={`${batchKey}-${activeIndex}`}
      role="status"
      aria-live="polite"
      data-testid="achievement-toast"
      data-achievement-id={currentId}
      className="pointer-events-auto fixed top-14 right-4 sm:right-6 z-50 w-[min(90vw,390px)] overflow-hidden rounded-md bg-[#0E1211]/96 shadow-[0_18px_48px_rgba(0,0,0,0.78)] backdrop-blur-md animate-achievement-banner"
      style={{
        border: `1px solid ${accent.border}`,
      }}
    >
      {/* Brushed metallic sheen sweep */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-24 animate-achievement-sheen"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent.sheen}, transparent)`,
        }}
      />

      <div className="relative flex items-center gap-3.5 px-4 py-3">
        {/* Animated Coin-Flip Medal + Halo Ring + Radial Gold Sparks */}
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full animate-achievement-ring"
            style={{
              border: `1.5px solid ${accent.ring}`,
            }}
          />
          {SPARK_VECTORS.map((sp, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-1/2 rounded-full animate-achievement-spark"
              style={
                {
                  width: `${sp.size}px`,
                  height: `${sp.size}px`,
                  backgroundColor: accent.spark,
                  '--sx': `${sp.x}px`,
                  '--sy': `${sp.y}px`,
                } as CSSProperties
              }
            />
          ))}
          <div className="animate-achievement-medal">
            <AchievementMedalIcon id={currentId} size="lg" />
          </div>
        </div>

        {/* Clean Unboxed Copy */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium">
            <span className={accent.label}>成就解锁</span>
            <span aria-hidden="true" className="text-[#5B6661]">·</span>
            <span className="text-[#A8B3AE]">{ACHIEVEMENT_TIER_LABELS[def.tier]}</span>
            {achievementIds.length > 1 && (
              <>
                <span aria-hidden="true" className="text-[#5B6661]">·</span>
                <span className="font-mono-num text-[#8E9893]">
                  {activeIndex + 1}/{achievementIds.length}
                </span>
              </>
            )}
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold text-[#F6F3EC]">
            {def.name}
          </div>
          <div className="mt-0.5 line-clamp-1 text-[11px] text-[#98A69F]">
            {def.description}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            data-testid="achievement-toast-inspect"
            onClick={onInspect}
            className="h-7 rounded border border-white/[0.14] bg-white/[0.04] px-2.5 text-[11px] font-medium text-[#EFE6D2] hover:border-[#D4A853]/60 hover:bg-[#D4A853]/12 transition-colors whitespace-nowrap cursor-pointer"
          >
            查看
          </button>
          <button
            type="button"
            data-testid="achievement-toast-dismiss"
            onClick={onDismiss}
            aria-label="关闭成就提示"
            className="flex h-7 w-7 items-center justify-center rounded text-[#7F8A85] hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Slim Auto-Dismiss Progress Hairline */}
      <div className="h-[2px] w-full bg-white/[0.06]">
        <div
          className="h-full w-full animate-achievement-progress"
          style={progressStyle}
        />
      </div>
    </div>
  );
}
