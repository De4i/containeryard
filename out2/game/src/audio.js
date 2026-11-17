// The yard's noise, made with the Web Audio API: gunfire by calibre, hits, reloads, the round bell.
// Nothing is loaded and nothing is created until the player's first gesture, which browsers require.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function resume() {
    if (!context) {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.42;
      master.connect(context.destination);
      const frames = Math.floor(context.sampleRate * 0.5);
      noiseBuffer = context.createBuffer(1, frames, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < frames; index += 1) data[index] = Math.random() * 2 - 1;
    }
    if (context.state === 'suspended') context.resume();
    return context;
  }

  /** One shaped tone: a body for the crack of a shot, a bell for a round. */
  function tone({ frequency, seconds, gain, type = 'square', sweep = 0, delay = 0 }) {
    if (!context) return;
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    const envelope = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + sweep), start + seconds);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(envelope).connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  /** A burst of noise through a filter: the blast that sits under the body of a shot. */
  function burst({ seconds, gain, frequency, q = 0.8, type = 'bandpass' }) {
    if (!context || !noiseBuffer) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(gain, context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + seconds);
    source.connect(filter).connect(envelope).connect(master);
    source.start();
    source.stop(context.currentTime + seconds);
  }

  return {
    resume,
    /** A shot from a weapon of `weight` 0.3 (small) to 3 (heavy), heard from `distance` metres away. */
    shot(weapon, distance = 0) {
      const attenuation = 1 / (1 + distance / 26);
      const gain = Math.min(0.5, (0.10 + weapon.damage / 260) * attenuation);
      tone({ frequency: weapon.pitch, seconds: 0.09, gain, sweep: -260 });
      burst({ seconds: 0.14, gain: gain * 1.6, frequency: 900 - weapon.damage * 2, q: 0.7 });
    },
    /** A round that found a body, and one that found a wall. */
    hit() {
      burst({ seconds: 0.09, gain: 0.22, frequency: 2400, q: 1.2 });
    },
    impact() {
      burst({ seconds: 0.07, gain: 0.12, frequency: 1400, q: 0.9, type: 'highpass' });
    },
    reload() {
      tone({ frequency: 220, seconds: 0.06, gain: 0.12, type: 'square' });
      tone({ frequency: 320, seconds: 0.07, gain: 0.12, type: 'square', delay: 0.16 });
    },
    /** The bell that opens a round, and the different one that ends it. */
    roundStart() {
      tone({ frequency: 660, seconds: 0.28, gain: 0.16, type: 'triangle' });
    },
    roundEnd(won) {
      const notes = won ? [523, 659, 784] : [392, 311, 247];
      notes.forEach((frequency, index) => tone({ frequency, seconds: 0.3, gain: 0.15, type: 'triangle', delay: index * 0.12 }));
    },
    matchEnd(won) {
      const notes = won ? [523, 659, 784, 1046] : [392, 330, 262, 196];
      notes.forEach((frequency, index) => tone({ frequency, seconds: 0.4, gain: 0.16, type: 'triangle', delay: index * 0.15 }));
    },
  };
}
