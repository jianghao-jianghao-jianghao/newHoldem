import { evaluateBestHand } from '../src/shared/handEvaluator';
import { getAvailableActions } from '../src/shared/pokerEngine';
import type { Card, PlayerAction, TableState } from '../src/shared/types';

export interface BotPersonality {
  name: 'tag' | 'lag' | 'balanced' | 'calling_station';
  /** Shifts calling/opening looseness (-0.06 tight .. +0.09 loose) */
  looseness: number;
  /** Shifts raise / value-bet aggression (-0.08 passive .. +0.10 aggressive) */
  aggression: number;
  /** Baseline bluff frequency on dry spots (0.04 .. 0.16) */
  bluffRate: number;
}

const PERSONALITIES: BotPersonality[] = [
  { name: 'tag', looseness: -0.05, aggression: 0.08, bluffRate: 0.08 },
  { name: 'lag', looseness: 0.06, aggression: 0.1, bluffRate: 0.15 },
  { name: 'balanced', looseness: 0.0, aggression: 0.02, bluffRate: 0.1 },
  { name: 'calling_station', looseness: 0.08, aggression: -0.08, bluffRate: 0.04 },
];

export function getBotPersonality(seed: string): BotPersonality {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PERSONALITIES[hash % PERSONALITIES.length];
}

/**
 * Calibrated Chen-inspired preflop strength score on [0.08, 0.98].
 * Premium hands stay decisively strong even in 6-max pots:
 * AA≈0.97, KK≈0.92, QQ≈0.87, JJ≈0.81, AKs≈0.85, AKo≈0.80, AQs≈0.78, 72o≈0.11.
 */
export function evaluatePreflopStrength(holeCards: Card[]): number {
  if (holeCards.length < 2) return 0.2;
  const [c1, c2] = holeCards;
  const high = Math.max(c1.rank, c2.rank);
  const low = Math.min(c1.rank, c2.rank);
  const suited = c1.suit === c2.suit;
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
    // Bonus for Broadway high-card combos (AK, AQ, AJ, KQ) which play strongly preflop
    if (high >= 13 && low >= 12) {
      chen += 3.2;
    } else if (high === 14 && low >= 10) {
      chen += 1.6;
    }
  }

  // Smooth nonlinear mapping so Chen 10..20 maps nicely into [0.68, 0.97]
  // while Chen -1..9 maps into [0.09, 0.66].
  const clampedChen = Math.max(-1.5, Math.min(20, chen));
  let normalized: number;
  if (clampedChen >= 10) {
    normalized = 0.70 + ((clampedChen - 10) / 10) * 0.27;
  } else {
    normalized = 0.09 + ((clampedChen + 1.5) / 11.5) * 0.61;
  }
  return Math.max(0.08, Math.min(0.98, normalized));
}

/**
 * Counts exact distinct rank completions (each distinct rank = 4 outs) that form a 5-card straight
 * using at least one hole card. Correctly distinguishes 4-out gutshots/wheel-tops (AKQJ, A234)
 * from 8-out open-ended/double-gutter straight draws (JT98, 97653).
 */
export function countStraightDrawCompletionRanks(holeCards: Card[], board: Card[]): number {
  const all = [...holeCards, ...board];
  const existingRanks = new Set<number>(all.map((c) => Number(c.rank)));
  const holeRanks = new Set<number>(holeCards.map((c) => Number(c.rank)));

  // Helper: check if rankSet contains any 5-card straight that uses >=1 hole card
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

  // Already have a straight using hole cards
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
  const streetsLeft = 5 - board.length; // 2 on flop, 1 on turn
  let bonus = 0;

  // Flush draw: 4 cards of same suit with at least 1 hole card contributing (9 outs)
  const suitCounts = new Map<string, number>();
  for (const c of all) {
    suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1);
  }
  for (const [suit, count] of suitCounts.entries()) {
    if (count === 4 && holeCards.some((h) => h.suit === suit)) {
      bonus += streetsLeft === 2 ? 0.17 : 0.1;
      break;
    }
  }

  // Exact straight draw outs: 1 completion rank = 4 outs (gutshot / AKQJ / A234), >=2 = 8+ outs (OESD)
  const straightRankOuts = countStraightDrawCompletionRanks(holeCards, board);
  if (straightRankOuts >= 2) {
    bonus += streetsLeft === 2 ? 0.14 : 0.08;
  } else if (straightRankOuts === 1) {
    bonus += streetsLeft === 2 ? 0.06 : 0.035;
  }

  return Math.min(0.24, bonus);
}

