export type ImpactBubbleKind =
  | 'allin'
  | 'pot_win'
  | 'raise'
  | 'call'
  | 'check'
  | 'fold'
  | 'reveal';

export interface AvatarImpactEvent {
  id: string;
  kind: ImpactBubbleKind;
  title: string;
  subtitle?: string;
  amount?: number;
  handName?: string;
}

export interface ChipVisualSpec {
  base: string;
  stripe: string;
  rim: string;
  inner: string;
}

export interface ImpactChipParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  radius: number;
  rot: number;
  vRot: number;
  tilt: number;
  vTilt: number;
  life: number;
  maxLife: number;
  spec: ChipVisualSpec;
}

export interface ImpactSparkParticle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  isStar: boolean;
}

export interface ImpactShockwave {
  delay: number;
  radius: number;
  maxRadius: number;
  lineWidth: number;
  color: string;
  dashed: boolean;
  progress: number;
  alpha: number;
}

export interface ImpactStrikeRay {
  angle: number;
  innerRadius: number;
  outerRadius: number;
  maxLength: number;
  width: number;
  color: string;
  speed: number;
}

export interface BubbleSpringPose {
  scaleX: number;
  scaleY: number;
  offsetY: number;
  opacity: number;
  flashAlpha: number;
  shakeX: number;
  shakeY: number;
}

export interface ImpactSimulationState {
  event: AvatarImpactEvent;
  width: number;
  height: number;
  originX: number;
  originY: number;
  elapsed: number;
  duration: number;
  hitstopRemaining: number;
  trauma: number;
  interactiveBounce: number;
  done: boolean;
  chips: ImpactChipParticle[];
  sparks: ImpactSparkParticle[];
  shockwaves: ImpactShockwave[];
  strikeRays: ImpactStrikeRay[];
  pose: BubbleSpringPose;
}

const CHIP_PALETTE_ALL: readonly ChipVisualSpec[] = [
  // 5 - Crimson Clay
  { base: '#B91C1C', stripe: '#F8F4EA', rim: '#7F1D1D', inner: '#DC2626' },
  // 25 - Emerald Club Clay
  { base: '#0F6B46', stripe: '#F3DFAC', rim: '#083E28', inner: '#158056' },
  // 100 - Obsidian & Brass
  { base: '#1B1F24', stripe: '#E8C56E', rim: '#0B0D10', inner: '#282E35' },
  // 500 - Royal Burgundy & Gold
  { base: '#6D2856', stripe: '#F6DF9F', rim: '#431634', inner: '#86356C' },
  // 1000 - Burnished Gold High-Roller
  { base: '#C89B3C', stripe: '#FFF8E1', rim: '#7A5917', inner: '#E5BD64' },
];

const MAX_CHIPS_CAP = 48;
const MAX_SPARKS_CAP = 64;

/** Deterministic fast PRNG (Mulberry32) so tests and visual effects are reproducible & jitter-free. */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1337;
}

export function classifyChipPalette(
  kind: ImpactBubbleKind,
  amount = 0
): ChipVisualSpec[] {
  if (kind === 'allin') {
    // High-impact obsidian/gold, crimson, royal burgundy, burnished gold
    return [
      CHIP_PALETTE_ALL[4],
      CHIP_PALETTE_ALL[0],
      CHIP_PALETTE_ALL[2],
      CHIP_PALETTE_ALL[3],
    ];
  }
  if (kind === 'pot_win') {
    if (amount >= 600) {
      return [
        CHIP_PALETTE_ALL[4],
        CHIP_PALETTE_ALL[2],
        CHIP_PALETTE_ALL[1],
        CHIP_PALETTE_ALL[0],
        CHIP_PALETTE_ALL[3],
      ];
    }
    return [
      CHIP_PALETTE_ALL[4],
      CHIP_PALETTE_ALL[1],
      CHIP_PALETTE_ALL[0],
      CHIP_PALETTE_ALL[2],
    ];
  }
  return [CHIP_PALETTE_ALL[1], CHIP_PALETTE_ALL[0], CHIP_PALETTE_ALL[4]];
}

