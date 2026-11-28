export type AlertChimeKind = 'preopen' | 'window' | 'risk' | 'news';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new Ctor();
  }
  return sharedAudioCtx;
}

const CHIME_PROFILES: Record<AlertChimeKind, Array<{ freq: number; delay: number; dur: number }>> = {
  preopen: [
    { freq: 587.33, delay: 0, dur: 0.14 },
    { freq: 880, delay: 0.13, dur: 0.22 },
  ],
  window: [
    { freq: 659.25, delay: 0, dur: 0.14 },
    { freq: 987.77, delay: 0.12, dur: 0.24 },
  ],
  risk: [
    { freq: 440, delay: 0, dur: 0.14 },
    { freq: 349.23, delay: 0.15, dur: 0.22 },
  ],
  news: [
    { freq: 783.99, delay: 0, dur: 0.1 },
    { freq: 783.99, delay: 0.13, dur: 0.14 },
  ],
};

/**
 * Plays a gentle synthesized desktop chime via Web Audio API.
 * Calls `audioCtx.resume()` before scheduling notes so WebView2 autoplay flags work seamlessly.
 */
export async function playAlertChime(kind: AlertChimeKind = 'window'): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const baseTime = ctx.currentTime + 0.01;
    const notes = CHIME_PROFILES[kind] ?? CHIME_PROFILES.window;

    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, baseTime + n.delay);

      gain.gain.setValueAtTime(0.0001, baseTime + n.delay);
      gain.gain.linearRampToValueAtTime(0.08, baseTime + n.delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, baseTime + n.delay + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(baseTime + n.delay);
      osc.stop(baseTime + n.delay + n.dur + 0.02);
    }
    return true;
  } catch {
    return false;
  }
}
