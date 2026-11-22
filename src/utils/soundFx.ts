export type DealStage = 'hole' | 'flop' | 'turn' | 'river';
export type ChipDenomAudio = 5 | 25 | 100 | 500 | 1000;
export type ChipActionKind = 'call' | 'raise' | 'allin' | 'blind';
export type ChipWeightTier = 'light' | 'medium' | 'heavy' | 'massive';

export interface ChipDenomAcousticProfile {
  denom: ChipDenomAudio;
  label: string;
  massGrams: number;
  /** Primary & secondary inharmonic clay/ceramic modal frequencies (Hz) */
  modalFreqA: number;
  modalFreqB: number;
  /** Optional warm brass/clay core resonance for higher denominations */
  coreFreq?: number;
  /** Felt-table impact low-end thump sweep (Hz) */
  bodyStartHz: number;
  bodyEndHz: number;
  /** Edge-to-edge percussive transient bandpass center (Hz) */
  transientHz: number;
  /** Modal ring decay duration in seconds */
  decaySec: number;
  /** Base output gain */
  baseGain: number;
}

export interface ChipActionAudioParams {
  amount: number;
  actionKind?: ChipActionKind;
  bigBlind?: number;
  pot?: number;
  delayMs?: number;
}

export interface ChipAcousticLayering {
  weightTier: ChipWeightTier;
  /** Stereo pan half-width [0..0.6] so larger multi-stack pushes feel wider on the felt */
  stereoSpread: number;
  /** High-frequency transient & shimmer brightness multiplier */
  brightness: number;
  /** Low-frequency mahogany table resonance weight */
  tableThudWeight: number;
  /** Harmonic brass/ceramic tail presence (0 for light calls, rises on heavy/massive bets) */
  harmonicTailGain: number;
  /** Whether to gently duck Jazz BGM so massive all-in impacts breathe */
  duckBgm: boolean;
}

/**
 * Physical acoustic library modeled after weighted casino clay/ceramic & brass-core chips.
 * Higher denominations carry greater physical mass, deeper modal resonances, longer ring,
 * and heavier wool-felt table compression thuds.
 */
export const CHIP_DENOM_AUDIO_LIBRARY: Record<ChipDenomAudio, ChipDenomAcousticProfile> = {
  5: {
    denom: 5,
    label: '5 轻质黏土红筹',
    massGrams: 9.0,
    modalFreqA: 4180,
    modalFreqB: 6390,
    bodyStartHz: 225,
    bodyEndHz: 96,
    transientHz: 4600,
    decaySec: 0.042,
    baseGain: 0.042,
  },
  25: {
    denom: 25,
    label: '25 经典翠绿黏土筹',
    massGrams: 10.5,
    modalFreqA: 3480,
    modalFreqB: 5340,
    bodyStartHz: 188,
    bodyEndHz: 78,
    transientHz: 3900,
    decaySec: 0.05,
    baseGain: 0.05,
  },
  100: {
    denom: 100,
    label: '100 黑曜石复合筹',
    massGrams: 12.5,
    modalFreqA: 2740,
    modalFreqB: 4220,
    coreFreq: 1380,
    bodyStartHz: 152,
    bodyEndHz: 62,
    transientHz: 3200,
    decaySec: 0.06,
    baseGain: 0.06,
  },
  500: {
    denom: 500,
    label: '500 深紫加厚陶瓷筹',
    massGrams: 15.0,
    modalFreqA: 2080,
    modalFreqB: 3260,
    coreFreq: 1060,
    bodyStartHz: 120,
    bodyEndHz: 46,
    transientHz: 2550,
    decaySec: 0.072,
    baseGain: 0.072,
  },
  1000: {
    denom: 1000,
    label: '1000 鎏金嵌铜高额筹',
    massGrams: 18.5,
    modalFreqA: 1580,
    modalFreqB: 2490,
    coreFreq: 840,
    bodyStartHz: 94,
    bodyEndHz: 36,
    transientHz: 2050,
    decaySec: 0.088,
    baseGain: 0.086,
  },
};

const WEIGHT_TIER_CONFIG: Record<
  ChipWeightTier,
  {
    maxChips: number;
    spacingSec: number;
    gainScale: number;
    bodyScale: number;
    slideVol: number;
    reboundCount: number;
  }
> = {
  light: {
    maxChips: 3,
    spacingSec: 0.032,
    gainScale: 0.88,
    bodyScale: 0.8,
    slideVol: 0,
    reboundCount: 0,
  },
  medium: {
    maxChips: 5,
    spacingSec: 0.036,
    gainScale: 1.0,
    bodyScale: 1.05,
    slideVol: 0.022,
    reboundCount: 1,
  },
  heavy: {
    maxChips: 7,
    spacingSec: 0.04,
    gainScale: 1.16,
    bodyScale: 1.35,
    slideVol: 0.036,
    reboundCount: 2,
  },
  massive: {
    maxChips: 10,
    spacingSec: 0.034,
    gainScale: 1.32,
    bodyScale: 1.65,
    slideVol: 0.052,
    reboundCount: 3,
  },
};

