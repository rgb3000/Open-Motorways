import * as Tone from 'tone';

export class AudioSystem {
  private drumCompress!: Tone.Compressor;
  private distortion!: Tone.Distortion;
  private hats!: Tone.Player;
  private hatsLoop!: Tone.Loop;
  private snare!: Tone.Player;
  private snarePart!: Tone.Sequence;
  private kick!: Tone.MembraneSynth;
  private kickPart!: Tone.Sequence;
  private bass!: Tone.FMSynth;
  private bassPart!: Tone.Part;
  private chimeSynth!: Tone.PolySynth;
  private returnSynth!: Tone.PolySynth;
  private placeSynth!: Tone.Synth;
  private deleteSynth!: Tone.Synth;
  private hatsActive = false;
  private hatsCycleLoop!: Tone.Loop;
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
    this.hats = new Tone.Player({
      url: 'https://tonejs.github.io/audio/drum-samples/CR78/hihat.mp3',
      volume: -10,
      fadeOut: 0.01,
    }).chain(this.distortion, this.drumCompress);

    // Hats play for ~4 bars then rest for ~28 bars (~1 min cycle at 125bpm)
    this.hatsActive = false;
    this.hatsLoop = new Tone.Loop({
      callback: (time) => {
        if (!this.hatsActive) return;
        this.hats.start(time).stop(time + 0.05);
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

    // Snare
    this.snare = new Tone.Player({
      url: 'https://tonejs.github.io/audio/drum-samples/CR78/snare.mp3',
      fadeOut: 0.1,
    }).chain(this.distortion, this.drumCompress);

    this.snarePart = new Tone.Sequence((time, velocity) => {
      if (velocity) {
        this.snare.volume.value = Tone.gainToDb(velocity as number);
        this.snare.start(time).stop(time + 0.1);
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

    // Delivery chime — separate from drum bus
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
    this.stopMusic();
    this.hatsCycleLoop.dispose();
    this.hatsLoop.dispose();
    this.hats.dispose();
    this.snarePart.dispose();
    this.snare.dispose();
    this.kickPart.dispose();
    this.kick.dispose();
    this.bassPart.dispose();
    this.bass.dispose();
    this.chimeSynth.dispose();
    this.returnSynth.dispose();
    this.placeSynth.dispose();
    this.deleteSynth.dispose();
    this.distortion.dispose();
    this.drumCompress.dispose();
    this.initialized = false;
  }
}
