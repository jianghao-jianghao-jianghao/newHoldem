import type { HandReplayRecord, PotTimelinePoint, StreetPhase } from './types';

export type ChartStreetKey = 'preflop' | 'flop' | 'turn' | 'river';

export interface StreetPotTrendPoint {
  street: ChartStreetKey;
  label: string;
  pot: number | null;
  streetAdded: number;
  streetAddedPlot: number | null;
  actionCount: number;
  highlightAction: string;
  reached: boolean;
  isCurrent: boolean;
}

export interface StreetPotTrendSummary {
  handNumber: number;
  isLiveHand: boolean;
  totalPot: number;
  peakStreetLabel: string | null;
  peakStreetAdded: number;
  points: StreetPotTrendPoint[];
}

const ORDERED_STREETS: ReadonlyArray<{ key: ChartStreetKey; label: string }> = [
  { key: 'preflop', label: '翻牌前' },
  { key: 'flop', label: '翻牌' },
  { key: 'turn', label: '转牌' },
  { key: 'river', label: '河牌' },
];

const STREET_RANK: Record<StreetPhase, number> = {
  waiting: -1,
  preflop: 0,
  flop: 1,
  turn: 2,
  river: 3,
  showdown: 3,
};

function getReachedStreetIndex(
  phase: StreetPhase,
  timeline: PotTimelinePoint[],
  communityCardCount: number,
  isLiveHand: boolean
): number {
  let maxTimelineIdx = -1;
  for (const pt of timeline) {
    const rank = STREET_RANK[pt.street];
    if (rank > maxTimelineIdx) {
      maxTimelineIdx = rank;
    }
  }

  let boardIdx = -1;
  if (communityCardCount >= 5) boardIdx = 3;
  else if (communityCardCount >= 4) boardIdx = 2;
  else if (communityCardCount >= 3) boardIdx = 1;
  else if (timeline.length > 0 || (isLiveHand && phase !== 'waiting')) boardIdx = 0;

  if (!isLiveHand) {
    return Math.max(maxTimelineIdx, boardIdx);
  }

  if (phase === 'showdown') {
    return Math.max(maxTimelineIdx, boardIdx);
  }

  return Math.max(STREET_RANK[phase], maxTimelineIdx, boardIdx);
}

/**
 * Aggregates intra-hand pot timeline events into per-street cumulative pot points
 * (翻牌前 -> 翻牌 -> 转牌 -> 河牌) for the Recharts street pot accumulation line chart.
 */
export function buildStreetPotTrend(params: {
  currentHandNumber: number;
  currentPhase: StreetPhase;
  currentPot: number;
  currentCommunityCardCount: number;
  currentPotTimeline: PotTimelinePoint[];
  handHistory: HandReplayRecord[];
}): StreetPotTrendSummary {
  const {
    currentHandNumber,
    currentPhase,
    currentPot,
    currentCommunityCardCount,
    currentPotTimeline,
    handHistory,
  } = params;

  const hasLiveData =
    currentPhase !== 'waiting' &&
    (currentPotTimeline.length > 0 || currentPot > 0);
  const fallbackHand = !hasLiveData
    ? handHistory[handHistory.length - 1] ?? null
    : null;

  const timeline = hasLiveData
    ? currentPotTimeline
    : fallbackHand?.potTimeline ?? [];
  const communityCount = hasLiveData
    ? currentCommunityCardCount
    : fallbackHand?.communityCards.length ?? 0;
  const effectiveHandNumber = hasLiveData
    ? currentHandNumber
    : fallbackHand?.handNumber ?? currentHandNumber;
  const effectivePhase: StreetPhase = hasLiveData
    ? currentPhase
    : fallbackHand
      ? 'showdown'
      : 'waiting';
  const effectivePot = hasLiveData
    ? currentPot
    : fallbackHand?.pot ?? 0;

  if (timeline.length === 0 && effectivePot <= 0) {
    return {
      handNumber: effectiveHandNumber,
      isLiveHand: false,
      totalPot: 0,
      peakStreetLabel: null,
      peakStreetAdded: 0,
      points: ORDERED_STREETS.map((s) => ({
        street: s.key,
        label: s.label,
        pot: null,
        streetAdded: 0,
        streetAddedPlot: null,
        actionCount: 0,
        highlightAction: '尚未进入',
        reached: false,
        isCurrent: false,
      })),
    };
  }

  const reachedIdx = getReachedStreetIndex(
    effectivePhase,
    timeline,
    communityCount,
    hasLiveData
  );

  let runningPot = 0;
  let peakStreetLabel: string | null = null;
  let peakStreetAdded = 0;

  const points: StreetPotTrendPoint[] = ORDERED_STREETS.map((s, idx) => {
    const streetEvents = timeline.filter((pt) => pt.street === s.key);
    const reached = idx <= reachedIdx;

    if (!reached) {
      return {
        street: s.key,
        label: s.label,
        pot: null,
        streetAdded: 0,
        streetAddedPlot: null,
        actionCount: 0,
        highlightAction: '未到该阶段',
        reached: false,
        isCurrent: false,
      };
    }

    const streetAdded = Math.max(
      0,
      streetEvents.reduce((sum, pt) => sum + pt.amountAdded, 0)
    );
    if (streetEvents.length > 0) {
      runningPot = streetEvents[streetEvents.length - 1].potAfter;
    } else if (idx === 0 && runningPot === 0 && effectivePot > 0) {
      runningPot = effectivePot;
    }

    // Highlight the largest betting action in this street (prefer non-blind, exclude refund entries)
    const bettingEvents = streetEvents.filter((e) => e.actionType !== 'refund');
    const nonBlindEvents = bettingEvents.filter((e) => e.actionType !== 'blind');
    const highlightPool = nonBlindEvents.length > 0 ? nonBlindEvents : bettingEvents;
    let topEvent: PotTimelinePoint | null = null;
    for (const ev of highlightPool) {
      if (!topEvent || ev.amountAdded >= topEvent.amountAdded) {
        topEvent = ev;
      }
    }

    const highlightAction = topEvent
      ? `${topEvent.actorName} ${topEvent.actionLabel}`
      : idx === 0
        ? '盲注底池'
        : '全员让牌';

    if (streetAdded > peakStreetAdded) {
      peakStreetAdded = streetAdded;
      peakStreetLabel = s.label;
    }

    const isCurrent = hasLiveData && effectivePhase === s.key;

    return {
      street: s.key,
      label: s.label,
      pot: runningPot,
      streetAdded,
      streetAddedPlot: streetAdded,
      actionCount: bettingEvents.length,
      highlightAction,
      reached: true,
      isCurrent,
    };
  });

  const finalPot = effectivePot > 0 ? effectivePot : runningPot;
  return {
    handNumber: effectiveHandNumber,
    isLiveHand: hasLiveData && currentPhase !== 'showdown',
    totalPot: finalPot,
    peakStreetLabel,
    peakStreetAdded,
    points,
  };
}
