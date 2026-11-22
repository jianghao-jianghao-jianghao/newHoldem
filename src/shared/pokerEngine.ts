import type {
  AchievementDatesMap,
  AchievementId,
  EquippedAchievementPref,
} from './achievements';
import { evaluateBestHand } from './handEvaluator';
import type {
  AvailableActions,
  Card,
  ClientPlayerView,
  ClientTableView,
  HandReplayAction,
  HandReplayRecord,
  ManualBlindTarget,
  NextBlindPreview,
  PlayerAction,
  PotTimelinePoint,
  Rank,
  SidePotInfo,
  StreetPhase,
  Suit,
  TablePlayer,
  TableState,
  WinnerInfo,
} from './types';

export const STARTING_CHIPS = 2000;
export const DEFAULT_SMALL_BLIND = 10;
export const DEFAULT_BIG_BLIND = 20;
export const TURN_TIMEOUT_MS = 25000;
export const AUTO_NEXT_HAND_DELAY_MS = 8000;
export const MAX_HAND_HISTORY = 20;

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export interface EngineOptions {
  stepAllIn?: boolean;
}

export function createDeck(rng: () => number = Math.random): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function createTableState(
  roomId: string,
  smallBlind: number = DEFAULT_SMALL_BLIND,
  bigBlind: number = DEFAULT_BIG_BLIND,
  startingChips: number = STARTING_CHIPS
): TableState {
  const safeStarting = Math.max(bigBlind * 5, Math.floor(startingChips || STARTING_CHIPS));
  return {
    roomId,
    hostId: null,
    phase: 'waiting',
    handNumber: 0,
    smallBlind,
    bigBlind,
    startingChips: safeStarting,
    dealerSeatIndex: -1,
    smallBlindSeatIndex: null,
    bigBlindSeatIndex: null,
    manualBlindTarget: null,
    pendingBlinds: null,
    currentTurnPlayerId: null,
    turnDeadline: null,
    allInRunout: false,
    nextHandAt: null,
    autoNextHandEnabled: true,
    pot: 0,
    deadContributions: [],
    currentBet: 0,
    lastFullBet: 0,
    minRaise: bigBlind,
    raiseLockedPlayerIds: [],
    communityCards: [],
    deck: [],
    players: [],
    winners: [],
    actionLog: [],
    currentPotTimeline: [],
    currentHandActions: [],
    handHistory: [],
    playerStats: {},
    currentHandVpipIds: [],
    currentHandRecorded: false,
  };
}

function getSortedPlayers(state: TableState): TablePlayer[] {
  return [...state.players].sort((a, b) => a.seatIndex - b.seatIndex);
}

function findNextSeatPlayer(
  players: TablePlayer[],
  afterSeatIndex: number,
  predicate: (p: TablePlayer) => boolean
): TablePlayer | null {
  const sorted = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  if (sorted.length === 0) return null;
  const afterList = sorted.filter((p) => p.seatIndex > afterSeatIndex && predicate(p));
  if (afterList.length > 0) return afterList[0];
  const wrapList = sorted.filter((p) => predicate(p));
  return wrapList[0] ?? null;
}

function findPreviousSeatPlayer(
  players: TablePlayer[],
  beforeSeatIndex: number,
  predicate: (p: TablePlayer) => boolean
): TablePlayer | null {
  const sorted = [...players].sort((a, b) => b.seatIndex - a.seatIndex);
  if (sorted.length === 0) return null;
  const beforeList = sorted.filter((p) => p.seatIndex < beforeSeatIndex && predicate(p));
  if (beforeList.length > 0) return beforeList[0];
  const wrapList = sorted.filter((p) => predicate(p));
  return wrapList[0] ?? null;
}

/**
 * Computes the Dealer / Small Blind / Big Blind seat indices for the next hand,
 * honoring any manually pinned blind/dealer position if that player is eligible.
 */
export function resolveNextHandSeats(state: TableState): NextBlindPreview {
  const eligible = getSortedPlayers(state).filter((p) => p.chips > 0);
  if (eligible.length < 2) {
    return {
      dealerSeatIndex: null,
      smallBlindSeatIndex: null,
      bigBlindSeatIndex: null,
    };
  }

  const target = state.manualBlindTarget;
  const matched = target
    ? eligible.find((p) => p.seatIndex === target.seatIndex) ?? null
    : null;

  let dealer: TablePlayer;
  let sb: TablePlayer;
  let bb: TablePlayer;

  if (matched && target) {
    if (target.role === 'dealer') {
      dealer = matched;
      sb =
        eligible.length === 2
          ? dealer
          : findNextSeatPlayer(eligible, dealer.seatIndex, () => true)!;
      bb = findNextSeatPlayer(eligible, sb.seatIndex, () => true)!;
    } else if (target.role === 'sb') {
      sb = matched;
      if (eligible.length === 2) {
        dealer = sb;
        bb = findNextSeatPlayer(eligible, sb.seatIndex, () => true)!;
      } else {
        dealer = findPreviousSeatPlayer(eligible, sb.seatIndex, () => true)!;
        bb = findNextSeatPlayer(eligible, sb.seatIndex, () => true)!;
      }
    } else {
      // target.role === 'bb'
      bb = matched;
      if (eligible.length === 2) {
        sb = findNextSeatPlayer(eligible, bb.seatIndex, () => true)!;
        dealer = sb;
      } else {
        sb = findPreviousSeatPlayer(eligible, bb.seatIndex, () => true)!;
        dealer = findPreviousSeatPlayer(eligible, sb.seatIndex, () => true)!;
      }
    }
  } else {
    dealer = findNextSeatPlayer(eligible, state.dealerSeatIndex, () => true)!;
    sb =
      eligible.length === 2
        ? dealer
        : findNextSeatPlayer(eligible, dealer.seatIndex, () => true)!;
    bb = findNextSeatPlayer(eligible, sb.seatIndex, () => true)!;
  }

  return {
    dealerSeatIndex: dealer.seatIndex,
    smallBlindSeatIndex: sb.seatIndex,
    bigBlindSeatIndex: bb.seatIndex,
  };
}

