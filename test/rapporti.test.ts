// I rapporti d'errore: cosa contengono (solo campi fissi, ripuliti), quali errori diventano rapporti,
// la scelta dell'utente (chiedi, sempre, mai) e i limiti agli invii. Nessuna chiamata vera: l'invio
// è finto.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { RADICE } from '../motore/ambiente.ts';
import { Annullato, ErroreAgente } from '../motore/processo.ts';
import { componi, componiDaPagina, eDifetto, puntiDelCodice, pulisciTesto, Rapporti, type Contenuto } from '../motore/rapporti.ts';

const MANDATI = ['versione', 'sistema', 'node', 'dove', 'tipo', 'messaggio', 'stack', 'impronta'];

test('il messaggio perde percorsi (anche con spazi, relativi, di rete), testi citati, email e segreti', () => {
  const dati = join(tmpdir(), 'ambo-prova-dati');
  const casi = [
    `non trovo ${join(homedir(), 'OneDrive - Studio Rossi SA', 'Documenti', 'soci.md')}`,
    `cantiere ${join(dati, 'cantieri', 'Preventivo Rossi.pdf')}`,
    'D:\\Clienti\\Studio Rossi',
    'manca (../Clienti Rossi/offerta.md)',
    '\\\\nas\\Clienti Rossi\\contratti',
    '//nas.local/clienti/rossi/offerta.pdf',
    '/srv/progetti/Società Rossi/',
    'la cartella "Studio Rossi" non esiste più',
    'Unexpected token \'M\', "Mario Rossi, Lugano" is not valid JSON',
    'il titolo “Sito della pizzeria” e ‘Rossi’ e `Rossi` e «Rossi»',
    'scrivi a mario.rossi@esempio.ch',
    'token=sk-abcdefghijklmnopqrstuvwxyz0123',
  ];
  for (const caso of casi) {
    const t = pulisciTesto(caso, 300, dati);
    for (const via of ['Rossi', 'Mario', 'pizzeria', 'Clienti', 'clienti', 'Documenti', 'Preventivo', 'sk-abcdef']) assert.ok(!t.includes(via), `${caso} → ${t}`);
  }
  assert.equal(pulisciTesto("Cannot read properties of undefined (reading 'titolo')"), "Cannot read properties of undefined (reading 'titolo')", 'il nome della proprietà resta');
  assert.equal(pulisciTesto("errore nel leggere l'output della CLI"), "errore nel leggere l'output della CLI", 'gli apostrofi non sono virgolette');
  assert.match(pulisciTesto(`modulo ${join(RADICE, 'motore', 'server.ts')} rotto`), /<programma>[\\/]motore[\\/]server\.ts/, 'i file del programma restano riconoscibili');
  assert.equal(pulisciTesto('prima riga\nseconda riga con Rossi'), 'prima riga');
  assert.ok(pulisciTesto('x'.repeat(500)).length <= 300);
});

test('dallo stack restano solo i punti del codice del programma, non le righe del messaggio', () => {
  const stack = [
    'Error: no',
    '    at x (D:/Clienti/Rossi/web/src/PreventivoRossi.ts:3:9)',
    `    at Motore.rispondi (${join(RADICE, 'motore', 'dibattito.ts')}:120:15)`,
    `    at async lavora (file:///${join(RADICE, 'motore', 'produzione.ts').replace(/\\/g, '/')}:420:7)`,
    '    at Object.<anonymous> (C:\\Users\\utente\\altro\\x.js:1:1)',
    '    at node:internal/process/task_queues:95:5',
    'render@http://127.0.0.1:4317/assets/index-AbC123.js:12:3456',
    'brutto@chrome-extension://abc/src/x.js:1:1',
  ].join('\n');
  assert.deepEqual(puntiDelCodice(stack), [
    'Motore.rispondi motore/dibattito.ts:120:15',
    'lavora motore/produzione.ts:420:7',
    'render assets/index-AbC123.js:12:3456',
  ]);
  // Il programma in una cartella con un nome qualsiasi: resta solo il percorso relativo.
  assert.deepEqual(puntiDelCodice('E\n    at f (D:/strumenti/Cliente-Rossi/motore/dibattito.ts:1:2)', 'D:\\strumenti\\Cliente-Rossi'), ['f motore/dibattito.ts:1:2']);
});

test('diventano rapporti solo i difetti; gli errori delle CLI hanno un messaggio fisso', () => {
  for (const tipo of ['accesso', 'consumo', 'limite', 'sessione', 'strumento'] as const) assert.equal(eDifetto(new ErroreAgente('x', tipo, true)), false, tipo);
  assert.equal(eDifetto(new Annullato()), false);
  assert.equal(eDifetto(new ErroreAgente('formato cambiato', 'formato', false)), true);
  assert.equal(eDifetto(new TypeError('x is undefined')), true);
  const r = componi(new ErroreAgente('Claude ha scritto: "Ciao Mario Rossi, ecco il preventivo"', 'formato', false), 'riunione');
  assert.equal(r.messaggio, 'una CLI ha risposto in un formato che il programma non capisce');
  assert.equal(r.tipo, 'agente:formato');
});