/**
 * Evaluates relative postflop strength accounting for board texture, true Top Pair + kicker
 * (including overcard kickers like AQ on Q-8-4), board-paired traps, and exact draw outs.
 */
export function evaluatePostflopStrength(holeCards: Card[], board: Card[]): number {
  const all = [...holeCards, ...board];
  const ev = evaluateBestHand(all);
  const boardEval = board.length >= 5 ? evaluateBestHand(board) : null;
  const boardHigh = Math.max(...board.map((c) => Number(c.rank)));
  const holeHigh = Math.max(Number(holeCards[0]?.rank ?? 2), Number(holeCards[1]?.rank ?? 2));
  const holeLow = Math.min(Number(holeCards[0]?.rank ?? 2), Number(holeCards[1]?.rank ?? 2));
  const isPocketPair = holeHigh === holeLow;

  // Board rank frequencies to detect board-paired false pairs
  const boardFreq = new Map<number, number>();
  for (const c of board) {
    const r = Number(c.rank);
    boardFreq.set(r, (boardFreq.get(r) ?? 0) + 1);
  }
  const boardHasPair = Array.from(boardFreq.values()).some((v) => v >= 2);
  const boardHasTrips = Array.from(boardFreq.values()).some((v) => v >= 3);

  let base = 0.18;
  switch (ev.category) {
    case 0: // High card
      base = 0.14 + (holeHigh >= 13 ? 0.07 : 0) + (holeHigh > boardHigh ? 0.05 : 0);
      break;
    case 1: { // One pair
      const matchedHigh = board.some((c) => Number(c.rank) === holeHigh);
      const matchedLow = board.some((c) => Number(c.rank) === holeLow);
      const matchedTopBoard =
        (matchedHigh && holeHigh === boardHigh) || (matchedLow && holeLow === boardHigh);

      if (isPocketPair && holeHigh > boardHigh) {
        // Overpair (e.g., AA/KK/QQ on J-8-4)
        base = 0.74 + (holeHigh / 14) * 0.08;
      } else if (matchedTopBoard) {
        // Top pair — scale by the unpaired kicker (works for both KQ on K-7-2 and AQ on Q-8-4!)
        const kicker = matchedHigh && holeHigh === boardHigh ? holeLow : holeHigh;
        base = 0.62 + (kicker / 14) * 0.14;
      } else if (matchedHigh || matchedLow || isPocketPair) {
        // Middle / under / bottom pair
        const pairRank = isPocketPair ? holeHigh : matchedHigh ? holeHigh : holeLow;
        base = 0.42 + (pairRank / Math.max(14, boardHigh)) * 0.14;
      } else if (boardHasPair) {
        // Only playing the board pair -> weak bluff-catcher
        base = 0.22 + (holeHigh >= 13 ? 0.08 : 0);
      } else {
        base = 0.44;
      }
      break;
    }
    case 2: // Two pair
      base = boardHasPair ? 0.66 : 0.80;
      break;
    case 3: // Trips / Set
      base = boardHasTrips ? 0.56 : 0.86;
      break;
    case 4: // Straight
      base = 0.89;
      break;
    case 5: // Flush
      base = 0.92;
      break;
    case 6: // Full house
      base = 0.95;
      break;
    default: // Quads / Straight Flush / Royal Flush
      base = 0.99;
      break;
  }

  // If best hand is literally just playing the 5-card board, heavily discount
  if (boardEval && ev.score === boardEval.score) {
    base = Math.min(base, 0.25);
  }

  const drawBonus = ev.category < 4 ? estimateDrawBonus(holeCards, board) : 0;
  return Math.max(0.08, Math.min(0.99, base + drawBonus));
}