export function getImpactDurationSeconds(kind: ImpactBubbleKind): number {
  switch (kind) {
    case 'allin':
      return 3.2;
    case 'pot_win':
      return 3.6;
    case 'raise':
      return 1.65;
    default:
      return 1.45;
  }
}

export function computeBubbleSpringPose(
  elapsed: number,
  duration: number,
  kind: ImpactBubbleKind,
  trauma: number,
  interactiveBounce: number
): BubbleSpringPose {
  const t = Math.max(0, elapsed);
  const fadeOutWindow = kind === 'allin' || kind === 'pot_win' ? 0.36 : 0.28;
  const remaining = Math.max(0, duration - t);
  const fadeOut = remaining < fadeOutWindow ? remaining / fadeOutWindow : 1;

  let scaleX = 1;
  let scaleY = 1;
  let offsetY = 0;
  let opacity = fadeOut;
  let flashAlpha = 0;

  if (kind === 'allin') {
    // Heavy slam-in with overshoot squash & recoil
    if (t < 0.08) {
      const p = t / 0.08;
      scaleX = 1.52 - 0.26 * p;
      scaleY = 0.68 + 0.14 * p;
      offsetY = -12 * (1 - p);
      opacity = Math.min(1, p * 1.4);
      flashAlpha = 1 - p * 0.25;
    } else if (t < 0.24) {
      const p = (t - 0.08) / 0.16;
      const ease = 1 - Math.pow(1 - p, 3);
      scaleX = 1.26 - 0.31 * ease;
      scaleY = 0.82 + 0.26 * ease;
      offsetY = -2 * Math.sin(p * Math.PI);
      flashAlpha = Math.max(0, 0.75 * (1 - p));
    } else if (t < 0.42) {
      const p = (t - 0.24) / 0.18;
      const ease = 1 - Math.pow(1 - p, 2);
      scaleX = 0.95 + 0.05 * ease;
      scaleY = 1.08 - 0.08 * ease;
      offsetY = -2 * (1 - ease);
    } else {
      offsetY = -Math.min(8, (t - 0.42) * 3.5);
    }
  } else if (kind === 'pot_win') {
    // Celebratory upward fountain pop with buoyant settle
    if (t < 0.14) {
      const p = t / 0.14;
      const ease = 1 - Math.pow(1 - p, 3);
      scaleX = 0.52 + 0.62 * ease;
      scaleY = 0.56 + 0.60 * ease;
      offsetY = 10 * (1 - ease) - 4 * ease;
      opacity = Math.min(1, p * 1.5);
      flashAlpha = 0.85 * (1 - p * 0.4);
    } else if (t < 0.34) {
      const p = (t - 0.14) / 0.2;
      const ease = 1 - Math.pow(1 - p, 2);
      scaleX = 1.14 - 0.14 * ease;
      scaleY = 1.16 - 0.16 * ease;
      offsetY = -4 - 2 * Math.sin(p * Math.PI);
      flashAlpha = Math.max(0, 0.5 * (1 - p));
    } else {
      offsetY = -4 - Math.sin((t - 0.34) * 4.2) * 2.2 - (t - 0.34) * 2.2;
    }
  } else {
    // Crisp, restrained salon pop for regular actions
    if (t < 0.12) {
      const p = t / 0.12;
      const ease = 1 - Math.pow(1 - p, 3);
      scaleX = 0.78 + 0.25 * ease;
      scaleY = 0.78 + 0.25 * ease;
      offsetY = 6 * (1 - ease);
      opacity = Math.min(1, p * 1.3);
    } else if (t < 0.24) {
      const p = (t - 0.12) / 0.12;
      scaleX = 1.03 - 0.03 * p;
      scaleY = 1.03 - 0.03 * p;
      offsetY = -2 * p;
    } else {
      offsetY = -2 - (t - 0.24) * 6;
    }
  }

  // Interactive hover/tap micro-bounce
  if (interactiveBounce > 0.001) {
    scaleX += interactiveBounce * 0.12;
    scaleY += interactiveBounce * 0.12;
    offsetY -= interactiveBounce * 3.5;
  }

  // Decaying trauma^2 camera micro-shake for heavy strike feel
  const shakeMag = trauma * trauma * (kind === 'allin' ? 8.5 : 3.2);
  const shakeX = shakeMag > 0.05 ? Math.sin(t * 78) * shakeMag : 0;
  const shakeY = shakeMag > 0.05 ? Math.cos(t * 93) * shakeMag * 0.65 : 0;

  return {
    scaleX,
    scaleY,
    offsetY,
    opacity: Math.max(0, Math.min(1, opacity)),
    flashAlpha: Math.max(0, Math.min(1, flashAlpha)),
    shakeX,
    shakeY,
  };
}

