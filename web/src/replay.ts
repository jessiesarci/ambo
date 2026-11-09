// Rivedere una partita salvata: dal dibattito concluso si ricostruisce la sequenza di eventi che
// la scena avrebbe ricevuto dal vivo, con tempi pensati per leggere.
import type { Dibattito, Evento } from '../../motore/tipi.ts';
import type { Azione } from './stato.ts';

export interface Passo {
  ritardo: number; // millisecondi a velocità 1, prima di eseguire l'azione
  azione: Azione;
}

// Il tempo per leggere deve coprire la macchina da scrivere del dialogo (140 caratteri al secondo).
const lettura = (t: string) => Math.max(2500, (t.length / 140) * 1000 + 2500);

export function copioneReplay(finale: Dibattito): Passo[] {
  const d = structuredClone(finale);
  const vuoto: Dibattito = {
    ...structuredClone(d),
    turni: [],
    interventi: [],
    stato: 'in_corso',
    esito: undefined,
    motivoEsito: undefined,
    sintesi: undefined,
    verifica: undefined,
    errore: undefined,
    produzione: undefined,
  };
  const passi: Passo[] = [];
  const ev = (ritardo: number, evento: Evento) => passi.push({ ritardo, azione: { tipo: 'evento', evento } });
  const foto = (ritardo: number, parziale: Partial<Dibattito>, inCorso = true) =>
    passi.push({ ritardo, azione: { tipo: 'istantanea', dibattito: { ...vuoto, ...parziale }, inCorso } });

  foto(0, {});
  const noteMostrate = new Set<string>();
  let attesa = 700;
  for (let i = 0; i < d.turni.length; i++) {
    const t = d.turni[i]!;
    for (const n of t.interventi) {
      if (noteMostrate.has(n)) continue;
      noteMostrate.add(n);
      ev(attesa, { tipo: 'intervento', testo: n });
      attesa = 1800;
    }
    ev(attesa, { tipo: 'turno_inizio', agente: t.agente, ruolo: 'turno', indice: t.indice, round: t.round });
    ev(0, { tipo: 'attivita', agente: t.agente, fase: 'ragionamento' });
    ev(Math.min(1200 + t.chiamata.secondi * 40, 2600), { tipo: 'attivita', agente: t.agente, fase: 'risposta' });
    ev(900, { tipo: 'turno', turno: t });
    foto(0, { turni: d.turni.slice(0, i + 1), interventi: d.interventi.filter((x) => noteMostrate.has(x.testo)) });
    attesa = lettura(t.risposta.messaggio);
  }

  const turni = d.turni;
  const interventi = d.interventi;
  if (d.sintesi) {
    foto(attesa, { turni, interventi, stato: 'sintesi', esito: d.esito, motivoEsito: d.motivoEsito });
    ev(0, { tipo: 'turno_inizio', agente: d.sintesi.relatore, ruolo: 'sintesi', indice: turni.length + 1, round: 0 });
    ev(0, { tipo: 'attivita', agente: d.sintesi.relatore, fase: 'ragionamento' });
    foto(2200, { turni, interventi, stato: 'sintesi', esito: d.esito, motivoEsito: d.motivoEsito, sintesi: d.sintesi });
    attesa = 1400;
  }
  if (d.verifica) {
    ev(attesa, { tipo: 'turno_inizio', agente: d.verifica.revisore, ruolo: 'verifica', indice: turni.length + 2, round: 0 });
    ev(0, { tipo: 'attivita', agente: d.verifica.revisore, fase: 'ragionamento' });
    attesa = 2000;
  }
  if (d.esito) ev(attesa, { tipo: 'concluso', esito: d.esito, motivo: d.motivoEsito ?? '', approvata: d.verifica?.testo.approvata ?? null });
  passi.push({ ritardo: 0, azione: { tipo: 'istantanea', dibattito: d, inCorso: false } });
  return passi;
}

// Esegue il copione. velocita() si legge a ogni passo, così si può cambiare durante il replay.
export function eseguiReplay(passi: Passo[], invia: (a: Azione) => void, velocita: () => number, inPausa: () => boolean): () => void {
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fermo = false;
  const prossimo = () => {
    if (fermo || i >= passi.length) return;
    if (inPausa()) {
      timer = setTimeout(prossimo, 200);
      return;
    }
    const p = passi[i]!;
    timer = setTimeout(() => {
      if (fermo) return;
      if (inPausa()) return prossimo();
      invia(p.azione);
      i++;
      prossimo();
    }, p.ritardo / Math.max(velocita(), 0.1));
  };
  prossimo();
  return () => {
    fermo = true;
    if (timer) clearTimeout(timer);
  };
}
