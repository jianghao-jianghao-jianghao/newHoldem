import type { ChipDenom } from './proceduralTextures';

export type ChipMotionMode = 'push' | 'throw';
export type ChipStackTier = 'blind' | 'standard' | 'heavy' | 'allin';

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

  // Clone and arrange barrels with highest-value / tallest barrels first so cluster layout
  // places anchor towers at center/back and steps down cleanly toward front/sides.
  const ordered = columns
    .map((col) => [...col].sort((a, b) => b - a))
    .sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      const sumB = b.reduce((s, d) => s + d, 0);
      const sumA = a.reduce((s, d) => s + d, 0);
      return sumB - sumA;
    });

  // For multi-barrel All-In or heavy pots where columns ended up identically tall,
  // redistribute 1-2 chips into a stepped pyramidal cascade while preserving chip count & total bounds.
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

  const barrels: ChipBarrelProfile[] = ordered.map((denoms) => ({
    denoms,
    layerCount: denoms.length,
    heightWorld: denoms.length * opts.chipHeight,
  }));

  const maxHeightWorld = Math.max(...barrels.map((b) => b.heightWorld), opts.chipHeight);

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
}

const GRAVITY = 15.6;

/**
 * Creates a rigid-body chip trajectory configured either for felt-sliding push-in
 * (raises, All-In pushes, street pot sweeps) or parabolic throw (blinds/calls).
 */