export function createImpactSimulation(
  event: AvatarImpactEvent,
  width: number,
  height: number,
  originX = width * 0.5,
  originY = height * 0.64,
  seed = hashStringSeed(event.id)
): ImpactSimulationState {
  const rng = createSeededRng(seed);
  const duration = getImpactDurationSeconds(event.kind);
  const palette = classifyChipPalette(event.kind, event.amount);

  const chips: ImpactChipParticle[] = [];
  const sparks: ImpactSparkParticle[] = [];
  const shockwaves: ImpactShockwave[] = [];
  const strikeRays: ImpactStrikeRay[] = [];

  if (event.kind === 'allin') {
    const burstY = originY - 32;
    // 1. Double crimson/gold shockwaves centered on the Heavy Strike plaque
    shockwaves.push(
      {
        delay: 0,
        radius: 14,
        maxRadius: Math.min(width * 0.44, height * 0.72),
        lineWidth: 5.0,
        color: '#F59E0B',
        dashed: false,
        progress: 0,
        alpha: 0.96,
      },
      {
        delay: 0.07,
        radius: 10,
        maxRadius: Math.min(width * 0.38, height * 0.62),
        lineWidth: 3.0,
        color: '#EF4444',
        dashed: true,
        progress: 0,
        alpha: 0.88,
      }
    );

    // 2. 16 radial "Heavy Strike" kinetic slash spikes erupting out past the plaque
    const rayCount = 16;
    for (let i = 0; i < rayCount; i++) {
      const baseAngle = (i / rayCount) * Math.PI * 2 + (rng() - 0.5) * 0.14;
      const isMajor = i % 2 === 0;
      strikeRays.push({
        angle: baseAngle,
        innerRadius: 24 + rng() * 10,
        outerRadius: 32,
        maxLength: isMajor ? 78 + rng() * 28 : 50 + rng() * 20,
        width: isMajor ? 5.2 : 3.0,
        color: i % 3 === 0 ? '#FEF3C7' : isMajor ? '#F59E0B' : '#DC2626',
        speed: isMajor ? 1.18 : 0.95,
      });
    }

    // 3. 20 high-velocity clay chips blasting radially out around the strike plaque perimeter
    const chipCount = 20;
    for (let i = 0; i < chipCount; i++) {
      const angle = -Math.PI * 0.96 + (i / (chipCount - 1)) * Math.PI * 0.92 + (rng() - 0.5) * 0.14;
      const speed = 165 + rng() * 165;
      const rimOffset = 22 + rng() * 14;
      chips.push({
        x: originX + Math.cos(angle) * rimOffset * 1.45,
        y: burstY + Math.sin(angle) * rimOffset * 0.72,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 26,
        gravity: 370 + rng() * 90,
        drag: 0.985,
        radius: 6.8 + rng() * 2.8,
        rot: rng() * Math.PI * 2,
        vRot: (rng() - 0.5) * 14,
        tilt: rng() * Math.PI,
        vTilt: 7 + rng() * 9,
        life: 0,
        maxLife: 1.25 + rng() * 0.65,
        spec: palette[i % palette.length],
      });
    }

    // 4. 28 fiery crimson & molten gold impact sparks
    const sparkColors = ['#FEF08A', '#F59E0B', '#FB923C', '#EF4444', '#FFFFFF'];
    for (let i = 0; i < 28; i++) {
      const angle = rng() * Math.PI * 2;
      const speed = 115 + rng() * 210;
      const rim = 16 + rng() * 14;
      const x = originX + Math.cos(angle) * rim * 1.3;
      const y = burstY + Math.sin(angle) * rim * 0.7;
      sparks.push({
        x,
        y,
        prevX: x,
        prevY: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 22,
        gravity: 210,
        drag: 0.95,
        size: 2.0 + rng() * 2.4,
        life: 0,
        maxLife: 0.55 + rng() * 0.5,
        color: sparkColors[i % sparkColors.length],
        isStar: i % 4 === 0,
      });
    }
  } else if (event.kind === 'pot_win') {
    const burstY = originY - 28;
    // 1. Golden victory bloom shockwaves
    shockwaves.push(
      {
        delay: 0,
        radius: 14,
        maxRadius: Math.min(width * 0.42, height * 0.68),
        lineWidth: 4.0,
        color: '#E8C56E',
        dashed: false,
        progress: 0,
        alpha: 0.92,
      },
      {
        delay: 0.14,
        radius: 14,
        maxRadius: Math.min(width * 0.36, height * 0.56),
        lineWidth: 2.4,
        color: '#6EE7B7',
        dashed: false,
        progress: 0,
        alpha: 0.72,
      }
    );

    // 2. 28 multi-denomination casino chips erupting in a celebratory fountain splash!
    const chipCount = 28;
    for (let i = 0; i < chipCount; i++) {
      // Wide upward fan (-155deg to -25deg) fanning cleanly out from behind the golden plaque rim
      const spread = -Math.PI * 0.88 + (i / (chipCount - 1)) * Math.PI * 0.76 + (rng() - 0.5) * 0.15;
      const speed = 160 + rng() * 155;
      const rimOffset = 22 + rng() * 16;
      chips.push({
        x: originX + Math.cos(angleClamp(spread)) * rimOffset * 1.45,
        y: burstY + Math.sin(angleClamp(spread)) * rimOffset * 0.75,
        vx: Math.cos(angleClamp(spread)) * speed,
        vy: Math.sin(angleClamp(spread)) * speed - 36,
        gravity: 340 + rng() * 80,
        drag: 0.988,
        radius: 6.8 + rng() * 3.0,
        rot: rng() * Math.PI * 2,
        vRot: (rng() - 0.5) * 12,
        tilt: rng() * Math.PI,
        vTilt: 6 + rng() * 8,
        life: 0,
        maxLife: 1.5 + rng() * 0.85,
        spec: palette[i % palette.length],
      });
    }

    // 3. 30 champagne gold & emerald celebration sparks/glints
    const sparkColors = ['#FFF7D6', '#E8C56E', '#D4A853', '#6EE7B7', '#FFFFFF'];
    for (let i = 0; i < 30; i++) {
      const angle = -Math.PI * 0.96 + rng() * Math.PI * 0.92;
      const speed = 90 + rng() * 185;
      const x = originX + (rng() - 0.5) * 32;
      const y = burstY + (rng() - 0.5) * 12;
      sparks.push({
        x,
        y,
        prevX: x,
        prevY: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 24,
        gravity: 165,
        drag: 0.96,
        size: 2.0 + rng() * 2.6,
        life: 0,
        maxLife: 0.75 + rng() * 0.7,
        color: sparkColors[i % sparkColors.length],
        isStar: i % 3 === 0,
      });
    }
  } else {
    // Subtle luxury salon burst for raise / call / check / fold
    const chipCount = event.kind === 'raise' ? 5 : 0;
    for (let i = 0; i < chipCount; i++) {
      const angle = -Math.PI * 0.82 + (i / Math.max(1, chipCount - 1)) * Math.PI * 0.64;
      const speed = 78 + rng() * 55;
      chips.push({
        x: originX + (rng() - 0.5) * 12,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 15,
        gravity: 310,
        drag: 0.985,
        radius: 5.2,
        rot: rng() * Math.PI * 2,
        vRot: (rng() - 0.5) * 9,
        tilt: rng() * Math.PI,
        vTilt: 6,
        life: 0,
        maxLife: 0.68 + rng() * 0.25,
        spec: palette[i % palette.length],
      });
    }

    const sparkColor =
      event.kind === 'raise'
        ? '#E8C56E'
        : event.kind === 'fold'
          ? '#E58F8F'
          : '#8CC9AA';
    for (let i = 0; i < 8; i++) {
      const angle = -Math.PI * 0.9 + (i / 7) * Math.PI * 0.8;
      const speed = 55 + rng() * 65;
      sparks.push({
        x: originX,
        y: originY,
        prevX: originX,
        prevY: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 120,
        drag: 0.94,
        size: 1.6 + rng() * 1.2,
        life: 0,
        maxLife: 0.35 + rng() * 0.25,
        color: sparkColor,
        isStar: false,
      });
    }
  }

  const initialTrauma = event.kind === 'allin' ? 1.0 : event.kind === 'pot_win' ? 0.35 : 0;

  return {
    event,
    width,
    height,
    originX,
    originY,
    elapsed: 0,
    duration,
    hitstopRemaining: event.kind === 'allin' ? 0.055 : 0,
    trauma: initialTrauma,
    interactiveBounce: 0,
    done: false,
    chips,
    sparks,
    shockwaves,
    strikeRays,
    pose: computeBubbleSpringPose(0, duration, event.kind, initialTrauma, 0),
  };
}

