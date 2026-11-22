/**
 * GTO Texas Hold'em Strategy Tables, Board Texture Analyzer, Blocker Evaluator,
 * and Zero-Allocation 7-Card Monte Carlo Equity Simulator.
 *
 * Inspired by high-star open-source GTO frameworks on GitHub:
 * - bupticybee/TexasSolver & b-inary/desktop-postflop (MDF, polarized/range c-betting, blockers, geometric sizing)
 * - Tyloo/poker-range-analyzer & sol5000/gto (6-max 100BB 169-hand preflop RFI / 3-bet / 4-bet matrices)
 * - noambrown/poker_solver & Pluribus-style mixed-strategy sampling + fast rollouts
 */

import type { Card, Suit } from '../src/shared/types';

export type GtoPosition = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

export interface PreflopActionMix {
  raise: number; // open-raise / 3-bet / 4-bet / shove frequency [0..1]
  call: number;  // call / defend frequency [0..1]
  fold: number;  // fold frequency [0..1]
}

export interface BoardTexture {
  highRank: number;
  isPaired: boolean;
  isDoublePaired: boolean;
  hasBoardTrips: boolean;
  isMonotone: boolean;
  isTwoTone: boolean;
  isRainbow: boolean;
  flushSuit: Suit | null;
  maxSuitCount: number;
  connectedness: number; // 0 (dry/disconnected) .. 1 (very connected/wet)
  wetness: number;       // 0 (dry) .. 1 (ultra wet)
  isDryHighBoard: boolean;
}

export interface BlockerProfile {
  hasNutFlushBlocker: boolean;
  hasSecondNutFlushBlocker: boolean;
  hasStraightBlocker: boolean;
  hasTopCardBlocker: boolean;
  bluffScore: number; // [0..1] how suitable this hand is as a GTO bluff candidate
}

const RANK_CHARS: Record<number, string> = {
  14: 'A',
  13: 'K',
  12: 'Q',
  11: 'J',
  10: 'T',
  9: '9',
  8: '8',
  7: '7',
  6: '6',
  5: '5',
  4: '4',
  3: '3',
  2: '2',
};

const SUIT_INDEX: Record<Suit, number> = {
  spades: 0,
  hearts: 1,
  diamonds: 2,
  clubs: 3,
};

/**
 * Converts 2 hole cards into canonical 169-hand notation: 'AA', 'AKs', 'QJo', etc.
 */
export function toCanonicalHandKey(holeCards: Card[]): string {
  if (holeCards.length < 2) return '72o';
  const r1 = Number(holeCards[0].rank);
  const r2 = Number(holeCards[1].rank);
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const cHigh = RANK_CHARS[high] ?? '7';
  const cLow = RANK_CHARS[low] ?? '2';
  if (high === low) return `${cHigh}${cLow}`;
  const suited = holeCards[0].suit === holeCards[1].suit;
  return `${cHigh}${cLow}${suited ? 's' : 'o'}`;
}

/**
 * Parses a compact range string (e.g. "AA-66,AKs-A2s:0.8,KQs-K9s,QJs-QTs,JTs,T9s,AKo-AJo,KQo")
 * into a Map<handKey, frequency>.
 */