export function updateTableBlindSettings(
  state: TableState,
  params: {
    smallBlind?: number;
    bigBlind?: number;
    manualBlindTarget?: ManualBlindTarget | null;
  }
): { ok: boolean; queued?: boolean; error?: string } {
  const hasBlindChange =
    params.smallBlind !== undefined || params.bigBlind !== undefined;

  let nextSb = state.pendingBlinds?.smallBlind ?? state.smallBlind;
  let nextBb = state.pendingBlinds?.bigBlind ?? state.bigBlind;

  if (hasBlindChange) {
    if (params.smallBlind !== undefined) {
      nextSb = Math.floor(Number(params.smallBlind));
    }
    if (params.bigBlind !== undefined) {
      nextBb = Math.floor(Number(params.bigBlind));
    }
    if (
      !Number.isFinite(nextSb) ||
      !Number.isFinite(nextBb) ||
      nextSb < 1 ||
      nextSb > 5000 ||
      nextBb <= nextSb ||
      nextBb > 10000
    ) {
      return {
        ok: false,
        error: '小盲须在 1–5000 之间，且大盲须大于小盲（上限 10000）',
      };
    }
  }

  let nextTarget: ManualBlindTarget | null | undefined = undefined;
  if (params.manualBlindTarget !== undefined) {
    if (params.manualBlindTarget === null) {
      nextTarget = null;
    } else {
      const role = params.manualBlindTarget.role;
      const seatIndex = Math.floor(Number(params.manualBlindTarget.seatIndex));
      if (role !== 'dealer' && role !== 'sb' && role !== 'bb') {
        return { ok: false, error: '无效的盲位角色设置' };
      }
      const targetPlayer = state.players.find((p) => p.seatIndex === seatIndex);
      if (!targetPlayer || targetPlayer.chips <= 0) {
        return { ok: false, error: '所选玩家暂无有效筹码，无法指定为盲位' };
      }
      nextTarget = { role, seatIndex };
    }
  }

  const isBetweenHands = state.phase === 'waiting' || state.phase === 'showdown';

  if (isBetweenHands) {
    if (hasBlindChange) {
      state.smallBlind = nextSb;
      state.bigBlind = nextBb;
      state.minRaise = nextBb;
      state.pendingBlinds = null;
      pushLog(state, `盲注级别已调整为 ${nextSb}/${nextBb}`);
    }
    if (nextTarget !== undefined) {
      state.manualBlindTarget = nextTarget;
      if (nextTarget === null) {
        pushLog(state, '下局盲位已恢复自动顺时针轮转');
      } else {
        const p = state.players.find((pl) => pl.seatIndex === nextTarget!.seatIndex);
        const roleName =
          nextTarget.role === 'sb'
            ? '小盲位 (SB)'
            : nextTarget.role === 'bb'
              ? '大盲位 (BB)'
              : '庄位 (D)';
        pushLog(state, `已指定 ${p?.name ?? '玩家'} 担任下局${roleName}`);
      }
    }
    return { ok: true, queued: false };
  }

  // Mid-hand: queue safely for the next hand without breaking active pot/raise rules
  if (hasBlindChange) {
    if (nextSb === state.smallBlind && nextBb === state.bigBlind) {
      state.pendingBlinds = null;
    } else {
      state.pendingBlinds = { smallBlind: nextSb, bigBlind: nextBb };
      pushLog(state, `已预约下局盲注调整为 ${nextSb}/${nextBb}`);
    }
  }
  if (nextTarget !== undefined) {
    state.manualBlindTarget = nextTarget;
    if (nextTarget === null) {
      pushLog(state, '已预约下局恢复自动盲位轮转');
    } else {
      const p = state.players.find((pl) => pl.seatIndex === nextTarget!.seatIndex);
      const roleName =
        nextTarget.role === 'sb'
          ? '小盲位 (SB)'
          : nextTarget.role === 'bb'
            ? '大盲位 (BB)'
            : '庄位 (D)';
      pushLog(state, `已预约 ${p?.name ?? '玩家'} 担任下局${roleName}`);
    }
  }
  return { ok: true, queued: true };
}

export function addPlayerToTable(
  state: TableState,
  params: {
    id: string;
    name: string;
    avatar?: string;
    achievements?: AchievementId[];
    achievementDates?: AchievementDatesMap;
    equippedAchievement?: EquippedAchievementPref;
    winStreak?: number;
    level?: number;
    isBot?: boolean;
    chips?: number;
  }
): { ok: boolean; error?: string } {
  const existing = state.players.find((p) => p.id === params.id);
  if (existing) {
    existing.connected = true;
    existing.name = params.name;
    if (params.avatar) {
      existing.avatar = params.avatar;
    }
    if (params.achievements) {
      existing.achievements = params.achievements;
    }
    if (params.achievementDates) {
      existing.achievementDates = params.achievementDates;
    }
    if (params.equippedAchievement !== undefined) {
      existing.equippedAchievement = params.equippedAchievement;
    }
    if (typeof params.winStreak === 'number') {
      existing.winStreak = params.winStreak;
    }
    if (typeof params.level === 'number' && params.level >= 1) {
      existing.level = Math.floor(params.level);
    }
    return { ok: true };
  }

  // Standard 52-card deck supports up to 22 players (22*2 + 5 community + 3 burn = 52)
  if (state.players.length >= 22) {
    return { ok: false, error: '当前牌桌人数已达标准扑克牌组上限（22 人）' };
  }

  const usedSeats = new Set(state.players.map((p) => p.seatIndex));
  let seatIndex = 0;
  while (usedSeats.has(seatIndex)) {
    seatIndex++;
  }

  const now = Date.now();
  const player: TablePlayer = {
    id: params.id,
    name: params.name,
    avatar: params.avatar ?? 'default',
    achievements: params.achievements ?? [],
    achievementDates: params.achievementDates ?? {},
    equippedAchievement: params.equippedAchievement,
    winStreak: params.winStreak ?? 0,
    level: typeof params.level === 'number' && params.level >= 1 ? Math.floor(params.level) : 1,
    seatIndex,
    isBot: Boolean(params.isBot),
    connected: true,
    chips: params.chips ?? state.startingChips,
    holeCards: [],
    inHand: false,
    folded: false,
    allIn: false,
    revealed: false,
    joinedAt: now,
    currentBet: 0,
    totalContributed: 0,
    actedThisRound: false,
  };

  state.players.push(player);
  if (!state.playerStats[player.id]) {
    state.playerStats[player.id] = {
      playerId: player.id,
      playerName: player.name,
      handsPlayed: 0,
      vpipHands: 0,
      handsWon: 0,
      showdownReached: 0,
      showdownWon: 0,
      sessionNetChips: 0,
    };
  }
  if (!state.hostId && !player.isBot) {
    state.hostId = player.id;
  }
  pushLog(state, `${player.name} 加入了牌桌`);
  return { ok: true };
}

