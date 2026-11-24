import { evaluateBestHand } from '../src/shared/handEvaluator';
import { getAvailableActions } from '../src/shared/pokerEngine';
import type { Card, PlayerAction, TableState } from '../src/shared/types';
import {
  analyzeBoardTexture,
  computeGeometricBetFraction,
  computeMdf,
  computeOptimalBluffRatio,
  estimatePostflopEquity,
  evaluateBlockers,
  getGtoPreflopMix,
  toCanonicalHandKey,
  type GtoPosition,
} from './gtoRanges';
import {
  NEUTRAL_EXPLOIT_PLAN,
  type ExploitPlan,
  type SessionOpponentProfiler,
} from './opponentProfiler';

export interface BotPersonality {
  name: 'gto_pro' | 'tag' | 'lag' | 'balanced' | 'calling_station';
  label: string;
  looseness: number;
  aggression: number;
  bluffRate: number;
  gtoDiscipline: number;
}

export const BOT_PERSONALITY_PROFILES: BotPersonality[] = [
  {
    name: 'gto_pro',
    label: 'GTO 均衡大师',
    looseness: 0.0,
    aggression: 0.03,
    bluffRate: 0.11,
    gtoDiscipline: 0.96,
  },
  {
    name: 'tag',
    label: '紧凶牌手 (TAG)',
    looseness: -0.05,
    aggression: 0.07,
    bluffRate: 0.09,
    gtoDiscipline: 0.88,
  },
  {
    name: 'lag',
    label: '松凶压迫 (LAG)',
    looseness: 0.06,
    aggression: 0.1,
    bluffRate: 0.15,
    gtoDiscipline: 0.78,
  },
  {
    name: 'balanced',
    label: '稳健均衡',
    looseness: 0.0,
    aggression: 0.02,
    bluffRate: 0.1,
    gtoDiscipline: 0.9,
  },
  {
    name: 'calling_station',
    label: '抓鸡跟注站',
    looseness: 0.08,
    aggression: -0.07,
    bluffRate: 0.04,
    gtoDiscipline: 0.68,
  },
];

const NAMED_BOT_PERSONALITIES: Record<string, BotPersonality['name']> = {
  陈默: 'gto_pro',
  林澈: 'tag',
  周屿: 'lag',
  苏砚: 'balanced',
  陆沉: 'calling_station',
  沈舟: 'gto_pro',
  顾言: 'tag',
  许嘉: 'lag',
};

export function getBotPersonality(seed: string): BotPersonality {
  const mapped = NAMED_BOT_PERSONALITIES[seed];
  if (mapped) {
    const found = BOT_PERSONALITY_PROFILES.find((p) => p.name === mapped);
    if (found) return found;
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return BOT_PERSONALITY_PROFILES[Math.abs(hash) % BOT_PERSONALITY_PROFILES.length];
}

function createSeededRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function evaluatePreflopStrength(holeCards: Card[]): number {
  if (holeCards.length < 2) return 0.2;
  const r1 = Number(holeCards[0].rank);
  const r2 = Number(holeCards[1].rank);
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const suited = holeCards[0].suit === holeCards[1].suit;
  const gap = high - low;

  const baseHighScore = (r: number): number => {
    if (r === 14) return 10;
    if (r === 13) return 8;
    if (r === 12) return 7;
    if (r === 11) return 6;
    return r / 2;
  };

  let chen = baseHighScore(high);
  if (high === low) {
    chen = Math.max(5, chen * 2);
    if (high === 5) chen += 1;
  } else {
    if (suited) chen += 2;
    if (gap === 1) {
      if (high < 12) chen += 1;
    } else if (gap === 2) {
      chen -= 1;
      if (high < 12) chen += 0.5;
    } else if (gap === 3) {
      chen -= 2;
    } else if (gap === 4) {
      chen -= 4;
    } else {
      chen -= 5;
    }
    if (high >= 13 && low >= 12) {
      chen += 3.2;
    } else if (high === 14 && low >= 10) {
      chen += 1.6;
    }
  }

  const clampedChen = Math.max(-1.5, Math.min(20, chen));
  let normalized: number;
  if (clampedChen >= 10) {
    normalized = 0.7 + ((clampedChen - 10) / 10) * 0.27;
  } else {
    normalized = 0.09 + ((clampedChen + 1.5) / 11.5) * 0.61;
  }
  return Math.max(0.08, Math.min(0.98, normalized));
}

export function countStraightDrawCompletionRanks(holeCards: Card[], board: Card[]): number {
  const all = [...holeCards, ...board];
  const existingRanks = new Set<number>(all.map((c) => Number(c.rank)));
  const holeRanks = new Set<number>(holeCards.map((c) => Number(c.rank)));

  const hasHoleStraight = (ranks: Set<number>): boolean => {
    for (let start = 1; start <= 10; start++) {
      let ok = true;
      let usesHole = false;
      for (let r = start; r < start + 5; r++) {
        const actual = r === 1 ? 14 : r;
        if (!ranks.has(actual)) {
          ok = false;
          break;
        }
        if (holeRanks.has(actual)) {
          usesHole = true;
        }
      }
      if (ok && usesHole) return true;
    }
    return false;
  };

  if (hasHoleStraight(existingRanks)) return 0;

  let completionRanks = 0;
  for (let cand = 2; cand <= 14; cand++) {
    if (existingRanks.has(cand)) continue;
    const trial = new Set<number>(existingRanks);
    trial.add(cand);
    if (hasHoleStraight(trial)) {
      completionRanks++;
    }
  }
  return completionRanks;
}

export function estimateDrawBonus(holeCards: Card[], board: Card[]): number {
  if (board.length < 3 || board.length >= 5) return 0;
  const all = [...holeCards, ...board];
  const streetsLeft = 5 - board.length;
  let bonus = 0;

  const suitCounts = new Map<string, number>();
  for (const c of all) {
    suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1);
  }
  for (const [suit, cnt] of suitCounts.entries()) {
    if (cnt === 4 && holeCards.some((h) => h.suit === suit)) {
      bonus += streetsLeft === 2 ? 0.17 : 0.1;
    }
  }

  const straightRankOuts = countStraightDrawCompletionRanks(holeCards, board);
  if (straightRankOuts >= 2) {
    bonus += streetsLeft === 2 ? 0.14 : 0.08;
  } else if (straightRankOuts === 1) {
    bonus += streetsLeft === 2 ? 0.06 : 0.035;
  }

  return Math.min(0.28, bonus);
}

