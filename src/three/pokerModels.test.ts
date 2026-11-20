import test from 'node:test';
import assert from 'node:assert/strict';
import { breakdownChipsForStack } from './pokerModels';

test('breakdownChipsForStack handles non-positive and small blind amounts cleanly', () => {
  assert.deepEqual(breakdownChipsForStack(0), []);
  assert.deepEqual(breakdownChipsForStack(-50), []);

  const sb = breakdownChipsForStack(10, 3, 11);
  assert.ok(sb.length >= 1);
  assert.ok(sb.flat().length >= 2);

  const bb = breakdownChipsForStack(20, 3, 11);
  assert.ok(bb.length >= 1);
  assert.ok(bb.flat().length >= 4);
});

test('breakdownChipsForStack expands 2000 starting stack into multi-denomination colorful barrels', () => {
  const cols = breakdownChipsForStack(2000, 3, 11);
  assert.ok(cols.length >= 2 && cols.length <= 3);
  for (const col of cols) {
    assert.ok(col.length >= 1 && col.length <= 11);
  }
  const uniqueDenoms = new Set(cols.flat());
  assert.ok(uniqueDenoms.size >= 3, `expected at least 3 denominations, got ${[...uniqueDenoms]}`);
});

test('breakdownChipsForStack enforces maxColumns and maxPerColumn even on massive pots', () => {
  const cols = breakdownChipsForStack(100000, 6, 14);
  assert.ok(cols.length >= 1 && cols.length <= 6);
  for (const col of cols) {
    assert.ok(col.length >= 1 && col.length <= 14);
  }
  assert.equal(cols.flat().length, 6 * 14);
});
