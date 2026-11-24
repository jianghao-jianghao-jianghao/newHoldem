import { evaluateBestHand } from '../src/shared/handEvaluator';
import {
  SESSION_PATTERN_META,
  type SessionPatternTag,
} from '../src/shared/playerInsights';
import type {
  Card,
  DecisionVerdict,
  HandReplayRecord,
  HandReviewHeroDecision,
  HandReviewHeroTableImage,
  HandReviewReport,
  HandReviewSessionContext,
  HandReviewSessionOpponentRead,
  HandReviewStreetSection,
  HandReviewTeachingPoint,
} from '../src/shared/types';
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
import type { OpponentExploitArchetype, SessionOpponentProfiler } from './opponentProfiler';

const STREET_LABELS: Record<'preflop' | 'flop' | 'turn' | 'river', string> = {
  preflop: '翻牌前',
  flop: '翻牌圈',
  turn: '转牌圈',
  river: '河牌圈',
};

const VERDICT_LABELS: Record<DecisionVerdict, string> = {
  optimal: '精准决策',
  acceptable: '可接受',
  inaccuracy: '略有偏差',
  mistake: '关键失误',
};

const ACTION_NAME_ZH: Record<'raise' | 'call' | 'check' | 'fold', string> = {
  raise: '下注 / 加注',
  call: '跟注防守',
  check: '过牌控池',
  fold: '弃牌止损',
};

function createDeterministicRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveHeroPosition(record: HandReplayRecord, heroSeatIndex: number): GtoPosition {
  if (
    record.bigBlindSeatIndex !== undefined &&
    record.bigBlindSeatIndex !== null &&
    heroSeatIndex === record.bigBlindSeatIndex
  ) {
    return 'BB';
  }
  if (
    record.smallBlindSeatIndex !== undefined &&
    record.smallBlindSeatIndex !== null &&
    heroSeatIndex === record.smallBlindSeatIndex
  ) {
    return 'SB';
  }
  if (record.dealerSeatIndex !== undefined && heroSeatIndex === record.dealerSeatIndex) {
    return 'BTN';
  }
  const allSeats = record.players.map((p) => p.seatIndex).sort((a, b) => a - b);
  const nonBlinds = allSeats.filter(
    (s) => s !== record.smallBlindSeatIndex && s !== record.bigBlindSeatIndex
  );
  if (nonBlinds.length <= 1) return 'BTN';
  const anchor = record.bigBlindSeatIndex ?? record.dealerSeatIndex ?? nonBlinds[0];
  const ordered = [
    ...nonBlinds.filter((s) => s > anchor),
    ...nonBlinds.filter((s) => s <= anchor),
  ];
  const distFromBtn = ordered.length - 1 - ordered.indexOf(heroSeatIndex);
  if (distFromBtn <= 0) return 'BTN';
  if (distFromBtn === 1) return 'CO';
  if (distFromBtn === 2) return 'HJ';
  return 'UTG';
}

function describeBoardTexture(board: Card[]): string {
  if (board.length === 0) return '翻前无公共牌 · 以起手牌范围与位置优势为主';
  const tex = analyzeBoardTexture(board);
  const tags: string[] = [];
  if (tex.isMonotone) tags.push('单花面（同花威胁极高）');
  else if (tex.isTwoTone) tags.push('双花听牌面');
  else tags.push('彩虹面');

  if (tex.hasBoardTrips) tags.push('公牌三条');
  else if (tex.isDoublePaired) tags.push('双对牌面');
  else if (tex.isPaired) tags.push('公牌成对');

  if (tex.isDryHighBoard) tags.push('干燥高张结构（有利于翻前加注方范围）');
  else if (tex.wetness >= 0.55) tags.push('高度湿润连张（听牌密集，保护需求强）');
  else if (tex.connectedness >= 0.5) tags.push('中度连张结构');
  else tags.push('偏干燥结构');

  return tags.join(' · ');
}

function normalizeHeroAction(actionType: string): 'raise' | 'call' | 'check' | 'fold' {
  if (actionType === 'raise' || actionType === 'bet' || actionType === 'allin') return 'raise';
  if (actionType === 'call') return 'call';
  if (actionType === 'check') return 'check';
  return 'fold';
}

export interface GenerateHandReviewParams {
  record: HandReplayRecord;
  heroId: string;
  startingChips?: number;
  profiler?: SessionOpponentProfiler;
}

const OPPONENT_EXPLOIT_GUIDE: Record<OpponentExploitArchetype, string> = {
  unknown: '当局样本尚少，建议先以标准 GTO 基准观察其下注尺度与摊牌范围。',
  balanced: '对手目前攻守均衡，减少无依据偏离，优先依赖位置与阻断牌微调。',
  overfolder_nit: '对手本场弃牌偏快，可扩大偷盲、轻度 3-Bet 与干燥面小额持续下注频率。',
  calling_station: '对手本场跟注偏粘，果断压缩纯诈唬，拿成牌放大价值尺度并打更薄的价值。',
  maniac_bluffer: '对手本场高频施压诈唬，适度放宽抓鸡范围，拿超强牌可多用过牌慢打诱敌。',
  cbet_spammer: '对手翻牌几乎无差别持续下注，可多用听牌/后门牌浮跟并在湿润面过牌加注反制。',
  limp_passive: '对手翻前偏好平跟入池，后位用较宽强牌加注隔离（3.5BB+）并拿翻后主动权。',
  fit_or_fold: '对手不击中翻牌极易弃牌，可高频用小尺度 C-Bet 偷池，遇其突然反加则果断止损。',
};