export function removePlayerFromTable(state: TableState, playerId: string): void {
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx === -1) return;
  const removed = state.players[idx];

  // If currently in an active hand, preserve any dead money and fold them first so game doesn't stall
  const wasActiveHand = state.phase !== 'waiting' && state.phase !== 'showdown';
  if (wasActiveHand && removed.inHand && !removed.folded) {
    if (state.currentTurnPlayerId === playerId) {
      applyPlayerAction(state, playerId, { type: 'fold' }, Date.now(), { stepAllIn: true });
    } else {
      removed.folded = true;
      removed.actedThisRound = true;
      removed.lastActionLabel = '离开弃牌';
      checkAndAdvanceAfterPassiveFold(state, { stepAllIn: true });
    }
  }

  // If the hand is still running after folding, preserve the departed player's pot contribution
  if (
    state.phase !== 'waiting' &&
    state.phase !== 'showdown' &&
    removed.totalContributed > 0
  ) {
    if (!state.deadContributions) state.deadContributions = [];
    state.deadContributions.push(removed.totalContributed);
  }

  state.players.splice(idx, 1);
  if (state.manualBlindTarget?.seatIndex === removed.seatIndex) {
    state.manualBlindTarget = null;
  }
  pushLog(state, `${removed.name} 离开了牌桌`);

  if (state.hostId === playerId) {
    const nextHuman = getSortedPlayers(state).find((p) => !p.isBot && p.connected);
    state.hostId = nextHuman?.id ?? null;
  }

  if (state.phase !== 'waiting' && state.phase !== 'showdown') {
    const remainingContenders = state.players.filter((p) => p.inHand && !p.folded);
    if (remainingContenders.length === 1) {
      resolveFoldWin(state, Date.now());
    } else if (remainingContenders.length === 0) {
      state.phase = 'waiting';
      state.allInRunout = false;
      state.nextHandAt = null;
      state.currentTurnPlayerId = null;
      state.turnDeadline = null;
      state.pot = 0;
      state.deadContributions = [];
    }
  } else if (state.phase === 'showdown') {
    const activePlayers = state.players.filter((p) => p.chips > 0);
    if (activePlayers.length < 2) {
      state.nextHandAt = null;
    }
  }
}

export function rebuyPlayerChips(state: TableState, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  if (player.inHand && !player.folded && state.phase !== 'waiting' && state.phase !== 'showdown') {
    return false;
  }
  if (player.chips >= state.startingChips) return false;
  player.chips = state.startingChips;
  player.lastActionLabel = '补充筹码';
  pushLog(state, `${player.name} 补充了筹码至 ${state.startingChips}`);
  return true;
}

function pushLog(state: TableState, message: string): void {
  state.actionLog.unshift(message);
  if (state.actionLog.length > 24) {
    state.actionLog.length = 24;
  }
}

function recordActionAndPot(
  state: TableState,
  params: {
    playerId: string;
    playerName: string;
    actionType: string;
    actionLabel: string;
    amountAdded: number;
    timestamp: number;
  }
): void {
  const actionItem: HandReplayAction = {
    street: state.phase,
    playerId: params.playerId,
    playerName: params.playerName,
    actionLabel: params.actionLabel,
    amountAdded: params.amountAdded,
    potAfter: state.pot,
    timestamp: params.timestamp,
  };
  state.currentHandActions.push(actionItem);

  if (params.amountAdded > 0) {
    const pt: PotTimelinePoint = {
      step: state.currentPotTimeline.length + 1,
      street: state.phase,
      actorId: params.playerId,
      actorName: params.playerName,
      actionType: params.actionType,
      actionLabel: params.actionLabel,
      amountAdded: params.amountAdded,
      potAfter: state.pot,
      timestamp: params.timestamp,
    };
    state.currentPotTimeline.push(pt);
  }
}

export function canStartHand(state: TableState): boolean {
  if (state.phase !== 'waiting' && state.phase !== 'showdown') {
    return false;
  }
  const eligible = state.players.filter((p) => p.chips > 0);
  return eligible.length >= 2;
}

export function startNewHand(
  state: TableState,
  rng: () => number = Math.random,
  now: number = Date.now(),
  options: EngineOptions = {}
): { ok: boolean; error?: string } {
  const eligible = getSortedPlayers(state).filter((p) => p.chips > 0);
  if (eligible.length < 2) {
    return { ok: false, error: '至少需要 2 名有筹码的玩家才能开始牌局' };
  }

  if (state.pendingBlinds) {
    state.smallBlind = state.pendingBlinds.smallBlind;
    state.bigBlind = state.pendingBlinds.bigBlind;
    state.pendingBlinds = null;
  }

  state.handNumber += 1;
  state.phase = 'preflop';
  state.allInRunout = false;
  state.nextHandAt = null;
  state.pot = 0;
  state.deadContributions = [];
  state.currentBet = 0;
  state.lastFullBet = state.bigBlind;
  state.minRaise = state.bigBlind;
  state.raiseLockedPlayerIds = [];
  state.communityCards = [];
  state.winners = [];
  state.currentPotTimeline = [];
  state.currentHandActions = [];
  state.currentHandVpipIds = [];
  state.currentHandRecorded = false;
  state.deck = createDeck(rng);

  for (const p of state.players) {
    p.holeCards = [];
    p.inHand = p.chips > 0;
    p.folded = !p.inHand;
    p.allIn = false;
    p.revealed = false;
    p.currentBet = 0;
    p.totalContributed = 0;
    p.actedThisRound = false;
    p.lastActionLabel = undefined;
  }

  // Resolve Dealer / SB / BB seats (respecting any one-shot manual blind target, then resuming clockwise rotation)
  const resolvedSeats = resolveNextHandSeats(state);
  state.manualBlindTarget = null;

  const dealer = state.players.find((p) => p.seatIndex === resolvedSeats.dealerSeatIndex)!;
  const sbPlayer = state.players.find((p) => p.seatIndex === resolvedSeats.smallBlindSeatIndex)!;
  const bbPlayer = state.players.find((p) => p.seatIndex === resolvedSeats.bigBlindSeatIndex)!;

  state.dealerSeatIndex = dealer.seatIndex;
  state.smallBlindSeatIndex = sbPlayer.seatIndex;
  state.bigBlindSeatIndex = bbPlayer.seatIndex;

  postBlind(state, sbPlayer, state.smallBlind, '小盲', now);
  postBlind(state, bbPlayer, state.bigBlind, '大盲', now);

  // Official No-Limit Hold'em: in 3+ player pots, opening call remains full bigBlind even if BB is short-stacked all-in.
  // In heads-up, SB only needs to match BB's actual posted blind if BB is short all-in.
  state.currentBet =
    eligible.length === 2
      ? Math.max(sbPlayer.currentBet, bbPlayer.currentBet)
      : state.bigBlind;
  state.lastFullBet = state.currentBet;

  // Deal 2 hole cards clockwise starting from Small Blind (first active seat left of Dealer)
  const inHandSorted = getSortedPlayers(state).filter((p) => p.inHand);
  const sbIdx = inHandSorted.findIndex((p) => p.seatIndex === sbPlayer.seatIndex);
  const dealOrder =
    sbIdx >= 0
      ? [...inHandSorted.slice(sbIdx), ...inHandSorted.slice(0, sbIdx)]
      : inHandSorted;

  for (let round = 0; round < 2; round++) {
    for (const p of dealOrder) {
      const card = state.deck.pop();
      if (card) p.holeCards.push(card);
    }
  }

  pushLog(state, `--- 第 ${state.handNumber} 局开始 (盲注 ${state.smallBlind}/${state.bigBlind}) ---`);

  // Determine first actor preflop
  const firstCandidate =
    eligible.length === 2
      ? sbPlayer
      : findNextSeatPlayer(state.players, bbPlayer.seatIndex, (p) => p.inHand && !p.folded && !p.allIn);

  if (firstCandidate && !firstCandidate.allIn && countPlayersAbleToAct(state) >= 2) {
    state.currentTurnPlayerId = firstCandidate.id;
    state.turnDeadline = now + TURN_TIMEOUT_MS;
  } else if (
    firstCandidate &&
    !firstCandidate.allIn &&
    firstCandidate.currentBet < state.currentBet
  ) {
    state.currentTurnPlayerId = firstCandidate.id;
    state.turnDeadline = now + TURN_TIMEOUT_MS;
  } else if (options.stepAllIn) {
    state.allInRunout = true;
    state.currentTurnPlayerId = null;
    state.turnDeadline = null;
  } else {
    runOutToShowdown(state, now);
  }

  return { ok: true };
}

