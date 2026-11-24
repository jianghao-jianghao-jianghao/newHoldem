import type { HandReplayRecord, StreetPhase } from './types';

export type SessionPatternTag =
  | 'balanced'
  | 'overfolder_nit'
  | 'calling_station'
  | 'maniac_bluffer'
  | 'cbet_spammer'
  | 'limp_passive'
  | 'fit_or_fold';

export interface RecentHandProfileSnapshot {
  handNumber: number;
  timestamp: number;
  netBB: number;
  detectedPattern: SessionPatternTag;
  optimalCount: number;
  mistakeCount: number;
}

export interface PlayerBehaviorStats {
  handsPlayed: number;
  vpipHands: number;
  pfrHands: number;
  limpHands: number;
  threeBetOpps: number;
  threeBetCount: number;
  foldToBetOpps: number;
  foldToBetCount: number;
  sawFlopHands: number;
  cbetOpps: number;
  cbetCount: number;
  postflopBetsRaises: number;
  postflopCalls: number;
  wtsdHands: number;
  wonAtShowdownHands: number;
  allInHands: number;
  allInWonHands: number;
  earlyPosHands: number;
  earlyPosVpip: number;
  latePosHands: number;
  latePosVpip: number;
  riverCalls: number;
  riverCallWins: number;
  bigPotHands: number;
  bigPotWins: number;
  totalNetBB: number;
  // Linked from per-hand evidence review & session opponent profiler
  reviewOptimalDecisions: number;
  reviewAcceptableDecisions: number;
  reviewInaccuracies: number;
  reviewMistakes: number;
  patternExposureCounts: Record<SessionPatternTag, number>;
  recentSnapshots: RecentHandProfileSnapshot[];
}

export type SampleMaturity = 'empty' | 'early' | 'developing' | 'solid';

export type ArchetypeId =
  | 'newcomer'
  | 'tag'
  | 'lag'
  | 'nit'
  | 'calling_station'
  | 'maniac'
  | 'loose_passive'
  | 'balanced';

export interface PersonaMetricSnapshot {
  vpipPct: number;
  pfrPct: number;
  pfrToVpipPct: number;
  limpPct: number;
  threeBetPct: number | null;
  cbetPct: number | null;
  foldToBetPct: number | null;
  aggPct: number;
  aggressionFactor: number;
  wtsdPct: number | null;
  wsdPct: number | null;
  posAwarenessDiff: number | null;
  bbPer100: number;
}

export type PokerRadarAxisKey =
  | 'vpip'
  | 'pfr'
  | 'aggPct'
  | 'cbet'
  | 'showdown'
  | 'discipline';

export interface PokerRadarAxis {
  key: PokerRadarAxisKey;
  label: string;
  metricCode: string;
  score: number;
  benchmark: number;
  rawLabel: string;
}

export interface PersonaDiagnosticItem {
  id: string;
  title: string;
  evidence: string;
  detail: string;
  actionableTip?: string;
}

export interface ExposedPatternSummary {
  pattern: SessionPatternTag;
  label: string;
  count: number;
  counterRisk: string;
  adaptationTip: string;
}

export interface PlayerPersonaReport {
  handsPlayed: number;
  maturity: SampleMaturity;
  maturityLabel: string;
  archetype: {
    id: ArchetypeId;
    title: string;
    englishTag: string;
    summary: string;
  };
  metrics: PersonaMetricSnapshot;
  radarAxes: PokerRadarAxis[];
  reviewAccuracyPct: number | null;
  totalReviewedDecisions: number;
  exposedPatterns: ExposedPatternSummary[];
  recentSnapshots: RecentHandProfileSnapshot[];
  strengths: PersonaDiagnosticItem[];
  weaknesses: PersonaDiagnosticItem[];
  goodHabits: PersonaDiagnosticItem[];
  badHabits: PersonaDiagnosticItem[];
}

export interface AiPersonaTrait {
  title: string;
  evidence: string;
  detail: string;
}

export interface AiPersonaHabit {
  kind: 'good' | 'bad';
  title: string;
  evidence: string;
  detail: string;
}

export interface AiPersonaImprovement {
  focus: string;
  targetMetric: string;
  actionPlan: string;
}

export interface AiPersonaAnalysis {
  archetypeTitle: string;
  summary: string;
  radarInsight: string;
  radarScores?: Partial<Record<PokerRadarAxisKey, number>>;
  strengths: AiPersonaTrait[];
  weaknesses: AiPersonaTrait[];
  habits: AiPersonaHabit[];
  improvements: AiPersonaImprovement[];
  analyzedHands: number;
  generatedAt: number;
  model: string;
}

export const SESSION_PATTERN_META: Record<
  SessionPatternTag,
  { label: string; counterRisk: string; adaptationTip: string }
> = {
  balanced: {
    label: '均衡难读',
    counterRisk: '暂无明显单向漏洞，对手难以偏离 GTO 剥削',
    adaptationTip: '继续保持混合频率与尺度一致性。',
  },
  overfolder_nit: {
    label: '过度弃牌 / 紧缩',
    counterRisk: '对手/陪练会提高对你的偷盲、3-Bet 轻度施压与持续下注诈唬频率',
    adaptationTip: '面对 1/2 池以下下注守住 MDF 防线，适当用带阻断牌的听牌反加反制。',
  },
  calling_station: {
    label: '粘滞跟注站',
    counterRisk: '对手/陪练会大幅减少纯诈唬，改为用中等顶对以上做更大尺度的薄价值收割',
    adaptationTip: '面对多街连续大尺度下注果断止损，同时用强牌主动加注而非一味被动跟注。',
  },
  maniac_bluffer: {
    label: '高频诈唬 / 疯狂施压',
    counterRisk: '对手/陪练会放宽抓鸡跟注范围，并用超强牌慢打设陷阱等你持续开火',
    adaptationTip: '收紧无阻断牌的空气多街诈唬，拿到中等牌力多用过牌控池。',
  },
  cbet_spammer: {
    label: '无差别高频 C-Bet',
    counterRisk: '对手/陪练会在翻牌更频繁浮跟（Float）并在湿润面用过牌加注反击',
    adaptationTip: '湿润低张面降低持续下注频率，把部分强对子与听牌编入过牌范围保护。',
  },
  limp_passive: {
    label: '翻前高频平跟',
    counterRisk: '对手/陪练会用更宽范围在后位加注隔离你，并在翻后用范围优势持续施压',
    adaptationTip: '改用「加注或弃牌」策略，减少公开平跟暴露手牌上限。',
  },
  fit_or_fold: {
    label: '击中即打 / 不中即弃',
    counterRisk: '对手/陪练会在翻牌极高频轻度持续下注收割底池，一旦你反击则迅速撤退',
    adaptationTip: '翻牌适当保留带后门花顺听牌的高张进行浮跟，增加转牌反击与平衡度。',
  },
};

