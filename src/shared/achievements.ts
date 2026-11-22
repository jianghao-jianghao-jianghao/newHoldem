import type { Card, HandCategory } from './types';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'obsidian';
export type AchievementCategory = 'glory' | 'fun' | 'tactics';

export type AchievementId =
  | 'first_blood'
  | 'streak_3'
  | 'streak_5'
  | 'allin_winner'
  | 'allin_jackpot'
  | 'mega_pot'
  | 'bluff_king'
  | 'trips_master'
  | 'flush_full'
  | 'royal_legend'
  | 'chip_doubler'
  | 'club_tycoon'
  // New fun, quirky & tactical achievements
  | 'seven_two_legend'
  | 'chip_whale'
  | 'high_card_hero'
  | 'short_stack_ninja'
  | 'pocket_rockets'
  | 'aces_cracked'
  | 'bad_beat_survivor'
  | 'blind_guardian'
  | 'iron_regular'
  | 'preflop_bandit'
  | 'split_peace'
  | 'tuition_paid'
  // Showdown mastery & iconic starting-hand achievements
  | 'showdown_streak_3'
  | 'doyle_brunson'
  | 'big_slick_win'
  | 'cowboys_win'
  | 'snowmen_win'
  | 'suited_connector_art';

export interface AchievementDef {
  id: AchievementId;
  name: string;
  description: string;
  tier: AchievementTier;
  category: AchievementCategory;
  /** Higher weight appears first in compact medal row beside avatar */
  priority: number;
}

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  glory: '荣耀战绩',
  fun: '牌桌趣事',
  tactics: '实战风格',
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'royal_legend',
    name: '殿堂传奇',
    description: '摊牌亮出四条、同花顺或皇家同花顺',
    tier: 'obsidian',
    category: 'glory',
    priority: 130,
  },
  {
    id: 'seven_two_legend',
    name: '7-2 传说',
    description: '手持「德州最烂起手牌」杂色 7-2 赢下底池，心理战天花板',
    tier: 'obsidian',
    category: 'fun',
    priority: 125,
  },
  {
    id: 'doyle_brunson',
    name: '传奇 10-2',
    description: '手持两届 WSOP 冠军传奇起手牌 10-2 赢下底池，致敬多伊尔·布朗森',
    tier: 'obsidian',
    category: 'fun',
    priority: 122,
  },
  {
    id: 'mega_pot',
    name: '金池主宰',
    description: '单局赢下至少 60 倍大盲注的超大底池',
    tier: 'obsidian',
    category: 'glory',
    priority: 118,
  },
  {
    id: 'chip_whale',
    name: '深海巨鲸',
    description: '在牌桌中将持有筹码冲破初始筹码的 4 倍，气场碾压全场',
    tier: 'obsidian',
    category: 'glory',
    priority: 112,
  },
  {
    id: 'streak_5',
    name: '五连封神',
    description: '连续赢下 5 局牌局',
    tier: 'gold',
    category: 'glory',
    priority: 105,
  },
  {
    id: 'showdown_streak_3',
    name: '摊牌三连斩',
    description: '连续 3 次杀入河牌摊牌并亮牌赢下底池，稳准狠的读牌大师',
    tier: 'gold',
    category: 'tactics',
    priority: 102,
  },
  {
    id: 'allin_jackpot',
    name: '豪赌巨赏',
    description: '单局全押 (All-in) 并赢取至少 1,000 筹码奖金',
    tier: 'gold',
    category: 'glory',
    priority: 100,
  },
  {
    id: 'high_card_hero',
    name: '空气赢家',
    description: '仅凭「高牌」一路硬刚到摊牌并惊险拿下底池',
    tier: 'gold',
    category: 'fun',
    priority: 96,
  },
  {
    id: 'short_stack_ninja',
    name: '残血反杀',
    description: '开局筹码不足 10 倍大盲注时成功赢池续命，人称丝血忍者',
    tier: 'gold',
    category: 'tactics',
    priority: 94,
  },
  {
    id: 'pocket_rockets',
    name: '双 A 火箭',
    description: '手持口袋对 A (AA) 稳健起飞并赢下底池',
    tier: 'gold',
    category: 'glory',
    priority: 92,
  },
  {
    id: 'club_tycoon',
    name: '俱乐部大亨',
    description: '累计赢下 10 局对局，或累计净胜筹码达到 2,000',
    tier: 'gold',
    category: 'glory',
    priority: 90,
  },
  {
    id: 'streak_3',
    name: '三连胜',
    description: '连续赢下 3 局牌局',
    tier: 'silver',
    category: 'glory',
    priority: 82,
  },
  {
    id: 'allin_winner',
    name: '破釜沉舟',
    description: '在牌局中全押 (All-in) 并最终赢下底池',
    tier: 'silver',
    category: 'tactics',
    priority: 78,
  },
  {
    id: 'aces_cracked',
    name: '火箭坠毁',
    description: '手持口袋对 A (AA) 却在摊牌中惨遭爆冷，完成德州必修课',
    tier: 'silver',
    category: 'fun',
    priority: 76,
  },
  {
    id: 'bad_beat_survivor',
    name: '天选倒霉蛋',
    description: '摊牌亮出三条及以上强牌却依然惜败，喜提「冤家牌」认证',
    tier: 'silver',
    category: 'fun',
    priority: 74,
  },
  {
    id: 'flush_full',
    name: '花船精英',
    description: '摊牌亮出顺子、同花或葫芦赢下对局',
    tier: 'silver',
    category: 'glory',
    priority: 70,
  },
  {
    id: 'cowboys_win',
    name: '西部牛仔',
    description: '手持口袋对 K (KK / Cowboys) 策马疾驰赢下底池',
    tier: 'silver',
    category: 'fun',
    priority: 69,
  },
  {
    id: 'big_slick_win',
    name: '大滑头绝杀',
    description: '手持经典起手牌 A-K (Big Slick) 强势拿下底池',
    tier: 'silver',
    category: 'fun',
    priority: 68,
  },
  {
    id: 'suited_connector_art',
    name: '同花连张艺术家',
    description: '手持同花连张（如 9♠-10♠）进入摊牌并优雅收割底池',
    tier: 'silver',
    category: 'tactics',
    priority: 64,
  },
  {
    id: 'chip_doubler',
    name: '筹码翻倍',
    description: '在牌桌中将持有筹码增至初始筹码的 2 倍以上',
    tier: 'silver',
    category: 'glory',
    priority: 66,
  },
  {
    id: 'blind_guardian',
    name: '大盲守门员',
    description: '坐镇大盲位 (BB) 成功守住底池累计 3 次',
    tier: 'silver',
    category: 'tactics',
    priority: 62,
  },
  {
    id: 'iron_regular',
    name: '牌室钉子户',
    description: '累计完成 25 局牌局，堪称俱乐部铁打常驻牌手',
    tier: 'silver',
    category: 'glory',
    priority: 58,
  },
  {
    id: 'snowmen_win',
    name: '雪人降临',
    description: '手持口袋对 8 (88 / Snowmen) 冷静发力赢下底池',
    tier: 'bronze',
    category: 'fun',
    priority: 54,
  },
  {
    id: 'trips_master',
    name: '三条猎手',
    description: '摊牌亮出三条或更高牌型',
    tier: 'bronze',
    category: 'glory',
    priority: 52,
  },
  {
    id: 'bluff_king',
    name: '气场压制',
    description: '迫使所有对手弃牌不战而胜累计 3 次',
    tier: 'bronze',
    category: 'tactics',
    priority: 48,
  },
  {
    id: 'preflop_bandit',
    name: '翻前收割机',
    description: '公共牌尚未发出便靠翻前气势逼退全场赢下底池',
    tier: 'bronze',
    category: 'tactics',
    priority: 46,
  },
  {
    id: 'split_peace',
    name: '握手言和',
    description: '与对手牌力完全打平，握手平分底池共享和平',
    tier: 'bronze',
    category: 'fun',
    priority: 44,
  },
  {
    id: 'tuition_paid',
    name: '交完学费',
    description: '单局打光全部筹码归零——别灰心，高手都交过学费',
    tier: 'bronze',
    category: 'fun',
    priority: 42,
  },
  {
    id: 'first_blood',
    name: '初露锋芒',
    description: '赢下个人第 1 局德州扑克胜利',
    tier: 'bronze',
    category: 'glory',
    priority: 40,
  },
];

