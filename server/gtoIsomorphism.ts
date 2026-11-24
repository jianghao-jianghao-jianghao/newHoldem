import type { Card, Rank, Suit } from '../src/shared/types';
import type { RangeMatrixCell, RangeMatrixMix } from '../src/shared/gtoWorkbench';

const CANONICAL_SUIT_ORDER: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_TO_CHAR: Record<Suit, string> = {
  spades: 's',
  hearts: 'h',
  diamonds: 'd',
  clubs: 'c',
};
const RANK_TO_CHAR: Record<number, string> = {
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
const SAFE_CARD_TOKEN_RE = /^[2-9TJQKA][shdc]$/;

export interface CanonicalIsomorphismResult {
  canonicalBoard: Card[];
  canonicalHoleCards: Card[];
  canonicalBoardKey: string;
  suitMap: Record<Suit, Suit>;
  inverseSuitMap: Record<Suit, Suit>;
}

/**
 * Suit Isomorphism Canonicalizer (reduces 22,100 flops -> 1,755 canonical flops).
 * Sorts board cards by rank descending, maps first-seen suit -> spades (s),
 * second -> hearts (h), third -> diamonds (d), fourth -> clubs (c), and applies
 * the exact same permutation to Hero hole cards.
 */
export function canonicalizeSuitIsomorphism(
  board: Card[],
  holeCards: Card[]
): CanonicalIsomorphismResult {
  const sortedBoard = [...board].sort((a, b) => Number(b.rank) - Number(a.rank));
  const suitMap = {} as Record<Suit, Suit>;
  const inverseSuitMap = {} as Record<Suit, Suit>;
  let nextIdx = 0;

  const assignSuit = (s: Suit): Suit => {
    if (!suitMap[s]) {
      const mapped = CANONICAL_SUIT_ORDER[nextIdx++];
      suitMap[s] = mapped;
      inverseSuitMap[mapped] = s;
    }
    return suitMap[s];
  };

  for (const card of sortedBoard) assignSuit(card.suit);
  for (const card of holeCards) assignSuit(card.suit);
  for (const s of CANONICAL_SUIT_ORDER) assignSuit(s);

  const canonicalBoard: Card[] = sortedBoard.map((c) => ({
    suit: suitMap[c.suit],
    rank: Number(c.rank) as Rank,
  }));
  const canonicalHoleCards: Card[] = holeCards.map((c) => ({
    suit: suitMap[c.suit],
    rank: Number(c.rank) as Rank,
  }));
  const canonicalBoardKey =
    canonicalBoard.length > 0
      ? canonicalBoard.map((c) => `${RANK_TO_CHAR[Number(c.rank)]}${SUIT_TO_CHAR[c.suit]}`).join('')
      : 'PREFLOP';

  return {
    canonicalBoard,
    canonicalHoleCards,
    canonicalBoardKey,
    suitMap,
    inverseSuitMap,
  };
}

export function bucketSpr(spr: number): string {
  if (spr < 1.5) return 'spr_lt1.5';
  if (spr < 2.5) return 'spr_1.5_2.5';
  if (spr < 4.5) return 'spr_2.5_4.5';
  if (spr < 8) return 'spr_4.5_8';
  return 'spr_8plus';
}

export function bucketPotBB(potBB: number): string {
  if (potBB < 4) return 'pot_small';
  if (potBB < 10) return 'pot_srp';
  if (potBB < 24) return 'pot_3bp';
  return 'pot_4bp_plus';
}

export class LruSolverCache<T> {
  private readonly store = new Map<string, T>();
  private readonly maxSize: number;
  public hits = 0;
  public misses = 0;

  constructor(maxSize = 512) {
    this.maxSize = Math.max(16, maxSize);
  }

  public get(key: string): T | undefined {
    const val = this.store.get(key);
    if (val === undefined) {
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    this.store.delete(key);
    this.store.set(key, val);
    return val;
  }

  public set(key: string, value: T): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, value);
  }

  public get size(): number {
    return this.store.size;
  }

  public clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

export function normalizeMixTo100(mix: RangeMatrixMix): RangeMatrixMix {
  const keys = ['raise', 'call', 'check', 'fold'] as const;
  const cleaned = keys.map((k) => Math.max(0, Number.isFinite(mix[k]) ? mix[k] : 0));
  const total = cleaned.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return { raise: 0, call: 0, check: 100, fold: 0 };
  }
  const scaled = cleaned.map((v) => Math.floor((v / total) * 100));
  const remainder = 100 - scaled.reduce((a, b) => a + b, 0);
  const fracs = cleaned
    .map((v, i) => ({ i, frac: (v / total) * 100 - scaled[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let idx = 0; idx < remainder; idx++) {
    scaled[fracs[idx % fracs.length].i] += 1;
  }
  return {
    raise: scaled[0],
    call: scaled[1],
    check: scaled[2],
    fold: scaled[3],
  };
}

/**
 * Generates a strict whitelist-validated CPU-only `console_solver` script
 * (optional Layer-3 external solver; zero shell interpolation).
 */
export function buildTexasSolverScript(params: {
  potBB: number;
  effectiveStackBB: number;
  canonicalBoard: Card[];
  geometricPct: number;
  outputPath: string;
}): string | null {
  const boardTokens = params.canonicalBoard.map(
    (c) => `${RANK_TO_CHAR[Number(c.rank)]}${SUIT_TO_CHAR[c.suit]}`
  );
  if (boardTokens.length < 3 || !boardTokens.every((t) => SAFE_CARD_TOKEN_RE.test(t))) {
    return null;
  }
  const geo = Math.max(25, Math.min(150, Math.round(params.geometricPct)));
  const safePot = Math.max(1, Math.min(500, Math.round(params.potBB * 10) / 10));
  const safeStack = Math.max(1, Math.min(500, Math.round(params.effectiveStackBB * 10) / 10));

  return [
    `set_pot ${safePot}`,
    `set_effective_stack ${safeStack}`,
    `set_board ${boardTokens.join(',')}`,
    `set_range_ip AA,KK,QQ,JJ,TT,99,88,77,66,55,44,AKs,AQs,AJs,ATs,A9s,A5s,A4s,KQs,KJs,KTs,QJs,QTs,JTs,T9s,98s,87s,AKo,AQo,AJo,KQo`,
    `set_range_oop AA:0.25,KK:0.25,QQ:0.6,JJ,TT,99,88,77,66,55,44,33,22,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,KQs,KJs,KTs,K9s,QJs,QTs,Q9s,JTs,J9s,T9s,98s,87s,76s,65s,AQo,AJo,ATo,KQo,KJo,QJo`,
    `set_bet_sizes oop,flop,bet,33,${geo}`,
    `set_bet_sizes oop,flop,raise,60`,
    `set_bet_sizes ip,flop,bet,33,${geo},125`,
    `set_bet_sizes ip,flop,raise,60`,
    `set_bet_sizes oop,turn,bet,50,100`,
    `set_bet_sizes ip,turn,bet,50,125`,
    `set_bet_sizes oop,river,bet,66,125`,
    `set_bet_sizes ip,river,bet,66,125`,
    `set_allin_threshold 0.67`,
    `build_tree`,
    `set_thread_num 2`,
    `set_accuracy 0.5`,
    `set_max_iteration 160`,
    `set_print_interval 40`,
    `set_use_isomorphism 1`,
    `start_solve`,
    `set_dump_rounds 1`,
    `dump_result ${params.outputPath}`,
  ].join('\n');
}

/**
 * Aggregates concrete external-solver 1326-combo strategy output onto a 169-cell canonical matrix.
 */
export function aggregateConcreteStrategyTo169(
  baseMatrix: RangeMatrixCell[],
  actions: string[],
  concreteStrategy: Record<string, number[]>
): RangeMatrixCell[] {
  const rankIdx: Record<string, number> = {
    A: 14, K: 13, Q: 12, J: 11, T: 10,
    '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
  };
  const bucketMap = new Map<
    string,
    { raise: number; call: number; check: number; fold: number; count: number }
  >();

  for (const [combo, probs] of Object.entries(concreteStrategy)) {
    if (combo.length !== 4 || !Array.isArray(probs)) continue;
    const r1 = rankIdx[combo[0]];
    const s1 = combo[1];
    const r2 = rankIdx[combo[2]];
    const s2 = combo[3];
    if (!r1 || !r2) continue;
    const hi = r1 >= r2 ? combo[0] : combo[2];
    const lo = r1 >= r2 ? combo[2] : combo[0];
    const key = r1 === r2 ? `${hi}${lo}` : `${hi}${lo}${s1 === s2 ? 's' : 'o'}`;

    const entry = bucketMap.get(key) ?? { raise: 0, call: 0, check: 0, fold: 0, count: 0 };
    for (let i = 0; i < actions.length; i++) {
      const p = Number(probs[i]) || 0;
      const act = actions[i].toUpperCase();
      if (act.includes('BET') || act.includes('RAISE') || act.includes('ALLIN')) {
        entry.raise += p;
      } else if (act.includes('CALL')) {
        entry.call += p;
      } else if (act.includes('CHECK')) {
        entry.check += p;
      } else if (act.includes('FOLD')) {
        entry.fold += p;
      }
    }
    entry.count += 1;
    bucketMap.set(key, entry);
  }

  return baseMatrix.map((cell) => {
    const agg = bucketMap.get(cell.hand);
    if (!agg || agg.count === 0) return cell;
    return {
      ...cell,
      mix: normalizeMixTo100({
        raise: (agg.raise / agg.count) * 100,
        call: (agg.call / agg.count) * 100,
        check: (agg.check / agg.count) * 100,
        fold: (agg.fold / agg.count) * 100,
      }),
    };
  });
}
