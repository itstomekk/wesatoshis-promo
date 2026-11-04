/* Optional, locally synthesized sound. Nothing is created or played before opt-in. */
export function initSound() {
  let context = null, master = null, voice = null, enabled = false, busy = false;
  const listeners = new Set();
  const setUI = () => { for (const fn of listeners) fn(enabled); };
  function createAudio() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Web Audio unavailable');
    context = new Audio(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
    voice = context.createGain(); voice.gain.value = 0; voice.connect(context.destination);   // the robot's message: own bus, full level at once
    // Soft, slowly beating minor chord, deliberately quiet and without a rhythmic loop.
    [110, 164.81, 220.4, 329.63].forEach((frequency, i) => {
      const osc = context.createOscillator(), gain = context.createGain();
      osc.type = 'sine'; osc.frequency.value = frequency; gain.gain.value = [0.10, 0.055, 0.045, 0.022][i];
      osc.connect(gain); gain.connect(master); osc.start();
    });
    const lfo = context.createOscillator(), depth = context.createGain(), filter = context.createBiquadFilter();
    // Subtle animated filter on a separate low drone.
    const drone = context.createOscillator(), droneGain = context.createGain();
    filter.type = 'lowpass'; filter.frequency.value = 330; lfo.frequency.value = 0.06; depth.gain.value = 150;
    drone.type = 'triangle'; drone.frequency.value = 55; droneGain.gain.value = 0.018;
    lfo.connect(depth); depth.connect(filter.frequency); drone.connect(filter); filter.connect(droneGain); droneGain.connect(master);
    lfo.start(); drone.start();
  }
  function fade(target, seconds = 0.35) {
    if (!context || !master) return;
    const now = context.currentTime; master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(target, now, seconds / 4);
  }
  // Toggled by clicking the card's own speaker (or its info-panel action); resume() runs inside that user activation.
  async function toggle() {
    if (busy) return enabled;
    if (enabled) { enabled = false; fade(0, 0.12); voice.gain.setTargetAtTime(0, context.currentTime, 0.04); setUI(); return enabled; }
    busy = true;
    try {
      if (!context) createAudio();
      await context.resume();
      if (context.state !== 'running') throw new Error('Audio could not start');
      enabled = true; setUI(); fade(document.hidden ? 0 : 0.5, 1.2); voice.gain.cancelScheduledValues(context.currentTime); voice.gain.setValueAtTime(1, context.currentTime); message();
    } catch (error) {
      enabled = false; setUI();
      console.warn('Ambient audio unavailable:', error);
    } finally { busy = false; }
    return enabled;
  }
  document.addEventListener('visibilitychange', () => { if (enabled) fade(document.hidden ? 0 : 0.5, 0.2); });
  function tone(startFreq, endFreq, duration, level, type = 'sine') {
    if (!enabled || !context || context.state !== 'running' || document.hidden) return;
    const now = context.currentTime, osc = context.createOscillator(), gain = context.createGain();
    osc.type = type; osc.frequency.setValueAtTime(startFreq, now); osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(level, now + Math.min(0.06, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain); gain.connect(master); osc.start(now); osc.stop(now + duration + 0.01);
    osc.addEventListener('ended', () => { osc.disconnect(); gain.disconnect(); }, { once: true });
  }
  /* Switching the speaker on plays a "message from a Wesatoshis robot of the future": robotic syllables (a buzzing pulse
     through jumping vowel formants, ring-modulated), squeezed through a radio band with static. Deliberately unintelligible;
     random every time. About 3.5 s. Returns its length in seconds. */
  let noiseBuf = null;
  function message() {
    if (!enabled || !context || context.state !== 'running' || document.hidden) return 0;
    const c = context, t0 = c.currentTime + 0.05, R = Math.random, nodes = [];
    const keep = n => (nodes.push(n), n);
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1; }
    // radio band + slight crunch, into the voice bus
    const hp = keep(c.createBiquadFilter()), lp = keep(c.createBiquadFilter()), crunch = keep(c.createWaveShaper()), out = keep(c.createGain());
    hp.type = 'highpass'; hp.frequency.value = 320; lp.type = 'lowpass'; lp.frequency.value = 3200;
    const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.round(Math.tanh(2.2 * x) * 32) / 32; } crunch.curve = curve;
    out.gain.value = 0.32; hp.connect(lp); lp.connect(crunch); crunch.connect(out); out.connect(voice);
    // static: a burst as the channel opens, a low hiss under the voice, a burst as it closes
    const hiss = keep(c.createBufferSource()), hissBand = keep(c.createBiquadFilter()), hissGain = keep(c.createGain());
    hiss.buffer = noiseBuf; hiss.loop = true; hissBand.type = 'bandpass'; hissBand.frequency.value = 2300; hissBand.Q.value = .7; hissGain.gain.value = 0;
    hiss.connect(hissBand); hissBand.connect(hissGain); hissGain.connect(hp);
    // the chirp that announces an incoming transmission
    const chirp = keep(c.createOscillator()), chirpG = keep(c.createGain()); chirp.type = 'square'; chirpG.gain.value = 0;
    chirp.frequency.setValueAtTime(700, t0); chirp.frequency.exponentialRampToValueAtTime(2600, t0 + .09); chirp.frequency.setValueAtTime(900, t0 + .13); chirp.frequency.exponentialRampToValueAtTime(3000, t0 + .22);
    chirpG.gain.setValueAtTime(0, t0); chirpG.gain.linearRampToValueAtTime(.22, t0 + .01); chirpG.gain.setValueAtTime(.22, t0 + .21); chirpG.gain.linearRampToValueAtTime(0, t0 + .24);
    chirp.connect(chirpG); chirpG.connect(hp);
    // the voice: a buzzing pulse whose pitch wanders, through three formant filters that jump from vowel to vowel
    const src = keep(c.createOscillator()), gate = keep(c.createGain()), ring = keep(c.createGain()), ringOsc = keep(c.createOscillator());
    src.type = 'sawtooth'; gate.gain.value = 0; ring.gain.value = .6; ringOsc.type = 'sine'; ringOsc.frequency.value = 38 + R() * 30;
    const ringDepth = keep(c.createGain()); ringDepth.gain.value = .4; ringOsc.connect(ringDepth); ringDepth.connect(ring.gain); src.connect(gate); gate.connect(ring);   // a metallic wobble
    const F = [[800, 1150, 2900], [400, 2000, 2600], [300, 2300, 3000], [450, 800, 2830], [325, 700, 2530], [600, 1700, 2500]];
    const bands = [0, 1, 2].map(i => { const f = keep(c.createBiquadFilter()), g = keep(c.createGain()); f.type = 'bandpass'; f.Q.value = [5, 7, 9][i]; g.gain.value = [5, 3.5, 2][i]; ring.connect(f); f.connect(g); g.connect(hp); return f; });
    let t = t0 + .34; const words = 3 + (R() * 2 | 0);
    hissGain.gain.setValueAtTime(0, t0); hissGain.gain.linearRampToValueAtTime(.5, t0 + .26); hissGain.gain.linearRampToValueAtTime(.07, t0 + .4);
    src.frequency.setValueAtTime(92, t);
    for (let w = 0; w < words; w++) {
      const syl = 2 + (R() * 3 | 0);
      for (let k = 0; k < syl; k++) {
        const d = .09 + R() * .13, v = F[R() * F.length | 0], p = 78 + R() * 60;
        src.frequency.setTargetAtTime(p, t, .03); src.frequency.setTargetAtTime(p * (R() < .5 ? .8 : 1.3), t + d * .6, .05);   // robotic up/down inflection
        bands.forEach((f, i) => f.frequency.setTargetAtTime(v[i] * (.9 + R() * .25), t, .012));
        gate.gain.setValueAtTime(0, t); gate.gain.linearRampToValueAtTime(1, t + d * .7); gate.gain.linearRampToValueAtTime(0, t + d);   // swells then cuts: sounds played backwards
        if (R() < .2) { gate.gain.setValueAtTime(0, t + d * .4); gate.gain.setValueAtTime(1, t + d * .5); }   // a dropout glitch
        t += d + .015 + R() * .05;
      }
      t += .16 + R() * .14;
    }
    const end = t;
    hissGain.gain.setValueAtTime(.07, end); hissGain.gain.linearRampToValueAtTime(.55, end + .08); hissGain.gain.linearRampToValueAtTime(0, end + .3);
    const bye = keep(c.createOscillator()), byeG = keep(c.createGain()); bye.type = 'square'; byeG.gain.value = 0;   // channel closes: a falling blip
    bye.frequency.setValueAtTime(2200, end + .3); bye.frequency.exponentialRampToValueAtTime(500, end + .42);
    byeG.gain.setValueAtTime(0, end + .3); byeG.gain.linearRampToValueAtTime(.18, end + .31); byeG.gain.linearRampToValueAtTime(0, end + .43);
    bye.connect(byeG); byeG.connect(hp);
    const stop = end + .5;
    [hiss, chirp, src, ringOsc, bye].forEach(n => { n.start(t0); n.stop(stop); });
    bye.addEventListener('ended', () => nodes.forEach(n => n.disconnect()), { once: true });
    return stop - c.currentTime;
  }
  return {
    toggle,
    // the speaker's message again (silent unless sound is on); returns its length in seconds
    message,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Trigger at actual animation milestones; calls while muted are discarded, never queued.
    // Camera shutter click for the selfie gag; silent unless sound is on.
    shutter() { tone(2400, 900, 0.05, 0.07, 'square'); setTimeout(() => tone(1500, 500, 0.07, 0.06, 'square'), 70); },
    // Stepper-motor feed while the joke photo prints: one short buzz per step.
    printer(ms = 1800, steps = 12) { for (let i = 0; i < steps; i++) setTimeout(() => tone(190, 150, Math.min(.08, ms / steps / 1000 * .5), 0.035, 'sawtooth'), i * ms / steps); },
    flyby() { tone(420, 145, 0.65, 0.045); },
    assembly() { tone(640, 210, 0.11, 0.07, 'triangle'); },
    state() { return { enabled, contextState: context ? context.state : 'not-created' }; }
  };
}
