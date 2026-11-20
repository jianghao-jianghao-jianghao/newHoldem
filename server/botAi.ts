import { evaluateBestHand } from '../src/shared/handEvaluator';
import { getAvailableActions } from '../src/shared/pokerEngine';
import type { Card, PlayerAction, TableState } from '../src/shared/types';

export interface BotPersonality {
  name: 'tag' | 'lag' | 'balanced' | 'calling_station';
  /** Shifts calling/opening looseness (-0.08 tight .. +0.10 loose) */
  looseness: number;
  /** Shifts raise / value-bet aggression (-0.08 passive .. +0.12 aggressive) */
  aggression: number;
  /** Baseline bluff frequency on dry spots (0.04 .. 0.18) */
  bluffRate: number;
}

const PERSONALITIES: BotPersonality[] = [
  { name: 'tag', looseness: -0.06, aggression: 0.08, bluffRate: 0.08 },
  { name: 'lag', looseness: 0.07, aggression: 0.12, bluffRate: 0.16 },
  { name: 'balanced', looseness: 0.0, aggression: 0.02, bluffRate: 0.1 },
  { name: 'calling_station', looseness: 0.09, aggression: -0.09, bluffRate: 0.04 },
];

export function getBotPersonality(seed: string): BotPersonality {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PERSONALITIES[hash % PERSONALITIES.length];
}

/**
 * Chen-inspired preflop strength score normalized to [0.08, 0.98].
 * Distinguishes premium pairs, suited Broadway connectors, and weak offsuit rags.
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

  let score = baseHighScore(high);
  if (high === low) {
    score = Math.max(5, score * 2);
    if (high === 5) score += 1; // 55 plays nicely for straight/set potential
  } else {
    if (suited) score += 2;
    if (gap === 1) {
      if (high < 12) score += 1;
    } else if (gap === 2) {
      score -= 1;
      if (high < 12) score += 0.5;
    } else if (gap === 3) {
      score -= 2;
    } else if (gap === 4) {
      score -= 4;
    } else {
      score -= 5;
    }
  }

  // Typical Chen score ranges from ~ -1 (72o) to 20 (AA)
  const normalized = (score + 1.5) / 21.5;
  return Math.max(0.08, Math.min(0.98, normalized));
}

function estimateDrawBonus(holeCards: Card[], board: Card[]): number {
  if (board.length < 3 || board.length >= 5) return 0;
  const all = [...holeCards, ...board];
  const streetsLeft = 5 - board.length; // 2 on flop, 1 on turn
  let bonus = 0;

  // Flush draw: 4 cards of same suit with at least 1 hole card contributing
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

  // Straight draw: check open-ended (8 outs) or gutshot (4 outs)
  const uniqueRanks: number[] = Array.from(new Set(all.map((c) => Number(c.rank)))).sort((a, b) => a - b);
  if (uniqueRanks.includes(14)) uniqueRanks.unshift(1);
  let bestWindow = 0;
  for (let start = 1; start <= 10; start++) {
    let hits = 0;
    let usesHole = false;
    for (let r = start; r < start + 5; r++) {
      if (uniqueRanks.includes(r)) {
        hits++;
        const actualRank = r === 1 ? 14 : r;
        if (holeCards.some((h) => h.rank === actualRank)) usesHole = true;
      }
    }
    if (usesHole && hits === 4) {
      const endsPresent = uniqueRanks.includes(start) && uniqueRanks.includes(start + 4);
      bestWindow = Math.max(bestWindow, endsPresent ? 1 : 2); // 2 = OESD, 1 = gutshot
    }
  }
  if (bestWindow === 2) {
    bonus += streetsLeft === 2 ? 0.14 : 0.08;
  } else if (bestWindow === 1) {
    bonus += streetsLeft === 2 ? 0.06 : 0.035;
  }

  return Math.min(0.24, bonus);
}

/**
 * Evaluates relative postflop strength accounting for board texture, pair rank vs board top card,
 * board-paired traps, and live flush/straight draws.
 */
