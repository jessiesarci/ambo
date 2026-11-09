// Le note salvate dal programma, in markdown compatibile con Obsidian: a fine partita (e a fine
// produzione) il motore scrive la decisione come nota, e una chat diventa una nota quando lo chiedi.
// Le partite dopo le ritrovano tra le note. Scrive il motore, non gli agenti, e solo dentro la
// cartella scelta (AMBO_SALVA_IN, di serie dati/note).
import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IMPOSTAZIONI } from './impostazioni.ts';
import { NOME, altro, nomeAutore, type Dibattito, type Esito } from './tipi.ts';

export const CARTELLA_NOTE = 'Decisioni';

export function cartellaNoteSalvate(): string {
  return IMPOSTAZIONI.salvaIn;
}

const ESITO: Record<Esito, string> = {
  accordo: 'accordo pieno',
  stallo: 'stallo',
  limite_round: 'round finiti senza accordo pieno',
  chiuso_da_utente: 'chiusa dall\'utente',
};

const voci = (x: string[]) => (x.length ? x.map((v) => `- ${v}`).join('\n') : '- nessuna');
// Nel titolo di un file niente caratteri che Windows o Obsidian non accettano.
const perNomeFile = (t: string) => t.replace(/[\\/:*?"<>|#^[\]\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70).trim();
const yaml = (t: string) => JSON.stringify(t);

export function notaDecisione(d: Dibattito): string {
  const s = d.sintesi?.testo;
  const v = d.verifica?.testo;
  const data = d.creato.slice(0, 10);
  const p = d.produzione;
  return [
    '---',
    'type: decisione',
    'tags: [decisione, ambo]',
    `created: ${data}`,
    `updated: ${new Date().toISOString().slice(0, 10)}`,
    `esito: ${yaml(d.esito ? ESITO[d.esito] : 'non conclusa')}`,
    `sintesi_approvata: ${v ? v.approvata : 'null'}`,
    `dibattito: ${yaml(d.id)}`,
    ...(p ? [`produzione: ${yaml(p.stato)}`] : []),
    '---',
    '',
    `# ${perNomeFile(d.config.domanda.split('\n')[0]!)}`,
    '',
    `> Decisione presa in Ambo da Claude e Codex il ${new Date(d.creato).toLocaleDateString('it-CH')}: ${d.esito ? ESITO[d.esito] : 'partita non conclusa'}${v ? `, sintesi ${v.approvata ? 'approvata' : 'NON approvata'} da ${NOME[altro(d.sintesi!.relatore)]}` : ''}.`,
    '',
    d.config.modo === 'insieme' ? '## Obiettivo' : '## Domanda',
    '',
    d.config.domanda,
    '',
    ...(s ? [
      '## Conclusione', '', s.conclusione, '',
      '## Decisioni condivise', '', voci(s.decisioni), '',
      '## Motivazioni', '', voci(s.motivazioni), '',
      '## Disaccordi aperti', '',
      s.disaccordi.length ? s.disaccordi.map((x) => `- **${x.punto}**: Claude: ${x.posizione_claude} · Codex: ${x.posizione_codex}`).join('\n') : '- nessuno',
      '',
      '## Prossimi passi', '', voci(s.prossimi_passi), '',
    ] : ['_Sintesi non disponibile._', '']),
    ...(v && !v.approvata ? ['## Correzioni del revisore', '', voci([...v.correzioni, ...v.disaccordi_mancanti]), ''] : []),
    ...(d.dossier ? [`Materiale letto: ${d.dossier.file.length} file della cartella "${d.dossier.cartella}".`, ''] : []),
    ...(p ? [
      '## Produzione', '',
      `Stato: ${p.stato}.${p.collaudo ? ` Collaudo di Codex: ${p.collaudo.approvato ? 'superato' : 'non superato'}. ${p.collaudo.commento}` : ''}`,
      ...(p.file.length ? ['', 'File consegnati:', voci(p.file.map((f) => `\`${f.percorso}\``))] : []),
      ...(p.collaudo?.problemi.length ? ['', 'Problemi trovati:', voci(p.collaudo.problemi)] : []),
      '',
    ] : []),
    `_Documento completo: \`dati/esportazioni/${d.id}.md\` nella cartella del programma._`,
    '',
  ].join('\n');
}

// Scrive (o riscrive) la nota della partita. Una partita = una nota: il nome comincia con data e id
// breve, così si ritrova anche se cambia il titolo. Mai un errore verso il chiamante.
export function scriviNota(vault: string, d: Dibattito): string | undefined {
  try {
    if (d.stato !== 'concluso') return undefined;
    const cartella = join(vault, CARTELLA_NOTE);
    mkdirSync(cartella, { recursive: true });
    const prefisso = `${d.creato.slice(0, 10)} ${d.id.slice(-6)}`;
    const esistente = readdirSync(cartella).find((f) => f.startsWith(prefisso) && f.endsWith('.md'));
    const nome = esistente ?? `${prefisso} ${perNomeFile(d.config.domanda.split('\n')[0]!)}.md`;
    const file = join(cartella, nome);
    writeFileSync(`${file}.tmp`, notaDecisione(d), 'utf8');
    renameSync(`${file}.tmp`, file);
    return file;
  } catch (e) {
    console.error(`Nota della decisione non scritta: ${(e as Error).message}`);
    return undefined;
  }
}

// Le chat diventano note solo quando lo chiedi: una chat = una nota, riscritta ogni volta.
export const CARTELLA_CHAT = 'Chat';

export function notaChat(d: Dibattito): string {
  const messaggi = (d.chat ?? []).filter((m) => !m.passa);
  const data = d.creato.slice(0, 10);
  const quando = (iso: string) => new Date(iso).toLocaleString('it-CH', { dateStyle: 'short', timeStyle: 'short' });
  return [
    '---',
    'type: chat',
    'tags: [chat, ambo]',
    `created: ${data}`,
    `updated: ${new Date().toISOString().slice(0, 10)}`,
    `chat: ${yaml(d.id)}`,
    `messaggi: ${messaggi.length}`,
    '---',
    '',
    `# ${perNomeFile(d.config.domanda.split('\n')[0]!)}`,
    '',
    `> Chat in Ambo con Claude e Codex, iniziata il ${new Date(d.creato).toLocaleDateString('it-CH')}.`,
    '',
    ...messaggi.flatMap((m) => [
      `### ${nomeAutore(m.autore)} · ${quando(m.ora)}${m.voce ? ' · a voce' : ''}`,
      '',
      m.testo,
      '',
    ]),
  ].join('\n');
}

export function scriviNotaChat(vault: string, d: Dibattito): string {
  const cartella = join(vault, CARTELLA_CHAT);
  mkdirSync(cartella, { recursive: true });
  const prefisso = `${d.creato.slice(0, 10)} ${d.id.slice(-6)}`;
  const esistente = readdirSync(cartella).find((f) => f.startsWith(prefisso) && f.endsWith('.md'));
  const nome = esistente ?? `${prefisso} ${perNomeFile(d.config.domanda.split('\n')[0]!)}.md`;
  const file = join(cartella, nome);
  writeFileSync(`${file}.tmp`, notaChat(d), 'utf8');
  renameSync(`${file}.tmp`, file);
  return `${CARTELLA_CHAT}/${nome}`;
}