export function createEmptyPatternCounts(): Record<SessionPatternTag, number> {
  return {
    balanced: 0,
    overfolder_nit: 0,
    calling_station: 0,
    maniac_bluffer: 0,
    cbet_spammer: 0,
    limp_passive: 0,
    fit_or_fold: 0,
  };
}

export function createEmptyBehaviorStats(): PlayerBehaviorStats {
  return {
    handsPlayed: 0,
    vpipHands: 0,
    pfrHands: 0,
    limpHands: 0,
    threeBetOpps: 0,
    threeBetCount: 0,
    foldToBetOpps: 0,
    foldToBetCount: 0,
    sawFlopHands: 0,
    cbetOpps: 0,
    cbetCount: 0,
    postflopBetsRaises: 0,
    postflopCalls: 0,
    wtsdHands: 0,
    wonAtShowdownHands: 0,
    allInHands: 0,
    allInWonHands: 0,
    earlyPosHands: 0,
    earlyPosVpip: 0,
    latePosHands: 0,
    latePosVpip: 0,
    riverCalls: 0,
    riverCallWins: 0,
    bigPotHands: 0,
    bigPotWins: 0,
    totalNetBB: 0,
    reviewOptimalDecisions: 0,
    reviewAcceptableDecisions: 0,
    reviewInaccuracies: 0,
    reviewMistakes: 0,
    patternExposureCounts: createEmptyPatternCounts(),
    recentSnapshots: [],
  };
}

function nonNegInt(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function finiteNum(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

const VALID_PATTERN_TAGS = new Set<SessionPatternTag>([
  'balanced',
  'overfolder_nit',
  'calling_station',
  'maniac_bluffer',
  'cbet_spammer',
  'limp_passive',
  'fit_or_fold',
]);

function sanitizePatternCounts(raw: unknown): Record<SessionPatternTag, number> {
  const base = createEmptyPatternCounts();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  for (const key of VALID_PATTERN_TAGS) {
    base[key] = nonNegInt(o[key]);
  }
  return base;
}

function sanitizeRecentSnapshots(raw: unknown): RecentHandProfileSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const list: RecentHandProfileSnapshot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const tag = VALID_PATTERN_TAGS.has(o.detectedPattern as SessionPatternTag)
      ? (o.detectedPattern as SessionPatternTag)
      : 'balanced';
    list.push({
      handNumber: nonNegInt(o.handNumber),
      timestamp: nonNegInt(o.timestamp),
      netBB: finiteNum(o.netBB),
      detectedPattern: tag,
      optimalCount: nonNegInt(o.optimalCount),
      mistakeCount: nonNegInt(o.mistakeCount),
    });
  }
  return list.slice(-12);
}

export function sanitizeBehaviorStats(raw: unknown): PlayerBehaviorStats {
  if (!raw || typeof raw !== 'object') return createEmptyBehaviorStats();
  const o = raw as Record<string, unknown>;
  return {
    handsPlayed: nonNegInt(o.handsPlayed),
    vpipHands: nonNegInt(o.vpipHands),
    pfrHands: nonNegInt(o.pfrHands),
    limpHands: nonNegInt(o.limpHands),
    threeBetOpps: nonNegInt(o.threeBetOpps),
    threeBetCount: nonNegInt(o.threeBetCount),
    foldToBetOpps: nonNegInt(o.foldToBetOpps),
    foldToBetCount: nonNegInt(o.foldToBetCount),
    sawFlopHands: nonNegInt(o.sawFlopHands),
    cbetOpps: nonNegInt(o.cbetOpps),
    cbetCount: nonNegInt(o.cbetCount),
    postflopBetsRaises: nonNegInt(o.postflopBetsRaises),
    postflopCalls: nonNegInt(o.postflopCalls),
    wtsdHands: nonNegInt(o.wtsdHands),
    wonAtShowdownHands: nonNegInt(o.wonAtShowdownHands),
    allInHands: nonNegInt(o.allInHands),
    allInWonHands: nonNegInt(o.allInWonHands),
    earlyPosHands: nonNegInt(o.earlyPosHands),
    earlyPosVpip: nonNegInt(o.earlyPosVpip),
    latePosHands: nonNegInt(o.latePosHands),
    latePosVpip: nonNegInt(o.latePosVpip),
    riverCalls: nonNegInt(o.riverCalls),
    riverCallWins: nonNegInt(o.riverCallWins),
    bigPotHands: nonNegInt(o.bigPotHands),
    bigPotWins: nonNegInt(o.bigPotWins),
    totalNetBB: finiteNum(o.totalNetBB),
    reviewOptimalDecisions: nonNegInt(o.reviewOptimalDecisions),
    reviewAcceptableDecisions: nonNegInt(o.reviewAcceptableDecisions),
    reviewInaccuracies: nonNegInt(o.reviewInaccuracies),
    reviewMistakes: nonNegInt(o.reviewMistakes),
    patternExposureCounts: sanitizePatternCounts(o.patternExposureCounts),
    recentSnapshots: sanitizeRecentSnapshots(o.recentSnapshots),
  };
}