function parseRangeSpec(spec: string): Map<string, number> {
  const rankOrder = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
  const idxOf = (ch: string) => rankOrder.indexOf(ch);
  const map = new Map<string, number>();

  const setFreq = (key: string, freq: number) => {
    const clamped = Math.max(0, Math.min(1, freq));
    const prev = map.get(key) ?? 0;
    if (clamped > prev) map.set(key, clamped);
  };

  for (const rawToken of spec.split(',')) {
    const token = rawToken.trim();
    if (!token) continue;
    const [expr, freqStr] = token.split(':');
    const freq = freqStr !== undefined ? Number(freqStr) : 1.0;

    if (expr.includes('-')) {
      const [start, end] = expr.split('-');
      if (start.length === 2 && end.length === 2 && start[0] === start[1] && end[0] === end[1]) {
        // Pair range: e.g. AA-66
        const iStart = idxOf(start[0]);
        const iEnd = idxOf(end[0]);
        const lo = Math.min(iStart, iEnd);
        const hi = Math.max(iStart, iEnd);
        for (let i = lo; i <= hi; i++) {
          setFreq(`${rankOrder[i]}${rankOrder[i]}`, freq);
        }
      } else if (start.length === 3 && end.length === 3 && start[2] === end[2]) {
        const suffix = start[2];
        if (start[0] === end[0]) {
          // Same high card: e.g. AKs-A2s
          const highCh = start[0];
          const iStart = idxOf(start[1]);
          const iEnd = idxOf(end[1]);
          const lo = Math.min(iStart, iEnd);
          const hi = Math.max(iStart, iEnd);
          for (let i = lo; i <= hi; i++) {
            if (rankOrder[i] !== highCh) {
              setFreq(`${highCh}${rankOrder[i]}${suffix}`, freq);
            }
          }
        } else {
          // Connector diagonal: e.g. JTs-54s
          const gap = idxOf(start[1]) - idxOf(start[0]);
          const iStart = idxOf(start[0]);
          const iEnd = idxOf(end[0]);
          const lo = Math.min(iStart, iEnd);
          const hi = Math.max(iStart, iEnd);
          for (let i = lo; i <= hi; i++) {
            const j = i + gap;
            if (j >= 0 && j < rankOrder.length && j !== i) {
              setFreq(`${rankOrder[i]}${rankOrder[j]}${suffix}`, freq);
            }
          }
        }
      }
    } else if (expr.endsWith('+')) {
      const base = expr.slice(0, -1);
      if (base.length === 2 && base[0] === base[1]) {
        const iBase = idxOf(base[0]);
        for (let i = 0; i <= iBase; i++) {
          setFreq(`${rankOrder[i]}${rankOrder[i]}`, freq);
        }
      } else if (base.length === 3) {
        const highIdx = idxOf(base[0]);
        const lowIdx = idxOf(base[1]);
        const suffix = base[2];
        for (let i = highIdx + 1; i <= lowIdx; i++) {
          setFreq(`${base[0]}${rankOrder[i]}${suffix}`, freq);
        }
      }
    } else {
      setFreq(expr, freq);
    }
  }
  return map;
}

// --- 6-Max 100BB GTO RFI (Raise First In) Charts ---
const RFI_RANGES: Record<GtoPosition, Map<string, number>> = {
  // ~17% UTG opening range
  UTG: parseRangeSpec(
    'AA-66,55:0.55,AKs-A9s,A8s:0.45,A5s-A4s:0.85,A3s:0.45,KQs-KTs,K9s:0.5,QJs-QTs,JTs,J9s:0.45,T9s,98s:0.8,87s:0.55,76s:0.45,AKo-AJo,ATo:0.55,KQo,KJo:0.4'
  ),
  // ~22% HJ opening range
  HJ: parseRangeSpec(
    'AA-55,44:0.5,AKs-A2s,KQs-K9s,K8s:0.45,QJs-Q9s,JTs-J9s,T9s,T8s:0.45,98s,87s,76s,65s:0.65,54s:0.45,AKo-ATo,KQo-KJo,QJo:0.6'
  ),
  // ~29% CO opening range
  CO: parseRangeSpec(
    'AA-22,AKs-A2s,KQs-K6s,K5s:0.65,QJs-Q8s,JTs-J8s,T9s-T8s,98s-97s,87s-86s,76s-75s,65s,54s,AKo-A9o,A8o:0.45,KQo-KTo,QJo-QTo,JTo'
  ),
  // ~45% BTN opening range
  BTN: parseRangeSpec(
    'AA-22,AKs-A2s,KQs-K2s,QJs-Q4s,Q3s:0.5,JTs-J6s,T9s-T6s,98s-96s,87s-85s,76s-75s,65s-64s,54s-53s,43s:0.65,AKo-A5o,A4o-A2o:0.6,KQo-K8o,K7o:0.4,QJo-Q9o,JTo-J9o,T9o,98o:0.55'
  ),
  // ~42% SB open / steal range
  SB: parseRangeSpec(
    'AA-22,AKs-A2s,KQs-K2s,QJs-Q5s,JTs-J7s,T9s-T7s,98s-96s,87s-86s,76s-75s,65s,54s,AKo-A7o,A6o-A2o:0.45,KQo-K9o,QJo-Q9o,JTo-J9o,T9o'
  ),
  // BB facing limp (iso-raise range)
  BB: parseRangeSpec(
    'AA-77,AKs-A8s,A5s-A4s,KQs-KTs,QJs-QTs,JTs,T9s,98s:0.6,AKo-ATo,KQo-KJo,QJo:0.6'
  ),
};

// Heads-up BTN/SB ~78% GTO open range
const HU_BTN_RFI = parseRangeSpec(
  'AA-22,AKs-A2s,KQs-K2s,QJs-Q2s,JTs-J3s,T9s-T4s,98s-95s,87s-85s,76s-74s,65s-64s,54s-53s,43s,AKo-A2o,KQo-K5o,QJo-Q7o,JTo-J7o,T9o-T7o,98o-97o,87o,76o,65o:0.6'
);