function evaluatePostflopStrength(holeCards: Card[], board: Card[]): number {
  const all = [...holeCards, ...board];
  const ev = evaluateBestHand(all);
  const boardEval = board.length >= 5 ? evaluateBestHand(board) : null;
  const boardHigh = Math.max(...board.map((c) => c.rank));
  const holeHigh = Math.max(holeCards[0]?.rank ?? 2, holeCards[1]?.rank ?? 2);
  const holeLow = Math.min(holeCards[0]?.rank ?? 2, holeCards[1]?.rank ?? 2);
  const isPocketPair = holeCards[0]?.rank === holeCards[1]?.rank;

  // Board rank frequencies to detect board-paired false pairs
  const boardFreq = new Map<number, number>();
  for (const c of board) {
    boardFreq.set(c.rank, (boardFreq.get(c.rank) ?? 0) + 1);
  }
  const boardHasPair = Array.from(boardFreq.values()).some((v) => v >= 2);
  const boardHasTrips = Array.from(boardFreq.values()).some((v) => v >= 3);

  let base = 0.18;
  switch (ev.category) {
    case 0: // High card
      base = 0.14 + (holeHigh >= 13 ? 0.07 : 0) + (holeHigh > boardHigh ? 0.05 : 0);
      break;
    case 1: { // One pair
      const matchedHigh = board.some((c) => c.rank === holeHigh);
      const matchedLow = board.some((c) => c.rank === holeLow);
      if (isPocketPair && holeHigh > boardHigh) {
        // Overpair
        base = 0.72 + (holeHigh / 14) * 0.08;
      } else if (matchedHigh && holeHigh === boardHigh) {
        // Top pair — scale by kicker
        base = 0.62 + (holeLow / 14) * 0.11;
      } else if (matchedHigh || matchedLow || isPocketPair) {
        // Middle/under/bottom pair
        const pairRank = isPocketPair ? holeHigh : matchedHigh ? holeHigh : holeLow;
        base = 0.42 + (pairRank / Math.max(14, boardHigh)) * 0.14;
      } else if (boardHasPair) {
        // Only playing the board pair! Weak bluff-catcher
        base = 0.22 + (holeHigh >= 13 ? 0.08 : 0);
      } else {
        base = 0.44;
      }
      break;
    }
    case 2: // Two pair
      base = boardHasPair ? 0.66 : 0.79;
      break;
    case 3: // Trips / Set
      base = boardHasTrips ? 0.56 : 0.85;
      break;
    case 4: // Straight
      base = 0.88;
      break;
    case 5: // Flush
      base = 0.91;
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

  // Raw hand equity estimate on [0.08, 0.99], slightly discounted in multiway pots
  const rawStrength =
    state.communityCards.length === 0
      ? evaluatePreflopStrength(bot.holeCards)
      : evaluatePostflopStrength(bot.holeCards, state.communityCards);
  const multiwayDiscount = Math.min(0.12, (activeOpponents - 1) * 0.03);
  const strength = Math.max(0.05, Math.min(0.99, rawStrength - multiwayDiscount));

  // Position bonus: acting on/near Dealer button allows slightly wider opens & value bets
  const isLatePos =
    bot.seatIndex === state.dealerSeatIndex ||
    (state.smallBlindSeatIndex !== null && bot.seatIndex !== state.smallBlindSeatIndex && bot.seatIndex !== state.bigBlindSeatIndex);
  const posBonus = isLatePos ? 0.035 : 0;

  // Pot-proportional bet sizing helper clamped to legal bounds
  const pickBetTarget = (potMultiplier: number): number => {
    const basePot = Math.max(state.bigBlind * 2, state.pot);
    const desired =
      state.currentBet === 0
        ? Math.round(basePot * potMultiplier)
        : Math.round(state.currentBet + basePot * potMultiplier);
    const snapped = Math.round(desired / Math.max(1, state.smallBlind)) * Math.max(1, state.smallBlind);
    return Math.min(available.maxRaiseTo, Math.max(available.minRaiseTo, snapped));
  };

  // --- CASE 1: Free check available ---
  if (available.canCheck) {
    const canValueBet =
      available.canRaise &&
      strength + personality.aggression * 0.5 + posBonus >= 0.62;
    const canBluffBet =
      available.canRaise &&
      streetRaises === 0 &&
      r < personality.bluffRate + (isLatePos ? 0.04 : 0);

    if (canValueBet && (strength >= 0.8 || r > 0.25)) {
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

  // Prevent infinite min-raise loops: cap re-raises unless holding a monster hand
  const raiseCapReached = streetRaises >= 3 && strength < 0.9;
  const canValueRaise =
    available.canRaise &&
    !raiseCapReached &&
    (strength >= 0.82 ||
      (strength >= 0.72 - personality.aggression * 0.4 &&
        streetRaises <= 1 &&
        r < 0.5 + personality.aggression));

  if (canValueRaise) {
    // Monster hands can 3-bet / jam when committed
    if (strength >= 0.9 && stackCommitment > 0.45) {
      return { type: 'raise', amount: available.maxRaiseTo };
    }
    const mult = streetRaises === 0 ? 0.65 : 0.8;
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
  const pressurePenalty =
    stackCommitment > 0.55
      ? 0.16
      : betInBB >= 8
        ? 0.11
        : betInBB >= 4
          ? 0.05
          : 0;
  const callThreshold = Math.min(
    0.86,
    Math.max(0.18, potOdds + 0.09 + pressurePenalty - personality.looseness - posBonus)
  );

  if (strength >= callThreshold) {
    return { type: 'call' };
  }

  // Cheap defend in BB / tiny limp (< 1.5 BB) with playable hands (still folds pure trash to raises)
  if (
    callAmt <= state.bigBlind &&
    state.phase === 'preflop' &&
    strength >= 0.26 - personality.looseness * 0.5
  ) {
    return { type: 'call' };
  }

  // Rare hero call when pot odds are generous
  if (potOdds < 0.22 && strength >= potOdds + 0.04 && r < 0.18 + Math.max(0, personality.looseness)) {
    return { type: 'call' };
  }

  return { type: 'fold' };
}
