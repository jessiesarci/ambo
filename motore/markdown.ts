// Il documento finale. Le parti scritte dagli agenti (sintesi, verifica, trascrizione) sono
// separate da quelle che il motore ricava dai fatti (esito, posizioni dichiarate, dati tecnici).
import { altro, NOME, type Dibattito, type Esito, type Turno } from './tipi.ts';

const ESITI: Record<Esito, string> = {
  accordo: 'Accordo raggiunto',
  stallo: 'Nessun accordo: posizioni ferme',
  limite_round: 'Nessun accordo pieno entro il limite di round',
  chiuso_da_utente: 'Chiuso dall\'utente prima di un accordo',
};

const STATI: Record<string, string> = {
  proposta: 'proposta',
  accordo: 'accordo',
  accordo_parziale: 'accordo parziale',
  disaccordo: 'disaccordo',
};

const voci = (l: string[], vuoto = '_Nessuna._') => (l.length ? l.map((v) => `- ${v}`).join('\n') : vuoto);
const citazione = (t: string) => t.split('\n').map((r) => `> ${r}`).join('\n');
const modello = (d: Dibattito, a: 'claude' | 'codex') => {
  const usato = d.turni.find((t) => t.agente === a)?.chiamata.modello;
  const conf = a === 'claude' ? d.config.claude : d.config.codex;
  return `${usato ?? conf.modello ?? 'predefinito'}${conf.ragionamento ? `, ragionamento ${conf.ragionamento}` : ''}`;
};

function turno(t: Turno): string {
  const r = t.risposta;
  return [
    `### Turno ${t.indice} · round ${t.round} · ${NOME[t.agente]}`,
    t.interventi.length ? `_Ha ricevuto le note dell\'utente:_\n${voci(t.interventi)}\n` : '',
    r.messaggio.trim(),
    '',
    `**Stato dichiarato:** ${STATI[r.stato]} · **Posizione:** ${r.posizione}`,
    r.punti_aperti.length ? `\n**Punti aperti:**\n${voci(r.punti_aperti)}` : '',
    r.cambi_di_posizione.length ? `\n**Cambi di posizione:**\n${voci(r.cambi_di_posizione)}` : '',
    t.note.length ? `\n_Note del motore:_ ${t.note.join(' ')}` : '',
  ].filter((p) => p !== '').join('\n');
}