// --- vs RFI (Facing 1 Open Raise): 3-Bet & Call ranges ---
const VS_RFI_3BET_IP = parseRangeSpec(
  'AA-JJ,TT:0.55,AKs-AJs,ATs:0.45,A5s-A4s:0.75,KQs,KJs:0.55,KTs:0.35,QJs:0.5,JTs:0.4,T9s:0.3,76s:0.35,65s:0.35,AKo-AQo,AJo:0.35,KQo:0.45'
);
const VS_RFI_CALL_IP = parseRangeSpec(
  'JJ:0.2,TT-44,33-22:0.55,AQs:0.25,AJs-A8s,A7s-A2s:0.45,KQs:0.35,KJs-K9s,QJs-Q9s,JTs-J9s,T9s-T8s,98s,87s,76s,65s,54s:0.6,AQo:0.4,AJo-ATo,KQo:0.55,KJo:0.65,QJo:0.5'
);

// BB Defense vs Open Raise (wide call + polarized 3-bet because BB closes action with pot odds)
const BB_VS_RFI_3BET = parseRangeSpec(
  'AA-TT,99:0.4,AKs-AJs,ATs:0.45,A5s-A2s:0.55,KQs-KJs,K9s:0.35,K5s-K4s:0.3,QJs:0.55,Q9s:0.3,JTs:0.45,T8s:0.3,76s:0.4,65s:0.45,54s:0.45,AKo-AQo,AJo:0.4,KQo:0.55'
);
const BB_VS_RFI_CALL = parseRangeSpec(
  'TT:0.25,99-22,AJs:0.25,ATs-A2s,KQs:0.25,KJs-K2s,QJs-Q4s,JTs-J6s,T9s-T6s,98s-96s,87s-85s,76s-75s,65s-64s,54s-53s,43s,AQo:0.3,AJo-A7o,A6o-A2o:0.5,KQo-K9o,K8o:0.45,QJo-Q9o,JTo-J9o,T9o,98o:0.6'
);

// SB vs Open Raise (3-bet or fold heavy, tight cold-call to avoid squeeze)
const SB_VS_RFI_3BET = parseRangeSpec(
  'AA-99,88:0.45,AKs-ATs,A5s-A4s:0.7,KQs-KTs,QJs-QTs,JTs,T9s:0.55,98s:0.45,76s:0.35,AKo-AJo,KQo:0.75'
);
const SB_VS_RFI_CALL = parseRangeSpec(
  '88-55:0.5,AJs:0.2,ATs:0.3,KJs:0.3,QJs:0.3,JTs:0.3,T9s:0.3,98s:0.3,AQo:0.25,KQo:0.2'
);

// --- vs 3-Bet (Facing 2 Raises): 4-Bet & Call ranges ---
const VS_3BET_4BET = parseRangeSpec(
  'AA-QQ,JJ:0.35,AKs,AQs:0.35,A5s:0.65,A4s:0.5,KQs:0.3,AKo:0.75,AQo:0.25'
);
const VS_3BET_CALL = parseRangeSpec(
  'QQ:0.25,JJ-77,66:0.55,55:0.35,AKs:0.2,AQs-ATs,A5s:0.25,KQs-KJs,KTs:0.55,QJs-QTs,JTs,T9s,98s:0.65,87s:0.5,76s:0.45,AKo:0.25,AQo:0.55,KQo:0.4'
);

// --- vs 4-Bet+ / All-in Jam ---
const VS_4BET_JAM = parseRangeSpec('AA-KK,QQ:0.85,JJ:0.35,AKs:0.9,AKo:0.55');
const VS_4BET_CALL = parseRangeSpec('QQ:0.15,JJ:0.55,TT:0.55,99:0.25,AKs:0.1,AQs:0.55,AKo:0.35,KQs:0.25');

// --- Short-Stack Nash Push Tiers (ordered approx by Sklansky-Chubukov / Nash HU+6max) ---
const NASH_PUSH_15BB = parseRangeSpec(
  'AA-22,AKs-A2s,KQs-K5s,QJs-Q8s,JTs-J8s,T9s-T8s,98s,87s,76s,65s,AKo-A5o,KQo-K9o,QJo-QTo,JTo'
);
const NASH_PUSH_9BB = parseRangeSpec(
  'AA-22,AKs-A2s,KQs-K2s,QJs-Q4s,JTs-J6s,T9s-T7s,98s-97s,87s,76s,65s,54s,AKo-A2o,KQo-K7o,QJo-Q9o,JTo-J9o,T9o'
);
const NASH_CALL_SHOVE_12BB = parseRangeSpec(
  'AA-55,44:0.5,AKs-A7s,A5s:0.6,KQs-KTs,QJs,AKo-A9o,KQo-KJo'
);