export function mergeBehaviorStats(
  base: PlayerBehaviorStats | null | undefined,
  delta: Partial<PlayerBehaviorStats> | null | undefined
): PlayerBehaviorStats {
  const a = sanitizeBehaviorStats(base);
  if (!delta) return a;
  const b = sanitizeBehaviorStats(delta);
  const mergedPatterns = createEmptyPatternCounts();
  for (const key of VALID_PATTERN_TAGS) {
    mergedPatterns[key] = a.patternExposureCounts[key] + b.patternExposureCounts[key];
  }
  const combinedSnapshots = [...a.recentSnapshots, ...b.recentSnapshots].slice(-12);
  return {
    handsPlayed: a.handsPlayed + b.handsPlayed,
    vpipHands: a.vpipHands + b.vpipHands,
    pfrHands: a.pfrHands + b.pfrHands,
    limpHands: a.limpHands + b.limpHands,
    threeBetOpps: a.threeBetOpps + b.threeBetOpps,
    threeBetCount: a.threeBetCount + b.threeBetCount,
    foldToBetOpps: a.foldToBetOpps + b.foldToBetOpps,
    foldToBetCount: a.foldToBetCount + b.foldToBetCount,
    sawFlopHands: a.sawFlopHands + b.sawFlopHands,
    cbetOpps: a.cbetOpps + b.cbetOpps,
    cbetCount: a.cbetCount + b.cbetCount,
    postflopBetsRaises: a.postflopBetsRaises + b.postflopBetsRaises,
    postflopCalls: a.postflopCalls + b.postflopCalls,
    wtsdHands: a.wtsdHands + b.wtsdHands,
    wonAtShowdownHands: a.wonAtShowdownHands + b.wonAtShowdownHands,
    allInHands: a.allInHands + b.allInHands,
    allInWonHands: a.allInWonHands + b.allInWonHands,
    earlyPosHands: a.earlyPosHands + b.earlyPosHands,
    earlyPosVpip: a.earlyPosVpip + b.earlyPosVpip,
    latePosHands: a.latePosHands + b.latePosHands,
    latePosVpip: a.latePosVpip + b.latePosVpip,
    riverCalls: a.riverCalls + b.riverCalls,
    riverCallWins: a.riverCallWins + b.riverCallWins,
    bigPotHands: a.bigPotHands + b.bigPotHands,
    bigPotWins: a.bigPotWins + b.bigPotWins,
    totalNetBB: Number((a.totalNetBB + b.totalNetBB).toFixed(2)),
    reviewOptimalDecisions: a.reviewOptimalDecisions + b.reviewOptimalDecisions,
    reviewAcceptableDecisions: a.reviewAcceptableDecisions + b.reviewAcceptableDecisions,
    reviewInaccuracies: a.reviewInaccuracies + b.reviewInaccuracies,
    reviewMistakes: a.reviewMistakes + b.reviewMistakes,
    patternExposureCounts: mergedPatterns,
    recentSnapshots: combinedSnapshots,
  };
}

function isBetOrRaiseType(actionType: string): boolean {
  return actionType === 'raise' || actionType === 'bet' || actionType === 'allin';
}

function classifyPositionBucket(
  seatIndex: number,
  allSeats: number[],
  dealerSeatIndex?: number,
  sbSeatIndex?: number | null,
  bbSeatIndex?: number | null
): 'early' | 'late' | 'blind' {
  if (sbSeatIndex !== undefined && sbSeatIndex !== null && seatIndex === sbSeatIndex) {
    return allSeats.length <= 2 ? 'late' : 'blind';
  }
  if (bbSeatIndex !== undefined && bbSeatIndex !== null && seatIndex === bbSeatIndex) {
    return 'blind';
  }
  if (dealerSeatIndex !== undefined && seatIndex === dealerSeatIndex) {
    return 'late';
  }
  const nonBlind = allSeats
    .filter((s) => s !== sbSeatIndex && s !== bbSeatIndex)
    .sort((a, b) => a - b);
  if (nonBlind.length <= 2) {
    return dealerSeatIndex !== undefined && seatIndex === dealerSeatIndex ? 'late' : 'early';
  }
  const anchor = bbSeatIndex ?? dealerSeatIndex ?? nonBlind[0];
  const ordered = [
    ...nonBlind.filter((s) => s > anchor),
    ...nonBlind.filter((s) => s <= anchor),
  ];
  const idx = ordered.indexOf(seatIndex);
  if (idx === -1) return 'early';
  // Last 2 non-blind seats (CO, BTN) are late position
  return idx >= ordered.length - 2 ? 'late' : 'early';
}

/**
 * Extracts exact per-player behavioral telemetry deltas from a completed HandReplayRecord.
 */
