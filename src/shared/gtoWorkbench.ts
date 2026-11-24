import type {
  Card,
  DecisionVerdict,
  HandReviewHeroDecision,
  HandReviewReport,
  HandReviewSessionContext,
  HandReviewSessionOpponentRead,
  Rank,
  StreetPhase,
  Suit,
} from './types';

// ============================================================================
// Shared Frontend-Backend Contract (matches docs/GTO_EXPLOIT_ARCHITECTURE_SPEC.md)
// ============================================================================

export type GtoEngineSource = 'texassolver' | 'blueprint' | 'heuristic';

export type GtoEvGrade = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export type GtoActionKey = 'raise' | 'call' | 'check' | 'fold';

export type NodeLockPresetId =
  | 'over_fold'
  | 'calling_station'
  | 'over_bluff'
  | 'passive_limper';

export interface GtoSolverMeta {
  engineLabel: string;
  exploitabilityPctPot: number | null;
  iterations: number | null;
  solveTimeMs: number | null;
  cacheHit: boolean;
  canonicalBoardKey: string;
}

export interface GtoActionOption {
  key: GtoActionKey;
  label: string;
  sizePctPot?: number;
  gtoFreqPct: number;
  evBB: number;
  isRecommended: boolean;
  isHeroAction: boolean;
}

export interface RangeMatrixMix {
  raise: number;
  call: number;
  check: number;
  fold: number;
}

export interface RangeMatrixCell {
  hand: string; // e.g., 'AA', 'AKs', 'AKo'
  row: number; // 0..12 (A..2)
  col: number; // 0..12 (A..2)
  kind: 'pair' | 'suited' | 'offsuit';
  inRangePct: number; // 0..100 reach weight
  combos: number; // concrete surviving combos (max 6 pair / 4 suited / 12 offsuit)
  mix: RangeMatrixMix; // sums to 100
  evBB: number;
  isHeroHand: boolean;
  // Optional Node-Lock comparison fields populated in exploitMatrix
  deltaRaisePct?: number;
  deltaCallPct?: number;
  evGainBB?: number;
}

export interface BlockerImpact {
  id: string;
  title: string;
  impact: 'positive' | 'negative' | 'neutral';
  cardRemovalPct: number;
  detail: string;
}

export interface GeometricSizingInfo {
  betPotPct: number;
  streetsRemaining: number;
  summaryLabel: string;
}

export interface RangeGeometryMetrics {
  rangeAdvantagePct: number; // Hero vs Villain mean equity delta (%)
  nutAdvantagePct: number; // Hero vs Villain top-decile nut density delta (%)
  spr: number;
  sprZoneLabel: string;
  mdfPct: number;
  bluffAlphaPct: number;
  geometricSizing: GeometricSizingInfo;
  boardTextureLabel: string;
  recommendedStructure: string;
}

export interface BayesianLeakRead {
  metricLabel: string;
  gtoBaselinePct: number;
  observedPct: number;
  posteriorPct: number;
  sampleHands: number;
  priorKappa: number;
  confidenceWeight: number; // 0..1 = n / (n + kappa)
  shrinkageNote: string;
}

export interface NodeLockActionDiff {
  key: GtoActionKey;
  label: string;
  gtoFreqPct: number;
  exploitFreqPct: number;
  deltaPct: number;
}

export interface NodeLockExploitResult {
  presetId: NodeLockPresetId;
  presetLabel: string;
  targetPlayerName: string;
  bayesianRead: BayesianLeakRead;
  evGainBB: number;
  evGainPctPot: number;
  actionDiffs: NodeLockActionDiff[];
  counterStrategySummary: string;
  marginOfSafetyWarning: string;
  exploitMatrix: RangeMatrixCell[];
}

export interface GtoSpotWorkbenchData {
  source: GtoEngineSource;
  solverMeta: GtoSolverMeta;
  handNumber: number;
  decisionStep: number;
  street: 'preflop' | 'flop' | 'turn' | 'river';
  streetLabel: string;
  heroPosition: string;
  heroCanonicalHand: string | null;
  heroActualAction: GtoActionKey;
  heroActualLabel: string;
  recommendedAction: GtoActionKey;
  recommendedLabel: string;
  evLossBB: number;
  evLossPctPot: number;
  evGrade: GtoEvGrade;
  evGradeLabel: string;
  heroActionEvBB: number;
  bestActionEvBB: number;
  actionOptions: GtoActionOption[];
  geometry: RangeGeometryMetrics;
  blockers: BlockerImpact[];
  gtoMatrix: RangeMatrixCell[];
  exploit?: NodeLockExploitResult;
}

export interface GtoSpotAnalysisRequest {
  roomId?: string;
  handNumber: number;
  decisionStep: number;
  street: 'preflop' | 'flop' | 'turn' | 'river';
  heroPosition: string;
  villainPosition?: string;
  heroHoleCards: Card[];
  communityCards: Card[];
  potBeforeChips: number;
  toCallChips: number;
  effectiveStackChips: number;
  bigBlind: number;
  heroActualAction: GtoActionKey;
  heroActualLabel: string;
  heroBetChips?: number;
  allowAsyncSolver?: boolean;
}

export interface GtoNodeLockRequest {
  spotRequest: GtoSpotAnalysisRequest;
  presetId: NodeLockPresetId;
  targetPlayerId?: string;
  targetPlayerName?: string;
  observedDeviationPct: number;
  sampleHands: number;
  priorStrengthKappa?: number;
  marginOfSafetyLambda?: number;
  customLockedFreqs?: Partial<RangeMatrixMix>;
}

export interface GtoNodeLockResponse {
  ok: boolean;
  source?: GtoEngineSource;
  exploit?: NodeLockExploitResult;
  error?: string;
}

export interface NodeLockPresetDefinition {
  id: NodeLockPresetId;
  label: string;
  shortLabel: string;
  metricLabel: string;
  gtoBaselinePct: number;
  defaultDeviationPct: number;
  description: string;
}

// ============================================================================
// Constants & Canonical 13x13 Hand Table
// ============================================================================

export const MATRIX_RANKS = [
  'A',
  'K',
  'Q',
  'J',
  'T',
  '9',
  '8',
  '7',
  '6',
  '5',
  '4',
  '3',
  '2',
] as const;

export const EV_GRADE_LABELS: Record<GtoEvGrade, string> = {
  best: '最优',
  good: '良好',
  inaccuracy: '轻微偏差',
  mistake: '明显失误',
  blunder: '严重漏损',
};

