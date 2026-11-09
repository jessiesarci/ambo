// Effetti sonori sintetizzati al volo con Web Audio: niente file da scaricare.
// Spenti di serie (i browser bloccano l'audio prima di un clic), si accendono dalla barra in alto.
let ctx: AudioContext | null = null;
let attivo = (() => {
  try {
    return localStorage.getItem('adh-audio') === '1';
  } catch {
    return false;
  }
})();

export const audioAttivo = () => attivo;

export function setAudio(on: boolean): void {
  attivo = on;
  try {
    localStorage.setItem('adh-audio', on ? '1' : '0');
  } catch { /* archiviazione non disponibile */ }
  if (on) {
    ctx ??= new AudioContext();
    void ctx.resume();
  }
}

function nota(freq: number, inizio: number, durata: number, tipo: OscillatorType = 'sine', volume = 0.08): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = tipo;
  o.frequency.value = freq;
  const t = ctx.currentTime + inizio;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(volume, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + durata);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + durata + 0.02);
}

export type Suono = 'turno' | 'cambio' | 'nota' | 'accordo' | 'fine' | 'errore' | 'clic';

export function suona(s: Suono): void {
  if (!attivo || !ctx) return;
  switch (s) {
    case 'clic':
      nota(880, 0, 0.06, 'triangle', 0.04);
      break;
    case 'turno':
      nota(523, 0, 0.12, 'triangle');
      nota(784, 0.08, 0.16, 'triangle');
      break;
    case 'cambio':
      nota(659, 0, 0.1, 'square', 0.04);
      nota(988, 0.09, 0.18, 'square', 0.04);
      break;
    case 'nota':
      nota(392, 0, 0.25, 'sine');
      nota(587, 0.12, 0.3, 'sine');
      break;
    case 'accordo':
      [523, 659, 784, 1047].forEach((f, i) => nota(f, i * 0.11, 0.35, 'triangle', 0.07));
      break;
    case 'fine':
      nota(440, 0, 0.3, 'triangle');
      nota(330, 0.18, 0.45, 'triangle');
      break;
    case 'errore':
      nota(150, 0, 0.35, 'sawtooth', 0.05);
      nota(110, 0.15, 0.4, 'sawtooth', 0.05);
      break;
  }
}
