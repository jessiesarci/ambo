// La pianta della scena: dove riprende un omino quando gli cambia il percorso.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ripresa, type Punto } from '../web/src/scena/pianta.ts';

test('ripresa: da fermo prima del primo punto si passa dal primo punto (non si taglia l\'angolo)', () => {
  // Il fattorino da casa verso la stampante: saltare il primo punto lo faceva passare nel muro.
  const percorso: Punto[] = [[-2.2, 4.3], [-0.6, 4.3], [0.9, -1], [1.2, -5.6], [2.2, -6.3]];
  assert.equal(ripresa([-3.2, 5.6], percorso), 0);
});

test('ripresa: a metà di un tratto si va verso la sua fine, non indietro', () => {
  const percorso: Punto[] = [[0, 0], [0, -4], [4, -4]];
  assert.equal(ripresa([0, -2], percorso), 1);
  assert.equal(ripresa([2, -4], percorso), 2);
});

// --- reparti, posti e catena di montaggio ---------------------------------------------------
import type { Produzione, Procedura } from '../motore/tipi.ts';
import { assegnaPosti, repartoDi, revisoriDi, statoCatena } from '../web/src/scena/reparti.ts';
import { percorso, POSTI_COLLAUDO, REPARTO, rivoltoVerso, sedile } from '../web/src/scena/pianta.ts';

const procMia: Procedura = { id: 'sito-veloce', nome: 'Sito veloce', quando: 'siti', fonte: 'utente', passi: [{ assistente: 'mio-architetto', fase: 'piano' }, { assistente: 'mio-costruttore', fase: 'produzione' }, { assistente: 'mio-collaudatore', fase: 'collaudo' }] };

test('reparti: i 7 di serie al loro reparto, gli agenti dell\'utente dal ruolo, dalla procedura o dalla produzione', () => {
  assert.equal(repartoDi({ id: 'analisi' }), 'ricerca');
  assert.equal(repartoDi({ id: 'design' }), 'progettazione');
  assert.equal(repartoDi({ id: 'controllo' }), 'qualita');
  assert.equal(repartoDi({ id: 'mio-collaudatore', fonte: 'utente', produzione: false }, [procMia]), 'qualita');
  assert.equal(repartoDi({ id: 'mio-costruttore', fonte: 'utente', produzione: true }, [procMia]), 'sviluppo');
  assert.equal(repartoDi({ id: 'guida-accessibilita', fonte: 'utente', descrizione: 'Controlla pagine e interfacce secondo le WCAG' }), 'qualita');
  assert.equal(repartoDi({ id: 'mio-architetto', fonte: 'utente', descrizione: 'Pianifica in un colpo: specifiche, mappa del sito, token di design' }, [procMia]), 'progettazione');
  assert.equal(repartoDi({ id: 'copywriter', fonte: 'utente', descrizione: 'Scrive i testi delle pagine' }), 'contenuti');
  assert.equal(repartoDi({ id: 'misterioso', fonte: 'utente', descrizione: 'Fa cose' }), 'ospiti');
});

test('posti: i 7 di serie hanno il loro, gli altri non li prendono, chi non ci sta va dagli ospiti', () => {
  const reparto = (id: string) => (id.startsWith('qa-') ? 'qualita' as const : repartoDi({ id }));
  const p = assegnaPosti(['qa-1', 'controllo', 'qa-2', 'qa-3', 'qa-4', 'qa-5', 'qa-6', 'ricerca'], reparto);
  assert.deepEqual(p.get('controllo'), { reparto: 'qualita', indice: 0 });
  assert.deepEqual(p.get('qa-1'), { reparto: 'qualita', indice: 1 });
  assert.deepEqual(p.get('ricerca'), { reparto: 'ricerca', indice: 0 });
  // Qualità ha 6 posti, uno è di Nadia: il sesto agente di collaudo va dagli ospiti.
  assert.equal(p.get('qa-5')?.reparto, 'qualita');
  assert.equal(p.get('qa-6')?.reparto, 'ospiti');
});

const prod = (x: Partial<Produzione>): Produzione => ({ stato: 'in_lavorazione', base: null, cantiere: 'c', inizio: '', file: [], chiamate: [], ...x });
const pk = (assistente: string, stato: 'attesa' | 'in_corso' | 'fatto' | 'fallito') => ({ titolo: `parte di ${assistente}`, assistente, obiettivo: '', stato, scritti: [] });