export const NODE_LOCK_PRESETS: Record<NodeLockPresetId, NodeLockPresetDefinition> = {
  over_fold: {
    id: 'over_fold',
    label: '对手过度弃牌 (Over-Fold)',
    shortLabel: '过度弃牌',
    metricLabel: '面对下注弃牌率',
    gtoBaselinePct: 42,
    defaultDeviationPct: 22,
    description: '对手防守频率低于 MDF，Node-Lock 将扩张带高张/同花阻断的偷鸡与高频小注施压。',
  },
  calling_station: {
    id: 'calling_station',
    label: '跟注站 (Calling Station)',
    shortLabel: '跟注站',
    metricLabel: '面对下注跟注率',
    gtoBaselinePct: 46,
    defaultDeviationPct: 24,
    description: '对手几乎不弃中弱成牌，Node-Lock 将收缩纯空气诈唬并大幅扩张薄价值下注与尺度。',
  },
  over_bluff: {
    id: 'over_bluff',
    label: '过度激进偷鸡 (Over-Bluff)',
    shortLabel: '过度偷鸡',
    metricLabel: '激进下注/诈唬频率',
    gtoBaselinePct: 32,
    defaultDeviationPct: 20,
    description: '对手攻击线诈唬占比过高，Node-Lock 将收紧弃牌、提高抓鸡跟注频率并增加慢打陷阱。',
  },
  passive_limper: {
    id: 'passive_limper',
    label: '翻前被动平跟 (Passive Limper)',
    shortLabel: '被动平跟',
    metricLabel: '入池平跟/被动率',
    gtoBaselinePct: 16,
    defaultDeviationPct: 26,
    description: '对手入池范围过宽且封顶（缺少顶级强牌），Node-Lock 将扩张线性价值隔离加注频率。',
  },
};

export const ACTION_LABELS_ZH: Record<GtoActionKey, string> = {
  raise: '加注 / 下注',
  call: '跟注',
  check: '过牌',
  fold: '弃牌',
};

const SUIT_SYMBOL: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const SUIT_LABEL_ZH: Record<Suit, string> = {
  spades: '黑桃',
  hearts: '红桃',
  diamonds: '方块',
  clubs: '梅花',
};

const STREET_LABEL_ZH: Record<'preflop' | 'flop' | 'turn' | 'river', string> = {
  preflop: '翻前',
  flop: '翻牌圈',
  turn: '转牌圈',
  river: '河牌圈',
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function rankToChar(rank: Rank): string {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  if (rank === 10) return 'T';
  return String(rank);
}

export function getCanonicalHandLabel(row: number, col: number): {
  hand: string;
  kind: 'pair' | 'suited' | 'offsuit';
} {
  const r1 = MATRIX_RANKS[row];
  const r2 = MATRIX_RANKS[col];
  if (row === col) {
    return { hand: `${r1}${r2}`, kind: 'pair' };
  }
  if (row < col) {
    return { hand: `${r1}${r2}s`, kind: 'suited' };
  }
  return { hand: `${r2}${r1}o`, kind: 'offsuit' };
}

export function normalizeActionKey(raw: string): GtoActionKey {
  const lower = raw.toLowerCase();
  if (lower.includes('fold') || lower.includes('弃')) return 'fold';
  if (lower.includes('check') || lower.includes('让') || lower.includes('过')) return 'check';
  if (lower.includes('call') || lower.includes('跟')) return 'call';
  return 'raise';
}

// ============================================================================
// Pure Game-Theory Math Primitives (Unit-Tested)
// ============================================================================

/**
 * 5-tier GTO Wizard EV Loss grading standard.
 */
export function classifyEvLossGrade(
  evLossBB: number,
  potBB: number
): { grade: GtoEvGrade; label: string; pctOfPot: number } {
  const safeLoss = Math.max(0, evLossBB);
  const safePot = Math.max(1, potBB);
  const pctOfPot = round1((safeLoss / safePot) * 100);

  let grade: GtoEvGrade;
  if (safeLoss <= 0.05 || pctOfPot <= 0.5) {
    grade = 'best';
  } else if (pctOfPot <= 2.0) {
    grade = 'good';
  } else if (pctOfPot <= 5.0) {
    grade = 'inaccuracy';
  } else if (pctOfPot <= 12.0) {
    grade = 'mistake';
  } else {
    grade = 'blunder';
  }

  return {
    grade,
    label: EV_GRADE_LABELS[grade],
    pctOfPot,
  };
}

/**
 * Geometric bet sizing across k remaining streets to commit effective stack cleanly:
 * (1 + 2f)^k = 1 + 2 * SPR  =>  f = ((1 + 2 * SPR)^(1/k) - 1) / 2
 */
export function computeGeometricBetSizing(
  spr: number,
  streetsRemaining: number
): GeometricSizingInfo {
  const k = Math.max(1, Math.min(3, Math.round(streetsRemaining)));
  const safeSpr = Math.max(0.2, spr);
  const rawFraction = (Math.pow(1 + 2 * safeSpr, 1 / k) - 1) / 2;
  const betPotPct = Math.round(clamp(rawFraction * 100, 20, 220));
  const summaryLabel =
    betPotPct >= 180
      ? `剩余 ${k} 街 · 建议超池/全下几何线 (${betPotPct}% 池)`
      : `剩余 ${k} 街 · 等比 ${betPotPct}% 底池打光`;

  return {
    betPotPct,
    streetsRemaining: k,
    summaryLabel,
  };
}

/**
 * Bayesian Beta/Dirichlet Shrinkage estimator to prevent small-sample overfitting.
 */
export function computeBayesianPosterior(
  priorMeanPct: number,
  observedPct: number,
  sampleHands: number,
  priorKappa = 16
): {
  posteriorPct: number;
  confidenceWeight: number;
  shrinkagePct: number;
} {
  const n = Math.max(0, sampleHands);
  const kappa = Math.max(1, priorKappa);
  const prior = clamp(priorMeanPct, 0, 100);
  const obs = clamp(observedPct, 0, 100);

  const confidenceWeight = round2(n / (n + kappa));
  const posteriorPct = round1(prior * (1 - confidenceWeight) + obs * confidenceWeight);
  const shrinkagePct = Math.round((1 - confidenceWeight) * 100);

  return {
    posteriorPct,
    confidenceWeight,
    shrinkagePct,
  };
}

/**
 * Normalize 4-action probabilities so they strictly sum to 100 integer percent.
 */
export function normalizeMixTo100(raw: RangeMatrixMix): RangeMatrixMix {
  const keys: GtoActionKey[] = ['raise', 'call', 'check', 'fold'];
  const sanitized = keys.map((k) => Math.max(0, Number.isFinite(raw[k]) ? raw[k] : 0));
  const total = sanitized.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return { raise: 0, call: 0, check: 100, fold: 0 };
  }

  const exact = sanitized.map((v) => (v / total) * 100);
  const floored = exact.map((v) => Math.floor(v));
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, idx) => ({ idx, frac: v - floored[idx] }))
    .sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < remainder; i += 1) {
    floored[order[i % order.length].idx] += 1;
  }

  return {
    raise: floored[0],
    call: floored[1],
    check: floored[2],
    fold: floored[3],
  };
}

// ============================================================================
// Card Removal / Blocker & Unblocker Engine
// ============================================================================