function angleClamp(rad: number): number {
  return rad;
}

/** Triggers a live interactive spark & mini chip ripple when the player hovers or clicks during an active bubble. */
export function triggerInteractiveRipple(
  state: ImpactSimulationState,
  seed = Math.floor(state.elapsed * 10000) + 17
): void {
  if (state.done) return;
  const rng = createSeededRng(seed);
  state.interactiveBounce = 1.0;

  const palette = classifyChipPalette(state.event.kind, state.event.amount);
  if (
    (state.event.kind === 'allin' || state.event.kind === 'pot_win') &&
    state.chips.length < MAX_CHIPS_CAP
  ) {
    const addChips = Math.min(4, MAX_CHIPS_CAP - state.chips.length);
    for (let i = 0; i < addChips; i++) {
      const angle = -Math.PI * 0.82 + rng() * Math.PI * 0.64;
      const speed = 95 + rng() * 70;
      state.chips.push({
        x: state.originX + (rng() - 0.5) * 20,
        y: state.originY - 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 18,
        gravity: 340,
        drag: 0.985,
        radius: 5.5 + rng() * 2,
        rot: rng() * Math.PI * 2,
        vRot: (rng() - 0.5) * 12,
        tilt: rng() * Math.PI,
        vTilt: 8,
        life: 0,
        maxLife: 0.78 + rng() * 0.3,
        spec: palette[i % palette.length],
      });
    }
  }

  const addSparks = Math.min(8, MAX_SPARKS_CAP - state.sparks.length);
  const color = state.event.kind === 'allin' ? '#FBBF24' : '#F3DFAC';
  for (let i = 0; i < addSparks; i++) {
    const angle = rng() * Math.PI * 2;
    const speed = 70 + rng() * 95;
    state.sparks.push({
      x: state.originX,
      y: state.originY - 8,
      prevX: state.originX,
      prevY: state.originY - 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 140,
      drag: 0.94,
      size: 1.8 + rng() * 1.8,
      life: 0,
      maxLife: 0.42 + rng() * 0.25,
      color,
      isStar: i % 2 === 0,
    });
  }
}

