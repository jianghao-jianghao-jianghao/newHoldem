import type { ChipDenom } from './proceduralTextures';

export type ChipMotionMode = 'push' | 'throw';
export type ChipStackTier = 'blind' | 'standard' | 'heavy' | 'allin';

/**
 * Physical grounding constants for clay chips resting on plush casino wool baize:
 * - FELT_SINK_DEPTH embeds the bottom beveled edge slightly into the nap so stacks never float.
 * - CHIP_NEST_OVERLAP interlocks recessed inlays between stacked chips to remove hairline air gaps.
 * - FELT_COLLISION_FRICTION / CHIP_STACK_FRICTION govern tangential velocity & spin arrest on contact.
 */
export const FELT_SINK_DEPTH = 0.0036;
export const CHIP_NEST_OVERLAP = 0.0014;
export const FELT_COLLISION_FRICTION = 0.66;
export const CHIP_STACK_FRICTION = 0.54;

export interface ChipHeightProfileOptions {
  amount: number;
  bigBlind?: number;
  startingChips?: number;
  isAllIn?: boolean;
  maxColumns: number;
  maxPerColumn: number;
  chipHeight: number;
}

export interface ChipBarrelProfile {
  denoms: ChipDenom[];
  layerCount: number;
  heightWorld: number;
}

export interface ChipStackHeightProfile {
  tier: ChipStackTier;
  intensity: number;
  barrels: ChipBarrelProfile[];
  maxHeightWorld: number;
}

export interface ChipRestingPoseOptions {
  barrelIndex: number;
  levelIndex: number;
  chipHeight: number;
  chipRadius: number;
  seed?: number;
}

export interface ChipRestingPose {
  offsetX: number;
  offsetZ: number;
  restY: number;
  yaw: number;
  microTiltX: number;
  microTiltZ: number;
  landingYawDelta: number;
  landingSlideX: number;
  landingSlideZ: number;
}

/**
 * Fast, deterministic PRNG hash returning a uniform value in [0, 1).
 */
function seededHash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/**
 * Computes an organic, physically grounded resting pose for a single stacked clay chip:
 * - Level 0 sinks slightly into the plush felt nap (FELT_SINK_DEPTH) so chips never float.
 * - Upper chips nest tightly (chipHeight - CHIP_NEST_OVERLAP) with bounded random horizontal
 *   micro-displacement and genuine hand-stacked rotational variation.
 * - Also provides small landing-settle deltas damped by collision friction as newly added chips rest.
 */
export function computeChipRestingPose(opts: ChipRestingPoseOptions): ChipRestingPose {
  const { barrelIndex, levelIndex, chipHeight, chipRadius, seed = 1 } = opts;
  const baseSeed = seed * 97.31 + (barrelIndex + 1) * 37.73 + (levelIndex + 1) * 19.17;

  const h1 = seededHash(baseSeed + 1.13);
  const h2 = seededHash(baseSeed + 2.71);
  const h3 = seededHash(baseSeed + 4.39);
  const h4 = seededHash(baseSeed + 6.83);
  const h5 = seededHash(baseSeed + 9.47);
  const h6 = seededHash(baseSeed + 12.11);

  // Subtle hand-stacked horizontal micro-displacement (level 0 slightly tighter on felt)
  const maxScatter = Math.min(0.0072, chipRadius * (levelIndex === 0 ? 0.032 : 0.056));
  const angle = h1 * Math.PI * 2;
  const radius = Math.sqrt(h2) * maxScatter;
  // Gentle cumulative lean bounded strictly well below barrel clearance
  const driftAngle = seededHash(seed * 41.1 + (barrelIndex + 1) * 13.7) * Math.PI * 2;
  const driftMag = Math.min(0.0042, levelIndex * 0.00045);

  const rawX = Math.cos(angle) * radius + Math.cos(driftAngle) * driftMag;
  const rawZ = Math.sin(angle) * radius + Math.sin(driftAngle) * driftMag;
  const maxBound = Math.min(0.011, chipRadius * 0.088);
  const offsetX = Math.max(-maxBound, Math.min(maxBound, rawX));
  const offsetZ = Math.max(-maxBound, Math.min(maxBound, rawZ));

  // Grounded vertical elevation: bottom chip embeds slightly into felt; upper layers nest snugly
  const effectivePitch = Math.max(chipHeight * 0.84, chipHeight - CHIP_NEST_OVERLAP);
  const restY = chipHeight * 0.5 - FELT_SINK_DEPTH + levelIndex * effectivePitch;

  // Natural non-uniform yaw across full 360° so edge stripes break robotic patterns
  const yaw = h3 * Math.PI * 2;

  // Level 0 rests completely flat in felt; upper chips carry imperceptible micro-settle tilt
  const microTiltScale = levelIndex === 0 ? 0 : 0.0042;
  const microTiltX = (h4 - 0.5) * 2 * microTiltScale;
  const microTiltZ = (h5 - 0.5) * 2 * microTiltScale;

  // Friction-damped landing rotational & tangential micro-settle for freshly dropped chips
  const landingYawDelta = (h6 - 0.5) * 0.42;
  const slideMag = chipRadius * 0.048;
  const landingSlideX = (h4 - 0.5) * 2 * slideMag;
  const landingSlideZ = (h5 - 0.5) * 2 * slideMag;

  return {
    offsetX,
    offsetZ,
    restY,
    yaw,
    microTiltX,
    microTiltZ,
    landingYawDelta,
    landingSlideX,
    landingSlideZ,
  };
}

