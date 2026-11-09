// La squadra nella dashboard: chi lavora adesso secondo la vista, l'ordine dei posti,
// e il replay che rimette in scena gli incarichi. Solo i moduli puri del web, niente DOM né 3D.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Corrente, Dibattito, Incarico, Turno } from '../motore/tipi.ts';
import { copioneReplay } from '../web/src/replay.ts';
import { alLavoro, breve, chiamatiNellaPartita, chiE, inCoda } from '../web/src/squadra.ts';
import { riduci, vistaVuota, type Vista } from '../web/src/stato.ts';

const chiamata = { agente: 'claude' as const, modello: 'finto', sessione: 's', secondi: 10, uso: { ingresso: 1, inCache: 0, uscita: 1 }, controllo: 'finto', tentativi: 1 };
const incarico = (id: string, assistente: string, stato: Incarico['stato'], extra: Partial<Incarico> = {}): Incarico => ({ id, assistente, da: 'claude', compito: `compito di ${assistente}`, stato, inizio: '2026-11-09T10:00:00Z', ...extra });
const turno = (indice: number, incarichi?: Incarico[]): Turno => ({
  indice, agente: indice % 2 ? 'claude' : 'codex',
  risposta: { messaggio: `intervento ${indice}`, stato: 'proposta', posizione: 'p', punti_aperti: [], cambi_di_posizione: [] },
  note: [], interventi: [], chiamata, ora: '2026-11-09T10:00:00Z', ...(incarichi ? { incarichi } : {}),
});
const dibattito = (turni: Turno[], extra: Partial<Dibattito> = {}): Dibattito => ({
  id: '20261109-1000-abcdef', creato: '2026-11-09T10:00:00Z', aggiornato: '2026-11-09T10:00:00Z',
  config: { domanda: 'prova', apre: 'claude', relatore: 'claude', claude: { modello: 'finto' }, codex: { ragionamento: 'medium' }, ricercaWeb: false, stallo: false, timeoutTurnoS: 60 },
  stato: 'in_corso', sessioni: {}, turni, interventi: [], daConsegnare: { claude: [], codex: [] }, chiamateFallite: [], ...extra,
});
const istantanea = (v: Vista, d: Dibattito, corrente?: Corrente | null) => riduci(v, { tipo: 'istantanea', dibattito: d, inCorso: true, corrente });

test('un assistente al lavoro nell\'istantanea: Claude e Codex non parlano al suo posto', () => {
  const d = dibattito([turno(1, [incarico('I1.1', 'ricerca', 'in_corso')])]);
  const c: Corrente = { agente: 'claude', ruolo: 'incarico', indice: 1, inizio: 1, fase: 'strumento', testo: '', azione: 'Cerca nelle note', strumento: 'vault', assistente: 'ricerca' };
  const v = istantanea(vistaVuota(), d, c);
  assert.equal(v.parlante, undefined);
  assert.deepEqual(v.fase, { claude: 'attesa', codex: 'attesa' });
  assert.equal(v.assistente?.id, 'ricerca');
  assert.equal(v.assistente?.compito, 'compito di ricerca');
  assert.equal(v.assistente?.azione?.testo, 'Cerca nelle note');
  assert.deepEqual(alLavoro(v).map((l) => [l.id, l.tipo, l.da]), [['ricerca', 'incarico', 'claude']]);
});

test('eventi incarico: comincia, lavora, consegna il rapporto (con l\'effetto per la scena)', () => {
  let v = istantanea(vistaVuota(), dibattito([turno(1, [incarico('I1.1', 'analisi', 'attesa')])]), null);
  v = riduci(v, { tipo: 'evento', evento: { tipo: 'incarico', turno: 1, incarico: incarico('I1.1', 'analisi', 'in_corso') } });
  assert.equal(v.assistente?.id, 'analisi');
  assert.equal(v.ruolo, 'incarico');
  v = riduci(v, { tipo: 'evento', evento: { tipo: 'attivita_assistente', assistente: 'analisi', fase: 'risposta', testo: 'Primo pezzo del rapporto```json' } });
  assert.equal(v.assistente?.testo, 'Primo pezzo del rapporto');
  v = riduci(v, { tipo: 'evento', evento: { tipo: 'incarico', turno: 1, incarico: incarico('I1.1', 'analisi', 'fatto', { rapporto: 'fatto' }) } });
  assert.equal(v.assistente, undefined);
  assert.ok(v.effetti.some((e) => e.tipo === 'rapporto' && e.assistente === 'analisi' && e.ok));
  // Comincia l'intervento dopo: nessun assistente resta al lavoro.
  v = riduci(v, { tipo: 'evento', evento: { tipo: 'incarico', turno: 1, incarico: incarico('I1.2', 'ricerca', 'in_corso') } });
  v = riduci(v, { tipo: 'evento', evento: { tipo: 'turno_inizio', agente: 'codex', ruolo: 'turno', indice: 2 } });
  assert.equal(v.assistente, undefined);
  assert.equal(v.parlante, 'codex');
});

