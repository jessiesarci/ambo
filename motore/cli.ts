// Prototipo da terminale: lancia una riunione vera e la mostra mentre si svolge.
//   node motore/cli.ts "domanda" [--claude <modello>] [--codex <modello>] [--web] [--confronto] ...
//   node motore/cli.ts --riprendi <id> [--nota "testo"] [--concludi]
//   node motore/cli.ts --elenco | --modelli | --verifica | --esporta <id>
//   node motore/cli.ts --cartelle | --autorizza <nome> <percorso> | --togli <nome>
//   node motore/cli.ts --produci <id> [--base <cartella>]
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { MODELLI_CLAUDE, modelliCodex, RAGIONAMENTO_CLAUDE, RAGIONAMENTO_CODEX, verificaAccessi } from './ambiente.ts';
import { aggiungiCartella, elencoCartelle, rimuoviCartella } from './cartelle.ts';
import { Motore } from './dibattito.ts';
import { nomeAssistente } from './squadra.ts';
import { NOME, type Agente, type Evento } from './tipi.ts';

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    // Non c'è più: la riunione si chiude da sola. Resta solo per avvisare chi lo usa ancora.
    round: { type: 'string' },
    apre: { type: 'string' },
    relatore: { type: 'string' },
    claude: { type: 'string' },
    'claude-ragionamento': { type: 'string' },
    codex: { type: 'string' },
    'codex-ragionamento': { type: 'string' },
    web: { type: 'boolean' },
    'senza-stallo': { type: 'boolean' },
    timeout: { type: 'string' },
    file: { type: 'string' },
    riprendi: { type: 'string' },
    nota: { type: 'string', multiple: true },
    concludi: { type: 'boolean' },
    elenco: { type: 'boolean' },
    modelli: { type: 'boolean' },
    verifica: { type: 'boolean' },
    esporta: { type: 'string' },
    cartella: { type: 'string' },
    'senza-memoria': { type: 'boolean' },
    confronto: { type: 'boolean' },
    cartelle: { type: 'boolean' },
    autorizza: { type: 'string' },
    togli: { type: 'string' },
    produci: { type: 'string' },
    base: { type: 'string' },
  },
});

const agente = (v: string | undefined, nome: string): Agente | undefined => {
  if (v === undefined) return undefined;
  if (v !== 'claude' && v !== 'codex') throw new Error(`--${nome} vuole "claude" o "codex"`);
  return v;
};

const motore = new Motore();
if (o.round !== undefined) console.warn('--round non c\'è più: la riunione si chiude da sola (accordo, stallo nel confronto o limite di sicurezza). Lo ignoro.');

if (o.verifica) {
  const a = await verificaAccessi();
  console.log(`Claude: ${a.claude.ok ? 'ok' : 'NO'} · ${a.claude.dettaglio}\nCodex:  ${a.codex.ok ? 'ok' : 'NO'} · ${a.codex.dettaglio}`);
  process.exit(a.claude.ok && a.codex.ok ? 0 : 1);
}
if (o.modelli) {
  console.log(`Claude: ${MODELLI_CLAUDE.join(', ')} (ragionamento: ${RAGIONAMENTO_CLAUDE.join(', ')})`);
  console.log(`Codex:  ${modelliCodex().join(', ') || 'cache dei modelli non trovata'} (ragionamento: ${RAGIONAMENTO_CODEX.join(', ')})`);
  process.exit(0);
}
if (o.elenco) {
  for (const d of motore.archivio.elenco()) {
    console.log(`${d.id}  ${d.stato.padEnd(9)} ${String(d.turni.length).padStart(2)} interventi  ${d.esito ?? ''}  ${d.config.domanda.split('\n')[0]!.slice(0, 60)}`);
  }
  process.exit(0);
}
if (o.cartelle) {
  const c = elencoCartelle();
  console.log(c.length ? c.map((x) => `${x.nome.padEnd(24)} ${x.percorso}`).join('\n') : 'Nessuna cartella autorizzata.');
  process.exit(0);
}
if (o.autorizza) {
  const c = aggiungiCartella(o.autorizza, positionals.join(' '));
  console.log(`Autorizzata "${c.nome}": ${c.percorso}`);
  process.exit(0);
}
if (o.togli) {
  console.log(rimuoviCartella(o.togli) ? `Tolta "${o.togli}".` : `Nessuna cartella "${o.togli}".`);
  process.exit(0);
}
if (o.produci) {
  const pid = o.produci;
  motore.on('evento', (_id: string, e: Evento) => { if (e.tipo === 'produzione' && e.testo) console.log(`  · ${new Date().toLocaleTimeString('it-CH')} ${e.testo}`); });
  const ferma = () => { console.log('\nFermo la produzione…'); motore.pausa(pid); };
  process.on('SIGINT', ferma);
  process.on('SIGHUP', ferma);
  if (process.platform === 'win32') process.on('SIGBREAK', ferma);
  const d = await motore.produci(pid, o.base ?? null);
  const p = d.produzione!;
  console.log(`\nProduzione: ${p.stato}. Cantiere: ${p.cantiere}`);
  for (const [i, x] of (p.pacchetti ?? []).entries()) console.log(`Pacchetto ${i + 1} «${x.titolo}» · ${nomeAssistente(undefined, x.assistente)}: ${x.stato}${x.scritti.length ? ` (${x.scritti.length} file)` : ''}`);
  if (p.collaudo) console.log(`Collaudo: ${p.collaudo.approvato ? 'superato' : 'non superato'}. ${p.collaudo.commento}`);
  for (const c of p.chiamate) console.log(`${c.assistente ? `${nomeAssistente(undefined, c.assistente)} (${NOME[c.agente]})` : NOME[c.agente]}: ${Math.round(c.secondi)} s, token in ${c.uso.ingresso}, out ${c.uso.uscita}`);
  process.exit(p.stato === 'pronta' ? 0 : 1);
}
if (o.esporta) {
  console.log(motore.esportaMarkdown(o.esporta));
  process.exit(0);
}

