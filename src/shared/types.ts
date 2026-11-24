import type {
  AchievementDatesMap,
  AchievementId,
  EquippedAchievementPref,
  PlayerAchievementStats,
} from './achievements';
import type { PlayerBehaviorStats } from './playerInsights';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export type JokerKind = 'little' | 'big';

export interface Card {
  suit: Suit;
  rank: Rank;
  joker?: JokerKind;
}

export type HandCategory =
  | 0 // High Card
  | 1 // One Pair
  | 2 // Two Pair
  | 3 // Three of a Kind
  | 4 // Straight
  | 5 // Flush
  | 6 // Full House
  | 7 // Four of a Kind
  | 8 // Straight Flush
  | 9; // Royal Flush

export interface HandEvaluation {
  category: HandCategory;
  categoryName: string;
  score: number;
  bestCards: Card[];
}

export type StreetPhase =
  | 'waiting'
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown';

export type PlayerActionType = 'fold' | 'check' | 'call' | 'raise';

export interface PlayerAction {
  type: PlayerActionType;
  amount?: number; // Target total bet for the street when raising
}

export interface AvailableActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  isOpeningBet: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

export interface TablePlayer {
  id: string;
  name: string;
  avatar?: string;
  seatIndex: number;
  isBot: boolean;
  connected: boolean;
  chips: number;
  holeCards: Card[];
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  revealed?: boolean;
  joinedAt?: number;
  currentBet: number;
  totalContributed: number;
  actedThisRound: boolean;
  lastActionLabel?: string;
  achievements?: AchievementId[];
  achievementDates?: AchievementDatesMap;
  equippedAchievement?: EquippedAchievementPref;
  winStreak?: number;
  level?: number;
}

export interface WinnerInfo {
  playerId: string;
  playerName: string;
  amount: number;
  handName: string;
  bestCards: Card[];
  netChange: number;
}

export interface SidePotInfo {
  amount: number;
  eligiblePlayerIds: string[];
  isMain: boolean;
}

export interface PotTimelinePoint {
  step: number;
  street: StreetPhase;
  actorId: string;
  actorName: string;
  actionType: string;
  actionLabel: string;
  amountAdded: number;
  potAfter: number;
  timestamp: number;
}

export interface HandReplayAction {
  street: StreetPhase;
  playerId: string;
  playerName: string;
  actionLabel: string;
  amountAdded: number;
  potAfter: number;
  timestamp: number;
}

export interface HandReplayPlayerSnapshot {
  id: string;
  name: string;
  avatar?: string;
  seatIndex: number;
  chipsAfter: number;
  netChange: number;
  folded: boolean;
  allIn: boolean;
  revealed: boolean;
  holeCards: Card[] | null;
}

export interface HandReplayRecord {
  handNumber: number;
  timestamp: number;
  smallBlind: number;
  bigBlind: number;
  pot: number;
  dealerSeatIndex?: number;
  smallBlindSeatIndex?: number | null;
  bigBlindSeatIndex?: number | null;
  communityCards: Card[];
  winners: WinnerInfo[];
  players: HandReplayPlayerSnapshot[];
  actions: HandReplayAction[];
  potTimeline: PotTimelinePoint[];
}

export type DecisionVerdict = 'optimal' | 'acceptable' | 'inaccuracy' | 'mistake';

export interface HandReviewDecisionEvidence {
  potBefore: number;
  toCall: number;
  potOddsPct: number;
  mdfPct: number;
  estimatedEquityPct: number | null;
  preflopMix: { raise: number; call: number; fold: number } | null;
  betToPotPct: number | null;
  spr: number;
}

export interface HandReviewHeroDecision {
  step: number;
  street: StreetPhase;
  actualActionType: string;
  actualActionLabel: string;
  recommendedAction: 'raise' | 'call' | 'check' | 'fold';
  recommendedLabel: string;
  verdict: DecisionVerdict;
  verdictLabel: string;
  evidence: HandReviewDecisionEvidence;
  analysis: string;
  suggestion: string;
}

export interface HandReviewStreetSection {
  street: 'preflop' | 'flop' | 'turn' | 'river';
  streetLabel: string;
  boardCards: Card[];
  boardSummary: string;
  potStart: number;
  potEnd: number;
  events: Array<{
    step: number;
    actorId: string;
    actorName: string;
    isHero: boolean;
    actionType: string;
    actionLabel: string;
    amountAdded: number;
    potAfter: number;
    betToPotPct: number | null;
  }>;
  heroDecisions: HandReviewHeroDecision[];
}

