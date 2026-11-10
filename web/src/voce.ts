// La voce: registra dal microfono e manda l'audio al PC, che lo trascrive in locale
// (faster-whisper). In alternativa la dettatura del browser (Web Speech), che mostra il testo mentre
// si parla ma passa dal servizio vocale di chi fa il browser. E al contrario: le risposte lette ad alta voce.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.ts';

export type StatoVoce = 'pronto' | 'registra' | 'trascrive' | 'errore';
export type ModoVoce = 'pc' | 'browser';

const DURATA_MAX_MS = 150_000; // oltre i due minuti e mezzo un vocale diventa un monologo (e un file grosso)

// Il formato che il browser sa registrare: Chrome e Android opus in webm, Safari aac in mp4.
function formato(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
}

type Riconoscitore = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
const Riconoscimento = (globalThis as unknown as { SpeechRecognition?: new () => Riconoscitore; webkitSpeechRecognition?: new () => Riconoscitore })
  .SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => Riconoscitore }).webkitSpeechRecognition;

export const puoRegistrare = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!formato();
export const puoDettare = () => !!Riconoscimento;

export function usaVoce(op: { modo: ModoVoce; onTesto: (testo: string) => void }) {
  const [stato, setStato] = useState<StatoVoce>('pronto');
  const [errore, setErrore] = useState<string>();
  const [livello, setLivello] = useState(0);
  const [inizio, setInizio] = useState<number>();
  const [parziale, setParziale] = useState('');
  const registratore = useRef<MediaRecorder | null>(null);
  const flusso = useRef<MediaStream | null>(null);
  const contesto = useRef<AudioContext | null>(null);
  const dettatura = useRef<Riconoscitore | null>(null);
  const annullata = useRef(false);
  const inAvvio = useRef(false);
  const onTesto = useRef(op.onTesto);
  onTesto.current = op.onTesto;

  const pulisci = useCallback(() => {
    flusso.current?.getTracks().forEach((t) => t.stop());
    flusso.current = null;
    void contesto.current?.close().catch(() => undefined);
    contesto.current = null;
    registratore.current = null;
    setLivello(0);
    setInizio(undefined);
  }, []);

  useEffect(() => () => { annullata.current = true; registratore.current?.stop(); dettatura.current?.abort(); pulisci(); }, [pulisci]);

  // Con la dettatura del browser il testo arriva mentre si parla.
  const avviaDettatura = useCallback(() => {
    if (!Riconoscimento) throw new Error('questo browser non ha la dettatura');
    const r = new Riconoscimento();
    r.lang = 'it-IT';
    r.continuous = true;
    r.interimResults = true;
    let definitivo = '';
    r.onresult = (e) => {
      let provvisorio = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const x = e.results[i]!;
        if (x.isFinal) definitivo += `${x[0].transcript} `;
        else provvisorio += x[0].transcript;
      }
      setParziale(`${definitivo}${provvisorio}`.trim());
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setErrore(e.error === 'not-allowed' ? 'Il microfono non è permesso: abilitalo nelle impostazioni del browser.' : `Dettatura non riuscita (${e.error}).`);
      setStato('errore');
    };
    r.onend = () => {
      dettatura.current = null;
      setInizio(undefined);
      if (!annullata.current && definitivo.trim()) onTesto.current(definitivo.trim());
      setParziale('');
      setStato((s) => (s === 'errore' ? s : 'pronto'));
    };
    dettatura.current = r;
    r.start();
  }, []);

  const avvia = useCallback(async () => {
    // Un doppio tocco mentre il browser chiede il microfono aprirebbe due registrazioni.
    if (inAvvio.current || registratore.current || dettatura.current) return;
    inAvvio.current = true;
    setErrore(undefined);
    annullata.current = false;
    try {
      if (op.modo === 'browser') {
        avviaDettatura();
        setInizio(Date.now());
        setStato('registra');
        return;
      }
      const tipo = formato();
      if (!tipo || !navigator.mediaDevices?.getUserMedia) throw new Error('questo browser non sa registrare audio');
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      flusso.current = media;
      // Il livello del microfono, per vedere che sta sentendo.
      try {
        const ctx = new AudioContext();
        const analisi = ctx.createAnalyser();
        analisi.fftSize = 512;
        ctx.createMediaStreamSource(media).connect(analisi);
        contesto.current = ctx;
        const dati = new Uint8Array(analisi.fftSize);
        const giro = () => {
          if (!contesto.current) return;
          analisi.getByteTimeDomainData(dati);
          let somma = 0;
          for (const v of dati) somma += ((v - 128) / 128) ** 2;
          setLivello(Math.min(1, Math.sqrt(somma / dati.length) * 4));
          requestAnimationFrame(giro);
        };
        giro();
      } catch { /* senza misuratore si registra lo stesso */ }

      const pezzi: Blob[] = [];
      const rec = new MediaRecorder(media, { mimeType: tipo, audioBitsPerSecond: 32_000 });
      rec.ondataavailable = (e) => { if (e.data.size) pezzi.push(e.data); };
      rec.onstop = () => {
        const audio = new Blob(pezzi, { type: tipo.split(';')[0] });
        pulisci();
        if (annullata.current) return setStato('pronto');
        if (audio.size < 1200) {
          setErrore('Registrazione troppo corta.');
          return setStato('errore');
        }
        setStato('trascrive');
        api.trascrivi(audio).then(
          ({ testo }) => {
            if (testo.trim()) onTesto.current(testo.trim());
            else setErrore('Non ho sentito parole: riprova più vicino al microfono.');
            setStato(testo.trim() ? 'pronto' : 'errore');
          },
          (e: Error) => { setErrore(`Trascrizione non riuscita: ${e.message}`); setStato('errore'); },
        );
      };
      registratore.current = rec;
      rec.start(1000);
      setInizio(Date.now());
      setStato('registra');
    } catch (e) {
      pulisci();
      const msg = (e as Error).name === 'NotAllowedError' ? 'Il microfono non è permesso: abilitalo nelle impostazioni del browser.' : (e as Error).message;
      setErrore(msg);
      setStato('errore');
    } finally {
      inAvvio.current = false;
    }
  }, [op.modo, avviaDettatura, pulisci]);

  const ferma = useCallback(() => {
    if (dettatura.current) dettatura.current.stop();
    else if (registratore.current?.state === 'recording') registratore.current.stop();
  }, []);

  const annulla = useCallback(() => {
    annullata.current = true;
    if (dettatura.current) dettatura.current.abort();
    if (registratore.current?.state === 'recording') registratore.current.stop();
    else pulisci();
    setParziale('');
    setStato('pronto');
  }, [pulisci]);

  // Oltre il limite si ferma da sola e trascrive quello che c'è.
  useEffect(() => {
    if (stato !== 'registra' || !inizio) return;
    const t = setTimeout(ferma, DURATA_MAX_MS - (Date.now() - inizio));
    return () => clearTimeout(t);
  }, [stato, inizio, ferma]);

  return { stato, errore, livello, inizio, parziale, avvia, ferma, annulla, chiudiErrore: () => { setErrore(undefined); setStato('pronto'); } };
}

