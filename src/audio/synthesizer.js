/**
 * Web Audio API Dance Music Synthesizer & Sound Effects Generator
 * Produces synthesized dance beats (kick, snare, hi-hat, bass synth, lead arp)
 * locked to the exact song BPM, plus responsive real-time game sound effects.
 */

export class AudioSynthesizer {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.bpm = 128;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.startTime = 0;
    this.pauseOffset = 0;
    this.scheduledTimer = null;
    this.currentStep = 0;
  }

  /**
   * Initializes the AudioContext upon user gesture
   */
  async init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  setBpm(bpm) {
    this.bpm = bpm;
  }

  /**
   * Start or resume playing synthesized dance rhythm
   */
  play(startOffset = 0) {
    if (!this.ctx) return;
    this.isPlaying = true;
    this.pauseOffset = startOffset;
    this.startTime = this.ctx.currentTime - startOffset;
    this.currentStep = Math.floor((startOffset / (60 / this.bpm)) * 4);

    this.scheduleRhythm();
  }

  pause() {
    this.isPlaying = false;
    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }
    if (this.ctx) {
      this.pauseOffset = this.ctx.currentTime - this.startTime;
    }
  }

  stop() {
    this.isPlaying = false;
    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }
    this.pauseOffset = 0;
    this.currentStep = 0;
  }

  getCurrentTime() {
    if (!this.ctx || !this.isPlaying) return this.pauseOffset;
    return Math.max(0, this.ctx.currentTime - this.startTime);
  }

  /**
   * Continuous scheduler for musical patterns
   */
  scheduleRhythm() {
    if (!this.isPlaying || !this.ctx) return;

    const stepDuration = (60 / this.bpm) / 4; // 16th note
    const lookahead = 0.2; // schedule 200ms ahead
    const now = this.ctx.currentTime;

    while (this.startTime + (this.currentStep * stepDuration) < now + lookahead) {
      const time = this.startTime + (this.currentStep * stepDuration);
      if (time >= now) {
        this.triggerStep(this.currentStep, time);
      }
      this.currentStep++;
    }

    this.scheduledTimer = setTimeout(() => this.scheduleRhythm(), 50);
  }

  /**
   * Play instruments based on current 16th-note step
   */
  triggerStep(step, time) {
    const beat = step % 16;

    // Four-on-the-floor Kick (beats 0, 4, 8, 12)
    if (beat % 4 === 0) {
      this.playKick(time);
    }

    // Snare / Clap on beats 4, 12
    if (beat === 4 || beat === 12) {
      this.playSnare(time);
    }

    // Hi-hats on off-beats and 16ths
    if (beat % 2 === 0) {
      this.playHiHat(time, beat % 4 === 2 ? 0.35 : 0.15);
    }

    // Rolling Synth Bassline (root notes: A -> F -> C -> G)
    const measure = Math.floor(step / 16) % 4;
    const bassFrequencies = [110, 87.31, 65.41, 98.0]; // A2, F2, C2, G2
    if (beat % 2 === 0) {
      const freq = bassFrequencies[measure];
      const oct = (beat === 2 || beat === 10) ? freq * 2 : freq;
      this.playBass(time, oct, 0.2);
    }

    // Arpeggiated Synth Lead Melody
    const arpNotes = [440, 523.25, 659.25, 783.99, 880, 783.99, 659.25, 523.25];
    if (step % 2 === 1) {
      const noteIndex = Math.floor(step / 2) % arpNotes.length;
      const noteFreq = arpNotes[noteIndex] || 440;
      this.playSynthNote(time, noteFreq, 0.12);
    }
  }

  playKick(time) {
    if (!this.ctx || !Number.isFinite(time)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.35);

    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.35);
  }

  playSnare(time) {
    if (!this.ctx || !Number.isFinite(time)) return;
    // White noise buffer
    const bufferSize = this.ctx.sampleRate * 0.18;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.18);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    whiteNoise.start(time);
    whiteNoise.stop(time + 0.18);
  }

  playHiHat(time, vol = 0.2) {
    if (!this.ctx || !Number.isFinite(time) || !Number.isFinite(vol)) return;
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7500;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    noise.start(time);
    noise.stop(time + 0.05);
  }

  playBass(time, freq, duration) {
    if (!this.ctx || !Number.isFinite(time) || !Number.isFinite(freq) || !Number.isFinite(duration)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, time);
    filter.frequency.exponentialRampToValueAtTime(150, time + duration);

    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + duration);
  }

  playSynthNote(time, freq, duration) {
    if (!this.ctx || !Number.isFinite(time) || !Number.isFinite(freq) || !Number.isFinite(duration)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + duration);
  }

  // --- Real-time Interactive SFX for Dance Feedback ---

  playHitSound(rating) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (rating === 'PERFECT') {
      // Sparkling Major Triad chord (C6, E6, G6)
      [1046.50, 1318.51, 1567.98].forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.03);

        gain.gain.setValueAtTime(0.3, now + idx * 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now + idx * 0.03);
        osc.stop(now + 0.4);
      });
    } else if (rating === 'GREAT') {
      // High bright blip
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.25);
    } else if (rating === 'GOOD') {
      // Soft pleasant affirmative boop
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.2);
    } else if (rating === 'MISS') {
      // Low buzz
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.linearRampToValueAtTime(80, now + 0.2);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.25);
    }
  }

  playCameraShutter() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Mechanical click / shutter pulse
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.05);

    // Second shutter blade click + high chime
    const click2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    click2.type = 'sine';
    click2.frequency.setValueAtTime(2200, now + 0.06);
    click2.frequency.exponentialRampToValueAtTime(3200, now + 0.12);

    gain2.gain.setValueAtTime(0.35, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    click2.connect(gain2);
    gain2.connect(this.sfxGain);

    click2.start(now + 0.06);
    click2.stop(now + 0.2);
  }

  playComboMilestone() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.3);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.4);
  }
}