/**
 * Computes exact acting position ratio on [0, 1] among active players in the hand.
 * 0.0 = first to act (UTG preflop / SB postflop), 1.0 = last to act (BB/BTN).
 */
export function computePositionRatio(state: TableState, playerSeatIndex: number): number {
  const activeSeats = state.players
    .filter((p) => p.inHand && !p.folded)
    .map((p) => p.seatIndex)
    .sort((a, b) => a - b);
  if (activeSeats.length <= 1) return 1;

  // Determine the anchor seat whose immediate clockwise neighbor acts FIRST on this street
  const anchorSeat =
    state.phase === 'preflop' && state.bigBlindSeatIndex !== null
      ? activeSeats.length === 2 && state.smallBlindSeatIndex !== null
        ? state.bigBlindSeatIndex // Heads-up preflop: SB/BTN acts first, BB acts last
        : state.bigBlindSeatIndex // 3+ preflop: UTG (left of BB) acts first, BB acts last
      : state.dealerSeatIndex; // Postflop: first active seat left of Dealer acts first, Dealer acts last

  const ordered: number[] = [
    ...activeSeats.filter((s) => s > anchorSeat),
    ...activeSeats.filter((s) => s <= anchorSeat),
  ];
  const idx = ordered.indexOf(playerSeatIndex);
  if (idx === -1) return 0.5;
  return idx / Math.max(1, ordered.length - 1);
}

function countStreetRaises(state: TableState): number {
  return state.currentHandActions.filter(
    (a) =>
      a.street === state.phase &&
      (a.actionLabel.startsWith('加注') ||
        a.actionLabel.startsWith('下注') ||
        a.actionLabel.startsWith('全下'))
  ).length;
}