export function evaluatePostflopStrength(holeCards: Card[], board: Card[]): number {
  const all = [...holeCards, ...board];
  const ev = evaluateBestHand(all);
  const boardEval = board.length >= 5 ? evaluateBestHand(board) : null;
  const boardHigh = Math.max(...board.map((c) => Number(c.rank)));
  const holeHigh = Math.max(Number(holeCards[0]?.rank ?? 2), Number(holeCards[1]?.rank ?? 2));
  const holeLow = Math.min(Number(holeCards[0]?.rank ?? 2), Number(holeCards[1]?.rank ?? 2));
  const isPocketPair = holeHigh === holeLow;

  const boardFreq = new Map<number, number>();
  for (const c of board) {
    const r = Number(c.rank);
    boardFreq.set(r, (boardFreq.get(r) ?? 0) + 1);
  }
  const boardPairCount = Array.from(boardFreq.values()).filter((v) => v >= 2).length;
  const boardHasPair = boardPairCount >= 1;
  const boardHasDoublePair = boardPairCount >= 2;
  const boardHasTrips = Array.from(boardFreq.values()).some((v) => v >= 3);

  let base = 0.2;
  switch (ev.category) {
    case 0:
      base = 0.14 + (holeHigh >= 13 ? 0.07 : 0) + (holeHigh > boardHigh ? 0.05 : 0);
      break;
    case 1: {
      const matchedHigh = board.some((c) => Number(c.rank) === holeHigh);
      const matchedLow = board.some((c) => Number(c.rank) === holeLow);
      const matchedTopBoard =
        (matchedHigh && holeHigh === boardHigh) || (matchedLow && holeLow === boardHigh);

      if (isPocketPair && holeHigh > boardHigh) {
        base = 0.74 + (holeHigh / 14) * 0.08;
      } else if (matchedTopBoard) {
        const kicker = matchedHigh && holeHigh === boardHigh ? holeLow : holeHigh;
        base = 0.62 + (kicker / 14) * 0.14;
      } else if (matchedHigh || matchedLow || isPocketPair) {
        const pairRank = isPocketPair ? holeHigh : matchedHigh ? holeHigh : holeLow;
        base = 0.42 + (pairRank / Math.max(14, boardHigh)) * 0.14;
      } else if (boardHasPair) {
        base = 0.22 + (holeHigh >= 13 ? 0.08 : 0);
      } else {
        base = 0.44;
      }
      break;
    }
    case 2: {
      const holeMatchesBoard =
        board.some((c) => Number(c.rank) === holeHigh) ||
        board.some((c) => Number(c.rank) === holeLow);
      if (boardHasDoublePair && !holeMatchesBoard && !isPocketPair) {
        base = 0.28 + (holeHigh >= 13 ? 0.08 : 0);
      } else {
        base = boardHasPair ? 0.66 : 0.8;
      }
      break;
    }
    case 3:
      base = boardHasTrips ? 0.52 : 0.86;
      break;
    case 4:
      base = 0.89;
      break;
    case 5:
      base = 0.92;
      break;
    case 6:
      base = 0.95;
      break;
    default:
      base = 0.98;
      break;
  }

  if (boardEval && ev.score === boardEval.score) {
    base = Math.min(base, 0.25);
  }

  const drawBonus = ev.category < 4 ? estimateDrawBonus(holeCards, board) : 0;
  return Math.max(0.08, Math.min(0.99, base + drawBonus));
}

