import * as Tone from 'tone';

export class AudioSystem {
  private drumCompressor!: Tone.Compressor;
  private distortion!: Tone.Distortion;
  private hihat!: Tone.Loop;
  private hihatSynth!: Tone.NoiseSynth;
  private snareSynth!: Tone.NoiseSynth;
  private snareSeq!: Tone.Sequence;
  private kickSynth!: Tone.MembraneSynth;
  private kickSeq!: Tone.Sequence;
  private bassSynth!: Tone.FMSynth;
  private bassPart!: Tone.Part;
  private chimeSynth!: Tone.PolySynth;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await Tone.start();

    // Drum bus: compressor → distortion → master
    this.drumCompressor = new Tone.Compressor(-30, 3).toDestination();
    this.distortion = new Tone.Distortion(0.4).connect(this.drumCompressor);

    // Hi-hat
    this.hihatSynth = new Tone.NoiseSynth({
      volume: -10,
      envelope: { attack: 0.01, decay: 0.04, sustain: 0 },
    }).connect(this.distortion);

    this.hihat = new Tone.Loop((time) => {
      if (Math.random() < 0.8) {
        this.hihatSynth.triggerAttackRelease('32n', time);
      }
    }, '16n');

    // Snare
    this.snareSynth = new Tone.NoiseSynth({
      volume: -8,
      envelope: { attack: 0.001, decay: 0.13, sustain: 0 },
    }).connect(this.distortion);

    this.snareSeq = new Tone.Sequence(
      (time, v) => { if (v) this.snareSynth.triggerAttackRelease('16n', time); },
      [null, null, 1, null, null, null, 1, null],
      '8n',
    );

    // Kick
    this.kickSynth = new Tone.MembraneSynth({
      volume: -6,
      envelope: { sustain: 0, attack: 0.02, decay: 0.8 },
      octaves: 10,
      pitchDecay: 0.09,
    }).connect(this.distortion);

    this.kickSeq = new Tone.Sequence(
      (time, v) => { if (v) this.kickSynth.triggerAttackRelease('C1', '8n', time); },
      [1, null, null, null, 1, null, null, 1],
      '8n',
    );

    // FM Bass
    this.bassSynth = new Tone.FMSynth({
      volume: -8,
      harmonicity: 3.01,
      modulationIndex: 14,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.2, decay: 0.3, sustain: 0, release: 0.2 },
      modulation: { type: 'square' },
      modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.2, release: 0.1 },
    }).toDestination();

    this.bassPart = new Tone.Part(
      (time, note) => {
        this.bassSynth.triggerAttackRelease(note.note, note.duration, time);
      },
      [
        { time: '0:0', note: 'C2', duration: '4n.' },
        { time: '0:2', note: 'C2', duration: '8n' },
        { time: '0:3', note: 'E2', duration: '4n.' },
        { time: '1:1', note: 'F2', duration: '4n.' },
        { time: '1:3', note: 'E2', duration: '8n' },
        { time: '2:0', note: 'C2', duration: '4n.' },
        { time: '2:2', note: 'B1', duration: '8n' },
        { time: '2:3', note: 'C2', duration: '4n.' },
        { time: '3:1', note: 'E2', duration: '4n.' },
        { time: '3:3', note: 'F2', duration: '8n' },
      ],
    );
    this.bassPart.loop = true;
    this.bassPart.loopEnd = '4m';

    // Delivery chime — separate from drum bus
    this.chimeSynth = new Tone.PolySynth(Tone.Synth, {
      volume: -6,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.2 },
    }).toDestination();

    Tone.getTransport().bpm.value = 125;
    this.initialized = true;
  }

  startMusic(): void {
    if (!this.initialized) return;
    this.hihat.start(0);
    this.snareSeq.start(0);
    this.kickSeq.start(0);
    this.bassPart.start(0);
    Tone.getTransport().start();
  }

  stopMusic(): void {
    if (!this.initialized) return;
    Tone.getTransport().stop();
    this.hihat.stop();
    this.snareSeq.stop();
    this.kickSeq.stop();
    this.bassPart.stop();
  }

  playDeliveryChime(): void {
    if (!this.initialized) return;
    this.chimeSynth.triggerAttackRelease(['C4', 'E4', 'G4'], '8n');
  }

  dispose(): void {
    if (!this.initialized) return;
    this.stopMusic();
    this.hihat.dispose();
    this.hihatSynth.dispose();
    this.snareSeq.dispose();
    this.snareSynth.dispose();
    this.kickSeq.dispose();
    this.kickSynth.dispose();
    this.bassPart.dispose();
    this.bassSynth.dispose();
    this.chimeSynth.dispose();
    this.distortion.dispose();
    this.drumCompressor.dispose();
    this.initialized = false;
  }
}
