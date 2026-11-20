import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyHandToAchievementStats,
  createEmptyAchievementStats,
  formatAchievementDate,
  mergeAchievementDates,
  sanitizeAchievementDates,
  sanitizeAchievementIds,
  type AchievementId,
} from './achievements';

test('unlocks win streak achievements at 3 and 5 consecutive wins and resets on loss', () => {
  let stats = createEmptyAchievementStats();
  let unlocked: AchievementId[] = [];

  for (let i = 0; i < 3; i++) {
    const res = applyHandToAchievementStats(stats, unlocked, {
      won: true,
      potWon: 80,
      netChips: 40,
      wasAllIn: false,
      wonByFold: false,
      handCategory: 1,
      currentChips: 2100,
      startingChips: 2000,
      bigBlind: 20,
    });
    stats = res.nextStats;
    unlocked = res.unlocked;
  }
  assert.equal(stats.currentWinStreak, 3);
  assert.ok(unlocked.includes('first_blood'));
  assert.ok(unlocked.includes('streak_3'));
  assert.ok(!unlocked.includes('streak_5'));

  // 2 more wins -> streak 5
  for (let i = 0; i < 2; i++) {
    const res = applyHandToAchievementStats(stats, unlocked, {
      won: true,
      potWon: 80,
      netChips: 40,
      wasAllIn: false,
      wonByFold: false,
      handCategory: 2,
      currentChips: 2200,
      startingChips: 2000,
      bigBlind: 20,
    });
    stats = res.nextStats;
    unlocked = res.unlocked;
  }
  assert.ok(unlocked.includes('streak_5'));

  // Loss resets currentWinStreak but keeps already unlocked medals
  const loss = applyHandToAchievementStats(stats, unlocked, {
    won: false,
    potWon: 0,
    netChips: -40,
    wasAllIn: false,
    wonByFold: false,
    currentChips: 2160,
    startingChips: 2000,
    bigBlind: 20,
  });
  assert.equal(loss.nextStats.currentWinStreak, 0);
  assert.equal(loss.nextStats.maxWinStreak, 5);
  assert.ok(loss.unlocked.includes('streak_5'));
});

test('unlocks all-in jackpot, mega pot, hand mastery, and chip doubler medals', () => {
  const res = applyHandToAchievementStats(undefined, undefined, {
    won: true,
    potWon: 2400,
    netChips: 1200,
    wasAllIn: true,
    wonByFold: false,
    handCategory: 7, // Four of a Kind
    currentChips: 4200,
    startingChips: 2000,
    bigBlind: 20,
  });

  assert.ok(res.newlyUnlocked.includes('allin_winner'));
  assert.ok(res.newlyUnlocked.includes('allin_jackpot'));
  assert.ok(res.newlyUnlocked.includes('mega_pot'));
  assert.ok(res.newlyUnlocked.includes('trips_master'));
  assert.ok(res.newlyUnlocked.includes('flush_full'));
  assert.ok(res.newlyUnlocked.includes('royal_legend'));
  assert.ok(res.newlyUnlocked.includes('chip_doubler'));

  // Repeating identical hand does not re-emit already unlocked achievements
  const repeat = applyHandToAchievementStats(res.nextStats, res.unlocked, {
    won: true,
    potWon: 2400,
    netChips: 1200,
    wasAllIn: true,
    wonByFold: false,
    handCategory: 7,
    currentChips: 5400,
    startingChips: 2000,
    bigBlind: 20,
  });
  assert.equal(repeat.newlyUnlocked.length, 1); // Only club_tycoon via netChips >= 2000!
  assert.equal(repeat.newlyUnlocked[0], 'club_tycoon');
});

test('unlocks bluff_king after 3 fold wins', () => {
  let stats = createEmptyAchievementStats();
  let unlocked: AchievementId[] = [];
  for (let i = 0; i < 3; i++) {
    const r = applyHandToAchievementStats(stats, unlocked, {
      won: true,
      potWon: 60,
      netChips: 30,
      wasAllIn: false,
      wonByFold: true,
      currentChips: 2060,
      startingChips: 2000,
      bigBlind: 20,
    });
    stats = r.nextStats;
    unlocked = r.unlocked;
  }
  assert.ok(unlocked.includes('bluff_king'));
});

test('preserves and sanitizes achievement unlock dates without overwriting earlier timestamps', () => {
  const t1 = Date.UTC(2026, 10, 10, 12, 0, 0);
  const t2 = Date.UTC(2026, 10, 20, 8, 30, 0);

  const ids = sanitizeAchievementIds(['first_blood', 'invalid_id', 'royal_legend', 'first_blood']);
  assert.deepEqual(ids, ['royal_legend', 'first_blood']);

  const cleanDates = sanitizeAchievementDates({
    first_blood: t1,
    bogus: 12345,
    streak_3: -5,
  });
  assert.deepEqual(cleanDates, { first_blood: t1 });

  const merged = mergeAchievementDates(cleanDates, ids, ['royal_legend'], t2);
  assert.equal(merged.first_blood, t1);
  assert.equal(merged.royal_legend, t2);
  assert.match(formatAchievementDate(t1), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(formatAchievementDate(undefined), '早期解锁');
});