export function analyzeHeroBlockers(
  heroHoleCards: Card[] | null,
  communityCards: Card[],
  street: 'preflop' | 'flop' | 'turn' | 'river'
): BlockerImpact[] {
  if (!heroHoleCards || heroHoleCards.length < 2) {
    return [
      {
        id: 'no-cards',
        title: '未获取到完整底牌',
        impact: 'neutral',
        cardRemovalPct: 0,
        detail: '缺少 Hero 两张底牌信息，暂无法计算具体花色阻断移除率。',
      },
    ];
  }

  const [c1, c2] = heroHoleCards;
  const visibleBoard =
    street === 'preflop'
      ? []
      : street === 'flop'
        ? communityCards.slice(0, 3)
        : street === 'turn'
          ? communityCards.slice(0, 4)
          : communityCards.slice(0, 5);

  const impacts: BlockerImpact[] = [];

  if (visibleBoard.length === 0) {
    // Preflop blockers (A/K blockers to Villain 3-Bet/4-Bet value range)
    const highCards = heroHoleCards.filter((c) => c.rank >= 13);
    if (highCards.length > 0) {
      const labels = highCards.map((c) => `${rankToChar(c.rank)}${SUIT_SYMBOL[c.suit]}`).join(' / ');
      const removal = highCards.length === 2 ? 42 : 25;
      impacts.push({
        id: 'preflop-high-blocker',
        title: `翻前顶级组合阻断 (${labels})`,
        impact: 'positive',
        cardRemovalPct: removal,
        detail: `持有 ${labels} 将对手 AA/KK/AK 强价值组合移除约 ${removal}%，显著提升翻前 3-Bet / 4-Bet 轻偷与隔离收益。`,
      });
    } else if (c1.suit === c2.suit) {
      impacts.push({
        id: 'preflop-suited-playability',
        title: `同花连张可玩性 (${SUIT_LABEL_ZH[c1.suit]}同花)`,
        impact: 'positive',
        cardRemovalPct: 12,
        detail: '翻前同花结构拥有更高的隐含赔率与权益实现率（EQR），适合在有位置时混合入池或轻 3-Bet。',
      });
    } else {
      impacts.push({
        id: 'preflop-unblocked-premiums',
        title: '未阻断对手顶级强牌',
        impact: 'negative',
        cardRemovalPct: 0,
        detail: '手牌不含 A/K 阻断张，对手范围内 AA/KK/AK 完整保留，面对再加注时应保持严格弃牌纪律。',
      });
    }
    return impacts;
  }

  // Postflop analysis
  // 1) Flush blockers
  const suitCounts = new Map<Suit, number>();
  for (const bc of visibleBoard) {
    suitCounts.set(bc.suit, (suitCounts.get(bc.suit) ?? 0) + 1);
  }
  let dominantSuit: Suit | null = null;
  let dominantSuitCount = 0;
  for (const [suit, count] of suitCounts.entries()) {
    if (count > dominantSuitCount) {
      dominantSuit = suit;
      dominantSuitCount = count;
    }
  }

  if (dominantSuit && dominantSuitCount >= 2) {
    const heroOfSuit = heroHoleCards.filter((c) => c.suit === dominantSuit);
    const highestBoardOfSuit = Math.max(
      ...visibleBoard.filter((c) => c.suit === dominantSuit).map((c) => c.rank)
    );
    const nutRank: Rank = highestBoardOfSuit === 14 ? 13 : 14;
    const hasNutBlocker = heroOfSuit.some((c) => c.rank === nutRank);

    if (hasNutBlocker) {
      const card = heroOfSuit.find((c) => c.rank === nutRank)!;
      impacts.push({
        id: 'nut-flush-blocker',
        title: `坚果同花阻断 (${rankToChar(card.rank)}${SUIT_SYMBOL[card.suit]})`,
        impact: 'positive',
        cardRemovalPct: dominantSuitCount >= 3 ? 52 : 34,
        detail:
          dominantSuitCount >= 3
            ? `公共牌出现 ${dominantSuitCount} 张${SUIT_LABEL_ZH[dominantSuit]}，你持有最高花色阻断牌，几乎清空对手坚果同花组合，是极佳的极化施压或诈唬载体。`
            : `两张${SUIT_LABEL_ZH[dominantSuit]}听花牌面持有坚果花色阻断，既降低对手强听花密度，又保留后门坚果同花权益。`,
      });
    } else if (heroOfSuit.length === 0 && dominantSuitCount === 2 && street === 'river') {
      impacts.push({
        id: 'missed-flush-unblocker',
        title: `正向非阻断：未阻断错失听花 (${SUIT_LABEL_ZH[dominantSuit]})`,
        impact: 'positive',
        cardRemovalPct: 24,
        detail: `手牌不含${SUIT_LABEL_ZH[dominantSuit]}，完整保留对手翻牌/转牌跟注但河牌错失的听花弃牌组合，更利于河牌价值下注或抓鸡。`,
      });
    } else if (heroOfSuit.length === 1 && dominantSuitCount === 2 && street === 'river') {
      const card = heroOfSuit[0];
      impacts.push({
        id: 'missed-draw-blocker-warning',
        title: `轻微反向阻断 (${rankToChar(card.rank)}${SUIT_SYMBOL[card.suit]})`,
        impact: 'negative',
        cardRemovalPct: 16,
        detail: `单张${SUIT_LABEL_ZH[dominantSuit]}轻微减少了对手河牌错失听花的诈唬/弃牌组合，边际抓鸡时需适当降低跟注频率。`,
      });
    }
  }

  // 2) Top board rank / Set / Two-Pair blocker
  const boardRanksDesc = [...visibleBoard].map((c) => c.rank).sort((a, b) => b - a);
  const topBoardRank = boardRanksDesc[0];
  const heroHitsTopRank = heroHoleCards.some((c) => c.rank === topBoardRank);
  if (heroHitsTopRank) {
    impacts.push({
      id: 'top-pair-set-blocker',
      title: `顶牌价值阻断 (${rankToChar(topBoardRank)}x)`,
      impact: 'positive',
      cardRemovalPct: 33,
      detail: `持有公共牌最高张 ${rankToChar(topBoardRank)}，直接将对手顶暗三组合从 3 组压减至 1 组、顶对强踢脚组合减少约 33%。`,
    });
  }

  // 3) Straight connectivity blocker
  const uniqueRanks = Array.from(new Set(boardRanksDesc));
  const maxSpan = uniqueRanks.length >= 3 ? uniqueRanks[0] - uniqueRanks[uniqueRanks.length - 1] : 99;
  if (maxSpan <= 5) {
    const heroConnected = heroHoleCards.some((c) =>
      uniqueRanks.some((br) => Math.abs(c.rank - br) <= 2 && c.rank !== br)
    );
    if (heroConnected) {
      impacts.push({
        id: 'straight-key-blocker',
        title: '关键顺子连接阻断',
        impact: 'positive',
        cardRemovalPct: 26,
        detail: '公共牌区间紧密存在成顺结构，手牌占据关键顺子补张区间，削弱对手顺子价值密度。',
      });
    }
  }

  if (impacts.length === 0) {
    impacts.push({
      id: 'clean-unblocker',
      title: '中性牌面移除结构',
      impact: 'neutral',
      cardRemovalPct: 8,
      detail: '底牌对当前牌面顶层坚果范围移除效应较弱，决策权重应更多依据底池赔率、范围优势与对手频次。',
    });
  }

  return impacts.slice(0, 3);
}

// ============================================================================
// Range Geometry & Board Texture Evaluation
// ============================================================================

