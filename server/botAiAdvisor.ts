import type { PlayerAction, TableState } from '../src/shared/types';
import { getAvailableActions } from '../src/shared/pokerEngine';
import { chooseBotAction, evaluatePostflopStrength, resolveGtoPosition } from './botAi';
import { analyzeBoardTexture, computeMdf, evaluateBlockers, toCanonicalHandKey } from './gtoRanges';
import type { OpponentExploitRead, SessionOpponentProfiler } from './opponentProfiler';

/**
 * Optional Hybrid LLM Tactical Advisor (PokerBench-style structured reasoning overlay).
 *
 * Design principles:
 * 1. Deterministic GTO v3 + RNR Safe Exploitation is ALWAYS the primary engine.
 * 2. When AI_BOT_ENHANCEMENT=true and DEEPSEEK_API_KEY is configured, high-leverage
 *    postflop decisions (>= 8 BB pot) may query DeepSeek within a strict 1,800ms budget
 *    using structured GTO math + live Bayesian opponent profile.
 * 3. Safety Guardrail: Any LLM suggestion is strictly verified against legal actions and
 *    cannot override clear mathematical nuts folds or illegal sizings; timeouts/errors
 *    fall back silently to the deterministic GTO+RNR action with zero gameplay stall.
 */

export interface BotAdvisorDecision {
  action: PlayerAction;
  source: 'gto-rnr' | 'gto-rnr+llm';
  llmRationale?: string;
}

