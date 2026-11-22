import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyChipPalette,
  computeBubbleSpringPose,
  createImpactSimulation,
  stepImpactSimulation,
  triggerInteractiveRipple,
} from './avatarImpactFx';

test('allin impact creates heavy strike rays, double shockwaves, hitstop, trauma shake, and chip splash', () => {
  const sim = createImpactSimulation(
    {
      id: 'fx_allin_1',
      kind: 'allin',
      title: 'ALL-IN 全下',
      subtitle: '2,000',
      amount: 2000,
    },
    260,
    150
  );

  assert.ok(sim.strikeRays.length >= 12, 'expected >= 12 radial strike rays');
  assert.equal(sim.shockwaves.length, 2, 'expected double shockwave rings');
  assert.ok(sim.chips.length >= 16, 'expected >= 16 splashing chips on All-in');
  assert.ok(sim.hitstopRemaining > 0, 'expected visceral hitstop freeze frame');
  assert.equal(sim.trauma, 1.0);

  const initialTrauma = sim.trauma;
  // Step through impact & verify hitstop finishes and trauma decays monotonically
  for (let i = 0; i < 20; i++) {
    stepImpactSimulation(sim, 0.03);
  }
  assert.equal(sim.hitstopRemaining, 0);
  assert.ok(sim.trauma < initialTrauma, 'trauma should decay over time');
  assert.ok(sim.shockwaves[0].radius > 10, 'shockwave should expand outward');
  assert.ok(
    sim.chips.some((c) => Math.hypot(c.x - sim.originX, c.y - sim.originY) > 18),
    'chips should travel outward from origin'
  );
});

test('pot_win impact launches celebratory multi-denomination chip fountain splash and settles cleanly', () => {
  const sim = createImpactSimulation(
    {
      id: 'fx_win_1',
      kind: 'pot_win',
      title: '+1,280',
      subtitle: '赢取底池 · 葫芦',
      amount: 1280,
      handName: '葫芦',
    },
    260,
    150
  );

  assert.ok(sim.chips.length >= 22, 'expected lush >= 22 chip splash fountain on pot win');
  assert.ok(
    sim.chips.every((c) => c.vy < 0),
    'all fountain chips should erupt upward initially'
  );
  assert.ok(classifyChipPalette('pot_win', 1280).length >= 4);

  // Advance until completion
  for (let i = 0; i < 140; i++) {
    stepImpactSimulation(sim, 0.03);
  }
  assert.equal(sim.done, true);
  assert.equal(sim.pose.opacity, 0);
});

test('stepImpactSimulation clamps extreme dt spikes and prevents NaN/Infinity instability', () => {
  const sim = createImpactSimulation(
    {
      id: 'fx_clamp',
      kind: 'allin',
      title: 'ALL-IN 全下',
      amount: 1000,
    },
    260,
    150
  );

  stepImpactSimulation(sim, 9.5);
  stepImpactSimulation(sim, Number.NaN);

  assert.ok(sim.elapsed <= 0.051, 'large dt must be clamped to <= 0.05s');
  for (const c of sim.chips) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
    assert.ok(Number.isFinite(c.vx) && Number.isFinite(c.vy));
  }
});

test('triggerInteractiveRipple injects live sparks/chips and bubble bounce within pool caps', () => {
  const sim = createImpactSimulation(
    {
      id: 'fx_ripple',
      kind: 'pot_win',
      title: '+640',
      amount: 640,
    },
    260,
    150
  );

  const beforeChips = sim.chips.length;
  const beforeSparks = sim.sparks.length;

  triggerInteractiveRipple(sim, 42);
  assert.equal(sim.interactiveBounce, 1.0);
  assert.ok(sim.chips.length > beforeChips);
  assert.ok(sim.sparks.length > beforeSparks);

  // Repeated ripples stay strictly bounded by pool caps
  for (let i = 0; i < 20; i++) {
    triggerInteractiveRipple(sim, 100 + i);
  }
  assert.ok(sim.chips.length <= 48);
  assert.ok(sim.sparks.length <= 64);

  const pose = computeBubbleSpringPose(0.5, 2.6, 'pot_win', 0, 1.0);
  assert.ok(pose.scaleX > 1.05 && pose.scaleY > 1.05);
});