export function chooseBotAction(
  state: TableState,
  botId: string,
  rng: () => number = Math.random
): PlayerAction {
  const available = getAvailableActions(state, botId);
  if (!available) return { type: 'fold' };

  const bot = state.players.find((p) => p.id === botId);
  if (!bot) return { type: 'fold' };

  const personality = getBotPersonality(`${bot.id}:${bot.name}`);
  const r = rng();
  const streetRaises = countStreetRaises(state);
  const activeOpponents = Math.max(
    1,
    state.players.filter((p) => p.inHand && !p.folded && p.id !== bot.id).length
  );

  // Raw hand equity estimate on [0.08, 0.99]
  const rawStrength =
    state.communityCards.length === 0
      ? evaluatePreflopStrength(bot.holeCards)
      : evaluatePostflopStrength(bot.holeCards, state.communityCards);

  // Gentle multiway discount that does NOT cripple premium hands (KK/QQ/AKs) in 6-max pots
  const perOppPenalty =
    state.communityCards.length === 0
      ? rawStrength >= 0.78
        ? 0.008
        : 0.014
      : rawStrength >= 0.8
        ? 0.012
        : 0.024;
  const multiwayDiscount = Math.min(
    state.communityCards.length === 0 ? 0.065 : 0.1,
    (activeOpponents - 1) * perOppPenalty
  );
  const strength = Math.max(0.05, Math.min(0.99, rawStrength - multiwayDiscount));

  // True clockwise position adjustment: early (UTG) slightly tighter (-0.025), late (CO/BTN) wider (+0.035)
  const posRatio = computePositionRatio(state, bot.seatIndex);
  const isLatePos = posRatio >= 0.65;
  const posBonus = isLatePos ? 0.035 : posRatio <= 0.25 ? -0.025 : 0;

  // Pot-proportional bet sizing helper clamped to legal bounds
  const pickBetTarget = (potMultiplier: number): number => {
    const basePot = Math.max(state.bigBlind * 2, state.pot);
    const desired =
      state.currentBet === 0
        ? Math.round(basePot * potMultiplier)
        : Math.round(state.currentBet + basePot * potMultiplier);
    const snapped =
      Math.round(desired / Math.max(1, state.smallBlind)) * Math.max(1, state.smallBlind);
    return Math.min(available.maxRaiseTo, Math.max(available.minRaiseTo, snapped));
  };

  // --- CASE 1: Free check available ---
  if (available.canCheck) {
    const canValueBet =
      available.canRaise && strength + personality.aggression * 0.5 + posBonus >= 0.62;
    const canBluffBet =
      available.canRaise &&
      streetRaises === 0 &&
      r < personality.bluffRate + (isLatePos ? 0.04 : 0);

    if (canValueBet && (strength >= 0.78 || r > 0.25)) {
      const sizeMult = strength >= 0.85 ? 0.72 : 0.48;
      return { type: 'raise', amount: pickBetTarget(sizeMult) };
    }
    if (canBluffBet) {
      return { type: 'raise', amount: pickBetTarget(0.45) };
    }
    return { type: 'check' };
  }

  // --- CASE 2: Facing a bet / raise ---
  const callAmt = available.callAmount;
  const potOdds = callAmt / Math.max(1, state.pot + callAmt);
  const betInBB = callAmt / Math.max(1, state.bigBlind);
  const stackCommitment = callAmt / Math.max(1, bot.chips + callAmt);

  // Prevent infinite min-raise loops: cap re-raises unless holding a true monster (AA/KK/set+)
  const raiseCapReached = streetRaises >= 3 && strength < 0.9;
  const isPreflopUnopened = state.phase === 'preflop' && state.currentBet <= state.bigBlind;
  const canValueRaise =
    available.canRaise &&
    !raiseCapReached &&
    (strength >= 0.80 ||
      (isPreflopUnopened && strength + posBonus >= 0.64) ||
      (strength + posBonus >= 0.70 - personality.aggression * 0.4 &&
        streetRaises <= 1 &&
        r < 0.55 + personality.aggression));

  if (canValueRaise) {
    if (strength >= 0.9 && stackCommitment > 0.45) {
      return { type: 'raise', amount: available.maxRaiseTo };
    }
    const mult = isPreflopUnopened ? 0.85 : streetRaises === 0 ? 0.65 : 0.8;
    return { type: 'raise', amount: pickBetTarget(mult) };
  }

  // Occasional semi-bluff raise on flop/turn when facing a single moderate bet
  if (
    available.canRaise &&
    !raiseCapReached &&
    streetRaises <= 1 &&
    betInBB <= 6 &&
    strength >= 0.48 &&
    r < personality.bluffRate * 0.65
  ) {
    return { type: 'raise', amount: pickBetTarget(0.6) };
  }

  // Required equity threshold scales with true pot odds + pressure of large bets/shoves
  // Premium holdings (QQ+/AKs/Top Pair+) comfortably call shoves without folding to over-tight math
  const pressurePenalty =
    stackCommitment > 0.55
      ? 0.14
      : betInBB >= 8
        ? 0.09
        : betInBB >= 4
          ? 0.04
          : 0;
  const callThreshold = Math.min(
    0.78,
    Math.max(0.18, potOdds + 0.08 + pressurePenalty - personality.looseness - posBonus)
  );

  if (strength >= callThreshold) {
    return { type: 'call' };
  }

  // Cheap defend in BB / tiny limp (< 1 BB) with playable hands (still folds pure trash to raises)
  if (
    callAmt <= state.bigBlind &&
    state.phase === 'preflop' &&
    strength >= 0.28 - personality.looseness * 0.5
  ) {
    return { type: 'call' };
  }

  // Rare hero call when pot odds are generous
  if (
    potOdds < 0.22 &&
    strength >= potOdds + 0.04 &&
    r < 0.16 + Math.max(0, personality.looseness)
  ) {
    return { type: 'call' };
  }

  return { type: 'fold' };
}
