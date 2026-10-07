import { legalMoves } from './game.js';
import { matchResult } from './match-result.js';

// Only sound confirmed single-step updates, not restored or skipped history.
export function transitionSounds(previous, next, role = null) {
  if (next.revision !== previous.revision + 1) return [];
  if (previous.winner && !next.winner) return ['start'];
  const sounds = [];
  const move = legalMoves(previous).find(item => previous.board[item.from] && !next.board[item.from] && next.board[item.to]);
  if (move) {
    sounds.push(move.capture === null ? 'move' : 'capture');
    if (Math.abs(previous.board[move.from]) === 1 && Math.abs(next.board[move.to]) === 2) sounds.push('promotion');
  }
  if (!previous.winner && next.winner) sounds.push(matchResult(next, role).kind);
  return sounds;
}

export function createSounds() {
  const key = 'shashki-sounds-v1';
  let preferences = { enabled: true, volume: 45 }, context, master, noise;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (typeof saved?.enabled === 'boolean') preferences.enabled = saved.enabled;
    if (Number.isFinite(saved?.volume)) preferences.volume = Math.max(0, Math.min(100, saved.volume));
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
        context = new Audio(); master = context.createGain(); master.connect(context.destination);
        master.gain.value = preferences.volume / 100;
        noise = context.createBuffer(1, context.sampleRate * .09, context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
      }
      if (context.state === 'suspended') await context.resume();
    } catch { /* Browsers without audio still support the entire game. */ }
  }
  // Audio starts only after an explicit interaction with the page.
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);
  function tone(frequency, start, duration, gain = .13, type = 'sine') {
    const osc = context.createOscillator(), envelope = context.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(.001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + .008);
    envelope.gain.exponentialRampToValueAtTime(.001, start + duration);
    osc.connect(envelope); envelope.connect(master); osc.start(start); osc.stop(start + duration + .02);
    osc.onended = () => { osc.disconnect(); envelope.disconnect(); };
  }
  function tap(start, pitch = 720, gain = .3) {
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
    source.buffer = noise; filter.type = 'bandpass'; filter.frequency.value = pitch; filter.Q.value = 1.4;
    envelope.gain.setValueAtTime(gain, start); envelope.gain.exponentialRampToValueAtTime(.001, start + .085);
    source.connect(filter); filter.connect(envelope); envelope.connect(master);
    source.start(start); source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
    tone(pitch / 2, start, .075, .12, 'triangle');
  }
  function play(kind, delay = 0) {
    if (!preferences.enabled || !preferences.volume || document.hidden || context?.state !== 'running') return;
    const time = context.currentTime + .01 + delay;
    if (kind === 'move') tap(time);
    else if (kind === 'capture') { tap(time, 430, .45); tap(time + .075, 960, .35); }
    else {
      const notes = { promotion: [660, 880], victory: [523, 659, 784, 1047], defeat: [392, 330, 262], draw: [440, 554, 440], start: [440, 660] }[kind];
      notes?.forEach((note, i) => tone(note, time + i * .12, .24));
    }
  }
  const toggle = document.getElementById('sound-enabled'), slider = document.getElementById('sound-volume'), output = document.getElementById('sound-volume-value');
  function render() { toggle.checked = preferences.enabled; slider.value = preferences.volume; output.value = `${preferences.volume}%`; slider.disabled = !preferences.enabled; document.getElementById('sound-preview').disabled = !preferences.enabled; }
  toggle.onchange = async () => { preferences.enabled = toggle.checked; save(); render(); await unlock(); play('move'); };
  slider.oninput = () => { preferences.volume = Number(slider.value); save(); render(); };
  slider.onchange = () => play('move');
  document.getElementById('sound-preview').onclick = async () => { await unlock(); play('move'); play('capture', .35); play('promotion', .75); };
  render();
  return { play, transition(previous, next, role) { transitionSounds(previous, next, role).forEach((sound, i) => play(sound, i * .28)); } };
}