export const ACHIEVEMENT_MAP = new Map<AchievementId, AchievementDef>(
  ACHIEVEMENTS.map((a) => [a.id, a])
);

export type AchievementDatesMap = Partial<Record<AchievementId, number>>;

export type EquippedAchievementPref = AchievementId | 'none';

export const ACHIEVEMENT_TIER_LABELS: Record<AchievementTier, string> = {
  bronze: '铜章',
  silver: '银章',
  gold: '金章',
  obsidian: '传奇黑金',
};

export function sanitizeEquippedAchievement(raw: unknown): EquippedAchievementPref | undefined {
  if (raw === 'none') return 'none';
  if (typeof raw === 'string' && ACHIEVEMENT_MAP.has(raw as AchievementId)) {
    return raw as AchievementId;
  }
  return undefined;
}

/**
 * Resolves the single signature medal displayed on a player's avatar frame.
 * - Explicit `'none'` hides the avatar medal cleanly.
 * - Explicit unlocked `AchievementId` displays that chosen medal.
 * - Otherwise falls back to the highest-priority unlocked medal (if any).
 */
export function resolveEquippedAchievement(
  preferred: EquippedAchievementPref | null | undefined,
  unlocked: AchievementId[]
): AchievementId | null {
  if (preferred === 'none') return null;
  const sorted = sanitizeAchievementIds(unlocked);
  if (preferred && sorted.includes(preferred)) {
    return preferred;
  }
  return sorted[0] ?? null;
}