function buildSessionProfileContext(
  record: HandReplayRecord,
  heroId: string,
  allDecisions: HandReviewHeroDecision[],
  profiler?: SessionOpponentProfiler
): HandReviewSessionContext | undefined {
  if (!profiler) return undefined;

  const heroRead = profiler.getOpponentRead(heroId);
  let heroTableImage: HandReviewHeroTableImage | null = null;
  if (heroRead.handsObserved >= 2 && heroRead.archetype !== 'unknown') {
    const tag = heroRead.archetype as SessionPatternTag;
    const meta = SESSION_PATTERN_META[tag] ?? SESSION_PATTERN_META.balanced;
    heroTableImage = {
      handsObserved: heroRead.handsObserved,
      archetype: heroRead.archetype,
      archetypeLabel: heroRead.label,
      confidencePct: Math.round(heroRead.confidence * 100),
      botCounterSummary: meta.counterRisk,
      antiExploitTip: meta.adaptationTip,
    };
  }

  const opponentReads: HandReviewSessionOpponentRead[] = [];
  for (const p of record.players) {
    if (p.id === heroId) continue;
    const oppRead = profiler.getOpponentRead(p.id);
    if (oppRead.handsObserved < 2) continue;
    opponentReads.push({
      playerId: p.id,
      playerName: p.name,
      handsObserved: oppRead.handsObserved,
      archetypeLabel: oppRead.label,
      vpipPct: Math.round(oppRead.vpipRate * 100),
      pfrPct: Math.round(oppRead.pfrRate * 100),
      foldToBetPct: Math.round(oppRead.foldToBetRate * 100),
      aggressionFactor: Number(oppRead.aggressionFactor.toFixed(1)),
      exploitativeAdvice: OPPONENT_EXPLOIT_GUIDE[oppRead.archetype],
    });
  }

  const exploitativeNotes: string[] = [];
  const primaryOpp = opponentReads[0];
  if (primaryOpp) {
    const oppRead = profiler.getOpponentRead(primaryOpp.playerId);
    const heroBluffedOrBetThin = allDecisions.some(
      (d) =>
        d.actualActionType === 'raise' &&
        d.evidence.estimatedEquityPct !== null &&
        d.evidence.estimatedEquityPct < 30
    );
    const heroFoldedToBet = allDecisions.some(
      (d) => d.actualActionType === 'fold' && d.evidence.toCall > 0
    );
    const heroCalledRiver = allDecisions.some(
      (d) => d.street === 'river' && d.actualActionType === 'call'
    );

    if (oppRead.archetype === 'calling_station' && heroBluffedOrBetThin) {
      exploitativeNotes.push(
        `画像联动提醒：${primaryOpp.playerName} 在本场属于「粘滞跟注站」（弃牌率 ${primaryOpp.foldToBetPct}%），低胜率纯诈唬成功率极低，下一次遇到同类对手应放弃空气偷池、专注厚价值下注。`
      );
    } else if (oppRead.archetype === 'maniac_bluffer' && heroFoldedToBet) {
      exploitativeNotes.push(
        `画像联动提醒：${primaryOpp.playerName} 本场侵略性极高（AF ${primaryOpp.aggressionFactor}），面对其重注可较 GTO 基准适度放宽抓鸡区间，不必每次都被迫弃掉中等成牌。`
      );
    } else if (oppRead.archetype === 'overfolder_nit' && heroCalledRiver) {
      exploitativeNotes.push(
        `画像联动提醒：${primaryOpp.playerName} 本场风格偏紧（VPIP ${primaryOpp.vpipPct}%），此类对手很少在河牌纯诈唬，面对其河牌重注应更加谨慎止损。`
      );
    } else {
      exploitativeNotes.push(
        `本场对手读取：${primaryOpp.playerName} 呈现「${primaryOpp.archetypeLabel}」（VPIP ${primaryOpp.vpipPct}% / AF ${primaryOpp.aggressionFactor}），${primaryOpp.exploitativeAdvice}`
      );
    }
  }

  if (heroTableImage && heroTableImage.archetype !== 'balanced') {
    exploitativeNotes.push(
      `你的当局形象已被读为「${heroTableImage.archetypeLabel}」（置信度 ${heroTableImage.confidencePct}%）：${heroTableImage.botCounterSummary}。`
    );
  }

  if (!heroTableImage && opponentReads.length === 0) {
    return undefined;
  }

  return {
    heroTableImage,
    opponentReads,
    exploitativeNotes,
  };
}

/**
 * Generates an objective, evidence-backed post-hand review for a specific player.
 * Reconstructs pot, bet sizing, pot odds, MDF, preflop GTO mix, postflop Monte Carlo equity,
 * and blockers at every Hero decision point, then synthesizes strengths, lessons, and teaching.
 */