test('il rapporto ha solo i campi fissi, e la stessa impronta per lo stesso difetto', () => {
  const a = componi(new RangeError('troppi pacchetti: 7'), 'produzione');
  const b = componi(new RangeError('troppi pacchetti: 9'), 'produzione');
  assert.match(a.versione, /^\d+\.\d+\.\d+$/);
  assert.equal(a.impronta, b.impronta);
  assert.notEqual(a.id, b.id);
  assert.equal(componiDaPagina({ messaggio: 'x' }), undefined, 'senza stack non si sa se è di Ambo');
  assert.equal(componiDaPagina({ messaggio: 'x', stack: 'f@chrome-extension://abc/x.js:1:1' }), undefined, 'un\'estensione non è Ambo');
  assert.equal(componiDaPagina({ tipo: 'TypeError', messaggio: 'x', stack: '    at f (http://127.0.0.1:4317/assets/index-a.js:1:2)' })!.dove, 'dashboard');
});

function prova(url: string | null = 'https://esempio.ch/rapporti', rete = true) {
  const dati = mkdtempSync(join(tmpdir(), 'ambo-rapporti-'));
  const mandati: Contenuto[] = [];
  const nuovo = () => new Rapporti(dati, async (_u, c) => { if (!rete) throw new Error('rete giù'); mandati.push(c); }, url);
  return { dati, mandati, nuovo };
}

test('di serie si chiede: il rapporto aspetta un sì, una volta sola per lo stesso difetto', async () => {
  const { mandati, nuovo } = prova();
  const r = nuovo();
  assert.equal(r.vista().scelta, 'chiedi');
  r.segnala(new TypeError('x is undefined'), 'server');
  r.segnala(new TypeError('x is undefined'), 'server');
  r.segnala(new ErroreAgente('non sei collegato', 'accesso', true), 'chat');
  assert.equal(r.vista().inAttesa.length, 1);
  assert.equal(mandati.length, 0, 'niente parte senza il sì');
  const id = r.vista().inAttesa[0]!.id;
  assert.equal(nuovo().vista().inAttesa.length, 1, 'resta in attesa anche dopo un riavvio');
  assert.equal(await r.manda(id), 'mandato');
  assert.deepEqual(Object.keys(mandati[0]!).sort(), [...MANDATI].sort(), 'id e ora restano sul PC');
  assert.equal(r.vista().inAttesa.length, 0);
});

test('se non parte resta in attesa; lo stesso difetto già partito non si rimanda', async () => {
  const giu = prova('https://esempio.ch/r', false);
  const r = giu.nuovo();
  r.segnala(new TypeError('a'), 'server');
  assert.equal(await r.manda(r.vista().inAttesa[0]!.id), 'errore');
  assert.equal(r.vista().inAttesa.length, 1, 'resta, per riprovare');

  const su = prova();
  const s = su.nuovo();
  s.segnala(new TypeError('b'), 'server');
  await s.manda(s.vista().inAttesa[0]!.id);
  const t = su.nuovo();
  t.segnala(new TypeError('b'), 'server');
  assert.equal(await t.manda(t.vista().inAttesa[0]!.id), 'gia', 'anche dopo un riavvio');
  assert.equal(su.mandati.length, 1);
});

test('"sempre" manda da solo, con i limiti anche dopo un riavvio; "mai" non tiene niente', async () => {
  const { mandati, nuovo } = prova();
  const r = nuovo();
  r.segnala(new TypeError('primo'), 'server');
  await r.manda(r.vista().inAttesa[0]!.id, true);
  assert.equal(nuovo().vista().scelta, 'sempre', 'la scelta resta');
  for (let i = 0; i < 15; i++) r.segnala(new Error(`numero ${'x'.repeat(i)}`), 'produzione');
  await new Promise((ok) => setTimeout(ok, 20));
  const dopo = nuovo();
  for (let i = 15; i < 30; i++) dopo.segnala(new Error(`numero ${'x'.repeat(i)}`), 'produzione');
  await new Promise((ok) => setTimeout(ok, 20));
  assert.equal(mandati.length, 20, 'al massimo 20 al giorno, anche riavviando');

  dopo.scegli('mai');
  dopo.segnala(new TypeError('dopo il mai'), 'server');
  assert.equal(dopo.vista().inAttesa.length, 0);
});

test('un file dei rapporti toccato a mano: le voci sbagliate si scartano e i campi in più non partono', async () => {
  const { dati, mandati, nuovo } = prova();
  const buono = componi(new TypeError('x'), 'server');
  writeFileSync(join(dati, 'rapporti.json'), JSON.stringify({ scelta: 'chiedi', inAttesa: [{ ...buono, chat: 'Ciao Mario' }, { id: 'zz', stack: 'no' }] }));
  const r = nuovo();
  assert.equal(r.vista().inAttesa.length, 1);
  await r.manda(buono.id);
  assert.deepEqual(Object.keys(mandati[0]!).sort(), [...MANDATI].sort());
  assert.ok(!readFileSync(join(dati, 'rapporti.json'), 'utf8').includes('Mario'));
});

test('spenti con AMBO_RAPPORTI_URL=0: niente in attesa, niente invii, e un errore nel rapporto non rompe niente', async () => {
  const { mandati, nuovo } = prova(null);
  const r = nuovo();
  r.segnala(new TypeError('x'), 'server');
  assert.deepEqual(r.vista(), { attivi: false, scelta: 'chiedi', inAttesa: [] });
  assert.equal(mandati.length, 0);
  const giu = prova('https://esempio.ch/r', false).nuovo();
  giu.scegli('sempre');
  assert.doesNotThrow(() => giu.segnala(new TypeError('x'), 'server'));
  await new Promise((ok) => setTimeout(ok, 20));
});
