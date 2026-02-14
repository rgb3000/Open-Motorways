import * as Tone from 'tone';

export class SoundEffectSystem {
  private chimeSynth!: Tone.PolySynth;
  private returnSynth!: Tone.PolySynth;
  private placeSynth!: Tone.Synth;
  private deleteSynth!: Tone.Synth;
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

    // Road delete — slightly lower descending blip
    this.deleteSynth = new Tone.Synth({
      volume: -16,
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.03 },
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

  playRoadPlace(): void {
    if (!this.initialized) return;
    this.placeSynth.triggerAttackRelease('C6', 0.04);
  }

  playRoadDelete(): void {
    if (!this.initialized) return;
    const now = Tone.now();
    this.deleteSynth.triggerAttackRelease('A4', 0.05, now);
  }

  dispose(): void {
    if (!this.initialized) return;
    this.chimeSynth.dispose();
    this.returnSynth.dispose();
    this.placeSynth.dispose();
    this.deleteSynth.dispose();
    this.initialized = false;
  }
}