export async function chooseBotActionWithAiEnhancement(params: {
  state: TableState;
  botId: string;
  profiler?: SessionOpponentProfiler;
  rng?: () => number;
  enableLlm?: boolean;
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  deepseekModel?: string;
  timeoutMs?: number;
}): Promise<BotAdvisorDecision> {
  const baseline = chooseBotAction(params.state, params.botId, params.rng, params.profiler);
  const enabled =
    params.enableLlm ?? process.env.AI_BOT_ENHANCEMENT?.trim().toLowerCase() === 'true';
  const apiKey = (params.deepseekApiKey ?? process.env.DEEPSEEK_API_KEY ?? '').trim();

  if (!enabled || !apiKey) {
    return { action: baseline, source: 'gto-rnr' };
  }

  const { state, botId } = params;
  // Only invoke LLM enhancement on non-trivial postflop spots (>= 8 BB pot)
  if (state.phase === 'preflop' || state.communityCards.length < 3 || state.pot < state.bigBlind * 8) {
    return { action: baseline, source: 'gto-rnr' };
  }

  const available = getAvailableActions(state, botId);
  const bot = state.players.find((p) => p.id === botId);
  if (!available || !bot || bot.holeCards.length < 2) {
    return { action: baseline, source: 'gto-rnr' };
  }

  const strength = evaluatePostflopStrength(bot.holeCards, state.communityCards);
  // Skip LLM call on trivial absolute nuts or pure check-back spots to preserve latency
  if (strength >= 0.94 && baseline.type === 'raise') {
    return { action: baseline, source: 'gto-rnr' };
  }

  const texture = analyzeBoardTexture(state.communityCards);
  const blockers = evaluateBlockers(bot.holeCards, state.communityCards, texture);
  const callAmt = available.canCall ? available.callAmount : 0;
  const mdf = computeMdf(Math.max(1, state.pot - callAmt), callAmt);

  const opponents = state.players.filter((p) => p.inHand && !p.folded && p.id !== botId);
  const primaryOpp = opponents.find((p) => !p.isBot) ?? opponents[0] ?? null;
  const oppRead: OpponentExploitRead | null =
    primaryOpp && params.profiler ? params.profiler.getOpponentRead(primaryOpp.id) : null;

  const baseUrl = (
    params.deepseekBaseUrl ??
    process.env.DEEPSEEK_BASE_URL ??
    'https://api.deepseek.com'
  )
    .trim()
    .replace(/\/+$/, '');
  const model = (params.deepseekModel ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat').trim();
  const timeoutMs = Math.max(500, Math.min(3500, params.timeoutMs ?? 1800));

  const spotSummary = {
    street: state.phase,
    position: resolveGtoPosition(state, bot.seatIndex),
    hand: toCanonicalHandKey(bot.holeCards),
    board: state.communityCards.map((c) => `${c.rank}${c.suit[0]}`),
    potBB: Number((state.pot / Math.max(1, state.bigBlind)).toFixed(1)),
    toCallBB: Number((callAmt / Math.max(1, state.bigBlind)).toFixed(1)),
    stackBB: Number((bot.chips / Math.max(1, state.bigBlind)).toFixed(1)),
    handStrength: Number(strength.toFixed(2)),
    mdfPct: Math.round(mdf * 100),
    blockerScore: Number(blockers.bluffScore.toFixed(2)),
    baselineGtoRnrAction: baseline,
    opponentProfile: oppRead
      ? {
          archetype: oppRead.archetype,
          hands: oppRead.handsObserved,
          vpipPct: Math.round(oppRead.posterior.vpipPosterior * 100),
          foldToBetPct: Math.round(oppRead.posterior.foldToBetPosterior * 100),
          af: Number(oppRead.aggressionFactor.toFixed(2)),
          leaks: oppRead.leakTags,
        }
      : null,
  };

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a high-stakes NLHE GTO+Exploitative tactical advisor. Return strictly JSON: {"action":"fold"|"check"|"call"|"raise","betPotFrac":0.33|0.5|0.66|0.75|1.0|1.25,"reason":"short zh reason"}. Keep baselineGtoRnrAction unless opponent profile strongly justifies an exploitative shift.',
          },
          { role: 'user', content: JSON.stringify(spotSummary) },
        ],
      }),
    });

    if (!res.ok) {
      return { action: baseline, source: 'gto-rnr' };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return { action: baseline, source: 'gto-rnr' };

    const parsed = JSON.parse(raw) as {
      action?: string;
      betPotFrac?: number;
      reason?: string;
    };
    const suggested = parsed.action;
    const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 120) : undefined;

    // Safety guardrails: never fold monster hands (>=0.82 strength) or free checks
    if (suggested === 'fold') {
      if (available.canCheck || strength >= 0.78) {
        return { action: baseline, source: 'gto-rnr' };
      }
      return { action: { type: 'fold' }, source: 'gto-rnr+llm', llmRationale: reason };
    }
    if (suggested === 'check') {
      if (!available.canCheck) return { action: baseline, source: 'gto-rnr' };
      return { action: { type: 'check' }, source: 'gto-rnr+llm', llmRationale: reason };
    }
    if (suggested === 'call') {
      if (!available.canCall) return { action: baseline, source: 'gto-rnr' };
      return { action: { type: 'call' }, source: 'gto-rnr+llm', llmRationale: reason };
    }
    if (suggested === 'raise' && available.canRaise) {
      const frac =
        typeof parsed.betPotFrac === 'number' && Number.isFinite(parsed.betPotFrac)
          ? Math.max(0.25, Math.min(1.5, parsed.betPotFrac))
          : 0.66;
      const basePot = Math.max(state.pot, state.bigBlind * 2);
      const desired =
        state.currentBet === 0
          ? Math.round(basePot * frac)
          : Math.round(state.currentBet + (basePot + callAmt) * frac);
      const unit = Math.max(1, state.smallBlind);
      const snapped = Math.round(desired / unit) * unit;
      const clamped = Math.min(available.maxRaiseTo, Math.max(available.minRaiseTo, snapped));
      return { action: { type: 'raise', amount: clamped }, source: 'gto-rnr+llm', llmRationale: reason };
    }

    return { action: baseline, source: 'gto-rnr' };
  } catch {
    return { action: baseline, source: 'gto-rnr' };
  }
}
