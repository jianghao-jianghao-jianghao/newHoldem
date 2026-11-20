export type DealStage = 'hole' | 'flop' | 'turn' | 'river';
export type ChipDenomAudio = 5 | 25 | 100 | 500 | 1000;

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

function extractDenomsForAudio(amount: number): ChipDenomAudio[] {
  const denoms: ChipDenomAudio[] = [1000, 500, 100, 25, 5];
  let left = Math.max(5, Math.floor(amount));
  const picked: ChipDenomAudio[] = [];
  for (const d of denoms) {
    while (left >= d && picked.length < 7) {
      picked.push(d);
      left -= d;
    }
  }
  if (picked.length === 0) picked.push(5);
  return picked;
}

class SoundFx {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private sfxGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmFilter: BiquadFilterNode | null = null;

  private muted = false;
  private bgmEnabled = true;
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
      const length = Math.floor(sampleRate * 0.25);
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
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setBgmEnabled(enabled: boolean): void {
    this.bgmEnabled = enabled;
    if (!this.userInteracted && !enabled) return;
    this.initAudioGraph();
    this.startOrFadeBgm(enabled);
  }

  public isBgmEnabled(): boolean {
    return this.bgmEnabled;
  }

  private startOrFadeBgm(fadeIn: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.bgmGain) return;

    const now = ctx.currentTime;
    if (fadeIn) {
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
      this.bgmGain.gain.linearRampToValueAtTime(0.16, now + 1.4);

      if (!this.bgmStarted) {
        this.bgmStarted = true;
        this.nextBeatTime = now + 0.08;
        this.bgmTimer = window.setInterval(() => this.scheduleJazzLookahead(), 180);
      }
    } else {
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
      this.bgmGain.gain.linearRampToValueAtTime(0.0001, now + 0.45);
    }
  }

  private scheduleJazzLookahead(): void {
    if (!this.ctx || !this.bgmGain || !this.bgmEnabled) return;
    if (this.ctx.state !== 'running') return;

    const beatDuration = 60 / 74; // ~0.81s per quarter note
    const lookaheadSec = 0.7;

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
        // Swing triplet offbeat (~2/3 of beat)
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
    const ctx = this.ensureSfxContext();
    if (!ctx || !this.sfxGain) return;

    const denoms = extractDenomsForAudio(amount);
    const baseTime = ctx.currentTime + delayMs / 1000;

    const denomToneMap: Record<ChipDenomAudio, { freq: number; bodyHz: number; gain: number }> = {
      5: { freq: 3780, bodyHz: 185, gain: 0.042 },
      25: { freq: 3240, bodyHz: 168, gain: 0.048 },
      100: { freq: 2620, bodyHz: 148, gain: 0.058 },
      500: { freq: 2040, bodyHz: 126, gain: 0.066 },
      1000: { freq: 1680, bodyHz: 108, gain: 0.075 },
    };

    denoms.forEach((denom, i) => {
      const cfg = denomToneMap[denom];
      const t = baseTime + i * 0.036;
      const freq = cfg.freq + (Math.random() - 0.5) * 95;

      // Primary ceramic harmonic
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.87, t + 0.048);
      gain.gain.setValueAtTime(cfg.gain, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.055);
      osc.connect(gain).connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.06);

      // Weight/mass body thud (stronger for 500 & 1000 chips)
      const body = ctx.createOscillator();
      const bGain = ctx.createGain();
      body.type = 'sine';
      body.frequency.setValueAtTime(cfg.bodyHz, t);
      body.frequency.exponentialRampToValueAtTime(cfg.bodyHz * 0.45, t + 0.045);
      bGain.gain.setValueAtTime(cfg.gain * 0.9, t);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      body.connect(bGain).connect(this.sfxGain!);
      body.start(t);
      body.stop(t + 0.055);

      // Sharp percussive transient click
      if (this.noiseBuffer) {
        const clickSrc = ctx.createBufferSource();
        clickSrc.buffer = this.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(denom >= 500 ? 2100 : 3000, t);
        const cGain = ctx.createGain();
        cGain.gain.setValueAtTime(0.042, t);
        cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
        clickSrc.connect(hp).connect(cGain).connect(this.sfxGain!);
        clickSrc.start(t);
        clickSrc.stop(t + 0.022);
      }
    });
  }

  /**
   * Multi-chip clay/ceramic collision clatter.
   */
  public playChipCollision(count: number = 3, delayMs: number = 0): void {
    const ctx = this.ensureSfxContext();
    if (!ctx || !this.sfxGain) return;

    const baseTime = ctx.currentTime + delayMs / 1000;
    const clicks = Math.min(6, Math.max(1, count));
    const baseFreqs = [2280, 2940, 3620, 2510, 3310, 3950];

    for (let i = 0; i < clicks; i++) {
      const t = baseTime + i * 0.032;
      const freq = baseFreqs[i % baseFreqs.length] + (Math.random() - 0.5) * 140;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.88, t + 0.045);
      gain.gain.setValueAtTime(0.055, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.05);
      osc.connect(gain).connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.055);

      if (this.noiseBuffer) {
        const clickSrc = ctx.createBufferSource();
        clickSrc.buffer = this.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(2800, t);
        const cGain = ctx.createGain();
        cGain.gain.setValueAtTime(0.045, t);
        cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
        clickSrc.connect(hp).connect(cGain).connect(this.sfxGain);
        clickSrc.start(t);
        clickSrc.stop(t + 0.02);
      }
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

  public playPotSweep(): void {
    this.playChipCollision(5, 60);
    this.playChipStackTap(140);
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
}

export const soundFx = new SoundFx();