function describeBoardTexture(board: Card[], street: 'preflop' | 'flop' | 'turn' | 'river'): {
  label: string;
  wetness: number; // 0..1
  highCardAdvantage: number; // -1..1 (positive favors aggressor / IP)
} {
  if (street === 'preflop' || board.length === 0) {
    return {
      label: '翻前标准范围博弈',
      wetness: 0.35,
      highCardAdvantage: 0.2,
    };
  }

  const visible =
    street === 'flop' ? board.slice(0, 3) : street === 'turn' ? board.slice(0, 4) : board.slice(0, 5);
  const suits = new Map<Suit, number>();
  const ranks = new Map<Rank, number>();
  for (const c of visible) {
    suits.set(c.suit, (suits.get(c.suit) ?? 0) + 1);
    ranks.set(c.rank, (ranks.get(c.rank) ?? 0) + 1);
  }

  const maxSuit = Math.max(...suits.values());
  const maxRankCount = Math.max(...ranks.values());
  const sortedRanks = [...visible].map((c) => c.rank).sort((a, b) => b - a);
  const topRank = sortedRanks[0];
  const isConnected = sortedRanks.length >= 3 && sortedRanks[0] - sortedRanks[2] <= 4;

  const tags: string[] = [];
  let wetness = 0.25;

  if (maxRankCount >= 2) {
    tags.push('公对结构');
    wetness -= 0.08;
  }
  if (maxSuit >= 3) {
    tags.push(maxSuit >= 4 ? '四同花危险面' : '三同花成花面');
    wetness += 0.38;
  } else if (maxSuit === 2) {
    tags.push('两张同花听牌面');
    wetness += 0.16;
  } else {
    tags.push('彩虹干燥面');
    wetness -= 0.1;
  }

  if (isConnected) {
    tags.push('连张动态结构');
    wetness += 0.24;
  } else if (topRank >= 13) {
    tags.push(`${rankToChar(topRank)} 高静态牌面`);
  } else {
    tags.push(`${rankToChar(topRank)} 高中低结构`);
  }

  const highCardAdvantage =
    topRank >= 13 && !isConnected ? 0.55 : topRank <= 9 && isConnected ? -0.35 : 0.15;

  return {
    label: tags.join(' · '),
    wetness: clamp(wetness, 0.1, 0.95),
    highCardAdvantage,
  };
}

export function computeRangeGeometry(
  report: HandReviewReport,
  decision: HandReviewHeroDecision
): RangeGeometryMetrics {
  const street =
    decision.street === 'flop' ||
    decision.street === 'turn' ||
    decision.street === 'river'
      ? decision.street
      : 'preflop';

  const texture = describeBoardTexture(report.communityCards, street);
  const pos = report.heroPosition.toUpperCase();
  const isLatePos = pos === 'BTN' || pos === 'CO' || pos === 'SB';
  const equityHint = decision.evidence.estimatedEquityPct ?? 52;

  const rangeAdvantagePct = round1(
    clamp(
      (isLatePos ? 3.2 : -1.5) +
        texture.highCardAdvantage * 8.5 +
        (equityHint - 50) * 0.12,
      -12,
      14
    )
  );

  const nutAdvantagePct = round1(
    clamp(
      rangeAdvantagePct * 1.15 + (texture.wetness < 0.45 ? 2.4 : -1.8),
      -14,
      16
    )
  );

  const spr = round1(Math.max(0.2, decision.evidence.spr || 4.0));
  const sprZoneLabel =
    spr <= 2.2
      ? '低 SPR 套池承诺区'
      : spr <= 5.5
        ? '中深度几何下注区'
        : '深筹码多街操作区';

  const potBefore = Math.max(1, decision.evidence.potBefore);
  const toCall = Math.max(0, decision.evidence.toCall);
  const mdfPct =
    toCall > 0
      ? Math.round(decision.evidence.mdfPct)
      : 100;
  const bluffAlphaPct =
    toCall > 0
      ? Math.round((toCall / (potBefore + toCall)) * 100)
      : Math.round((0.5 / 1.5) * 100); // Reference 50% pot bet alpha = 33%

  const streetsRemaining =
    street === 'preflop' ? 3 : street === 'flop' ? 3 : street === 'turn' ? 2 : 1;
  const geometricSizing = computeGeometricBetSizing(spr, streetsRemaining);

  let recommendedStructure: string;
  if (street === 'preflop') {
    recommendedStructure = isLatePos
      ? '后位拥有绝对位置与范围优势，建议以线性加注为主轴，减少无位置平跟。'
      : '前中位范围需保持紧凑与可玩性，优先用高牌力与带阻断同花手牌构建加注范围。';
  } else if (rangeAdvantagePct >= 4 && nutAdvantagePct >= 4) {
    recommendedStructure =
      'Hero 同时握有范围与坚果优势，适合采用 33% 池高频持续下注（或转/河极化大注）持续挤压对手中弱对子。';
  } else if (nutAdvantagePct >= 4 && rangeAdvantagePct < 4) {
    recommendedStructure =
      '整体范围均衡但 Hero 具备坚果优势，建议采用极化策略：顶层强牌与优质听牌走大尺度，中等牌力以过牌控池为主。';
  } else if (rangeAdvantagePct <= -2) {
    recommendedStructure =
      '牌面结构更偏向对手防守范围，建议提高整体过牌保护频率，仅保留高阻断半诈唬与强价值组合主动出击。';
  } else {
    recommendedStructure =
      '双方范围较为接近，建议结合几何下注尺度与手牌阻断属性平衡下注/过牌频率，避免被对手频繁过牌加注剥削。';
  }

  return {
    rangeAdvantagePct,
    nutAdvantagePct,
    spr,
    sprZoneLabel,
    mdfPct,
    bluffAlphaPct,
    geometricSizing,
    boardTextureLabel: texture.label,
    recommendedStructure,
  };
}

// ============================================================================
// 13x13 Canonical Matrix Generator (GTO Equilibrium + Node-Lock Diff)
// ============================================================================

/**
 * Deterministic intrinsic hand strength score in [0, 1] for any (row, col) in 13x13 grid.
 * row 0 = A .. row 12 = 2.
 */
function intrinsicCellStrength(row: number, col: number): number {
  const high = Math.min(row, col); // 0=A (strongest), 12=2
  const low = Math.max(row, col);
  const isPair = row === col;
  const isSuited = row < col;

  if (isPair) {
    // AA=1.0, KK=0.96, ..., 22=0.52
    return clamp(1.0 - high * 0.04, 0.5, 1.0);
  }
  const highScore = (12 - high) / 12; // 0..1
  const lowScore = (12 - low) / 12; // 0..1
  const gap = low - high;
  const connectedness = gap <= 1 ? 0.11 : gap === 2 ? 0.06 : gap === 3 ? 0.02 : 0;
  const suitedBonus = isSuited ? 0.11 : 0;

  return clamp(0.14 + highScore * 0.44 + lowScore * 0.24 + connectedness + suitedBonus, 0.05, 0.94);
}

/**
 * Compute how many surviving concrete combos a 169-cell has given visible board cards.
 */
function survivingCombosForCell(
  row: number,
  col: number,
  visibleBoard: Card[]
): number {
  const r1 = (14 - row) as Rank;
  const r2 = (14 - col) as Rank;
  const countRankOnBoard = (r: Rank) => visibleBoard.filter((c) => c.rank === r).length;

  if (row === col) {
    const remaining = Math.max(0, 4 - countRankOnBoard(r1));
    return (remaining * (remaining - 1)) / 2;
  }

  const highRank = Math.max(r1, r2) as Rank;
  const lowRank = Math.min(r1, r2) as Rank;
  const isSuited = row < col;

  if (isSuited) {
    const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
    let count = 0;
    for (const s of suits) {
      const blocked = visibleBoard.some(
        (c) => (c.rank === highRank && c.suit === s) || (c.rank === lowRank && c.suit === s)
      );
      if (!blocked) count += 1;
    }
    return count;
  }

  // Offsuit
  const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  let count = 0;
  for (const s1 of suits) {
    if (visibleBoard.some((c) => c.rank === highRank && c.suit === s1)) continue;
    for (const s2 of suits) {
      if (s1 === s2) continue;
      if (visibleBoard.some((c) => c.rank === lowRank && c.suit === s2)) continue;
      count += 1;
    }
  }
  return count;
}

