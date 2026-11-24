import type { PlayerAction, StreetPhase, TableState } from '../src/shared/types';
import { evaluateBestHand } from '../src/shared/handEvaluator';

/**
 * Strictly session-scoped (in-memory per room) opponent behavioral profiler.
 * Tracks opponents' live tendencies during the current table session ONLY,
 * identifies exploitable leaks/patterns, and produces numerical strategy adjustments
 * for bots to counter & exploit them in real time.
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
  showdownBluffsCaught: number;
  showdownValueBets: number;
  showdownHands: number;
}

export interface OpponentExploitRead {
  playerId: string;
  handsObserved: number;
  confidence: number; // 0..1 ramps smoothly as session sample grows
  archetype: OpponentExploitArchetype;
  label: string;
  vpipRate: number;
  pfrRate: number;
  limpRate: number;
  foldToBetRate: number;
  cbetRate: number;
  foldToCbetRate: number;
  aggressionFactor: number;
  bluffCaughtRate: number;
}

export interface ExploitPlan {
  /** Confidence weight of this exploit overlay [0..1] */
  confidence: number;
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
}

export const NEUTRAL_EXPLOIT_PLAN: ExploitPlan = {
  confidence: 0,
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
};

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
  flopCheckedIds: Set<string>;
  flopCbetOppDone: boolean;
  flopCbetFired: boolean;
  flopCbetFacedIds: Set<string>;
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
    showdownBluffsCaught: 0,
    showdownValueBets: 0,
    showdownHands: 0,
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
    flopCheckedIds: new Set(),
    flopCbetOppDone: false,
    flopCbetFired: false,
    flopCbetFacedIds: new Set(),
    riverBetIds: new Set(),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class SessionOpponentProfiler {
  private readonly statsMap = new Map<string, SessionOpponentStats>();
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

    for (const p of stateAfter.players) {
      if (!p.inHand) continue;
      const stats = this.ensureStats(p.id);
      stats.handsObserved += 1;
      if (scratch.vpipIds.has(p.id)) stats.vpipHands += 1;
      if (scratch.pfrIds.has(p.id)) stats.pfrHands += 1;
      if (scratch.limpIds.has(p.id) && !scratch.pfrIds.has(p.id)) stats.limpHands += 1;

      if (actualShowdown && !p.folded && p.holeCards.length === 2) {
        stats.showdownHands += 1;
        if (scratch.riverBetIds.has(p.id)) {
          const ev = evaluateBestHand([...p.holeCards, ...stateAfter.communityCards]);
          // High card or weak single pair betting river is classified as bluff / thin-bluff evidence
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
  }

  public clearAll(): void {
    this.statsMap.clear();
    this.scratch = null;
  }

  /**
   * Classifies a specific opponent's live tendencies within this session.
   */
  public getOpponentRead(playerId: string): OpponentExploitRead {
    const s = this.statsMap.get(playerId);
    if (!s || s.handsObserved < 2) {
      return {
        playerId,
        handsObserved: s?.handsObserved ?? 0,
        confidence: 0,
        archetype: 'unknown',
        label: '样本不足',
        vpipRate: 0.28,
        pfrRate: 0.2,
        limpRate: 0.05,
        foldToBetRate: 0.42,
        cbetRate: 0.58,
        foldToCbetRate: 0.45,
        aggressionFactor: 2.0,
        bluffCaughtRate: 0,
      };
    }

    const hands = s.handsObserved;
    // Smooth ramp: reaches ~0.5 by 4 hands, 1.0 by 9 hands so bots adapt briskly within a single session
    const confidence = clamp((hands - 1) / 8, 0.12, 1);

    const vpipRate = s.vpipHands / hands;
    const pfrRate = s.pfrHands / hands;
    const limpRate = s.limpHands / hands;
    const foldToBetRate =
      s.foldToBetOpps >= 2 ? s.foldToBetCount / s.foldToBetOpps : 0.42;
    const cbetRate = s.cbetOpps >= 2 ? s.cbetCount / s.cbetOpps : 0.58;
    const foldToCbetRate =
      s.foldToCbetOpps >= 2 ? s.foldToCbetCount / s.foldToCbetOpps : 0.45;
    const aggressionFactor =
      s.postflopCalls > 0
        ? s.postflopBetsRaises / s.postflopCalls
        : s.postflopBetsRaises > 0
          ? Math.min(5, s.postflopBetsRaises + 1)
          : 1.5;
    const bluffCaughtRate =
      s.riverBets >= 1 ? s.showdownBluffsCaught / Math.max(1, s.showdownBluffsCaught + s.showdownValueBets) : 0;

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

    return {
      playerId,
      handsObserved: hands,
      confidence,
      archetype,
      label,
      vpipRate,
      pfrRate,
      limpRate,
      foldToBetRate,
      cbetRate,
      foldToCbetRate,
      aggressionFactor,
      bluffCaughtRate,
    };
  }

  /**
   * Computes a targeted exploitative strategy overlay against a primary opponent
   * (e.g., the current street's bettor/raiser, or the main remaining defender).
   */
  public buildExploitPlan(primaryOpponentId: string | null): ExploitPlan {
    if (!primaryOpponentId) return NEUTRAL_EXPLOIT_PLAN;
    const read = this.getOpponentRead(primaryOpponentId);
    if (read.confidence <= 0 || read.archetype === 'unknown') {
      return NEUTRAL_EXPLOIT_PLAN;
    }

    const w = read.confidence;
    let preflopOpenDelta = 0;
    let isoLimpBonus = 0;
    let threeBetBluffDelta = 0;
    let bluffFreqMult = 1;
    let valueThresholdDelta = 0;
    let valueSizeMult = 1;
    let callRequiredEquityDelta = 0;
    let trapSlowplayBonus = 0;
    let floatCheckRaiseBonus = 0;

    switch (read.archetype) {
      case 'calling_station':
        // Anti-station exploit: slash bluffs, value bet thinner & larger, isolate limps with value
        preflopOpenDelta = -0.04 * w;
        isoLimpBonus = 0.12 * w;
        threeBetBluffDelta = -0.09 * w;
        bluffFreqMult = clamp(1 - 0.75 * w, 0.2, 1);
        valueThresholdDelta = -0.09 * w; // bet thinner for value (e.g. medium top pair / strong second pair)
        valueSizeMult = 1 + 0.34 * w; // size UP value bets
        callRequiredEquityDelta = 0.05 * w; // if a passive station wakes up raising, respect it!
        break;

      case 'overfolder_nit':
        // Anti-nit / overfolder exploit: steal wider, fire relentless bluffs, respect their rare raises
        preflopOpenDelta = 0.16 * w;
        threeBetBluffDelta = 0.12 * w;
        bluffFreqMult = 1 + 0.58 * w;
        valueThresholdDelta = 0.02 * w;
        valueSizeMult = clamp(1 - 0.1 * w, 0.85, 1);
        callRequiredEquityDelta = 0.075 * w; // nits rarely bluff big
        break;

      case 'maniac_bluffer':
        // Anti-maniac exploit: widen bluff-catcher calls, trap strong hands, cut pure air bluffs
        preflopOpenDelta = -0.05 * w;
        threeBetBluffDelta = -0.06 * w;
        bluffFreqMult = clamp(1 - 0.45 * w, 0.45, 1);
        valueThresholdDelta = -0.05 * w;
        valueSizeMult = 1 + 0.14 * w;
        callRequiredEquityDelta = -0.09 * w; // call down much lighter to pick off bluffs
        trapSlowplayBonus = 0.32 * w; // let maniac hang themselves
        break;

      case 'cbet_spammer':
        // Anti-C-bet-spammer exploit: float wider & counter with check-raises
        callRequiredEquityDelta = -0.065 * w;
        floatCheckRaiseBonus = 0.25 * w;
        bluffFreqMult = 1 + 0.18 * w;
        break;

      case 'fit_or_fold':
        // Anti-fit-or-fold exploit: stab & c-bet high frequency, fold to their sudden raises
        preflopOpenDelta = 0.1 * w;
        bluffFreqMult = 1 + 0.48 * w;
        callRequiredEquityDelta = 0.055 * w;
        break;

      case 'limp_passive':
        // Anti-limp-passive exploit: relentlessly isolate limps in position + thick value bets
        preflopOpenDelta = 0.08 * w;
        isoLimpBonus = 0.22 * w;
        bluffFreqMult = clamp(1 - 0.3 * w, 0.6, 1);
        valueThresholdDelta = -0.06 * w;
        valueSizeMult = 1 + 0.2 * w;
        callRequiredEquityDelta = 0.04 * w;
        break;

      case 'balanced':
      default:
        // Subtle fine-tuning even for mostly balanced opponents based on real fold/limp skew
        if (read.limpRate >= 0.22) isoLimpBonus = 0.1 * w;
        if (read.foldToBetRate >= 0.55) bluffFreqMult = 1 + 0.2 * w;
        if (read.foldToBetRate <= 0.3) bluffFreqMult = clamp(1 - 0.25 * w, 0.7, 1);
        break;
    }

    return {
      confidence: Number(w.toFixed(2)),
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
    };
  }
}
