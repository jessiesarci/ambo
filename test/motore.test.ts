// Logica del motore con agenti finti: nessuna chiamata vera, nessuna quota consumata.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { creaDossierDa } from '../motore/cartelle.ts';
import { attivo, riassunto } from '../motore/comandi.ts';
import { Motore, statoAParole, type ChiamaAgente, type ConfigInput } from '../motore/dibattito.ts';
import { ultimoBloccoJson } from '../motore/formato.ts';
import { inMarkdown } from '../motore/markdown.ts';
import { ambientePulito, Annullato } from '../motore/processo.ts';
import type { Operai } from '../motore/produzione.ts';
import { MAX_INTERVENTI_RIUNIONE } from '../motore/prompt.ts';
import type { Agente, Dibattito, Evento } from '../motore/tipi.ts';

type Passo = (prompt: string, op: Parameters<ChiamaAgente>[0]) => string | Promise<string>;

function finto(copione: Record<Agente, Passo[]>) {
  const prompt: Record<Agente, string[]> = { claude: [], codex: [] };
  const chiamaAgente: ChiamaAgente = async (op) => {
    if (op.tipo === 'incarico') throw new Error('incarico non previsto in questo test');
    prompt[op.agente].push(op.prompt);
    const passo = copione[op.agente].shift();
    if (!passo) throw new Error(`copione finito per ${op.agente}`);
    const testo = await passo(op.prompt, op);
    return { testo, sessione: op.sessione ?? `sessione-${op.agente}`, modello: 'finto', uso: { ingresso: 10, inCache: 2, uscita: 5 }, secondi: 0.1, controllo: 'finto' };
  };
  return { chiamaAgente, prompt };
}

const dichiarazione = (stato: string, punti: string[] = [], cambi: string[] = []) => ({ stato, posizione: `posizione ${stato}`, punti_aperti: punti, cambi_di_posizione: cambi, incarichi: [] });
const claude = (stato: string, punti?: string[], cambi?: string[]): Passo => () =>
  `Intervento di Claude (${stato}).\n\n\`\`\`json\n${JSON.stringify(dichiarazione(stato, punti, cambi))}\n\`\`\``;
const codex = (stato: string, punti?: string[], cambi?: string[]): Passo => () =>
  JSON.stringify({ messaggio: `Intervento di Codex (${stato}).`, ...dichiarazione(stato, punti, cambi) });
const sintesi: Passo = () => '```json\n' + JSON.stringify({ conclusione: 'Conclusione.', motivazioni: ['m'], decisioni: ['d'], disaccordi: [], prossimi_passi: ['p'], pacchetti: [], procedura: 'su-misura' }) + '\n```';
const verifica = (approvata: boolean): Passo => () => JSON.stringify({ approvata, correzioni: approvata ? [] : ['manca un punto'], disaccordi_mancanti: [], commento: 'visto' });
const bloccato: Passo = (_p, op) => new Promise((_, rifiuta) => op.signal.addEventListener('abort', () => rifiuta(new Annullato()), { once: true }));

const accessiOk = async () => ({ claude: { ok: true, dettaglio: 'finto' }, codex: { ok: true, dettaglio: 'finto' } });

function nuovoMotore(chiamaAgente: ChiamaAgente, verificaAccessi = accessiOk) {
  return new Motore({ cartellaDati: mkdtempSync(join(tmpdir(), 'debate-test-')), chiamaAgente, verificaAccessi });
}

const base = (extra: Partial<ConfigInput> = {}): ConfigInput => ({ domanda: 'Tab o spazi?', codex: { modello: 'finto' }, ...extra });