/**
 * Computes a physically grounded, tiered barrel height mapping for chip stacks.
 * On heavy raises and All-In situations, enforces natural stepped barrel hierarchy
 * (tall primary anchor barrels stepping down cleanly to secondary accent barrels)
 * rather than flat uniform blocks.
 */
export function computeChipStackHeightProfile(
  columns: ChipDenom[][],
  opts: ChipHeightProfileOptions
): ChipStackHeightProfile {
  const bb = Math.max(1, opts.bigBlind ?? 20);
  const startStack = Math.max(bb * 20, opts.startingChips ?? 2000);
  const ratioToStart = opts.amount / startStack;
  const bbRatio = opts.amount / bb;

  let tier: ChipStackTier = 'standard';
  if (opts.isAllIn || ratioToStart >= 0.72 || bbRatio >= 40) {
    tier = 'allin';
  } else if (ratioToStart >= 0.28 || bbRatio >= 14) {
    tier = 'heavy';
  } else if (bbRatio <= 2.5) {
    tier = 'blind';
  }

  const intensity = Math.min(
    1,
    Math.max(0.08, opts.isAllIn ? 1 : Math.log10(Math.max(10, opts.amount)) / 4.2)
  );

  if (columns.length === 0) {
    return { tier, intensity, barrels: [], maxHeightWorld: opts.chipHeight * 0.5 };
  }

  const ordered = columns
    .map((col) => [...col].sort((a, b) => b - a))
    .sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      const sumB = b.reduce((s, d) => s + d, 0);
      const sumA = a.reduce((s, d) => s + d, 0);
      return sumB - sumA;
    });

  if ((tier === 'allin' || tier === 'heavy') && ordered.length >= 2) {
    const firstLen = ordered[0].length;
    const lastIdx = ordered.length - 1;
    if (firstLen === ordered[lastIdx].length && firstLen >= 4 && firstLen < opts.maxPerColumn) {
      const moved = ordered[lastIdx].pop();
      if (moved !== undefined) {
        ordered[0].push(moved);
        ordered[0].sort((a, b) => b - a);
      }
    }
  }

  const pitch = Math.max(opts.chipHeight * 0.84, opts.chipHeight - CHIP_NEST_OVERLAP);
  const barrels: ChipBarrelProfile[] = ordered.map((denoms) => ({
    denoms,
    layerCount: denoms.length,
    heightWorld: Math.max(0, denoms.length * pitch - FELT_SINK_DEPTH),
  }));

  const maxHeightWorld = Math.max(...barrels.map((b) => b.heightWorld), opts.chipHeight * 0.5);

  return {
    tier,
    intensity,
    barrels,
    maxHeightWorld,
  };
}