export function sanitizeAchievementIds(raw: unknown): AchievementId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<AchievementId>();
  for (const item of raw) {
    if (typeof item === 'string' && ACHIEVEMENT_MAP.has(item as AchievementId)) {
      seen.add(item as AchievementId);
    }
  }
  return Array.from(seen).sort(
    (a, b) =>
      (ACHIEVEMENT_MAP.get(b)?.priority ?? 0) -
      (ACHIEVEMENT_MAP.get(a)?.priority ?? 0)
  );
}

export function sanitizeAchievementDates(raw: unknown): AchievementDatesMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: AchievementDatesMap = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (
      ACHIEVEMENT_MAP.has(key as AchievementId) &&
      typeof val === 'number' &&
      Number.isFinite(val) &&
      val > 0
    ) {
      result[key as AchievementId] = Math.floor(val);
    }
  }
  return result;
}

export function mergeAchievementDates(
  existingDates: AchievementDatesMap | undefined,
  unlockedIds: AchievementId[],
  newlyUnlocked: AchievementId[],
  nowMs: number = Date.now()
): AchievementDatesMap {
  const next: AchievementDatesMap = sanitizeAchievementDates(existingDates);
  for (const id of newlyUnlocked) {
    if (!next[id]) {
      next[id] = nowMs;
    }
  }
  for (const id of unlockedIds) {
    if (!next[id]) {
      next[id] = nowMs;
    }
  }
  return next;
}

export function formatAchievementDate(timestamp?: number): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
    return '早期解锁';
  }
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatAchievementDateTime(timestamp?: number): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
    return '早期俱乐部纪录';
  }
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export interface PlayerAchievementStats {
  handsPlayed: number;
  handsWon: number;
  currentWinStreak: number;
  maxWinStreak: number;
  allInWins: number;
  maxAllInPotWon: number;
  maxPotWon: number;
  foldWins: number;
  bestHandCategory: HandCategory;
  doubledChips: boolean;
  netChips: number;
  // Extended fun & tactical milestones (optional for backward compatibility with persisted JSON)
  quadrupledChips?: boolean;
  sevenTwoWins?: number;
  pocketAcesWins?: number;
  acesCrackedCount?: number;
  highCardShowdownWins?: number;
  shortStackWins?: number;
  splitPots?: number;
  bigBlindWins?: number;
  preflopFoldWins?: number;
  badBeatLosses?: number;
  bustCount?: number;
  currentShowdownWinStreak?: number;
  maxShowdownWinStreak?: number;
  doyleBrunsonWins?: number;
  bigSlickWins?: number;
  cowboysWins?: number;
  snowmenWins?: number;
  suitedConnectorShowdownWins?: number;
}