/**
 * Looks up GTO preflop mixed-strategy frequencies (raise / call / fold) for any 169 hand,
 * accounting for position, facing raise depth (RFI / vs-RFI / vs-3bet / vs-4bet),
 * bet sizing pressure, and short-stack Nash push/fold equilibrium.
 */
export function getGtoPreflopMix(params: {
  holeCards: Card[];
  position: GtoPosition;
  facingRaises: number; // 0 = unopened (RFI), 1 = facing open, 2 = facing 3-bet, 3+ = facing 4-bet/jam
  facingBetBB: number;
  effectiveStackBB: number;
  isHeadsUp: boolean;
  canCheck: boolean;
}): PreflopActionMix {
  const key = toCanonicalHandKey(params.holeCards);
  const { position, facingRaises, facingBetBB, effectiveStackBB, isHeadsUp, canCheck } = params;

  // 1. Short-stack Nash push/fold regime (effective stack <= 15 BB)
  if (effectiveStackBB <= 15) {
    if (facingRaises === 0) {
      const shoveRange = effectiveStackBB <= 9 ? NASH_PUSH_9BB : NASH_PUSH_15BB;
      const baseShove = shoveRange.get(key) ?? 0;
      const posScale =
        position === 'BTN' || position === 'SB' || isHeadsUp
          ? 1.15
          : position === 'CO'
            ? 0.95
            : position === 'HJ'
              ? 0.72
              : 0.55;
      const raise = Math.min(1, baseShove * posScale);
      const call = canCheck ? 1 - raise : 0;
      return { raise, call, fold: Math.max(0, 1 - raise - call) };
    }
    if (facingBetBB >= effectiveStackBB * 0.55) {
      // Facing a shove/commit while short-stacked
      const callFreq = NASH_CALL_SHOVE_12BB.get(key) ?? 0;
      const loosenForTinyStack = effectiveStackBB <= 6 ? 0.18 : 0;
      const call = Math.min(1, callFreq > 0 ? callFreq + loosenForTinyStack : loosenForTinyStack * 0.4);
      return { raise: 0, call, fold: Math.max(0, 1 - call) };
    }
  }

  // 2. Unopened pot (RFI)
  if (facingRaises === 0) {
    const rfiMap = isHeadsUp && position === 'SB' ? HU_BTN_RFI : RFI_RANGES[position];
    const raise = rfiMap.get(key) ?? 0;
    if (canCheck) {
      // BB facing limp: check everything not iso-raised
      return { raise, call: Math.max(0, 1 - raise), fold: 0 };
    }
    // SB/HU can occasionally complete with marginal suited connectors / low Ax
    const limpFreq =
      (position === 'SB' || isHeadsUp) && raise === 0 && (key.endsWith('s') || key.startsWith('A'))
        ? 0.25
        : 0;
    const fold = Math.max(0, 1 - raise - limpFreq);
    return { raise, call: limpFreq, fold };
  }

  // 3. Facing Open Raise (1 raise)
  if (facingRaises === 1) {
    // Huge open (e.g. > 12 BB or shove) tightens response toward vs-4bet/shove range
    if (facingBetBB >= 14) {
      const jam = VS_4BET_JAM.get(key) ?? 0;
      const call = Math.min(1 - jam, VS_4BET_CALL.get(key) ?? 0);
      return { raise: jam, call, fold: Math.max(0, 1 - jam - call) };
    }

    const sizeTighten = facingBetBB > 4.5 ? Math.max(0.55, 1 - (facingBetBB - 4.5) * 0.05) : 1.0;
    const isBB = position === 'BB';
    const isSB = position === 'SB';

    const threeBetMap = isBB ? BB_VS_RFI_3BET : isSB ? SB_VS_RFI_3BET : VS_RFI_3BET_IP;
    const callMap = isBB ? BB_VS_RFI_CALL : isSB ? SB_VS_RFI_CALL : VS_RFI_CALL_IP;

    const posTighten = position === 'UTG' || position === 'HJ' ? 0.78 : position === 'CO' ? 0.9 : 1.0;
    const rawRaise = (threeBetMap.get(key) ?? 0) * (isBB || isSB ? 1.0 : posTighten);
    const rawCall = (callMap.get(key) ?? 0) * sizeTighten * (isBB ? 1.0 : posTighten);

    const raise = Math.min(1, rawRaise);
    const call = Math.min(1 - raise, rawCall);
    return { raise, call, fold: Math.max(0, 1 - raise - call) };
  }

  // 4. Facing 3-Bet (2 raises)
  if (facingRaises === 2) {
    if (facingBetBB >= 30) {
      const jam = VS_4BET_JAM.get(key) ?? 0;
      const call = Math.min(1 - jam, VS_4BET_CALL.get(key) ?? 0);
      return { raise: jam, call, fold: Math.max(0, 1 - jam - call) };
    }
    const raise = VS_3BET_4BET.get(key) ?? 0;
    const ipBonus = position === 'BTN' || position === 'CO' ? 1.08 : 0.92;
    const call = Math.min(1 - raise, (VS_3BET_CALL.get(key) ?? 0) * ipBonus);
    return { raise, call, fold: Math.max(0, 1 - raise - call) };
  }

  // 5. Facing 4-Bet+ or Preflop All-In Jam
  const raise = VS_4BET_JAM.get(key) ?? 0;
  const call = Math.min(1 - raise, VS_4BET_CALL.get(key) ?? 0);
  return { raise, call, fold: Math.max(0, 1 - raise - call) };
}