export interface ChipPhysicsBody {
  mode: ChipMotionMode;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  startX: number;
  startY: number;
  startZ: number;
  totalDist: number;
  elapsed: number;
  delay: number;
  duration: number;
  arcHeight: number;
  spinX: number;
  spinZ: number;
  yaw: number;
  yawVel: number;
  pitchTilt: number;
  rollTilt: number;
  bounceCount: number;
  maxBounces: number;
  restitution: number;
  /** Surface/collision friction coefficient in [0.1, 0.95] arresting tangential & angular speed */
  collisionFriction: number;
  /** Subtle random rotational impulse applied when chip contacts felt/stack */
  landingYawImpulse: number;
  /** Subtle tangential micro-slip applied at impact before friction arrests motion */
  landingSlipX: number;
  landingSlipZ: number;
  settled: boolean;
  impactFired: boolean;
}

export interface CreateChipPhysicsBodyParams {
  mode: ChipMotionMode;
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  toZ: number;
  delay: number;
  duration?: number;
  arcHeight?: number;
  spinX?: number;
  spinZ?: number;
  yaw?: number;
  /** Explicit collision friction coefficient (defaults to FELT_COLLISION_FRICTION / CHIP_STACK_FRICTION) */
  collisionFriction?: number;
  /** Optional deterministic seed for subtle random landing rotation & lateral micro-offset */
  landingJitterSeed?: number;
  /** When true, depresses targetY by FELT_SINK_DEPTH so bottom chips sink naturally into felt */
  sinkIntoFelt?: boolean;
}

const GRAVITY = 18.6;

/**
 * Creates a rigid-body chip trajectory configured either for felt-sliding push-in
 * (raises, All-In pushes, street pot sweeps) or parabolic throw (blinds/calls),
 * incorporating surface collision friction and organic random landing rotation/offset.
 */
export function createChipPhysicsBody(params: CreateChipPhysicsBodyParams): ChipPhysicsBody {
  const friction = Math.max(
    0.1,
    Math.min(
      0.95,
      params.collisionFriction ??
        (params.mode === 'push' ? FELT_COLLISION_FRICTION : CHIP_STACK_FRICTION)
    )
  );

  let targetX = params.toX;
  let targetZ = params.toZ;
  let landingYawImpulse = 0;
  let landingSlipX = 0;
  let landingSlipZ = 0;

  if (params.landingJitterSeed !== undefined) {
    const s = params.landingJitterSeed;
    const hAngle = seededHash(s * 17.3 + 3.1) * Math.PI * 2;
    const hRad = Math.sqrt(seededHash(s * 29.7 + 5.7)) * 0.0085;
    targetX += Math.cos(hAngle) * hRad;
    targetZ += Math.sin(hAngle) * hRad;

    const hYaw = seededHash(s * 43.9 + 8.3) - 0.5;
    landingYawImpulse = hYaw * (params.mode === 'push' ? 2.6 : 4.2);

    const slipAngle = seededHash(s * 61.1 + 11.9) * Math.PI * 2;
    const slipSpeed = (0.04 + seededHash(s * 73.3 + 2.3) * 0.07) * (1 - friction * 0.55);
    landingSlipX = Math.cos(slipAngle) * slipSpeed;
    landingSlipZ = Math.sin(slipAngle) * slipSpeed;
  }

  const sinkDelta = params.sinkIntoFelt ? FELT_SINK_DEPTH : 0;
  const targetY = Math.max(0.002, params.toY - sinkDelta);

  const dx = targetX - params.fromX;
  const dz = targetZ - params.fromZ;
  const totalDist = Math.hypot(dx, dz);

  const duration =
    params.duration ??
    (params.mode === 'push'
      ? Math.min(0.42, Math.max(0.24, 0.21 + totalDist * 0.055))
      : Math.min(0.36, Math.max(0.22, 0.21 + totalDist * 0.04)));

  const arcHeight =
    params.arcHeight ??
    (params.mode === 'push'
      ? Math.min(0.095, 0.028 + totalDist * 0.018)
      : Math.min(0.38, 0.22 + totalDist * 0.036));

  const invDur = 1 / Math.max(0.08, duration);
  const initialVy =
    (targetY - params.fromY) * invDur + 0.5 * GRAVITY * duration * (params.mode === 'push' ? 0.34 : 0.85);

  return {
    mode: params.mode,
    x: params.fromX,
    y: params.fromY,
    z: params.fromZ,
    vx: dx * invDur * (params.mode === 'push' ? 1.24 : 1.0),
    vy: initialVy,
    vz: dz * invDur * (params.mode === 'push' ? 1.24 : 1.0),
    targetX,
    targetY,
    targetZ,
    startX: params.fromX,
    startY: params.fromY,
    startZ: params.fromZ,
    totalDist,
    elapsed: 0,
    delay: Math.max(0, params.delay),
    duration,
    arcHeight,
    spinX: params.spinX ?? (params.mode === 'push' ? 0.32 : 3.9),
    spinZ: params.spinZ ?? (params.mode === 'push' ? 0.24 : 3.9),
    yaw: params.yaw ?? 0,
    yawVel: params.mode === 'push' ? 1.55 : 4.8,
    pitchTilt: 0,
    rollTilt: 0,
    bounceCount: 0,
    maxBounces: params.mode === 'push' ? 1 : 2,
    restitution: params.mode === 'push' ? 0.25 : 0.29,
    collisionFriction: friction,
    landingYawImpulse,
    landingSlipX,
    landingSlipZ,
    settled: false,
    impactFired: false,
  };
}

