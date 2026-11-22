import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBotInitialStats,
  computePlayerLevel,
  getBotClubPreset,
  resolvePlayerAvatarProfile,
} from './playerProfile';
import type { LeaderboardEntry } from './types';

test('computePlayerLevel scales across bronze, silver, gold, and obsidian tiers', () => {
  const rookie = computePlayerLevel({ achievements: [], handsPlayed: 0, handsWon: 0, points: 1000 });
  assert.equal(rookie.level, 1);
  assert.equal(rookie.tier, 'bronze');

  const regular = computePlayerLevel({
    achievements: ['first_blood', 'trips_master'],
    handsPlayed: 8,
    handsWon: 4,
    points: 1220,
  });
  assert.ok(regular.level >= 3 && regular.level <= 5, `expected silver level, got ${regular.level}`);
  assert.equal(regular.tier, 'silver');

  const highRoller = computePlayerLevel({
    achievements: ['flush_full', 'allin_winner', 'streak_3', 'first_blood'],
    handsPlayed: 20,
    handsWon: 12,
    points: 1750,
  });
  assert.ok(highRoller.level >= 6, `expected gold+ level, got ${highRoller.level}`);
  assert.ok(highRoller.tier === 'gold' || highRoller.tier === 'obsidian');

  const legend = computePlayerLevel({
    achievements: ['royal_legend', 'flush_full', 'mega_pot', 'first_blood'],
    handsPlayed: 35,
    handsWon: 22,
    points: 2400,
  });
  assert.equal(legend.tier, 'obsidian');
  assert.ok(legend.level >= 10);
});

test('resolvePlayerAvatarProfile merges backend player state with global leaderboard state', () => {
  const leaderboard: LeaderboardEntry[] = [
    {
      playerName: '林深',
      avatar: 'crown',
      level: 7,
      points: 1680,
      netChips: 680,
      handsPlayed: 18,
      handsWon: 9,
      bestHandName: '葫芦',
      bestHandScore: 10000,
      updatedAt: 1000,
      achievements: ['streak_3', 'flush_full', 'first_blood'],
      achievementDates: {
        first_blood: 1000,
        flush_full: 2000,
        streak_3: 3000,
      },
      currentWinStreak: 3,
      maxWinStreak: 3,
    },
  ];

  const resolved = resolvePlayerAvatarProfile(
    {
      name: '林深',
      avatar: 'default',
      achievements: ['allin_winner'],
      achievementDates: { allin_winner: 4000 },
      winStreak: 1,
      isBot: false,
    },
    leaderboard
  );

  assert.equal(resolved.avatar, 'crown');
  assert.equal(resolved.winStreak, 3);
  assert.equal(resolved.achievements.length, 4);
  assert.ok(resolved.achievements.includes('allin_winner'));
  assert.ok(resolved.achievements.includes('streak_3'));
  assert.equal(resolved.achievementDates.allin_winner, 4000);
  assert.equal(resolved.achievementDates.streak_3, 3000);
  assert.ok(resolved.levelInfo.level >= 7);
});

test('resolvePlayerAvatarProfile preserves explicit player custom avatar over leaderboard avatar', () => {
  const leaderboard: LeaderboardEntry[] = [
    {
      playerName: '陈默',
      avatar: 'spade',
      points: 1420,
      netChips: 420,
      handsPlayed: 14,
      handsWon: 6,
      bestHandName: '同花',
      bestHandScore: 5000,
      updatedAt: 1000,
      achievements: ['flush_full', 'first_blood'],
      currentWinStreak: 1,
      maxWinStreak: 2,
    },
  ];

  const resolved = resolvePlayerAvatarProfile(
    {
      name: '陈默',
      avatar: 'phoenix',
      achievements: [],
      achievementDates: {},
      winStreak: 0,
      isBot: false,
    },
    leaderboard
  );

  assert.equal(resolved.avatar, 'phoenix');
  assert.deepEqual(resolved.achievements, ['flush_full', 'first_blood']);
});

