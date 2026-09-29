// Interface tones and generative ambient music that evolves by era (§98–99).
// Nothing plays until the user enables sound (browsers require a gesture).

type Chord = number[];

// Each era has its own harmonic palette and texture.
const ERA_MUSIC: { chords: Chord[]; wave: OscillatorType; tempo: number; brightness: number }[] = [
  { chords: [[57, 64, 69, 72], [53, 60, 65, 69], [55, 62, 67, 71], [52, 59, 64, 67]], wave: 'triangle', tempo: 7, brightness: 1400 },
  { chords: [[50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [45, 52, 57, 61]], wave: 'sawtooth', tempo: 6, brightness: 900 },
  { chords: [[45, 52, 57, 60], [43, 50, 55, 59], [41, 48, 53, 57], [40, 47, 52, 55]], wave: 'sawtooth', tempo: 8, brightness: 700 },
  { chords: [[48, 55, 62, 67], [46, 53, 60, 65], [44, 51, 58, 63], [43, 50, 57, 62]], wave: 'triangle', tempo: 9, brightness: 1100 },
  { chords: [[38, 45, 52, 57], [36, 43, 50, 55], [34, 41, 48, 53], [33, 40, 47, 52]], wave: 'sine', tempo: 11, brightness: 600 },
  { chords: [[36, 43, 50, 55, 62, 67], [41, 48, 55, 60, 67, 72], [38, 45, 52, 57, 64, 69], [43, 50, 57, 62, 69, 74]], wave: 'sine', tempo: 13, brightness: 2400 },
];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private fxGain: GainNode | null = null;
  enabled = false;
  music = true;
  private era = 1;
  private timer: number | null = null;
  private chordIdx = 0;

  unlock() {
    try {
      this.enabled = (localStorage.getItem('helios.sound') ?? '0') === '1';
      this.music = (localStorage.getItem('helios.music') ?? '1') === '1';
    } catch {
      /* ignore */
    }
    if (this.enabled) this.ensure();
  }

  private ensure() {
    if (this.ctx) return;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx!.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx!.destination);
    this.musicGain = this.ctx!.createGain();
    this.musicGain.gain.value = this.music ? 0.12 : 0;
    this.musicGain.connect(this.master);
    this.fxGain = this.ctx!.createGain();
    this.fxGain.gain.value = 0.35;
    this.fxGain.connect(this.master);
    this.startMusic();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem('helios.sound', on ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (on) {
      this.ensure();
      this.ctx?.resume();
    } else this.ctx?.suspend();
  }

  setMusic(on: boolean) {
    this.music = on;
    try {
      localStorage.setItem('helios.music', on ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, 0.5);
  }

  setEra(era: number) {
    this.era = Math.max(1, Math.min(6, era));
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, dest?: AudioNode) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest ?? this.fxGain!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  click() {
    this.tone(1760, 0.04, 'square', 0.05);
  }

  blip() {
    this.tone(880, 0.08, 'sine', 0.12);
    setTimeout(() => this.tone(1320, 0.1, 'sine', 0.1), 70);
  }

  alarm() {
    for (let i = 0; i < 3; i++) setTimeout(() => this.tone(660, 0.18, 'square', 0.08), i * 260);
  }

  private startMusic() {
    if (this.timer !== null) return;
    const play = () => {
      if (this.ctx && this.enabled && this.music) this.playChord();
      const tempo = ERA_MUSIC[this.era - 1].tempo;
      this.timer = window.setTimeout(play, tempo * 1000);
    };
    play();
  }

  private playChord() {
    const ctx = this.ctx!;
    const spec = ERA_MUSIC[this.era - 1];
    const chord = spec.chords[this.chordIdx % spec.chords.length];
    this.chordIdx++;
    const t = ctx.currentTime;
    const dur = spec.tempo + 2;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = spec.brightness;
    filter.Q.value = 0.7;
    filter.connect(this.musicGain!);
    chord.forEach((n, i) => {
      for (const detune of [-6, 5]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = spec.wave;
        o.frequency.value = midi(n);
        o.detune.value = detune;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06 / chord.length, t + 2.5 + i * 0.3);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g);
        g.connect(filter);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    });
    // Sparse melodic telemetry pings in later eras
    if (this.era >= 3) {
      const note = chord[chord.length - 1] + 12;
      setTimeout(() => this.tone(midi(note), 1.2, 'sine', 0.03, this.musicGain!), 1800);
    }
  }
}

export const audio = new Audio();