export interface ChipPhysicsStepResult {
  active: boolean;
  collided: boolean;
  collisionIntensity: number;
  settled: boolean;
}

/**
 * Advances a chip rigid body by dt seconds:
 * - Push mode applies felt kinetic friction + low gliding arc + smooth liftoff/landing tilt.
 * - Throw mode integrates clean parabolic flight with smooth spin decay before impact.
 * - Upon impact, applies Coulomb-style collision friction to tangential velocity & angular spin
 *   along with subtle random landing rotation/slip, settling cleanly into the felt/stack with zero floating.
 */
export function stepChipPhysicsBody(body: ChipPhysicsBody, dt: number): ChipPhysicsStepResult {
  if (body.settled) {
    return { active: true, collided: false, collisionIntensity: 0, settled: true };
  }

  const safeDt = Math.min(0.25, Math.max(0, dt));
  const steps = Math.max(1, Math.ceil(safeDt / 0.016));
  const subDt = safeDt / steps;

  let anyActive = false;
  let anyCollided = false;
  let maxCollisionIntensity = 0;

  for (let s = 0; s < steps; s++) {
    if (body.settled) break;

    body.elapsed += subDt;
    const activeT = body.elapsed - body.delay;
    if (activeT < 0) continue;
    anyActive = true;

    if (body.bounceCount === 0) {
      const p = Math.min(1, activeT / body.duration);
      const smoothY = p * p * (3 - 2 * p);
      const baseLineY = body.startY + (body.targetY - body.startY) * smoothY;
      const arcSin = Math.sin(p * Math.PI);

      if (body.mode === 'push') {
        // Felt kinetic friction exponent scales with surface friction coefficient
        const frictionPower = 2.1 + body.collisionFriction * 0.9;
        const frictionEase = 1 - Math.pow(1 - p, frictionPower);
        const prevX = body.x;
        const prevZ = body.z;
        body.x = body.startX + (body.targetX - body.startX) * frictionEase;
        body.z = body.startZ + (body.targetZ - body.startZ) * frictionEase;
        const denomDt = Math.max(0.004, subDt);
        body.vx = (body.x - prevX) / denomDt;
        body.vz = (body.z - prevZ) / denomDt;

        const hop = arcSin * body.arcHeight;
        body.y = Math.max(Math.min(body.startY, body.targetY), baseLineY + hop);
        if (p > 0.5) {
          body.y = Math.max(body.targetY, body.y);
        }
        body.vy = p > 0.5 ? -(1.35 + body.arcHeight * 4.4) : 0.32;

        // Smooth zero-at-endpoints banking tilt (no abrupt jump at p=0 or p=1)
        const bankEnvelope = arcSin * (1 - p * 0.45);
        body.pitchTilt = bankEnvelope * 0.1;
        body.rollTilt = Math.sin(p * Math.PI * 2) * 0.028 * (1 - p);
        body.yaw += body.yawVel * subDt * (1 - p * (0.55 + body.collisionFriction * 0.35));
      } else {
        const ease = 1 - Math.pow(1 - p, 1.95);
        const prevX = body.x;
        const prevZ = body.z;
        body.x = body.startX + (body.targetX - body.startX) * ease;
        body.z = body.startZ + (body.targetZ - body.startZ) * ease;
        const denomDt = Math.max(0.004, subDt);
        body.vx = (body.x - prevX) / denomDt;
        body.vz = (body.z - prevZ) / denomDt;

        body.y = Math.max(Math.min(body.startY, body.targetY), baseLineY + arcSin * body.arcHeight);
        if (p > 0.5) {
          body.y = Math.max(body.targetY, body.y);
        }
        body.vy = p > 0.5 ? -(1.95 + body.arcHeight * 3.4) : 0.68;

        const tiltEnv = arcSin * (1 - p * 0.35);
        body.pitchTilt = Math.max(-0.4, Math.min(0.4, body.spinX * 0.075 * tiltEnv));
        body.rollTilt = Math.max(-0.4, Math.min(0.4, body.spinZ * 0.075 * tiltEnv));
        body.yaw += body.yawVel * subDt * (1 - p * 0.55);
      }

      if (p >= 1) {
        body.x = body.targetX;
        body.z = body.targetZ;
        body.y = body.targetY;
        body.bounceCount = 1;
        const impactSpeed = Math.abs(body.vy);

        // Collision friction arrests tangential momentum & imparts organic landing spin/slip
        const tangentialRetain = Math.max(0.06, 1 - body.collisionFriction);
        body.vy = Math.min(0.88, Math.max(0.54, impactSpeed * body.restitution));
        body.vx = Math.max(
          -0.16,
          Math.min(0.16, body.vx * tangentialRetain * 0.14 + body.landingSlipX)
        );
        body.vz = Math.max(
          -0.16,
          Math.min(0.16, body.vz * tangentialRetain * 0.14 + body.landingSlipZ)
        );
        body.yawVel = body.yawVel * tangentialRetain * 0.55 + body.landingYawImpulse;
        body.pitchTilt = (body.mode === 'push' ? 0.036 : 0.056) * (body.spinX >= 0 ? 1 : -1);
        body.rollTilt *= -0.32;
        if (!body.impactFired) {
          anyCollided = true;
          body.impactFired = true;
          maxCollisionIntensity = Math.max(
            maxCollisionIntensity,
            Math.min(1.25, 0.48 + impactSpeed * 0.18)
          );
        }
      }
    } else {
      body.vy -= GRAVITY * subDt;
      // Friction-governed horizontal & angular braking during micro-bounce
      const linearDrag = Math.exp(-(12 + body.collisionFriction * 24) * subDt);
      const angularDrag = Math.exp(-(10 + body.collisionFriction * 20) * subDt);
      const homePull = 1 - Math.exp(-(14 + body.collisionFriction * 10) * subDt);

      body.x += body.vx * subDt + (body.targetX - body.x) * homePull;
      body.z += body.vz * subDt + (body.targetZ - body.z) * homePull;
      body.y += body.vy * subDt;
      body.yaw += body.yawVel * subDt;

      body.vx *= linearDrag;
      body.vz *= linearDrag;
      body.yawVel *= angularDrag;
      body.pitchTilt *= Math.exp(-24 * subDt);
      body.rollTilt *= Math.exp(-24 * subDt);

      if (body.y <= body.targetY) {
        body.y = body.targetY;
        const contactRetain = Math.max(0.05, 1 - body.collisionFriction);
        body.vx *= contactRetain;
        body.vz *= contactRetain;
        body.yawVel *= contactRetain;

        if (body.bounceCount < body.maxBounces && Math.abs(body.vy) > 0.24) {
          body.bounceCount += 1;
          body.vy = Math.abs(body.vy) * body.restitution * (1 - body.collisionFriction * 0.18);
          body.pitchTilt = (body.bounceCount % 2 === 0 ? 1 : -1) * 0.022;
        } else {
          body.x = body.targetX;
          body.z = body.targetZ;
          body.y = body.targetY;
          body.vx = 0;
          body.vy = 0;
          body.vz = 0;
          body.yawVel = 0;
          body.pitchTilt = 0;
          body.rollTilt = 0;
          body.settled = true;
        }
      }
    }
  }

  return {
    active: anyActive || body.settled,
    collided: anyCollided,
    collisionIntensity: maxCollisionIntensity,
    settled: body.settled,
  };
}