test('piano pronto: due accordi pieni di fila chiudono la riunione, senza round, poi sintesi e verifica', async () => {
  const f = finto({
    claude: [claude('proposta'), claude('accordo'), sintesi],
    codex: [codex('accordo_parziale', ['indentazione mista']), codex('accordo'), verifica(true)],
  });
  const m = nuovoMotore(f.chiamaAgente);
  const d = await m.avvia(m.crea(base()).id);
  assert.equal(d.stato, 'concluso');
  assert.equal(d.esito, 'accordo');
  assert.match(d.motivoEsito!, /il piano è pronto/);
  assert.equal(d.turni.length, 4);
  assert.deepEqual(d.turni.map((t) => t.agente), ['claude', 'codex', 'claude', 'codex']);
  assert.ok(d.turni.every((t) => t.round === undefined), 'gli interventi non hanno più un round');
  assert.equal(d.verifica?.testo.approvata, true);
  // Codex riceve l'intervento integrale di Claude, la squadra e, alla fine, l'accordo di Claude.
  assert.match(f.prompt.codex[0]!, /=== CLAUDE \(intervento 1\) ===/);
  assert.match(f.prompt.codex[0]!, /Intervento di Claude \(proposta\)/);
  assert.match(f.prompt.codex[0]!, /OBIETTIVO dell\'utente/);
  assert.match(f.prompt.codex[0]!, /INSIEME verso l'obiettivo/);
  assert.match(f.prompt.codex[0]!, /due capi reparto di questa riunione di pianificazione/);
  assert.match(f.prompt.codex[0]!, /LA SQUADRA[\s\S]*- ricerca: Rita[\s\S]*PROCEDURE[\s\S]*sito-web[\s\S]*INCARICHI/);
  assert.match(f.prompt.codex[0]!, /Migliora il piano/);
  assert.match(f.prompt.codex[1]!, /dichiara accordo pieno/);
  assert.doesNotMatch(f.prompt.codex[1]!, /OBIETTIVO dell\'utente/, 'dal secondo intervento la sessione ricorda l\'obiettivo');
  for (const p of [...f.prompt.claude, ...f.prompt.codex]) {
    assert.doesNotMatch(p, /\bround\b/i, 'agli agenti non si parla di round');
    assert.doesNotMatch(p, /Chiudete adesso/, 'il limite di sicurezza non si annuncia prima dell\'ultimo intervento');
  }
  const md = inMarkdown(d);
  assert.match(md, /Accordo raggiunto/);
  assert.match(md, /\*\*Riunione:\*\* 4 interventi/);
  assert.match(md, /### Intervento 1 · Claude/);
  assert.match(md, /approvata da Codex/);
  assert.match(md, /## Trascrizione integrale/);
  assert.doesNotMatch(md, /round/i);
});

test('accordo con punti aperti vale come accordo parziale: la riunione continua finché non è pieno', async () => {
  const f = finto({
    claude: [claude('proposta'), claude('accordo'), sintesi],
    codex: [codex('accordo', ['manca il caso Python']), codex('accordo'), verifica(false)],
  });
  const m = nuovoMotore(f.chiamaAgente);
  const d = await m.avvia(m.crea(base()).id);
  assert.equal(d.turni[1]!.risposta.stato, 'accordo_parziale');
  assert.match(d.turni[1]!.note[0]!, /accordo parziale/);
  assert.equal(d.esito, 'accordo');
  assert.equal(d.turni.length, 4);
  const md = inMarkdown(d);
  assert.match(md, /\*\*non approvata\*\* da Codex/);
  assert.match(md, /manca un punto/);
});

test('limite di sicurezza: senza accordo la riunione chiude dopo 16 interventi, e lo dice solo all\'ultimo', async () => {
  assert.equal(MAX_INTERVENTI_RIUNIONE, 16);
  const meta = MAX_INTERVENTI_RIUNIONE / 2;
  // L'ultimo (di Codex) chiede anche un incarico: non si esegue, la riunione si chiude.
  const ultimo: Passo = () => JSON.stringify({ messaggio: 'Chiudo.', ...dichiarazione('accordo_parziale', ['x']), incarichi: [{ assistente: 'ricerca', compito: 'Controlla una cosa' }] });
  const f = finto({
    claude: [claude('proposta'), ...Array.from({ length: meta - 1 }, () => claude('accordo_parziale', ['y'])), sintesi],
    codex: [...Array.from({ length: meta - 1 }, () => codex('accordo_parziale', ['x'])), ultimo, verifica(true)],
  });
  const m = nuovoMotore(f.chiamaAgente);
  const d = await m.avvia(m.crea(base()).id);
  assert.equal(d.esito, 'limite');
  assert.equal(d.turni.length, MAX_INTERVENTI_RIUNIONE);
  assert.match(d.motivoEsito!, /limite di sicurezza di 16 interventi/);
  assert.match(f.prompt.codex.at(-2)!, /Chiudete adesso/, 'il 16° intervento sa che è l\'ultimo');
  assert.doesNotMatch(f.prompt.claude.at(-2)!, /Chiudete adesso/, 'il 15° no');
  assert.equal(d.turni.at(-1)!.incarichi, undefined);
  assert.match(d.turni.at(-1)!.note.join(' '), /ultimo intervento: non eseguiti/);
  assert.match(inMarkdown(d), /Chiusa al limite di sicurezza/);
});

test('stallo: solo nel confronto critico, quattro disaccordi di fila senza cambi di posizione', async () => {
  const f = finto({
    claude: [claude('proposta'), claude('disaccordo'), claude('disaccordo'), sintesi],
    codex: [codex('disaccordo'), codex('disaccordo'), verifica(true)],
  });
  const m = nuovoMotore(f.chiamaAgente);
  const d = await m.avvia(m.crea(base({ modo: 'confronto' })).id);
  assert.equal(d.esito, 'stallo');
  assert.equal(d.turni.length, 5);

  // Lavorando insieme lo stallo non chiude: si va avanti fino all'accordo.
  const g = finto({
    claude: [claude('proposta'), claude('disaccordo'), claude('disaccordo'), claude('accordo'), sintesi],
    codex: [codex('disaccordo'), codex('disaccordo'), codex('accordo'), verifica(true)],
  });
  const m2 = nuovoMotore(g.chiamaAgente);
  const d2 = await m2.avvia(m2.crea(base()).id);
  assert.equal(d2.esito, 'accordo');
  assert.equal(d2.turni.length, 7);
});

test('un cambio di posizione rimanda lo stallo', async () => {
  const f = finto({
    claude: [claude('proposta'), claude('disaccordo', [], ['accetto i tab per Go']), claude('disaccordo'), claude('disaccordo'), sintesi],
    codex: [codex('disaccordo'), codex('disaccordo'), codex('disaccordo'), verifica(true)],
  });
  const m = nuovoMotore(f.chiamaAgente);
  const d = await m.avvia(m.crea(base({ modo: 'confronto' })).id);
  assert.equal(d.esito, 'stallo');
  assert.equal(d.turni.length, 7, 'con il cambio al terzo intervento lo stallo arriva solo al settimo');
});

test('blocco json mancante: si chiede solo il blocco e si tiene il messaggio già scritto', async () => {
  const f = finto({
    claude: [() => 'Propongo gli spazi, quattro.', () => '```json\n' + JSON.stringify(dichiarazione('proposta')) + '\n```', claude('accordo'), sintesi],
    codex: [codex('accordo'), codex('accordo'), verifica(true)],
  });
  const m = nuovoMotore(f.chiamaAgente);
  const d = await m.avvia(m.crea(base()).id);
  assert.equal(d.turni[0]!.risposta.messaggio, 'Propongo gli spazi, quattro.');
  assert.equal(d.turni[0]!.chiamata.tentativi, 2);
  assert.match(f.prompt.claude[1]!, /Non riscrivere il messaggio[\s\S]*incarichi/);
  assert.equal(d.esito, 'accordo');
});

test('pausa a metà intervento, nota dell\'utente, ripresa: la nota arriva a tutti e due', async () => {
  const f = finto({
    claude: [claude('proposta'), claude('accordo'), sintesi],
    codex: [bloccato, codex('accordo_parziale', ['x']), codex('accordo'), verifica(true)],
  });
  const m = nuovoMotore(f.chiamaAgente);
  const { id } = m.crea(base());
  m.on('evento', (_id: string, e: Evento) => {
    if (e.tipo === 'turno_inizio' && e.agente === 'codex' && e.indice === 2 && f.prompt.codex.length === 0) setImmediate(() => m.pausa(id));
  });
  const fermo = await m.avvia(id);
  assert.equal(fermo.stato, 'in_pausa');
  assert.equal(fermo.turni.length, 1);

  assert.ok(m.intervieni(id, 'Considerate anche i file YAML.'));
  const d = await m.avvia(id);
  assert.equal(d.stato, 'concluso');
  assert.deepEqual(d.turni[1]!.interventi, ['Considerate anche i file YAML.']);
  assert.deepEqual(d.turni[2]!.interventi, ['Considerate anche i file YAML.']);
  assert.equal(d.turni[3]!.interventi.length, 0, 'la nota si consegna una volta sola');
  assert.match(f.prompt.codex[1]!, /NOTA DEL MODERATORE[\s\S]*YAML/);
  assert.match(f.prompt.claude[1]!, /NOTA DEL MODERATORE[\s\S]*YAML/);
});

test('concludi durante un intervento: niente accordo inventato, sintesi sugli interventi completati', async () => {
  const f = finto({
    claude: [claude('proposta'), bloccato, sintesi],
    codex: [codex('disaccordo'), verifica(true)],
  });
  const m = nuovoMotore(f.chiamaAgente);
  const { id } = m.crea(base());
  m.on('evento', (_id: string, e: Evento) => {
    if (e.tipo === 'turno_inizio' && e.indice === 3) setImmediate(() => m.concludi(id));
  });
  const d = await m.avvia(id);
  assert.equal(d.esito, 'chiuso_da_utente');
  assert.equal(d.turni.length, 2);
  assert.equal(d.stato, 'concluso');
  assert.ok(d.sintesi && d.verifica);
});

test("senza abbonamento collegato la riunione non parte", async () => {
  const f = finto({ claude: [], codex: [] });
  const m = nuovoMotore(f.chiamaAgente, async () => ({ claude: { ok: false, dettaglio: 'Claude Code usa una chiave API' }, codex: { ok: true, dettaglio: 'ok' } }));
  const d = await m.avvia(m.crea(base()).id);
  assert.equal(d.stato, 'errore');
  assert.match(d.errore!.messaggio, /chiave API/);
  assert.equal(f.prompt.claude.length + f.prompt.codex.length, 0);
});

test('errore generico: un solo nuovo tentativo, poi errore recuperabile', async () => {
  const guasto: Passo = () => { throw new Error('rete giù'); };
  const f = finto({ claude: [guasto, guasto], codex: [] });
  const m = nuovoMotore(f.chiamaAgente);
  const d = await m.avvia(m.crea(base()).id);
  assert.equal(d.stato, 'errore');
  assert.equal(d.errore!.recuperabile, true);
  assert.equal(d.chiamateFallite.length, 2);
});

test('al riavvio una riunione rimasta in corso va in pausa e non riparte da sola', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'debate-test-'));
  const f = finto({ claude: [claude('proposta')], codex: [bloccato] });
  const m = new Motore({ cartellaDati: cartella, chiamaAgente: f.chiamaAgente, verificaAccessi: accessiOk });
  const { id } = m.crea(base());
  m.on('evento', (_id: string, e: Evento) => {
    if (e.tipo === 'turno_inizio' && e.indice === 2) setImmediate(() => {
      // Simula un crash: lo stato su disco resta "in_corso" e un motore nuovo lo trova così.
      const nuovo = new Motore({ cartellaDati: cartella, chiamaAgente: f.chiamaAgente, verificaAccessi: accessiOk });
      assert.equal(nuovo.carica(id)?.stato, 'in_corso');
      assert.deepEqual(nuovo.recuperaInterrotti(), [id]);
      assert.equal(nuovo.carica(id)?.stato, 'in_pausa');
      assert.equal(nuovo.idAttivi().length, 0);
      m.pausa(id);
    });
  });
  await m.avvia(id);
});

test('ultimoBloccoJson prende l\'ultimo blocco e lascia il resto come messaggio', () => {
  const t = 'Esempio:\n```json\n{"a":1}\n```\nPoi altro.\n\n```json\n{"stato":"accordo"}\n```\n';
  const r = ultimoBloccoJson(t);
  assert.equal(r.json?.trim(), '{"stato":"accordo"}');
  assert.match(r.prima, /Poi altro\./);
  assert.equal(ultimoBloccoJson('Testo {non json} e poi {"x": [1, 2]}').json, '{"x": [1, 2]}');
});

test('config: maxRound di una dashboard vecchia si ignora, nomi dei modelli controllati', () => {
  const m = nuovoMotore(finto({ claude: [], codex: [] }).chiamaAgente);
  const d = m.crea({ ...base(), maxRound: 3 } as ConfigInput);
  assert.equal('maxRound' in d.config, false);
  assert.throws(() => m.crea(base({ claude: { modello: 'x; rm -rf' } })), /modello/);
  assert.throws(() => m.crea({ domanda: '   ' }), /vuota/);
});

test('partita vecchia, salvata con i round e l\'esito limite_round: si carica e si mostra ancora', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'debate-test-'));
  const chiamata = { agente: 'claude', modello: 'finto', sessione: 's-1', secondi: 1, uso: { ingresso: 1, inCache: 0, uscita: 1 }, controllo: 'finto', tentativi: 1 };
  const risposta = { messaggio: 'Tab.', stato: 'proposta', posizione: 'tab', punti_aperti: [], cambi_di_posizione: [] };
  const vecchia = {
    id: '20261101-1200-abcdef', creato: '2026-11-01T12:00:00.000Z', aggiornato: '2026-11-01T12:10:00.000Z',
    config: { domanda: 'Tab o spazi?', maxRound: 1, apre: 'claude', relatore: 'claude', claude: { modello: 'finto' }, codex: { modello: 'finto', ragionamento: 'medium' }, ricercaWeb: false, stallo: true, timeoutTurnoS: 600, memoria: false, modo: 'insieme' },
    stato: 'concluso', sessioni: { claude: 's-1', codex: 's-2' },
    turni: [
      { indice: 1, round: 1, agente: 'claude', risposta, note: [], interventi: [], chiamata, ora: '2026-11-01T12:01:00.000Z' },
      { indice: 2, round: 1, agente: 'codex', risposta: { ...risposta, stato: 'accordo_parziale', punti_aperti: ['x'] }, note: [], interventi: [], chiamata: { ...chiamata, agente: 'codex', sessione: 's-2' }, ora: '2026-11-01T12:02:00.000Z' },
    ],
    interventi: [], daConsegnare: { claude: [], codex: [] }, chiamateFallite: [],
    esito: 'limite_round', motivoEsito: 'Raggiunto il massimo di 1 round senza due dichiarazioni di accordo pieno consecutive.',
    sintesi: { relatore: 'claude', testo: { conclusione: 'Tab.', motivazioni: [], decisioni: [], disaccordi: [], prossimi_passi: [] }, chiamata },
    verifica: { revisore: 'codex', testo: { approvata: true, correzioni: [], disaccordi_mancanti: [], commento: 'ok' }, chiamata: { ...chiamata, agente: 'codex' } },
    produzione: { stato: 'pronta', base: null, cantiere: join(cartella, 'cantieri', 'x'), inizio: '2026-11-01T12:20:00.000Z', file: [], resoconto: 'Fatto.', collaudo: { approvato: true, problemi: [], commento: 'ok' }, chiamate: [chiamata] },
  };
  mkdirSync(join(cartella, 'dibattiti'), { recursive: true });
  writeFileSync(join(cartella, 'dibattiti', `${vecchia.id}.json`), JSON.stringify(vecchia));
  const m = new Motore({ cartellaDati: cartella, chiamaAgente: finto({ claude: [], codex: [] }).chiamaAgente, verificaAccessi: accessiOk });
  const d = m.carica(vecchia.id) as Dibattito;
  assert.equal(d.esito, 'limite_round');
  assert.equal(d.turni[0]!.round, 1);
  const md = inMarkdown(d);
  assert.match(md, /Nessun accordo pieno entro il limite di round/);
  assert.match(md, /### Intervento 2 · Codex/);
  assert.match(md, /\*\*Riunione:\*\* 2 interventi/);
  assert.match(md, /Resoconto di Claude/);
  assert.match(statoAParole(d, false), /round finiti senza accordo pieno[\s\S]*; produzione pronta/);
  assert.equal(riassunto(m, d).turni, 2);
  assert.equal(attivo(m, d), false);
  assert.deepEqual(m.recuperaInterrotti(), []);
});

