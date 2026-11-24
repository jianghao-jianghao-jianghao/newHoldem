import type { PlayerAction, StreetPhase, TableState } from '../src/shared/types';
import type { PlayerBehaviorStats } from '../src/shared/playerInsights';
import { evaluateBestHand } from '../src/shared/handEvaluator';

/**
 * Bayesian Opponent Profiler & Restricted Nash Response (RNR) Safe-Exploitation Engine.
 *
 * Grounded in:
 * - Johanson, Zinkevich & Bowling (NIPS 2007), "Computing Robust Counter-Strategies" (RNR)
 * - Bard, Johanson, Burch & Bowling (2013), "Data-Biased Robust Counter Strategies" (DBR)
 * - Beta-Binomial / Dirichlet Prior Shrinkage:
 *     theta_post = (kappa * pi_GTO + c) / (kappa + n),   w = n / (n + kappa)
 *   blending GTO equilibrium with targeted Best Response via safety margin lambda in [0.70, 0.95].
 *
 * Strictly room-session scoped (with optional low-weight prior warm-start for logged-in profiles).
 */

export type OpponentExploitArchetype =
  | 'unknown'
  | 'balanced'
  | 'overfolder_nit'
  | 'calling_station'
  | 'maniac_bluffer'
  | 'cbet_spammer'
  | 'limp_passive'
  | 'fit_or_fold';

export interface SessionOpponentStats {
  playerId: string;
  handsObserved: number;
  vpipHands: number;
  pfrHands: number;
  limpHands: number;
  threeBetOpps: number;
  threeBetCount: number;
  foldTo3BetOpps: number;
  foldTo3BetCount: number;
  cbetOpps: number;
  cbetCount: number;
  foldToCbetOpps: number;
  foldToCbetCount: number;
  foldToBetOpps: number;
  foldToBetCount: number;
  postflopBetsRaises: number;
  postflopCalls: number;
  checkRaises: number;
  overbets: number;
  riverBets: number;
  sawFlopHands: number;
  showdownBluffsCaught: number;
  showdownValueBets: number;
  showdownHands: number;
  wonAtShowdownHands: number;
  turnBarrelOpps: number;
  turnBarrelCount: number;
}

export interface BayesianPosteriorMetrics {
  vpipPosterior: number;
  pfrPosterior: number;
  limpPosterior: number;
  threeBetPosterior: number;
  foldTo3BetPosterior: number;
  cbetPosterior: number;
  foldToCbetPosterior: number;
  foldToBetPosterior: number;
  wtsdPosterior: number;
  wsdPosterior: number;
  turnBarrelPosterior: number;
}

export interface OpponentExploitRead {
  playerId: string;
  handsObserved: number;
  confidence: number; // 0..1 Bayesian confidence weight
  rnrSafetyLambda: number; // 0.70..0.95 Restricted Nash Response safety factor
  archetype: OpponentExploitArchetype;
  label: string;
  vpipRate: number;
  pfrRate: number;
  limpRate: number;
  threeBetRate: number;
  foldTo3BetRate: number;
  foldToBetRate: number;
  cbetRate: number;
  foldToCbetRate: number;
  wtsdRate: number;
  wsdRate: number;
  aggressionFactor: number;
  bluffCaughtRate: number;
  posterior: BayesianPosteriorMetrics;
  leakTags: string[];
}

export interface ExploitPlan {
  /** Confidence weight of this exploit overlay [0..1] */
  confidence: number;
  /** Effective Restricted Nash Response blend weight (lambda * confidence) [0..0.95] */
  rnrWeight: number;
  targetArchetype: OpponentExploitArchetype;
  /** Additive adjustment to preflop RFI / steal frequency [-0.12 .. +0.20] */
  preflopOpenDelta: number;
  /** Extra isolation raise frequency against passive limpers [0 .. +0.24] */
  isoLimpBonus: number;
  /** Additive 3-bet bluff adjustment [-0.10 .. +0.16] */
  threeBetBluffDelta: number;
  /** Multiplier on postflop & river bluff frequencies [0.18 .. 1.65] */
  bluffFreqMult: number;
  /** Additive adjustment to value-betting equity threshold [-0.10 .. +0.06] (negative = bet thinner for value) */
  valueThresholdDelta: number;
  /** Multiplier on value bet sizing [0.85 .. 1.38] (higher = extract thicker value vs stations) */
  valueSizeMult: number;
  /** Additive adjustment to required equity when facing a bet [-0.10 .. +0.08] (negative = call wider vs bluffer) */
  callRequiredEquityDelta: number;
  /** Extra slowplay / trap probability with monster hands against maniacs [0 .. +0.35] */
  trapSlowplayBonus: number;
  /** Extra float / check-raise counter frequency against C-Bet spammers [0 .. +0.28] */
  floatCheckRaiseBonus: number;
  /** Human-readable counter-strategy note for AI chat/coach integration */
  counterSummary: string;
}