export interface StackSpringState {
  compression: number;
  compressionVel: number;
  lateralX: number;
  lateralZ: number;
  lateralVelX: number;
  lateralVelZ: number;
}

export function createStackSpringState(): StackSpringState {
  return {
    compression: 0,
    compressionVel: 0,
    lateralX: 0,
    lateralZ: 0,
    lateralVelX: 0,
    lateralVelZ: 0,
  };
}

/**
 * Injects vertical compression & radial impulse into a stack's damped spring state
 * when incoming chips collide with it.
 */
export function applyStackCollisionImpulse(
  state: StackSpringState,
  intensity: number,
  dirX = 0,
  dirZ = 0
): void {
  const clamped = Math.min(1.4, Math.max(0.2, intensity));
  state.compressionVel = Math.min(2.2, Math.max(state.compressionVel, clamped * 1.35));
  state.lateralVelX = Math.max(-0.45, Math.min(0.45, state.lateralVelX + dirX * clamped * 0.16));
  state.lateralVelZ = Math.max(-0.45, Math.min(0.45, state.lateralVelZ + dirZ * clamped * 0.16));
}

/**
 * Sub-stepped symplectic spring-damper integration for stack impact compression and micro-rattle.
 * Unconditionally stable across both 60fps GPU and low-fps software WebGL frame intervals.
 */