interface JazzBarStep {
  bassMidi: number;
  chordMidis: number[];
}

// Warm 72 BPM ii-V-I-VI lounge progression in F major (Gm9 -> C13 -> Fmaj9 -> D7b9)
const JAZZ_PROGRESSION: JazzBarStep[] = [
  // Bar 1: Gm9
  { bassMidi: 43, chordMidis: [58, 62, 65, 69] },
  { bassMidi: 46, chordMidis: [] },
  { bassMidi: 50, chordMidis: [58, 62, 65, 69] },
  { bassMidi: 48, chordMidis: [] },
  // Bar 2: C13
  { bassMidi: 36, chordMidis: [58, 62, 64, 69] },
  { bassMidi: 40, chordMidis: [] },
  { bassMidi: 43, chordMidis: [58, 62, 64, 69] },
  { bassMidi: 46, chordMidis: [] },
  // Bar 3: Fmaj9
  { bassMidi: 41, chordMidis: [57, 60, 64, 67] },
  { bassMidi: 45, chordMidis: [] },
  { bassMidi: 48, chordMidis: [57, 60, 64, 67] },
  { bassMidi: 47, chordMidis: [] },
  // Bar 4: D7alt -> turnaround
  { bassMidi: 38, chordMidis: [57, 60, 63, 66] },
  { bassMidi: 42, chordMidis: [] },
  { bassMidi: 45, chordMidis: [56, 60, 63, 66] },
  { bassMidi: 44, chordMidis: [] },
];

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Classifies bet acoustic weight/heft from bet size, blinds, pot ratio, and action type.
 */
export function classifyChipBetWeight(params: {
  amount: number;
  actionKind?: ChipActionKind;
  bigBlind?: number;
  pot?: number;
}): ChipWeightTier {
  const amount = Math.max(0, params.amount);
  const actionKind = params.actionKind ?? 'call';
  const bigBlind = Math.max(1, params.bigBlind ?? 20);
  const pot = Math.max(0, params.pot ?? 0);
  const bbRatio = amount / bigBlind;
  const potRatio = pot > 0 ? amount / pot : 0;

  if (actionKind === 'blind') {
    return amount >= 500 ? 'medium' : 'light';
  }

  if (actionKind === 'allin') {
    return bbRatio < 2 && amount < 60 ? 'heavy' : 'massive';
  }

  if (
    amount >= 1000 ||
    bbRatio >= 14 ||
    (actionKind === 'raise' && potRatio >= 1.25 && amount >= 200)
  ) {
    return 'massive';
  }

  if (
    amount >= 300 ||
    bbRatio >= 6 ||
    (actionKind === 'raise' && potRatio >= 0.65 && amount >= 100)
  ) {
    return 'heavy';
  }

  if (amount >= 75 || bbRatio >= 2.2 || actionKind === 'raise') {
    return 'medium';
  }

  return 'light';
}

/**
 * Decomposes a chip bet amount into an ordered list of physical chip denominations
 * capped according to the acoustic weight tier.
 */
export function decomposeChipBetAudio(
  amount: number,
  weightTier: ChipWeightTier = 'medium'
): ChipDenomAudio[] {
  const denoms: ChipDenomAudio[] = [1000, 500, 100, 25, 5];
  const maxChips = WEIGHT_TIER_CONFIG[weightTier].maxChips;
  let left = Math.max(5, Math.floor(amount));
  const picked: ChipDenomAudio[] = [];

  for (const d of denoms) {
    while (left >= d && picked.length < maxChips) {
      picked.push(d);
      left -= d;
    }
  }

  if (picked.length === 0) picked.push(5);

  // For massive/all-in cascades with only 1-2 large denominations, enrich with companion stack clacks
  if (weightTier === 'massive' && picked.length < 5) {
    const anchor = picked[0];
    const secondary: ChipDenomAudio =
      anchor === 1000 ? 500 : anchor === 500 ? 100 : anchor === 100 ? 25 : 5;
    while (picked.length < 5) {
      picked.push(picked.length % 2 === 0 ? anchor : secondary);
    }
  } else if (weightTier === 'heavy' && picked.length < 3) {
    const anchor = picked[0];
    while (picked.length < 3) {
      picked.push(anchor);
    }
  }

  return picked;
}

/**
 * Computes strictly monotonic relative chip impact timestamps (seconds)
 * so accelerated all-in cascades never jump backward or double-hit.
 */