test('getBotClubPreset and buildBotInitialStats hydrate named club bots with synced medals and level', () => {
  const preset = getBotClubPreset('周屿');
  assert.ok(preset);
  const init = buildBotInitialStats(preset);
  assert.ok(init.achievements.length >= 2);
  assert.ok(init.level >= 5);
  assert.equal(Object.keys(init.achievementDates).length, init.achievements.length);
});

test('resolvePlayerAvatarProfile updates dynamic rankTier (bronze/silver/gold/diamond) from leaderboard', () => {
  const basePlayer = {
    name: '新牌手',
    avatar: 'default',
    achievements: [] as [],
    achievementDates: {},
    winStreak: 0,
    isBot: false,
  };

  const bronze = resolvePlayerAvatarProfile(basePlayer, []);
  assert.equal(bronze.rankTier, 'bronze');
  assert.equal(bronze.rankTierLabel, '青铜');

  const silver = resolvePlayerAvatarProfile(basePlayer, [
    {
      playerName: '新牌手',
      points: 1220,
      netChips: 220,
      handsPlayed: 8,
      handsWon: 3,
      bestHandName: '两对',
      bestHandScore: 2000,
      updatedAt: 1000,
    },
  ]);
  assert.equal(silver.rankTier, 'silver');
  assert.equal(silver.rankTierLabel, '白银');
  assert.equal(silver.leaderboardRank, 1);

  const gold = resolvePlayerAvatarProfile(basePlayer, [
    {
      playerName: '林深',
      points: 1700,
      netChips: 700,
      handsPlayed: 20,
      handsWon: 11,
      bestHandName: '葫芦',
      bestHandScore: 6000,
      updatedAt: 1000,
    },
    {
      playerName: '新牌手',
      points: 1450,
      netChips: 450,
      handsPlayed: 15,
      handsWon: 7,
      bestHandName: '同花',
      bestHandScore: 5000,
      updatedAt: 1000,
    },
  ]);
  assert.equal(gold.rankTier, 'gold');
  assert.equal(gold.rankTierLabel, '黄金');
  assert.equal(gold.leaderboardRank, 2);

  const diamond = resolvePlayerAvatarProfile(basePlayer, [
    {
      playerName: '新牌手',
      points: 1860,
      netChips: 860,
      handsPlayed: 28,
      handsWon: 16,
      bestHandName: '四条',
      bestHandScore: 8000,
      updatedAt: 1000,
    },
  ]);
  assert.equal(diamond.rankTier, 'diamond');
  assert.equal(diamond.rankTierLabel, '钻石');
  assert.equal(diamond.leaderboardRank, 1);
});

test('resolvePlayerAvatarProfile resolves strictly one equippedAchievement with explicit override and none option', () => {
  const leaderboard: LeaderboardEntry[] = [
    {
      playerName: '林深',
      avatar: 'crown',
      points: 1680,
      netChips: 680,
      handsPlayed: 18,
      handsWon: 9,
      bestHandName: '葫芦',
      bestHandScore: 10000,
      updatedAt: 1000,
      achievements: ['royal_legend', 'streak_3', 'first_blood'],
      equippedAchievement: 'streak_3',
    },
  ];

  // Inherits leaderboard equippedAchievement when player state has none
  const fromBoard = resolvePlayerAvatarProfile(
    {
      name: '林深',
      avatar: 'default',
      achievements: [],
      isBot: false,
    },
    leaderboard
  );
  assert.equal(fromBoard.equippedAchievement, 'streak_3');

  // Explicit player equippedAchievement overrides leaderboard preference
  const explicitOverride = resolvePlayerAvatarProfile(
    {
      name: '林深',
      avatar: 'crown',
      achievements: ['first_blood'],
      equippedAchievement: 'first_blood',
      isBot: false,
    },
    leaderboard
  );
  assert.equal(explicitOverride.equippedAchievement, 'first_blood');

  // Explicit 'none' hides avatar medal even when achievements are unlocked
  const explicitlyHidden = resolvePlayerAvatarProfile(
    {
      name: '林深',
      avatar: 'crown',
      achievements: ['royal_legend'],
      equippedAchievement: 'none',
      isBot: false,
    },
    leaderboard
  );
  assert.equal(explicitlyHidden.equippedAchievement, null);
});