export interface BuildMatrixParams {
  street: 'preflop' | 'flop' | 'turn' | 'river';
  heroPosition: string;
  heroCanonicalHand: string | null;
  facingBet: boolean;
  potBB: number;
  potOddsPct: number;
  rangeAdvantagePct: number;
  visibleBoard: Card[];
  nodeLockShift?: {
    presetId: NodeLockPresetId;
    confidenceWeight: number; // 0..1
    deviationIntensity: number; // 0..1
  };
}

export function buildCanonical169Matrix(params: BuildMatrixParams): RangeMatrixCell[] {
  const {
    street,
    heroPosition,
    heroCanonicalHand,
    facingBet,
    potBB,
    potOddsPct,
    rangeAdvantagePct,
    visibleBoard,
    nodeLockShift,
  } = params;

  const pos = heroPosition.toUpperCase();
  const posLooseness =
    pos === 'BTN'
      ? 0.14
      : pos === 'CO' || pos === 'SB'
        ? 0.08
        : pos === 'BB'
          ? 0.12
          : -0.04;

  const boardRankSet = new Set<Rank>(visibleBoard.map((c) => c.rank));
  const cells: RangeMatrixCell[] = [];

  for (let row = 0; row < 13; row += 1) {
    for (let col = 0; col < 13; col += 1) {
      const { hand, kind } = getCanonicalHandLabel(row, col);
      const baseStrength = intrinsicCellStrength(row, col);
      const rHigh = (14 - Math.min(row, col)) as Rank;
      const rLow = (14 - Math.max(row, col)) as Rank;

      // Postflop interaction with board ranks boosts top/second pair & set regions
      let boardHitBoost = 0;
      if (street !== 'preflop' && visibleBoard.length > 0) {
        const hitHigh = boardRankSet.has(rHigh);
        const hitLow = boardRankSet.has(rLow);
        if (kind === 'pair' && hitHigh) boardHitBoost = 0.28; // Set
        else if (hitHigh && hitLow) boardHitBoost = 0.24; // Two pair
        else if (hitHigh) boardHitBoost = 0.16; // Pair with high card
        else if (hitLow) boardHitBoost = 0.09; // Pair with low card
      }

      const effectiveStrength = clamp(
        baseStrength + boardHitBoost + posLooseness * 0.55 + rangeAdvantagePct * 0.004,
        0.04,
        0.99
      );

      // Reach probability in Hero's range (higher for playable hands)
      const inRangePct =
        street === 'preflop'
          ? 100
          : Math.round(clamp((baseStrength + posLooseness - 0.18) * 145, 8, 100));

      // Compute GTO equilibrium baseline mix
      let rawMix: RangeMatrixMix;
      if (facingBet) {
        const callThreshold = clamp(0.32 + (potOddsPct - 20) * 0.004, 0.25, 0.62);
        if (effectiveStrength >= 0.78) {
          // Strong value raises / traps
          const raisePct = clamp(55 + (effectiveStrength - 0.78) * 170, 50, 92);
          rawMix = { raise: raisePct, call: 100 - raisePct, check: 0, fold: 0 };
        } else if (effectiveStrength >= callThreshold) {
          // Medium value + strong draws: mostly call with some mixed raise
          const bluffRaise = kind === 'suited' && row <= 3 && col >= 7 ? 24 : 8;
          const callPct = clamp(64 + (effectiveStrength - callThreshold) * 60, 48, 86);
          const foldPct = Math.max(0, 100 - callPct - bluffRaise);
          rawMix = { raise: bluffRaise, call: callPct, check: 0, fold: foldPct };
        } else {
          // Marginal/weak hands: mostly fold + small blocker bluff-raise frequency
          const isBlockerBluff = (row === 0 || row === 1) && kind === 'suited';
          const bluffRaise = isBlockerBluff ? 20 : 0;
          const marginalCall = effectiveStrength > callThreshold - 0.1 ? 18 : 0;
          rawMix = {
            raise: bluffRaise,
            call: marginalCall,
            check: 0,
            fold: Math.max(0, 100 - bluffRaise - marginalCall),
          };
        }
      } else if (street === 'preflop') {
        // Unopened / RFI preflop mix
        if (effectiveStrength >= 0.64) {
          rawMix = { raise: 94, call: 6, check: 0, fold: 0 };
        } else if (effectiveStrength >= 0.44) {
          const raisePct = clamp(25 + (effectiveStrength - 0.44) * 320, 15, 88);
          const callPct = pos === 'SB' || pos === 'BTN' ? 10 : 0;
          rawMix = {
            raise: raisePct,
            call: callPct,
            check: 0,
            fold: Math.max(0, 100 - raisePct - callPct),
          };
        } else {
          rawMix = { raise: 0, call: 0, check: 0, fold: 100 };
        }
      } else {
        // Postflop checked-to Hero (Bet vs Check)
        const cbetBias = clamp(rangeAdvantagePct * 1.8, -14, 18);
        if (effectiveStrength >= 0.74) {
          const betPct = clamp(68 + cbetBias, 45, 94);
          rawMix = { raise: betPct, call: 0, check: 100 - betPct, fold: 0 };
        } else if (effectiveStrength >= 0.5) {
          const betPct = clamp(32 + cbetBias, 15, 62);
          rawMix = { raise: betPct, call: 0, check: 100 - betPct, fold: 0 };
        } else {
          // Polarized bluffs: suited connectors / Ax suited blockers bet more than offsuit trash
          const semiBluff = kind === 'suited' && (row <= 1 || Math.abs(row - col) <= 2) ? 44 : 14;
          const betPct = clamp(semiBluff + cbetBias * 0.6, 4, 64);
          rawMix = { raise: betPct, call: 0, check: 100 - betPct, fold: 0 };
        }
      }

      const gtoMix = normalizeMixTo100(rawMix);
      const baseEvBB = round2(
        (effectiveStrength - 0.46) * Math.max(2.4, potBB * 0.75) +
          (kind === 'suited' ? 0.14 : 0)
      );

      let finalMix = gtoMix;
      let deltaRaisePct: number | undefined;
      let deltaCallPct: number | undefined;
      let evGainBB: number | undefined;

      if (nodeLockShift) {
        const scale = clamp(
          nodeLockShift.confidenceWeight * nodeLockShift.deviationIntensity,
          0,
          1
        );
        const shifted: RangeMatrixMix = { ...gtoMix };

        if (nodeLockShift.presetId === 'over_fold') {
          // Expand aggressive bets/raises across medium & blocker-bluff regions
          const isBluffCandidate = effectiveStrength < 0.66 && (kind === 'suited' || row <= 2);
          const boost = isBluffCandidate ? 34 * scale : 16 * scale;
          shifted.raise += boost;
          if (facingBet) {
            shifted.fold = Math.max(0, shifted.fold - boost * 0.75);
            shifted.call = Math.max(0, shifted.call - boost * 0.25);
          } else if (street === 'preflop') {
            shifted.fold = Math.max(0, shifted.fold - boost);
          } else {
            shifted.check = Math.max(0, shifted.check - boost);
          }
          evGainBB = round2(
            Math.max(0.04, (isBluffCandidate ? 0.42 : 0.22) * scale * Math.max(1, potBB * 0.18))
          );
        } else if (nodeLockShift.presetId === 'calling_station') {
          // Cut pure bluffs, size up & increase frequency on medium-strong value
          if (effectiveStrength >= 0.56) {
            const valueBoost = 28 * scale;
            shifted.raise += valueBoost;
            shifted.check = Math.max(0, shifted.check - valueBoost);
            shifted.call = Math.max(0, shifted.call - valueBoost * 0.5);
            evGainBB = round2(0.38 * scale * Math.max(1, potBB * 0.2));
          } else {
            const bluffCut = Math.min(shifted.raise, 32 * scale);
            shifted.raise = Math.max(0, shifted.raise - bluffCut);
            if (facingBet) shifted.fold += bluffCut;
            else shifted.check += bluffCut;
            evGainBB = round2(0.24 * scale * Math.max(1, potBB * 0.16));
          }
        } else if (nodeLockShift.presetId === 'over_bluff') {
          // Defend much wider (call down / bluff-catch), trap top value
          if (facingBet) {
            const callBoost = effectiveStrength >= 0.42 ? 28 * scale : 10 * scale;
            shifted.call += callBoost;
            shifted.fold = Math.max(0, shifted.fold - callBoost);
            if (effectiveStrength >= 0.8) {
              const trapShift = 18 * scale;
              shifted.raise = Math.max(0, shifted.raise - trapShift);
              shifted.call += trapShift;
            }
          } else {
            // Induce bluffs by checking more medium-strong hands
            const checkInduce = effectiveStrength >= 0.55 ? 24 * scale : 10 * scale;
            shifted.check += checkInduce;
            shifted.raise = Math.max(0, shifted.raise - checkInduce);
          }
          evGainBB = round2(0.32 * scale * Math.max(1, potBB * 0.18));
        } else {
          // passive_limper: linear isolation value raises, fewer passive calls
          if (effectiveStrength >= 0.52) {
            const isoBoost = 30 * scale;
            shifted.raise += isoBoost;
            shifted.call = Math.max(0, shifted.call - isoBoost * 0.6);
            shifted.check = Math.max(0, shifted.check - isoBoost * 0.4);
            shifted.fold = Math.max(0, shifted.fold - isoBoost * 0.5);
          }
          evGainBB = round2(0.28 * scale * Math.max(1, potBB * 0.17));
        }

        finalMix = normalizeMixTo100(shifted);
        deltaRaisePct = finalMix.raise - gtoMix.raise;
        deltaCallPct = finalMix.call - gtoMix.call;
      }

      const combos = round1(
        survivingCombosForCell(row, col, visibleBoard) * (inRangePct / 100)
      );

      cells.push({
        hand,
        row,
        col,
        kind,
        inRangePct,
        combos,
        mix: finalMix,
        evBB: evGainBB ? round2(baseEvBB + evGainBB) : baseEvBB,
        isHeroHand: heroCanonicalHand === hand,
        deltaRaisePct,
        deltaCallPct,
        evGainBB,
      });
    }
  }

  return cells;
}

