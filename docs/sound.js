/* Optional, locally synthesized sound. Nothing is created or played before opt-in. */
export function initSound() {
  let context = null, master = null, enabled = false, busy = false;
  const listeners = new Set();
  const setUI = () => { for (const fn of listeners) fn(enabled); };
  function createAudio() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Web Audio unavailable');
    context = new Audio(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
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
    if (enabled) { enabled = false; fade(0, 0.12); setUI(); return enabled; }
    busy = true;
    try {
      if (!context) createAudio();
      await context.resume();
      if (context.state !== 'running') throw new Error('Audio could not start');
      enabled = true; setUI(); fade(document.hidden ? 0 : 0.5, 1.2); beep();
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
  // A short confirmation beep when the speaker is switched on.
  const beep = () => tone(880, 880, 0.12, 0.06, 'square');
  return {
    toggle,
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