test('catena: la scatola sta alla stazione vera e ognuno alla sua postazione', () => {
  const c1 = statoCatena(prod({ pacchetti: [pk('testi', 'fatto'), pk('design', 'in_corso'), pk('sviluppo', 'attesa')] }), undefined, []);
  assert.deepEqual(c1.scatola, { stazione: 2, indice: 1, tono: 'lavoro' });
  assert.deepEqual(c1.posti.get('design'), { dove: 'costruzione', indice: 1 });
  assert.equal(c1.lavora?.id, 'design');
  assert.equal(c1.codex, false);

  const c2 = statoCatena(prod({ stato: 'collaudo', procedura: 'sito-veloce', pacchetti: [pk('mio-costruttore', 'fatto')] }), undefined, revisoriDi(prod({ procedura: 'sito-veloce' }), [procMia]));
  assert.equal(c2.scatola?.stazione, 3);
  assert.equal(c2.codex, true);
  assert.deepEqual(c2.posti.get('mio-collaudatore'), { dove: 'collaudo', indice: 1 });

  const c3 = statoCatena(prod({ giro: 2, pacchetti: [pk('sviluppo', 'fatto')] }), { id: 'sviluppo', dove: 'produzione' }, []);
  assert.equal(c3.scatola?.stazione, 4);
  assert.deepEqual(c3.posti.get('sviluppo'), { dove: 'correzioni', indice: 0 });
  assert.equal(c3.correzioni, true);

  const c4 = statoCatena(prod({ stato: 'pronta', collaudo: { approvato: true, problemi: [], commento: '' }, pacchetti: [pk('sviluppo', 'fatto')] }), undefined, []);
  assert.deepEqual(c4.scatola, { stazione: 5, tono: 'pronta' });
  assert.equal(c4.posti.size, 0);

  // Le produzioni di prima della squadra: un solo pacchetto di Paolo.
  const c5 = statoCatena(prod({}), undefined, []);
  assert.equal(c5.pacchetti.length, 1);
  assert.equal(c5.pacchetti[0]!.assistente, 'sviluppo');
});

test('pianta: sedie e divani guardano chi devono, Codex arriva al collaudo passando dall\'uscio', () => {
  // Il kit ha il fronte verso -z: rotazione 0 guarda a nord.
  assert.equal(Math.abs(rivoltoVerso(0, -1)), 0);
  assert.equal(rivoltoVerso(-1, 0), Math.PI / 2); // guarda a ovest
  const s = sedile({ punto: [0, 0], rotazione: 0 });
  assert.deepEqual(s.punto.map((x) => Math.round(x * 100) / 100), [0, 0.82]);
  assert.equal(s.verso, Math.PI);
  assert.equal(REPARTO.direzione.scrivanie.length, 2);
  const via = percorso('codex', 'tavolo', 'collaudo');
  assert.ok(via.some(([x, z]) => x === 11.9 && z === -6.3), 'passa dall\'uscio della porta nord');
  assert.deepEqual(via.at(-1), [-12.4, 6.1]);
  assert.deepEqual(percorso('codex', 'collaudo', 'scrivania').at(-1), [11.9, -6.3]);
  assert.deepEqual(percorso('claude', 'tavolo', 'centro'), [[6.9, -4.15]]);
  assert.ok(POSTI_COLLAUDO.length >= 4);
});

// --- correzioni dopo la revisione dell'ufficio a reparti -------------------------------------
import type { Dibattito } from '../motore/tipi.ts';
import { faseProduzione, riunioneAperta } from '../web/src/scena/reparti.ts';
import { riduci, vistaVuota, type Vista } from '../web/src/stato.ts';

const collaudo = (problemi: string[]) => ({ approvato: false, problemi, commento: '' });

test('riunione: un errore in sintesi o in verifica (esito già scritto) la tiene aperta', () => {
  const d = { config: { domanda: 'x' }, stato: 'errore', esito: 'accordo', turni: [] } as unknown as Dibattito;
  assert.equal(riunioneAperta(d), true);
  assert.equal(riunioneAperta({ ...d, stato: 'concluso' }), false);
  assert.equal(riunioneAperta({ ...d, config: { domanda: 'x', tipo: 'chat' } } as Dibattito), false);
});

