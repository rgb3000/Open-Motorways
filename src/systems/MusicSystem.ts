import * as Tone from 'tone';

export class MusicSystem {
  private drumCompress!: Tone.Compressor;
  private distortion!: Tone.Distortion;
  private hats!: Tone.MetalSynth;
  private hatsLoop!: Tone.Loop;
  private hatsCycleLoop!: Tone.Loop;
  private hatsActive = false;
  private snareNoise!: Tone.NoiseSynth;
  private snareTone!: Tone.MembraneSynth;
  private snarePart!: Tone.Sequence;
  private kick!: Tone.MembraneSynth;
  private kickPart!: Tone.Sequence;
  private bass!: Tone.FMSynth;
  private bassPart!: Tone.Part;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await Tone.start();

    // Compressor
    this.drumCompress = new Tone.Compressor({
      threshold: -30,
      ratio: 10,
      attack: 0.01,
      release: 0.2,
    }).toDestination();

    this.distortion = new Tone.Distortion({
      distortion: 0.4,
      wet: 0.4,
    });

    // Hats
    this.hats = new Tone.MetalSynth({
      volume: -10,
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).chain(this.distortion, this.drumCompress);
    this.hats.frequency.value = 200;

    // Hats play for ~4 bars then rest for ~28 bars (~1 min cycle at 125bpm)
    this.hatsActive = false;
    this.hatsLoop = new Tone.Loop({
      callback: (time) => {
        if (!this.hatsActive) return;
        this.hats.triggerAttackRelease('16n', time);
      },
      interval: '16n',
      probability: 0.7,
    }).start('1m');

    // Toggle hats on/off on a slow cycle
    this.hatsCycleLoop = new Tone.Loop((_time) => {
      this.hatsActive = !this.hatsActive;
    }, '4m'); // every 4 bars toggle
    // Start off, turn on at bar 28 (~56s), off at bar 32, on at bar 60, etc.
    this.hatsCycleLoop.start('28m');

    // Snare – two layers: noise (wire sizzle) + membrane (tonal body)
    this.snareNoise = new Tone.NoiseSynth({
      volume: -8,
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0 },
    }).chain(this.distortion, this.drumCompress);

    this.snareTone = new Tone.MembraneSynth({
      volume: -6,
      pitchDecay: 0.01,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.15, sustain: 0 },
    }).chain(this.distortion, this.drumCompress);

    this.snarePart = new Tone.Sequence((time, velocity) => {
      if (velocity) {
        const vel = velocity as number;
        this.snareNoise.volume.value = Tone.gainToDb(vel) - 8;
        this.snareTone.volume.value = Tone.gainToDb(vel) - 6;
        this.snareNoise.triggerAttackRelease('16n', time);
        this.snareTone.triggerAttackRelease('E3', '16n', time);
      }
    }, [null, 1, null, [1, 0.3]], '4n').start(0);

    // Kick
    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 6,
      oscillator: { type: 'square4' },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0 },
    }).connect(this.drumCompress);

    this.kickPart = new Tone.Sequence((time, probability) => {
      if (Math.random() < (probability as number) * 0.6) {
        this.kick.triggerAttack('C1', time);
      }
    }, [1, [1, [null, 0.3]], 1, [1, [null, 0.5]], 1, 1, 1, [1, [null, 0.8]]], '2n').start(0);

    // Bass
    this.bass = new Tone.FMSynth({
      harmonicity: 1,
      modulationIndex: 3.5,
      oscillator: { type: 'custom', partials: [0, 1, 0, 2] },
      envelope: { attack: 0.08, decay: 0.3, sustain: 0 },
      modulation: { type: 'square' },
      modulationEnvelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 0.01 },
    }).toDestination();

    this.bassPart = new Tone.Part((time, event) => {
      if (Math.random() < event.prob) {
        this.bass.triggerAttackRelease(event.note, event.dur, time);
      }
    }, [
      { time: '0:0', note: 'C2', dur: '4n.', prob: 1 },
      { time: '0:2', note: 'C2', dur: '8n', prob: 0.6 },
      { time: '0:2.6666', note: 'C2', dur: '8n', prob: 0.4 },
      { time: '0:3.33333', note: 'C2', dur: '8n', prob: 0.9 },
      { time: '1:0', note: 'C2', dur: '4n.', prob: 1 },
      { time: '1:2', note: 'C2', dur: '8n', prob: 0.6 },
      { time: '1:2.6666', note: 'C2', dur: '8n', prob: 0.4 },
      { time: '1:3.33333', note: 'E2', dur: '8n', prob: 0.9 },
      { time: '2:0', note: 'F2', dur: '4n.', prob: 1 },
      { time: '2:2', note: 'F2', dur: '8n', prob: 0.6 },
      { time: '2:2.6666', note: 'F2', dur: '8n', prob: 0.4 },
      { time: '2:3.33333', note: 'F2', dur: '8n', prob: 0.9 },
      { time: '3:0', note: 'F2', dur: '4n.', prob: 1 },
      { time: '3:2', note: 'F2', dur: '8n', prob: 0.6 },
      { time: '3:2.6666', note: 'F2', dur: '8n', prob: 0.4 },
      { time: '3:3.33333', note: 'B1', dur: '8n', prob: 0.9 },
    ]);
    this.bassPart.loop = true;
    this.bassPart.loopEnd = '4m';
    this.bassPart.start(0);

    Tone.getTransport().bpm.value = 125;
    this.initialized = true;
  }

  startMusic(): void {
    if (!this.initialized) return;
    Tone.getTransport().start();
  }

  stopMusic(): void {
    if (!this.initialized) return;
    Tone.getTransport().stop();
  }

  dispose(): void {
    if (!this.initialized) return;
    this.stopMusic();
    this.hatsCycleLoop.dispose();
    this.hatsLoop.dispose();
    this.hats.dispose();
    this.snarePart.dispose();
    this.snareNoise.dispose();
    this.snareTone.dispose();
    this.kickPart.dispose();
    this.kick.dispose();
    this.bassPart.dispose();
    this.bass.dispose();
    this.distortion.dispose();
    this.drumCompress.dispose();
    this.initialized = false;
  }
}