test('produzione: il pacchetto in corso lavora; chi rivede i file si sa dagli eventi', () => {
  const pk = (assistente: string, stato: 'attesa' | 'in_corso' | 'fatto') => ({ titolo: `parte di ${assistente}`, assistente, obiettivo: 'o', stato, scritti: [] });
  const prod = (stato: 'in_lavorazione' | 'collaudo' | 'pronta', pacchetti: ReturnType<typeof pk>[]) => ({ stato, base: null, cantiere: 'c', inizio: 'i', file: [], chiamate: [], giro: 1, pacchetti });
  let v = istantanea(vistaVuota(), dibattito([], { stato: 'concluso', produzione: prod('in_lavorazione', [pk('testi', 'fatto'), pk('design', 'in_corso')]) }), null);
  assert.deepEqual(alLavoro(v).map((l) => [l.id, l.tipo, l.numero, l.di]), [['design', 'pacchetto', 2, 2]]);
  v = istantanea(v, dibattito([], { stato: 'concluso', produzione: prod('collaudo', [pk('testi', 'fatto'), pk('design', 'fatto')]) }), null);
  assert.deepEqual(alLavoro(v), []);
  v = riduci(v, { tipo: 'evento', evento: { tipo: 'attivita_assistente', assistente: 'controllo', fase: 'strumento', testo: 'Rivede i file prodotti', strumento: 'file' } });
  assert.deepEqual(alLavoro(v).map((l) => [l.id, l.tipo]), [['controllo', 'revisione']]);
  // Revisione salvata nella partita: ha finito.
  const fatta = { ...prod('collaudo', [pk('testi', 'fatto'), pk('design', 'fatto')]), revisioni: [{ giro: 1, assistente: 'controllo' }] };
  v = istantanea(v, dibattito([], { stato: 'concluso', produzione: fatta }), null);
  assert.deepEqual(alLavoro(v), []);
  v = istantanea(v, dibattito([], { stato: 'concluso', produzione: { ...fatta, stato: 'pronta' } }), null);
  assert.equal(v.assistente, undefined);
});

test('chiamati in ordine di prima chiamata, in coda solo nella riunione in corso', () => {
  const d = dibattito([
    turno(1, [incarico('I1.1', 'ricerca', 'fatto'), incarico('I1.2', 'architettura', 'fatto')]),
    turno(2, [incarico('I2.1', 'ricerca', 'in_corso'), incarico('I2.2', 'analisi', 'attesa')]),
  ], { produzione: { stato: 'in_lavorazione', base: null, cantiere: 'c', inizio: 'i', file: [], chiamate: [], pacchetti: [{ titolo: 't', assistente: 'sviluppo', obiettivo: 'o', stato: 'attesa', scritti: [] }], revisioni: [{ giro: 1, assistente: 'controllo' }] } });
  assert.deepEqual(chiamatiNellaPartita(d, 'guida'), ['ricerca', 'architettura', 'analisi', 'sviluppo', 'controllo', 'guida']);
  assert.deepEqual(inCoda(d).map((i) => i.assistente), ['analisi']);
  assert.deepEqual(inCoda({ ...d, stato: 'in_pausa' }), []);
});

test('nomi: dal catalogo, dagli standard se il catalogo non c\'è ancora, altrimenti l\'id', () => {
  assert.equal(chiE(undefined, 'ricerca').nome, 'Rita');
  assert.equal(chiE([], 'agente-mio').nome, 'agente-mio');
  assert.equal(breve('una frase abbastanza lunga da tagliare su una parola intera', 30), 'una frase abbastanza lunga…');
  assert.equal(breve('corta', 30), 'corta');
});

test('replay: ogni incarico eseguito passa da in coda a in corso a fatto, dopo il suo intervento', () => {
  const finale = dibattito([
    turno(1, [incarico('I1.1', 'ricerca', 'fatto', { rapporto: 'r1', chiamata }), incarico('I1.2', 'design', 'fallito', { errore: 'tempo scaduto' })]),
    turno(2),
  ], { stato: 'concluso', esito: 'accordo' });
  const passi = copioneReplay(finale);
  const eventi = passi.flatMap((p) => (p.azione.tipo === 'evento' ? [p.azione.evento] : []));
  const sequenza = eventi.filter((e) => e.tipo === 'incarico' || e.tipo === 'turno').map((e) => (e.tipo === 'turno' ? `T${e.turno.indice}` : `${e.incarico.id}:${e.incarico.stato}`));
  assert.deepEqual(sequenza, ['T1', 'I1.1:in_corso', 'I1.1:fatto', 'I1.2:in_corso', 'I1.2:fallito', 'T2']);
  // L'intervento arriva con gli incarichi ancora da fare, senza rapporto.
  const t1 = eventi.find((e) => e.tipo === 'turno');
  assert.ok(t1?.tipo === 'turno' && t1.turno.incarichi?.every((i) => i.stato === 'attesa' && !i.rapporto));
  // Eseguendo il copione, a un certo punto Rita lavora e i capi reparto aspettano.
  let v = vistaVuota();
  let vista: Vista | undefined;
  for (const p of passi) {
    v = riduci(v, p.azione);
    if (!vista && alLavoro(v).some((l) => l.id === 'ricerca')) vista = v;
  }
  assert.ok(vista, 'Rita non è mai al lavoro nel replay');
  assert.equal(vista.parlante, undefined);
  assert.equal(v.dibattito?.turni[0]?.incarichi?.[0]?.rapporto, 'r1');
});
