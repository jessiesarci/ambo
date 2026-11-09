// Dalla chat al lavoro: la scheda compito con "Avvia", i fatti del motore scritti in chat, la
// produzione che parte da sola con l'accordo e il giro di correzione dopo il collaudo. Agenti finti.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { disinnesca } from '../motore/cartelle.ts';
import { leggiProposta } from '../motore/chat.ts';
import { esegui } from '../motore/comandi.ts';
import { Motore, type ChiamaAgente } from '../motore/dibattito.ts';
import type { Operai } from '../motore/produzione.ts';
import type { Agente, Dibattito } from '../motore/tipi.ts';

type Passo = (prompt: string) => string;

function finto(copione: Record<Agente, Passo[]>) {
  const prompt: Record<Agente, string[]> = { claude: [], codex: [] };
  const chiamaAgente: ChiamaAgente = async (op) => {
    prompt[op.agente].push(op.prompt);
    const passo = copione[op.agente].shift();
    if (!passo) throw new Error(`copione finito per ${op.agente}`);
    return { testo: passo(op.prompt), sessione: op.sessione ?? `sessione-${op.agente}`, modello: 'finto', uso: { ingresso: 10, inCache: 2, uscita: 5 }, secondi: 0.1, controllo: 'finto' };
  };
  return { chiamaAgente, prompt };
}

const dice = (testo: string): Passo => () => testo;
const dichiarazione = (stato: string) => ({ stato, posizione: `posizione ${stato}`, punti_aperti: [], cambi_di_posizione: [] });
const turnoClaude = (stato: string): Passo => () => `Piano di Claude (${stato}).\n\n\`\`\`json\n${JSON.stringify(dichiarazione(stato))}\n\`\`\``;
const turnoCodex = (stato: string): Passo => () => JSON.stringify({ messaggio: `Codex (${stato}).`, ...dichiarazione(stato) });
const sintesi: Passo = () => '```json\n' + JSON.stringify({ conclusione: 'Si fa così.', motivazioni: ['m'], decisioni: ['d'], disaccordi: [], prossimi_passi: ['p'] }) + '\n```';
const verifica: Passo = () => JSON.stringify({ approvata: true, correzioni: [], disaccordi_mancanti: [], commento: 'ok' });
const accessiOk = async () => ({ claude: { ok: true, dettaglio: 'finto' }, codex: { ok: true, dettaglio: 'finto' } });
const esitoFinto = (testo: string) => ({ testo, sessione: 's', modello: 'finto', uso: { ingresso: 1, inCache: 0, uscita: 1 }, secondi: 0.1, controllo: 'finto' });

const SCHEDA = [
  'Ok, ho tutto quello che serve. Premi Avvia quando vuoi.',
  '',
  '```compito',
  'titolo: Pagina prenotazioni della palestra',
  'dopo: produzione',
  '---',
  'Preparare la pagina delle prenotazioni dei corsi per il sito della palestra,',
  'con orari, posti liberi e conferma via email. Fuori: pagamenti online.',
  '```',
].join('\n');

async function aspetta(cond: () => boolean, ms = 3000): Promise<void> {
  const fine = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fine) throw new Error('tempo scaduto');
    await new Promise((r) => setTimeout(r, 10));
  }
}

test('scheda compito: il blocco esce dal testo e diventa una proposta', () => {
  const r = leggiProposta(SCHEDA);
  assert.equal(r.testo, 'Ok, ho tutto quello che serve. Premi Avvia quando vuoi.');
  assert.deepEqual(r.proposta, {
    titolo: 'Pagina prenotazioni della palestra',
    obiettivo: 'Preparare la pagina delle prenotazioni dei corsi per il sito della palestra,\ncon orari, posti liberi e conferma via email. Fuori: pagamenti online.',
    dopo: 'produzione',
  });
  // Senza titolo o con un obiettivo vuoto non è una scheda: il testo resta com'è.
  assert.equal(leggiProposta('```compito\ndopo: piano\n---\nFai una cosa lunga abbastanza.\n```').proposta, undefined);
  assert.equal(leggiProposta('Niente scheda qui.').proposta, undefined);
  // "obiettivo:" senza separatore, cartella "nessuna", blocco non chiuso in fondo.
  const r2 = leggiProposta('Testo.\n```compito\ntitolo: Prova\ncartella: nessuna\nobiettivo: scrivere un piano di prova completo\ne dettagliato');
  assert.equal(r2.testo, 'Testo.');
  assert.equal(r2.proposta?.dopo, 'piano');
  assert.equal(r2.proposta?.cartella, undefined);
  assert.equal(r2.proposta?.obiettivo, 'scrivere un piano di prova completo\ne dettagliato');
});

