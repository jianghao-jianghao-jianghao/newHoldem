import type {
  HandReviewHeroDecision,
  HandReviewReport,
  HandReviewSessionContext,
} from './types';

export type SessionKeyHandReason =
  | 'bookmarked'
  | 'biggest_mistake'
  | 'biggest_pot'
  | 'biggest_win'
  | 'biggest_loss';

export const KEY_HAND_REASON_LABELS: Record<SessionKeyHandReason, string> = {
  bookmarked: '已标记',
  biggest_mistake: '核心失误',
  biggest_pot: '最大底池',
  biggest_win: '最大盈利',
  biggest_loss: '最大亏损',
};

export interface SessionPnlPoint {
  handNumber: number;
  netChips: number;
  netBB: number;
  cumulativeChips: number;
  cumulativeBB: number;
  pot: number;
  canonicalHand: string | null;
  heroPosition: string;
  outcome: 'win' | 'loss' | 'split';
  mistakeCount: number;
  inaccuracyCount: number;
  isBookmarked: boolean;
}

export interface SessionKeyHandItem {
  handNumber: number;
  canonicalHand: string | null;
  heroPosition: string;
  heroFinalHandName: string | null;
  pot: number;
  netChips: number;
  netBB: number;
  outcome: 'win' | 'loss' | 'split';
  mistakeCount: number;
  inaccuracyCount: number;
  optimalCount: number;
  isBookmarked: boolean;
  reasons: SessionKeyHandReason[];
  reasonLabels: string[];
  headline: string;
}

export interface SessionReviewSummary {
  totalHands: number;
  handsWon: number;
  winRatePct: number;
  netChips: number;
  netBB: number;
  biggestPot: number;
  bookmarkedCount: number;
  totalDecisions: number;
  optimalDecisions: number;
  acceptableDecisions: number;
  inaccuracyDecisions: number;
  mistakeDecisions: number;
  decisionAccuracyPct: number | null;
  vpipPct: number | null;
  pfrPct: number | null;
  pnlSeries: SessionPnlPoint[];
  keyHands: SessionKeyHandItem[];
  allHands: SessionKeyHandItem[];
  sessionStrengths: string[];
  sessionLeaks: string[];
  sessionProfileContext?: HandReviewSessionContext;
  defaultSelectedHandNumber: number | null;
}