/**
 * Computes true poker positional advantage on [0, 1] among active players in the hand.
 * - Postflop: exact clockwise acting order from Dealer (first left of BTN = 0.0, BTN = 1.0).
 * - Preflop: BTN is true late position (1.0) and UTG is earliest (0.0); blinds (SB/BB) are
 *   out of position on all postflop streets so they are scored in the early/OOP range (0.15 / 0.25)
 *   and never falsely receive a late-position bonus.
 */
export function computePositionRatio(state: TableState, playerSeatIndex: number): number {
  const activeSeats = state.players
    .filter((p) => p.inHand && !p.folded)
    .map((p) => p.seatIndex)
    .sort((a, b) => a - b);
  if (activeSeats.length <= 1) return 1;

  if (state.phase === 'preflop') {
    // Heads-up: Dealer/SB has postflop position over BB
    if (activeSeats.length === 2) {
      return playerSeatIndex === state.dealerSeatIndex ? 0.7 : 0.3;
    }

    // 3+ players: Blinds act out-of-position on every postflop street
    if (playerSeatIndex === state.smallBlindSeatIndex) return 0.15;
    if (playerSeatIndex === state.bigBlindSeatIndex) return 0.25;

    const anchorSeat = state.bigBlindSeatIndex ?? state.dealerSeatIndex;
    const nonBlindOrdered: number[] = [
      ...activeSeats.filter((s) => s > anchorSeat),
      ...activeSeats.filter((s) => s <= anchorSeat),
    ].filter((s) => s !== state.smallBlindSeatIndex && s !== state.bigBlindSeatIndex);

    const idx = nonBlindOrdered.indexOf(playerSeatIndex);
    if (idx === -1) return 0.5;
    if (nonBlindOrdered.length === 1) return 1;
    return idx / (nonBlindOrdered.length - 1);
  }

  // Postflop: first active seat clockwise from Dealer acts first (0.0), Dealer acts last (1.0)
  const anchorSeat = state.dealerSeatIndex;
  const ordered: number[] = [
    ...activeSeats.filter((s) => s > anchorSeat),
    ...activeSeats.filter((s) => s <= anchorSeat),
  ];
  const idx = ordered.indexOf(playerSeatIndex);
  if (idx === -1) return 0.5;
  return idx / Math.max(1, ordered.length - 1);
}

export function resolveGtoPosition(state: TableState, playerSeatIndex: number): GtoPosition {
  if (state.bigBlindSeatIndex !== null && playerSeatIndex === state.bigBlindSeatIndex) {
    return 'BB';
  }
  if (state.smallBlindSeatIndex !== null && playerSeatIndex === state.smallBlindSeatIndex) {
    return 'SB';
  }
  if (playerSeatIndex === state.dealerSeatIndex) {
    return 'BTN';
  }

  const inHandSeats = state.players
    .filter((p) => p.inHand)
    .map((p) => p.seatIndex)
    .sort((a, b) => a - b);
  const nonBlindSeats = inHandSeats.filter(
    (s) => s !== state.smallBlindSeatIndex && s !== state.bigBlindSeatIndex
  );
  if (nonBlindSeats.length <= 1) return 'BTN';

  const anchor = state.bigBlindSeatIndex ?? state.dealerSeatIndex;
  const clockwise = [
    ...nonBlindSeats.filter((s) => s > anchor),
    ...nonBlindSeats.filter((s) => s <= anchor),
  ];
  const distFromBtn = clockwise.length - 1 - clockwise.indexOf(playerSeatIndex);
  if (distFromBtn <= 0) return 'BTN';
  if (distFromBtn === 1) return 'CO';
  if (distFromBtn === 2) return 'HJ';
  return 'UTG';
}

function countStreetRaises(state: TableState): number {
  return state.currentPotTimeline.filter(
    (pt) =>
      pt.street === state.phase &&
      (pt.actionType === 'raise' || pt.actionType === 'bet' || pt.actionType === 'allin')
  ).length;
}

function wasPreflopAggressor(state: TableState, playerId: string): boolean {
  let lastAggressor: string | null = null;
  for (const pt of state.currentPotTimeline) {
    if (
      pt.street === 'preflop' &&
      (pt.actionType === 'raise' || pt.actionType === 'allin')
    ) {
      lastAggressor = pt.actorId;
    }
  }
  return lastAggressor === playerId;
}