// --- produzione, cartelle autorizzate, memoria ----------------------------------------------

const esitoFinto = (testo: string) => ({ testo, sessione: 's', modello: 'finto', uso: { ingresso: 1, inCache: 0, uscita: 1 }, secondi: 0.1, controllo: 'finto' });

async function partitaConclusa(operai: Operai) {
  const f = finto({ claude: [claude('proposta'), claude('accordo'), sintesi], codex: [codex('accordo'), verifica(true)] });
  const m = new Motore({ cartellaDati: mkdtempSync(join(tmpdir(), 'debate-test-')), chiamaAgente: f.chiamaAgente, verificaAccessi: accessiOk, operai });
  const d = await m.avvia(m.crea(base()).id);
  assert.equal(d.esito, 'accordo');
  return { m, id: d.id };
}

test('produzione senza pacchetti: un solo costruttore (Paolo), Codex collauda, il documento lo racconta', async () => {
  const operai: Operai = {
    costruisci: async (op) => {
      assert.match(op.prompt, /DECISIONE DA COSTRUIRE/);
      assert.match(op.prompt, /Conclusione\./);
      assert.doesNotMatch(op.prompt, /IL TUO PACCHETTO/, 'senza pacchetti il prompt è quello di sempre');
      assert.match(op.sistema, /^Sei Claude, nel cantiere[\s\S]*IL TUO RUOLO\n\nSei Paolo/);
      writeFileSync(join(op.cantiere, 'LEGGIMI.md'), '# Fatto\nconst token = process.env.TOKEN_API;\n');
      return { ...esitoFinto('Ho scritto LEGGIMI.md'), scritti: ['LEGGIMI.md'], negati: 0, finitiTurni: false };
    },
    collauda: async (op) => {
      assert.match(op.prompt, /LEGGIMI\.md/);
      assert.match(op.prompt, /const token = process\.env\.TOKEN_API;/, 'al collaudo arriva il file vero, non filtrato');
      return esitoFinto(JSON.stringify({ approvato: true, problemi: [], commento: 'regge' }));
    },
  };
  const { m, id } = await partitaConclusa(operai);
  const stati: string[] = [];
  m.on('evento', (_i: string, e: Evento) => { if (e.tipo === 'produzione') stati.push(e.stato); });
  const d = await m.produci(id, null);
  assert.equal(d.produzione?.stato, 'pronta');
  assert.equal(d.produzione?.collaudo?.approvato, true);
  assert.deepEqual(d.produzione?.file.map((x) => x.percorso), ['LEGGIMI.md']);
  assert.equal(d.produzione!.file[0]!.anteprima, '# Fatto\nconst token = process.env.TOKEN_API;\n');
  assert.deepEqual(d.produzione?.pacchetti?.map((x) => [x.assistente, x.stato]), [['sviluppo', 'fatto']]);
  assert.equal(d.produzione?.resoconto, 'Ho scritto LEGGIMI.md');
  assert.deepEqual([...new Set(stati)], ['in_lavorazione', 'collaudo', 'pronta']);
  assert.equal(m.idAttivi().length, 0);
  assert.match(inMarkdown(d), /## Produzione[\s\S]*Collaudo di Codex:\*\* superato/);
  assert.match(inMarkdown(d), /pacchetto 1 · Paolo/);
});

test('produzione: solo partite concluse, e si ferma con pausa', async () => {
  const operai: Operai = {
    costruisci: (op) => new Promise((_, rifiuta) => op.signal!.addEventListener('abort', () => rifiuta(new Annullato()), { once: true })),
    collauda: async () => esitoFinto('{}'),
  };
  const { m, id } = await partitaConclusa(operai);
  const aperta = m.crea(base());
  assert.throws(() => m.produci(aperta.id, null), /conclusa/);
  const lavoro = m.produci(id, null);
  assert.throws(() => m.produci(id, null), /già al lavoro/);
  setImmediate(() => assert.ok(m.pausa(id)));
  const d = await lavoro;
  assert.equal(d.produzione?.stato, 'fermata');
  assert.equal(d.produzione?.pacchetti?.[0]?.stato, 'fallito');
  assert.equal(m.idAttivi().length, 0);
  assert.equal(m.squadra().squadra.find((x) => x.id === 'sviluppo')!.statistiche.falliti, 0, 'uno stop dell\'utente non è un fallimento');
});

test('dossier: niente dipendenze, file di credenziali o segreti nel testo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'debate-cartella-'));
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(dir, 'README.md'), '# Progetto\n');
  writeFileSync(join(dir, 'src', 'app.ts'), 'const k = "sk-abcdefghijklmnopqrstuvwxyz0123";\nconst config = { password: "supersegreta1" };\n');
  writeFileSync(join(dir, '.env'), 'SEGRETO=1\n');
  writeFileSync(join(dir, 'id_rsa'), 'chiave');
  writeFileSync(join(dir, 'node_modules', 'x', 'index.js'), 'module.exports = 1');
  const x = creaDossierDa(dir, 'prova');
  assert.deepEqual(x.file.map((f) => f.percorso), ['README.md', 'src/app.ts']);
  assert.doesNotMatch(x.testo, /sk-abc|supersegreta/);
  assert.equal(x.rimossi, 2);
});

