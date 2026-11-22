import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStackCollisionImpulse,
  CHIP_NEST_OVERLAP,
  computeChipRestingPose,
  computeChipStackHeightProfile,
  createChipPhysicsBody,
  createStackSpringState,
  FELT_SINK_DEPTH,
  stepChipPhysicsBody,
  stepStackSpringPhysics,
} from './chipPhysics';
import { breakdownChipsForStack, CHIP_HEIGHT, CHIP_RADIUS } from './pokerModels';

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

test('stepChipPhysicsBody never dips below targetY on descent and starts with smooth liftoff tilt', () => {
  const pushBody = createChipPhysicsBody({
    mode: 'push',
    fromX: -1.5,
    fromY: 0.14,
    fromZ: 1.2,
    toX: 0,
    toY: 0.14,
    toZ: -0.84,
    delay: 0,
  });

  // First micro-step should not jump rollTilt abruptly
  stepChipPhysicsBody(pushBody, 0.008);
  assert.ok(Math.abs(pushBody.rollTilt) < 0.02, `initial rollTilt jumped: ${pushBody.rollTilt}`);
  assert.ok(Math.abs(pushBody.pitchTilt) < 0.02, `initial pitchTilt jumped: ${pushBody.pitchTilt}`);

  let steps = 0;
  while (!pushBody.settled && steps < 200) {
    stepChipPhysicsBody(pushBody, 0.016);
    assert.ok(
      pushBody.y >= pushBody.targetY - 1e-6,
      `push chip dipped below targetY: ${pushBody.y} < ${pushBody.targetY}`
    );
    steps++;
  }
  assert.equal(pushBody.settled, true);
});

test('computeChipRestingPose sinks level-0 chips into felt, nests upper layers tightly, and varies yaw organically', () => {
  const pose0 = computeChipRestingPose({
    barrelIndex: 0,
    levelIndex: 0,
    chipHeight: CHIP_HEIGHT,
    chipRadius: CHIP_RADIUS,
    seed: 17,
  });
  const pose1 = computeChipRestingPose({
    barrelIndex: 0,
    levelIndex: 1,
    chipHeight: CHIP_HEIGHT,
    chipRadius: CHIP_RADIUS,
    seed: 17,
  });
  const pose2 = computeChipRestingPose({
    barrelIndex: 1,
    levelIndex: 2,
    chipHeight: CHIP_HEIGHT,
    chipRadius: CHIP_RADIUS,
    seed: 17,
  });

  // Level 0 sinks into the felt nap by FELT_SINK_DEPTH so bottom beveled edge never floats
  assert.ok(pose0.restY < CHIP_HEIGHT * 0.5);
  assert.ok(Math.abs(pose0.restY - (CHIP_HEIGHT * 0.5 - FELT_SINK_DEPTH)) < 1e-6);
  assert.equal(pose0.microTiltX, 0);
  assert.equal(pose0.microTiltZ, 0);

  // Upper layers nest tightly (CHIP_HEIGHT - CHIP_NEST_OVERLAP)
  const expectedPitch = Math.max(CHIP_HEIGHT * 0.84, CHIP_HEIGHT - CHIP_NEST_OVERLAP);
  assert.ok(Math.abs(pose1.restY - pose0.restY - expectedPitch) < 1e-6);

  // Horizontal micro-displacement stays well below barrel clearance
  for (const pose of [pose0, pose1, pose2]) {
    assert.ok(Math.abs(pose.offsetX) <= 0.011);
    assert.ok(Math.abs(pose.offsetZ) <= 0.011);
    assert.ok(pose.yaw >= 0 && pose.yaw <= Math.PI * 2);
  }

  // Distinct organic yaw across stacked chips
  assert.notEqual(pose0.yaw, pose1.yaw);
  assert.notEqual(pose1.yaw, pose2.yaw);
});

test('collisionFriction arrests tangential rebound speed and applies subtle landing yaw displacement', () => {
  const lowFriction = createChipPhysicsBody({
    mode: 'throw',
    fromX: -1.0,
    fromY: 0.14,
    fromZ: 0.8,
    toX: 0,
    toY: CHIP_HEIGHT / 2,
    toZ: -0.5,
    delay: 0,
    collisionFriction: 0.18,
    landingJitterSeed: 42,
    sinkIntoFelt: true,
  });
  const highFriction = createChipPhysicsBody({
    mode: 'throw',
    fromX: -1.0,
    fromY: 0.14,
    fromZ: 0.8,
    toX: 0,
    toY: CHIP_HEIGHT / 2,
    toZ: -0.5,
    delay: 0,
    collisionFriction: 0.85,
    landingJitterSeed: 42,
    sinkIntoFelt: true,
  });

  // sinkIntoFelt embeds targetY into felt
  assert.ok(highFriction.targetY < CHIP_HEIGHT / 2);

  let lowSpeedAfterImpact = 0;
  let highSpeedAfterImpact = 0;
  let lowYawStart = lowFriction.yaw;
  let highYawStart = highFriction.yaw;

  for (let i = 0; i < 240 && (!lowFriction.settled || !highFriction.settled); i++) {
    if (!lowFriction.settled) {
      const r = stepChipPhysicsBody(lowFriction, 0.016);
      if (r.collided) lowSpeedAfterImpact = Math.hypot(lowFriction.vx, lowFriction.vz);
    }
    if (!highFriction.settled) {
      const r = stepChipPhysicsBody(highFriction, 0.016);
      if (r.collided) highSpeedAfterImpact = Math.hypot(highFriction.vx, highFriction.vz);
    }
  }

  assert.equal(lowFriction.settled, true);
  assert.equal(highFriction.settled, true);
  assert.ok(
    highSpeedAfterImpact < lowSpeedAfterImpact,
    `expected higher friction to reduce post-impact tangential speed (${highSpeedAfterImpact} vs ${lowSpeedAfterImpact})`
  );
  assert.notEqual(highFriction.yaw, highYawStart, 'expected landing rotational displacement');
  assert.notEqual(lowFriction.yaw, lowYawStart, 'expected landing rotational displacement');
});