export function createEmptyAchievementStats(): PlayerAchievementStats {
  return {
    handsPlayed: 0,
    handsWon: 0,
    currentWinStreak: 0,
    maxWinStreak: 0,
    allInWins: 0,
    maxAllInPotWon: 0,
    maxPotWon: 0,
    foldWins: 0,
    bestHandCategory: 0,
    doubledChips: false,
    netChips: 0,
    quadrupledChips: false,
    sevenTwoWins: 0,
    pocketAcesWins: 0,
    acesCrackedCount: 0,
    highCardShowdownWins: 0,
    shortStackWins: 0,
    splitPots: 0,
    bigBlindWins: 0,
    preflopFoldWins: 0,
    badBeatLosses: 0,
    bustCount: 0,
    currentShowdownWinStreak: 0,
    maxShowdownWinStreak: 0,
    doyleBrunsonWins: 0,
    bigSlickWins: 0,
    cowboysWins: 0,
    snowmenWins: 0,
    suitedConnectorShowdownWins: 0,
  };
}

export interface HandAchievementInput {
  won: boolean;
  potWon: number;
  netChips: number;
  wasAllIn: boolean;
  wonByFold: boolean;
  handCategory?: HandCategory | null;
  currentChips: number;
  startingChips: number;
  bigBlind: number;
  holeCards?: Card[];
  communityCardsCount?: number;
  wasSplitPot?: boolean;
  isBigBlind?: boolean;
  startingHandChips?: number;
  reachedShowdown?: boolean;
}

function isSevenTwoOffsuit(cards?: Card[]): boolean {
  if (!cards || cards.length !== 2) return false;
  const ranks = [cards[0].rank, cards[1].rank].sort((a, b) => a - b);
  return ranks[0] === 2 && ranks[1] === 7 && cards[0].suit !== cards[1].suit;
}

function isPocketAces(cards?: Card[]): boolean {
  if (!cards || cards.length !== 2) return false;
  return cards[0].rank === 14 && cards[1].rank === 14;
}

function isPocketKings(cards?: Card[]): boolean {
  if (!cards || cards.length !== 2) return false;
  return cards[0].rank === 13 && cards[1].rank === 13;
}

function isPocketEights(cards?: Card[]): boolean {
  if (!cards || cards.length !== 2) return false;
  return cards[0].rank === 8 && cards[1].rank === 8;
}

function isBigSlick(cards?: Card[]): boolean {
  if (!cards || cards.length !== 2) return false;
  const ranks = [cards[0].rank, cards[1].rank].sort((a, b) => a - b);
  return ranks[0] === 13 && ranks[1] === 14;
}

function isDoyleBrunson(cards?: Card[]): boolean {
  if (!cards || cards.length !== 2) return false;
  const ranks = [cards[0].rank, cards[1].rank].sort((a, b) => a - b);
  return ranks[0] === 2 && ranks[1] === 10;
}

function isSuitedConnector(cards?: Card[]): boolean {
  if (!cards || cards.length !== 2) return false;
  if (cards[0].suit !== cards[1].suit) return false;
  const diff = Math.abs(cards[0].rank - cards[1].rank);
  if (diff === 1) return true;
  // Wheel connector A-2 suited
  const ranks = [cards[0].rank, cards[1].rank].sort((a, b) => a - b);
  return ranks[0] === 2 && ranks[1] === 14;
}

