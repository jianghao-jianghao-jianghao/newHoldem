import type { Card, Rank, Suit } from '../src/shared/types';
import {
  analyzeBoardTexture,
  computeGeometricBetFraction,
  computeMdf,
  computeOptimalBluffRatio,
  encodeCardInt,
  estimatePostflopEquity,
  evaluateBlockers,
  getGtoPreflopMix,
  toCanonicalHandKey,
  type BlockerProfile,
  type BoardTexture,
  type GtoPosition,
  type PreflopActionMix,
} from './gtoRanges';

const VALID_SUITS = new Set<Suit>(['spades', 'hearts', 'diamonds', 'clubs']);
const VALID_POSITIONS = new Set<GtoPosition>(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);

export interface GtoCoachRequest {
  holeCards: Card[];
  communityCards?: Card[];
  position?: GtoPosition;
  pot?: number;
  toCall?: number;
  effectiveStack?: number;
  bigBlind?: number;
  opponents?: number;
  facingRaises?: number;
  useLlm?: boolean;
}

export interface GtoCoachReport {
  ok: true;
  street: 'preflop' | 'flop' | 'turn' | 'river';
  canonicalHand: string;
  position: GtoPosition;
  effectiveStackBB: number;
  potOdds: number;
  mdf: number;
  optimalBluffRatio: number;
  geometricBetFraction: number;
  preflopMix: PreflopActionMix | null;
  equity: number | null;
  boardTexture: BoardTexture | null;
  blockers: BlockerProfile | null;
  recommendedAction: 'raise' | 'call' | 'check' | 'fold';
  recommendedSizeBB: number | null;
  rationale: string;
  llmCoachAdvice?: string | null;
}

function isValidCard(c: unknown): c is Card {
  if (!c || typeof c !== 'object') return false;
  const candidate = c as { suit?: unknown; rank?: unknown };
  const rankNum = Number(candidate.rank);
  return (
    typeof candidate.suit === 'string' &&
    VALID_SUITS.has(candidate.suit as Suit) &&
    Number.isInteger(rankNum) &&
    rankNum >= 2 &&
    rankNum <= 14
  );
}

/**
 * Stateless GTO Spot Evaluator powering POST /api/gto/evaluate.
 * Computes exact preflop 6-max/Nash frequencies or postflop Monte Carlo equity + MDF + blockers + geometric sizing.
 */