export interface HandReviewTeachingPoint {
  topic: string;
  principle: string;
  formulaOrRule: string;
  nextHandDrill: string;
}

export interface HandReviewSessionOpponentRead {
  playerId: string;
  playerName: string;
  handsObserved: number;
  archetypeLabel: string;
  vpipPct: number;
  pfrPct: number;
  foldToBetPct: number;
  aggressionFactor: number;
  exploitativeAdvice: string;
}

export interface HandReviewHeroTableImage {
  handsObserved: number;
  archetype: string;
  archetypeLabel: string;
  confidencePct: number;
  botCounterSummary: string;
  antiExploitTip: string;
}

export interface HandReviewSessionContext {
  heroTableImage: HandReviewHeroTableImage | null;
  opponentReads: HandReviewSessionOpponentRead[];
  exploitativeNotes: string[];
}

export interface HandReviewReport {
  handNumber: number;
  timestamp: number;
  outcome: 'win' | 'loss' | 'split';
  wonByFold: boolean;
  netChips: number;
  netBB: number;
  pot: number;
  smallBlind: number;
  bigBlind: number;
  heroId: string;
  heroName: string;
  heroPosition: string;
  heroHoleCards: Card[] | null;
  canonicalHand: string | null;
  heroFinalHandName: string | null;
  communityCards: Card[];
  showdownOpponents: Array<{
    id: string;
    name: string;
    holeCards: Card[];
    handName: string;
    netChange: number;
    isWinner: boolean;
  }>;
  headline: string;
  overallSummary: string;
  streets: HandReviewStreetSection[];
  strengthsFound: string[];
  lessonsLearned: string[];
  teaching: HandReviewTeachingPoint;
  sessionProfileContext?: HandReviewSessionContext;
}

export interface PlayerMatchStats {
  playerId: string;
  playerName: string;
  handsPlayed: number;
  vpipHands: number;
  handsWon: number;
  showdownReached: number;
  showdownWon: number;
  sessionNetChips: number;
}

export interface RoomAnalyticsView {
  currentPotTimeline: PotTimelinePoint[];
  handHistory: HandReplayRecord[];
  playerStats: Record<string, PlayerMatchStats>;
}

export type BlindRoleTarget = 'dealer' | 'sb' | 'bb';

export interface ManualBlindTarget {
  role: BlindRoleTarget;
  seatIndex: number;
}

export interface BlindPair {
  smallBlind: number;
  bigBlind: number;
}

export interface NextBlindPreview {
  dealerSeatIndex: number | null;
  smallBlindSeatIndex: number | null;
  bigBlindSeatIndex: number | null;
}

export interface TableState {
  roomId: string;
  hostId: string | null;
  phase: StreetPhase;
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  allowRebuy: boolean;
  dealerSeatIndex: number;
  smallBlindSeatIndex: number | null;
  bigBlindSeatIndex: number | null;
  manualBlindTarget: ManualBlindTarget | null;
  pendingBlinds: BlindPair | null;
  currentTurnPlayerId: string | null;
  turnTimeoutSec: number;
  turnDeadline: number | null;
  allInRunout: boolean;
  nextHandAt: number | null;
  autoNextHandEnabled: boolean;
  pot: number;
  deadContributions?: number[];
  currentBet: number;
  lastFullBet: number;
  minRaise: number;
  raiseLockedPlayerIds: string[];
  communityCards: Card[];
  deck: Card[];
  players: TablePlayer[];
  winners: WinnerInfo[];
  actionLog: string[];
  currentPotTimeline: PotTimelinePoint[];
  currentHandActions: HandReplayAction[];
  handHistory: HandReplayRecord[];
  playerStats: Record<string, PlayerMatchStats>;
  currentHandVpipIds: string[];
  currentHandRecorded: boolean;
}

export interface ClientPlayerView {
  id: string;
  name: string;
  avatar?: string;
  seatIndex: number;
  isBot: boolean;
  connected: boolean;
  chips: number;
  holeCards: Card[] | null; // null if hidden from viewer
  cardCount: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  revealed?: boolean;
  joinedAt?: number;
  currentBet: number;
  totalContributed: number;
  lastActionLabel?: string;
  handEvaluation?: HandEvaluation | null;
  achievements?: AchievementId[];
  achievementDates?: AchievementDatesMap;
  equippedAchievement?: EquippedAchievementPref;
  winStreak?: number;
  level?: number;
}