export interface BuildSessionReviewParams {
  reports: HandReviewReport[];
  bookmarkedHandNumbers?: number[];
  vpipPct?: number | null;
  pfrPct?: number | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function collectDecisions(report: HandReviewReport): HandReviewHeroDecision[] {
  const out: HandReviewHeroDecision[] = [];
  for (const st of report.streets) {
    for (const dec of st.heroDecisions) {
      out.push(dec);
    }
  }
  return out;
}

const STREET_LABEL_ZH: Record<'preflop' | 'flop' | 'turn' | 'river', string> = {
  preflop: '翻前',
  flop: '翻牌圈',
  turn: '转牌圈',
  river: '河牌圈',
};

export function buildSessionReviewSummary(
  params: BuildSessionReviewParams
): SessionReviewSummary {
  const sorted = [...params.reports].sort((a, b) => a.handNumber - b.handNumber);
  const bookmarkSet = new Set<number>(
    (params.bookmarkedHandNumbers ?? []).filter((n) => Number.isFinite(n))
  );

  let cumulativeChips = 0;
  let cumulativeBB = 0;
  let handsWon = 0;
  let biggestPot = 0;
  let totalDecisions = 0;
  let optimalDecisions = 0;
  let acceptableDecisions = 0;
  let inaccuracyDecisions = 0;
  let mistakeDecisions = 0;

  const streetMistakeCounts: Record<'preflop' | 'flop' | 'turn' | 'river', number> = {
    preflop: 0,
    flop: 0,
    turn: 0,
    river: 0,
  };
  const teachingTopicCounts = new Map<string, { title: string; count: number; tip: string }>();

  const pnlSeries: SessionPnlPoint[] = [];
  const itemByHand = new Map<number, SessionKeyHandItem>();

  for (const report of sorted) {
    const decisions = collectDecisions(report);
    let handMistakes = 0;
    let handInaccuracies = 0;
    let handOptimals = 0;

    for (const d of decisions) {
      totalDecisions += 1;
      if (d.verdict === 'optimal') {
        optimalDecisions += 1;
        handOptimals += 1;
      } else if (d.verdict === 'acceptable') {
        acceptableDecisions += 1;
      } else if (d.verdict === 'inaccuracy') {
        inaccuracyDecisions += 1;
        handInaccuracies += 1;
      } else {
        mistakeDecisions += 1;
        handMistakes += 1;
        if (
          d.street === 'preflop' ||
          d.street === 'flop' ||
          d.street === 'turn' ||
          d.street === 'river'
        ) {
          streetMistakeCounts[d.street] += 1;
        }
      }
    }

    if (handMistakes > 0 || handInaccuracies > 0) {
      const prevTopic = teachingTopicCounts.get(report.teaching.topic);
      if (prevTopic) {
        prevTopic.count += 1;
      } else {
        teachingTopicCounts.set(report.teaching.topic, {
          title: report.teaching.topic,
          count: 1,
          tip: report.teaching.nextHandDrill,
        });
      }
    }

    if (report.outcome === 'win') handsWon += 1;
    if (report.pot > biggestPot) biggestPot = report.pot;

    cumulativeChips += report.netChips;
    cumulativeBB = round1(cumulativeBB + report.netBB);

    const isBookmarked = bookmarkSet.has(report.handNumber);

    pnlSeries.push({
      handNumber: report.handNumber,
      netChips: report.netChips,
      netBB: report.netBB,
      cumulativeChips,
      cumulativeBB,
      pot: report.pot,
      canonicalHand: report.canonicalHand,
      heroPosition: report.heroPosition,
      outcome: report.outcome,
      mistakeCount: handMistakes,
      inaccuracyCount: handInaccuracies,
      isBookmarked,
    });

    itemByHand.set(report.handNumber, {
      handNumber: report.handNumber,
      canonicalHand: report.canonicalHand,
      heroPosition: report.heroPosition,
      heroFinalHandName: report.heroFinalHandName,
      pot: report.pot,
      netChips: report.netChips,
      netBB: report.netBB,
      outcome: report.outcome,
      mistakeCount: handMistakes,
      inaccuracyCount: handInaccuracies,
      optimalCount: handOptimals,
      isBookmarked,
      reasons: isBookmarked ? ['bookmarked'] : [],
      reasonLabels: isBookmarked ? [KEY_HAND_REASON_LABELS.bookmarked] : [],
      headline: report.headline,
    });
  }

  const allItemsChrono = sorted
    .map((r) => itemByHand.get(r.handNumber)!)
    .filter(Boolean);

  const addReason = (item: SessionKeyHandItem | undefined, reason: SessionKeyHandReason) => {
    if (!item) return;
    if (!item.reasons.includes(reason)) {
      item.reasons.push(reason);
      item.reasonLabels.push(KEY_HAND_REASON_LABELS[reason]);
    }
  };

  // Curate turning-point hands:
  // 1. All user-bookmarked hands (always preserved and ranked first)
  // 2. Highest-mistake hand(s)
  // 3. Biggest pot hand
  // 4. Biggest winning hand (netChips > 0)
  // 5. Biggest losing hand (netChips < 0)
  const autoSelectedOrder: number[] = [];
  const markAuto = (item: SessionKeyHandItem | undefined, reason: SessionKeyHandReason) => {
    if (!item) return;
    addReason(item, reason);
    if (!autoSelectedOrder.includes(item.handNumber)) {
      autoSelectedOrder.push(item.handNumber);
    }
  };

  // 1) Biggest mistake hands (up to 2 distinct hands with mistakes/inaccuracies)
  const mistakeCandidates = [...allItemsChrono]
    .filter((i) => i.mistakeCount > 0 || i.inaccuracyCount > 0)
    .sort((a, b) => {
      const scoreA = a.mistakeCount * 10 + a.inaccuracyCount * 3 + Math.max(0, -a.netBB) * 0.5;
      const scoreB = b.mistakeCount * 10 + b.inaccuracyCount * 3 + Math.max(0, -b.netBB) * 0.5;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.pot - a.pot;
    });
  for (const cand of mistakeCandidates.slice(0, 2)) {
    markAuto(cand, 'biggest_mistake');
  }

  // 2) Biggest pot
  const biggestPotItem = [...allItemsChrono].sort((a, b) => {
    if (b.pot !== a.pot) return b.pot - a.pot;
    return Math.abs(b.netChips) - Math.abs(a.netChips);
  })[0];
  if (biggestPotItem && biggestPotItem.pot > 0) {
    markAuto(biggestPotItem, 'biggest_pot');
  }

  // 3) Biggest win
  const biggestWinItem = [...allItemsChrono]
    .filter((i) => i.netChips > 0)
    .sort((a, b) => b.netChips - a.netChips || b.pot - a.pot)[0];
  if (biggestWinItem) {
    markAuto(biggestWinItem, 'biggest_win');
  }

  // 4) Biggest loss
  const biggestLossItem = [...allItemsChrono]
    .filter((i) => i.netChips < 0)
    .sort((a, b) => a.netChips - b.netChips || b.pot - a.pot)[0];
  if (biggestLossItem) {
    markAuto(biggestLossItem, 'biggest_loss');
  }

  // Combine bookmarked (newest first) + up to 5 auto turning points (deduplicated)
  const bookmarkedHands = allItemsChrono
    .filter((i) => i.isBookmarked)
    .sort((a, b) => b.handNumber - a.handNumber);

  const keyHandNumbers: number[] = [];
  for (const bm of bookmarkedHands) {
    if (!keyHandNumbers.includes(bm.handNumber)) {
      keyHandNumbers.push(bm.handNumber);
    }
  }
  let autoAdded = 0;
  for (const hn of autoSelectedOrder) {
    if (keyHandNumbers.includes(hn)) continue;
    if (autoAdded >= 5) break;
    keyHandNumbers.push(hn);
    autoAdded += 1;
  }

  // Fallback if all hands were flat/0-pot: include latest hand
  if (keyHandNumbers.length === 0 && allItemsChrono.length > 0) {
    keyHandNumbers.push(allItemsChrono[allItemsChrono.length - 1].handNumber);
  }

  const keyHands = keyHandNumbers
    .map((hn) => itemByHand.get(hn)!)
    .filter(Boolean);

  // Reverse chronological for "all hands" browsing (latest hand first)
  const allHands = [...allItemsChrono].reverse();

  const totalHands = sorted.length;
  const winRatePct = totalHands > 0 ? Math.round((handsWon / totalHands) * 100) : 0;
  const decisionAccuracyPct =
    totalDecisions > 0
      ? Math.round(((optimalDecisions + acceptableDecisions) / totalDecisions) * 100)
      : null;

  // Synthesize session strengths & repeated leaks
  const sessionStrengths: string[] = [];
  const sessionLeaks: string[] = [];

  if (decisionAccuracyPct !== null && decisionAccuracyPct >= 75 && totalDecisions >= 3) {
    sessionStrengths.push(
      `本场共记录 ${totalDecisions} 处关键决策，精准/合理占比达 ${decisionAccuracyPct}%，整体执行保持较高纪律性。`
    );
  } else if (optimalDecisions > 0) {
    sessionStrengths.push(
      `本场共打出 ${optimalDecisions} 次精准节点，在优势底池中能够稳健兑现牌力价值。`
    );
  }

  if (cumulativeChips > 0) {
    sessionStrengths.push(
      `本场收官盈利 +${cumulativeChips.toLocaleString()}（+${cumulativeBB} BB），胜率 ${winRatePct}%（${handsWon}/${totalHands} 手）。`
    );
  }

  const foldWinsCount = sorted.filter((r) => r.outcome === 'win' && r.wonByFold).length;
  if (foldWinsCount >= 2) {
    sessionStrengths.push(
      `通过主动施压逼弃赢下 ${foldWinsCount} 个底池，能够有效利用位置与筹码施压拿走无摊牌利润。`
    );
  }

  if (sessionStrengths.length === 0 && totalHands > 0) {
    sessionStrengths.push(
      `完整记录了本场 ${totalHands} 手逐街下注尺度与赔率证据，可用于复盘核对关键转折点。`
    );
  }

  // Leaks: detect repeated street mistakes or repeated teaching topics
  const worstStreet = (Object.entries(streetMistakeCounts) as Array<
    ['preflop' | 'flop' | 'turn' | 'river', number]
  >).sort((a, b) => b[1] - a[1])[0];

  if (worstStreet && worstStreet[1] >= 2) {
    sessionLeaks.push(
      `${STREET_LABEL_ZH[worstStreet[0]]}累计出现 ${worstStreet[1]} 次关键失误，是本场最集中的失分环节，建议优先回看精选失误手牌。`
    );
  } else if (mistakeDecisions > 0) {
    sessionLeaks.push(
      `本场出现 ${mistakeDecisions} 次关键失误${inaccuracyDecisions > 0 ? `与 ${inaccuracyDecisions} 次轻微偏差` : ''}，多集中在边际牌防守与底池赔率评估。`
    );
  }

  const topRepeatedTopic = [...teachingTopicCounts.values()].sort(
    (a, b) => b.count - a.count
  )[0];
  if (topRepeatedTopic && topRepeatedTopic.count >= 2) {
    sessionLeaks.push(
      `高频重复问题「${topRepeatedTopic.title}」（出现 ${topRepeatedTopic.count} 手）：${topRepeatedTopic.tip}`
    );
  } else if (topRepeatedTopic && sessionLeaks.length < 2) {
    sessionLeaks.push(`重点改进方向「${topRepeatedTopic.title}」：${topRepeatedTopic.tip}`);
  }

  if (typeof params.vpipPct === 'number' && totalHands >= 4) {
    if (params.vpipPct > 45) {
      sessionLeaks.push(
        `本场入池率 VPIP 达 ${params.vpipPct}%，偏宽入池容易在前中位频繁陷入被压制的翻后困局。`
      );
    } else if (params.vpipPct < 14) {
      sessionLeaks.push(
        `本场入池率 VPIP 仅 ${params.vpipPct}%，打法偏紧，后位可适度放宽偷盲与隔离加注频率。`
      );
    }
  }

  if (sessionLeaks.length === 0 && totalHands > 0) {
    sessionLeaks.push('本场未检测到明显负期望关键失误，可结合下方精选大底池回顾下注尺度细节。');
  }

  // Pick latest non-empty sessionProfileContext
  let sessionProfileContext: HandReviewSessionContext | undefined;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i].sessionProfileContext) {
      sessionProfileContext = sorted[i].sessionProfileContext;
      break;
    }
  }

  return {
    totalHands,
    handsWon,
    winRatePct,
    netChips: cumulativeChips,
    netBB: cumulativeBB,
    biggestPot,
    bookmarkedCount: bookmarkedHands.length,
    totalDecisions,
    optimalDecisions,
    acceptableDecisions,
    inaccuracyDecisions,
    mistakeDecisions,
    decisionAccuracyPct,
    vpipPct: typeof params.vpipPct === 'number' ? Math.round(params.vpipPct) : null,
    pfrPct: typeof params.pfrPct === 'number' ? Math.round(params.pfrPct) : null,
    pnlSeries,
    keyHands,
    allHands,
    sessionStrengths: sessionStrengths.slice(0, 3),
    sessionLeaks: sessionLeaks.slice(0, 3),
    sessionProfileContext,
    defaultSelectedHandNumber: keyHands[0]?.handNumber ?? allHands[0]?.handNumber ?? null,
  };
}