test('memoria: il server MCP legge solo note .md dentro le sue cartelle', () => {
  const vault = mkdtempSync(join(tmpdir(), 'debate-note-'));
  writeFileSync(join(vault, 'Progetto.md'), 'Nota del progetto Alfa.\n');
  writeFileSync(join(tmpdir(), 'fuori-dal-vault.md'), 'non si legge');
  const fonti = join(mkdtempSync(join(tmpdir(), 'debate-fonti-')), 'fonti.json');
  writeFileSync(fonti, JSON.stringify([{ nome: 'note', radice: vault }, { nome: 'strana', radice: '../../', file: 42 }]));
  const righe = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'leggi', arguments: { nota: 'note/Progetto.md' } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'leggi', arguments: { nota: 'note/../fuori-dal-vault.md' } } },
    // Percorsi di rete e unità: rifiutati prima di toccare il disco (su Windows aprirebbero una connessione).
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'leggi', arguments: { nota: 'note///server/condivisa/a.md' } } },
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'leggi', arguments: { nota: 'note/C:/x.md' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'cerca', arguments: { testo: 'Alfa' } } },
  ].map((r) => JSON.stringify(r)).join('\n');
  const r = spawnSync(process.execPath, [join(import.meta.dirname, '..', 'motore', 'memoria-mcp.ts'), fonti], { input: `${righe}\n`, encoding: 'utf8' });
  const risposte = Object.fromEntries(r.stdout.trim().split('\n').map((l) => JSON.parse(l)).map((m) => [m.id, m.result]));
  assert.match(risposte[2].content[0].text, /progetto Alfa/);
  assert.equal(risposte[3].isError, true);
  assert.equal(risposte[5].isError, true);
  assert.equal(risposte[6].isError, true);
  assert.match(risposte[4].content[0].text, /note\/Progetto\.md/);
});