// ============================================================================
// Opponent Read Auto-Mapping & Full Workbench Builder
// ============================================================================

export function inferRecommendedNodeLockPreset(
  sessionProfileContext?: HandReviewSessionContext
): {
  presetId: NodeLockPresetId;
  targetOpponent: HandReviewSessionOpponentRead | null;
  observedDeviationPct: number;
  sampleHands: number;
} {
  const reads = sessionProfileContext?.opponentReads ?? [];
  if (reads.length === 0) {
    return {
      presetId: 'over_fold',
      targetOpponent: null,
      observedDeviationPct: NODE_LOCK_PRESETS.over_fold.defaultDeviationPct,
      sampleHands: 14,
    };
  }

  // Pick opponent with highest observed hands
  const topOpp = [...reads].sort((a, b) => b.handsObserved - a.handsObserved)[0];

  if (topOpp.foldToBetPct >= 56) {
    return {
      presetId: 'over_fold',
      targetOpponent: topOpp,
      observedDeviationPct: Math.round(clamp(topOpp.foldToBetPct - 42, 8, 38)),
      sampleHands: Math.max(4, topOpp.handsObserved),
    };
  }
  if (topOpp.foldToBetPct <= 34 && topOpp.vpipPct >= 38) {
    return {
      presetId: 'calling_station',
      targetOpponent: topOpp,
      observedDeviationPct: Math.round(clamp(46 - topOpp.foldToBetPct + 12, 10, 38)),
      sampleHands: Math.max(4, topOpp.handsObserved),
    };
  }
  if (topOpp.aggressionFactor >= 2.8) {
    return {
      presetId: 'over_bluff',
      targetOpponent: topOpp,
      observedDeviationPct: Math.round(clamp((topOpp.aggressionFactor - 1.8) * 14, 10, 36)),
      sampleHands: Math.max(4, topOpp.handsObserved),
    };
  }
  if (topOpp.vpipPct >= 40 && topOpp.vpipPct - topOpp.pfrPct >= 18) {
    return {
      presetId: 'passive_limper',
      targetOpponent: topOpp,
      observedDeviationPct: Math.round(clamp(topOpp.vpipPct - topOpp.pfrPct, 12, 36)),
      sampleHands: Math.max(4, topOpp.handsObserved),
    };
  }

  return {
    presetId: 'over_fold',
    targetOpponent: topOpp,
    observedDeviationPct: 18,
    sampleHands: Math.max(4, topOpp.handsObserved),
  };
}

function estimateEvLossFromVerdict(
  verdict: DecisionVerdict,
  potBB: number,
  actualAction: GtoActionKey,
  recommendedAction: GtoActionKey
): number {
  if (actualAction === recommendedAction && verdict === 'optimal') return 0;
  const safePot = Math.max(1.5, potBB);
  switch (verdict) {
    case 'optimal':
      return round2(safePot * 0.003);
    case 'acceptable':
      return round2(safePot * 0.015);
    case 'inaccuracy':
      return round2(safePot * 0.042);
    case 'mistake':
      return round2(safePot * 0.135);
    default:
      return round2(safePot * 0.03);
  }
}

export interface BuildGtoWorkbenchParams {
  report: HandReviewReport;
  decision: HandReviewHeroDecision;
  sessionProfileContext?: HandReviewSessionContext;
  nodeLockPreset?: NodeLockPresetId;
  observedDeviationPct?: number;
  sampleHands?: number;
  targetPlayerName?: string;
  priorKappa?: number;
  /**
   * When Claude's backend `/api/gto/spot-analysis` or `/api/gto/node-lock` returns live solver data,
   * pass it here to bypass client heuristic fallback seamlessly.
   */
  backendOverride?: GtoSpotWorkbenchData | null;
}