export function createChipPhysicsBody(params: CreateChipPhysicsBodyParams): ChipPhysicsBody {
  const dx = params.toX - params.fromX;
  const dz = params.toZ - params.fromZ;
  const totalDist = Math.hypot(dx, dz);

  const duration =
    params.duration ??
    (params.mode === 'push'
      ? Math.min(0.46, Math.max(0.28, 0.24 + totalDist * 0.065))
      : Math.min(0.40, Math.max(0.26, 0.25 + totalDist * 0.045)));

  const arcHeight =
    params.arcHeight ??
    (params.mode === 'push' ? Math.min(0.14, 0.045 + totalDist * 0.025) : 0.36 + totalDist * 0.04);

  const invDur = 1 / Math.max(0.08, duration);
  const initialVy =
    (params.toY - params.fromY) * invDur + 0.5 * GRAVITY * duration * (params.mode === 'push' ? 0.38 : 0.92);

  return {
    mode: params.mode,
    x: params.fromX,
    y: params.fromY,
    z: params.fromZ,
    vx: dx * invDur * (params.mode === 'push' ? 1.32 : 1.0),
    vy: initialVy,
    vz: dz * invDur * (params.mode === 'push' ? 1.32 : 1.0),
    targetX: params.toX,
    targetY: params.toY,
    targetZ: params.toZ,
    startX: params.fromX,
    startZ: params.fromZ,
    totalDist,
    elapsed: 0,
    delay: Math.max(0, params.delay),
    duration,
    arcHeight,
    spinX: params.spinX ?? (params.mode === 'push' ? 0.45 : 6.0),
    spinZ: params.spinZ ?? (params.mode === 'push' ? 0.35 : 6.0),
    yaw: params.yaw ?? 0,
    yawVel: params.mode === 'push' ? 2.4 : 7.5,
    pitchTilt: 0,
    rollTilt: 0,
    bounceCount: 0,
    maxBounces: params.mode === 'push' ? 2 : 2,
    restitution: params.mode === 'push' ? 0.34 : 0.38,
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
 * - Push mode applies felt kinetic friction + subtle lift over the betting line + inertia tilt.
 * - Throw mode integrates ballistic gravity.
 * - On surface collision, executes damped elastic rebound micro-bounces before settling cleanly.
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
      if (body.mode === 'push') {
        const frictionEase = 1 - Math.pow(1 - p, 2.35);
        const prevX = body.x;
        const prevZ = body.z;
        body.x = body.startX + (body.targetX - body.startX) * frictionEase;
        body.z = body.startZ + (body.targetZ - body.startZ) * frictionEase;
        const denomDt = Math.max(0.004, subDt);
        body.vx = (body.x - prevX) / denomDt;
        body.vz = (body.z - prevZ) / denomDt;

        const hop = Math.sin(p * Math.PI) * body.arcHeight;
        const dropOffset = p > 0.72 ? (p - 0.72) * 0.04 : 0;
        body.y = body.targetY + hop + (1 - p) * 0.025 - dropOffset;
        body.vy = p > 0.55 ? -(1.45 + body.arcHeight * 4.5) : 0.4;

        const speedFactor = Math.max(0, 1 - p * 1.15);
        body.pitchTilt = Math.sin(p * Math.PI) * 0.14 * speedFactor;
        body.rollTilt = Math.cos(p * Math.PI) * 0.08 * speedFactor;
        body.yaw += body.yawVel * subDt * (1 - p * 0.75);
      } else {
        const ease = 1 - Math.pow(1 - p, 1.85);
        body.x = body.startX + (body.targetX - body.startX) * ease;
        body.z = body.startZ + (body.targetZ - body.startZ) * ease;
        body.y = body.targetY + Math.sin(p * Math.PI) * body.arcHeight + (1 - p) * 0.03;
        body.vy = p > 0.5 ? -(2.1 + body.arcHeight * 3.8) : 0.8;

        const decay = (1 - p) * (1 - p);
        body.pitchTilt = body.spinX * decay * 0.25;
        body.rollTilt = body.spinZ * decay * 0.25;
        body.yaw += body.yawVel * subDt;
      }

      if (p >= 1) {
        body.x = body.targetX;
        body.z = body.targetZ;
        body.y = body.targetY;
        body.bounceCount = 1;
        const impactSpeed = Math.abs(body.vy);
        body.vy = Math.min(1.6, Math.max(0.32, impactSpeed * body.restitution));
        body.vx = Math.max(-0.35, Math.min(0.35, body.vx * 0.08));
        body.vz = Math.max(-0.35, Math.min(0.35, body.vz * 0.08));
        body.pitchTilt *= -0.4;
        body.rollTilt *= -0.4;
        if (!body.impactFired) {
          anyCollided = true;
          body.impactFired = true;
          maxCollisionIntensity = Math.max(
            maxCollisionIntensity,
            Math.min(1.4, 0.55 + impactSpeed * 0.22)
          );
        }
      }
    } else {
      body.vy -= GRAVITY * subDt;
      body.x += body.vx * subDt;
      body.z += body.vz * subDt;
      body.y += body.vy * subDt;

      body.vx *= Math.exp(-14 * subDt);
      body.vz *= Math.exp(-14 * subDt);
      body.pitchTilt *= Math.exp(-16 * subDt);
      body.rollTilt *= Math.exp(-16 * subDt);

      if (body.y <= body.targetY) {
        body.y = body.targetY;
        if (body.bounceCount < body.maxBounces && Math.abs(body.vy) > 0.18) {
          body.bounceCount += 1;
          body.vy = Math.abs(body.vy) * body.restitution;
          body.pitchTilt = (body.bounceCount % 2 === 0 ? 1 : -1) * 0.045;
        } else {
          body.x = body.targetX;
          body.z = body.targetZ;
          body.y = body.targetY;
          body.vx = 0;
          body.vy = 0;
          body.vz = 0;
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
  state.lateralVelX = Math.max(-0.45, Math.min(0.45, state.lateralVelX + dirX * clamped * 0.18));
  state.lateralVelZ = Math.max(-0.45, Math.min(0.45, state.lateralVelZ + dirZ * clamped * 0.18));
}

/**
 * Sub-stepped symplectic spring-damper integration for stack impact compression and micro-rattle.
 * Unconditionally stable across both 60fps GPU and low-fps software WebGL frame intervals.
 */
export function stepStackSpringPhysics(state: StackSpringState, dt: number): boolean {
  const kVertical = 340;
  const cVertical = 22;
  const kLateral = 260;
  const cLateral = 19;

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
  state.compression = Math.max(-0.1, Math.min(0.2, state.compression));
  state.lateralX = Math.max(-0.04, Math.min(0.04, state.lateralX));
  state.lateralZ = Math.max(-0.04, Math.min(0.04, state.lateralZ));

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