// ============================================================================
// GTO Mathematical Helpers: MDF, Optimal Bluff Ratio, Geometric Bet Sizing
// ============================================================================

/**
 * Minimum Defense Frequency (MDF) = Pot / (Pot + BetToCall).
 * Defending below MDF makes opponent's pure bluffs automatically +EV.
 */
export function computeMdf(potBeforeBet: number, betAmount: number): number {
  if (betAmount <= 0) return 1;
  const safePot = Math.max(1, potBeforeBet);
  return safePot / (safePot + betAmount);
}

/**
 * GTO River Polarized Bluff-to-Total-Betting Ratio: alpha = Bet / (Pot + 2 * Bet).
 * Ensures villain's bluff-catchers are indifferent between calling and folding.
 */
export function computeOptimalBluffRatio(betAmount: number, potBeforeBet: number): number {
  if (betAmount <= 0) return 0;
  const safePot = Math.max(1, potBeforeBet);
  return betAmount / (safePot + 2 * betAmount);
}

/**
 * GTO Geometric Bet Sizing fraction across remaining streets so effective stack
 * goes in evenly by the river: ((Pot + 2*Stack)/Pot)^(1/streets) - 1) / 2.
 */
export function computeGeometricBetFraction(
  pot: number,
  effectiveStack: number,
  streetsRemaining: number
): number {
  const safePot = Math.max(1, pot);
  const safeStack = Math.max(0, effectiveStack);
  const streets = Math.max(1, Math.min(3, Math.floor(streetsRemaining)));
  if (safeStack <= 0) return 0;
  const growth = Math.pow((safePot + 2 * safeStack) / safePot, 1 / streets);
  const fraction = (growth - 1) / 2;
  return Math.max(0.25, Math.min(2.0, fraction));
}

// ============================================================================
// Board Texture & Blocker Analyzer
// ============================================================================