export const NEUTRAL_EXPLOIT_PLAN: ExploitPlan = {
  confidence: 0,
  rnrWeight: 0,
  targetArchetype: 'unknown',
  preflopOpenDelta: 0,
  isoLimpBonus: 0,
  threeBetBluffDelta: 0,
  bluffFreqMult: 1,
  valueThresholdDelta: 0,
  valueSizeMult: 1,
  callRequiredEquityDelta: 0,
  trapSlowplayBonus: 0,
  floatCheckRaiseBonus: 0,
  counterSummary: '样本尚浅，维持纯 GTO 均衡基线策略。',
};

/** 6-max GTO population priors (pi_GTO) & pseudo-counts (kappa) for Beta-Binomial shrinkage */
const GTO_PRIORS = {
  vpip: { mean: 0.27, kappa: 6 },
  pfr: { mean: 0.21, kappa: 6 },
  limp: { mean: 0.04, kappa: 6 },
  threeBet: { mean: 0.085, kappa: 8 },
  foldTo3Bet: { mean: 0.52, kappa: 8 },
  cbet: { mean: 0.58, kappa: 6 },
  foldToCbet: { mean: 0.44, kappa: 6 },
  foldToBet: { mean: 0.42, kappa: 6 },
  wtsd: { mean: 0.28, kappa: 8 },
  wsd: { mean: 0.52, kappa: 8 },
  turnBarrel: { mean: 0.54, kappa: 6 },
} as const;

interface PriorWarmStart {
  vpipMean: number;
  pfrMean: number;
  limpMean: number;
  foldToBetMean: number;
  cbetMean: number;
  weight: number; // capped <= 3 equivalent hands so live session dominates
}

interface HandTrackingScratch {
  handNumber: number;
  vpipIds: Set<string>;
  pfrIds: Set<string>;
  limpIds: Set<string>;
  threeBetOppIds: Set<string>;
  threeBetIds: Set<string>;
  openedIds: Set<string>;
  foldTo3BetOppIds: Set<string>;
  preflopAggressorId: string | null;
  sawFlopIds: Set<string>;
  flopCheckedIds: Set<string>;
  flopCbetOppDone: boolean;
  flopCbetFired: boolean;
  flopCbetFacedIds: Set<string>;
  turnBarrelOppDone: boolean;
  riverBetIds: Set<string>;
}

function createEmptySessionStats(playerId: string): SessionOpponentStats {
  return {
    playerId,
    handsObserved: 0,
    vpipHands: 0,
    pfrHands: 0,
    limpHands: 0,
    threeBetOpps: 0,
    threeBetCount: 0,
    foldTo3BetOpps: 0,
    foldTo3BetCount: 0,
    cbetOpps: 0,
    cbetCount: 0,
    foldToCbetOpps: 0,
    foldToCbetCount: 0,
    foldToBetOpps: 0,
    foldToBetCount: 0,
    postflopBetsRaises: 0,
    postflopCalls: 0,
    checkRaises: 0,
    overbets: 0,
    riverBets: 0,
    sawFlopHands: 0,
    showdownBluffsCaught: 0,
    showdownValueBets: 0,
    showdownHands: 0,
    wonAtShowdownHands: 0,
    turnBarrelOpps: 0,
    turnBarrelCount: 0,
  };
}