export function inMarkdown(d: Dibattito): string {
  const s = d.sintesi?.testo;
  const v = d.verifica?.testo;
  const titolo = d.config.domanda.split('\n')[0]!.slice(0, 90);
  const out: string[] = [];

  out.push(`# Dibattito: ${titolo}`, '');
  out.push(
    `- **Data:** ${new Date(d.creato).toLocaleString('it-CH')}`,
    `- **Claude:** ${modello(d, 'claude')}`,
    `- **Codex:** ${modello(d, 'codex')}`,
    `- **Round:** ${Math.ceil(d.turni.length / 2)} svolti su ${d.config.maxRound} (${d.turni.length} interventi)`,
    `- **Esito:** ${d.esito ? ESITI[d.esito] : `non concluso (stato: ${d.stato})`}`,
    '',
    '## Problema',
    '',
    citazione(d.config.domanda),
    '',
    '## Esito',
    '',
    d.esito ? `**${ESITI[d.esito]}.** ${d.motivoEsito ?? ''}` : `Il dibattito non è concluso (stato: ${d.stato}).`,
    '',
  );

  if (s && d.sintesi) {
    const relatore = NOME[d.sintesi.relatore];
    const revisore = NOME[altro(d.sintesi.relatore)];
    const timbro = v ? (v.approvata ? `approvata da ${revisore}` : `**non approvata** da ${revisore}: vedi la verifica più sotto`) : `non ancora verificata da ${revisore}`;
    out.push(
      '## Conclusione',
      '',
      `_Sintesi scritta da ${relatore}, ${timbro}._`,
      '',
      s.conclusione,
      '',
      '## Motivazioni',
      '',
      voci(s.motivazioni),
      '',
      '## Decisioni condivise',
      '',
      voci(s.decisioni),
      '',
      '## Disaccordi irrisolti',
      '',
      s.disaccordi.length
        ? s.disaccordi.map((x) => `- **${x.punto}**\n  - Claude: ${x.posizione_claude}\n  - Codex: ${x.posizione_codex}`).join('\n')
        : '_Nessuno riportato nella sintesi._',
      '',
      '## Prossimi passi',
      '',
      voci(s.prossimi_passi),
      '',
    );
    if (v) {
      out.push(
        `## Verifica di ${revisore} sulla sintesi`,
        '',
        `**${v.approvata ? 'Approvata' : 'Non approvata'}.** ${v.commento}`,
        '',
        ...(v.correzioni.length ? [`**Correzioni:**\n${voci(v.correzioni)}`, ''] : []),
        ...(v.disaccordi_mancanti.length ? [`**Disaccordi che la sintesi non riporta:**\n${voci(v.disaccordi_mancanti)}`, ''] : []),
      );
    }
  } else if (d.esito && d.turni.length) {
    out.push('## Conclusione', '', '_Sintesi non disponibile._', '');
  }

  const finali = (['claude', 'codex'] as const)
    .map((a) => [...d.turni].reverse().find((t) => t.agente === a))
    .filter((t): t is Turno => !!t);
  if (finali.length) {
    out.push('## Posizioni finali dichiarate', '', '_Dall\'ultimo intervento di ciascuno, così come l\'hanno dichiarate._', '');
    for (const t of finali) {
      out.push(`- **${NOME[t.agente]}** (${STATI[t.risposta.stato]}): ${t.risposta.posizione}`);
      if (t.risposta.punti_aperti.length) out.push(...t.risposta.punti_aperti.map((p) => `  - aperto: ${p}`));
    }
    out.push('');
  }

  if (d.interventi.length) {
    out.push('## Note dell\'utente durante il dibattito', '', ...d.interventi.map((i) => `- ${new Date(i.ora).toLocaleTimeString('it-CH')}: ${i.testo}`), '');
  }

  if (d.dossier) {
    const x = d.dossier;
    out.push('## Materiale dato in lettura', '', `Copia di ${x.file.length} file della cartella autorizzata "${x.cartella}"${x.omessi ? `, altri ${x.omessi} esclusi per spazio` : ''}${x.rimossi ? `, ${x.rimossi} possibili segreti cancellati` : ''}.`, '', ...x.file.map((f) => `- \`${f.percorso}\``), '');
  }

  if (d.produzione) {
    const p = d.produzione;
    const STATO_P = { in_lavorazione: 'in lavorazione', collaudo: 'in collaudo', pronta: 'pronta', fermata: 'fermata', errore: 'ferma per un errore' };
    out.push('## Produzione', '', `**Stato:** ${STATO_P[p.stato]}. ${p.base ? `Base: copia della cartella "${p.base}".` : 'Partita da una cartella vuota.'}${p.cantiere ? ` Cantiere: \`${p.cantiere}\`.` : ''}`, '');
    if (p.resoconto) out.push('**Resoconto di Claude:**', '', p.resoconto, '');
    if (p.file.length) out.push('**File prodotti:**', '', ...p.file.map((x) => `- \`${x.percorso}\` (${x.caratteri} caratteri)`), '');
    for (const g of p.giri ?? []) {
      out.push(`**Collaudo del giro ${g.giro}:** non superato, Claude ha corretto. ${g.collaudo.commento}`, '', voci(g.collaudo.problemi), '');
    }
    if (p.collaudo) {
      out.push(`**Collaudo di Codex${p.giro && p.giro > 1 ? ` (giro ${p.giro})` : ''}:** ${p.collaudo.approvato ? 'superato' : 'non superato'}. ${p.collaudo.commento}`, '');
      if (p.collaudo.problemi.length) out.push(voci(p.collaudo.problemi), '');
    }
    if (p.errore) out.push(`**Errore:** ${p.errore.split('\n')[0]}`, '');
  }

  out.push('## Trascrizione integrale', '', ...d.turni.map((t) => `${turno(t)}\n`));

  const chiamate = [...d.turni.map((t) => ({ voce: `turno ${t.indice}`, c: t.chiamata }))];
  if (d.sintesi) chiamate.push({ voce: 'sintesi', c: d.sintesi.chiamata });
  if (d.verifica) chiamate.push({ voce: 'verifica', c: d.verifica.chiamata });
  for (const c of d.produzione?.chiamate ?? []) chiamate.push({ voce: c.agente === 'claude' ? 'produzione' : 'collaudo', c });
  const tot = chiamate.reduce((a, { c }) => ({ s: a.s + c.secondi, i: a.i + c.uso.ingresso, k: a.k + c.uso.inCache, o: a.o + c.uso.uscita }), { s: 0, i: 0, k: 0, o: 0 });
  out.push(
    '## Dati tecnici',
    '',
    'Ogni riga è un\'esecuzione vera della CLI ufficiale con il login dell\'abbonamento. Nessuna chiamata API a consumo.',
    '',
    '| Passo | Agente | Modello | Secondi | Token in (in cache) | Token out | Tentativi | Controllo |',
    '|---|---|---|---|---|---|---|---|',
    ...chiamate.map(({ voce, c }) => `| ${voce} | ${NOME[c.agente]} | ${c.modello} | ${c.secondi} | ${c.uso.ingresso} (${c.uso.inCache}) | ${c.uso.uscita} | ${c.tentativi} | ${c.controllo} |`),
    `| **totale** | | | ${Math.round(tot.s)} | ${tot.i} (${tot.k}) | ${tot.o} | | |`,
    '',
  );
  if (d.chiamateFallite.length) {
    out.push('**Chiamate fallite:**', '', ...d.chiamateFallite.map((f) => `- ${new Date(f.ora).toLocaleTimeString('it-CH')} ${NOME[f.agente]}: ${f.errore.split('\n')[0]}`), '');
  }
  out.push(`_Dibattito ${d.id}._`, '');
  return out.join('\n');
}
