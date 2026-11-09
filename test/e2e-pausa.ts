// Prova vera (consuma un po' di quota): interrompe Claude a metà del secondo turno, aggiunge una
// nota dell'utente, riprende e porta il dibattito fino al documento finale.
//   node test/e2e-pausa.ts
import assert from 'node:assert/strict';
import { Motore } from '../motore/dibattito.ts';
import type { Evento } from '../motore/tipi.ts';

const m = new Motore();
const d0 = m.crea({
  domanda: 'Per i nomi dei file di un progetto personale meglio kebab-case o snake_case? Rispondete in breve.',
  maxRound: 2,
  claude: { modello: 'claude-haiku-5-5' },
  codex: { ragionamento: 'low' },
});
const id = d0.id;
console.log(`dibattito ${id}`);

let fermato = false;
let completati = 0;
m.on('evento', (_id: string, e: Evento) => {
  if (e.tipo === 'turno_inizio') console.log(`→ ${e.ruolo} ${e.indice} ${e.agente}`);
  if (e.tipo === 'turno') {
    completati++;
    console.log(`  ✓ ${e.turno.agente}: ${e.turno.risposta.stato} (${e.turno.chiamata.secondi} s, ${e.turno.interventi.length} note)`);
  }
  if (e.tipo === 'avviso' || e.tipo === 'errore') console.log(`  · ${'messaggio' in e ? e.messaggio : e.testo}`);
  // Ferma Claude mentre sta già lavorando al suo secondo intervento (turno 3): la sessione
  // esiste e contiene la domanda rimasta senza risposta.
  if (!fermato && completati === 2 && e.tipo === 'attivita' && e.agente === 'claude') {
    fermato = true;
    console.log('  ⏸ pausa durante il turno di Claude');
    m.pausa(id);
  }
});

const inPausa = await m.avvia(id);
assert.equal(inPausa.stato, 'in_pausa', `atteso in_pausa, stato ${inPausa.stato} ${inPausa.errore?.messaggio ?? ''}`);
assert.equal(inPausa.turni.length, 2);
assert.deepEqual(inPausa.turnoInterrotto, { indice: 3, agente: 'claude' });

assert.ok(m.intervieni(id, 'Il progetto contiene anche script Python.'));
const finale = await m.avvia(id);
assert.equal(finale.stato, 'concluso', finale.errore?.messaggio);
assert.deepEqual(finale.turni[2]!.interventi, ['Il progetto contiene anche script Python.']);
assert.deepEqual(finale.turni[3]!.interventi, ['Il progetto contiene anche script Python.']);
assert.ok(finale.sintesi && finale.verifica);
console.log(`\nesito: ${finale.esito} · sintesi ${finale.verifica.testo.approvata ? 'approvata' : 'non approvata'}`);
console.log(`documento: ${m.esportaMarkdown(id)}`);
console.log('PROVA OK');