export function generateHandReview(params: GenerateHandReviewParams): HandReviewReport | null {
  const { record, heroId } = params;
  const heroSnap = record.players.find((p) => p.id === heroId);
  if (!heroSnap) return null;

  const bb = Math.max(1, record.bigBlind || 20);
  const heroPosition = resolveHeroPosition(record, heroSnap.seatIndex);
  const heroHoleCards = heroSnap.holeCards && heroSnap.holeCards.length === 2 ? heroSnap.holeCards : null;
  const canonicalHand = heroHoleCards ? toCanonicalHandKey(heroHoleCards) : null;
  const heroFinalEval =
    heroHoleCards && record.communityCards.length >= 3
      ? evaluateBestHand([...heroHoleCards, ...record.communityCards])
      : null;

  const winnerIds = new Set(record.winners.map((w) => w.playerId));
  const isHeroWinner = winnerIds.has(heroId);
  const outcome: 'win' | 'loss' | 'split' = isHeroWinner
    ? record.winners.length > 1
      ? 'split'
      : 'win'
    : 'loss';
  const nonFoldedCount = record.players.filter((p) => !p.folded).length;
  const wonByFold = nonFoldedCount <= 1;

  // Estimate Hero's starting stack at beginning of hand
  const heroNet = heroSnap.netChange;
  const heroStartChips = Math.max(
    bb * 5,
    heroSnap.chipsAfter - heroNet,
    params.startingChips ?? bb * 100
  );

  // Reconstruct street-by-street timeline & evaluate each Hero decision
  const streetOrder: Array<'preflop' | 'flop' | 'turn' | 'river'> = [
    'preflop',
    'flop',
    'turn',
    'river',
  ];
  const timeline = record.potTimeline ?? [];

  const streetEventsMap = new Map<
    'preflop' | 'flop' | 'turn' | 'river',
    HandReviewStreetSection['events']
  >();
  const streetDecisionsMap = new Map<
    'preflop' | 'flop' | 'turn' | 'river',
    HandReviewHeroDecision[]
  >();
  const streetPotBounds = new Map<
    'preflop' | 'flop' | 'turn' | 'river',
    { start: number; end: number }
  >();

  let runningPot = 0;
  let currentStreet: 'preflop' | 'flop' | 'turn' | 'river' = 'preflop';
  let streetCurrentBet = 0;
  let streetRaises = 0;
  const streetContrib = new Map<string, number>();
  const activeInHand = new Set<string>(record.players.map((p) => p.id));
  let heroStackNow = heroStartChips;

  const resetStreetTrackers = (nextStreet: 'preflop' | 'flop' | 'turn' | 'river') => {
    currentStreet = nextStreet;
    streetCurrentBet = 0;
    streetRaises = 0;
    streetContrib.clear();
  };

  for (const pt of timeline) {
    if (pt.street !== 'preflop' && pt.street !== 'flop' && pt.street !== 'turn' && pt.street !== 'river') {
      continue;
    }
    if (pt.street !== currentStreet) {
      resetStreetTrackers(pt.street);
    }

    const potBefore = Math.max(0, runningPot);
    if (!streetPotBounds.has(pt.street)) {
      streetPotBounds.set(pt.street, { start: potBefore, end: pt.potAfter });
    }

    if (pt.actionType === 'refund') {
      runningPot = pt.potAfter;
      streetPotBounds.get(pt.street)!.end = pt.potAfter;
      continue;
    }

    const actorContribBefore = streetContrib.get(pt.actorId) ?? 0;
    const toCallBefore = Math.max(0, streetCurrentBet - actorContribBefore);

    if (pt.actionType === 'blind') {
      streetContrib.set(pt.actorId, actorContribBefore + pt.amountAdded);
      streetCurrentBet = Math.max(streetCurrentBet, actorContribBefore + pt.amountAdded);
      if (pt.actorId === heroId) {
        heroStackNow = Math.max(0, heroStackNow - pt.amountAdded);
      }
      runningPot = pt.potAfter;
      streetPotBounds.get(pt.street)!.end = pt.potAfter;

      const list = streetEventsMap.get(pt.street) ?? [];
      list.push({
        step: pt.step,
        actorId: pt.actorId,
        actorName: pt.actorName,
        isHero: pt.actorId === heroId,
        actionType: pt.actionType,
        actionLabel: pt.actionLabel,
        amountAdded: pt.amountAdded,
        potAfter: pt.potAfter,
        betToPotPct: null,
      });
      streetEventsMap.set(pt.street, list);
      continue;
    }

    const isBetRaise =
      pt.actionType === 'raise' || pt.actionType === 'bet' || pt.actionType === 'allin';
    const betToPotPct =
      isBetRaise && potBefore > 0 ? Math.round((pt.amountAdded / potBefore) * 100) : null;

    const eventsList = streetEventsMap.get(pt.street) ?? [];
    eventsList.push({
      step: pt.step,
      actorId: pt.actorId,
      actorName: pt.actorName,
      isHero: pt.actorId === heroId,
      actionType: pt.actionType,
      actionLabel: pt.actionLabel,
      amountAdded: pt.amountAdded,
      potAfter: pt.potAfter,
      betToPotPct,
    });
    streetEventsMap.set(pt.street, eventsList);

    // Evaluate Hero's real decision using pre-action state + GTO math
    if (pt.actorId === heroId && heroHoleCards) {
      const activeOpponents = Math.max(1, activeInHand.size - 1);
      const effStackNow = Math.max(bb, heroStackNow + actorContribBefore);
      const effStackBB = Number((effStackNow / bb).toFixed(1));
      const potBaseForMdf = Math.max(1, potBefore - toCallBefore);
      const potOdds = toCallBefore > 0 ? toCallBefore / Math.max(1, potBefore + toCallBefore) : 0;
      const mdf = toCallBefore > 0 ? computeMdf(potBaseForMdf, toCallBefore) : 1;
      const spr = Number((Math.max(0, heroStackNow) / Math.max(bb, potBefore)).toFixed(2));
      const actualNorm = normalizeHeroAction(pt.actionType);

      let decision: HandReviewHeroDecision;

      if (pt.street === 'preflop') {
        const facingRaises = streetCurrentBet <= bb ? 0 : Math.max(1, streetRaises);
        const facingBetBB = streetCurrentBet / bb;
        const mix = getGtoPreflopMix({
          holeCards: heroHoleCards,
          position: heroPosition,
          facingRaises,
          facingBetBB,
          effectiveStackBB: effStackBB,
          isHeadsUp: record.players.length <= 2,
          canCheck: toCallBefore === 0,
        });

        let recAction: 'raise' | 'call' | 'check' | 'fold' = 'fold';
        if (mix.raise >= mix.call && mix.raise >= mix.fold && mix.raise >= 0.28) {
          recAction = 'raise';
        } else if (toCallBefore === 0) {
          recAction = 'check';
        } else if (mix.call >= mix.fold && mix.call >= 0.25) {
          recAction = 'call';
        }

        const chosenFreq =
          actualNorm === 'raise'
            ? mix.raise
            : actualNorm === 'call'
              ? mix.call
              : actualNorm === 'check'
                ? Math.max(mix.call, mix.fold)
                : mix.fold;

        let verdict: DecisionVerdict = 'optimal';
        if (actualNorm === recAction || chosenFreq >= 0.45) {
          verdict = 'optimal';
        } else if (chosenFreq >= 0.18) {
          verdict = 'acceptable';
        } else if (
          actualNorm === 'call' &&
          facingRaises === 0 &&
          mix.raise >= 0.6
        ) {
          verdict = 'inaccuracy';
        } else if (
          (actualNorm === 'fold' && mix.raise + mix.call >= 0.78) ||
          (actualNorm !== 'fold' && mix.fold >= 0.8)
        ) {
          verdict = 'mistake';
        } else {
          verdict = 'inaccuracy';
        }

        const recSizeBB =
          effStackBB <= 15
            ? effStackBB
            : facingRaises === 0
              ? heroPosition === 'SB'
                ? 3
                : 2.5
              : Number((facingBetBB * 3).toFixed(1));
        const recLabel =
          recAction === 'raise'
            ? effStackBB <= 15
              ? `全下 (${recSizeBB}BB)`
              : `加注至 ${recSizeBB}BB`
            : ACTION_NAME_ZH[recAction];

        let analysis: string;
        let suggestion: string;

        const facingContext =
          facingRaises === 0 ? '翻前未遭加注时' : `面对 ${facingRaises} 次加注`;

        if (verdict === 'optimal') {
          analysis = `在 ${heroPosition} 位持 ${canonicalHand}（${facingContext}，有效筹码 ${effStackBB}BB），GTO 策略为加注 ${Math.round(mix.raise * 100)}% / 跟注 ${Math.round(mix.call * 100)}% / 弃牌 ${Math.round(mix.fold * 100)}%。你的「${pt.actionLabel}」契合理论高频区间。`;
          suggestion = '翻前范围执行扎实，保持相同位置纪律即可。';
        } else if (actualNorm === 'call' && facingRaises === 0 && mix.raise >= 0.55) {
          analysis = `在 ${heroPosition} 位持 ${canonicalHand} 选择了翻前平跟（Limp），但 GTO 建议高达 ${Math.round(mix.raise * 100)}% 主动加注。平跟既放弃了直接收盲注的弃牌率，也容易把牌拖入多人底池降低胜率实现。`;
          suggestion = `改用公开加注至 ${recSizeBB}BB 拿回主动权，隔离弱范围并简化翻后决策。`;
        } else if (actualNorm === 'fold' && mix.raise + mix.call >= 0.7) {
          analysis = `在 ${heroPosition} 位持 ${canonicalHand} 过早弃牌（GTO 继续频率 ${Math.round((mix.raise + mix.call) * 100)}%），在面对 ${facingBetBB.toFixed(1)}BB 下注时弃掉了具备足够底池赔率与可玩性的起手牌。`;
          suggestion = `该手牌处于标准防守/反攻区间，建议优先采用「${recLabel}」。`;
        } else if (mix.fold >= 0.72) {
          analysis = `在 ${heroPosition} 位持 ${canonicalHand}，${facingContext}仍强行入池，但该位置 GTO 弃牌率达 ${Math.round(mix.fold * 100)}%。这类边缘牌在被反压制时容易在翻后支付大底池。`;
          suggestion = '翻前果断弃牌止损，把筹码留给后位或踢脚更强的组合。';
        } else {
          analysis = `在 ${heroPosition} 位持 ${canonicalHand}，你的「${pt.actionLabel}」在 GTO 中占比约 ${Math.round(chosenFreq * 100)}%，属于边缘混合分支；更高 EV 的主流路线为「${recLabel}」。`;
          suggestion = `下次在类似筹码深度（${effStackBB}BB）下，可优先选择「${recLabel}」。`;
        }

        decision = {
          step: pt.step,
          street: pt.street,
          actualActionType: pt.actionType,
          actualActionLabel: pt.actionLabel,
          recommendedAction: recAction,
          recommendedLabel: recLabel,
          verdict,
          verdictLabel: VERDICT_LABELS[verdict],
          evidence: {
            potBefore,
            toCall: toCallBefore,
            potOddsPct: Number((potOdds * 100).toFixed(1)),
            mdfPct: Number((mdf * 100).toFixed(1)),
            estimatedEquityPct: null,
            preflopMix: {
              raise: Math.round(mix.raise * 100),
              call: Math.round(mix.call * 100),
              fold: Math.round(mix.fold * 100),
            },
            betToPotPct,
            spr,
          },
          analysis,
          suggestion,
        };
      } else {
        // Postflop decision analysis (flop / turn / river)
        const boardSliceCount = pt.street === 'flop' ? 3 : pt.street === 'turn' ? 4 : 5;
        const streetBoard = record.communityCards.slice(0, boardSliceCount);
        const texture = analyzeBoardTexture(streetBoard);
        const blockers = evaluateBlockers(heroHoleCards, streetBoard, texture);
        const villainTightness =
          toCallBefore > 0
            ? Math.min(0.68, 0.25 + (toCallBefore / Math.max(1, potBaseForMdf)) * 0.24 + streetRaises * 0.1)
            : 0.24;

        const seed =
          (record.handNumber * 104729) ^
          (pt.step * 7919) ^
          (heroSnap.seatIndex * 3571) ^
          boardSliceCount;
        const equity = estimatePostflopEquity({
          holeCards: heroHoleCards,
          board: streetBoard,
          opponentCount: activeOpponents,
          villainTightness,
          iterations: 180,
          rng: createDeterministicRng(seed),
        });
        const eqPct = Number((equity * 100).toFixed(1));
        const potOddsPct = Number((potOdds * 100).toFixed(1));
        const mdfPct = Number((mdf * 100).toFixed(1));
        const streetsRemaining = pt.street === 'flop' ? 3 : pt.street === 'turn' ? 2 : 1;
        const geoFrac = computeGeometricBetFraction(
          Math.max(bb, potBefore),
          Math.max(bb, heroStackNow),
          streetsRemaining
        );

        let recAction: 'raise' | 'call' | 'check' | 'fold';
        let recLabel: string;
        let verdict: DecisionVerdict = 'optimal';
        let analysis: string;
        let suggestion: string;

        if (toCallBefore === 0) {
          if (equity >= 0.66) {
            recAction = 'raise';
            const idealFrac =
              texture.isDryHighBoard && pt.street === 'flop'
                ? 0.33
                : Math.min(1.0, Math.max(0.5, geoFrac));
            const idealPct = Math.round(idealFrac * 100);
            recLabel = `价值下注约 ${idealPct}% 底池`;
            if (actualNorm === 'raise') {
              if (betToPotPct !== null && betToPotPct < 22 && equity >= 0.78) {
                verdict = 'inaccuracy';
                analysis = `当前估算胜率高达 ${eqPct}%，你选择了主动下注，但 ${betToPotPct}% 底池的尺度偏小，未能从对手的中等牌与听牌中榨取足够价值。`;
                suggestion = `强牌价值下注可放大至 ${idealPct}% 底池（几何尺度约 ${Math.round(geoFrac * 100)}%），兼顾价值与听牌保护。`;
              } else {
                verdict = 'optimal';
                analysis = `估算胜率 ${eqPct}% 明显领先对手范围，你在该街主动打价值（${betToPotPct ?? idealPct}% 底池），有效建立底池并挤压对手听牌赔率。`;
                suggestion = '价值下注方向正确，持续结合牌面湿润度微调尺度即可。';
              }
            } else {
              verdict = equity >= 0.78 && texture.wetness >= 0.4 ? 'mistake' : 'inaccuracy';
              analysis = `估算胜率已达 ${eqPct}% 且${texture.wetness >= 0.4 ? '牌面偏湿润存在听牌反超风险' : '具备明显价值领先'}，但选择过牌放过了建立底池的窗口。`;
              suggestion = `建议主动「${recLabel}」，既能向较弱成牌收取价值，也能阻止对手免费看下一张牌。`;
            }
          } else if (pt.street === 'river' && equity <= 0.24 && blockers.bluffScore >= 0.5) {
            const optBluff = Math.round(
              computeOptimalBluffRatio(potBefore * 0.75, Math.max(1, potBefore)) * 100
            );
            recAction = actualNorm === 'raise' ? 'raise' : 'check';
            recLabel = actualNorm === 'raise' ? '阻断牌极化偷池（约 75% 池）' : '过牌放弃或择机极化偷池';
            verdict = actualNorm === 'raise' ? 'optimal' : 'acceptable';
            analysis =
              actualNorm === 'raise'
                ? `虽然摊牌胜率仅 ${eqPct}%，但手牌携带关键阻断牌（阻断评分 ${Math.round(blockers.bluffScore * 100)}%），在河牌以理论约 ${optBluff}% 诈唬占比执行偷池具备数学依据。`
                : `当前胜率仅 ${eqPct}%，过牌保底可避免撞上跟注站；若对手弃牌率高，该组合因带阻断牌也可作为河牌诈唬候选。`;
            suggestion =
              actualNorm === 'raise'
                ? '针对弃牌率较高的对手继续保持此类带阻断牌的河牌偷池；遇跟注站则减少纯诈唬。'
                : '面对偏紧对手时，可尝试用这类带坚果阻断牌的错失听牌执行 66%–75% 底池偷池。';
          } else {
            recAction = 'check';
            recLabel = '过牌控池';
            if (actualNorm === 'check') {
              verdict = 'optimal';
              analysis = `当前估算胜率 ${eqPct}%（中等摊牌价值或边缘听牌），过牌控池既保护了过牌范围，也避免被对手过牌加注逼入两难。`;
              suggestion = '控池节奏恰当，保留中等牌力在后续街道抓鸡或低成本摊牌。';
            } else if (equity >= 0.45 && (betToPotPct ?? 50) <= 55) {
              verdict = 'acceptable';
              analysis = `当前估算胜率 ${eqPct}% 处于薄价值与保护交界，小额试探下注（${betToPotPct ?? 40}% 底池）可接受，但一旦被加注需谨慎止损。`;
              suggestion = '中等牌力控制底池规模，避免把单对打成三条街超大底池。';
            } else {
              verdict = equity < 0.25 && blockers.bluffScore < 0.35 ? 'mistake' : 'inaccuracy';
              analysis = `当前估算胜率仅 ${eqPct}% 且缺乏关键阻断牌（阻断评分 ${Math.round(blockers.bluffScore * 100)}%），在此节点主动重注容易把中等牌打成负期望诈唬。`;
              suggestion = '缺乏阻断牌与听牌补牌时优先「过牌控池」，避免无依据扩池。';
            }
          }
        } else {
          // Facing a bet / raise
          if (equity >= 0.78) {
            recAction = 'raise';
            recLabel = '价值加注反攻';
            if (actualNorm === 'raise') {
              verdict = 'optimal';
              analysis = `估算胜率 ${eqPct}% 远超底池赔率门槛 ${potOddsPct}%，选择加注反攻高效兑现了超强牌价值。`;
              suggestion = '强牌反加果断有力，尤其在湿润面上可有效惩罚对手听牌。';
            } else if (actualNorm === 'call') {
              verdict = texture.wetness >= 0.45 ? 'inaccuracy' : 'acceptable';
              analysis = `手牌胜率高达 ${eqPct}%（仅需 ${potOddsPct}% 赔率），选择平跟慢打虽然能隐蔽牌力，但在${texture.wetness >= 0.45 ? '湿润面' : '当前底池'}可能错失价值或让对手廉价追牌。`;
              suggestion =
                texture.wetness >= 0.45
                  ? '湿润牌面拿超强成牌优先加注打满价值，不要给听牌便宜看牌的机会。'
                  : '干燥面偶尔慢打诱敌可行，但对手下注偏小或河牌圈仍应主动加注拿满价值。';
            } else {
              verdict = 'mistake';
              analysis = `重大漏损：估算胜率达 ${eqPct}%，远高于所需底池赔率 ${potOddsPct}%，在此处弃牌直接放弃了高正期望底池。`;
              suggestion = '面对下注先核算底池赔率与真实成牌强度，强牌切勿被单次重注吓退。';
            }
          } else if (equity >= potOdds + 0.03) {
            recAction = 'call';
            recLabel = '跟注防守';
            if (actualNorm === 'call') {
              verdict = 'optimal';
              analysis = `底池赔率要求 ${potOddsPct}% 胜率（MDF ${mdfPct}%），当前手牌估算胜率 ${eqPct}% 满足正期望条件，跟注防守有充分数学依据。`;
              suggestion = '继续维持赔率驱动的防守习惯，不被对手单街施压轻易赶走。';
            } else if (actualNorm === 'fold') {
              verdict = equity >= potOdds + 0.12 ? 'mistake' : 'inaccuracy';
              analysis = `估算胜率 ${eqPct}% 高于所需底池赔率 ${potOddsPct}%（MDF ${mdfPct}%），此处弃牌偏紧，长期容易被对手高频偷池剥削。`;
              suggestion = `面对仅需 ${potOddsPct}% 胜率的下注，带听牌或中等成牌应优先「跟注防守」。`;
            } else {
              verdict = pt.street === 'river' ? 'mistake' : 'acceptable';
              analysis =
                pt.street === 'river'
                  ? `河牌估算胜率 ${eqPct}% 属于典型抓鸡区间，却选择了加注——加注通常会赶走所有更弱牌、只留下更强牌跟注。`
                  : `估算胜率 ${eqPct}% 以跟注为主，转为半诈唬加注波动较大，仅在具备足够弃牌率或强听牌时成立。`;
              suggestion = '中等抓鸡牌以「跟注防守」为主，把加注留给两极化强牌与强听牌。';
            }
          } else {
            recAction = 'fold';
            recLabel = '弃牌止损';
            if (actualNorm === 'fold') {
              verdict = 'optimal';
              analysis = `面对 ${toCallBefore} 下注需要 ${potOddsPct}% 胜率回本，而当前估算胜率仅 ${eqPct}%，果断弃牌避免继续向劣势底池输血。`;
              suggestion = '纪律严明的止损同样是盈利的核心来源，保持这种赔率意识。';
            } else if (actualNorm === 'call') {
              verdict = potOdds - equity >= 0.08 ? 'mistake' : 'inaccuracy';
              analysis = `负期望跟注证据：需要 ${potOddsPct}% 胜率才能持平，但当前估算胜率仅 ${eqPct}%（差额 ${(equity * 100 - potOddsPct).toFixed(1)}%），长期跟注会持续亏损。`;
              suggestion = `面对高尺度下注（需 ${potOddsPct}% 胜率）时，无足够听牌补牌或隐含赔率应果断「弃牌止损」。`;
            } else {
              verdict = blockers.bluffScore >= 0.55 && pt.street !== 'river' ? 'acceptable' : 'mistake';
              analysis = `在胜率仅 ${eqPct}%（低于赔率 ${potOddsPct}%）且对手展现强势时强行反加，若对手不易弃牌将承受极高反击代价。`;
              suggestion = '缺乏强听牌与阻断牌支撑时，面对重注直接弃牌止损比强行反诈更稳健。';
            }
          }
        }

        decision = {
          step: pt.step,
          street: pt.street,
          actualActionType: pt.actionType,
          actualActionLabel: pt.actionLabel,
          recommendedAction: recAction,
          recommendedLabel: recLabel,
          verdict,
          verdictLabel: VERDICT_LABELS[verdict],
          evidence: {
            potBefore,
            toCall: toCallBefore,
            potOddsPct,
            mdfPct,
            estimatedEquityPct: eqPct,
            preflopMix: null,
            betToPotPct,
            spr,
          },
          analysis,
          suggestion,
        };
      }

      const dList = streetDecisionsMap.get(pt.street) ?? [];
      dList.push(decision);
      streetDecisionsMap.set(pt.street, dList);
    }

    // Advance running trackers after evaluating the decision
    if (pt.actionType === 'fold') {
      activeInHand.delete(pt.actorId);
    } else if (pt.amountAdded > 0) {
      const nextContrib = actorContribBefore + pt.amountAdded;
      streetContrib.set(pt.actorId, nextContrib);
      if (nextContrib > streetCurrentBet) {
        streetCurrentBet = nextContrib;
        streetRaises += 1;
      }
      if (pt.actorId === heroId) {
        heroStackNow = Math.max(0, heroStackNow - pt.amountAdded);
      }
    }
    runningPot = pt.potAfter;
    streetPotBounds.get(pt.street)!.end = pt.potAfter;
  }

  const streets: HandReviewStreetSection[] = [];
  for (const st of streetOrder) {
    const events = streetEventsMap.get(st);
    if (!events || events.length === 0) continue;
    const boardCount = st === 'preflop' ? 0 : st === 'flop' ? 3 : st === 'turn' ? 4 : 5;
    const boardCards = record.communityCards.slice(0, boardCount);
    const bounds = streetPotBounds.get(st) ?? { start: 0, end: record.pot };
    streets.push({
      street: st,
      streetLabel: STREET_LABELS[st],
      boardCards,
      boardSummary: describeBoardTexture(boardCards),
      potStart: bounds.start,
      potEnd: bounds.end,
      events,
      heroDecisions: streetDecisionsMap.get(st) ?? [],
    });
  }

  const allDecisions = streets.flatMap((s) => s.heroDecisions);
  const optimalDecisions = allDecisions.filter((d) => d.verdict === 'optimal');
  const mistakes = allDecisions.filter((d) => d.verdict === 'mistake');
  const inaccuracies = allDecisions.filter((d) => d.verdict === 'inaccuracy');

  // Showdown opponent evidence (only public/revealed cards!)
  const showdownOpponents = record.players
    .filter((p) => p.id !== heroId && p.revealed && p.holeCards && p.holeCards.length === 2)
    .map((p) => {
      const ev =
        record.communityCards.length >= 3
          ? evaluateBestHand([...p.holeCards!, ...record.communityCards])
          : null;
      return {
        id: p.id,
        name: p.name,
        holeCards: p.holeCards!,
        handName: ev?.categoryName ?? '已亮牌',
        netChange: p.netChange,
        isWinner: winnerIds.has(p.id),
      };
    });

  // Synthesize Strengths & Lessons from BOTH wins and losses!
  const strengthsFound: string[] = [];
  const lessonsLearned: string[] = [];

  for (const d of optimalDecisions.slice(0, 2)) {
    strengthsFound.push(
      `${STREET_LABELS[d.street as keyof typeof STREET_LABELS] ?? d.street}「${d.actualActionLabel}」：${d.suggestion}`
    );
  }
  if (outcome === 'win' && wonByFold && strengthsFound.length < 2) {
    strengthsFound.push('通过持续施压迫使对手弃牌，无需摊牌直接兑现底池权益。');
  }
  if (strengthsFound.length === 0) {
    strengthsFound.push('完整保留了本局各街的下注尺度与赔率证据，可用于对比下一局同类场景。');
  }

  for (const m of mistakes.slice(0, 2)) {
    lessonsLearned.push(
      `[${STREET_LABELS[m.street as keyof typeof STREET_LABELS] ?? m.street}关键失误] ${m.analysis} → ${m.suggestion}`
    );
  }
  for (const inc of inaccuracies.slice(0, Math.max(0, 2 - lessonsLearned.length))) {
    lessonsLearned.push(
      `[${STREET_LABELS[inc.street as keyof typeof STREET_LABELS] ?? inc.street}可优化] ${inc.analysis} → ${inc.suggestion}`
    );
  }

  if (lessonsLearned.length === 0) {
    if (outcome === 'loss') {
      lessonsLearned.push(
        '过程无明显数学错误：本局亏损属于标准牌面波动（Cooler / Variance）。切勿因为单手输赢而动摇正确的赔率与位置决策。'
      );
    } else {
      lessonsLearned.push(
        '本局决策整体贴合 GTO 基准；赢局同样要复核对手是否还有更宽的支付范围，避免下次在相似牌面少收价值。'
      );
    }
  }

  // Pick the most instructive poker teaching module based on the pivotal decision
  const pivotal = mistakes[0] ?? inaccuracies[0] ?? allDecisions[allDecisions.length - 1] ?? null;
  const teaching = buildTeachingPoint(pivotal, outcome, heroPosition);

  const netBB = Number((heroNet / bb).toFixed(1));
  const headline =
    outcome === 'win'
      ? mistakes.length > 0
        ? `赢下底池（+${heroNet}），但过程中存在 ${mistakes.length} 处高风险漏损值得复盘`
        : inaccuracies.length > 0
          ? `顺利拿下底池（+${heroNet}），局部尺度仍有增值空间`
          : `高质量赢局（+${heroNet}），各街执行贴合理论最优线`
      : outcome === 'split'
        ? `平分底池（${heroNet >= 0 ? '+' : ''}${heroNet}），复核关键街尺度与赔率`
        : mistakes.length > 0
          ? `本局失利（${heroNet}），核心漏损集中在 ${mistakes.length} 处负期望节点`
          : `本局惜败（${heroNet}），决策过程符合赔率纪律，属正常牌局波动`;

  const overallSummary = `你在 ${heroPosition} 位持 ${canonicalHand ?? '底牌'}${heroFinalEval ? `（最终成牌：${heroFinalEval.categoryName}）` : ''}，全场共记录 ${allDecisions.length} 次关键表态：精准 ${optimalDecisions.length} 次、可接受 ${allDecisions.filter((d) => d.verdict === 'acceptable').length} 次、偏差 ${inaccuracies.length} 次、失误 ${mistakes.length} 次。`;

  const sessionProfileContext = buildSessionProfileContext(
    record,
    heroId,
    allDecisions,
    params.profiler
  );

  if (sessionProfileContext?.exploitativeNotes.length) {
    lessonsLearned.push(sessionProfileContext.exploitativeNotes[0]);
  }

  return {
    handNumber: record.handNumber,
    timestamp: record.timestamp,
    outcome,
    wonByFold,
    netChips: heroNet,
    netBB,
    pot: record.pot,
    smallBlind: record.smallBlind,
    bigBlind: record.bigBlind,
    heroId,
    heroName: heroSnap.name,
    heroPosition,
    heroHoleCards,
    canonicalHand,
    heroFinalHandName: heroFinalEval?.categoryName ?? null,
    communityCards: [...record.communityCards],
    showdownOpponents,
    headline,
    overallSummary,
    streets,
    strengthsFound,
    lessonsLearned: lessonsLearned.slice(0, 4),
    teaching,
    sessionProfileContext,
  };
}

