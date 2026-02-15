import * as Tone from 'tone';

export class SoundEffectSystem {
  private chimeSynth!: Tone.PolySynth;
  private returnSynth!: Tone.PolySynth;
  private placeSynth!: Tone.Synth;
  private deleteSynth!: Tone.Synth;
  private deleteFilter!: Tone.Filter;
  private spawnSynth!: Tone.MembraneSynth;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await Tone.start();

    // Delivery chime
    this.chimeSynth = new Tone.PolySynth(Tone.Synth, {
      volume: -6,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.2 },
    }).toDestination();

    // Home-return ping — soft ascending two-note sound
    this.returnSynth = new Tone.PolySynth(Tone.Synth, {
      volume: -10,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.15 },
    }).toDestination();

    // Road place — short quiet tick
    this.placeSynth = new Tone.Synth({
      volume: -18,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 },
    }).toDestination();

    // Road delete — soft muffled thud
    this.deleteFilter = new Tone.Filter(800, 'lowpass').toDestination();
    this.deleteSynth = new Tone.Synth({
      volume: -16,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.03 },
    }).connect(this.deleteFilter);

    // Building spawn — deep kick thump
    this.spawnSynth = new Tone.MembraneSynth({
      volume: -8,
      pitchDecay: 0.03,
      octaves: 6,
      oscillator: { type: 'square4' },
      envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.05 },
    }).toDestination();

    this.initialized = true;
  }

  playDeliveryChime(): void {
    if (!this.initialized) return;
    this.chimeSynth.triggerAttackRelease(['C4', 'E4', 'G4'], '8n');
  }

  playHomeReturn(): void {
    if (!this.initialized) return;
    const now = Tone.now();
    this.returnSynth.triggerAttackRelease('E5', '16n', now);
    this.returnSynth.triggerAttackRelease('G5', '16n', now + 0.1);
  }

  private lastPlaceTime = 0;

  playRoadPlace(): void {
    if (!this.initialized) return;
    const now = Tone.now();
    // Ensure each trigger is strictly after the previous one (mono synth requirement)
    const t = Math.max(now, this.lastPlaceTime + 0.01);
    this.lastPlaceTime = t;
    this.placeSynth.triggerAttackRelease('C6', 0.04, t);
  }

  private lastDeleteTime = 0;

  playRoadDelete(): void {
    if (!this.initialized) return;
    const now = Tone.now();
    // Ensure each trigger is strictly after the previous one (mono synth requirement)
    const t = Math.max(now, this.lastDeleteTime + 0.01);
    this.lastDeleteTime = t;
    this.deleteSynth.triggerAttackRelease('A3', 0.10, t);
  }

  private lastSpawnTime = 0;

  playSpawn(): void {
    if (!this.initialized) return;
    const now = Tone.now();
    const t = Math.max(now, this.lastSpawnTime + 0.12);
    this.lastSpawnTime = t;
    this.spawnSynth.triggerAttack('C1', t);
  }

  dispose(): void {
    if (!this.initialized) return;
    this.chimeSynth.dispose();
    this.returnSynth.dispose();
    this.placeSynth.dispose();
    this.deleteSynth.dispose();
    this.deleteFilter.dispose();
    this.spawnSynth.dispose();
    this.initialized = false;
  }
}