export function buildGtoSpotWorkbench(params: BuildGtoWorkbenchParams): GtoSpotWorkbenchData {
  if (params.backendOverride) {
    return params.backendOverride;
  }

  const { report, decision, sessionProfileContext } = params;
  const street: 'preflop' | 'flop' | 'turn' | 'river' =
    decision.street === 'flop' ||
    decision.street === 'turn' ||
    decision.street === 'river'
      ? decision.street
      : 'preflop';

  const bigBlind = Math.max(1, report.bigBlind || 20);
  const potBeforeChips = Math.max(bigBlind, decision.evidence.potBefore || report.pot || bigBlind);
  const potBB = round2(potBeforeChips / bigBlind);
  const facingBet = decision.evidence.toCall > 0;

  const actualAction = normalizeActionKey(decision.actualActionType || decision.actualActionLabel);
  const recommendedAction = decision.recommendedAction;

  const visibleBoard =
    street === 'preflop'
      ? []
      : street === 'flop'
        ? report.communityCards.slice(0, 3)
        : street === 'turn'
          ? report.communityCards.slice(0, 4)
          : report.communityCards.slice(0, 5);

  const geometry = computeRangeGeometry(report, decision);
  const blockers = analyzeHeroBlockers(report.heroHoleCards, report.communityCards, street);

  const gtoMatrix = buildCanonical169Matrix({
    street,
    heroPosition: report.heroPosition,
    heroCanonicalHand: report.canonicalHand,
    facingBet,
    potBB,
    potOddsPct: decision.evidence.potOddsPct,
    rangeAdvantagePct: geometry.rangeAdvantagePct,
    visibleBoard,
  });

  // Extract Hero cell mix (or fallback to preflopMix / synthesized mix)
  const heroCell = report.canonicalHand
    ? gtoMatrix.find((c) => c.hand === report.canonicalHand) ?? null
    : null;

  const baseMix: RangeMatrixMix = decision.evidence.preflopMix && street === 'preflop'
    ? normalizeMixTo100({
        raise: decision.evidence.preflopMix.raise,
        call: decision.evidence.preflopMix.call,
        check: 0,
        fold: decision.evidence.preflopMix.fold,
      })
    : heroCell
      ? heroCell.mix
      : normalizeMixTo100({
          raise: recommendedAction === 'raise' ? 68 : 22,
          call: facingBet ? (recommendedAction === 'call' ? 62 : 24) : 0,
          check: !facingBet ? (recommendedAction === 'check' ? 64 : 32) : 0,
          fold: facingBet ? (recommendedAction === 'fold' ? 72 : 14) : 0,
        });

  const evLossBB = estimateEvLossFromVerdict(
    decision.verdict,
    potBB,
    actualAction,
    recommendedAction
  );
  const evGradeInfo = classifyEvLossGrade(evLossBB, potBB);

  const bestActionEvBB = heroCell
    ? round2(Math.max(0.15, heroCell.evBB))
    : round2(potBB * 0.36);
  const heroActionEvBB = round2(bestActionEvBB - evLossBB);

  // Build legal action options table
  const legalKeys: GtoActionKey[] = facingBet
    ? ['raise', 'call', 'fold']
    : street === 'preflop'
      ? ['raise', 'call', 'fold']
      : ['raise', 'check'];

  const actionOptions: GtoActionOption[] = legalKeys.map((key) => {
    const isRec = key === recommendedAction;
    const isHero = key === actualAction;
    const freq = baseMix[key];
    const ev = isRec
      ? bestActionEvBB
      : isHero
        ? heroActionEvBB
        : round2(bestActionEvBB - Math.max(0.12, (100 - freq) * 0.008 * Math.max(1, potBB * 0.3)));
    const sizePctPot =
      key === 'raise' && street !== 'preflop'
        ? Math.min(125, Math.max(33, Math.round(geometry.geometricSizing.betPotPct * 0.65)))
        : undefined;
    const label =
      key === 'raise'
        ? street === 'preflop'
          ? '加注 / 3-Bet'
          : facingBet
            ? '加注施压'
            : `下注 ${sizePctPot}% 池`
        : ACTION_LABELS_ZH[key];

    return {
      key,
      label,
      sizePctPot,
      gtoFreqPct: freq,
      evBB: ev,
      isRecommended: isRec,
      isHeroAction: isHero,
    };
  });

  // Build Bayesian Node-Lock Exploit Comparison
  const inferred = inferRecommendedNodeLockPreset(sessionProfileContext);
  const presetId = params.nodeLockPreset ?? inferred.presetId;
  const presetDef = NODE_LOCK_PRESETS[presetId];
  const sampleHands = Math.max(1, params.sampleHands ?? inferred.sampleHands);
  const priorKappa = Math.max(4, params.priorKappa ?? 16);
  const deviationPct = clamp(
    params.observedDeviationPct ??
      (presetId === inferred.presetId
        ? inferred.observedDeviationPct
        : presetDef.defaultDeviationPct),
    4,
    45
  );
  const observedPct = Math.round(clamp(presetDef.gtoBaselinePct + deviationPct, 5, 95));
  const bayesian = computeBayesianPosterior(
    presetDef.gtoBaselinePct,
    observedPct,
    sampleHands,
    priorKappa
  );

  const deviationIntensity = clamp(deviationPct / 30, 0.25, 1.0);
  const exploitMatrix = buildCanonical169Matrix({
    street,
    heroPosition: report.heroPosition,
    heroCanonicalHand: report.canonicalHand,
    facingBet,
    potBB,
    potOddsPct: decision.evidence.potOddsPct,
    rangeAdvantagePct: geometry.rangeAdvantagePct,
    visibleBoard,
    nodeLockShift: {
      presetId,
      confidenceWeight: bayesian.confidenceWeight,
      deviationIntensity,
    },
  });

  const heroExploitCell = report.canonicalHand
    ? exploitMatrix.find((c) => c.hand === report.canonicalHand) ?? null
    : null;

  // Aggregate average exploit frequency shift across playable in-range hands (or Hero's cell)
  const exploitMixForNode: RangeMatrixMix = heroExploitCell
    ? heroExploitCell.mix
    : (() => {
        const playable = exploitMatrix.filter((c) => c.inRangePct >= 40);
        const denom = Math.max(1, playable.length);
        return normalizeMixTo100({
          raise: playable.reduce((s, c) => s + c.mix.raise, 0) / denom,
          call: playable.reduce((s, c) => s + c.mix.call, 0) / denom,
          check: playable.reduce((s, c) => s + c.mix.check, 0) / denom,
          fold: playable.reduce((s, c) => s + c.mix.fold, 0) / denom,
        });
      })();

  const actionDiffs: NodeLockActionDiff[] = legalKeys.map((key) => {
    const gtoFreqPct = baseMix[key];
    const exploitFreqPct = exploitMixForNode[key];
    return {
      key,
      label: ACTION_LABELS_ZH[key],
      gtoFreqPct,
      exploitFreqPct,
      deltaPct: exploitFreqPct - gtoFreqPct,
    };
  });

  const evGainBB = round2(
    Math.max(
      0.06,
      (heroExploitCell?.evGainBB ?? 0.32) * (0.7 + bayesian.confidenceWeight * 0.65)
    )
  );
  const evGainPctPot = round1((evGainBB / Math.max(1, potBB)) * 100);

  const targetPlayerName =
    params.targetPlayerName ?? inferred.targetOpponent?.playerName ?? '桌面标准对手';

  const counterSummaries: Record<NodeLockPresetId, string> = {
    over_fold: `锁定「${targetPlayerName}」面对下注后验弃牌率 ${bayesian.posteriorPct}%（高于盈亏平衡点 α=${geometry.bluffAlphaPct}%），Node-Lock 建议扩张带 A/K 或同花阻断牌的偷鸡与持续施压频率。`,
    calling_station: `锁定「${targetPlayerName}」后验跟注率 ${bayesian.posteriorPct}%，纯空气偷鸡失去弃牌率收益；Node-Lock 收缩低胜率诈唬，并将中等成牌推入薄价值下注线。`,
    over_bluff: `锁定「${targetPlayerName}」后验激进偷鸡率 ${bayesian.posteriorPct}%，Node-Lock 收紧弃牌阈值、扩大抓鸡跟注区间，并对顶级强牌增加过牌诱敌频率。`,
    passive_limper: `锁定「${targetPlayerName}」被动平跟倾向 ${bayesian.posteriorPct}%，其范围缺乏顶层强牌（Capped Range）；Node-Lock 建议以线性价值范围加大隔离加注尺度。`,
  };

  const marginOfSafetyWarning =
    sampleHands < 15
      ? `当前样本仅 ${sampleHands} 手，贝叶斯 Dirichlet 先验收缩（κ=${priorKappa}）自动将剥削置信度压制在 ${Math.round(
          bayesian.confidenceWeight * 100
        )}%，保留 ${bayesian.shrinkagePct}% GTO 均衡基准以防止小样本误判被反剥削。`
      : `样本量达 ${sampleHands} 手（置信度 ${Math.round(
          bayesian.confidenceWeight * 100
        )}%），已满足稳健剥削条件；仍建议保留 ${bayesian.shrinkagePct}% 混合均衡以维持安全边际（Margin of Safety）。`;

  const boardKey =
    visibleBoard.length > 0
      ? visibleBoard.map((c) => `${rankToChar(c.rank)}${c.suit[0]}`).join('')
      : 'PREFLOP';

  return {
    source: street === 'preflop' ? 'blueprint' : 'heuristic',
    solverMeta: {
      engineLabel:
        street === 'preflop'
          ? 'Preflop Blueprint · 待接入 TexasSolver'
          : '客户端实时博弈引擎 · 已就绪接入 TexasSolver',
      exploitabilityPctPot: null,
      iterations: null,
      solveTimeMs: 4,
      cacheHit: false,
      canonicalBoardKey: boardKey,
    },
    handNumber: report.handNumber,
    decisionStep: decision.step,
    street,
    streetLabel: STREET_LABEL_ZH[street],
    heroPosition: report.heroPosition,
    heroCanonicalHand: report.canonicalHand,
    heroActualAction: actualAction,
    heroActualLabel: decision.actualActionLabel,
    recommendedAction,
    recommendedLabel: decision.recommendedLabel,
    evLossBB,
    evLossPctPot: evGradeInfo.pctOfPot,
    evGrade: evGradeInfo.grade,
    evGradeLabel: evGradeInfo.label,
    heroActionEvBB,
    bestActionEvBB,
    actionOptions,
    geometry,
    blockers,
    gtoMatrix,
    exploit: {
      presetId,
      presetLabel: presetDef.label,
      targetPlayerName,
      bayesianRead: {
        metricLabel: presetDef.metricLabel,
        gtoBaselinePct: presetDef.gtoBaselinePct,
        observedPct,
        posteriorPct: bayesian.posteriorPct,
        sampleHands,
        priorKappa,
        confidenceWeight: bayesian.confidenceWeight,
        shrinkageNote: `Dirichlet 先验 κ=${priorKappa}：原始观测 ${observedPct}% 收缩至后验 ${bayesian.posteriorPct}%`,
      },
      evGainBB,
      evGainPctPot,
      actionDiffs,
      counterStrategySummary: counterSummaries[presetId],
      marginOfSafetyWarning,
      exploitMatrix,
    },
  };
}

