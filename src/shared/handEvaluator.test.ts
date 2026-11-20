import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBestHand } from './handEvaluator';
import type { Card, Rank, Suit } from './types';

function c(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

test('identifies Royal Flush over Straight Flush', () => {
  const royal = evaluateBestHand([
    c(14, 'spades'),
    c(13, 'spades'),
    c(12, 'spades'),
    c(11, 'spades'),
    c(10, 'spades'),
    c(2, 'hearts'),
    c(3, 'clubs'),
  ]);
  const straightFlush = evaluateBestHand([
    c(9, 'hearts'),
    c(8, 'hearts'),
    c(7, 'hearts'),
    c(6, 'hearts'),
    c(5, 'hearts'),
    c(14, 'clubs'),
    c(2, 'diamonds'),
  ]);

  assert.equal(royal.category, 9);
  assert.equal(straightFlush.category, 8);
  assert.ok(royal.score > straightFlush.score);
});

test('identifies Ace-low wheel straight (A-2-3-4-5) and ranks below 6-high straight', () => {
  const wheel = evaluateBestHand([
    c(14, 'spades'),
    c(2, 'hearts'),
    c(3, 'diamonds'),
    c(4, 'clubs'),
    c(5, 'spades'),
    c(13, 'clubs'),
    c(9, 'diamonds'),
  ]);
  const sixHigh = evaluateBestHand([
    c(6, 'spades'),
    c(5, 'hearts'),
    c(4, 'diamonds'),
    c(3, 'clubs'),
    c(2, 'spades'),
    c(10, 'clubs'),
    c(11, 'diamonds'),
  ]);

  assert.equal(wheel.category, 4);
  assert.equal(sixHigh.category, 4);
  assert.ok(sixHigh.score > wheel.score);
});

test('compares Four of a Kind, Full House, Flush, Trips, Two Pair, One Pair, High Card', () => {
  const quads = evaluateBestHand([
    c(10, 'spades'),
    c(10, 'hearts'),
    c(10, 'diamonds'),
    c(10, 'clubs'),
    c(14, 'spades'),
    c(2, 'hearts'),
    c(3, 'clubs'),
  ]);
  const fullHouse = evaluateBestHand([
    c(14, 'spades'),
    c(14, 'hearts'),
    c(14, 'diamonds'),
    c(13, 'clubs'),
    c(13, 'spades'),
    c(2, 'hearts'),
    c(3, 'clubs'),
  ]);
  const flush = evaluateBestHand([
    c(14, 'diamonds'),
    c(11, 'diamonds'),
    c(8, 'diamonds'),
    c(6, 'diamonds'),
    c(2, 'diamonds'),
    c(13, 'clubs'),
    c(13, 'spades'),
  ]);
  const trips = evaluateBestHand([
    c(9, 'spades'),
    c(9, 'hearts'),
    c(9, 'diamonds'),
    c(14, 'clubs'),
    c(12, 'spades'),
    c(4, 'hearts'),
    c(2, 'clubs'),
  ]);
  const twoPair = evaluateBestHand([
    c(13, 'spades'),
    c(13, 'hearts'),
    c(7, 'diamonds'),
    c(7, 'clubs'),
    c(14, 'spades'),
    c(4, 'hearts'),
    c(2, 'clubs'),
  ]);
  const onePair = evaluateBestHand([
    c(14, 'spades'),
    c(14, 'hearts'),
    c(12, 'diamonds'),
    c(9, 'clubs'),
    c(5, 'spades'),
    c(4, 'hearts'),
    c(2, 'clubs'),
  ]);
  const highCard = evaluateBestHand([
    c(14, 'spades'),
    c(13, 'hearts'),
    c(10, 'diamonds'),
    c(8, 'clubs'),
    c(4, 'spades'),
    c(3, 'hearts'),
    c(2, 'clubs'),
  ]);

  assert.equal(quads.category, 7);
  assert.equal(fullHouse.category, 6);
  assert.equal(flush.category, 5);
  assert.equal(trips.category, 3);
  assert.equal(twoPair.category, 2);
  assert.equal(onePair.category, 1);
  assert.equal(highCard.category, 0);

  assert.ok(quads.score > fullHouse.score);
  assert.ok(fullHouse.score > flush.score);
  assert.ok(flush.score > trips.score);
  assert.ok(trips.score > twoPair.score);
  assert.ok(twoPair.score > onePair.score);
  assert.ok(onePair.score > highCard.score);
});

test('breaks ties accurately using kickers and detects exact ties', () => {
  const pairAcesKingKicker = evaluateBestHand([
    c(14, 'spades'),
    c(14, 'hearts'),
    c(13, 'diamonds'),
    c(9, 'clubs'),
    c(5, 'spades'),
    c(2, 'hearts'),
    c(3, 'clubs'),
  ]);
  const pairAcesQueenKicker = evaluateBestHand([
    c(14, 'clubs'),
    c(14, 'diamonds'),
    c(12, 'diamonds'),
    c(9, 'hearts'),
    c(5, 'clubs'),
    c(2, 'spades'),
    c(3, 'hearts'),
  ]);
  const boardPlayTie1 = evaluateBestHand([
    c(2, 'spades'),
    c(3, 'hearts'),
    c(14, 'diamonds'),
    c(14, 'clubs'),
    c(13, 'spades'),
    c(12, 'hearts'),
    c(10, 'clubs'),
  ]);
  const boardPlayTie2 = evaluateBestHand([
    c(4, 'clubs'),
    c(5, 'diamonds'),
    c(14, 'diamonds'),
    c(14, 'clubs'),
    c(13, 'spades'),
    c(12, 'hearts'),
    c(10, 'clubs'),
  ]);

  assert.ok(pairAcesKingKicker.score > pairAcesQueenKicker.score);
  assert.equal(boardPlayTie1.score, boardPlayTie2.score);
});