// --- lettura ad alta voce -------------------------------------------------------------------

// Toglie il markdown: asterischi, titoli e link letti ad alta voce sono rumore.
export function perVoce(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' (codice) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const puoLeggere = () => typeof speechSynthesis !== 'undefined';

// Le voci del PC (localService): una voce online, come "Google italiano" in Chrome, manderebbe il
// testo delle risposte a un servizio esterno. Senza una voce locale non si legge.
const voceLocale = () => {
  const voci = speechSynthesis.getVoices().filter((v) => v.localService);
  return voci.find((v) => v.lang.toLowerCase().startsWith('it')) ?? voci[0];
};
export const puoLeggereSulPc = () => puoLeggere() && !!voceLocale();

let inLettura: SpeechSynthesisUtterance | null = null;

// inCoda: le risposte lette in automatico si mettono in fila invece di tagliare quella in corso.
export function leggi(testo: string, alla?: () => void, op: { inCoda?: boolean } = {}): void {
  if (!puoLeggere()) return;
  if (!op.inCoda || !speechSynthesis.speaking) speechSynthesis.cancel();
  const voce = voceLocale();
  if (!voce) { alla?.(); return; }
  const u = new SpeechSynthesisUtterance(perVoce(testo));
  u.voice = voce;
  u.lang = voce.lang;
  u.rate = 1.05;
  // L'evento di fine di una lettura annullata arriva dopo che ne è partita un'altra: conta solo l'ultima.
  inLettura = u;
  const fine = () => { if (inLettura === u) { inLettura = null; alla?.(); } };
  u.onend = fine;
  u.onerror = fine;
  speechSynthesis.speak(u);
}

export const smettiDiLeggere = () => { inLettura = null; if (puoLeggere()) speechSynthesis.cancel(); };