export function stepImpactSimulation(
  state: ImpactSimulationState,
  rawDt: number
): ImpactSimulationState {
  if (state.done) return state;
  const dt = Math.min(Math.max(Number.isFinite(rawDt) ? rawDt : 0, 0), 0.05);
  if (dt <= 0) return state;

  state.elapsed += dt;

  // Decay trauma & interactive bounce in real time (even during hitstop for crisp visceral impact!)
  state.trauma = Math.max(0, state.trauma - dt * (state.event.kind === 'allin' ? 2.1 : 1.8));
  state.interactiveBounce = Math.max(0, state.interactiveBounce - dt * 4.5);

  let simDt = dt;
  if (state.hitstopRemaining > 0) {
    state.hitstopRemaining = Math.max(0, state.hitstopRemaining - dt);
    // Freeze particle travel briefly on impact frame for tactile heavy strike feel
    simDt = dt * 0.12;
  }

  // Update shockwaves
  for (let i = 0; i < state.shockwaves.length; i++) {
    const sw = state.shockwaves[i];
    const localT = state.elapsed - sw.delay;
    if (localT <= 0) {
      sw.progress = 0;
      sw.alpha = 0;
      continue;
    }
    const waveDur = state.event.kind === 'allin' ? 0.52 : 0.68;
    const p = Math.min(1, localT / waveDur);
    const ease = 1 - Math.pow(1 - p, 3);
    sw.progress = p;
    sw.radius = 10 + (sw.maxRadius - 10) * ease;
    sw.alpha = (1 - p) * (1 - p) * 0.92;
  }

  // Update strike rays (All-in heavy impact burst)
  for (let i = 0; i < state.strikeRays.length; i++) {
    const ray = state.strikeRays[i];
    const rayProgress = Math.min(1, (state.elapsed * ray.speed) / 0.36);
    const easeOut = 1 - Math.pow(1 - rayProgress, 3);
    ray.outerRadius = ray.innerRadius + ray.maxLength * easeOut;
  }

  // Update tumbling casino chip particles in-place
  const floorY = state.height - 6;
  const dragScale = Math.pow(0.985, simDt * 60);
  for (let i = 0; i < state.chips.length; i++) {
    const c = state.chips[i];
    c.life += simDt;
    if (c.life >= c.maxLife) continue;
    c.vx *= dragScale;
    c.vy = c.vy * dragScale + c.gravity * simDt;
    c.x += c.vx * simDt;
    c.y += c.vy * simDt;
    c.rot += c.vRot * simDt;
    c.tilt += c.vTilt * simDt;
    // Soft table edge bounce at bottom of canvas
    if (c.y > floorY && c.vy > 0) {
      c.y = floorY;
      c.vy *= -0.42;
      c.vx *= 0.78;
      c.vTilt *= 0.65;
    }
  }

  // Update sparks in-place
  const sparkDrag = Math.pow(0.95, simDt * 60);
  for (let i = 0; i < state.sparks.length; i++) {
    const s = state.sparks[i];
    s.life += simDt;
    if (s.life >= s.maxLife) continue;
    s.prevX = s.x;
    s.prevY = s.y;
    s.vx *= sparkDrag;
    s.vy = s.vy * sparkDrag + s.gravity * simDt;
    s.x += s.vx * simDt;
    s.y += s.vy * simDt;
  }

  state.pose = computeBubbleSpringPose(
    state.elapsed,
    state.duration,
    state.event.kind,
    state.trauma,
    state.interactiveBounce
  );

  if (state.elapsed >= state.duration) {
    state.done = true;
  }

  return state;
}
