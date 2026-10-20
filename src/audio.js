// Fully synthesized sound (no asset files): howls, roars, claws, gunshots,
// wind ambience and a heartbeat that rises with danger.

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
  }

  // Browsers require a user gesture before audio can start.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this._makeNoise();
    this._startAmbience();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noise(dur, { type = 'lowpass', freq = 1000, q = 1, gain = 0.5, attack = 0.005, freqEnd = null, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  _tone(dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.3, attack = 0.01, delay = 0, filter = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      node.connect(f);
      node = f;
    }
    node.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  howl(power = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 2.6;
    for (const [mult, gain] of [[1, 0.22], [2.01, 0.07], [0.5, 0.06]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const f0 = 260 * mult;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.9, t + 0.5);
      o.frequency.setValueAtTime(f0 * 1.9, t + 1.6);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.1, t + dur);
      const vib = this.ctx.createOscillator();
      vib.frequency.value = 5.5;
      const vg = this.ctx.createGain();
      vg.gain.value = 9 * mult;
      vib.connect(vg).connect(o.frequency);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 1.2;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * power, t + 0.35);
      g.gain.setValueAtTime(gain * power, t + 1.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(this.master);
      o.start(t);
      vib.start(t);
      o.stop(t + dur + 0.1);
      vib.stop(t + dur + 0.1);
    }
    this._noise(dur, { type: 'bandpass', freq: 1400, q: 2, gain: 0.05, attack: 0.3 });
  }

  roar() {
    this._noise(1.4, { type: 'lowpass', freq: 600, freqEnd: 140, q: 4, gain: 0.7, attack: 0.08 });
    this._tone(1.3, { type: 'sawtooth', freq: 110, freqEnd: 55, gain: 0.35, attack: 0.1, filter: 500 });
    this._tone(0.5, { type: 'square', freq: 60, freqEnd: 30, gain: 0.25, attack: 0.02, filter: 200 });
  }

  bones() {
    for (let i = 0; i < 6; i++) this._noise(0.06, { type: 'highpass', freq: 1800, gain: 0.25, delay: i * 0.09 + Math.random() * 0.05 });
  }

  claw(heavy = false) {
    this._noise(heavy ? 0.25 : 0.14, { type: 'highpass', freq: heavy ? 900 : 2200, freqEnd: heavy ? 300 : 900, gain: heavy ? 0.45 : 0.3 });
  }

  hit() {
    this._noise(0.12, { type: 'lowpass', freq: 900, gain: 0.6 });
    this._tone(0.12, { type: 'sine', freq: 120, freqEnd: 50, gain: 0.5 });
  }

  slam() {
    this._noise(0.9, { type: 'lowpass', freq: 400, freqEnd: 60, gain: 0.9, attack: 0.005 });
    this._tone(0.6, { type: 'sine', freq: 70, freqEnd: 30, gain: 0.8 });
  }

  gunshot(dist = 0) {
    const g = Math.max(0.05, 0.6 - dist / 120);
    this._noise(0.25, { type: 'lowpass', freq: 3000, freqEnd: 300, gain: g, attack: 0.002 });
    this._tone(0.15, { type: 'square', freq: 150, freqEnd: 40, gain: g * 0.5, filter: 800 });
  }

  scream(dist = 0) {
    const g = Math.max(0.02, 0.2 - dist / 200);
    this._tone(0.7, { type: 'sawtooth', freq: 700 + Math.random() * 300, freqEnd: 500, gain: g, attack: 0.03, filter: 2500 });
  }

  hiss(dist = 0) {
    this._noise(0.6, { type: 'highpass', freq: 3000, gain: Math.max(0.02, 0.25 - dist / 150), attack: 0.05 });
  }

  whoosh() {
    this._noise(0.35, { type: 'bandpass', freq: 600, freqEnd: 2400, q: 1.5, gain: 0.25, attack: 0.05 });
  }

  land(power = 1) {
    this._noise(0.2, { type: 'lowpass', freq: 300, gain: 0.25 * power });
  }

  magic() {
    this._tone(0.8, { type: 'triangle', freq: 400, freqEnd: 1600, gain: 0.25, attack: 0.02 });
    this._tone(0.9, { type: 'sine', freq: 800, freqEnd: 3200, gain: 0.12, attack: 0.05, delay: 0.05 });
    this._noise(0.6, { type: 'bandpass', freq: 2500, q: 3, gain: 0.1 });
  }

  chime() {
    for (let i = 0; i < 4; i++) this._tone(0.6, { type: 'sine', freq: [523, 659, 784, 1046][i], gain: 0.12, delay: i * 0.08 });
  }

  bad() {
    this._tone(0.6, { type: 'sawtooth', freq: 160, freqEnd: 90, gain: 0.15, filter: 900 });
  }

  _startAmbience() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.03;
    src.connect(f).connect(this.windGain).connect(this.master);
    src.start();
    this.windFilter = f;
    this.heartT = 0;
  }

  // speed drives rushing wind; danger drives the heartbeat
  updateAmbience(dt, speed, danger) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.03 + Math.min(speed / 40, 1) * 0.22, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 40, t, 0.2);
    if (danger > 0.2) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 1.1 - danger * 0.55;
        this._tone(0.12, { type: 'sine', freq: 55, gain: 0.25 * danger });
        this._tone(0.12, { type: 'sine', freq: 50, gain: 0.18 * danger, delay: 0.17 });
      }
    }
  }
}