export interface ClientTableView {
  roomId: string;
  hostId: string | null;
  phase: StreetPhase;
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  allowRebuy: boolean;
  dealerSeatIndex: number;
  smallBlindSeatIndex: number | null;
  bigBlindSeatIndex: number | null;
  manualBlindTarget: ManualBlindTarget | null;
  pendingBlinds: BlindPair | null;
  previewNextBlinds: NextBlindPreview;
  currentTurnPlayerId: string | null;
  turnTimeoutSec: number;
  turnDeadline: number | null;
  allInRunout: boolean;
  nextHandAt: number | null;
  autoNextHandEnabled: boolean;
  canRevealMyCards: boolean;
  pot: number;
  sidePots?: SidePotInfo[];
  currentBet: number;
  minRaise: number;
  communityCards: Card[];
  players: ClientPlayerView[];
  winners: WinnerInfo[];
  actionLog: string[];
  analytics: RoomAnalyticsView;
  myAvailableActions: AvailableActions | null;
  myHandEvaluation: HandEvaluation | null;
}

export interface LeaderboardEntry {
  playerName: string;
  avatar?: string;
  level?: number;
  points: number;
  netChips: number;
  handsPlayed: number;
  handsWon: number;
  bestHandName: string;
  bestHandScore: number;
  updatedAt: number;
  achievements?: AchievementId[];
  achievementDates?: AchievementDatesMap;
  equippedAchievement?: EquippedAchievementPref;
  currentWinStreak?: number;
  maxWinStreak?: number;
  stats?: PlayerAchievementStats;
  behaviorStats?: PlayerBehaviorStats;
}

export interface RoomSummary {
  roomId: string;
  tableName: string;
  playerCount: number;
  phase: StreetPhase;
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  turnTimeoutSec: number;
  allowRebuy: boolean;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  playerId: string;
  playerName: string;
  text: string;
  createdAt: number;
  isBot?: boolean;
}

export interface BotChatStatus {
  enabled: boolean;
  configured: boolean;
  source: 'room' | 'server' | 'none';
}

export interface PlayerNudgeEvent {
  fromPlayerId: string;
  fromPlayerName: string;
  targetPlayerId: string;
  targetPlayerName: string;
  message: string;
  createdAt: number;
}

// WebSocket protocol messages
export type ClientWsMessage =
    | {
        type: 'join_room';
        roomId: string;
        playerId: string;
        playerName: string;
        seatSecret?: string;
        authToken?: string;
        avatar?: string;
        achievements?: AchievementId[];
        achievementDates?: AchievementDatesMap;
        equippedAchievement?: EquippedAchievementPref;
      }
  | {
      type: 'update_profile';
      playerName?: string;
      avatar?: string;
      equippedAchievement?: EquippedAchievementPref;
    }
  | {
      type: 'create_room';
      tableName?: string;
      roomId?: string;
      smallBlind?: number;
      bigBlind?: number;
      startingChips?: number;
      turnTimeoutSec?: number;
      allowRebuy?: boolean;
    }
  | { type: 'delete_room'; roomId: string }
  | { type: 'leave_room' }
  | { type: 'start_hand' }
  | { type: 'player_action'; action: PlayerAction }
  | { type: 'reveal_cards' }
  | { type: 'nudge_player'; targetPlayerId: string }
  | { type: 'toggle_auto_next'; enabled: boolean }
  | { type: 'add_bot' }
  | { type: 'remove_bot'; botId: string }
  | { type: 'rebuy' }
  | {
      type: 'update_blind_settings';
      smallBlind?: number;
      bigBlind?: number;
      manualBlindTarget?: ManualBlindTarget | null;
    }
  | { type: 'send_chat'; text: string }
  | { type: 'ping' };

export type ServerWsMessage =
  | { type: 'table_state'; state: ClientTableView }
  | { type: 'leaderboard_update'; entries: LeaderboardEntry[] }
  | { type: 'rooms_update'; rooms: RoomSummary[] }
  | { type: 'room_deleted'; roomId: string; reason: string }
  | { type: 'chat_history'; roomId: string; messages: ChatMessage[] }
  | { type: 'chat_message'; message: ChatMessage }
  | { type: 'bot_chat_status'; roomId: string; status: BotChatStatus }
  | { type: 'player_nudged'; nudge: PlayerNudgeEvent }
  | { type: 'achievement_unlocked'; achievementIds: AchievementId[] }
  | { type: 'error'; message: string }
  | { type: 'pong' };

