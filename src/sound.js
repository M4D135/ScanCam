/** A short confirmation tone, with one active voice and a bounded output. */
const activeVoices = new WeakMap();

export function normalizeVolume(value, fallback = 70) {
  const parsed = typeof value === 'string' && !value.trim() ? NaN : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
}

export function volumeToGain(value) {
  // A perceptual curve provides useful adjustment at the quiet end. The
  // maximum is eight times the old fixed peak (0.075), without digital clipping.
  return 0.6 * (normalizeVolume(value) / 100) ** 2;
}

export function playScanBeep(context, volume) {
  const peak = volumeToGain(volume);
  if (!context || context.state !== 'running' || peak <= 0) return false;
  const previous = activeVoices.get(context);
  if (previous) {
    try { previous.stop(); } catch { /* The previous voice already ended. */ }
  }
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.setValueAtTime(1174, now + 0.08);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.008);
  gain.gain.setValueAtTime(peak, now + 0.07);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
  gain.gain.linearRampToValueAtTime(0, now + 0.185);
  oscillator.connect(gain);
  gain.connect(context.destination);
  activeVoices.set(context, oscillator);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
    if (activeVoices.get(context) === oscillator) activeVoices.delete(context);
  };
  oscillator.start(now);
  oscillator.stop(now + 0.19);
  return true;
}