test('note salvate: a fine riunione la decisione diventa una nota markdown, nella sua cartella', async () => {
  const vault = mkdtempSync(join(tmpdir(), 'debate-vault-note-'));
  const f = finto({ claude: [claude('proposta'), claude('accordo'), sintesi], codex: [codex('accordo_parziale', ['x']), codex('accordo'), verifica(true)] });
  const m = new Motore({ cartellaDati: mkdtempSync(join(tmpdir(), 'debate-test-')), chiamaAgente: f.chiamaAgente, verificaAccessi: accessiOk, vault });
  const d = await m.avvia(m.crea(base({ domanda: 'Tab: o spazi? Con /barre e "virgolette"' })).id);
  const { readdirSync, readFileSync } = await import('node:fs');
  const note = readdirSync(join(vault, 'Decisioni'));
  assert.equal(note.length, 1);
  assert.match(note[0]!, new RegExp(`^${d.creato.slice(0, 10)} ${d.id.slice(-6)} Tab o spazi`));
  const testo = readFileSync(join(vault, 'Decisioni', note[0]!), 'utf8');
  assert.match(testo, /^---\ntype: decisione\n/);
  assert.match(testo, /Decisione presa in Ambo/);
  assert.match(testo, /## Decisioni condivise\n\n- d/);
});

test('confronto critico: si sceglie, e i messaggi lo dicono', async () => {
  const f = finto({ claude: [claude('proposta'), claude('disaccordo'), claude('disaccordo'), sintesi], codex: [codex('disaccordo', ['x']), codex('disaccordo'), verifica(true)] });
  const m = nuovoMotore(f.chiamaAgente);
  const d = await m.avvia(m.crea(base({ modo: 'confronto' })).id);
  assert.equal(d.config.modo, 'confronto');
  assert.match(f.prompt.codex[0]!, /PROBLEMA posto dall\'utente/);
  assert.match(f.prompt.codex[0]!, /CONFRONTO critico/);
  assert.match(f.prompt.codex[0]!, /Valuta la proposta/);
  assert.throws(() => m.crea(base({ modo: 'rissa' as never })), /modo di lavoro/);
});

test('Windows: dallo shim .cmd di npm si ricava cosa lanciare', async () => {
  const { obiettivoCmd } = await import('../motore/ambiente.ts');
  const cartella = mkdtempSync(join(tmpdir(), 'debate-npm-'));
  mkdirSync(join(cartella, 'node_modules', '@openai', 'codex', 'bin'), { recursive: true });
  writeFileSync(join(cartella, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'), '');
  const shim = join(cartella, 'codex.cmd');
  writeFileSync(shim, String.raw`@ECHO off
IF EXIST "%dp0%\node.exe" (
  SET "_prog=%dp0%\node.exe"
)
endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\node_modules\@openai\codex\bin\codex.js" %*
`.replace(/\n/g, '\r\n'));
  const c = obiettivoCmd(shim);
  assert.equal(c?.comando, process.execPath);
  assert.equal(c?.argsBase[0], join(cartella, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'));
  writeFileSync(shim, 'niente di riconoscibile');
  assert.equal(obiettivoCmd(shim), undefined);
});

test('ambiente delle CLI: via chiavi, token e password di qualsiasi servizio, resta il resto', () => {
  const prima = { ...process.env };
  Object.assign(process.env, {
    ANTHROPIC_API_KEY: 'x', OPENAI_API_KEY: 'x', GITHUB_TOKEN: 'x', GH_TOKEN: 'x', AWS_SECRET_ACCESS_KEY: 'x', HF_TOKEN: 'x',
    MIO_SERVIZIO_PASSWORD: 'x', npm_config__auth: 'x', CLAUDE_CODE_GIT_BASH_PATH: 'C:/git/bash.exe', PROVA_NORMALE: 'si',
  });
  try {
    const env = ambientePulito();
    for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'HF_TOKEN', 'MIO_SERVIZIO_PASSWORD', 'npm_config__auth']) assert.equal(env[k], undefined, k);
    assert.equal(env.CLAUDE_CODE_GIT_BASH_PATH, 'C:/git/bash.exe');
    assert.equal(env.PROVA_NORMALE, 'si');
    assert.ok(env.PATH ?? env.Path);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in prima)) delete process.env[k];
  }
});

test('cartelle delle CLI: anche quelle spostate con CLAUDE_CONFIG_DIR e CODEX_HOME sono vietate', async () => {
  const claude = join(tmpdir(), 'config-claude-spostata');
  const codex = join(tmpdir(), 'codex-spostato');
  const prima = { c: process.env.CLAUDE_CONFIG_DIR, x: process.env.CODEX_HOME };
  process.env.CLAUDE_CONFIG_DIR = claude;
  process.env.CODEX_HOME = codex;
  try {
    const { cartelleDelleCli } = await import('../motore/ambiente.ts');
    const { vietateAlCantiere } = await import('../motore/agenti/cantiere.ts');
    assert.ok(cartelleDelleCli().includes(resolve(claude)));
    assert.ok(vietateAlCantiere().includes(resolve(codex)));
  } finally {
    if (prima.c === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = prima.c;
    if (prima.x === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prima.x;
  }
});