function findPrimaryOpponentId(state: TableState, botId: string): string | null {
  // Prefer the most recent aggressor on the current street
  for (let i = state.currentPotTimeline.length - 1; i >= 0; i--) {
    const pt = state.currentPotTimeline[i];
    if (pt.street !== state.phase) break;
    if (
      pt.actorId !== botId &&
      (pt.actionType === 'raise' || pt.actionType === 'bet' || pt.actionType === 'allin')
    ) {
      return pt.actorId;
    }
  }
  // Otherwise prefer the last active non-folded human/opponent remaining in the hand
  const activeOpponents = state.players.filter((p) => p.inHand && !p.folded && p.id !== botId);
  const human = activeOpponents.find((p) => !p.isBot);
  return human?.id ?? activeOpponents[0]?.id ?? null;
}

function flopCheckedThrough(state: TableState): boolean {
  if (state.phase !== 'turn') return false;
  const flopEvents = state.currentPotTimeline.filter((pt) => pt.street === 'flop');
  return (
    flopEvents.length > 0 &&
    flopEvents.every((pt) => pt.actionType === 'check')
  );
}

/**
 * Estimates Hero's Range Advantage & Nut Advantage on the current board (inspired by
 * GTO Wizard / TexasSolver / Pluribus postflop structural heuristics):
 * - PFA on dry A/K/Q high boards holds strong range & nut advantage -> high-frequency small c-bet.
 * - Low connected two-tone boards (e.g., 7-6-5ss) shift nut/range advantage toward BB caller ->
 *   check more often OOP and polarize sizings.
 */
export function computeBoardRangeAdvantage(params: {
  board: Card[];
  isPfa: boolean;
  inPosition: boolean;
  texture: ReturnType<typeof analyzeBoardTexture>;
}): { rangeAdv: number; nutAdv: number } {
  const { board, isPfa, inPosition, texture } = params;
  if (board.length < 3) return { rangeAdv: 0, nutAdv: 0 };

  const ranks = board.map((c) => Number(c.rank)).sort((a, b) => b - a);
  const highCard = ranks[0] ?? 10;
  const broadwayCount = ranks.filter((r) => r >= 10).length;

  let rangeAdv = isPfa ? 0.06 : -0.05;
  let nutAdv = isPfa ? 0.07 : -0.04;

  if (highCard >= 13 && texture.wetness < 0.45) {
    // High dry board strongly favors preflop aggressor's uncapped overpairs & AK/AQ
    rangeAdv += isPfa ? 0.08 : -0.08;
    nutAdv += isPfa ? 0.09 : -0.07;
  } else if (highCard <= 9 && texture.connectedness >= 0.55) {
    // Low connected board favors BB defender's two-pair/straight/set density
    rangeAdv += isPfa ? -0.09 : 0.08;
    nutAdv += isPfa ? -0.08 : 0.09;
  }

  if (broadwayCount >= 2) {
    rangeAdv += isPfa ? 0.04 : -0.03;
  }
  if (texture.isPaired) {
    // Paired boards compress equity and reward small range bets from IP/PFA
    rangeAdv += inPosition ? 0.04 : -0.02;
  }
  if (inPosition) {
    rangeAdv += 0.03;
  }

  return {
    rangeAdv: Math.max(-0.22, Math.min(0.22, Number(rangeAdv.toFixed(3)))),
    nutAdv: Math.max(-0.22, Math.min(0.22, Number(nutAdv.toFixed(3)))),
  };
}

/**
 * Detects whether the turn card is a "scare card" (overcard A/K/Q or completing flush/straight texture)
 * that shifts range advantage toward the preflop aggressor for high-EV double-barrelling.
 */
function isTurnScareCard(board: Card[], texture: ReturnType<typeof analyzeBoardTexture>): boolean {
  if (board.length !== 4) return false;
  const turnCard = board[3];
  const flopMax = Math.max(...board.slice(0, 3).map((c) => Number(c.rank)));
  const isOvercard = Number(turnCard.rank) > flopMax && Number(turnCard.rank) >= 12;
  const completesThreeFlush = texture.flushDrawPossible && board.filter((c) => c.suit === turnCard.suit).length >= 3;
  return isOvercard || completesThreeFlush;
}

/**
 * GTO v3 + Restricted Nash Response (RNR) Safe-Exploitative Texas Hold'em AI Engine:
 * - Preflop: 6-max / Heads-Up 169-hand GTO frequency charts + <=15BB Nash push/fold + limp isolation + RNR exploit overlay
 * - Postflop: Zero-allocation Monte Carlo equity vs aggression-weighted range,
 *   range/nut advantage c-betting, turn probes & scare-card double barrels, OOP check-raise traps/semi-bluffs,
 *   MDF defense, blocker-driven river polarized bluffs/overbets, geometric sizing, AND real-time Bayesian
 *   Dirichlet-Beta opponent profiling with RNR safety margin.
 */