export function analyzeBoardTexture(board: Card[]): BoardTexture {
  if (board.length === 0) {
    return {
      highRank: 2,
      isPaired: false,
      isDoublePaired: false,
      hasBoardTrips: false,
      isMonotone: false,
      isTwoTone: false,
      isRainbow: true,
      flushSuit: null,
      maxSuitCount: 0,
      connectedness: 0,
      wetness: 0,
      isDryHighBoard: false,
    };
  }

  const ranks = board.map((c) => Number(c.rank));
  const highRank = Math.max(...ranks);

  const rankCounts = new Map<number, number>();
  const suitCounts = new Map<Suit, number>();
  for (const c of board) {
    const r = Number(c.rank);
    rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
    suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1);
  }

  let pairCount = 0;
  let hasBoardTrips = false;
  for (const cnt of rankCounts.values()) {
    if (cnt >= 3) hasBoardTrips = true;
    if (cnt >= 2) pairCount++;
  }
  const isPaired = pairCount >= 1;
  const isDoublePaired = pairCount >= 2;

  let maxSuitCount = 0;
  let flushSuit: Suit | null = null;
  for (const [suit, cnt] of suitCounts.entries()) {
    if (cnt > maxSuitCount) {
      maxSuitCount = cnt;
      flushSuit = suit;
    }
  }
  const isMonotone = maxSuitCount >= 3;
  const isTwoTone = maxSuitCount === 2;
  const isRainbow = maxSuitCount <= 1;

  // Connectedness: count pairs of distinct board ranks within distance <= 3
  const uniqRanks = Array.from(new Set(ranks)).sort((a, b) => a - b);
  let closePairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < uniqRanks.length; i++) {
    for (let j = i + 1; j < uniqRanks.length; j++) {
      totalPairs++;
      const diff = uniqRanks[j] - uniqRanks[i];
      if (diff <= 2) closePairs += 1;
      else if (diff === 3) closePairs += 0.5;
    }
  }
  // Account for A-low wheel connectivity
  if (uniqRanks.includes(14) && uniqRanks.some((r) => r <= 5)) {
    closePairs += 0.6;
  }
  const connectedness = totalPairs > 0 ? Math.min(1, closePairs / Math.max(2, totalPairs)) : 0;

  const flushWetness = maxSuitCount >= 4 ? 0.55 : isMonotone ? 0.42 : isTwoTone ? 0.2 : 0;
  const straightWetness = connectedness * 0.48;
  const pairDryness = isPaired ? -0.14 : 0;
  const wetness = Math.max(0, Math.min(1, flushWetness + straightWetness + pairDryness));
  const isDryHighBoard = highRank >= 13 && wetness <= 0.32 && !isMonotone;

  return {
    highRank,
    isPaired,
    isDoublePaired,
    hasBoardTrips,
    isMonotone,
    isTwoTone,
    isRainbow,
    flushSuit: maxSuitCount >= 3 ? flushSuit : null,
    maxSuitCount,
    connectedness,
    wetness,
    isDryHighBoard,
  };
}

/**
 * Evaluates GTO blocker relevance for bluffing / hero-calling spots.
 */
export function evaluateBlockers(
  holeCards: Card[],
  board: Card[],
  texture: BoardTexture
): BlockerProfile {
  let hasNutFlushBlocker = false;
  let hasSecondNutFlushBlocker = false;
  let hasTopCardBlocker = false;
  let hasStraightBlocker = false;

  if (texture.flushSuit) {
    const boardHasAceOfSuit = board.some(
      (c) => c.suit === texture.flushSuit && Number(c.rank) === 14
    );
    const boardHasKingOfSuit = board.some(
      (c) => c.suit === texture.flushSuit && Number(c.rank) === 13
    );
    for (const h of holeCards) {
      if (h.suit === texture.flushSuit) {
        const r = Number(h.rank);
        if (r === 14 || (boardHasAceOfSuit && r === 13)) {
          hasNutFlushBlocker = true;
        } else if (r === 13 || (boardHasAceOfSuit && boardHasKingOfSuit && r === 12)) {
          hasSecondNutFlushBlocker = true;
        }
      }
    }
  }

  for (const h of holeCards) {
    const r = Number(h.rank);
    if (r === texture.highRank || r === 14) {
      hasTopCardBlocker = true;
    }
    // Check if hole card sits in the middle of a connected board cluster
    const neighbors = board.filter((b) => {
      const diff = Math.abs(Number(b.rank) - r);
      return diff >= 1 && diff <= 2;
    }).length;
    if (neighbors >= 2 && texture.connectedness >= 0.4) {
      hasStraightBlocker = true;
    }
  }

  let bluffScore = 0.1;
  if (hasNutFlushBlocker) bluffScore += 0.55;
  else if (hasSecondNutFlushBlocker) bluffScore += 0.25;
  if (hasStraightBlocker) bluffScore += 0.22;
  if (hasTopCardBlocker) bluffScore += 0.15;

  return {
    hasNutFlushBlocker,
    hasSecondNutFlushBlocker,
    hasStraightBlocker,
    hasTopCardBlocker,
    bluffScore: Math.min(1, bluffScore),
  };
}

// ============================================================================
// Ultra-Fast Zero-Allocation 7-Card Integer Evaluator + Monte Carlo Equity
// ============================================================================

const WHEEL_MASK = (1 << 12) | (1 << 3) | (1 << 2) | (1 << 1) | 1; // A-5-4-3-2

function highestStraightBit(mask: number): number {
  // Returns high rank index 4..12 (representing 6..A) or 3 (representing 5-high wheel), or -1
  for (let top = 12; top >= 4; top--) {
    const pattern = 0x1f << (top - 4);
    if ((mask & pattern) === pattern) {
      return top;
    }
  }
  if ((mask & WHEEL_MASK) === WHEEL_MASK) {
    return 3; // 5-high wheel (rank 5 -> index 3)
  }
  return -1;
}