function createHandScratch(handNumber: number): HandTrackingScratch {
  return {
    handNumber,
    vpipIds: new Set(),
    pfrIds: new Set(),
    limpIds: new Set(),
    threeBetOppIds: new Set(),
    threeBetIds: new Set(),
    openedIds: new Set(),
    foldTo3BetOppIds: new Set(),
    preflopAggressorId: null,
    sawFlopIds: new Set(),
    flopCheckedIds: new Set(),
    flopCbetOppDone: false,
    flopCbetFired: false,
    flopCbetFacedIds: new Set(),
    turnBarrelOppDone: false,
    riverBetIds: new Set(),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function betaPosterior(
  successes: number,
  trials: number,
  priorMean: number,
  priorKappa: number
): number {
  const n = Math.max(0, trials);
  const c = Math.max(0, Math.min(n, successes));
  return (priorKappa * priorMean + c) / (priorKappa + n);
}

export class SessionOpponentProfiler {
  private readonly statsMap = new Map<string, SessionOpponentStats>();
  private readonly priorWarmStarts = new Map<string, PriorWarmStart>();
  private scratch: HandTrackingScratch | null = null;

  private ensureStats(playerId: string): SessionOpponentStats {
    let entry = this.statsMap.get(playerId);
    if (!entry) {
      entry = createEmptySessionStats(playerId);
      this.statsMap.set(playerId, entry);
    }
    return entry;
  }

  private ensureScratch(handNumber: number): HandTrackingScratch {
    if (!this.scratch || this.scratch.handNumber !== handNumber) {
      this.scratch = createHandScratch(handNumber);
    }
    return this.scratch;
  }

  /**
   * Optional gentle Bayesian prior warm-start from persisted player behavior stats.
   * Weight is strictly capped (<= 3 pseudo-hands) so live table behavior always takes over quickly.
   */
  public seedPriorFromBehaviorStats(
    playerId: string,
    stats: PlayerBehaviorStats | null | undefined
  ): void {
    if (!stats || stats.handsPlayed < 8) return;
    const h = Math.max(1, stats.handsPlayed);
    const weight = clamp(stats.handsPlayed / 20, 0.8, 3.0);
    this.priorWarmStarts.set(playerId, {
      vpipMean: clamp(stats.vpipHands / h, 0.08, 0.85),
      pfrMean: clamp(stats.pfrHands / h, 0.04, 0.7),
      limpMean: clamp(stats.limpHands / h, 0, 0.6),
      foldToBetMean:
        stats.foldToBetOpps >= 4
          ? clamp(stats.foldToBetCount / stats.foldToBetOpps, 0.1, 0.85)
          : GTO_PRIORS.foldToBet.mean,
      cbetMean:
        stats.cbetOpps >= 4
          ? clamp(stats.cbetCount / stats.cbetOpps, 0.15, 0.92)
          : GTO_PRIORS.cbet.mean,
      weight,
    });
  }

  /**
   * Call BEFORE applying `action` to `state` so pre-action pot, currentBet, and street raises are exact.
   */
  public observeAction(
    stateBefore: TableState,
    playerId: string,
    action: PlayerAction
  ): void {
    if (stateBefore.phase === 'waiting' || stateBefore.phase === 'showdown') return;
    const player = stateBefore.players.find((p) => p.id === playerId);
    if (!player || !player.inHand) return;

    const stats = this.ensureStats(playerId);
    const scratch = this.ensureScratch(stateBefore.handNumber);
    const street: StreetPhase = stateBefore.phase;
    const toCall = Math.max(0, stateBefore.currentBet - player.currentBet);
    const facingBet = toCall > 0;
    const streetRaises = stateBefore.currentPotTimeline.filter(
      (pt) =>
        pt.street === street &&
        (pt.actionType === 'raise' || pt.actionType === 'bet' || pt.actionType === 'allin')
    ).length;

    if (street === 'preflop') {
      if (streetRaises === 1 && !scratch.threeBetOppIds.has(playerId)) {
        scratch.threeBetOppIds.add(playerId);
        stats.threeBetOpps += 1;
      }

      if (
        streetRaises >= 2 &&
        scratch.openedIds.has(playerId) &&
        !scratch.foldTo3BetOppIds.has(playerId)
      ) {
        scratch.foldTo3BetOppIds.add(playerId);
        stats.foldTo3BetOpps += 1;
        if (action.type === 'fold') {
          stats.foldTo3BetCount += 1;
        }
      }

      if (action.type === 'raise') {
        scratch.vpipIds.add(playerId);
        scratch.pfrIds.add(playerId);
        scratch.preflopAggressorId = playerId;
        if (streetRaises === 0) {
          scratch.openedIds.add(playerId);
        } else if (streetRaises === 1 && !scratch.threeBetIds.has(playerId)) {
          scratch.threeBetIds.add(playerId);
          stats.threeBetCount += 1;
        }
      } else if (action.type === 'call') {
        scratch.vpipIds.add(playerId);
        if (streetRaises === 0) {
          scratch.limpIds.add(playerId);
        }
        if (facingBet && streetRaises >= 1) {
          stats.foldToBetOpps += 1;
        }
      } else if (action.type === 'fold') {
        if (facingBet && streetRaises >= 1) {
          stats.foldToBetOpps += 1;
          stats.foldToBetCount += 1;
        }
      }
      return;
    }

    // Track everyone who reaches postflop
    scratch.sawFlopIds.add(playerId);

    // Postflop streets (flop / turn / river)
    if (street === 'flop') {
      if (
        !scratch.flopCbetOppDone &&
        scratch.preflopAggressorId === playerId &&
        !facingBet
      ) {
        scratch.flopCbetOppDone = true;
        stats.cbetOpps += 1;
        if (action.type === 'raise') {
          stats.cbetCount += 1;
          scratch.flopCbetFired = true;
        }
      }

      if (
        scratch.flopCbetFired &&
        facingBet &&
        playerId !== scratch.preflopAggressorId &&
        !scratch.flopCbetFacedIds.has(playerId)
      ) {
        scratch.flopCbetFacedIds.add(playerId);
        stats.foldToCbetOpps += 1;
        if (action.type === 'fold') {
          stats.foldToCbetCount += 1;
        }
      }

      if (action.type === 'check') {
        scratch.flopCheckedIds.add(playerId);
      } else if (action.type === 'raise' && facingBet && scratch.flopCheckedIds.has(playerId)) {
        stats.checkRaises += 1;
      }
    }

    if (
      street === 'turn' &&
      !scratch.turnBarrelOppDone &&
      scratch.flopCbetFired &&
      scratch.preflopAggressorId === playerId &&
      !facingBet
    ) {
      scratch.turnBarrelOppDone = true;
      stats.turnBarrelOpps += 1;
      if (action.type === 'raise') {
        stats.turnBarrelCount += 1;
      }
    }

    if (action.type === 'raise') {
      stats.postflopBetsRaises += 1;
      const desiredTotal = action.amount ?? stateBefore.currentBet + stateBefore.minRaise;
      const added = Math.max(0, desiredTotal - player.currentBet);
      const potBefore = Math.max(stateBefore.bigBlind, stateBefore.pot);
      if (added > potBefore * 1.05) {
        stats.overbets += 1;
      }
      if (street === 'river') {
        stats.riverBets += 1;
        scratch.riverBetIds.add(playerId);
      }
    } else if (action.type === 'call') {
      stats.postflopCalls += 1;
      if (facingBet) {
        stats.foldToBetOpps += 1;
      }
    } else if (action.type === 'fold') {
      if (facingBet) {
        stats.foldToBetOpps += 1;
        stats.foldToBetCount += 1;
      }
    }
  }

  /**
   * Call once when a hand finishes (phase === 'showdown') to commit hand-level
   * counters and showdown bluff/value evidence strictly for the active session.
   */
  public observeHandEnd(stateAfter: TableState): void {
    const scratch = this.ensureScratch(stateAfter.handNumber);
    const nonFolded = stateAfter.players.filter((p) => p.inHand && !p.folded);
    const actualShowdown = nonFolded.length >= 2 && stateAfter.communityCards.length >= 5;
    const winnerIds = new Set(stateAfter.winners.map((w) => w.playerId));

    for (const p of stateAfter.players) {
      if (!p.inHand) continue;
      const stats = this.ensureStats(p.id);
      stats.handsObserved += 1;
      if (scratch.vpipIds.has(p.id)) stats.vpipHands += 1;
      if (scratch.pfrIds.has(p.id)) stats.pfrHands += 1;
      if (scratch.limpIds.has(p.id) && !scratch.pfrIds.has(p.id)) stats.limpHands += 1;
      if (scratch.sawFlopIds.has(p.id) || (stateAfter.communityCards.length >= 3 && !p.folded)) {
        stats.sawFlopHands += 1;
      }

      if (actualShowdown && !p.folded && p.holeCards.length === 2) {
        stats.showdownHands += 1;
        if (winnerIds.has(p.id)) {
          stats.wonAtShowdownHands += 1;
        }
        if (scratch.riverBetIds.has(p.id)) {
          const ev = evaluateBestHand([...p.holeCards, ...stateAfter.communityCards]);
          if (ev.category === 0) {
            stats.showdownBluffsCaught += 1;
          } else if (ev.category >= 2) {
            stats.showdownValueBets += 1;
          }
        }
      }
    }
    this.scratch = null;
  }

  public getRawStats(playerId: string): SessionOpponentStats | null {
    return this.statsMap.get(playerId) ?? null;
  }

  public resetPlayer(playerId: string): void {
    this.statsMap.delete(playerId);
    this.priorWarmStarts.delete(playerId);
  }

  public clearAll(): void {
    this.statsMap.clear();
    this.priorWarmStarts.clear();
    this.scratch = null;
  }

  /**
   * Computes Bayesian-smoothed posterior rates + Restricted Nash Response safety coefficient.
   */
  public getOpponentRead(playerId: string): OpponentExploitRead {
    const s = this.statsMap.get(playerId);
    const warm = this.priorWarmStarts.get(playerId);

    const defaultPosterior: BayesianPosteriorMetrics = {
      vpipPosterior: warm?.vpipMean ?? GTO_PRIORS.vpip.mean,
      pfrPosterior: warm?.pfrMean ?? GTO_PRIORS.pfr.mean,
      limpPosterior: warm?.limpMean ?? GTO_PRIORS.limp.mean,
      threeBetPosterior: GTO_PRIORS.threeBet.mean,
      foldTo3BetPosterior: GTO_PRIORS.foldTo3Bet.mean,
      cbetPosterior: warm?.cbetMean ?? GTO_PRIORS.cbet.mean,
      foldToCbetPosterior: GTO_PRIORS.foldToCbet.mean,
      foldToBetPosterior: warm?.foldToBetMean ?? GTO_PRIORS.foldToBet.mean,
      wtsdPosterior: GTO_PRIORS.wtsd.mean,
      wsdPosterior: GTO_PRIORS.wsd.mean,
      turnBarrelPosterior: GTO_PRIORS.turnBarrel.mean,
    };

    if (!s || s.handsObserved < 2) {
      return {
        playerId,
        handsObserved: s?.handsObserved ?? 0,
        confidence: 0,
        rnrSafetyLambda: 0.7,
        archetype: 'unknown',
        label: '样本不足',
        vpipRate: defaultPosterior.vpipPosterior,
        pfrRate: defaultPosterior.pfrPosterior,
        limpRate: defaultPosterior.limpPosterior,
        threeBetRate: defaultPosterior.threeBetPosterior,
        foldTo3BetRate: defaultPosterior.foldTo3BetPosterior,
        foldToBetRate: defaultPosterior.foldToBetPosterior,
        cbetRate: defaultPosterior.cbetPosterior,
        foldToCbetRate: defaultPosterior.foldToCbetPosterior,
        wtsdRate: defaultPosterior.wtsdPosterior,
        wsdRate: defaultPosterior.wsdPosterior,
        aggressionFactor: 2.0,
        bluffCaughtRate: 0,
        posterior: defaultPosterior,
        leakTags: [],
      };
    }

    const hands = s.handsObserved;
    // Smooth Bayesian confidence ramp: ~0.5 by 5 hands, ~0.85 by 12 hands, 1.0 by 18+ hands
    const confidence = clamp((hands - 1) / 8, 0.14, 1);
    // Restricted Nash Response safety factor λ: stricter on tiny samples, relaxes with evidence
    const rnrSafetyLambda = Number(clamp(0.72 + (hands / (hands + 14)) * 0.23, 0.72, 0.95).toFixed(2));

    const vpipPrior = warm
      ? (GTO_PRIORS.vpip.mean * 3 + warm.vpipMean * warm.weight) / (3 + warm.weight)
      : GTO_PRIORS.vpip.mean;
    const pfrPrior = warm
      ? (GTO_PRIORS.pfr.mean * 3 + warm.pfrMean * warm.weight) / (3 + warm.weight)
      : GTO_PRIORS.pfr.mean;
    const limpPrior = warm
      ? (GTO_PRIORS.limp.mean * 3 + warm.limpMean * warm.weight) / (3 + warm.weight)
      : GTO_PRIORS.limp.mean;
    const foldToBetPrior = warm
      ? (GTO_PRIORS.foldToBet.mean * 3 + warm.foldToBetMean * warm.weight) / (3 + warm.weight)
      : GTO_PRIORS.foldToBet.mean;
    const cbetPrior = warm
      ? (GTO_PRIORS.cbet.mean * 3 + warm.cbetMean * warm.weight) / (3 + warm.weight)
      : GTO_PRIORS.cbet.mean;

    const posterior: BayesianPosteriorMetrics = {
      vpipPosterior: Number(betaPosterior(s.vpipHands, hands, vpipPrior, GTO_PRIORS.vpip.kappa).toFixed(3)),
      pfrPosterior: Number(betaPosterior(s.pfrHands, hands, pfrPrior, GTO_PRIORS.pfr.kappa).toFixed(3)),
      limpPosterior: Number(betaPosterior(s.limpHands, hands, limpPrior, GTO_PRIORS.limp.kappa).toFixed(3)),
      threeBetPosterior: Number(betaPosterior(s.threeBetCount, s.threeBetOpps, GTO_PRIORS.threeBet.mean, GTO_PRIORS.threeBet.kappa).toFixed(3)),
      foldTo3BetPosterior: Number(betaPosterior(s.foldTo3BetCount, s.foldTo3BetOpps, GTO_PRIORS.foldTo3Bet.mean, GTO_PRIORS.foldTo3Bet.kappa).toFixed(3)),
      cbetPosterior: Number(betaPosterior(s.cbetCount, s.cbetOpps, cbetPrior, GTO_PRIORS.cbet.kappa).toFixed(3)),
      foldToCbetPosterior: Number(betaPosterior(s.foldToCbetCount, s.foldToCbetOpps, GTO_PRIORS.foldToCbet.mean, GTO_PRIORS.foldToCbet.kappa).toFixed(3)),
      foldToBetPosterior: Number(betaPosterior(s.foldToBetCount, s.foldToBetOpps, foldToBetPrior, GTO_PRIORS.foldToBet.kappa).toFixed(3)),
      wtsdPosterior: Number(betaPosterior(s.showdownHands, Math.max(1, s.sawFlopHands), GTO_PRIORS.wtsd.mean, GTO_PRIORS.wtsd.kappa).toFixed(3)),
      wsdPosterior: Number(betaPosterior(s.wonAtShowdownHands, s.showdownHands, GTO_PRIORS.wsd.mean, GTO_PRIORS.wsd.kappa).toFixed(3)),
      turnBarrelPosterior: Number(betaPosterior(s.turnBarrelCount, s.turnBarrelOpps, GTO_PRIORS.turnBarrel.mean, GTO_PRIORS.turnBarrel.kappa).toFixed(3)),
    };

    // Raw observed rates for fast-adaptation HUD display & archetype thresholds
    const vpipRate = s.vpipHands / hands;
    const pfrRate = s.pfrHands / hands;
    const limpRate = s.limpHands / hands;
    const threeBetRate = s.threeBetOpps >= 2 ? s.threeBetCount / s.threeBetOpps : posterior.threeBetPosterior;
    const foldTo3BetRate = s.foldTo3BetOpps >= 2 ? s.foldTo3BetCount / s.foldTo3BetOpps : posterior.foldTo3BetPosterior;
    const foldToBetRate =
      s.foldToBetOpps >= 2 ? s.foldToBetCount / s.foldToBetOpps : posterior.foldToBetPosterior;
    const cbetRate = s.cbetOpps >= 2 ? s.cbetCount / s.cbetOpps : posterior.cbetPosterior;
    const foldToCbetRate =
      s.foldToCbetOpps >= 2 ? s.foldToCbetCount / s.foldToCbetOpps : posterior.foldToCbetPosterior;
    const wtsdRate = s.sawFlopHands >= 2 ? s.showdownHands / s.sawFlopHands : posterior.wtsdPosterior;
    const wsdRate = s.showdownHands >= 2 ? s.wonAtShowdownHands / s.showdownHands : posterior.wsdPosterior;

    const aggressionFactor =
      s.postflopCalls > 0
        ? s.postflopBetsRaises / s.postflopCalls
        : s.postflopBetsRaises > 0
          ? Math.min(5, s.postflopBetsRaises + 1)
          : 1.5;
    const bluffCaughtRate =
      s.riverBets >= 1
        ? s.showdownBluffsCaught / Math.max(1, s.showdownBluffsCaught + s.showdownValueBets)
        : 0;

    let archetype: OpponentExploitArchetype = 'balanced';
    let label = '均衡对手';

    if (
      (vpipRate >= 0.46 && aggressionFactor >= 2.5 && pfrRate >= 0.3) ||
      (s.showdownBluffsCaught >= 1 && aggressionFactor >= 2.3) ||
      (s.overbets >= 2 && aggressionFactor >= 2.8)
    ) {
      archetype = 'maniac_bluffer';
      label = '高频诈唬/疯狂施压';
    } else if (
      (vpipRate >= 0.42 && foldToBetRate <= 0.28 && aggressionFactor <= 1.5) ||
      (s.foldToBetOpps >= 3 && foldToBetRate <= 0.22 && s.postflopCalls >= 3)
    ) {
      archetype = 'calling_station';
      label = '粘滞跟注站';
    } else if (
      (s.foldToBetOpps >= 3 && foldToBetRate >= 0.62) ||
      (hands >= 4 && vpipRate <= 0.2 && foldToBetRate >= 0.5)
    ) {
      archetype = 'overfolder_nit';
      label = '过度弃牌/紧缩岩石';
    } else if (s.cbetOpps >= 3 && cbetRate >= 0.78) {
      archetype = 'cbet_spammer';
      label = '高频持续下注';
    } else if (s.foldToCbetOpps >= 2 && foldToCbetRate >= 0.65) {
      archetype = 'fit_or_fold';
      label = '翻牌击中即打/不中即弃';
    } else if (hands >= 3 && limpRate >= 0.32 && pfrRate <= 0.14) {
      archetype = 'limp_passive';
      label = '高频平跟被动型';
    }

    const leakTags: string[] = [];
    if (posterior.foldToBetPosterior >= 0.52) leakTags.push('过度弃牌 (>MDF)');
    if (posterior.foldToBetPosterior <= 0.32) leakTags.push('低弃牌粘滞跟注');
    if (posterior.limpPosterior >= 0.18) leakTags.push('高频平跟范围封顶');
    if (posterior.cbetPosterior >= 0.72) leakTags.push('翻牌过度持续下注');
    if (posterior.foldTo3BetPosterior >= 0.65 && s.foldTo3BetOpps >= 2) leakTags.push('面对 3-Bet 过度弃牌');
    if (s.showdownBluffsCaught >= 1 || aggressionFactor >= 2.8) leakTags.push('高频诈唬倾向');
    if (posterior.wtsdPosterior >= 0.38 && s.sawFlopHands >= 3) leakTags.push('高摊牌率');

    return {
      playerId,
      handsObserved: hands,
      confidence,
      rnrSafetyLambda,
      archetype,
      label,
      vpipRate,
      pfrRate,
      limpRate,
      threeBetRate,
      foldTo3BetRate,
      foldToBetRate,
      cbetRate,
      foldToCbetRate,
      wtsdRate,
      wsdRate,
      aggressionFactor,
      bluffCaughtRate,
      posterior,
      leakTags,
    };
  }

  /**
   * Computes a Restricted Nash Response (RNR) safe exploitative strategy overlay:
   *   sigma_RNR = (1 - lambda * w) * sigma_GTO + (lambda * w) * BR(theta_post)
   */
  public buildExploitPlan(primaryOpponentId: string | null): ExploitPlan {
    if (!primaryOpponentId) return NEUTRAL_EXPLOIT_PLAN;
    const read = this.getOpponentRead(primaryOpponentId);
    if (read.confidence <= 0 || read.archetype === 'unknown') {
      return NEUTRAL_EXPLOIT_PLAN;
    }

    const w = read.confidence;
    const rnrWeight = clamp(w * read.rnrSafetyLambda, 0.1, 0.95);
    let preflopOpenDelta = 0;
    let isoLimpBonus = 0;
    let threeBetBluffDelta = 0;
    let bluffFreqMult = 1;
    let valueThresholdDelta = 0;
    let valueSizeMult = 1;
    let callRequiredEquityDelta = 0;
    let trapSlowplayBonus = 0;
    let floatCheckRaiseBonus = 0;
    let counterSummary = '维持均衡基线并按后验偏差微调频率。';

    switch (read.archetype) {
      case 'calling_station':
        preflopOpenDelta = -0.04 * rnrWeight;
        isoLimpBonus = 0.14 * rnrWeight;
        threeBetBluffDelta = -0.09 * rnrWeight;
        bluffFreqMult = clamp(1 - 0.78 * rnrWeight, 0.2, 1);
        valueThresholdDelta = -0.095 * rnrWeight;
        valueSizeMult = 1 + 0.36 * rnrWeight;
        callRequiredEquityDelta = 0.055 * rnrWeight;
        counterSummary = '跟注站反制：砍掉纯空气偷鸡，扩大中等强牌薄价值下注并抬高价值尺度。';
        break;

      case 'overfolder_nit':
        preflopOpenDelta = 0.17 * rnrWeight;
        threeBetBluffDelta = 0.13 * rnrWeight;
        bluffFreqMult = 1 + 0.62 * rnrWeight;
        valueThresholdDelta = 0.02 * rnrWeight;
        valueSizeMult = clamp(1 - 0.1 * rnrWeight, 0.85, 1);
        callRequiredEquityDelta = 0.08 * rnrWeight;
        counterSummary = '紧缩岩石反制：放宽翻前偷盲与 3-Bet 轻诈唬，高频小注施压，尊重其罕见大加注。';
        break;

      case 'maniac_bluffer':
        preflopOpenDelta = -0.05 * rnrWeight;
        threeBetBluffDelta = -0.06 * rnrWeight;
        bluffFreqMult = clamp(1 - 0.48 * rnrWeight, 0.42, 1);
        valueThresholdDelta = -0.055 * rnrWeight;
        valueSizeMult = 1 + 0.16 * rnrWeight;
        callRequiredEquityDelta = -0.095 * rnrWeight;
        trapSlowplayBonus = 0.34 * rnrWeight;
        counterSummary = '疯狂施压者反制：收窄纯空气诈唬，放宽抓鸡跟注门槛并增加顶层强牌慢打陷阱。';
        break;

      case 'cbet_spammer':
        callRequiredEquityDelta = -0.07 * rnrWeight;
        floatCheckRaiseBonus = 0.27 * rnrWeight;
        bluffFreqMult = 1 + 0.2 * rnrWeight;
        counterSummary = '高频 C-Bet 反制：翻牌增加缠打漂浮与过牌加注反击，转牌攻击其弱跟注区间。';
        break;

      case 'fit_or_fold':
        preflopOpenDelta = 0.11 * rnrWeight;
        bluffFreqMult = 1 + 0.52 * rnrWeight;
        callRequiredEquityDelta = 0.06 * rnrWeight;
        counterSummary = '不中即弃反制：高频小尺度持续下注与转牌试探，遭遇突然反加果断止损。';
        break;

      case 'limp_passive':
        preflopOpenDelta = 0.09 * rnrWeight;
        isoLimpBonus = 0.24 * rnrWeight;
        bluffFreqMult = clamp(1 - 0.32 * rnrWeight, 0.58, 1);
        valueThresholdDelta = -0.065 * rnrWeight;
        valueSizeMult = 1 + 0.22 * rnrWeight;
        callRequiredEquityDelta = 0.045 * rnrWeight;
        counterSummary = '被动平跟反制：高频位置隔离加注惩罚封顶范围，翻后优先打厚价值。';
        break;

      case 'balanced':
      default:
        // Fine-grained continuous Bayesian adjustments even for balanced opponents
        if (read.posterior.limpPosterior >= 0.14) isoLimpBonus = 0.1 * rnrWeight;
        if (read.posterior.foldTo3BetPosterior >= 0.62) threeBetBluffDelta = 0.08 * rnrWeight;
        if (read.posterior.foldToBetPosterior >= 0.5) bluffFreqMult = 1 + 0.22 * rnrWeight;
        if (read.posterior.foldToBetPosterior <= 0.33) bluffFreqMult = clamp(1 - 0.24 * rnrWeight, 0.72, 1);
        break;
    }

    return {
      confidence: Number(w.toFixed(2)),
      rnrWeight: Number(rnrWeight.toFixed(2)),
      targetArchetype: read.archetype,
      preflopOpenDelta: Number(preflopOpenDelta.toFixed(3)),
      isoLimpBonus: Number(isoLimpBonus.toFixed(3)),
      threeBetBluffDelta: Number(threeBetBluffDelta.toFixed(3)),
      bluffFreqMult: Number(bluffFreqMult.toFixed(3)),
      valueThresholdDelta: Number(valueThresholdDelta.toFixed(3)),
      valueSizeMult: Number(valueSizeMult.toFixed(3)),
      callRequiredEquityDelta: Number(callRequiredEquityDelta.toFixed(3)),
      trapSlowplayBonus: Number(trapSlowplayBonus.toFixed(3)),
      floatCheckRaiseBonus: Number(floatCheckRaiseBonus.toFixed(3)),
      counterSummary,
    };
  }

  public getAllReads(): Array<{ read: OpponentExploitRead; exploitPlan: ExploitPlan }> {
    const out: Array<{ read: OpponentExploitRead; exploitPlan: ExploitPlan }> = [];
    for (const playerId of this.statsMap.keys()) {
      const read = this.getOpponentRead(playerId);
      const exploitPlan = this.buildExploitPlan(playerId);
      out.push({ read, exploitPlan });
    }
    return out;
  }
}
