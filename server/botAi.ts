import { evaluateBestHand } from '../src/shared/handEvaluator';
import { getAvailableActions } from '../src/shared/pokerEngine';
import type { PlayerAction, TableState } from '../src/shared/types';

export function chooseBotAction(state: TableState, botId: string): PlayerAction {
  const available = getAvailableActions(state, botId);
  if (!available) return { type: 'fold' };

  const bot = state.players.find((p) => p.id === botId);
  if (!bot) return { type: 'fold' };

  const evalRes = evaluateBestHand([...bot.holeCards, ...state.communityCards]);
  const r = Math.random();

  // Compute hand strength score on a 0..1 scale
  let strength = 0.25;
  if (state.communityCards.length === 0) {
    const r1 = bot.holeCards[0]?.rank ?? 2;
    const r2 = bot.holeCards[1]?.rank ?? 2;
    const suited = bot.holeCards[0]?.suit === bot.holeCards[1]?.suit;
    if (r1 === r2) {
      strength = 0.65 + (r1 / 14) * 0.3;
    } else {
      strength = 0.2 + ((r1 + r2) / 28) * 0.45 + (suited ? 0.08 : 0);
    }
  } else {
    strength = Math.min(0.98, 0.25 + evalRes.category * 0.14);
  }

  // Free check available
  if (available.canCheck) {
    if (available.canRaise && (strength > 0.7 || r > 0.84)) {
      const target = Math.min(
        available.maxRaiseTo,
        Math.max(available.minRaiseTo, Math.round(state.pot * 0.5))
      );
      if (target >= available.minRaiseTo) {
        return { type: 'raise', amount: target };
      }
    }
    return { type: 'check' };
  }

  // Facing a bet
  const callRatio = available.callAmount / Math.max(1, bot.chips + available.callAmount);
  if (strength >= 0.72 && available.canRaise && r > 0.55) {
    const raiseSize = Math.min(
      available.maxRaiseTo,
      Math.max(available.minRaiseTo, state.currentBet + state.bigBlind * 2)
    );
    return { type: 'raise', amount: raiseSize };
  }

  if (strength > 0.42 || callRatio < 0.12 || available.callAmount <= state.bigBlind) {
    return { type: 'call' };
  }

  if (r > 0.78 && callRatio < 0.28) {
    return { type: 'call' };
  }

  return { type: 'fold' };
}