function postBlind(
  state: TableState,
  player: TablePlayer,
  amount: number,
  label: string,
  now: number
): void {
  const actual = Math.min(player.chips, amount);
  player.chips -= actual;
  player.currentBet += actual;
  player.totalContributed += actual;
  state.pot += actual;
  if (player.chips === 0) {
    player.allIn = true;
    player.lastActionLabel = `${label}全下 ${actual}`;
  } else {
    player.lastActionLabel = `${label} ${actual}`;
  }
  recordActionAndPot(state, {
    playerId: player.id,
    playerName: player.name,
    actionType: 'blind',
    actionLabel: player.lastActionLabel,
    amountAdded: actual,
    timestamp: now,
  });
}

function countNonFoldedPlayers(state: TableState): number {
  return state.players.filter((p) => p.inHand && !p.folded).length;
}

function countPlayersAbleToAct(state: TableState): number {
  return state.players.filter((p) => p.inHand && !p.folded && !p.allIn).length;
}

export function getAvailableActions(state: TableState, playerId: string): AvailableActions | null {
  if (
    state.phase === 'waiting' ||
    state.phase === 'showdown' ||
    state.allInRunout ||
    state.currentTurnPlayerId !== playerId
  ) {
    return null;
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player || !player.inHand || player.folded || player.allIn) {
    return null;
  }

  const toCall = Math.max(0, state.currentBet - player.currentBet);
  const canCheck = toCall === 0;
  const canCall = toCall > 0;
  const callAmount = Math.min(toCall, player.chips);

  const maxTotalBet = player.currentBet + player.chips;
  const isOpeningBet = state.currentBet === 0;
  const isRaiseLocked = state.raiseLockedPlayerIds.includes(playerId);
  const minRaiseTarget = Math.min(
    maxTotalBet,
    isOpeningBet ? state.bigBlind : state.currentBet + state.minRaise
  );
  const canRaise = !isRaiseLocked && maxTotalBet > state.currentBet;

  return {
    canFold: true,
    canCheck,
    canCall,
    callAmount,
    canRaise,
    isOpeningBet,
    minRaiseTo: minRaiseTarget,
    maxRaiseTo: maxTotalBet,
  };
}