export function evaluateAchievementsFromStats(
  stats: PlayerAchievementStats,
  bigBlind: number = 20
): AchievementId[] {
  const unlocked: AchievementId[] = [];
  const safeBB = Math.max(1, bigBlind);

  if (stats.handsWon >= 1) unlocked.push('first_blood');
  if (stats.maxWinStreak >= 3) unlocked.push('streak_3');
  if (stats.maxWinStreak >= 5) unlocked.push('streak_5');
  if (stats.allInWins >= 1) unlocked.push('allin_winner');
  if (stats.maxAllInPotWon >= 1000) unlocked.push('allin_jackpot');
  if (stats.maxPotWon >= safeBB * 60) unlocked.push('mega_pot');
  if (stats.foldWins >= 3) unlocked.push('bluff_king');
  if (stats.bestHandCategory >= 3) unlocked.push('trips_master');
  if (stats.bestHandCategory >= 4) unlocked.push('flush_full');
  if (stats.bestHandCategory >= 7) unlocked.push('royal_legend');
  if (stats.doubledChips) unlocked.push('chip_doubler');
  if (stats.handsWon >= 10 || stats.netChips >= 2000) unlocked.push('club_tycoon');

  // Extended fun & tactical achievements
  if (stats.quadrupledChips) unlocked.push('chip_whale');
  if ((stats.sevenTwoWins ?? 0) >= 1) unlocked.push('seven_two_legend');
  if ((stats.pocketAcesWins ?? 0) >= 1) unlocked.push('pocket_rockets');
  if ((stats.acesCrackedCount ?? 0) >= 1) unlocked.push('aces_cracked');
  if ((stats.highCardShowdownWins ?? 0) >= 1) unlocked.push('high_card_hero');
  if ((stats.shortStackWins ?? 0) >= 1) unlocked.push('short_stack_ninja');
  if ((stats.splitPots ?? 0) >= 1) unlocked.push('split_peace');
  if ((stats.bigBlindWins ?? 0) >= 3) unlocked.push('blind_guardian');
  if ((stats.preflopFoldWins ?? 0) >= 1) unlocked.push('preflop_bandit');
  if ((stats.badBeatLosses ?? 0) >= 1) unlocked.push('bad_beat_survivor');
  if ((stats.bustCount ?? 0) >= 1) unlocked.push('tuition_paid');
  if (stats.handsPlayed >= 25) unlocked.push('iron_regular');

  // Showdown mastery & iconic starting-hand achievements
  if ((stats.maxShowdownWinStreak ?? 0) >= 3) unlocked.push('showdown_streak_3');
  if ((stats.doyleBrunsonWins ?? 0) >= 1) unlocked.push('doyle_brunson');
  if ((stats.bigSlickWins ?? 0) >= 1) unlocked.push('big_slick_win');
  if ((stats.cowboysWins ?? 0) >= 1) unlocked.push('cowboys_win');
  if ((stats.snowmenWins ?? 0) >= 1) unlocked.push('snowmen_win');
  if ((stats.suitedConnectorShowdownWins ?? 0) >= 1) unlocked.push('suited_connector_art');

  // Sort by priority descending so the most prestigious medals appear first
  unlocked.sort(
    (a, b) =>
      (ACHIEVEMENT_MAP.get(b)?.priority ?? 0) -
      (ACHIEVEMENT_MAP.get(a)?.priority ?? 0)
  );
  return unlocked;
}

