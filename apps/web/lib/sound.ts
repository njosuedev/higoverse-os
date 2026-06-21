/**
 * Plays a soft two-note chime when the AI responds.
 * Uses Web Audio API — no external files needed.
 */
export function playAIResponse() {
  try {
    const AudioCtx =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx  = new AudioCtx();
    const now  = ctx.currentTime;

    function note(freq: number, start: number, duration: number, vol = 0.18) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(vol, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);

      osc.start(now + start);
      osc.stop(now + start + duration + 0.05);
    }

    // Two-note chime: C5 → E5
    note(523.25, 0,    0.22);   // C5
    note(659.25, 0.14, 0.28);   // E5

    // Close context after sound finishes
    setTimeout(() => ctx.close(), 700);
  } catch {
    // Silently ignore — audio is non-critical
  }
}