export function chooseBotAction(
  state: TableState,
  botId: string,
  rng: () => number = Math.random,
  profiler?: SessionOpponentProfiler
): PlayerAction {
  const available = getAvailableActions(state, botId);
  if (!available) return { type: 'fold' };

  const bot = state.players.find((p) => p.id === botId);
  if (!bot) return available.canCheck ? { type: 'check' } : { type: 'fold' };

  const personality = getBotPersonality(bot.name || bot.id);
  const primaryOpponentId = findPrimaryOpponentId(state, botId);
  const exploit: ExploitPlan = profiler
    ? profiler.buildExploitPlan(primaryOpponentId)
    : NEUTRAL_EXPLOIT_PLAN;
  const r = rng();
  const streetRaises = countStreetRaises(state);
  const activeOpponents = Math.max(
    1,
    state.players.filter((p) => p.inHand && !p.folded && p.id !== bot.id).length
  );
  const inHandCount = state.players.filter((p) => p.inHand).length;
  const isHeadsUp = inHandCount <= 2 || activeOpponents === 1;
  const position = resolveGtoPosition(state, bot.seatIndex);

  const effectiveStack = Math.min(
    bot.chips + bot.currentBet,
    Math.max(
      state.bigBlind,
      ...state.players
        .filter((p) => p.inHand && !p.folded && p.id !== bot.id)
        .map((p) => p.chips + p.currentBet)
    )
  );
  const effectiveStackBB = effectiveStack / Math.max(1, state.bigBlind);

  const snapBet = (desired: number): number => {
    const unit = Math.max(1, state.smallBlind);
    const snapped = Math.round(desired / unit) * unit;
    return Math.min(available.maxRaiseTo, Math.max(available.minRaiseTo, snapped));
  };

  const pickPotSizedBet = (potMultiplier: number): number => {
    const basePot = Math.max(state.pot, state.bigBlind * 2);
    const callAmt = available.canCall ? available.callAmount : 0;
    const desired =
      state.currentBet === 0
        ? Math.round(basePot * potMultiplier)
        : Math.round(state.currentBet + (basePot + callAmt) * potMultiplier);
    return snapBet(desired);
  };

  // --- PHASE 1: PREFLOP GTO MATRIX ENGINE ---
  if (state.phase === 'preflop' || state.communityCards.length === 0) {
    const facingRaises = state.currentBet <= state.bigBlind ? 0 : Math.max(1, streetRaises);
    const facingBetBB = state.currentBet / Math.max(1, state.bigBlind);

    const gtoMix = getGtoPreflopMix({
      holeCards: bot.holeCards,
      position,
      facingRaises,
      facingBetBB,
      effectiveStackBB,
      isHeadsUp,
      canCheck: available.canCheck,
    });

    const dev = 1 - personality.gtoDiscipline;
    let raiseFreq = gtoMix.raise;
    let callFreq = gtoMix.call;

    const limpersCount =
      facingRaises === 0
        ? state.players.filter(
            (p) =>
              p.inHand &&
              !p.folded &&
              p.id !== bot.id &&
              p.currentBet === state.bigBlind &&
              p.seatIndex !== state.bigBlindSeatIndex
          ).length
        : 0;

    if (raiseFreq > 0 || (facingRaises === 0 && personality.looseness > 0.04)) {
      raiseFreq = Math.max(0, Math.min(1, raiseFreq + personality.aggression * (0.35 + dev)));
    }
    // Session exploitative preflop overlay:
    // - Steal wider against over-folders/nits, punish passive limpers with isolation raises,
    // - Adjust 3-bet bluff frequency vs over-folders vs calling stations
    if (facingRaises === 0) {
      const preStrength = evaluatePreflopStrength(bot.holeCards);
      if (limpersCount > 0 && preStrength >= 0.48) {
        raiseFreq = Math.max(0, Math.min(1, raiseFreq + 0.14 + exploit.isoLimpBonus));
      } else if (preStrength >= 0.34) {
        raiseFreq = Math.max(0, Math.min(1, raiseFreq + exploit.preflopOpenDelta));
      }
    } else if (facingRaises === 1) {
      const preStrength = evaluatePreflopStrength(bot.holeCards);
      if (preStrength >= 0.45 && preStrength < 0.72) {
        raiseFreq = Math.max(0, Math.min(1, raiseFreq + exploit.threeBetBluffDelta));
      } else if (preStrength >= 0.72 && exploit.targetArchetype === 'calling_station') {
        raiseFreq = Math.min(1, raiseFreq + 0.15 * exploit.confidence);
      }
    }

    if (callFreq > 0 || personality.looseness > 0.05) {
      callFreq = Math.max(
        0,
        Math.min(1 - raiseFreq, callFreq + personality.looseness * (0.45 + dev))
      );
    }

    const key = toCanonicalHandKey(bot.holeCards);
    if (streetRaises >= 4 && key !== 'AA' && key !== 'KK') {
      callFreq = Math.min(1, callFreq + raiseFreq);
      raiseFreq = 0;
    }

    if (available.canRaise && r < raiseFreq) {
      if (effectiveStackBB <= 15 || facingRaises >= 3 || facingBetBB >= effectiveStackBB * 0.45) {
        return { type: 'raise', amount: available.maxRaiseTo };
      }
      if (facingRaises === 0) {
        const limpers = state.players.filter(
          (p) =>
            p.inHand &&
            !p.folded &&
            p.id !== bot.id &&
            p.currentBet === state.bigBlind &&
            p.seatIndex !== state.bigBlindSeatIndex
        ).length;
        const openBB = (position === 'SB' || position === 'BB' ? 3.0 : 2.5) + limpers * 1.0;
        return { type: 'raise', amount: snapBet(openBB * state.bigBlind) };
      }
      if (facingRaises === 1) {
        const mult = position === 'SB' || position === 'BB' ? 3.8 : 3.0;
        const target = Math.max(available.minRaiseTo, state.currentBet * mult);
        return {
          type: 'raise',
          amount: target >= bot.chips * 0.72 ? available.maxRaiseTo : snapBet(target),
        };
      }
      const fourBetTarget = state.currentBet * 2.3;
      return {
        type: 'raise',
        amount: fourBetTarget >= bot.chips * 0.55 ? available.maxRaiseTo : snapBet(fourBetTarget),
      };
    }

    if (available.canCheck) {
      return { type: 'check' };
    }

    if (available.canCall && r < raiseFreq + callFreq) {
      return { type: 'call' };
    }

    const callAmt = available.callAmount;
    const potOdds = callAmt / Math.max(1, state.pot + callAmt);
    const preStrength = evaluatePreflopStrength(bot.holeCards);
    if (available.canCall && potOdds <= 0.14 && preStrength >= 0.35) {
      return { type: 'call' };
    }

    return { type: 'fold' };
  }

  // --- PHASE 2: POSTFLOP GTO SOLVER HEURISTICS + MONTE CARLO EQUITY ---
  const board = state.communityCards;
  const texture = analyzeBoardTexture(board);
  const blockers = evaluateBlockers(bot.holeCards, board, texture);
  const drawBonus = estimateDrawBonus(bot.holeCards, board);
  const heuristicStrength = evaluatePostflopStrength(bot.holeCards, board);

  const callAmt = available.canCall ? available.callAmount : 0;
  const potBeforeBet = Math.max(1, state.pot - callAmt);
  const betFractionOfPot = callAmt / potBeforeBet;

  const villainTightness =
    callAmt === 0
      ? 0.22
      : Math.min(0.75, 0.25 + streetRaises * 0.15 + Math.min(0.28, betFractionOfPot * 0.22));

  const mcSeed =
    ((state.handNumber + 1) * 2654435761) ^
    (bot.seatIndex * 97531) ^
    (board.length * 1337) ^
    Math.floor(r * 0x7fffffff);
  const mcEquity = estimatePostflopEquity({
    holeCards: bot.holeCards,
    board,
    opponentCount: activeOpponents,
    villainTightness,
    iterations: 140,
    rng: createSeededRng(mcSeed),
  });

  const effectiveEquity = Math.max(
    0.04,
    Math.min(0.99, mcEquity * 0.65 + heuristicStrength * 0.35)
  );

  const posRatio = computePositionRatio(state, bot.seatIndex);
  const inPosition = posRatio >= 0.6;
  const isPfa = wasPreflopAggressor(state, bot.id);
  const streetsLeft = state.phase === 'flop' ? 3 : state.phase === 'turn' ? 2 : 1;
  const spr = bot.chips / Math.max(1, state.pot);
  const geoFrac = computeGeometricBetFraction(state.pot, effectiveStack, streetsLeft);
  const { rangeAdv, nutAdv } = computeBoardRangeAdvantage({
    board,
    isPfa,
    inPosition,
    texture,
  });

  if (available.canCheck) {
    if (!available.canRaise) return { type: 'check' };

    const rangeCbetSpot =
      state.phase === 'flop' &&
      isPfa &&
      activeOpponents <= 2 &&
      (texture.isDryHighBoard || rangeAdv >= 0.09) &&
      streetRaises === 0;

    if (rangeCbetSpot) {
      const advBoost = Math.max(-0.08, Math.min(0.14, rangeAdv * 0.65));
      const rangeBetFreq =
        effectiveEquity >= 0.58
          ? Math.min(0.96, 0.88 + advBoost + (exploit.targetArchetype === 'calling_station' ? 0.06 : 0))
          : drawBonus >= 0.06
            ? Math.min(0.92, (0.76 + advBoost + personality.aggression * 0.4) * Math.min(1.25, exploit.bluffFreqMult))
            : Math.min(0.9, (0.56 + advBoost + personality.aggression) * exploit.bluffFreqMult);
      if (r < rangeBetFreq) {
        const cbetSize =
          effectiveEquity >= 0.65
            ? Math.min(0.75, (nutAdv >= 0.12 ? 0.45 : 0.33) * exploit.valueSizeMult)
            : 0.33;
        return { type: 'raise', amount: pickPotSizedBet(cbetSize) };
      }
      return { type: 'check' };
    }

    // Turn Scare-Card Double Barrel: PFA leverages overcard/flush scare cards with blockers or equity
    if (
      state.phase === 'turn' &&
      isPfa &&
      streetRaises === 0 &&
      activeOpponents <= 2 &&
      !flopCheckedThrough(state) &&
      isTurnScareCard(board, texture)
    ) {
      if (effectiveEquity >= 0.62 + exploit.valueThresholdDelta) {
        const barrelMult = Math.min(1.25, Math.max(0.62, geoFrac) * exploit.valueSizeMult);
        return { type: 'raise', amount: pickPotSizedBet(barrelMult) };
      }
      if (
        (drawBonus >= 0.08 || blockers.bluffScore >= 0.5) &&
        exploit.targetArchetype !== 'calling_station' &&
        r < Math.min(0.78, (0.42 + Math.max(0, nutAdv)) * exploit.bluffFreqMult)
      ) {
        return { type: 'raise', amount: pickPotSizedBet(0.68) };
      }
    }

    // Turn Probe / Delayed C-Bet when flop checked through: attack capped opponent range
    if (
      state.phase === 'turn' &&
      streetRaises === 0 &&
      flopCheckedThrough(state) &&
      activeOpponents <= 2
    ) {
      const probeThreshold = 0.56 + exploit.valueThresholdDelta;
      if (effectiveEquity >= probeThreshold) {
        return { type: 'raise', amount: pickPotSizedBet(Math.min(0.9, 0.58 * exploit.valueSizeMult)) };
      }
      if (
        (drawBonus >= 0.08 || blockers.bluffScore >= 0.45) &&
        r < Math.min(0.75, 0.34 * exploit.bluffFreqMult)
      ) {
        return { type: 'raise', amount: pickPotSizedBet(0.6) };
      }
    }

    if (state.phase === 'river') {
      const valueThreshold = Math.max(
        0.54,
        (activeOpponents === 1 ? 0.68 : 0.74) + exploit.valueThresholdDelta
      );
      if (effectiveEquity >= valueThreshold) {
        // Nut advantage supports polarized overbets (up to 1.35x pot) on river
        const polarOverbet = effectiveEquity >= 0.9 && nutAdv >= 0.08 && spr >= 1.2;
        const baseMult = polarOverbet
          ? Math.min(1.35, Math.max(1.05, geoFrac))
          : effectiveEquity >= 0.88
            ? Math.min(1.25, Math.max(0.75, geoFrac))
            : effectiveEquity >= 0.78
              ? 0.66
              : 0.45;
        const exploitedMult = Math.min(1.5, Math.max(0.35, baseMult * exploit.valueSizeMult));
        return { type: 'raise', amount: pickPotSizedBet(exploitedMult) };
      }
      if (
        effectiveEquity <= 0.24 &&
        blockers.bluffScore >= 0.45 &&
        !(exploit.targetArchetype === 'calling_station' && exploit.rnrWeight >= 0.45)
      ) {
        const bluffSize = nutAdv >= 0.08 ? 1.0 : 0.75;
        const gtoBluffAlpha = computeOptimalBluffRatio(bluffSize * state.pot, state.pot);
        const bluffChance = Math.min(
          0.52,
          gtoBluffAlpha * blockers.bluffScore * (1 + personality.aggression) * exploit.bluffFreqMult
        );
        if (r < bluffChance) {
          return { type: 'raise', amount: pickPotSizedBet(bluffSize) };
        }
      }
      return { type: 'check' };
    }

    const valueThreshold = Math.max(
      0.52,
      (activeOpponents === 1 ? 0.62 : 0.68) - personality.aggression * 0.35 + exploit.valueThresholdDelta
    );
    if (effectiveEquity >= valueThreshold) {
      // Trap/slowplay monsters more often against maniacs who will barrel off into us
      const trapChance =
        effectiveEquity >= 0.88 && texture.wetness < 0.32
          ? (inPosition ? 0.12 : 0.08) + exploit.trapSlowplayBonus
          : 0;
      if (trapChance > 0 && r < Math.min(0.55, trapChance)) {
        return { type: 'check' };
      }
      const baseMult =
        texture.wetness >= 0.5
          ? 0.72
          : spr <= 2.5
            ? Math.min(1.0, geoFrac)
            : effectiveEquity >= 0.82
              ? 0.66
              : 0.45;
      return {
        type: 'raise',
        amount: pickPotSizedBet(Math.min(1.3, baseMult * exploit.valueSizeMult)),
      };
    }

    if (drawBonus >= 0.1 && streetRaises === 0) {
      const semiBluffFreq = Math.min(
        0.92,
        ((drawBonus >= 0.16 ? 0.72 : 0.48) +
          (inPosition ? 0.08 : 0) +
          personality.aggression * 0.5) *
          Math.max(0.55, exploit.bluffFreqMult)
      );
      if (r < semiBluffFreq) {
        return { type: 'raise', amount: pickPotSizedBet(texture.wetness >= 0.45 ? 0.66 : 0.5) };
      }
    }

    if (
      streetRaises === 0 &&
      inPosition &&
      effectiveEquity <= 0.32 &&
      blockers.bluffScore >= 0.45 &&
      r < Math.min(0.45, personality.bluffRate * 0.85 * exploit.bluffFreqMult)
    ) {
      return { type: 'raise', amount: pickPotSizedBet(0.45) };
    }

    return { type: 'check' };
  }

  const potOdds = callAmt / Math.max(1, state.pot + callAmt);
  const mdf = computeMdf(potBeforeBet, callAmt);
  const stackCommitment = callAmt / Math.max(1, bot.chips + callAmt);
  const raiseCapReached = streetRaises >= 3 && effectiveEquity < 0.9;

  const raiseThreshold =
    (state.phase === 'river' ? 0.84 : 0.78) -
    personality.aggression * 0.3 +
    exploit.valueThresholdDelta * 0.6;
  if (available.canRaise && !raiseCapReached && effectiveEquity >= raiseThreshold) {
    if (effectiveEquity >= 0.9 && (stackCommitment >= 0.45 || spr <= 1.8)) {
      return { type: 'raise', amount: available.maxRaiseTo };
    }
    const raiseFreq = effectiveEquity >= 0.88 ? 0.92 : 0.62 + personality.aggression;
    if (r < raiseFreq) {
      const mult =
        (state.phase === 'river' ? 0.75 : texture.wetness >= 0.45 ? 0.75 : 0.58) *
        Math.min(1.25, exploit.valueSizeMult);
      return { type: 'raise', amount: pickPotSizedBet(mult) };
    }
  }

  // Semi-bluff raise & anti-C-bet-spammer check-raise counter
  const cbetCounterTrigger =
    state.phase === 'flop' &&
    !inPosition &&
    streetRaises === 1 &&
    exploit.floatCheckRaiseBonus > 0.08 &&
    (drawBonus >= 0.06 || blockers.bluffScore >= 0.45 || effectiveEquity >= 0.42);
  if (
    available.canRaise &&
    !raiseCapReached &&
    state.phase !== 'river' &&
    streetRaises <= 1 &&
    stackCommitment < 0.45 &&
    ((drawBonus >= 0.16 &&
      r <
        (0.24 + personality.bluffRate * 0.6 + (blockers.hasNutFlushBlocker ? 0.12 : 0)) *
          Math.max(0.45, exploit.bluffFreqMult)) ||
      (cbetCounterTrigger && r < exploit.floatCheckRaiseBonus))
  ) {
    return { type: 'raise', amount: pickPotSizedBet(0.72) };
  }

  const impliedOddsCredit = state.phase === 'river' ? 0 : Math.min(0.08, drawBonus * 0.38);
  const mdfShift = (0.6 - mdf) * 0.1;
  const blockerCallCredit =
    state.phase === 'river' && (blockers.hasNutFlushBlocker || blockers.hasTopCardBlocker)
      ? 0.035
      : 0;
  const multiwayExtra = activeOpponents > 1 ? Math.min(0.07, (activeOpponents - 1) * 0.035) : 0;

  const requiredEquity = Math.max(
    0.1,
    Math.min(
      0.8,
      potOdds +
        0.02 +
        mdfShift +
        multiwayExtra +
        exploit.callRequiredEquityDelta -
        impliedOddsCredit -
        blockerCallCredit -
        personality.looseness * 0.55 -
        (inPosition ? 0.015 : 0)
    )
  );

  if (effectiveEquity >= requiredEquity) {
    return { type: 'call' };
  }

  if (
    effectiveEquity >= requiredEquity - 0.03 &&
    r < 0.35 + Math.max(0, personality.looseness) - exploit.callRequiredEquityDelta
  ) {
    return { type: 'call' };
  }

  return { type: 'fold' };
}
