// Il documento finale. Le parti scritte dagli agenti (sintesi, verifica, trascrizione) sono
// separate da quelle che il motore ricava dai fatti (esito, posizioni dichiarate, dati tecnici).
import { incarichiDi } from './prompt.ts';
import { nomeAssistente } from './squadra.ts';
import { altro, NOME, type Chiamata, type Dibattito, type Esito, type Incarico, type Turno } from './tipi.ts';

const ESITI: Record<Esito, string> = {
  accordo: 'Accordo raggiunto',
  stallo: 'Nessun accordo: posizioni ferme',
  limite: 'Chiusa al limite di sicurezza',
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

const STATO_INCARICO: Record<Incarico['stato'], string> = { attesa: 'in attesa', in_corso: 'al lavoro', fatto: 'fatto', fallito: 'fallito', annullato: 'annullato' };
const una = (t: string, max: number) => {
  const x = t.replace(/\s+/g, ' ').trim();
  return x.length > max ? `${x.slice(0, max - 1).trimEnd()}…` : x;
};
const chiE = (id: string) => nomeAssistente(undefined, id);
const rigaIncarico = (i: Incarico) => `→ ${chiE(i.assistente)}: ${una(i.compito, 160)} · ${STATO_INCARICO[i.stato]}`;

function turno(t: Turno): string {
  const r = t.risposta;
  return [
    `### Intervento ${t.indice} · ${NOME[t.agente]}`,
    t.interventi.length ? `_Ha ricevuto le note dell\'utente:_\n${voci(t.interventi)}\n` : '',
    r.messaggio.trim(),
    '',
    `**Stato dichiarato:** ${STATI[r.stato]} · **Posizione:** ${r.posizione}`,
    r.punti_aperti.length ? `\n**Punti aperti:**\n${voci(r.punti_aperti)}` : '',
    r.cambi_di_posizione.length ? `\n**Cambi di posizione:**\n${voci(r.cambi_di_posizione)}` : '',
    t.note.length ? `\n_Note del motore:_ ${t.note.join(' ')}` : '',
    t.incarichi?.length ? `\n_Incarichi alla squadra:_\n${t.incarichi.map((i) => `- ${rigaIncarico(i)}`).join('\n')}` : '',
  ].filter((p) => p !== '').join('\n');
}

// Il lavoro della squadra: gli incarichi della riunione con i rapporti accorciati (quelli interi
// li hanno letti i capi), poi i pacchetti e le revisioni della produzione.
function lavoroDellaSquadra(d: Dibattito): string[] {
  const incarichi = incarichiDi(d);
  const p = d.produzione;
  if (!incarichi.length && !p?.pacchetti?.length && !p?.revisioni?.length) return [];
  const out = ['## Lavoro della squadra', ''];
  if (incarichi.length) {
    out.push('**Incarichi in riunione:**', '');
    for (const i of incarichi) {
      out.push(`- **${i.id} · ${chiE(i.assistente)}** (chiesto da ${NOME[i.da]}): ${una(i.compito, 200)} · ${STATO_INCARICO[i.stato]}${i.xp ? ` · +${i.xp} XP` : ''}`);
      if (i.rapporto) out.push(`  > ${una(i.rapporto, 600)}`);
      if (i.errore) out.push(`  > Non consegnato: ${i.errore.split('\n')[0]}`);
    }
    out.push('');
  }
  if (p?.pacchetti?.length) {
    out.push(`**Pacchetti della produzione${p.procedura ? ` (procedura ${p.procedura})` : ''}:**`, '');
    p.pacchetti.forEach((x, n) => {
      out.push(`${n + 1}. **${x.titolo}** · ${chiE(x.assistente)} · ${x.stato}${x.xp ? ` · +${x.xp} XP` : ''}${x.scritti.length ? ` · ${x.scritti.map((f) => `\`${f}\``).join(', ')}` : ''}`);
      if (x.resoconto) out.push(`   > ${una(x.resoconto, 400)}`);
      if (x.errore) out.push(`   > Errore: ${x.errore.split('\n')[0]}`);
    });
    out.push('');
  }
  if (p?.revisioni?.length) {
    out.push('**Revisioni della procedura:**', '');
    for (const r of p.revisioni) {
      out.push(`- Giro ${r.giro} · ${chiE(r.assistente)}: ${r.esito ? `${r.esito.approvato ? 'approvato' : 'respinto'}. ${una(r.esito.commento, 300)}` : `non arrivata (${r.errore ?? 'errore'})`}`);
    }
    out.push('');
  }
  return out;
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
    `- **Riunione:** ${d.turni.length} interventi${incarichiDi(d).length ? `, ${incarichiDi(d).length} incarichi alla squadra` : ''}`,
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

  out.push(...lavoroDellaSquadra(d));

  if (d.produzione) {
    const p = d.produzione;
    const STATO_P = { in_lavorazione: 'in lavorazione', collaudo: 'in collaudo', pronta: 'pronta', fermata: 'fermata', errore: 'ferma per un errore' };
    out.push('## Produzione', '', `**Stato:** ${STATO_P[p.stato]}. ${p.base ? `Base: copia della cartella "${p.base}".` : 'Partita da una cartella vuota.'}${p.cantiere ? ` Cantiere: \`${p.cantiere}\`.` : ''}`, '');
    if (p.resoconto) out.push(p.pacchetti ? '**Resoconto del cantiere:**' : '**Resoconto di Claude:**', '', p.resoconto, '');
    if (p.file.length) out.push('**File prodotti:**', '', ...p.file.map((x) => `- \`${x.percorso}\` (${x.caratteri} caratteri)`), '');
    for (const g of p.giri ?? []) {
      out.push(`**Collaudo del giro ${g.giro}:** non superato, si è corretto. ${g.collaudo.commento}`, '', voci(g.collaudo.problemi), '');
    }
    if (p.collaudo) {
      out.push(`**Collaudo${p.revisioni?.length ? '' : ' di Codex'}${p.giro && p.giro > 1 ? ` (giro ${p.giro})` : ''}:** ${p.collaudo.approvato ? 'superato' : 'non superato'}. ${p.collaudo.commento}`, '');
      if (p.collaudo.problemi.length) out.push(voci(p.collaudo.problemi), '');
    }
    if (p.errore) out.push(`**Errore:** ${p.errore.split('\n')[0]}`, '');
  }

  out.push('## Trascrizione integrale', '', ...d.turni.map((t) => `${turno(t)}\n`));

  const chiamate: { voce: string; c: Chiamata }[] = [];
  for (const t of d.turni) {
    chiamate.push({ voce: `intervento ${t.indice}`, c: t.chiamata });
    for (const i of t.incarichi ?? []) if (i.chiamata) chiamate.push({ voce: `incarico ${i.id} · ${chiE(i.assistente)}`, c: i.chiamata });
  }
  if (d.sintesi) chiamate.push({ voce: 'sintesi', c: d.sintesi.chiamata });
  if (d.verifica) chiamate.push({ voce: 'verifica', c: d.verifica.chiamata });
  // In produzione: pacchetti e revisioni per nome (ogni voce si usa una volta, nell'ordine in cui
  // sono state fatte); quello che resta sono i collaudi di Codex e le correzioni.
  const p = d.produzione;
  const note = new Map<string, string[]>();
  const nota = (c: Chiamata | undefined, voce: string) => {
    if (c) note.set(JSON.stringify(c), [...(note.get(JSON.stringify(c)) ?? []), voce]);
  };
  p?.pacchetti?.forEach((x, n) => nota(x.chiamata, `pacchetto ${n + 1} · ${chiE(x.assistente)}`));
  for (const r of p?.revisioni ?? []) nota(r.chiamata, `revisione · ${chiE(r.assistente)}`);
  for (const c of p?.chiamate ?? []) {
    const voce = note.get(JSON.stringify(c))?.shift() ?? (c.agente === 'codex' && !c.assistente ? 'collaudo' : c.assistente ? `correzione · ${chiE(c.assistente)}` : 'produzione');
    chiamate.push({ voce, c });
  }
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