export function evaluateGtoSpot(
  raw: GtoCoachRequest
): GtoCoachReport | { ok: false; error: string } {
  if (!Array.isArray(raw.holeCards) || raw.holeCards.length !== 2 || !raw.holeCards.every(isValidCard)) {
    return { ok: false, error: '请提供 2 张有效的底牌 (holeCards)' };
  }
  const board = Array.isArray(raw.communityCards) ? raw.communityCards : [];
  if (board.length !== 0 && (board.length < 3 || board.length > 5)) {
    return { ok: false, error: '公共牌数量必须为 0、3、4 或 5 张' };
  }
  if (!board.every(isValidCard)) {
    return { ok: false, error: '存在无效的公共牌格式' };
  }

  const allCards: Card[] = [...raw.holeCards, ...board].map((c) => ({
    suit: c.suit,
    rank: Number(c.rank) as Rank,
  }));
  const seen = new Set<number>();
  for (const card of allCards) {
    const id = encodeCardInt(card);
    if (seen.has(id)) {
      return { ok: false, error: '底牌与公共牌中存在重复牌面' };
    }
    seen.add(id);
  }

  const holeCards = allCards.slice(0, 2);
  const communityCards = allCards.slice(2);
  const position: GtoPosition =
    raw.position && VALID_POSITIONS.has(raw.position) ? raw.position : 'BTN';
  const bigBlind = Math.max(1, Math.min(100_000, Number(raw.bigBlind) || 20));
  const pot = Math.max(bigBlind, Math.min(10_000_000, Number(raw.pot) || bigBlind * 1.5));
  const toCall = Math.max(0, Math.min(10_000_000, Number(raw.toCall) || 0));
  const effectiveStack = Math.max(
    bigBlind,
    Math.min(10_000_000, Number(raw.effectiveStack) || bigBlind * 100)
  );
  const opponents = Math.max(1, Math.min(5, Math.floor(Number(raw.opponents) || 1)));
  const facingRaises = Math.max(0, Math.min(5, Math.floor(Number(raw.facingRaises) || (toCall > bigBlind ? 1 : 0))));

  const canonicalHand = toCanonicalHandKey(holeCards);
  const effectiveStackBB = Number((effectiveStack / bigBlind).toFixed(1));
  const potBeforeBet = Math.max(1, pot - toCall);
  const potOdds = toCall > 0 ? Number((toCall / (pot + toCall)).toFixed(4)) : 0;
  const mdf = Number(computeMdf(potBeforeBet, toCall).toFixed(4));
  const optimalBluffRatio = Number(
    computeOptimalBluffRatio(toCall > 0 ? toCall : pot * 0.66, potBeforeBet).toFixed(4)
  );

  // --- Preflop Evaluation ---
  if (communityCards.length === 0) {
    const mix = getGtoPreflopMix({
      holeCards,
      position,
      facingRaises,
      facingBetBB: (toCall + bigBlind) / bigBlind,
      effectiveStackBB,
      isHeadsUp: opponents === 1,
      canCheck: toCall === 0,
    });

    let recommendedAction: 'raise' | 'call' | 'check' | 'fold' = 'fold';
    let recommendedSizeBB: number | null = null;
    if (mix.raise >= mix.call && mix.raise >= mix.fold && mix.raise > 0) {
      recommendedAction = 'raise';
      recommendedSizeBB =
        effectiveStackBB <= 15
          ? effectiveStackBB
          : facingRaises === 0
            ? position === 'SB'
              ? 3
              : 2.5
            : Number((((toCall + bigBlind) / bigBlind) * (position === 'SB' || position === 'BB' ? 3.5 : 3)).toFixed(1));
    } else if (toCall === 0) {
      recommendedAction = 'check';
    } else if (mix.call >= mix.fold && mix.call > 0) {
      recommendedAction = 'call';
    }

    const rationale =
      effectiveStackBB <= 15
        ? `短码 ${effectiveStackBB}BB Nash 均衡区间：${position} 持 ${canonicalHand}，全下频率 ${Math.round(mix.raise * 100)}%，跟注 ${Math.round(mix.call * 100)}%。`
        : `${position} 位持 ${canonicalHand}（面对 ${facingRaises} 次加注）：GTO 混合策略 加注 ${Math.round(mix.raise * 100)}% / 跟注 ${Math.round(mix.call * 100)}% / 弃牌 ${Math.round(mix.fold * 100)}%。`;

    return {
      ok: true,
      street: 'preflop',
      canonicalHand,
      position,
      effectiveStackBB,
      potOdds,
      mdf,
      optimalBluffRatio,
      geometricBetFraction: Number(computeGeometricBetFraction(pot, effectiveStack, 3).toFixed(3)),
      preflopMix: mix,
      equity: null,
      boardTexture: null,
      blockers: null,
      recommendedAction,
      recommendedSizeBB,
      rationale,
    };
  }

  // --- Postflop Evaluation ---
  const street =
    communityCards.length === 3 ? 'flop' : communityCards.length === 4 ? 'turn' : 'river';
  const streetsRemaining = street === 'flop' ? 3 : street === 'turn' ? 2 : 1;
  const boardTexture = analyzeBoardTexture(communityCards);
  const blockers = evaluateBlockers(holeCards, communityCards, boardTexture);
  const geometricBetFraction = Number(
    computeGeometricBetFraction(pot, effectiveStack, streetsRemaining).toFixed(3)
  );
  const villainTightness = toCall > 0 ? Math.min(0.65, 0.25 + (toCall / potBeforeBet) * 0.25) : 0.22;
  const equity = Number(
    estimatePostflopEquity({
      holeCards,
      board: communityCards,
      opponentCount: opponents,
      villainTightness,
      iterations: 220,
    }).toFixed(4)
  );

  let recommendedAction: 'raise' | 'call' | 'check' | 'fold';
  let recommendedSizeBB: number | null = null;
  let rationale: string;

  if (toCall === 0) {
    if (equity >= 0.66) {
      recommendedAction = 'raise';
      const frac = boardTexture.isDryHighBoard && street === 'flop' ? 0.33 : Math.min(1.0, Math.max(0.5, geometricBetFraction));
      recommendedSizeBB = Number(((pot * frac) / bigBlind).toFixed(1));
      rationale = `胜率 ${(equity * 100).toFixed(1)}% 领先范围，建议价值下注约 ${Math.round(frac * 100)}% 底池（几何尺度 ${Math.round(geometricBetFraction * 100)}%）。`;
    } else if (street === 'river' && equity <= 0.25 && blockers.bluffScore >= 0.5) {
      recommendedAction = 'raise';
      recommendedSizeBB = Number(((pot * 0.75) / bigBlind).toFixed(1));
      rationale = `持有关键阻断牌（阻断评分 ${(blockers.bluffScore * 100).toFixed(0)}%），可在河牌以约 ${Math.round(computeOptimalBluffRatio(pot * 0.75, pot) * 100)}% 均衡诈唬占比执行极化偷池。`;
    } else {
      recommendedAction = 'check';
      rationale = `中等摊牌价值或边缘胜率（${(equity * 100).toFixed(1)}%），建议控池让牌保护过牌范围。`;
    }
  } else {
    if (equity >= 0.8) {
      recommendedAction = 'raise';
      const target = toCall + (pot + toCall) * 0.66;
      recommendedSizeBB = Number((target / bigBlind).toFixed(1));
      rationale = `绝对牌力领先（胜率 ${(equity * 100).toFixed(1)}% >> 底池赔率 ${(potOdds * 100).toFixed(1)}%），建议价值加注打满价值。`;
    } else if (equity >= potOdds + 0.02) {
      recommendedAction = 'call';
      rationale = `估算胜率 ${(equity * 100).toFixed(1)}% 高于所需底池赔率 ${(potOdds * 100).toFixed(1)}%（MDF ${(mdf * 100).toFixed(1)}%），建议跟注防守。`;
    } else {
      recommendedAction = 'fold';
      rationale = `估算胜率 ${(equity * 100).toFixed(1)}% 低于底池赔率 ${(potOdds * 100).toFixed(1)}%，面对当前尺度建议弃牌止损。`;
    }
  }

  return {
    ok: true,
    street,
    canonicalHand,
    position,
    effectiveStackBB,
    potOdds,
    mdf,
    optimalBluffRatio,
    geometricBetFraction,
    preflopMix: null,
    equity,
    boardTexture,
    blockers,
    recommendedAction,
    recommendedSizeBB,
    rationale,
  };
}