/**
 * Helper: collect all Hero decisions across streets of a HandReviewReport in chronological order.
 */
export function collectReportHeroDecisions(
  report: HandReviewReport
): Array<{ streetLabel: string; decision: HandReviewHeroDecision }> {
  const list: Array<{ streetLabel: string; decision: HandReviewHeroDecision }> = [];
  for (const st of report.streets) {
    for (const dec of st.heroDecisions) {
      list.push({ streetLabel: st.streetLabel, decision: dec });
    }
  }
  return list;
}

/**
 * Fallback decision node when a hand ended before recording an explicit heroDecision
 * (e.g., quick preflop fold or walk), ensuring the 13x13 GTO Matrix & Node-Lock Lab stay interactive.
 */
export function createFallbackPreflopDecision(
  report: HandReviewReport
): { streetLabel: string; decision: HandReviewHeroDecision } {
  const bb = Math.max(1, report.bigBlind || 20);
  const potBefore = Math.max(bb * 1.5, report.pot || bb * 1.5);
  const isFold = report.outcome === 'loss';

  return {
    streetLabel: '翻前基准',
    decision: {
      step: 0,
      street: 'preflop',
      actualActionType: isFold ? 'fold' : 'check',
      actualActionLabel: isFold ? '翻前弃牌' : '盲注收池',
      recommendedAction: isFold ? 'fold' : 'raise',
      recommendedLabel: isFold ? '弃牌' : '标准开池加注',
      verdict: 'optimal',
      verdictLabel: '基准对照',
      evidence: {
        potBefore,
        toCall: isFold ? bb : 0,
        potOddsPct: isFold ? Math.round((bb / (potBefore + bb)) * 100) : 0,
        mdfPct: isFold ? Math.round((potBefore / (potBefore + bb)) * 100) : 100,
        estimatedEquityPct: null,
        preflopMix: null,
        betToPotPct: null,
        spr: 10,
      },
      analysis: `基于 ${report.heroPosition} 位标准翻前范围构建基准矩阵。`,
      suggestion: '可点击任意 13×13 手牌格检查翻前开池/防守频率，或切换至 Node-Lock 推演对手漏损。',
    },
  };
}

/**
 * Helper: build a typed backend API request payload from an existing HandReviewReport & decision.
 * Ready for Claude's `/api/gto/spot-analysis` and `/api/gto/node-lock` endpoints.
 */
export function buildSpotAnalysisRequestPayload(
  report: HandReviewReport,
  decision: HandReviewHeroDecision,
  roomId?: string
): GtoSpotAnalysisRequest {
  const street: 'preflop' | 'flop' | 'turn' | 'river' =
    decision.street === 'flop' ||
    decision.street === 'turn' ||
    decision.street === 'river'
      ? decision.street
      : 'preflop';

  const potBefore = Math.max(report.bigBlind || 20, decision.evidence.potBefore || report.pot);
  const spr = Math.max(0.5, decision.evidence.spr || 4);

  return {
    roomId,
    handNumber: report.handNumber,
    decisionStep: decision.step,
    street,
    heroPosition: report.heroPosition,
    heroHoleCards: report.heroHoleCards ?? [],
    communityCards: report.communityCards,
    potBeforeChips: potBefore,
    toCallChips: decision.evidence.toCall,
    effectiveStackChips: Math.round(potBefore * spr),
    bigBlind: report.bigBlind || 20,
    heroActualAction: normalizeActionKey(decision.actualActionType || decision.actualActionLabel),
    heroActualLabel: decision.actualActionLabel,
    allowAsyncSolver: true,
  };
}