let id: string;
if (o.riprendi) {
  id = o.riprendi;
  if (!motore.carica(id)) throw new Error(`dibattito ${id} non trovato`);
  for (const n of o.nota ?? []) motore.intervieni(id, n);
} else {
  const domanda = o.file ? readFileSync(o.file, 'utf8') : positionals.join(' ');
  if (!domanda.trim()) {
    console.error('Uso: node motore/cli.ts "domanda" [--claude modello] [--codex modello] [--web] [--confronto]');
    process.exit(2);
  }
  const d = motore.crea({
    domanda,
    apre: agente(o.apre, 'apre'),
    relatore: agente(o.relatore, 'relatore'),
    claude: { modello: o.claude, ragionamento: o['claude-ragionamento'] },
    codex: { modello: o.codex, ragionamento: o['codex-ragionamento'] },
    ricercaWeb: o.web,
    stallo: !o['senza-stallo'],
    timeoutTurnoS: o.timeout ? Number(o.timeout) : undefined,
    cartella: o.cartella,
    memoria: !o['senza-memoria'],
    modo: o.confronto ? 'confronto' : 'insieme',
  });
  id = d.id;
  for (const n of o.nota ?? []) motore.intervieni(id, n);
  const c = d.config;
  console.log(`Riunione ${id} · Claude ${c.claude.modello} · Codex ${c.codex.modello ?? 'predefinito'} (${c.codex.ragionamento})${c.ricercaWeb ? ' · web' : ''}${c.memoria ? ' · note dell\'utente' : ''}${d.dossier ? ` · ${d.dossier.file.length} file di "${d.dossier.cartella}"` : ''}`);
}

