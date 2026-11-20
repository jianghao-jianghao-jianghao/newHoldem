import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHIP_DENOM_AUDIO_LIBRARY,
  classifyChipBetWeight,
  computeChipImpactOffsets,
  decomposeChipBetAudio,
} from './soundFx';

test('CHIP_DENOM_AUDIO_LIBRARY models heavier mass and lower modal frequency for higher denominations', () => {
  const denoms = [5, 25, 100, 500, 1000] as const;
  for (let i = 1; i < denoms.length; i++) {
    const prev = CHIP_DENOM_AUDIO_LIBRARY[denoms[i - 1]];
    const curr = CHIP_DENOM_AUDIO_LIBRARY[denoms[i]];
    assert.ok(curr.massGrams > prev.massGrams);
    assert.ok(curr.modalFreqA < prev.modalFreqA);
    assert.ok(curr.bodyStartHz < prev.bodyStartHz);
    assert.ok(curr.decaySec > prev.decaySec);
  }
});

test('classifyChipBetWeight scales acoustic heft across small call, medium raise, heavy bet, and all-in', () => {
  assert.equal(
    classifyChipBetWeight({ amount: 20, actionKind: 'call', bigBlind: 20, pot: 60 }),
    'light'
  );
  assert.equal(
    classifyChipBetWeight({ amount: 60, actionKind: 'raise', bigBlind: 20, pot: 120 }),
    'medium'
  );
  assert.equal(
    classifyChipBetWeight({ amount: 200, actionKind: 'raise', bigBlind: 20, pot: 240 }),
    'heavy'
  );
  assert.equal(
    classifyChipBetWeight({ amount: 600, actionKind: 'allin', bigBlind: 20, pot: 300 }),
    'massive'
  );
  assert.equal(
    classifyChipBetWeight({ amount: 1200, actionKind: 'call', bigBlind: 20, pot: 1500 }),
    'massive'
  );
});

test('decomposeChipBetAudio decomposes bet sizes into high-to-low denominations and enriches massive stacks', () => {
  assert.deepEqual(decomposeChipBetAudio(30, 'light'), [25, 5]);
  const massiveAllIn = decomposeChipBetAudio(1500, 'massive');
  assert.ok(massiveAllIn.includes(1000));
  assert.ok(massiveAllIn.includes(500));
  assert.ok(massiveAllIn.length >= 5);
});

test('computeChipImpactOffsets is strictly monotonically increasing across all-in cascades', () => {
  const offsets = computeChipImpactOffsets(8, 0.036, true);
  assert.equal(offsets.length, 8);
  assert.equal(offsets[0], 0);
  for (let i = 1; i < offsets.length; i++) {
    assert.ok(
      offsets[i] > offsets[i - 1],
      `Expected offset[${i}] (${offsets[i]}) > offset[${i - 1}] (${offsets[i - 1]})`
    );
  }
});