function topKFromMask(mask: number, k: number): number {
  let packed = 0;
  let picked = 0;
  for (let r = 12; r >= 0 && picked < k; r--) {
    if (mask & (1 << r)) {
      packed = (packed << 4) | (r + 2);
      picked++;
    }
  }
  while (picked < k) {
    packed = packed << 4;
    picked++;
  }
  return packed;
}

/**
 * Encodes a Card into integer 0..51: suit * 13 + (rank - 2).
 */
export function encodeCardInt(card: Card): number {
  return SUIT_INDEX[card.suit] * 13 + (Number(card.rank) - 2);
}

// Reusable scratch buffers for zero-GC Monte Carlo simulation
const SCRATCH_RANK_COUNTS = new Int32Array(13);
const SCRATCH_SUIT_MASKS = new Int32Array(4);
const SCRATCH_SUIT_COUNTS = new Int32Array(4);

/**
 * Evaluates exact 5-to-7-card Texas Hold'em hand rank in O(1) without enumerating 21 combinations.
 * Strictly order-preserving with official Texas Hold'em rules (including A-2-3-4-5 wheel).
 */
export function evaluateCardsFast(cardInts: Int32Array | number[], count: number): number {
  SCRATCH_RANK_COUNTS.fill(0);
  SCRATCH_SUIT_MASKS.fill(0);
  SCRATCH_SUIT_COUNTS.fill(0);

  let allRankMask = 0;
  for (let i = 0; i < count; i++) {
    const id = cardInts[i];
    const suit = (id / 13) | 0;
    const r = id - suit * 13; // 0..12 (2..A)
    const bit = 1 << r;
    SCRATCH_RANK_COUNTS[r]++;
    SCRATCH_SUIT_MASKS[suit] |= bit;
    SCRATCH_SUIT_COUNTS[suit]++;
    allRankMask |= bit;
  }

  // 1. Check Flush & Straight Flush
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) {
    if (SCRATCH_SUIT_COUNTS[s] >= 5) {
      flushSuit = s;
      break;
    }
  }
  if (flushSuit !== -1) {
    const sfHigh = highestStraightBit(SCRATCH_SUIT_MASKS[flushSuit]);
    if (sfHigh !== -1) {
      const cat = sfHigh === 12 ? 9 : 8;
      return (cat << 20) | ((sfHigh + 2) << 16);
    }
  }

  // 2. Scan rank multiplicities from Ace (12) down to Deuce (0)
  let quad = -1;
  let trip1 = -1;
  let trip2 = -1;
  let pair1 = -1;
  let pair2 = -1;

  for (let r = 12; r >= 0; r--) {
    const c = SCRATCH_RANK_COUNTS[r];
    if (c === 4) {
      quad = r;
    } else if (c === 3) {
      if (trip1 === -1) trip1 = r;
      else if (trip2 === -1) trip2 = r;
    } else if (c === 2) {
      if (pair1 === -1) pair1 = r;
      else if (pair2 === -1) pair2 = r;
    }
  }

  // 3. Four of a Kind
  if (quad !== -1) {
    const kickerMask = allRankMask & ~(1 << quad);
    const kicker = topKFromMask(kickerMask, 1);
    return (7 << 20) | ((quad + 2) << 16) | (kicker << 12);
  }

  // 4. Full House
  if (trip1 !== -1 && (trip2 !== -1 || pair1 !== -1)) {
    const fhPair = trip2 !== -1 ? Math.max(trip2, pair1) : pair1;
    return (6 << 20) | ((trip1 + 2) << 16) | ((fhPair + 2) << 12);
  }

  // 5. Flush
  if (flushSuit !== -1) {
    return (5 << 20) | topKFromMask(SCRATCH_SUIT_MASKS[flushSuit], 5);
  }

  // 6. Straight
  const stHigh = highestStraightBit(allRankMask);
  if (stHigh !== -1) {
    return (4 << 20) | ((stHigh + 2) << 16);
  }

  // 7. Three of a Kind
  if (trip1 !== -1) {
    const kickers = topKFromMask(allRankMask & ~(1 << trip1), 2);
    return (3 << 20) | ((trip1 + 2) << 16) | (kickers << 8);
  }

  // 8. Two Pair
  if (pair1 !== -1 && pair2 !== -1) {
    const kicker = topKFromMask(allRankMask & ~((1 << pair1) | (1 << pair2)), 1);
    return (2 << 20) | ((pair1 + 2) << 16) | ((pair2 + 2) << 12) | (kicker << 8);
  }

  // 9. One Pair
  if (pair1 !== -1) {
    const kickers = topKFromMask(allRankMask & ~(1 << pair1), 3);
    return (1 << 20) | ((pair1 + 2) << 16) | (kickers << 4);
  }

  // 10. High Card
  return topKFromMask(allRankMask, 5);
}