export function applyHandToAchievementStats(
  prevStats: PlayerAchievementStats | undefined,
  prevUnlocked: AchievementId[] | undefined,
  input: HandAchievementInput
): {
  nextStats: PlayerAchievementStats;
  unlocked: AchievementId[];
  newlyUnlocked: AchievementId[];
} {
  const base: PlayerAchievementStats = prevStats
    ? { ...createEmptyAchievementStats(), ...prevStats }
    : createEmptyAchievementStats();

  base.handsPlayed += 1;
  base.netChips += input.netChips;

  const hasPocketAces = isPocketAces(input.holeCards);
  const hasSevenTwoOff = isSevenTwoOffsuit(input.holeCards);
  const isShowdown =
    typeof input.reachedShowdown === 'boolean'
      ? input.reachedShowdown
      : !input.wonByFold && typeof input.handCategory === 'number';

  if (input.won) {
    base.handsWon += 1;
    base.currentWinStreak += 1;
    if (base.currentWinStreak > base.maxWinStreak) {
      base.maxWinStreak = base.currentWinStreak;
    }
    if (isShowdown && !input.wonByFold) {
      base.currentShowdownWinStreak = (base.currentShowdownWinStreak ?? 0) + 1;
      if (base.currentShowdownWinStreak > (base.maxShowdownWinStreak ?? 0)) {
        base.maxShowdownWinStreak = base.currentShowdownWinStreak;
      }
    }
    if (input.potWon > base.maxPotWon) {
      base.maxPotWon = input.potWon;
    }
    if (input.wasAllIn) {
      base.allInWins += 1;
      if (input.potWon > base.maxAllInPotWon) {
        base.maxAllInPotWon = input.potWon;
      }
    }
    if (input.wonByFold) {
      base.foldWins += 1;
      if (input.communityCardsCount === 0) {
        base.preflopFoldWins = (base.preflopFoldWins ?? 0) + 1;
      }
    }
    if (hasSevenTwoOff) {
      base.sevenTwoWins = (base.sevenTwoWins ?? 0) + 1;
    }
    if (hasPocketAces) {
      base.pocketAcesWins = (base.pocketAcesWins ?? 0) + 1;
    }
    if (isDoyleBrunson(input.holeCards)) {
      base.doyleBrunsonWins = (base.doyleBrunsonWins ?? 0) + 1;
    }
    if (isBigSlick(input.holeCards)) {
      base.bigSlickWins = (base.bigSlickWins ?? 0) + 1;
    }
    if (isPocketKings(input.holeCards)) {
      base.cowboysWins = (base.cowboysWins ?? 0) + 1;
    }
    if (isPocketEights(input.holeCards)) {
      base.snowmenWins = (base.snowmenWins ?? 0) + 1;
    }
    if (isShowdown && !input.wonByFold && isSuitedConnector(input.holeCards)) {
      base.suitedConnectorShowdownWins = (base.suitedConnectorShowdownWins ?? 0) + 1;
    }
    if (isShowdown && !input.wonByFold && input.handCategory === 0) {
      base.highCardShowdownWins = (base.highCardShowdownWins ?? 0) + 1;
    }
    if (
      typeof input.startingHandChips === 'number' &&
      input.startingHandChips > 0 &&
      input.startingHandChips < Math.max(1, input.bigBlind) * 10
    ) {
      base.shortStackWins = (base.shortStackWins ?? 0) + 1;
    }
    if (input.wasSplitPot) {
      base.splitPots = (base.splitPots ?? 0) + 1;
    }
    if (input.isBigBlind) {
      base.bigBlindWins = (base.bigBlindWins ?? 0) + 1;
    }
  } else {
    base.currentWinStreak = 0;
    if (isShowdown) {
      base.currentShowdownWinStreak = 0;
    }
    if (isShowdown && hasPocketAces) {
      base.acesCrackedCount = (base.acesCrackedCount ?? 0) + 1;
    }
    if (isShowdown && typeof input.handCategory === 'number' && input.handCategory >= 3) {
      base.badBeatLosses = (base.badBeatLosses ?? 0) + 1;
    }
    if (input.currentChips <= 0) {
      base.bustCount = (base.bustCount ?? 0) + 1;
    }
  }

  if (
    typeof input.handCategory === 'number' &&
    input.handCategory > base.bestHandCategory
  ) {
    base.bestHandCategory = input.handCategory;
  }

  if (input.startingChips > 0 && input.currentChips >= input.startingChips * 2) {
    base.doubledChips = true;
  }
  if (input.startingChips > 0 && input.currentChips >= input.startingChips * 4) {
    base.quadrupledChips = true;
  }

  const prevSet = new Set<AchievementId>(prevUnlocked ?? []);
  const evaluated = evaluateAchievementsFromStats(base, input.bigBlind);
  const mergedSet = new Set<AchievementId>([...prevSet, ...evaluated]);
  const unlocked = Array.from(mergedSet).sort(
    (a, b) =>
      (ACHIEVEMENT_MAP.get(b)?.priority ?? 0) -
      (ACHIEVEMENT_MAP.get(a)?.priority ?? 0)
  );
  const newlyUnlocked = evaluated.filter((id) => !prevSet.has(id));

  return {
    nextStats: base,
    unlocked,
    newlyUnlocked,
  };
}