export function stepStackSpringPhysics(state: StackSpringState, dt: number): boolean {
  const kVertical = 360;
  const cVertical = 25;
  const kLateral = 280;
  const cLateral = 22;

  const safeDt = Math.min(0.25, Math.max(0.001, dt));
  const subSteps = Math.max(1, Math.ceil(safeDt / 0.008));
  const subDt = safeDt / subSteps;

  for (let i = 0; i < subSteps; i++) {
    const accY = -kVertical * state.compression - cVertical * state.compressionVel;
    state.compressionVel += accY * subDt;
    state.compression += state.compressionVel * subDt;

    const accX = -kLateral * state.lateralX - cLateral * state.lateralVelX;
    state.lateralVelX += accX * subDt;
    state.lateralX += state.lateralVelX * subDt;

    const accZ = -kLateral * state.lateralZ - cLateral * state.lateralVelZ;
    state.lateralVelZ += accZ * subDt;
    state.lateralZ += state.lateralVelZ * subDt;
  }

  // Hard physical bounds guard
  state.compression = Math.max(-0.08, Math.min(0.18, state.compression));
  state.lateralX = Math.max(-0.036, Math.min(0.036, state.lateralX));
  state.lateralZ = Math.max(-0.036, Math.min(0.036, state.lateralZ));

  const energy =
    Math.abs(state.compression) +
    Math.abs(state.compressionVel) * 0.04 +
    Math.abs(state.lateralX) +
    Math.abs(state.lateralZ) +
    Math.abs(state.lateralVelX) * 0.04 +
    Math.abs(state.lateralVelZ) * 0.04;

  if (energy < 0.0015) {
    state.compression = 0;
    state.compressionVel = 0;
    state.lateralX = 0;
    state.lateralZ = 0;
    state.lateralVelX = 0;
    state.lateralVelZ = 0;
    return false;
  }

  return true;
}