export function applyPlayerAction(
  state: TableState,
  playerId: string,
  action: PlayerAction,
  now: number = Date.now(),
  options: EngineOptions = {}
): { ok: boolean; error?: string; handFinished?: boolean } {
  const available = getAvailableActions(state, playerId);
  if (!available) {
    return { ok: false, error: '当前不是你的行动回合' };
  }

  const player = state.players.find((p) => p.id === playerId)!;

  if (action.type === 'fold') {
    player.folded = true;
    player.actedThisRound = true;
    player.lastActionLabel = '弃牌';
    pushLog(state, `${player.name} 弃牌`);
    recordActionAndPot(state, {
      playerId: player.id,
      playerName: player.name,
      actionType: 'fold',
      actionLabel: '弃牌',
      amountAdded: 0,
      timestamp: now,
    });
  } else if (action.type === 'check') {
    if (!available.canCheck) {
      return { ok: false, error: '当前需要跟注或弃牌，不能让牌' };
    }
    player.actedThisRound = true;
    player.lastActionLabel = '让牌';
    pushLog(state, `${player.name} 让牌`);
    recordActionAndPot(state, {
      playerId: player.id,
      playerName: player.name,
      actionType: 'check',
      actionLabel: '让牌',
      amountAdded: 0,
      timestamp: now,
    });
  } else if (action.type === 'call') {
    if (!available.canCall) {
      player.actedThisRound = true;
      player.lastActionLabel = '让牌';
      pushLog(state, `${player.name} 让牌`);
      recordActionAndPot(state, {
        playerId: player.id,
        playerName: player.name,
        actionType: 'check',
        actionLabel: '让牌',
        amountAdded: 0,
        timestamp: now,
      });
    } else {
      const paid = available.callAmount;
      player.chips -= paid;
      player.currentBet += paid;
      player.totalContributed += paid;
      state.pot += paid;
      player.actedThisRound = true;
      if (state.phase === 'preflop' && !state.currentHandVpipIds.includes(player.id)) {
        state.currentHandVpipIds.push(player.id);
      }
      if (player.chips === 0) {
        player.allIn = true;
        player.lastActionLabel = `全下 ${player.currentBet}`;
        pushLog(state, `${player.name} 跟注全下 ${paid}`);
      } else {
        player.lastActionLabel = `跟注 ${paid}`;
        pushLog(state, `${player.name} 跟注 ${paid}`);
      }
      recordActionAndPot(state, {
        playerId: player.id,
        playerName: player.name,
        actionType: player.allIn ? 'allin' : 'call',
        actionLabel: player.lastActionLabel,
        amountAdded: paid,
        timestamp: now,
      });
    }
  } else if (action.type === 'raise') {
    if (!available.canRaise) {
      return { ok: false, error: '当前筹码不足以加注' };
    }
    if (
      action.amount !== undefined &&
      (typeof action.amount !== 'number' || !Number.isFinite(action.amount))
    ) {
      return { ok: false, error: '加注金额无效' };
    }
    const targetBet = Math.floor(action.amount ?? available.minRaiseTo);
    const clampedTarget = Math.max(
      available.minRaiseTo,
      Math.min(available.maxRaiseTo, targetBet)
    );
    const addedChips = clampedTarget - player.currentBet;
    if (!Number.isFinite(addedChips) || addedChips <= 0) {
      return { ok: false, error: '加注金额无效' };
    }

    const prevCurrentBet = state.currentBet;
    const isOpeningBet = prevCurrentBet === 0;
    const deltaFromFullBet = clampedTarget - state.lastFullBet;
    const isFullRaise = isOpeningBet
      ? clampedTarget >= state.bigBlind
      : deltaFromFullBet >= state.minRaise;

    player.chips -= addedChips;
    player.currentBet = clampedTarget;
    player.totalContributed += addedChips;
    state.pot += addedChips;
    player.actedThisRound = true;

    if (state.phase === 'preflop' && !state.currentHandVpipIds.includes(player.id)) {
      state.currentHandVpipIds.push(player.id);
    }

    if (clampedTarget > prevCurrentBet) {
      state.currentBet = clampedTarget;

      if (isFullRaise) {
        state.minRaise = isOpeningBet
          ? Math.max(state.bigBlind, clampedTarget)
          : deltaFromFullBet;
        state.lastFullBet = clampedTarget;
        state.raiseLockedPlayerIds = [];
        for (const other of state.players) {
          if (other.id !== player.id && other.inHand && !other.folded && !other.allIn) {
            other.actedThisRound = false;
          }
        }
      } else {
        // WSOP/TDA Rule 47: an incomplete (short) all-in raise does NOT lower minRaise
        // and does NOT reopen raising for players who already acted on the last full bet.
        for (const other of state.players) {
          if (
            other.id !== player.id &&
            other.inHand &&
            !other.folded &&
            !other.allIn &&
            other.actedThisRound &&
            !state.raiseLockedPlayerIds.includes(other.id)
          ) {
            state.raiseLockedPlayerIds.push(other.id);
          }
        }
      }
    }

    if (player.chips === 0) {
      player.allIn = true;
      player.lastActionLabel = `全下 ${clampedTarget}`;
      pushLog(state, `${player.name} 全下至 ${clampedTarget}`);
    } else if (isOpeningBet) {
      player.lastActionLabel = `下注 ${clampedTarget}`;
      pushLog(state, `${player.name} 下注 ${clampedTarget}`);
    } else {
      player.lastActionLabel = `加注至 ${clampedTarget}`;
      pushLog(state, `${player.name} 加注至 ${clampedTarget}`);
    }
    recordActionAndPot(state, {
      playerId: player.id,
      playerName: player.name,
      actionType: player.allIn ? 'allin' : isOpeningBet ? 'bet' : 'raise',
      actionLabel: player.lastActionLabel,
      amountAdded: addedChips,
      timestamp: now,
    });
  }

  return advanceAfterAction(state, player.seatIndex, now, options);
}

function checkAndAdvanceAfterPassiveFold(
  state: TableState,
  options: EngineOptions = {}
): void {
  const now = Date.now();
  if (countNonFoldedPlayers(state) <= 1) {
    resolveFoldWin(state, now);
    return;
  }

  // If a passive fold reduced able-to-act players below 2 and all remaining bets are matched,
  // avoid prompting a lone non-all-in player into a dry street — advance into all-in runout/showdown.
  const ableToAct = state.players.filter((p) => p.inHand && !p.folded && !p.allIn);
  const pendingActors = ableToAct.filter(
    (p) => !p.actedThisRound || p.currentBet < state.currentBet
  );
  if (ableToAct.length < 2 && pendingActors.length === 0) {
    if (options.stepAllIn && state.phase !== 'river') {
      state.allInRunout = true;
      state.currentTurnPlayerId = null;
      state.turnDeadline = null;
      return;
    }
    runOutToShowdown(state, now);
  }
}

function advanceAfterAction(
  state: TableState,
  lastActorSeatIndex: number,
  now: number,
  options: EngineOptions = {}
): { ok: boolean; handFinished?: boolean } {
  // 1. Only one non-folded player left -> instant pot win
  if (countNonFoldedPlayers(state) <= 1) {
    resolveFoldWin(state, now);
    return { ok: true, handFinished: true };
  }

  // 2. Check if betting round is complete
  const ableToAct = state.players.filter((p) => p.inHand && !p.folded && !p.allIn);
  const pendingActors = ableToAct.filter(
    (p) => !p.actedThisRound || p.currentBet < state.currentBet
  );

  if (pendingActors.length > 0) {
    const nextActor = findNextSeatPlayer(
      state.players,
      lastActorSeatIndex,
      (p) => p.inHand && !p.folded && !p.allIn && (!p.actedThisRound || p.currentBet < state.currentBet)
    );
    if (nextActor) {
      state.currentTurnPlayerId = nextActor.id;
      state.turnDeadline = now + TURN_TIMEOUT_MS;
      return { ok: true, handFinished: false };
    }
  }

  // Betting round finished!
  // If fewer than 2 players can act (others are all-in), run out remaining community cards
  if (ableToAct.length < 2) {
    if (options.stepAllIn && state.phase !== 'river') {
      state.allInRunout = true;
      state.currentTurnPlayerId = null;
      state.turnDeadline = null;
      return { ok: true, handFinished: false };
    }
    runOutToShowdown(state, now);
    return { ok: true, handFinished: true };
  }

  // Otherwise advance to next street
  advanceToNextStreet(state, now, options);
  return { ok: true, handFinished: state.phase === 'showdown' };
}

function resetStreetBets(state: TableState): void {
  for (const p of state.players) {
    p.currentBet = 0;
    p.actedThisRound = false;
    if (p.inHand && !p.folded && !p.allIn) {
      p.lastActionLabel = undefined;
    }
  }
  state.currentBet = 0;
  state.lastFullBet = 0;
  state.minRaise = state.bigBlind;
  state.raiseLockedPlayerIds = [];
}