const ora = () => new Date().toLocaleTimeString('it-CH');
let ultimaFase = '';
motore.on('evento', (_id: string, e: Evento) => {
  if (e.tipo === 'attivita' || e.tipo === 'attivita_assistente') {
    const chi = e.tipo === 'attivita' ? NOME[e.agente] : nomeAssistente(undefined, e.assistente);
    const chiave = `${chi}:${e.fase}`;
    if (chiave === ultimaFase) return;
    ultimaFase = chiave;
    console.log(`  · ${ora()} ${chi} ${e.fase === 'ragionamento' ? 'sta ragionando' : e.fase === 'risposta' ? 'sta scrivendo' : e.fase === 'strumento' ? `· ${e.testo ?? 'usa uno strumento'}` : 'in attesa'}…`);
    return;
  }
  ultimaFase = '';
  if (e.tipo === 'turno_inizio') {
    const titolo = e.ruolo === 'turno' ? `Intervento ${e.indice} · ${NOME[e.agente]}` : `${e.ruolo === 'sintesi' ? 'Sintesi' : 'Verifica'} · ${NOME[e.agente]}`;
    console.log(`\n━━ ${titolo} ${'━'.repeat(Math.max(4, 60 - titolo.length))}`);
  } else if (e.tipo === 'incarico') {
    const i = e.incarico;
    const chi = nomeAssistente(undefined, i.assistente);
    if (i.stato === 'in_corso') console.log(`\n  → ${chi} al lavoro (${i.id}, chiesto da ${NOME[i.da]}): ${i.compito.replace(/\s+/g, ' ').slice(0, 140)}`);
    else if (i.stato === 'fatto') console.log(`  ✓ ${chi}: rapporto consegnato (${(i.rapporto ?? '').split(/\s+/).filter(Boolean).length} parole${i.chiamata ? `, ${i.chiamata.secondi} s, token in ${i.chiamata.uso.ingresso}, out ${i.chiamata.uso.uscita}` : ''})`);
    else if (i.stato === 'fallito') console.log(`  ✗ ${chi}: incarico ${i.id} fallito (${i.errore ?? 'errore'})`);
    else if (i.stato === 'annullato') console.log(`  · ${chi}: incarico ${i.id} annullato, la riunione è chiusa`);
  } else if (e.tipo === 'turno') {
    const r = e.turno.risposta;
    const c = e.turno.chiamata;
    console.log(`\n${r.messaggio.trim()}\n`);
    console.log(`  ▸ stato: ${r.stato} · posizione: ${r.posizione}`);
    if (r.punti_aperti.length) console.log(`  ▸ punti aperti: ${r.punti_aperti.join(' | ')}`);
    if (r.cambi_di_posizione.length) console.log(`  ▸ cambi: ${r.cambi_di_posizione.join(' | ')}`);
    for (const n of e.turno.note) console.log(`  ▸ nota del motore: ${n}`);
    for (const i of e.turno.incarichi ?? []) console.log(`  ▸ incarico ${i.id} per ${nomeAssistente(undefined, i.assistente)}: ${i.compito.replace(/\s+/g, ' ').slice(0, 120)}`);
    console.log(`  ▸ ${c.modello} · ${c.secondi} s · token in ${c.uso.ingresso} (cache ${c.uso.inCache}), out ${c.uso.uscita}${c.tentativi > 1 ? ` · ${c.tentativi} tentativi` : ''}`);
  } else if (e.tipo === 'stato') {
    if (e.stato === 'in_pausa') console.log(`\n[${ora()}] In pausa. Per riprendere: node motore/cli.ts --riprendi ${id} [--nota "..."]`);
  } else if (e.tipo === 'intervento') {
    console.log(`  · nota dell\'utente registrata: ${e.testo}`);
  } else if (e.tipo === 'avviso') {
    console.log(`  · ${e.testo}`);
  } else if (e.tipo === 'errore') {
    console.log(`\n[ERRORE${e.recuperabile ? ', recuperabile' : ''}] ${e.messaggio}`);
    if (e.recuperabile) console.log(`Per riprendere: node motore/cli.ts --riprendi ${id}`);
  } else if (e.tipo === 'concluso') {
    console.log(`\n━━ Esito: ${e.esito} ━━\n${e.motivo}`);
    if (e.approvata !== null) console.log(`Sintesi ${e.approvata ? 'approvata' : 'NON approvata'} dal revisore.`);
  }
});

// Primo Ctrl+C: pausa pulita (il turno in corso si butta, lo stato resta). Secondo: esce subito.
let fermate = 0;
const fermaTurno = () => {
  if (++fermate > 1) process.exit(130);
  console.log('\nFermo il turno in corso…');
  motore.pausa(id);
};
process.on('SIGINT', fermaTurno);
// Chiudere la finestra del terminale: SIGHUP (o SIGBREAK con Ctrl+Pausa su Windows).
process.on('SIGHUP', fermaTurno);
if (process.platform === 'win32') process.on('SIGBREAK', fermaTurno);

if (o.concludi) motore.concludi(id);
const finale = await motore.avvia(id);
if (finale.stato === 'concluso') {
  const md = motore.esportaMarkdown(id);
  // Le chiamate degli assistenti contano sull'abbonamento della loro CLI.
  const chiamate = [
    ...finale.turni.flatMap((t) => [t.chiamata, ...(t.incarichi ?? []).flatMap((i) => (i.chiamata ? [i.chiamata] : []))]),
    ...(finale.sintesi ? [finale.sintesi.chiamata] : []), ...(finale.verifica ? [finale.verifica.chiamata] : []),
  ];
  const somma = (a: Agente) => chiamate.filter((c) => c.agente === a).reduce((s, c) => ({ i: s.i + c.uso.ingresso, o: s.o + c.uso.uscita, n: s.n + 1, t: s.t + c.secondi }), { i: 0, o: 0, n: 0, t: 0 });
  for (const a of ['claude', 'codex'] as const) {
    const s = somma(a);
    console.log(`${NOME[a]}: ${s.n} chiamate, ${Math.round(s.t)} s, token in ${s.i}, out ${s.o}`);
  }
  console.log(`\nDocumento: ${md}`);
}
process.exit(finale.stato === 'errore' ? 1 : 0);