export function computeChipImpactOffsets(
  count: number,
  spacingSec: number,
  isAllIn: boolean
): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (let idx = 0; idx < count; idx++) {
    if (idx > 0) {
      const step = isAllIn && idx > 3 ? spacingSec * 0.78 : spacingSec;
      acc += step;
    }
    offsets.push(acc);
  }
  return offsets;
}

/**
 * Computes tiered acoustic layering parameters from bet size, big blind, pot, and action type.
 * Ensures crisp single-stack calls stay intimate and focused while heavy raises and all-ins
 * expand in stereo width, ceramic shimmer, harmonic brass tail, and felt-table low-end weight.
 */
export function computeChipAcousticLayering(params: {
  amount: number;
  actionKind?: ChipActionKind;
  bigBlind?: number;
  pot?: number;
}): ChipAcousticLayering {
  const weightTier = classifyChipBetWeight(params);
  const amount = Math.max(0, params.amount);
  const bigBlind = Math.max(1, params.bigBlind ?? 20);
  const bbNorm = Math.min(1, amount / (bigBlind * 25));

  switch (weightTier) {
    case 'light':
      return {
        weightTier,
        stereoSpread: 0.08,
        brightness: 0.92 + bbNorm * 0.06,
        tableThudWeight: 0.75,
        harmonicTailGain: 0,
        duckBgm: false,
      };
    case 'medium':
      return {
        weightTier,
        stereoSpread: 0.2,
        brightness: 1.0 + bbNorm * 0.08,
        tableThudWeight: 1.05,
        harmonicTailGain: 0.012,
        duckBgm: false,
      };
    case 'heavy':
      return {
        weightTier,
        stereoSpread: 0.36,
        brightness: 1.12 + bbNorm * 0.08,
        tableThudWeight: 1.38,
        harmonicTailGain: 0.026,
        duckBgm: false,
      };
    case 'massive':
      return {
        weightTier,
        stereoSpread: 0.52,
        brightness: 1.24 + bbNorm * 0.1,
        tableThudWeight: 1.72,
        harmonicTailGain: 0.044,
        duckBgm: true,
      };
  }
}

function safeReadStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

class SoundFx {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private sfxGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmFilter: BiquadFilterNode | null = null;

  private muted = safeReadStorage('velvet_sfx_muted') === '1';
  private bgmEnabled = safeReadStorage('velvet_bgm_enabled') !== '0';
  private userInteracted = false;
  private bgmStarted = false;
  private bgmTimer: number | null = null;
  private nextBeatTime = 0;
  private beatIndex = 0;

  private initAudioGraph(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.muted ? 0 : 1;
      this.sfxGain.connect(this.ctx.destination);

      this.bgmFilter = this.ctx.createBiquadFilter();
      this.bgmFilter.type = 'lowpass';
      this.bgmFilter.frequency.value = 1850;
      this.bgmFilter.Q.value = 0.6;

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0;
      this.bgmGain.connect(this.bgmFilter);
      this.bgmFilter.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (!this.noiseBuffer && this.ctx) {
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * 0.35);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }

    return this.ctx;
  }

  private ensureSfxContext(): AudioContext | null {
    if (this.muted) return null;
    return this.initAudioGraph();
  }

  /**
   * Called after first pointer/keydown interaction so Jazz Lounge BGM fades in cleanly
   * without triggering browser autoplay restrictions.
   */
  public notifyUserInteraction(): void {
    if (typeof window === 'undefined') return;
    this.userInteracted = true;
    const ctx = this.initAudioGraph();
    if (!ctx) return;
    if (this.bgmEnabled) {
      this.startOrFadeBgm(true);
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('velvet_sfx_muted', muted ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
    }
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03);
    }
    if (this.bgmGain && this.ctx) {
      this.startOrFadeBgm(!muted && this.bgmEnabled);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setBgmEnabled(enabled: boolean): void {
    this.bgmEnabled = enabled;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('velvet_bgm_enabled', enabled ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
    }
    // Never create an AudioContext before the first user gesture
    if (!this.userInteracted) return;
    this.initAudioGraph();
    this.startOrFadeBgm(enabled && !this.muted);
  }

  public isBgmEnabled(): boolean {
    return this.bgmEnabled;
  }

  private startOrFadeBgm(fadeIn: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.bgmGain) return;

    const now = ctx.currentTime;
    if (fadeIn && !this.muted) {
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
      this.bgmGain.gain.linearRampToValueAtTime(0.16, now + 1.4);

      if (!this.bgmStarted) {
        this.bgmStarted = true;
        this.nextBeatTime = now + 0.08;
        this.bgmTimer = window.setInterval(() => this.scheduleJazzLookahead(), 180);
      } else if (this.nextBeatTime < now - 0.4) {
        this.nextBeatTime = now + 0.06;
      }
    } else {
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
      this.bgmGain.gain.linearRampToValueAtTime(0.0001, now + 0.45);
    }
  }

  /**
   * Subtle cinema-style ducking of Jazz BGM during massive All-in impacts or achievement fanfares.
   */
  private duckBgmBriefly(dipGain: number = 0.095, holdSec: number = 0.48): void {
    const ctx = this.ctx;
    if (!ctx || !this.bgmGain || !this.bgmEnabled || this.muted) return;
    const now = ctx.currentTime;
    const current = this.bgmGain.gain.value;
    if (current <= dipGain + 0.01) return;
    this.bgmGain.gain.cancelScheduledValues(now);
    this.bgmGain.gain.setValueAtTime(current, now);
    this.bgmGain.gain.linearRampToValueAtTime(dipGain, now + 0.08);
    this.bgmGain.gain.linearRampToValueAtTime(0.16, now + 0.08 + holdSec);
  }

  private scheduleJazzLookahead(): void {
    if (!this.ctx || !this.bgmGain || !this.bgmEnabled || this.muted) return;
    if (this.ctx.state !== 'running') return;

    const beatDuration = 60 / 74; // ~0.81s per quarter note
    const lookaheadSec = 0.7;

    // Prevent burst of hundreds of stale beats when returning from a backgrounded tab
    if (this.nextBeatTime < this.ctx.currentTime - 0.5) {
      this.nextBeatTime = this.ctx.currentTime + 0.05;
    }

    while (this.nextBeatTime < this.ctx.currentTime + lookaheadSec) {
      const step = JAZZ_PROGRESSION[this.beatIndex % JAZZ_PROGRESSION.length];
      this.playJazzBeat(this.nextBeatTime, step, this.beatIndex % 4, beatDuration);
      this.nextBeatTime += beatDuration;
      this.beatIndex = (this.beatIndex + 1) % JAZZ_PROGRESSION.length;
    }
  }

  private playJazzBeat(
    t: number,
    step: JazzBarStep,
    beatInBar: number,
    beatDuration: number
  ): void {
    const ctx = this.ctx;
    const out = this.bgmGain;
    if (!ctx || !out) return;

    // 1. Warm Upright Walking Bass
    const bassFreq = midiToFreq(step.bassMidi);
    const bassOsc = ctx.createOscillator();
    const bassFilter = ctx.createBiquadFilter();
    const bassEnv = ctx.createGain();
    bassOsc.type = 'triangle';
    bassOsc.frequency.setValueAtTime(bassFreq * 1.01, t);
    bassOsc.frequency.exponentialRampToValueAtTime(bassFreq, t + 0.04);

    bassFilter.type = 'lowpass';
    bassFilter.frequency.setValueAtTime(420, t);
    bassFilter.frequency.exponentialRampToValueAtTime(170, t + beatDuration * 0.85);

    bassEnv.gain.setValueAtTime(0.001, t);
    bassEnv.gain.linearRampToValueAtTime(0.32, t + 0.025);
    bassEnv.gain.exponentialRampToValueAtTime(0.002, t + beatDuration * 0.92);

    bassOsc.connect(bassFilter).connect(bassEnv).connect(out);
    bassOsc.start(t);
    bassOsc.stop(t + beatDuration * 0.95);

    // 2. Soft Rhodes Electric Piano Chord Pad
    if (step.chordMidis.length > 0) {
      const chordTime = beatInBar === 2 ? t + beatDuration * 0.04 : t;
      const chordDur = beatDuration * 1.85;
      step.chordMidis.forEach((midi, idx) => {
        const f = midiToFreq(midi);
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(f, chordTime);

        const peak = 0.065 / step.chordMidis.length;
        env.gain.setValueAtTime(0.0005, chordTime);
        env.gain.linearRampToValueAtTime(peak, chordTime + 0.05 + idx * 0.014);
        env.gain.exponentialRampToValueAtTime(0.0008, chordTime + chordDur);

        osc.connect(env).connect(out);
        osc.start(chordTime);
        osc.stop(chordTime + chordDur + 0.05);
      });
    }

    // 3. Soft Brushed Jazz Ride Shimmer (main beat + swung offbeat)
    if (this.noiseBuffer) {
      this.triggerBrushHit(t, beatInBar === 1 || beatInBar === 3 ? 0.05 : 0.026, 0.07);
      if (beatInBar === 1 || beatInBar === 3) {
        this.triggerBrushHit(t + beatDuration * 0.66, 0.024, 0.055);
      }
    }
  }

  private triggerBrushHit(t: number, volume: number, dur: number): void {
    const ctx = this.ctx;
    const out = this.bgmGain;
    if (!ctx || !out || !this.noiseBuffer) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(4800, t);
    bp.Q.setValueAtTime(1.4, t);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0005, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);

    src.connect(bp).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.01);
  }

  /**
   * Synthesizes a single physically modeled clay/ceramic chip impact from the denomination library,
   * with optional stereo micro-positioning and velocity-scaled brightness.
   */
  private synthesizeDenomHit(
    ctx: AudioContext,
    out: GainNode,
    denom: ChipDenomAudio,
    startTime: number,
    gainScale: number,
    bodyScale: number,
    panValue: number = 0,
    brightness: number = 1.0
  ): void {
    const profile = CHIP_DENOM_AUDIO_LIBRARY[denom];
    const detune = 1 + (Math.random() - 0.5) * 0.045;
    const peakGain = Math.min(0.18, profile.baseGain * gainScale);
    const bright = Math.max(0.7, Math.min(1.4, brightness));

    let hitDestination: AudioNode = out;
    if (typeof ctx.createStereoPanner === 'function' && Math.abs(panValue) > 0.01) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.75, Math.min(0.75, panValue)), startTime);
      panner.connect(out);
      hitDestination = panner;
    }

    // 1. Primary clay/ceramic modal partial
    const modalA = ctx.createOscillator();
    const gainA = ctx.createGain();
    modalA.type = 'triangle';
    modalA.frequency.setValueAtTime(profile.modalFreqA * detune, startTime);
    modalA.frequency.exponentialRampToValueAtTime(
      profile.modalFreqA * detune * 0.89,
      startTime + profile.decaySec
    );
    gainA.gain.setValueAtTime(0.0008, startTime);
    gainA.gain.linearRampToValueAtTime(peakGain, startTime + 0.0025);
    gainA.gain.exponentialRampToValueAtTime(0.0006, startTime + profile.decaySec);
    modalA.connect(gainA).connect(hitDestination);
    modalA.start(startTime);
    modalA.stop(startTime + profile.decaySec + 0.008);

    // 2. Secondary inharmonic overtone partial (gives authentic ceramic click shimmer)
    const modalB = ctx.createOscillator();
    const gainB = ctx.createGain();
    modalB.type = 'sine';
    modalB.frequency.setValueAtTime(profile.modalFreqB * detune * (0.96 + bright * 0.04), startTime);
    modalB.frequency.exponentialRampToValueAtTime(
      profile.modalFreqB * detune * 0.92,
      startTime + profile.decaySec * 0.68
    );
    gainB.gain.setValueAtTime(0.0005, startTime);
    gainB.gain.linearRampToValueAtTime(peakGain * 0.42 * bright, startTime + 0.0018);
    gainB.gain.exponentialRampToValueAtTime(0.0005, startTime + profile.decaySec * 0.72);
    modalB.connect(gainB).connect(hitDestination);
    modalB.start(startTime);
    modalB.stop(startTime + profile.decaySec * 0.76);

    // 3. Metallic / dense clay core resonance for 100 / 500 / 1000 high-value chips
    if (profile.coreFreq) {
      const core = ctx.createOscillator();
      const coreGain = ctx.createGain();
      core.type = 'sine';
      core.frequency.setValueAtTime(profile.coreFreq * detune, startTime);
      core.frequency.exponentialRampToValueAtTime(
        profile.coreFreq * detune * 0.82,
        startTime + profile.decaySec * 1.15
      );
      coreGain.gain.setValueAtTime(0.0006, startTime);
      coreGain.gain.linearRampToValueAtTime(peakGain * 0.5, startTime + 0.004);
      coreGain.gain.exponentialRampToValueAtTime(0.0006, startTime + profile.decaySec * 1.2);
      core.connect(coreGain).connect(hitDestination);
      core.start(startTime);
      core.stop(startTime + profile.decaySec * 1.24);
    }

    // 4. Weighted felt-table compression body thud
    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(profile.bodyStartHz, startTime);
    body.frequency.exponentialRampToValueAtTime(
      profile.bodyEndHz,
      startTime + profile.decaySec * 0.92
    );
    const bodyPeak = Math.min(0.22, peakGain * 0.95 * bodyScale);
    bodyGain.gain.setValueAtTime(0.001, startTime);
    bodyGain.gain.linearRampToValueAtTime(bodyPeak, startTime + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, startTime + profile.decaySec * 0.96);
    body.connect(bodyGain).connect(hitDestination);
    body.start(startTime);
    body.stop(startTime + profile.decaySec + 0.01);

    // 5. Edge-to-edge percussive noise transient (brightness-shaped bandpass)
    if (this.noiseBuffer) {
      const clickSrc = ctx.createBufferSource();
      clickSrc.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(Math.min(7200, profile.transientHz * detune * bright), startTime);
      bp.Q.setValueAtTime(1.6, startTime);

      const cGain = ctx.createGain();
      cGain.gain.setValueAtTime(0.001, startTime);
      cGain.gain.linearRampToValueAtTime(
        Math.min(0.115, 0.045 * gainScale * bright),
        startTime + 0.0015
      );
      cGain.gain.exponentialRampToValueAtTime(0.0008, startTime + 0.019);

      clickSrc.connect(bp).connect(cGain).connect(hitDestination);
      clickSrc.start(startTime);
      clickSrc.stop(startTime + 0.024);
    }
  }

  /**
   * Subtle wool-felt slide friction preceding heavy raises and All-in pushes.
   */
  private triggerFeltSlide(
    ctx: AudioContext,
    out: GainNode,
    startTime: number,
    durationSec: number,
    volume: number
  ): void {
    if (!this.noiseBuffer || volume <= 0) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.setValueAtTime(920, startTime);
    lp.frequency.exponentialRampToValueAtTime(340, startTime + durationSec);
    lp.Q.setValueAtTime(0.85, startTime);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, startTime);
    g.gain.linearRampToValueAtTime(volume, startTime + durationSec * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0006, startTime + durationSec);

    src.connect(lp).connect(g).connect(out);
    src.start(startTime);
    src.stop(startTime + durationSec + 0.02);
  }

  /**
   * Deep mahogany/felt table thud when a heavy raise or All-in tower lands in the pot.
   */
  private triggerHeavyStackLanding(
    ctx: AudioContext,
    out: GainNode,
    startTime: number,
    intensity: number
  ): void {
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(112, startTime);
    sub.frequency.exponentialRampToValueAtTime(38, startTime + 0.11);

    subGain.gain.setValueAtTime(0.001, startTime);
    subGain.gain.linearRampToValueAtTime(Math.min(0.24, 0.12 * intensity), startTime + 0.006);
    subGain.gain.exponentialRampToValueAtTime(0.0008, startTime + 0.13);

    sub.connect(subGain).connect(out);
    sub.start(startTime);
    sub.stop(startTime + 0.14);
  }

  /**
   * Warm brass/ceramic resonant shimmer layered on top of heavy raises & All-in towers.
   */
  private triggerCeramicHarmonicTail(
    ctx: AudioContext,
    out: GainNode,
    startTime: number,
    leadDenom: ChipDenomAudio,
    gainLevel: number
  ): void {
    if (gainLevel <= 0) return;
    const baseFreq = leadDenom >= 1000 ? 1180 : leadDenom >= 500 ? 1420 : 1760;
    [1, 1.498].forEach((ratio, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const t = startTime + idx * 0.012;
      osc.frequency.setValueAtTime(baseFreq * ratio, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * ratio * 0.985, t + 0.16);
      g.gain.setValueAtTime(0.0004, t);
      g.gain.linearRampToValueAtTime(gainLevel * (idx === 0 ? 1 : 0.55), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0004, t + 0.17);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  }

  /**
   * Full denomination-based physical chip action audio (call / raise / all-in / blind).
   * Dynamically scales chip count, denomination acoustic timbre, stereo micro-spread,
   * felt slide friction, table bass thud, brass/ceramic shimmer, and micro-rebound settles.
   */
  public playChipAction(params: ChipActionAudioParams): void {
    const ctx = this.ensureSfxContext();
    if (!ctx || !this.sfxGain) return;

    const layering = computeChipAcousticLayering(params);
    const weightTier = layering.weightTier;
    const tierCfg = WEIGHT_TIER_CONFIG[weightTier];
    const denoms = decomposeChipBetAudio(params.amount, weightTier);
    const baseTime = ctx.currentTime + (params.delayMs ?? 0) / 1000;

    if (layering.duckBgm) {
      this.duckBgmBriefly(0.095, 0.52);
    }

    // 1. Felt slide swoosh for raises, heavy bets, and All-in stack pushes
    if (
      tierCfg.slideVol > 0 &&
      (params.actionKind === 'raise' ||
        params.actionKind === 'allin' ||
        weightTier === 'heavy' ||
        weightTier === 'massive')
    ) {
      const slideDur = params.actionKind === 'allin' ? 0.17 : 0.11;
      const slideStart = Math.max(ctx.currentTime, baseTime - slideDur * 0.55);
      this.triggerFeltSlide(ctx, this.sfxGain, slideStart, slideDur, tierCfg.slideVol);
    }

    // 2. Staggered denomination-specific chip collisions with stereo micro-spread
    const impactOffsets = computeChipImpactOffsets(
      denoms.length,
      tierCfg.spacingSec,
      params.actionKind === 'allin'
    );
    let lastImpactTime = baseTime;
    denoms.forEach((denom, idx) => {
      const jitter = (Math.random() - 0.5) * 0.004;
      const t = Math.max(ctx.currentTime, baseTime + impactOffsets[idx] + jitter);
      lastImpactTime = Math.max(lastImpactTime, t);

      const spreadNorm =
        denoms.length > 1 ? (idx / (denoms.length - 1)) * 2 - 1 : 0;
      const pan = spreadNorm * layering.stereoSpread * (idx % 2 === 0 ? 1 : -0.75);

      // Accent the lead chip and final anchor chip slightly
      const contour = idx === 0 ? 1.07 : idx === denoms.length - 1 ? 1.1 : 0.93;
      this.synthesizeDenomHit(
        ctx,
        this.sfxGain!,
        denom,
        t,
        tierCfg.gainScale * contour,
        layering.tableThudWeight,
        pan,
        layering.brightness
      );
    });

    // 3. Heavy stack bass thud & subtle ceramic harmonic shimmer on heavy raises & All-in
    if (weightTier === 'heavy' || weightTier === 'massive') {
      const impactIntensity = weightTier === 'massive' ? 1.58 : 1.08;
      this.triggerHeavyStackLanding(ctx, this.sfxGain, baseTime + 0.022, impactIntensity);
      this.triggerCeramicHarmonicTail(
        ctx,
        this.sfxGain,
        baseTime + 0.028,
        denoms[0] ?? 100,
        layering.harmonicTailGain
      );
      if (params.actionKind === 'allin') {
        this.triggerHeavyStackLanding(ctx, this.sfxGain, lastImpactTime + 0.015, 1.28);
      }
    }

    // 4. Micro-rebound settling clicks as top chips come to rest (progressively softer & warmer)
    for (let r = 0; r < tierCfg.reboundCount; r++) {
      const reboundDenom = denoms[denoms.length - 1 - (r % denoms.length)];
      const settleTime = lastImpactTime + 0.055 + r * 0.038;
      const reboundPan = (r % 2 === 0 ? 0.35 : -0.35) * layering.stereoSpread;
      this.synthesizeDenomHit(
        ctx,
        this.sfxGain,
        reboundDenom,
        settleTime,
        tierCfg.gainScale * (0.44 - r * 0.1),
        layering.tableThudWeight * 0.42,
        reboundPan,
        Math.max(0.8, layering.brightness - 0.14 * (r + 1))
      );
    }
  }

  /**
   * Rapid riffle shuffle cascade played at the start of a new hand.
   */
  public playShuffle(): void {
    const ctx = this.ensureSfxContext();
    if (!ctx || !this.noiseBuffer || !this.sfxGain) return;
    const base = ctx.currentTime;
    const riffles = 9;
    for (let i = 0; i < riffles; i++) {
      const t = base + i * 0.028;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1500 + i * 160, t);
      filter.Q.setValueAtTime(2.2, t);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.055, t + 0.007);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.032);

      src.connect(filter).connect(g).connect(this.sfxGain);
      src.start(t);
      src.stop(t + 0.038);
    }
  }

  /**
   * Stage-differentiated paper-on-felt card flick & landing thud.
   */
  public playCardSnap(delayMs: number = 0, stage: DealStage = 'hole'): void {
    const ctx = this.ensureSfxContext();
    if (!ctx || !this.noiseBuffer || !this.sfxGain) return;

    const start = ctx.currentTime + delayMs / 1000;

    const stageParams: Record<
      DealStage,
      { airFreq: number; airVol: number; thudStart: number; thudEnd: number; thudVol: number; chime?: number }
    > = {
      hole: { airFreq: 1650, airVol: 0.075, thudStart: 145, thudEnd: 52, thudVol: 0.07 },
      flop: { airFreq: 2150, airVol: 0.095, thudStart: 160, thudEnd: 58, thudVol: 0.088 },
      turn: { airFreq: 1420, airVol: 0.09, thudStart: 128, thudEnd: 46, thudVol: 0.095 },
      river: {
        airFreq: 1950,
        airVol: 0.11,
        thudStart: 118,
        thudEnd: 40,
        thudVol: 0.115,
        chime: 587.33,
      },
    };

    const cfg = stageParams[stage];

    // 1. Paper air flick
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(cfg.airFreq, start);
    filter.Q.setValueAtTime(1.8, start);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.001, start);
    nGain.gain.linearRampToValueAtTime(cfg.airVol, start + 0.01);
    nGain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);

    noise.connect(filter).connect(nGain).connect(this.sfxGain);
    noise.start(start);
    noise.stop(start + 0.065);

    // 2. Soft felt landing impact
    const land = start + 0.085;
    const thud = ctx.createOscillator();
    const tGain = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(cfg.thudStart, land);
    thud.frequency.exponentialRampToValueAtTime(cfg.thudEnd, land + 0.055);
    tGain.gain.setValueAtTime(cfg.thudVol, land);
    tGain.gain.exponentialRampToValueAtTime(0.001, land + 0.062);
    thud.connect(tGain).connect(this.sfxGain);
    thud.start(land);
    thud.stop(land + 0.065);

    // 3. Dramatic subtle tension resonance for River card
    if (cfg.chime) {
      const shimmer = ctx.createOscillator();
      const sGain = ctx.createGain();
      shimmer.type = 'sine';
      shimmer.frequency.setValueAtTime(cfg.chime, land);
      sGain.gain.setValueAtTime(0.024, land);
      sGain.gain.exponentialRampToValueAtTime(0.0008, land + 0.22);
      shimmer.connect(sGain).connect(this.sfxGain);
      shimmer.start(land);
      shimmer.stop(land + 0.24);
    }
  }

  /**
   * Denomination-aware ceramic/clay chip collision clatter based on bet size.
   */
  public playChipBet(amount: number, delayMs: number = 0): void {
    this.playChipAction({ amount, actionKind: 'call', delayMs });
  }

  /**
   * Multi-chip clay/ceramic collision clatter.
   */
  public playChipCollision(count: number = 3, delayMs: number = 0): void {
    const ctx = this.ensureSfxContext();
    if (!ctx || !this.sfxGain) return;

    const baseTime = ctx.currentTime + delayMs / 1000;
    const clicks = Math.min(6, Math.max(1, count));
    const sampleDenoms: ChipDenomAudio[] = [100, 25, 500, 25, 100, 5];

    for (let i = 0; i < clicks; i++) {
      const t = baseTime + i * 0.032;
      this.synthesizeDenomHit(
        ctx,
        this.sfxGain,
        sampleDenoms[i % sampleDenoms.length],
        t,
        0.95,
        0.9
      );
    }
  }

  public playChipStackTap(delayMs: number = 0): void {
    const ctx = this.ensureSfxContext();
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime + delayMs / 1000;
    const thud = ctx.createOscillator();
    const gain = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(165, t);
    thud.frequency.exponentialRampToValueAtTime(58, t + 0.055);
    gain.gain.setValueAtTime(0.085, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    thud.connect(gain).connect(this.sfxGain);
    thud.start(t);
    thud.stop(t + 0.065);
  }

  public playPotSweep(potAmount: number = 200): void {
    const ctx = this.ensureSfxContext();
    if (!ctx || !this.sfxGain) return;
    this.triggerFeltSlide(ctx, this.sfxGain, ctx.currentTime + 0.02, 0.14, 0.032);
    this.playChipAction({
      amount: Math.max(50, potAmount),
      actionKind: 'call',
      delayMs: 65,
    });
    this.playChipStackTap(165);
  }

  public playDeal(): void {
    this.playCardSnap(0, 'hole');
  }

  public playChip(): void {
    this.playChipCollision(3, 80);
  }

  public playCheck(): void {
    const ctx = this.ensureSfxContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    [0, 0.085].forEach((offset) => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(68, t + 0.055);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(gain).connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.065);
    });
  }

  public playFold(): void {
    const ctx = this.ensureSfxContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.09);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playNudge(): void {
    const ctx = this.ensureSfxContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    [880, 1174.66].forEach((freq, idx) => {
      const t = now + idx * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.055, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.15);
      osc.connect(gain).connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  }

  public playReveal(): void {
    this.playCardSnap(0, 'river');
  }

  public playWin(): void {
    const ctx = this.ensureSfxContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.075;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(gain).connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.25);
    });
    this.playChipCollision(5, 140);
  }

  /**
   * Warm jazz-club vibraphone chime tailored to achievement medal tier.
   */
  public playAchievementUnlock(tier: 'bronze' | 'silver' | 'gold' | 'obsidian' = 'gold'): void {
    const ctx = this.ensureSfxContext();
    if (!ctx || !this.sfxGain) return;
    this.duckBgmBriefly(0.09, 0.65);

    const now = ctx.currentTime;
    const chords: Record<'bronze' | 'silver' | 'gold' | 'obsidian', number[]> = {
      bronze: [523.25, 659.25],
      silver: [523.25, 659.25, 783.99],
      gold: [587.33, 739.99, 880, 1174.66],
      obsidian: [523.25, 659.25, 783.99, 987.77, 1318.51],
    };

    const notes = chords[tier];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.068;
      const osc = ctx.createOscillator();
      const shimmer = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      shimmer.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      shimmer.frequency.setValueAtTime(freq * 2, t);

      const sGain = ctx.createGain();
      sGain.gain.setValueAtTime(0.18, t);

      const dur = idx === notes.length - 1 ? 0.56 : 0.34;
      gain.gain.setValueAtTime(0.0008, t);
      gain.gain.linearRampToValueAtTime(0.058, t + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0006, t + dur);

      osc.connect(gain);
      shimmer.connect(sGain).connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      shimmer.start(t);
      osc.stop(t + dur + 0.02);
      shimmer.stop(t + dur + 0.02);
    });
  }
}

export const soundFx = new SoundFx();