function advanceToNextStreet(
  state: TableState,
  now: number,
  options: EngineOptions = {}
): void {
  resetStreetBets(state);

  if (state.phase === 'preflop') {
    state.phase = 'flop';
    dealCommunityCards(state, 3);
    pushLog(state, '发出翻牌 (Flop)');
  } else if (state.phase === 'flop') {
    state.phase = 'turn';
    dealCommunityCards(state, 1);
    pushLog(state, '发出转牌 (Turn)');
  } else if (state.phase === 'turn') {
    state.phase = 'river';
    dealCommunityCards(state, 1);
    pushLog(state, '发出河牌 (River)');
  } else if (state.phase === 'river') {
    resolveShowdown(state, now);
    return;
  }

  const firstPostflopActor = findNextSeatPlayer(
    state.players,
    state.dealerSeatIndex,
    (p) => p.inHand && !p.folded && !p.allIn
  );

  if (!firstPostflopActor || countPlayersAbleToAct(state) < 2) {
    if (options.stepAllIn && state.phase !== 'river') {
      state.allInRunout = true;
      state.currentTurnPlayerId = null;
      state.turnDeadline = null;
      return;
    }
    runOutToShowdown(state, now);
    return;
  }

  state.currentTurnPlayerId = firstPostflopActor.id;
  state.turnDeadline = now + TURN_TIMEOUT_MS;
}

/**
 * Advances exactly ONE community street during an active All-in automatic runout.
 */
export function advanceAllInRunoutStep(
  state: TableState,
  now: number = Date.now()
): { ok: boolean; street?: StreetPhase; finished: boolean } {
  if (!state.allInRunout || state.phase === 'waiting' || state.phase === 'showdown') {
    return { ok: false, finished: state.phase === 'showdown' };
  }

  resetStreetBets(state);

  if (state.phase === 'preflop') {
    state.phase = 'flop';
    dealCommunityCards(state, 3);
    pushLog(state, 'All-in 自动发出翻牌 (Flop)');
    return { ok: true, street: 'flop', finished: false };
  }
  if (state.phase === 'flop') {
    state.phase = 'turn';
    dealCommunityCards(state, 1);
    pushLog(state, 'All-in 自动发出转牌 (Turn)');
    return { ok: true, street: 'turn', finished: false };
  }
  if (state.phase === 'turn') {
    state.phase = 'river';
    dealCommunityCards(state, 1);
    pushLog(state, 'All-in 自动发出河牌 (River)');
    return { ok: true, street: 'river', finished: false };
  }

  state.allInRunout = false;
  resolveShowdown(state, now);
  return { ok: true, street: 'showdown', finished: true };
}

/**
 * Allows a seated player to voluntarily reveal their hole cards at showdown / hand end.
 */
export function revealPlayerCards(
  state: TableState,
  playerId: string
): { ok: boolean; error?: string } {
  if (state.phase !== 'showdown') {
    return { ok: false, error: '仅可在牌局结束后亮牌' };
  }
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.holeCards.length !== 2) {
    return { ok: false, error: '当前没有可展示的底牌' };
  }
  if (player.revealed) {
    return { ok: true };
  }
  player.revealed = true;
  player.lastActionLabel = '亮牌';
  pushLog(state, `${player.name} 亮出了手牌`);

  const latestRecord = state.handHistory[state.handHistory.length - 1];
  if (latestRecord && latestRecord.handNumber === state.handNumber) {
    const snap = latestRecord.players.find((sp) => sp.id === playerId);
    if (snap) {
      snap.revealed = true;
      snap.holeCards = [...player.holeCards];
    }
  }
  return { ok: true };
}

function dealCommunityCards(state: TableState, count: number): void {
  if (state.deck.length > count) {
    state.deck.pop();
  }
  for (let i = 0; i < count; i++) {
    const card = state.deck.pop();
    if (card) state.communityCards.push(card);
  }
}

function runOutToShowdown(state: TableState, now: number): void {
  while (state.communityCards.length < 5 && state.deck.length > 0) {
    const needed = state.communityCards.length === 0 ? 3 : 1;
    dealCommunityCards(state, Math.min(needed, 5 - state.communityCards.length));
  }
  resolveShowdown(state, now);
}

function finalizeHandReplayAndStats(state: TableState, now: number): void {
  if (state.currentHandRecorded) return;
  state.currentHandRecorded = true;

  const winnerMap = new Map(state.winners.map((w) => [w.playerId, w]));
  const nonFoldedCount = countNonFoldedPlayers(state);
  const wonByFoldOnly = nonFoldedCount <= 1;

  for (const p of state.players) {
    if (!p.inHand) continue;
    const prev = state.playerStats[p.id] ?? {
      playerId: p.id,
      playerName: p.name,
      handsPlayed: 0,
      vpipHands: 0,
      handsWon: 0,
      showdownReached: 0,
      showdownWon: 0,
      sessionNetChips: 0,
    };
    prev.playerName = p.name;
    prev.handsPlayed += 1;
    if (state.currentHandVpipIds.includes(p.id)) {
      prev.vpipHands += 1;
    }
    const w = winnerMap.get(p.id);
    const won = Boolean(w);
    const handNet = w ? w.netChange : -p.totalContributed;
    prev.sessionNetChips = (prev.sessionNetChips ?? 0) + handNet;
    if (won) {
      prev.handsWon += 1;
    }
    if (!wonByFoldOnly && !p.folded) {
      prev.showdownReached += 1;
      if (won) {
        prev.showdownWon += 1;
      }
    }
    state.playerStats[p.id] = prev;
  }

  const record: HandReplayRecord = {
    handNumber: state.handNumber,
    timestamp: now,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    pot: state.pot,
    communityCards: [...state.communityCards],
    winners: [...state.winners],
    players: getSortedPlayers(state)
      .filter((p) => p.inHand)
      .map((p) => {
        const w = winnerMap.get(p.id);
        const netChange = w ? w.netChange : -p.totalContributed;
        const autoPublic = !wonByFoldOnly && !p.folded;
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          seatIndex: p.seatIndex,
          chipsAfter: p.chips,
          netChange,
          folded: p.folded,
          allIn: p.allIn,
          revealed: Boolean(p.revealed || autoPublic),
          holeCards: p.holeCards.length > 0 ? [...p.holeCards] : null,
        };
      }),
    actions: [...state.currentHandActions],
    potTimeline: [...state.currentPotTimeline],
  };

  state.handHistory.push(record);
  if (state.handHistory.length > MAX_HAND_HISTORY) {
    state.handHistory.splice(0, state.handHistory.length - MAX_HAND_HISTORY);
  }

  state.nextHandAt =
    state.autoNextHandEnabled && canStartHand(state)
      ? now + AUTO_NEXT_HAND_DELAY_MS
      : null;
}

