/**
 * Relaxing Ambient Soundscape Engine (Web Audio API)
 * Synthesizes a soothing, warm, meditative sound pad with:
 * - Pentatonic harmonic chord layers (D Major 9 / F# Zen)
 * - Warm low-pass breathing filter (mimicking calm deep breathing)
 * - Micro-detuned binaural chorus warmth
 * - Periodic distant crystalline singing bowl / chime resonance (528Hz Solfeggio)
 * - Smooth fade-in and fade-out envelopes
 */

export class RelaxingAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.filter = null;
    this.oscillators = [];
    this.chimeTimer = null;
    this.isPlaying = false;
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return true;
  }

  start() {
    if (this.isPlaying) return;
    if (!this.initContext()) return;

    this.isPlaying = true;
    const now = this.ctx.currentTime;

    // Master Gain with gentle fade-in
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.0001, now);
    this.masterGain.gain.exponentialRampToValueAtTime(0.045, now + 2.5);
    this.masterGain.connect(this.ctx.destination);

    // Warm Low-pass Filter to cut any harshness
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(420, now);
    this.filter.Q.setValueAtTime(1.2, now);
    this.filter.connect(this.masterGain);

    // LFO for slow meditative "breathing" filter sweep (14-second cycle)
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.07, now); // ~14s period
    lfoGain.gain.setValueAtTime(140, now);
    lfo.connect(lfoGain);
    lfoGain.connect(this.filter.frequency);
    lfo.start();
    this.oscillators.push(lfo);

    // Warm, peaceful harmonic chord frequencies:
    // Root D3 (146.83Hz), 5th A3 (220Hz), 9th E4 (329.63Hz), Maj7 C#4 (277.18Hz), Octave D4 (293.66Hz)
    const chordFrequencies = [
      { freq: 146.83, detune: -1.2, gain: 0.9, type: 'sine' },      // D3 Deep warm base
      { freq: 220.00, detune: +1.5, gain: 0.7, type: 'sine' },      // A3 Fifth harmony
      { freq: 277.18, detune: -0.8, gain: 0.5, type: 'triangle' },  // C#4 Ethereal Major 7th
      { freq: 329.63, detune: +2.0, gain: 0.45, type: 'sine' },     // E4 Floating 9th
      { freq: 440.00, detune: -1.5, gain: 0.35, type: 'sine' },     // A4 High shimmer
    ];

    chordFrequencies.forEach(({ freq, detune, gain, type }) => {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime(detune, now);

      oscGain.gain.setValueAtTime(gain, now);

      osc.connect(oscGain);
      oscGain.connect(this.filter);

      osc.start(now);
      this.oscillators.push(osc);
    });

    // Schedule gentle, meditative singing bowl chime
    this.scheduleChime();
  }

  // Plays a crystal singing bowl chime at 528Hz (Solfeggio harmonic)
  playChime() {
    if (!this.isPlaying || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const chimeOsc = this.ctx.createOscillator();
      const chimeGain = this.ctx.createGain();

      chimeOsc.type = 'sine';
      chimeOsc.frequency.setValueAtTime(528, now); // 528Hz miracle/peace resonance

      // Soft exponential decay
      chimeGain.gain.setValueAtTime(0.0001, now);
      chimeGain.gain.linearRampToValueAtTime(0.025, now + 0.1);
      chimeGain.gain.exponentialRampToValueAtTime(0.00001, now + 5.5);

      chimeOsc.connect(chimeGain);
      chimeGain.connect(this.masterGain);

      chimeOsc.start(now);
      chimeOsc.stop(now + 5.6);
    } catch {}
  }

  scheduleChime() {
    if (!this.isPlaying) return;
    // Play subtle chime every 14-18 seconds
    const nextInterval = 14000 + Math.random() * 4000;
    this.chimeTimer = setTimeout(() => {
      this.playChime();
      this.scheduleChime();
    }, nextInterval);
  }

  stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    if (this.chimeTimer) {
      clearTimeout(this.chimeTimer);
      this.chimeTimer = null;
    }

    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      // Gentle fade-out
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

      setTimeout(() => {
        try {
          this.oscillators.forEach((osc) => {
            try { osc.stop(); osc.disconnect(); } catch {}
          });
          this.oscillators = [];
          if (this.ctx && this.ctx.state !== 'closed') {
            this.ctx.suspend();
          }
        } catch {}
      }, 1300);
    }
  }
}

// Singleton audio engine instance
const globalRelaxingAudio = new RelaxingAudioEngine();
export default globalRelaxingAudio;