function buildTeachingPoint(
  pivotal: HandReviewHeroDecision | null,
  outcome: 'win' | 'loss' | 'split',
  heroPosition: GtoPosition
): HandReviewTeachingPoint {
  if (!pivotal) {
    return {
      topic: '结果导向 vs 过程导向（EV 思维）',
      principle: '德州扑克短期受发牌波动支配，评判一手牌好坏的唯一标准是在信息不完备下是否做出了长期正期望（+EV）决策。',
      formulaOrRule: '长期盈利 = Σ(每次正期望决策的 EV 累积) - 波动情绪漏损',
      nextHandDrill: '下一局无论输赢，先检查自己在翻前是否符合位置范围、面对下注是否核算了底池赔率。',
    };
  }

  if (pivotal.street === 'preflop') {
    if (pivotal.actualActionType === 'call' && pivotal.recommendedAction === 'raise') {
      return {
        topic: '为什么翻前应「加注或弃牌」而非平跟（Limp）',
        principle: '翻前公开平跟放弃了直接赢下盲注的弃牌率，还让后位玩家低成本看翻牌、放大多人底池的不可控性。',
        formulaOrRule: '标准公开加注尺度 = 2.5BB（BTN/CO/HJ/UTG）或 3BB（SB）+ 每多 1 位平跟者 +1BB',
        nextHandDrill: `下一次在 ${heroPosition} 位拿到可玩起手牌时，尝试用公开加注替代平跟，体会翻后握有主动权的优势。`,
      };
    }
    return {
      topic: '位置优势与翻前起手牌纪律',
      principle: '位置越靠后，你看到的对手信息越完整，可盈利的起手牌范围越宽；前位松散入池往往在翻后陷入被压制困局。',
      formulaOrRule: '开池宽度递增顺序：UTG (~15%) < HJ (~20%) < CO (~27%) < BTN (~42%)',
      nextHandDrill: '前位只保留强对子、大高张与强同花连张；边缘投机牌集中放到 CO / BTN 位再施压。',
    };
  }

  if (pivotal.evidence.toCall > 0) {
    return {
      topic: '底池赔率（Pot Odds）与最小防守频率（MDF）',
      principle: '面对对手下注时，只需比较「手牌估算胜率」与「底池赔率」即可判断跟注是否回本；同时结合 MDF 防止自己弃牌过多被剥削。',
      formulaOrRule: '底池赔率 = 跟注额 ÷ (当前底池 + 跟注额) · MDF = 原底池 ÷ (原底池 + 下注额)',
      nextHandDrill: `记住三个常用速算锚点：半池需 25% 胜率、2/3 池需 28.6%、满池需 33.3%，下次面对下注先心算再按键。`,
    };
  }

  if (pivotal.street === 'river') {
    return {
      topic: '河牌极化下注与阻断牌效应（Blockers）',
      principle: '河牌没有后续发牌，下注范围应高度极化：用领先对手跟注范围的强牌打价值，用阻断对手强牌的错失听牌平衡诈唬。',
      formulaOrRule: '河牌最优诈唬占比 α = 下注额 ÷ (底池 + 2 × 下注额)（如 75% 池对应约 30% 诈唬）',
      nextHandDrill: '河牌决定偷池前先看自己手里是否拿着同花 A/K 或关键顺子阻断牌；中等牌优先过牌抓鸡。',
    };
  }

  return {
    topic: outcome === 'win' ? '价值最大化与牌面纹理保护' : '多街底池控制与听牌赔率',
    principle: '干燥高张面适合小尺度高频持续施压；湿润连张/同花听牌面则应放大价值与半诈唬尺度，拒绝给对手廉价听牌赔率。',
    formulaOrRule: '干燥面 C-Bet ≈ 33% 底池 · 湿润听牌面价值/保护下注 ≈ 66%–75% 底池',
    nextHandDrill: '发下翻牌后先花 2 秒判断「干燥高张」还是「湿润连张」，再决定下注尺度或过牌控池。',
  };
}