/**
 * Fast Monte Carlo postflop equity simulator against N opponents.
 * Runs 160 rollouts in < 2ms using zero-allocation integer evaluation.
 * Supports optional range bias (stronger villain range when facing aggressive bets).
 */
export function estimatePostflopEquity(params: {
  holeCards: Card[];
  board: Card[];
  opponentCount: number;
  villainTightness?: number; // 0 = random hand, 0.35 = reasonable defending range, 0.65 = strong value/betting range
  iterations?: number;
  rng?: () => number;
}): number {
  const { holeCards, board } = params;
  if (holeCards.length < 2 || board.length < 3) return 0.5;

  const opponents = Math.max(1, Math.min(5, params.opponentCount));
  const iterations = Math.max(40, Math.min(400, params.iterations ?? 160));
  const villainTightness = Math.max(0, Math.min(0.85, params.villainTightness ?? 0.25));
  const rng = params.rng ?? Math.random;

  const dead = new Uint8Array(52);
  const heroHand = new Int32Array(7);
  const oppHand = new Int32Array(7);

  heroHand[0] = encodeCardInt(holeCards[0]);
  heroHand[1] = encodeCardInt(holeCards[1]);
  dead[heroHand[0]] = 1;
  dead[heroHand[1]] = 1;

  for (let i = 0; i < board.length; i++) {
    const cInt = encodeCardInt(board[i]);
    heroHand[2 + i] = cInt;
    dead[cInt] = 1;
  }

  const remainingDeck = new Int32Array(52 - 2 - board.length);
  let remLen = 0;
  for (let id = 0; id < 52; id++) {
    if (!dead[id]) {
      remainingDeck[remLen++] = id;
    }
  }

  const runoutNeeded = 5 - board.length;
  const neededCards = runoutNeeded + opponents * 2;
  if (remLen < neededCards) return 0.5;

  let equitySum = 0;
  let totalWeight = 0;

  for (let iter = 0; iter < iterations; iter++) {
    // Partial Fisher-Yates shuffle for only the cards needed in this rollout
    for (let k = 0; k < neededCards; k++) {
      const j = k + Math.floor(rng() * (remLen - k));
      const tmp = remainingDeck[k];
      remainingDeck[k] = remainingDeck[j];
      remainingDeck[j] = tmp;
    }

    for (let r = 0; r < runoutNeeded; r++) {
      heroHand[2 + board.length + r] = remainingDeck[r];
    }
    const heroScore = evaluateCardsFast(heroHand, 7);

    // Copy board into oppHand[2..6]
    for (let b = 0; b < 5; b++) {
      oppHand[2 + b] = heroHand[2 + b];
    }

    let bestOppScore = -1;
    let oppQualityWeight = 1;

    for (let o = 0; o < opponents; o++) {
      const c1 = remainingDeck[runoutNeeded + o * 2];
      const c2 = remainingDeck[runoutNeeded + o * 2 + 1];
      oppHand[0] = c1;
      oppHand[1] = c2;
      const oScore = evaluateCardsFast(oppHand, 7);
      if (oScore > bestOppScore) {
        bestOppScore = oScore;
      }

      // Range weighting: when villain has shown aggression, down-weight total air combos
      if (villainTightness > 0) {
        const oCat = oScore >> 20;
        const r1 = c1 % 13;
        const r2 = c2 % 13;
        const highCards = (r1 >= 9 ? 1 : 0) + (r2 >= 9 ? 1 : 0);
        const isPairOrSuited = r1 === r2 || ((c1 / 13) | 0) === ((c2 / 13) | 0);
        if (oCat === 0 && highCards === 0 && !isPairOrSuited) {
          oppQualityWeight *= 1 - villainTightness * 0.72;
        } else if (oCat >= 2) {
          oppQualityWeight *= 1 + villainTightness * 0.55;
        }
      }
    }

    totalWeight += oppQualityWeight;
    if (heroScore > bestOppScore) {
      equitySum += oppQualityWeight;
    } else if (heroScore === bestOppScore) {
      equitySum += oppQualityWeight * 0.5;
    }
  }

  return totalWeight > 0 ? equitySum / totalWeight : 0.5;
}