function resolveFoldWin(state: TableState, now: number = Date.now()): void {
  const winner = state.players.find((p) => p.inHand && !p.folded);
  state.phase = 'showdown';
  state.allInRunout = false;
  state.currentTurnPlayerId = null;
  state.turnDeadline = null;

  if (!winner) return;

  // Official rule: refund any uncalled excess bet above the highest other contribution
  const otherContribs = [
    ...state.players.filter((p) => p.id !== winner.id).map((p) => p.totalContributed),
    ...(state.deadContributions ?? []),
  ];
  const maxOtherContrib = otherContribs.length > 0 ? Math.max(0, ...otherContribs) : 0;
  const uncalledExcess = Math.max(0, winner.totalContributed - maxOtherContrib);
  if (uncalledExcess > 0) {
    winner.chips += uncalledExcess;
    winner.totalContributed = Math.max(0, winner.totalContributed - uncalledExcess);
    state.pot = Math.max(0, state.pot - uncalledExcess);
    // Uncalled shove is NOT a contested all-in (prevents free all-in achievement farming)
    if (winner.chips > 0) {
      winner.allIn = false;
    }
    const refundStreet =
      state.currentPotTimeline.length > 0
        ? state.currentPotTimeline[state.currentPotTimeline.length - 1].street
        : 'preflop';
    state.currentPotTimeline.push({
      step: state.currentPotTimeline.length + 1,
      street: refundStreet,
      actorId: winner.id,
      actorName: winner.name,
      actionType: 'refund',
      actionLabel: `退回超额 ${uncalledExcess}`,
      amountAdded: -uncalledExcess,
      potAfter: state.pot,
      timestamp: now,
    });
  }

  const totalPot = state.pot;
  winner.chips += totalPot;
  const netChange = totalPot - winner.totalContributed;

  state.winners = [
    {
      playerId: winner.id,
      playerName: winner.name,
      amount: totalPot,
      handName: '对手全部弃牌',
      bestCards: [],
      netChange,
    },
  ];
  pushLog(state, `${winner.name} 赢得底池 ${totalPot}（对手弃牌）`);
  finalizeHandReplayAndStats(state, now);
}

function resolveShowdown(state: TableState, now: number = Date.now()): void {
  state.phase = 'showdown';
  state.allInRunout = false;
  state.currentTurnPlayerId = null;
  state.turnDeadline = null;

  const contenders = state.players.filter((p) => p.inHand && !p.folded);
  if (contenders.length === 0) return;

  const evals = new Map<string, ReturnType<typeof evaluateBestHand>>();
  for (const p of contenders) {
    evals.set(p.id, evaluateBestHand([...p.holeCards, ...state.communityCards]));
  }

  const deadContribs = (state.deadContributions ?? []).filter((c) => c > 0);
  const levels = Array.from(
    new Set([
      ...state.players.filter((p) => p.totalContributed > 0).map((p) => p.totalContributed),
      ...deadContribs,
    ])
  ).sort((a, b) => a - b);

  const payouts = new Map<string, number>();
  for (const p of state.players) {
    payouts.set(p.id, 0);
  }

  let prevLevel = 0;
  for (const level of levels) {
    let sliceAmount = 0;
    let deadInSlice = 0;
    const contributorsInSlice: TablePlayer[] = [];
    for (const p of state.players) {
      const sliceContrib = Math.max(0, Math.min(p.totalContributed, level) - prevLevel);
      if (sliceContrib > 0) {
        sliceAmount += sliceContrib;
        contributorsInSlice.push(p);
      }
    }
    for (const dc of deadContribs) {
      const sliceContrib = Math.max(0, Math.min(dc, level) - prevLevel);
      if (sliceContrib > 0) {
        sliceAmount += sliceContrib;
        deadInSlice += sliceContrib;
      }
    }
    prevLevel = level;
    if (sliceAmount === 0) continue;

    let eligible = contenders.filter((p) => p.totalContributed >= level);
    if (eligible.length === 0) {
      // Dead money above the highest contender's contribution rolls into the top eligible tier
      const maxContenderContrib = Math.max(...contenders.map((p) => p.totalContributed));
      eligible = contenders.filter((p) => p.totalContributed === maxContenderContrib);
    }
    if (eligible.length === 0) continue;

    // Official rule: an excess bet slice contributed solely by one player is an uncalled bet refund,
    // NOT a won pot (so it must not credit handsWon / showdownWon or list them as a showdown winner).
    if (
      deadInSlice === 0 &&
      eligible.length === 1 &&
      contributorsInSlice.length === 1 &&
      contributorsInSlice[0].id === eligible[0].id
    ) {
      const refundedPlayer = eligible[0];
      refundedPlayer.chips += sliceAmount;
      refundedPlayer.totalContributed = Math.max(0, refundedPlayer.totalContributed - sliceAmount);
      state.pot = Math.max(0, state.pot - sliceAmount);
      if (refundedPlayer.chips > 0) {
        refundedPlayer.allIn = false;
      }
      const refundStreet =
        state.currentPotTimeline.length > 0
          ? state.currentPotTimeline[state.currentPotTimeline.length - 1].street
          : 'river';
      state.currentPotTimeline.push({
        step: state.currentPotTimeline.length + 1,
        street: refundStreet,
        actorId: refundedPlayer.id,
        actorName: refundedPlayer.name,
        actionType: 'refund',
        actionLabel: `退回超额 ${sliceAmount}`,
        amountAdded: -sliceAmount,
        potAfter: state.pot,
        timestamp: now,
      });
      pushLog(state, `${refundedPlayer.name} 退回未被跟注筹码 ${sliceAmount}`);
      continue;
    }

    let bestScore = -1;
    let sliceWinners: TablePlayer[] = [];
    for (const p of eligible) {
      const score = evals.get(p.id)!.score;
      if (score > bestScore) {
        bestScore = score;
        sliceWinners = [p];
      } else if (score === bestScore) {
        sliceWinners.push(p);
      }
    }

    const baseShare = Math.floor(sliceAmount / sliceWinners.length);
    let remainder = sliceAmount % sliceWinners.length;

    const seatSpan = Math.max(
      1,
      state.dealerSeatIndex + 1,
      ...state.players.map((p) => p.seatIndex + 1)
    );
    const orderedWinners = [...sliceWinners].sort((a, b) => {
      const distA = (((a.seatIndex - state.dealerSeatIndex - 1) % seatSpan) + seatSpan) % seatSpan;
      const distB = (((b.seatIndex - state.dealerSeatIndex - 1) % seatSpan) + seatSpan) % seatSpan;
      return distA - distB;
    });

    for (const w of orderedWinners) {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder--;
      payouts.set(w.id, (payouts.get(w.id) ?? 0) + baseShare + extra);
    }
  }

  const winners: WinnerInfo[] = [];
  for (const p of contenders) {
    const won = payouts.get(p.id) ?? 0;
    if (won > 0) {
      p.chips += won;
      const ev = evals.get(p.id)!;
      winners.push({
        playerId: p.id,
        playerName: p.name,
        amount: won,
        handName: ev.categoryName,
        bestCards: ev.bestCards,
        netChange: won - p.totalContributed,
      });
      pushLog(state, `${p.name} 以【${ev.categoryName}】赢得 ${won}`);
    }
  }

  state.winners = winners;
  finalizeHandReplayAndStats(state, now);
}