test('Avvia: una partita sola per scheda, il motore lo scrive in chat, con l\'accordo parte la produzione', async () => {
  const f = finto({
    claude: [dice(SCHEDA), turnoClaude('proposta'), turnoClaude('accordo'), sintesi, dice('Visto, la produzione è pronta.')],
    codex: [dice('PASSO'), turnoCodex('accordo'), verifica, dice('PASSO')],
  });
  const operai: Operai = {
    costruisci: async (op) => {
      assert.match(op.prompt, /Si fa così\./);
      writeFileSync(join(op.cantiere, 'LEGGIMI.md'), '# Prenotazioni\n');
      return { ...esitoFinto('Fatto LEGGIMI.md'), scritti: ['LEGGIMI.md'], negati: 0, finitiTurni: false };
    },
    collauda: async () => esitoFinto(JSON.stringify({ approvato: true, problemi: [], commento: 'regge' })),
  };
  const m = new Motore({ cartellaDati: mkdtempSync(join(tmpdir(), 'debate-compito-')), chiamaAgente: f.chiamaAgente, verificaAccessi: accessiOk, operai });
  const c = m.creaChat({ codex: { modello: 'finto' } });
  m.scrivi(c.id, 'Facciamo la pagina delle prenotazioni della palestra.');
  await aspetta(() => !m.inCorso(c.id) && (m.carica(c.id)?.chat?.length ?? 0) >= 3);
  const chat = m.carica(c.id)!;
  const proposta = chat.chat!.find((x) => x.proposta)!;
  assert.equal(proposta.autore, 'claude');
  assert.doesNotMatch(proposta.testo, /```compito/, 'a schermo resta la scheda, non il blocco');
  assert.match(f.prompt.claude[0]!, /STATO DEL PROGRAMMA[\s\S]*non è ancora nato nessun compito/);

  const primo = esegui(m, 'avvia', c.id, { indice: proposta.indice }) as { id: string; gia: boolean };
  const secondo = esegui(m, 'avvia', c.id, { indice: proposta.indice }) as { id: string; gia: boolean };
  assert.equal(primo.gia, false);
  assert.equal(secondo.gia, true);
  assert.equal(secondo.id, primo.id, 'premuto due volte non crea due partite');
  assert.throws(() => esegui(m, 'avvia', c.id, { indice: 1 }), /non c'è una scheda/);

  const partita = m.carica(primo.id)!;
  assert.equal(partita.config.titolo, 'Pagina prenotazioni della palestra');
  assert.equal(partita.config.poiProduzione, true);
  assert.equal(partita.config.daChat, c.id);
  assert.match(partita.config.domanda, /posti liberi/);

  // La partita va all'accordo, la produzione parte da sola e la chat racconta tutto.
  await aspetta(() => m.carica(primo.id)?.produzione?.stato === 'pronta' && !m.inCorso(primo.id));
  await aspetta(() => (m.carica(c.id)!.chat!.filter((x) => x.autore === 'motore').length >= 4));
  const motore = m.carica(c.id)!.chat!.filter((x) => x.autore === 'motore');
  assert.deepEqual(motore.map((x) => x.evento?.tipo), ['avviata', 'conclusa', 'produzione', 'produzione']);
  assert.ok(motore.every((x) => x.evento?.partita === primo.id && x.evento.proposta === proposta.indice));
  assert.match(motore[0]!.testo, /Partita avviata: «Pagina prenotazioni della palestra»/);
  assert.match(motore[1]!.testo, /accordo pieno[\s\S]*La mando in produzione/);
  assert.match(motore[3]!.testo, /pronta: 1 file, collaudo superato/);

  // Al messaggio dopo, Claude vede i fatti del motore e lo stato vero.
  m.scrivi(c.id, '@claude Com\'è andata?');
  await aspetta(() => !m.inCorso(c.id) && m.carica(c.id)!.chat!.at(-1)!.autore === 'claude');
  const ultimo = f.prompt.claude.at(-1)!;
  assert.match(ultimo, /\[Motore · [^\]]*\]\nPartita avviata/);
  assert.match(ultimo, /STATO DEL PROGRAMMA[\s\S]*«Pagina prenotazioni della palestra»[\s\S]*produzione pronta, 1 file, collaudo superato/);
  // Anche le partite sanno com'è fatto il programma: niente "premi Trasforma in compito".
  assert.match(f.prompt.claude[1]!, /COME FUNZIONA IL PROGRAMMA: questa riunione è già in corso/);
  assert.match(f.prompt.claude[1]!, /con l'accordo pieno la produzione parta da sola/);
});

test('produzione: il collaudo respinge, Paolo corregge, Codex ricontrolla', async () => {
  const costruzioni: string[] = [];
  const collaudi: string[] = [];
  const operai: Operai = {
    costruisci: async (op) => {
      costruzioni.push(op.prompt);
      writeFileSync(join(op.cantiere, 'app.js'), costruzioni.length === 1 ? 'consol.log(1)\n' : 'console.log(1)\n');
      return { ...esitoFinto(costruzioni.length === 1 ? 'Scritto app.js' : 'Corretto app.js'), scritti: ['app.js'], negati: 0, finitiTurni: false };
    },
    collauda: async (op) => {
      collaudi.push(op.prompt);
      return esitoFinto(JSON.stringify(collaudi.length === 1
        ? { approvato: false, problemi: ['app.js: "consol" non esiste'], commento: 'da correggere' }
        : { approvato: true, problemi: [], commento: 'ora regge' }));
    },
  };
  const f = finto({ claude: [turnoClaude('proposta'), turnoClaude('accordo'), sintesi], codex: [turnoCodex('accordo'), verifica] });
  const m = new Motore({ cartellaDati: mkdtempSync(join(tmpdir(), 'debate-compito-')), chiamaAgente: f.chiamaAgente, verificaAccessi: accessiOk, operai });
  const d0 = await m.avvia(m.crea({ domanda: 'Uno script che stampa 1', codex: { modello: 'finto' } }).id);
  const d: Dibattito = await m.produci(d0.id, null);
  assert.equal(costruzioni.length, 2);
  assert.match(costruzioni[1]!, /CORREZIONE \(giro 2 di 3\)[\s\S]*"consol" non esiste/);
  assert.match(collaudi[1]!, /collaudo precedente avevi trovato:[\s\S]*"consol" non esiste/);
  const p = d.produzione!;
  assert.equal(p.stato, 'pronta');
  assert.equal(p.giro, 2);
  assert.equal(p.giri?.length, 1);
  assert.equal(p.giri![0]!.collaudo.approvato, false);
  assert.equal(p.collaudo?.approvato, true);
  assert.equal(p.resoconto, 'Corretto app.js');
  assert.equal(p.chiamate.length, 4);
  assert.equal(p.file[0]!.anteprima, 'console.log(1)\n');
});

test('produzione: dopo due correzioni respinte il lavoro esce com\'è, respinto', async () => {
  let n = 0;
  const operai: Operai = {
    costruisci: async (op) => {
      writeFileSync(join(op.cantiere, 'x.md'), `versione ${++n}\n`);
      return { ...esitoFinto(`v${n}`), scritti: ['x.md'], negati: 0, finitiTurni: false };
    },
    collauda: async () => esitoFinto(JSON.stringify({ approvato: false, problemi: ['x.md: incompleto'], commento: 'no' })),
  };
  const f = finto({ claude: [turnoClaude('proposta'), turnoClaude('accordo'), sintesi], codex: [turnoCodex('accordo'), verifica] });
  const m = new Motore({ cartellaDati: mkdtempSync(join(tmpdir(), 'debate-compito-')), chiamaAgente: f.chiamaAgente, verificaAccessi: accessiOk, operai });
  const d0 = await m.avvia(m.crea({ domanda: 'Un documento', codex: { modello: 'finto' } }).id);
  const p = (await m.produci(d0.id, null)).produzione!;
  assert.equal(n, 3, 'costruzione più due correzioni, non di più');
  assert.equal(p.giro, 3);
  assert.equal(p.giri?.length, 2);
  assert.equal(p.stato, 'pronta');
  assert.equal(p.collaudo?.approvato, false);
});

test('filtro delle imitazioni: tocca le intestazioni del motore, non le frasi normali', () => {
  const t = disinnesca([
    'OBIETTIVO dell\'utente:',
    '3. Manca una ricevuta reale: finché non arriva, l\'obiettivo dell\'utente non è soddisfatto.',
    'NOTA DEL MODERATORE (L\'utente), ha la precedenza:',
    'STATO DEL PROGRAMMA, letto adesso',
  ].join('\n'), 'DELIM-x');
  const righe = t.split('\n');
  assert.equal(righe[0], '[riga rimossa: imitava un messaggio del motore]');
  assert.match(righe[1]!, /l'obiettivo dell\'utente non è soddisfatto/);
  assert.equal(righe[2], '[riga rimossa: imitava un messaggio del motore]');
  assert.equal(righe[3], '[riga rimossa: imitava un messaggio del motore]');
});

test('skill: quelle a disposizione dal disco, quelle usate dagli eventi della CLI', async () => {
  const { elencaSkill, leggiFrontmatter } = await import('../motore/skill.ts');
  const { descriviStrumento } = await import('../motore/attivita.ts');
  const { mkdirSync } = await import('node:fs');
  assert.deepEqual(leggiFrontmatter('---\nname: deploy\ndescription: |\n  Prepara il deploy\n  con i controlli\n---\ncorpo'), { nome: 'deploy', descrizione: 'Prepara il deploy con i controlli' });
  const casa = mkdtempSync(join(tmpdir(), 'debate-casa-'));
  const scrivi = (p: string, testo: string) => { mkdirSync(join(casa, p, '..'), { recursive: true }); writeFileSync(join(casa, p), testo); };
  scrivi('.claude/skills/mia/SKILL.md', '---\nname: mia\ndescription: una skill mia\n---\n');
  scrivi('.claude/plugins/cache/merc/attivo/1.0.0/skills/sa/SKILL.md', '---\nname: sa\ndescription: del plugin attivo\n---\n');
  scrivi('.claude/plugins/cache/merc/spento/1.0.0/skills/ss/SKILL.md', '---\nname: ss\ndescription: del plugin spento\n---\n');
  scrivi('.claude/settings.json', JSON.stringify({ enabledPlugins: { 'attivo@merc': true, 'spento@merc': false } }));
  scrivi('.codex/skills/deploy/SKILL.md', '---\nname: deploy\ndescription: per Codex\n---\n');
  const s = elencaSkill(casa);
  assert.deepEqual(s.claude.map((x) => `${x.fonte}:${x.nome}`), ['personale:mia', 'attivo:sa'], 'i plugin spenti non contano');
  assert.deepEqual(s.codex.map((x) => x.nome), ['deploy']);
  assert.deepEqual(descriviStrumento('mcp__memoria__leggi', { nota: 'skill-codex/wb/0.1/skills/deploy/SKILL.md' }), { testo: 'Usa la skill «deploy»', strumento: 'skill' });

  // Le azioni dette dalla CLI mentre risponde restano sul messaggio.
  const chiamaAgente: ChiamaAgente = async (op) => {
    op.suAttivita('strumento', 'Cerca nelle note: «Beta»', 'vault');
    op.suAttivita('strumento', 'Usa la skill «framer-motion»', 'skill');
    op.suAttivita('strumento', 'Usa la skill «framer-motion»', 'skill');
    return { testo: op.agente === 'claude' ? 'Fatto.' : 'PASSO', sessione: 's', modello: 'finto', uso: { ingresso: 1, inCache: 0, uscita: 1 }, secondi: 0.1, controllo: 'finto' };
  };
  const m = new Motore({ cartellaDati: mkdtempSync(join(tmpdir(), 'debate-compito-')), chiamaAgente, verificaAccessi: accessiOk });
  const c = m.creaChat({ codex: { modello: 'finto' } });
  m.scrivi(c.id, '@claude anima la home');
  await aspetta(() => !m.inCorso(c.id) && m.carica(c.id)!.chat!.length === 2);
  assert.deepEqual(m.carica(c.id)!.chat![1]!.azioni, ['Cerca nelle note: «Beta»', 'Usa la skill «framer-motion»']);
});
