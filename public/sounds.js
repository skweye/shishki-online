import { legalMoves } from './game.js';
import { matchResult } from './match-result.js';

export const SOUND_PACKS = Object.freeze({
  wood: { pitch: 1, noise: 1, body: 1, notes: 1, wave: 'sine' },
  felt: { pitch: .72, noise: .42, body: .6, notes: .75, wave: 'sine' },
  glass: { pitch: 1.7, noise: .08, body: .62, notes: 1.25, wave: 'sine' },
  retro: { pitch: 1.15, noise: .12, body: .48, notes: .85, wave: 'triangle' }
});

// Only sound confirmed single-step updates, not restored or skipped history.
export function transitionSounds(previous, next, role = null) {
  if (next.revision !== previous.revision + 1) return [];
  if (previous.winner && !next.winner) return ['start'];
  const sounds = [];
  if (next.variant === 'chapaev' && next.lastShot?.revision === next.revision) sounds.push(next.lastShot.ownLost + next.lastShot.otherLost ? 'capture' : 'move');
  if (next.variant === 'pool8' && next.lastShot?.revision === next.revision) sounds.push(next.lastShot.potted.length ? 'capture' : 'move');
  if (next.variant === 'narde' && next.lastAction?.revision === next.revision) sounds.push(next.lastAction.kind === 'roll' ? 'start' : 'move');
  const move = next.variant === 'narde' ? null : legalMoves(previous).find(item => previous.board[item.from] && !next.board[item.from] && Math.sign(next.board[item.to]) === Math.sign(previous.board[item.from]));
  if (move) {
    sounds.push(move.capture === null ? 'move' : 'capture');
    if (next.variant === 'chess' ? next.history.at(-1)?.promotion : Math.abs(previous.board[move.from]) === 1 && Math.abs(next.board[move.to]) === 2) sounds.push('promotion');
  }
  if (!previous.winner && next.winner) sounds.push(matchResult(next, role).kind);
  return sounds;
}

export function createSounds() {
  const key = 'shashki-sounds-v1';
  let preferences = { enabled: true, volume: 35, pack: 'wood' }, context, master, noise;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (typeof saved?.enabled === 'boolean') preferences.enabled = saved.enabled;
    if (Number.isFinite(saved?.volume)) preferences.volume = Math.max(0, Math.min(100, saved.volume));
    if (typeof saved?.pack === 'string' && Object.hasOwn(SOUND_PACKS, saved.pack)) preferences.pack = saved.pack;
  } catch { /* Sound settings are optional. */ }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { /* Keep settings for this visit. */ }
    if (master && context) master.gain.setTargetAtTime(preferences.enabled ? preferences.volume / 100 : 0, context.currentTime, .015);
  }
  async function unlock() {
    if (!preferences.enabled) return;
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        context = new Audio(); master = context.createGain();
        // Round off the upper harmonics and leave plenty of headroom for overlapping notes.
        const softness = context.createBiquadFilter();
        softness.type = 'lowpass'; softness.frequency.value = 2200; softness.Q.value = .5;
        master.connect(softness); softness.connect(context.destination);
        master.gain.value = preferences.volume / 100;
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * .14), context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
      }
      if (context.state === 'suspended') await context.resume();
    } catch { /* Browsers without audio still support the entire game. */ }
  }
  // Audio starts only after an explicit interaction with the page.
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);
  function tone(frequency, start, duration, gain = .085, endFrequency = frequency) {
    const osc = context.createOscillator(), envelope = context.createGain();
    osc.type = SOUND_PACKS[preferences.pack].wave; osc.frequency.setValueAtTime(frequency, start);
    osc.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + .012);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    envelope.gain.linearRampToValueAtTime(0, start + duration + .015);
    osc.connect(envelope); envelope.connect(master); osc.start(start); osc.stop(start + duration + .02);
    osc.onended = () => { osc.disconnect(); envelope.disconnect(); };
  }
  function tap(start, pitch = 510, gain = .2) {
    const pack = SOUND_PACKS[preferences.pack]; pitch *= pack.pitch; gain *= pack.noise;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
    const variation = .97 + Math.random() * .06;
    source.buffer = noise; filter.type = 'bandpass'; filter.frequency.value = pitch * variation; filter.Q.value = .7;
    // A short felt-like contact followed by the low resonance of a wooden piece.
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + .006);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + .11);
    envelope.gain.linearRampToValueAtTime(0, start + .13);
    source.connect(filter); filter.connect(envelope); envelope.connect(master);
    source.start(start); source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
    tone(pitch * .48 * variation, start, preferences.pack === 'glass' ? .27 : .12, .1 * pack.body, pitch * (preferences.pack === 'glass' ? .48 : .36) * variation);
    tone(pitch * .94 * variation, start + .004, .12, .018 * pack.body);
  }
  function play(kind, delay = 0) {
    if (!preferences.enabled || !preferences.volume || document.hidden || context?.state !== 'running') return;
    const time = context.currentTime + .01 + delay;
    if (kind === 'rocket') { tone(130, time, .85, .07, 700); tone(80, time + .08, 1, .04, 240); }
    else if (kind === 'move') tap(time);
    else if (kind === 'impact') tap(time, 460, .11);
    else if (kind === 'capture') { tap(time, 410, .22); tap(time + .095, 620, .17); }
    else {
      const notes = { promotion: [523, 784], victory: [392, 494, 587, 784], defeat: [392, 330, 294], draw: [392, 440, 392], start: [330, 494] }[kind];
      const pack = SOUND_PACKS[preferences.pack];
      notes?.forEach((note, i) => tone(note * pack.notes, time + i * .15, .32, (kind === 'defeat' ? .065 : .085) * Math.min(1, pack.body)));
    }
  }
  const toggle = document.getElementById('sound-enabled'), slider = document.getElementById('sound-volume'), output = document.getElementById('sound-volume-value');
  const packSelect = document.getElementById('sound-pack');
  packSelect.value = preferences.pack;
  packSelect.onchange = async () => {
    if (!Object.hasOwn(SOUND_PACKS, packSelect.value)) return;
    preferences.pack = packSelect.value; save(); await unlock(); play('move'); play('capture', .4);
  };
  function render() { toggle.checked = preferences.enabled; slider.value = preferences.volume; output.value = `${preferences.volume}%`; slider.disabled = !preferences.enabled; document.getElementById('sound-preview').disabled = !preferences.enabled; }
  toggle.onchange = async () => { preferences.enabled = toggle.checked; save(); render(); await unlock(); play('move'); };
  slider.oninput = () => { preferences.volume = Number(slider.value); save(); render(); };
  slider.onchange = () => play('move');
  document.getElementById('sound-preview').onclick = async () => { await unlock(); play('move'); play('capture', .4); play('promotion', .9); };
  render();
  return { play, transition(previous, next, role, skipMove = false) { transitionSounds(previous, next, role).filter(sound => !skipMove || sound !== 'move').forEach((sound, i) => play(sound, i * .28)); } };
}