/**
 * Optionally enriches a deterministic GTO math report with concise Chinese coaching commentary
 * using DeepSeek (OpenAI-compatible Chat Completions API) when DEEPSEEK_API_KEY is configured.
 */
export async function evaluateGtoSpotWithCoach(
  raw: GtoCoachRequest
): Promise<GtoCoachReport | { ok: false; error: string }> {
  const base = evaluateGtoSpot(raw);
  if (!base.ok || !raw.useLlm) {
    return base;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    return { ...base, llmCoachAdvice: null };
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com').replace(
    /\/+$/,
    ''
  );
  const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 220,
        messages: [
          {
            role: 'system',
            content:
              '你是专业无限注德州扑克 GTO 教练。请基于给定的精确数学指标（手牌、位置、胜率、底池赔率、MDF、阻断牌、建议动作），用 2-3 句简明中文给出实战思路与注意事项，不要编造数据。',
          },
          {
            role: 'user',
            content: JSON.stringify({
              street: base.street,
              hand: base.canonicalHand,
              position: base.position,
              effectiveStackBB: base.effectiveStackBB,
              potOdds: base.potOdds,
              mdf: base.mdf,
              equity: base.equity,
              preflopMix: base.preflopMix,
              blockers: base.blockers,
              recommendedAction: base.recommendedAction,
              recommendedSizeBB: base.recommendedSizeBB,
              rationale: base.rationale,
            }),
          },
        ],
      }),
    });

    if (!res.ok) {
      return { ...base, llmCoachAdvice: null };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const advice = data.choices?.[0]?.message?.content?.trim() || null;
    return { ...base, llmCoachAdvice: advice };
  } catch {
    return { ...base, llmCoachAdvice: null };
  }
}