/**
 * Computes itemized Main Pot + Side Pot(s) from current contributions and dead money.
 */
export function computeSidePots(state: TableState): SidePotInfo[] {
  if (state.pot <= 0) return [];
  const contenders = state.players.filter((p) => p.inHand && !p.folded);
  if (contenders.length === 0) return [];

  const deadContribs = (state.deadContributions ?? []).filter((c) => c > 0);
  const levels = Array.from(
    new Set([
      ...state.players.filter((p) => p.totalContributed > 0).map((p) => p.totalContributed),
      ...deadContribs,
    ])
  ).sort((a, b) => a - b);

  const rawTiers: Array<{ amount: number; eligibleIds: string[] }> = [];
  let prevLevel = 0;

  for (const level of levels) {
    let sliceAmount = 0;
    for (const p of state.players) {
      sliceAmount += Math.max(0, Math.min(p.totalContributed, level) - prevLevel);
    }
    for (const dc of deadContribs) {
      sliceAmount += Math.max(0, Math.min(dc, level) - prevLevel);
    }
    prevLevel = level;
    if (sliceAmount <= 0) continue;

    let eligible = contenders.filter((p) => p.totalContributed >= level);
    if (eligible.length === 0) {
      const maxC = Math.max(...contenders.map((p) => p.totalContributed));
      eligible = contenders.filter((p) => p.totalContributed === maxC);
    }
    const eligibleIds = eligible.map((p) => p.id).sort();
    const prevTier = rawTiers[rawTiers.length - 1];
    if (
      prevTier &&
      prevTier.eligibleIds.length === eligibleIds.length &&
      prevTier.eligibleIds.every((id, idx) => id === eligibleIds[idx])
    ) {
      prevTier.amount += sliceAmount;
    } else {
      rawTiers.push({ amount: sliceAmount, eligibleIds });
    }
  }

  return rawTiers.map((tier, idx) => ({
    amount: tier.amount,
    eligiblePlayerIds: tier.eligibleIds,
    isMain: idx === 0,
  }));
}

/**
 * Produces a player-specific view where opponents' hole cards remain hidden until showdown/all-in runout/reveal.
 */
export function sanitizeTableForPlayer(state: TableState, viewerId: string): ClientTableView {
  const showAllContenders =
    (state.phase === 'showdown' || state.allInRunout) && countNonFoldedPlayers(state) >= 2;

  const players: ClientPlayerView[] = getSortedPlayers(state).map((p) => {
    const isSelf = p.id === viewerId;
    const revealCards =
      isSelf || Boolean(p.revealed) || (showAllContenders && p.inHand && !p.folded);
    const holeCards = revealCards && p.holeCards.length > 0 ? p.holeCards : null;
    const handEvaluation =
      holeCards && holeCards.length === 2
        ? evaluateBestHand([...holeCards, ...state.communityCards])
        : null;

    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      seatIndex: p.seatIndex,
      isBot: p.isBot,
      connected: p.connected,
      chips: p.chips,
      holeCards,
      cardCount: p.holeCards.length,
      inHand: p.inHand,
      folded: p.folded,
      allIn: p.allIn,
      revealed: Boolean(p.revealed),
      joinedAt: p.joinedAt,
      currentBet: p.currentBet,
      totalContributed: p.totalContributed,
      lastActionLabel: p.lastActionLabel,
      handEvaluation,
      achievements: p.achievements ?? [],
      achievementDates: p.achievementDates ?? {},
      equippedAchievement: p.equippedAchievement,
      winStreak: p.winStreak ?? 0,
      level: p.level ?? 1,
    };
  });

  const viewer = state.players.find((p) => p.id === viewerId);
  const myHandEvaluation =
    viewer && viewer.holeCards.length === 2 && !viewer.folded
      ? evaluateBestHand([...viewer.holeCards, ...state.communityCards])
      : null;

  const alreadyPublicContender = Boolean(
    viewer && showAllContenders && viewer.inHand && !viewer.folded
  );
  const canRevealMyCards = Boolean(
    state.phase === 'showdown' &&
      viewer &&
      viewer.holeCards.length === 2 &&
      !viewer.revealed &&
      !alreadyPublicContender
  );

  const sanitizedHistory: HandReplayRecord[] = state.handHistory.map((h) => ({
    ...h,
    players: h.players.map((sp) => ({
      ...sp,
      holeCards: sp.id === viewerId || sp.revealed ? sp.holeCards : null,
    })),
  }));

  return {
    roomId: state.roomId,
    hostId: state.hostId,
    phase: state.phase,
    handNumber: state.handNumber,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    startingChips: state.startingChips,
    dealerSeatIndex: state.dealerSeatIndex,
    smallBlindSeatIndex: state.smallBlindSeatIndex,
    bigBlindSeatIndex: state.bigBlindSeatIndex,
    manualBlindTarget: state.manualBlindTarget,
    pendingBlinds: state.pendingBlinds,
    previewNextBlinds: resolveNextHandSeats(state),
    currentTurnPlayerId: state.currentTurnPlayerId,
    turnDeadline: state.turnDeadline,
    allInRunout: state.allInRunout,
    nextHandAt: state.nextHandAt,
    autoNextHandEnabled: state.autoNextHandEnabled,
    canRevealMyCards,
    pot: state.pot,
    sidePots: computeSidePots(state),
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    communityCards: state.communityCards,
    players,
    winners: state.winners,
    actionLog: state.actionLog,
    analytics: {
      currentPotTimeline: state.currentPotTimeline,
      handHistory: sanitizedHistory,
      playerStats: state.playerStats,
    },
    myAvailableActions: getAvailableActions(state, viewerId),
    myHandEvaluation,
  };
}
