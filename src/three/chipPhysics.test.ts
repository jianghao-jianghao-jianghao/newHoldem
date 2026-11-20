import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStackCollisionImpulse,
  computeChipStackHeightProfile,
  createChipPhysicsBody,
  createStackSpringState,
  stepChipPhysicsBody,
  stepStackSpringPhysics,
} from './chipPhysics';
import { breakdownChipsForStack, CHIP_HEIGHT } from './pokerModels';

test('computeChipStackHeightProfile produces stepped All-In hierarchy taller than blind bets', () => {
  const blindCols = breakdownChipsForStack(20, 3, 11);
  const blindProfile = computeChipStackHeightProfile(blindCols, {
    amount: 20,
    bigBlind: 20,
    startingChips: 2000,
    isAllIn: false,
    maxColumns: 3,
    maxPerColumn: 11,
    chipHeight: CHIP_HEIGHT,
  });
  assert.equal(blindProfile.tier, 'blind');

  const allInCols = breakdownChipsForStack(2000, 4, 15);
  const allInProfile = computeChipStackHeightProfile(allInCols, {
    amount: 2000,
    bigBlind: 20,
    startingChips: 2000,
    isAllIn: true,
    maxColumns: 4,
    maxPerColumn: 15,
    chipHeight: CHIP_HEIGHT,
  });
  assert.equal(allInProfile.tier, 'allin');
  assert.ok(allInProfile.maxHeightWorld > blindProfile.maxHeightWorld);
  // Primary barrel should be >= subsequent barrels for natural stepped silhouette
  for (let i = 1; i < allInProfile.barrels.length; i++) {
    assert.ok(allInProfile.barrels[0].layerCount >= allInProfile.barrels[i].layerCount);
  }
});

test('stepChipPhysicsBody executes push-in glide, triggers pot collision, bounces, and settles', () => {
  const body = createChipPhysicsBody({
    mode: 'push',
    fromX: 0,
    fromY: 0.04,
    fromZ: 0.6,
    toX: 0,
    toY: 0.12,
    toZ: -0.82,
    delay: 0,
  });

  let sawCollision = false;
  let sawReboundRise = false;
  let prevY = body.y;
  let steps = 0;

  while (!body.settled && steps < 200) {
    const res = stepChipPhysicsBody(body, 0.016);
    if (res.collided) {
      sawCollision = true;
      assert.ok(res.collisionIntensity > 0);
    }
    if (sawCollision && !body.settled && body.y > body.targetY + 0.002 && body.y > prevY) {
      sawReboundRise = true;
    }
    prevY = body.y;
    steps++;
  }

  assert.equal(sawCollision, true, 'expected push body to emit collision impact event');
  assert.equal(sawReboundRise, true, 'expected chip to perform elastic rebound bounce after impact');
  assert.equal(body.settled, true, 'expected chip physics body to settle cleanly');
  assert.equal(body.x, body.targetX);
  assert.equal(body.y, body.targetY);
  assert.equal(body.z, body.targetZ);
});

test('stepStackSpringPhysics compresses and dampens pot collision impulse cleanly to rest', () => {
  const spring = createStackSpringState();
  applyStackCollisionImpulse(spring, 1.1, 0.5, -0.4);
  assert.ok(spring.compressionVel > 0);

  let peakCompression = 0;
  let active = true;
  let iter = 0;
  while (active && iter < 240) {
    active = stepStackSpringPhysics(spring, 0.016);
    if (spring.compression > peakCompression) peakCompression = spring.compression;
    iter++;
  }

  assert.ok(peakCompression > 0.02, 'expected noticeable spring compression on pot impact');
  assert.equal(active, false, 'expected spring-damper to converge cleanly to rest');
  assert.equal(spring.compression, 0);
});

test('stepStackSpringPhysics remains unconditionally bounded and stable under large dt (0.14s software WebGL)', () => {
  const spring = createStackSpringState();
  applyStackCollisionImpulse(spring, 1.4, 1.0, -1.0);

  let active = true;
  let steps = 0;
  while (active && steps < 60) {
    active = stepStackSpringPhysics(spring, 0.14);
    assert.ok(Math.abs(spring.lateralX) <= 0.041, `lateralX exploded: ${spring.lateralX}`);
    assert.ok(Math.abs(spring.lateralZ) <= 0.041, `lateralZ exploded: ${spring.lateralZ}`);
    assert.ok(Math.abs(spring.compression) <= 0.21, `compression exploded: ${spring.compression}`);
    steps++;
  }

  assert.equal(active, false, 'expected spring to converge cleanly under dt=0.14s');
});