export function extractHandBehaviorDeltas(
  record: HandReplayRecord
): Record<string, PlayerBehaviorStats> {
  const result: Record<string, PlayerBehaviorStats> = {};
  const bb = Math.max(1, record.bigBlind || 20);
  const winnerIds = new Set(record.winners.map((w) => w.playerId));
  const nonFoldedCount = record.players.filter((p) => !p.folded).length;
  const reachedActualShowdown = nonFoldedCount > 1 && record.communityCards.length >= 5;
  const allSeats = record.players.map((p) => p.seatIndex).sort((a, b) => a - b);
  const timeline = record.potTimeline ?? [];

  // Determine preflop aggressor (last preflop raiser)
  let preflopAggressorId: string | null = null;
  let preflopRaiseCount = 0;
  let flopFirstBetActorId: string | null = null;
  let flopHadBetBeforePfa = false;
  let sawFlop = record.communityCards.length >= 3;

  const preflopFoldedIds = new Set<string>();
  const playerVpip = new Set<string>();
  const playerPfr = new Set<string>();
  const playerLimp = new Set<string>();
  const playerThreeBetOpp = new Set<string>();
  const playerThreeBet = new Set<string>();
  const playerFoldToBetOpp = new Map<string, number>();
  const playerFoldToBet = new Map<string, number>();
  const playerPostBets = new Map<string, number>();
  const playerPostCalls = new Map<string, number>();
  const playerRiverCall = new Set<string>();

  let currentStreet: StreetPhase = 'preflop';
  let facingBetOnStreet = false;
  let streetRaiseSeen = 0;
  let pfaSawFlopAction = false;
  let pfaCbet = false;

  for (const pt of timeline) {
    if (pt.actionType === 'blind' || pt.actionType === 'refund') continue;

    if (pt.street !== currentStreet) {
      currentStreet = pt.street;
      facingBetOnStreet = false;
      streetRaiseSeen = 0;
    }

    const actor = pt.actorId;
    if (pt.street === 'preflop') {
      if (streetRaiseSeen === 1 && !playerThreeBetOpp.has(actor)) {
        playerThreeBetOpp.add(actor);
      }
      if (isBetOrRaiseType(pt.actionType)) {
        playerVpip.add(actor);
        playerPfr.add(actor);
        if (streetRaiseSeen >= 1) {
          playerThreeBet.add(actor);
        }
        preflopAggressorId = actor;
        preflopRaiseCount += 1;
        streetRaiseSeen += 1;
        facingBetOnStreet = true;
      } else if (pt.actionType === 'call') {
        playerVpip.add(actor);
        if (streetRaiseSeen === 0) {
          playerLimp.add(actor);
        }
        if (facingBetOnStreet) {
          playerFoldToBetOpp.set(actor, (playerFoldToBetOpp.get(actor) ?? 0) + 1);
        }
      } else if (pt.actionType === 'fold') {
        preflopFoldedIds.add(actor);
        if (facingBetOnStreet) {
          playerFoldToBetOpp.set(actor, (playerFoldToBetOpp.get(actor) ?? 0) + 1);
          playerFoldToBet.set(actor, (playerFoldToBet.get(actor) ?? 0) + 1);
        }
      }
    } else if (pt.street === 'flop' || pt.street === 'turn' || pt.street === 'river') {
      sawFlop = true;

      if (pt.street === 'flop' && preflopAggressorId && actor === preflopAggressorId && !pfaSawFlopAction) {
        if (!flopHadBetBeforePfa) {
          pfaSawFlopAction = true;
          if (isBetOrRaiseType(pt.actionType)) {
            pfaCbet = true;
          }
        }
      }

      if (isBetOrRaiseType(pt.actionType)) {
        if (pt.street === 'flop' && !flopFirstBetActorId) {
          flopFirstBetActorId = actor;
          if (actor !== preflopAggressorId) {
            flopHadBetBeforePfa = true;
          }
        }
        playerPostBets.set(actor, (playerPostBets.get(actor) ?? 0) + 1);
        facingBetOnStreet = true;
        streetRaiseSeen += 1;
      } else if (pt.actionType === 'call') {
        playerPostCalls.set(actor, (playerPostCalls.get(actor) ?? 0) + 1);
        if (facingBetOnStreet) {
          playerFoldToBetOpp.set(actor, (playerFoldToBetOpp.get(actor) ?? 0) + 1);
        }
        if (pt.street === 'river') {
          playerRiverCall.add(actor);
        }
      } else if (pt.actionType === 'fold') {
        if (facingBetOnStreet) {
          playerFoldToBetOpp.set(actor, (playerFoldToBetOpp.get(actor) ?? 0) + 1);
          playerFoldToBet.set(actor, (playerFoldToBet.get(actor) ?? 0) + 1);
        }
      }
    }
  }

  for (const p of record.players) {
    const delta = createEmptyBehaviorStats();
    delta.handsPlayed = 1;
    const won = winnerIds.has(p.id);

    if (playerVpip.has(p.id)) delta.vpipHands = 1;
    if (playerPfr.has(p.id)) delta.pfrHands = 1;
    if (playerLimp.has(p.id) && !playerPfr.has(p.id)) delta.limpHands = 1;
    if (playerThreeBetOpp.has(p.id)) delta.threeBetOpps = 1;
    if (playerThreeBet.has(p.id)) delta.threeBetCount = 1;
    delta.foldToBetOpps = playerFoldToBetOpp.get(p.id) ?? 0;
    delta.foldToBetCount = playerFoldToBet.get(p.id) ?? 0;

    if (sawFlop && !preflopFoldedIds.has(p.id)) {
      delta.sawFlopHands = 1;
    }
    if (preflopRaiseCount > 0 && preflopAggressorId === p.id && pfaSawFlopAction) {
      delta.cbetOpps = 1;
      if (pfaCbet) delta.cbetCount = 1;
    }

    delta.postflopBetsRaises = playerPostBets.get(p.id) ?? 0;
    delta.postflopCalls = playerPostCalls.get(p.id) ?? 0;

    if (reachedActualShowdown && !p.folded) {
      delta.wtsdHands = 1;
      if (won) delta.wonAtShowdownHands = 1;
    }

    if (p.allIn) {
      delta.allInHands = 1;
      if (won) delta.allInWonHands = 1;
    }

    const posBucket = classifyPositionBucket(
      p.seatIndex,
      allSeats,
      record.dealerSeatIndex,
      record.smallBlindSeatIndex,
      record.bigBlindSeatIndex
    );
    if (posBucket === 'early') {
      delta.earlyPosHands = 1;
      if (playerVpip.has(p.id)) delta.earlyPosVpip = 1;
    } else if (posBucket === 'late') {
      delta.latePosHands = 1;
      if (playerVpip.has(p.id)) delta.latePosVpip = 1;
    }

    if (playerRiverCall.has(p.id)) {
      delta.riverCalls = 1;
      if (won) delta.riverCallWins = 1;
    }

    if (record.pot >= bb * 20 && !p.folded) {
      delta.bigPotHands = 1;
      if (won) delta.bigPotWins = 1;
    }

    delta.totalNetBB = Number((p.netChange / bb).toFixed(2));
    result[p.id] = delta;
  }

  return result;
}

function pct(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 100);
}