test('catena ferma: la scatola resta alla fase in cui si è fermata, il vecchio formato non segna fatto', () => {
  const giri = [{ giro: 1, resoconto: 'primo', collaudo: collaudo(['a']) }];
  // Fermata durante la correzione: il resoconto è ancora quello respinto.
  const corr = prod({ stato: 'fermata', giro: 2, giri, resoconto: 'primo', pacchetti: [pk('sviluppo', 'fatto')] });
  assert.equal(faseProduzione(corr), 'correzioni');
  assert.deepEqual(statoCatena(corr, undefined, []).scatola, { stazione: 4, tono: 'ferma' });
  // In errore nel collaudo dopo la correzione: il resoconto è già quello nuovo.
  const coll = prod({ stato: 'errore', giro: 2, giri, resoconto: 'corretto', pacchetti: [pk('sviluppo', 'fatto')] });
  assert.equal(faseProduzione(coll), 'collaudo');
  assert.deepEqual(statoCatena(coll, undefined, []).scatola, { stazione: 3, tono: 'errore' });
  assert.equal(faseProduzione(prod({ stato: 'fermata', giro: 1 })), 'collaudo');
  // Fermata a metà costruzione: il pacchetto fermato è segnato fallito, la scatola resta lì.
  assert.deepEqual(statoCatena(prod({ stato: 'fermata', pacchetti: [pk('testi', 'fatto'), pk('sviluppo', 'fallito')] }), undefined, []).scatola, { stazione: 2, indice: 1, tono: 'ferma' });
  // Le produzioni di prima della squadra: fermata in costruzione non è "fatto".
  const vecchia = statoCatena(prod({ stato: 'fermata' }), undefined, []);
  assert.equal(vecchia.pacchetti[0]!.stato, 'fallito');
  assert.deepEqual(vecchia.scatola, { stazione: 2, indice: 0, tono: 'ferma' });
  assert.equal(statoCatena(prod({ stato: 'errore', giro: 1, resoconto: 'r' }), undefined, []).pacchetti[0]!.stato, 'fatto');
});

test('catena: alle correzioni siede solo un costruttore, non il revisore rimasto dal collaudo', () => {
  const p = prod({ giro: 2, giri: [{ giro: 1, resoconto: 'r', collaudo: collaudo(['a']) }], resoconto: 'r', pacchetti: [pk('testi', 'fatto'), pk('sviluppo', 'fatto')] });
  const conRevisore = statoCatena(p, { id: 'controllo', dove: 'produzione' }, ['controllo']);
  assert.equal(conRevisore.posti.get('controllo'), undefined);
  assert.equal(conRevisore.lavora, undefined);
  assert.deepEqual(conRevisore.scatola, { stazione: 4, tono: 'lavoro' });
  const conCostruttore = statoCatena(p, { id: 'testi', dove: 'produzione' }, ['controllo']);
  assert.deepEqual(conCostruttore.posti.get('testi'), { dove: 'correzioni', indice: 0 });
  assert.equal(conCostruttore.lavora?.id, 'testi');
});

test('stato: cambiando fase la produzione lascia andare l\'assistente della fase prima', () => {
  const d = { id: 'p', config: { domanda: 'x' }, stato: 'concluso', turni: [], chiamateFallite: [], produzione: prod({ stato: 'in_lavorazione', pacchetti: [pk('sviluppo', 'fatto')] }) } as unknown as Dibattito;
  const v: Vista = { ...vistaVuota(), dibattito: d, assistente: { id: 'sviluppo', dove: 'produzione', fase: 'strumento', testo: '', da: 0 } };
  // Stessa fase (un aggiornamento qualsiasi): resta.
  assert.equal(riduci(v, { tipo: 'evento', evento: { tipo: 'produzione', stato: 'in_lavorazione', testo: 'scrive' } }).assistente?.id, 'sviluppo');
  // Dalla costruzione al collaudo: l'ultimo costruttore non lavora più.
  assert.equal(riduci(v, { tipo: 'evento', evento: { tipo: 'produzione', stato: 'collaudo', testo: 'collaudo di Codex' } }).assistente, undefined);
  // Dal collaudo alla correzione: il revisore non passa alla scrivania delle correzioni.
  const inCollaudo: Vista = { ...v, dibattito: { ...d, produzione: prod({ stato: 'collaudo', giro: 1 }) }, assistente: { id: 'controllo', dove: 'produzione', fase: 'strumento', testo: '', da: 0 } };
  assert.equal(riduci(inCollaudo, { tipo: 'evento', evento: { tipo: 'produzione', stato: 'in_lavorazione', testo: 'corregge' } }).assistente, undefined);
});
