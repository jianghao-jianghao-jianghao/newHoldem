import type { Card, HandCategory, HandEvaluation, Rank } from './types';

export const HAND_CATEGORY_NAMES: Record<HandCategory, string> = {
  0: '高牌',
  1: '一对',
  2: '两对',
  3: '三条',
  4: '顺子',
  5: '同花',
  6: '葫芦',
  7: '四条',
  8: '同花顺',
  9: '皇家同花顺',
};

const RANK_LABELS: Record<Rank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

export function formatRank(rank: Rank): string {
  return RANK_LABELS[rank];
}

function encodeScore(category: HandCategory, tiebreakers: number[]): number {
  // Base-15 positional encoding so any category + up to 5 ranks fits safely in JS safe integer
  // Max value: 9 * 15^5 + 14 * 15^4 + ... < 8,000,000 (well under Number.MAX_SAFE_INTEGER)
  let score = category * Math.pow(15, 5);
  for (let i = 0; i < 5; i++) {
    const val = tiebreakers[i] ?? 0;
    score += val * Math.pow(15, 4 - i);
  }
  return score;
}

function evaluateFiveCards(cards: Card[]): HandEvaluation {
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map((c) => c.rank);

  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);

  // Check straight (including A-2-3-4-5 wheel)
  let isStraight = false;
  let straightHigh = 0;
  const uniqueRanks = Array.from(new Set(ranks));
  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      isStraight = true;
      straightHigh = uniqueRanks[0];
    } else if (
      uniqueRanks[0] === 14 &&
      uniqueRanks[1] === 5 &&
      uniqueRanks[2] === 4 &&
      uniqueRanks[3] === 3 &&
      uniqueRanks[4] === 2
    ) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  // Count rank frequencies
  const counts = new Map<Rank, number>();
  for (const r of ranks) {
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }

  const groups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]; // Higher count first
    return b[0] - a[0]; // Higher rank first
  });

  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return {
        category: 9,
        categoryName: HAND_CATEGORY_NAMES[9],
        score: encodeScore(9, [14]),
        bestCards: sorted,
      };
    }
    return {
      category: 8,
      categoryName: HAND_CATEGORY_NAMES[8],
      score: encodeScore(8, [straightHigh]),
      bestCards: sorted,
    };
  }

  if (groups[0][1] === 4) {
    const quad = groups[0][0];
    const kicker = groups[1][0];
    return {
      category: 7,
      categoryName: HAND_CATEGORY_NAMES[7],
      score: encodeScore(7, [quad, kicker]),
      bestCards: sorted,
    };
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    const trips = groups[0][0];
    const pair = groups[1][0];
    return {
      category: 6,
      categoryName: HAND_CATEGORY_NAMES[6],
      score: encodeScore(6, [trips, pair]),
      bestCards: sorted,
    };
  }

  if (isFlush) {
    return {
      category: 5,
      categoryName: HAND_CATEGORY_NAMES[5],
      score: encodeScore(5, ranks),
      bestCards: sorted,
    };
  }

  if (isStraight) {
    return {
      category: 4,
      categoryName: HAND_CATEGORY_NAMES[4],
      score: encodeScore(4, [straightHigh]),
      bestCards: sorted,
    };
  }

  if (groups[0][1] === 3) {
    const trips = groups[0][0];
    const kickers = groups.slice(1).map((g) => g[0]);
    return {
      category: 3,
      categoryName: HAND_CATEGORY_NAMES[3],
      score: encodeScore(3, [trips, ...kickers]),
      bestCards: sorted,
    };
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const highPair = groups[0][0];
    const lowPair = groups[1][0];
    const kicker = groups[2][0];
    return {
      category: 2,
      categoryName: HAND_CATEGORY_NAMES[2],
      score: encodeScore(2, [highPair, lowPair, kicker]),
      bestCards: sorted,
    };
  }

  if (groups[0][1] === 2) {
    const pair = groups[0][0];
    const kickers = groups.slice(1).map((g) => g[0]);
    return {
      category: 1,
      categoryName: HAND_CATEGORY_NAMES[1],
      score: encodeScore(1, [pair, ...kickers]),
      bestCards: sorted,
    };
  }

  return {
    category: 0,
    categoryName: HAND_CATEGORY_NAMES[0],
    score: encodeScore(0, ranks),
    bestCards: sorted,
  };
}

/**
 * Evaluates the best 5-card Texas Hold'em hand from 5 to 7 cards.
 */
export function evaluateBestHand(cards: Card[]): HandEvaluation {
  if (cards.length < 5) {
    // Pre-flop or incomplete hand helper: evaluate pair/high-card among available cards
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    if (sorted.length === 2 && sorted[0].rank === sorted[1].rank) {
      return {
        category: 1,
        categoryName: `一对 ${formatRank(sorted[0].rank)}`,
        score: encodeScore(1, [sorted[0].rank]),
        bestCards: sorted,
      };
    }
    return {
      category: 0,
      categoryName: sorted.length > 0 ? `高牌 ${formatRank(sorted[0].rank)}` : '高牌',
      score: encodeScore(0, sorted.map((c) => c.rank)),
      bestCards: sorted,
    };
  }

  if (cards.length === 5) {
    return evaluateFiveCards(cards);
  }

  let best: HandEvaluation | null = null;
  const n = cards.length;
  for (let i = 0; i < n - 4; i++) {
    for (let j = i + 1; j < n - 3; j++) {
      for (let k = j + 1; k < n - 2; k++) {
        for (let l = k + 1; l < n - 1; l++) {
          for (let m = l + 1; m < n; m++) {
            const candidate = evaluateFiveCards([
              cards[i],
              cards[j],
              cards[k],
              cards[l],
              cards[m],
            ]);
            if (!best || candidate.score > best.score) {
              best = candidate;
            }
          }
        }
      }
    }
  }

  return best!;
}