function clampScore(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Computes a deterministic 6-axis poker personality radar profile (0-100 scale)
 * directly from accumulated behavioral metrics (VPIP, PFR, Agg%, C-Bet, W$SD, Discipline).
 */
export function computePokerRadarProfile(
  stats: PlayerBehaviorStats,
  metrics: PersonaMetricSnapshot,
  reviewAccuracyPct: number | null
): PokerRadarAxis[] {
  const hasHands = stats.handsPlayed > 0;
  const postflopTotal = stats.postflopBetsRaises + stats.postflopCalls;

  const vpipScore = hasHands ? clampScore((metrics.vpipPct / 65) * 100, 8, 100) : 0;
  const pfrScore = hasHands ? clampScore((metrics.pfrPct / 45) * 100, 6, 100) : 0;
  const aggScore = !hasHands
    ? 0
    : postflopTotal > 0
      ? clampScore(metrics.aggPct, 8, 100)
      : clampScore(metrics.pfrToVpipPct * 0.75, 10, 80);

  const cbetScore = !hasHands
    ? 0
    : metrics.cbetPct !== null
      ? clampScore(metrics.cbetPct, 8, 100)
      : clampScore(aggScore * 0.85, 12, 75);

  const showdownScore = !hasHands
    ? 0
    : metrics.wsdPct !== null
      ? clampScore(metrics.wsdPct, 10, 100)
      : 50;

  let disciplineScore = 0;
  if (hasHands) {
    let base = reviewAccuracyPct !== null ? reviewAccuracyPct : 64;
    if (metrics.limpPct >= 15) {
      base -= Math.min(26, (metrics.limpPct - 12) * 1.1);
    } else if (metrics.limpPct <= 6 && stats.vpipHands >= 2) {
      base += 6;
    }
    if (metrics.posAwarenessDiff !== null) {
      base += Math.max(-14, Math.min(14, metrics.posAwarenessDiff * 0.6));
    }
    if (metrics.vpipPct > 45 && metrics.pfrToVpipPct < 45) {
      base -= 14;
    }
    disciplineScore = clampScore(base, 12, 98);
  }

  return [
    {
      key: 'vpip',
      label: '入池活跃',
      metricCode: 'VPIP',
      score: vpipScore,
      benchmark: 42,
      rawLabel: hasHands ? `${metrics.vpipPct}%` : '—',
    },
    {
      key: 'pfr',
      label: '翻前主动',
      metricCode: 'PFR',
      score: pfrScore,
      benchmark: 49,
      rawLabel: hasHands ? `${metrics.pfrPct}%` : '—',
    },
    {
      key: 'aggPct',
      label: '翻后进攻',
      metricCode: 'Agg%',
      score: aggScore,
      benchmark: 62,
      rawLabel: postflopTotal > 0 ? `${metrics.aggPct}%` : '—',
    },
    {
      key: 'cbet',
      label: '持续施压',
      metricCode: 'C-Bet',
      score: cbetScore,
      benchmark: 60,
      rawLabel: metrics.cbetPct !== null ? `${metrics.cbetPct}%` : '—',
    },
    {
      key: 'showdown',
      label: '摊牌胜率',
      metricCode: 'W$SD',
      score: showdownScore,
      benchmark: 55,
      rawLabel: metrics.wsdPct !== null ? `${metrics.wsdPct}%` : '—',
    },
    {
      key: 'discipline',
      label: '决策纪律',
      metricCode: '纪律',
      score: disciplineScore,
      benchmark: 78,
      rawLabel:
        reviewAccuracyPct !== null
          ? `${reviewAccuracyPct}%`
          : hasHands
            ? `${disciplineScore}分`
            : '—',
    },
  ];
}

/**
 * Generates an evidence-grounded poker personality archetype, strengths, leaks,
 * good habits, and bad habits from cumulative PlayerBehaviorStats.
 */
export function buildPlayerPersonaReport(
  rawStats: PlayerBehaviorStats | null | undefined
): PlayerPersonaReport {
  const s = sanitizeBehaviorStats(rawStats);
  const hands = s.handsPlayed;

  const maturity: SampleMaturity =
    hands === 0 ? 'empty' : hands < 10 ? 'early' : hands < 40 ? 'developing' : 'solid';
  const maturityLabel =
    maturity === 'empty'
      ? '尚未记录对局'
      : maturity === 'early'
        ? `初阶样本 (${hands} 局 · 持续校准中)`
        : maturity === 'developing'
          ? `中期画像 (${hands} 局)`
          : `稳定画像 (${hands} 局)`;

  const vpipPct = pct(s.vpipHands, hands);
  const pfrPct = pct(s.pfrHands, hands);
  const pfrToVpipPct = s.vpipHands > 0 ? pct(s.pfrHands, s.vpipHands) : 0;
  const limpPct = pct(s.limpHands, hands);
  const threeBetPct = s.threeBetOpps >= 3 ? pct(s.threeBetCount, s.threeBetOpps) : null;
  const cbetPct = s.cbetOpps >= 2 ? pct(s.cbetCount, s.cbetOpps) : null;
  const foldToBetPct = s.foldToBetOpps >= 4 ? pct(s.foldToBetCount, s.foldToBetOpps) : null;
  const postflopTotal = s.postflopBetsRaises + s.postflopCalls;
  const aggPct = postflopTotal > 0 ? pct(s.postflopBetsRaises, postflopTotal) : 0;
  const aggressionFactor =
    s.postflopCalls > 0
      ? Number((s.postflopBetsRaises / s.postflopCalls).toFixed(2))
      : s.postflopBetsRaises > 0
        ? Number(Math.min(6, s.postflopBetsRaises).toFixed(2))
        : 0;
  const wtsdPct = s.sawFlopHands >= 3 ? pct(s.wtsdHands, s.sawFlopHands) : null;
  const wsdPct = s.wtsdHands >= 2 ? pct(s.wonAtShowdownHands, s.wtsdHands) : null;
  const earlyVpip = s.earlyPosHands >= 3 ? pct(s.earlyPosVpip, s.earlyPosHands) : null;
  const lateVpip = s.latePosHands >= 3 ? pct(s.latePosVpip, s.latePosHands) : null;
  const posAwarenessDiff =
    earlyVpip !== null && lateVpip !== null ? lateVpip - earlyVpip : null;
  const bbPer100 = hands > 0 ? Number(((s.totalNetBB / hands) * 100).toFixed(1)) : 0;

  const metrics: PersonaMetricSnapshot = {
    vpipPct,
    pfrPct,
    pfrToVpipPct,
    limpPct,
    threeBetPct,
    cbetPct,
    foldToBetPct,
    aggPct,
    aggressionFactor,
    wtsdPct,
    wsdPct,
    posAwarenessDiff,
    bbPer100,
  };

  const totalReviewedDecisions =
    s.reviewOptimalDecisions +
    s.reviewAcceptableDecisions +
    s.reviewInaccuracies +
    s.reviewMistakes;
  const reviewAccuracyPct =
    totalReviewedDecisions > 0
      ? Math.round(
          ((s.reviewOptimalDecisions + s.reviewAcceptableDecisions * 0.65) /
            totalReviewedDecisions) *
            100
        )
      : null;

  const radarAxes = computePokerRadarProfile(s, metrics, reviewAccuracyPct);

  const exposedPatterns: ExposedPatternSummary[] = (
    Object.entries(s.patternExposureCounts) as Array<[SessionPatternTag, number]>
  )
    .filter(([tag, cnt]) => tag !== 'balanced' && cnt > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pattern, count]) => ({
      pattern,
      count,
      ...SESSION_PATTERN_META[pattern],
    }));

  if (hands === 0) {
    return {
      handsPlayed: 0,
      maturity,
      maturityLabel,
      archetype: {
        id: 'newcomer',
        title: '画像待生成',
        englishTag: 'Uncharted',
        summary: '完成几局牌桌实战后，系统将结合每局复盘与牌桌动态画像，自动总结你的性格特征、优势短板与习惯建议。',
      },
      metrics,
      radarAxes,
      reviewAccuracyPct: null,
      totalReviewedDecisions: 0,
      exposedPatterns: [],
      recentSnapshots: [],
      strengths: [],
      weaknesses: [],
      goodHabits: [],
      badHabits: [],
    };
  }

  // Classify poker archetype
  let archetype: PlayerPersonaReport['archetype'];
  if (hands < 3) {
    archetype = {
      id: 'newcomer',
      title: '初入牌室 · 观察中',
      englishTag: 'Warmup',
      summary: `当前已采集 ${hands} 局样本，初步入池率 ${vpipPct}%、加注率 ${pfrPct}%。再打 8–10 局后画像将更精准。`,
    };
  } else if (vpipPct >= 46 && pfrPct >= 28 && aggressionFactor >= 2.3) {
    archetype = {
      id: 'maniac',
      title: '高波动压迫型',
      englishTag: 'Maniac / Hyper-LAG',
      summary: '你极具侵略性，高频入池并持续向对手施压，能制造极高的弃牌率，但在缺乏范围支撑时容易被冷静对手反抓。',
    };
  } else if (vpipPct >= 40 && pfrToVpipPct < 48 && aggressionFactor < 1.5) {
    archetype = {
      id: 'calling_station',
      title: '粘滞跟注型',
      englishTag: 'Calling Station',
      summary: '你喜欢用较宽的起手牌看翻牌并倾向用跟注防守，很难被纯诈唬赶走，但往往错失主动权并在价值下注中持续流血。',
    };
  } else if (vpipPct <= 19 && pfrToVpipPct >= 55) {
    archetype = {
      id: 'nit',
      title: '沉稳岩石型',
      englishTag: 'Tight Rock / Nit',
      summary: '起手牌纪律极强、极少涉险边缘底池，筹码曲线平稳；但过于保守容易在盲注位流失筹码并让对手轻松弃牌避让你的强牌。',
    };
  } else if (vpipPct >= 20 && vpipPct <= 33 && pfrToVpipPct >= 62 && aggressionFactor >= 1.7) {
    archetype = {
      id: 'tag',
      title: '紧凶掌控型',
      englishTag: 'TAG · Tight Aggressive',
      summary: '标准的赢家骨架：精选起手牌、主动争夺底池主导权，翻后价值与施压兼具，在各类牌桌中都具备长期正期望。',
    };
  } else if (vpipPct >= 33 && pfrPct >= 22 && aggressionFactor >= 1.8) {
    archetype = {
      id: 'lag',
      title: '松凶节奏型',
      englishTag: 'LAG · Loose Aggressive',
      summary: '擅长利用位置与多街施压打乱对手节奏，牌面覆盖极广；若能在面对大尺度反击时保持止损纪律，上限极高。',
    };
  } else if (vpipPct >= 34 && pfrToVpipPct < 55) {
    archetype = {
      id: 'loose_passive',
      title: '松散保守型',
      englishTag: 'Loose Passive',
      summary: '入池意愿较高但较少在翻前主动加注隔离，翻后偏重跟注而非主动造池，容易陷入多人底池的尴尬局面。',
    };
  } else {
    archetype = {
      id: 'balanced',
      title: '均衡稳健型',
      englishTag: 'Balanced Regular',
      summary: '你的入池频率与翻后攻防较为均衡，既不过度松散也不死板保守，接下来只需针对细微漏损打磨尺度即可进阶。',
    };
  }

  const strengths: PersonaDiagnosticItem[] = [];
  const weaknesses: PersonaDiagnosticItem[] = [];
  const goodHabits: PersonaDiagnosticItem[] = [];
  const badHabits: PersonaDiagnosticItem[] = [];

  // 1. Preflop selection & aggression gap (VPIP / PFR / Limp)
  if (vpipPct >= 20 && vpipPct <= 34) {
    strengths.push({
      id: 'str-vpip',
      title: '起手牌纪律清晰',
      evidence: `VPIP ${vpipPct}%（标准区间 20%–32%）`,
      detail: '没有被无聊感拖进劣质底池，也没有紧到错失可盈利起手牌，翻前底盘扎实。',
    });
  } else if (vpipPct > 38) {
    weaknesses.push({
      id: 'weak-loose-vpip',
      title: '翻前入池范围过宽',
      evidence: `VPIP ${vpipPct}%（偏高，建议压回 22%–32%）`,
      detail: '过多用弱同花、杂色隔张或低踢脚牌入池，翻后频繁落入被压制（Dominated）的被动局面。',
      actionableTip: '在前位（UTG/HJ）果断弃掉弱 A/K 杂色与小杂色连张，把宽范围留给按钮位。',
    });
  } else if (hands >= 6 && vpipPct < 17) {
    weaknesses.push({
      id: 'weak-tight-vpip',
      title: '翻前范围过窄，盲注流失偏快',
      evidence: `VPIP ${vpipPct}%（偏紧）`,
      detail: '只等待顶级强牌会让你在盲注循环中持续失血，且一旦加注容易被对手读出超强牌而集体弃牌。',
      actionableTip: '在 CO/BTN 位适当加入同花连张（如 76s–JTs）与同花 A（A2s–A9s）作为开池偷盲牌。',
    });
  }

  if (s.vpipHands >= 3 && pfrToVpipPct >= 68) {
    goodHabits.push({
      id: 'gh-initiative',
      title: '善于用加注争取翻前主动权',
      evidence: `PFR/VPIP 比值 ${pfrToVpipPct}%（PFR ${pfrPct}%）`,
      detail: '入池时优先通过公开加注或 3-Bet 拿主导权，而不是被动跟注，使翻后持续下注更具威慑力。',
    });
  }

  if (hands >= 5 && limpPct >= 18) {
    badHabits.push({
      id: 'bh-limp',
      title: '翻前平跟（Limp）偏多',
      evidence: `平跟入池率 ${limpPct}%（建议控制在 8% 以内）`,
      detail: '公开平跟既无法直接收下盲注，又容易把底池拖入多人混战，同时清晰暴露你缺少顶级强牌的上限。',
      actionableTip: '采用「加注或弃牌（Raise or Fold）」原则：值得玩的牌统一加注 2.5BB–3BB，边缘牌直接弃牌。',
    });
  } else if (hands >= 6 && limpPct <= 6 && s.vpipHands >= 2) {
    goodHabits.push({
      id: 'gh-no-limp',
      title: '极少无意义翻前平跟',
      evidence: `平跟率仅 ${limpPct}%`,
      detail: '保持了干净的「加注或弃牌」翻前结构，让对手很难从你的入池方式直接读穿手牌强度。',
    });
  }

  // 2. Position awareness
  if (posAwarenessDiff !== null) {
    if (posAwarenessDiff >= 10) {
      goodHabits.push({
        id: 'gh-position',
        title: '具备鲜明的位置意识',
        evidence: `后位入池 ${lateVpip}% vs 前位 ${earlyVpip}%（差值 +${posAwarenessDiff}%）`,
        detail: '懂得在前位收紧、在后位利用信息优势扩大入池与施压，这是长期赢家的核心习惯。',
      });
    } else if (posAwarenessDiff <= 0 && (earlyVpip ?? 0) >= 28) {
      badHabits.push({
        id: 'bh-position',
        title: '前位与后位缺少范围区分',
        evidence: `前位入池 ${earlyVpip}%，不低于后位 ${lateVpip}%`,
        detail: '在缺乏位置优势的座位玩了太多边缘牌，翻后需要率先表态，极易被后位对手控池或剥削。',
        actionableTip: '前位只保留强对子、强高张与高同花连张；边缘投机牌集中放到按钮位（BTN）再开池。',
      });
    }
  }

  // 3. Postflop aggression & C-bet
  if (s.postflopBetsRaises + s.postflopCalls >= 4) {
    if (aggressionFactor >= 1.8 && aggressionFactor <= 4.2) {
      strengths.push({
        id: 'str-af',
        title: '翻后攻守节奏紧凑有力',
        evidence: `翻后激进因子 AF ${aggressionFactor}（推荐 2.0–3.5）`,
        detail: '下注与加注占比健康，能够主动给强牌打价值，也能用听牌半诈唬施压，而非一味被动跟注。',
      });
    } else if (aggressionFactor < 1.2) {
      badHabits.push({
        id: 'bh-passive',
        title: '翻后偏被动，跟注过多',
        evidence: `翻后 AF ${aggressionFactor}（下注/加注 ${s.postflopBetsRaises} 次 vs 跟注 ${s.postflopCalls} 次）`,
        detail: '过度依赖跟注放弃了弃牌率（Fold Equity），也常在拿强牌时少收价值。',
        actionableTip: '拿强听牌或顶对好踢脚时主动下注/加注，减少用弱中对一路被动跟到底的习惯。',
      });
    } else if (aggressionFactor > 4.5 && (wsdPct ?? 100) < 48) {
      badHabits.push({
        id: 'bh-over-aggro',
        title: '翻后过度猛打，诈唬频率偏高',
        evidence: `翻后 AF ${aggressionFactor}${wsdPct !== null ? ` · 摊牌胜率 ${wsdPct}%` : ''}`,
        detail: '几乎不留过牌保护与抓鸡跟注范围，遇到冷静对手反击或跟注站时容易把大底池送出去。',
        actionableTip: '中等摊牌价值牌（如中对、弱顶对）多用过牌控池；诈唬优先选择带阻断牌的组合。',
      });
    }
  }

  if (cbetPct !== null) {
    if (cbetPct >= 48 && cbetPct <= 75) {
      goodHabits.push({
        id: 'gh-cbet',
        title: '持续下注（C-Bet）频率克制有效',
        evidence: `C-Bet 频率 ${cbetPct}%（${s.cbetCount}/${s.cbetOpps}）`,
        detail: '懂得结合牌面结构选择性持续施压，既保留了范围优势变现，又避免无脑全频 C-Bet 被对手浮跟反制。',
      });
    } else if (cbetPct > 82 && s.cbetOpps >= 3) {
      badHabits.push({
        id: 'bh-cbet-spam',
        title: '翻牌无差别高频 C-Bet',
        evidence: `C-Bet 高达 ${cbetPct}%（${s.cbetCount}/${s.cbetOpps}）`,
        detail: '在湿润中小连张牌面也机械持续下注，容易被对手过牌加注或转牌浮跟偷池反制。',
        actionableTip: '高牌干燥面可高频小额（33%池）C-Bet；湿润低张多人面多过牌控池。',
      });
    } else if (cbetPct < 35 && s.cbetOpps >= 3) {
      weaknesses.push({
        id: 'weak-low-cbet',
        title: '翻后延续主动权不足',
        evidence: `C-Bet 仅 ${cbetPct}%（${s.cbetCount}/${s.cbetOpps}）`,
        detail: '翻前加注建立的范围优势在翻牌白白拱手相让，让对手免费看转牌实现低胜率听牌。',
        actionableTip: '翻前作为加注者在 A/K 高牌干燥面上，即便未击中也可高频采用 1/3 底池轻度持续下注。',
      });
    }
  }

  // 4. Showdown efficiency & fold discipline
  if (wtsdPct !== null && wsdPct !== null) {
    if (wsdPct >= 54) {
      strengths.push({
        id: 'str-wsd',
        title: '摊牌胜率出色，价值判断准确',
        evidence: `W$SD 摊牌胜率 ${wsdPct}%（WTSD ${wtsdPct}%）`,
        detail: '走到河牌摊牌时往往握有范围领先牌力，很少把筹码白白捐给明显更强的牌型。',
      });
    } else if (wtsdPct >= 42 && wsdPct <= 44) {
      badHabits.push({
        id: 'bh-station-showdown',
        title: '过度恋牌，河牌止损偏慢',
        evidence: `摊牌率 WTSD ${wtsdPct}% 偏高 · 摊牌胜率仅 ${wsdPct}%`,
        detail: '面对多街持续重注仍难以放下边缘成牌，导致大底池摊牌胜率偏低。',
        actionableTip: '面对对手转牌+河牌连续重注时，对照底池赔率评估对手价值组合，果断弃掉无阻断牌的弱跟注牌。',
      });
    }
  }

  if (foldToBetPct !== null) {
    if (foldToBetPct >= 62) {
      weaknesses.push({
        id: 'weak-overfold',
        title: '面对加注/下注弃牌过快',
        evidence: `面对下注弃牌率 ${foldToBetPct}%`,
        detail: '防守频率低于最小防守频率（MDF），一旦被激进对手察觉，会遭到高频率的持续偷池剥削。',
        actionableTip: '面对 1/2 底池下注至少应防守约 67% 的到达范围，保留带后门听牌和顶对/中对继续跟注。',
      });
    } else if (foldToBetPct <= 24 && s.foldToBetOpps >= 6 && (wsdPct ?? 50) < 50) {
      weaknesses.push({
        id: 'weak-underfold',
        title: '面对重注防守过宽，容易支付大额价值',
        evidence: `面对下注弃牌率仅 ${foldToBetPct}%`,
        detail: '过于执着抓诈唬，会让紧凶对手通过扩大价值下注尺度轻松收割。',
        actionableTip: '记住底池赔率：面对 1 倍满池下注需要 33.3% 胜率才能跟注回本，垃圾踢脚果断止损。',
      });
    }
  }

  // 5. River hero calls & All-in / Big pot discipline
  if (s.riverCalls >= 3) {
    const riverWinRate = pct(s.riverCallWins, s.riverCalls);
    if (riverWinRate >= 55) {
      goodHabits.push({
        id: 'gh-river-read',
        title: '河牌抓鸡冷静且命中率高',
        evidence: `河牌跟注胜率 ${riverWinRate}%（${s.riverCallWins}/${s.riverCalls}）`,
        detail: '在河牌高压决策下读牌清晰，能区分真实价值重注与错失听牌后的绝望诈唬。',
      });
    } else if (riverWinRate <= 33) {
      badHabits.push({
        id: 'bh-river-payoff',
        title: '河牌好奇跟注（Hero Call）亏损较多',
        evidence: `河牌跟注胜率仅 ${riverWinRate}%（${s.riverCallWins}/${s.riverCalls}）`,
        detail: '多数对手在河牌的真实诈唬比例低于理论值，频繁好奇看牌会造成显著的长期 BB 漏损。',
        actionableTip: '河牌面对大额下注前先问自己：对手有哪些没成的听牌会这样打？若想不出足够诈唬组合就果断弃牌。',
      });
    }
  }

  if (s.bigPotHands >= 3) {
    const bigWinRate = pct(s.bigPotWins, s.bigPotHands);
    if (bigWinRate >= 55) {
      strengths.push({
        id: 'str-bigpot',
        title: '大底池执行稳定',
        evidence: `20BB+ 大底池胜率 ${bigWinRate}%（${s.bigPotWins}/${s.bigPotHands}）`,
        detail: '关键深底池中牌力选择扎实，情绪波动小，能稳稳把优势转化为筹码增量。',
      });
    } else if (bigWinRate <= 33) {
      weaknesses.push({
        id: 'weak-bigpot',
        title: '大底池控制偏弱，容易用中等牌打光',
        evidence: `20BB+ 大底池胜率 ${bigWinRate}%（${s.bigPotWins}/${s.bigPotHands}）`,
        detail: '常在单对牌力下将底池越做越大，深筹码底池应遵循「大牌打大池、中等牌打小池」原则。',
        actionableTip: '单对牌力尽量控制在两条街以内价值下注，避免在湿润牌面用弱踢脚跟进超大底池。',
      });
    }
  }

  // Ensure every bucket has at least one honest, grounded takeaway once >= 3 hands exist
  if (strengths.length === 0) {
    strengths.push({
      id: 'str-baseline',
      title: hands < 10 ? '实战样本稳步积累中' : '整体节奏无极端失衡',
      evidence: `累计 ${hands} 局 · 盈亏 ${s.totalNetBB >= 0 ? '+' : ''}${s.totalNetBB.toFixed(1)} BB`,
      detail:
        hands < 10
          ? '已初步形成行为曲线，继续对局将解锁位置差值、C-Bet 效率与河牌抓鸡等深度维度。'
          : '各项指标处于可塑区间，结合每局赛后复盘微调下注尺度即可稳步提升胜率。',
    });
  }

  if (goodHabits.length === 0 && hands >= 3) {
    goodHabits.push({
      id: 'gh-baseline',
      title: '保持稳定参与和复盘节奏',
      evidence: `累计完成 ${hands} 局实战记录`,
      detail: '持续观察位置、底池赔率与对手行动序列，是建立长期正期望打法的第一步。',
    });
  }

  if (weaknesses.length === 0 && badHabits.length === 0 && hands >= 5) {
    weaknesses.push({
      id: 'weak-fine-tune',
      title: '暂无显著结构性大漏损',
      evidence: `VPIP ${vpipPct}% / PFR ${pfrPct}% / AF ${aggressionFactor}`,
      detail: '基础框架较为健康，下一阶段可重点打磨 3-Bet 轻度施压与河牌极化下注尺度。',
      actionableTip: '在单局复盘中重点关注每条街的下注尺度和阻断牌应用。',
    });
  }

  // Incorporate per-hand review accuracy & session-profiler exposure directly into habits/diagnostics
  if (reviewAccuracyPct !== null && totalReviewedDecisions >= 6) {
    if (reviewAccuracyPct >= 76) {
      strengths.push({
        id: 'str-review-accuracy',
        title: '多局复盘 GTO 执行吻合度高',
        evidence: `累计 ${totalReviewedDecisions} 次复盘节点 · 精准度 ${reviewAccuracyPct}%`,
        detail: '在多局真实底池中持续贴合数学期望最优线，很少出现冲动偏离。',
      });
    } else if (reviewAccuracyPct <= 55) {
      weaknesses.push({
        id: 'weak-review-accuracy',
        title: '关键节点决策偏差偏多',
        evidence: `累计 ${totalReviewedDecisions} 次复盘节点 · 失误 ${s.reviewMistakes} 次（精准度 ${reviewAccuracyPct}%）`,
        detail: '多局复盘显示在翻前范围或翻后赔率计算上存在重复漏损，建议每局结束后点开「复盘本局」对照关键节点。',
        actionableTip: '优先修正重复出现的关键失误（如负赔率跟注或翻前高频平跟），胜率提升最快。',
      });
    }
  }

  if (exposedPatterns.length > 0 && exposedPatterns[0].count >= 2) {
    const topExposed = exposedPatterns[0];
    badHabits.push({
      id: `bh-exposed-${topExposed.pattern}`,
      title: `易被牌桌读出「${topExposed.label}」套路`,
      evidence: `当局画像模块累计触发 ${topExposed.count} 次识别`,
      detail: topExposed.counterRisk,
      actionableTip: topExposed.adaptationTip,
    });
  }

  return {
    handsPlayed: hands,
    maturity,
    maturityLabel,
    archetype,
    metrics,
    radarAxes,
    reviewAccuracyPct,
    totalReviewedDecisions,
    exposedPatterns,
    recentSnapshots: s.recentSnapshots,
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
    goodHabits: goodHabits.slice(0, 4),
    badHabits: badHabits.slice(0, 4),
  };
}
