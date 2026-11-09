// La partita sullo schermo. Un solo stato per tre modi: ufficio vuoto (lobby), dal vivo (flusso del
// server) e replay (copione ricostruito da una partita salvata). La scena resta montata
// e cambia solo la fonte.
import { useEffect, useReducer, useRef, useState } from 'react';
import { api } from './api.ts';
import { copioneReplay, eseguiReplay } from './replay.ts';
import { riduci, vistaVuota, type Azione, type Vista } from './stato.ts';

export type Modo = 'vuoto' | 'vivo' | 'replay';

export interface ControlliReplay {
  velocita: number;
  setVelocita: (v: number) => void;
  inPausa: boolean;
  setInPausa: (p: boolean) => void;
  ricomincia: () => void;
}

export function usaPartita(modo: Modo, id: string | undefined): { vista: Vista; invia: (a: Azione) => void; replay: ControlliReplay; errore?: string; chiudiErrore: () => void } {
  const [vista, invia] = useReducer(riduci, undefined, vistaVuota);
  const [velocita, setVelocita] = useState(1);
  const [inPausa, setInPausa] = useState(false);
  const [giro, setGiro] = useState(0);
  const [errore, setErrore] = useState<string>();
  const velocitaRef = useRef(velocita);
  const pausaRef = useRef(inPausa);
  velocitaRef.current = velocita;
  pausaRef.current = inPausa;

  useEffect(() => {
    invia({ tipo: 'azzera' });
    setErrore(undefined);
    // Una pausa lasciata attiva in un altro replay non deve bloccare questo.
    pausaRef.current = false;
    setInPausa(false);
    if (!id || modo === 'vuoto') return;

    if (modo === 'vivo') {
      // Il flusso SSE del server: istantanea a ogni riconnessione, poi gli eventi.
      return api.segui(id, {
        istantanea: ({ dibattito, inCorso, altrove, corrente }) => invia({ tipo: 'istantanea', dibattito, inCorso, altrove, corrente }),
        evento: (evento) => invia({ tipo: 'evento', evento }),
        connessione: (connesso) => invia({ tipo: 'connessione', connesso }),
        errore: setErrore,
      });
    }

    let ferma: (() => void) | undefined;
    let annullato = false;
    api.dibattito(id)
      .then(({ dibattito }) => {
        if (annullato) return;
        invia({ tipo: 'connessione', connesso: true });
        ferma = eseguiReplay(copioneReplay(dibattito), invia, () => velocitaRef.current, () => pausaRef.current);
      })
      .catch((e: Error) => setErrore(e.message));
    return () => {
      annullato = true;
      ferma?.();
    };
  }, [modo, id, giro]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    vista,
    invia,
    replay: { velocita, setVelocita, inPausa, setInPausa, ricomincia: () => { setInPausa(false); setGiro((g) => g + 1); } },
    errore,
    chiudiErrore: () => setErrore(undefined),
  };
}
