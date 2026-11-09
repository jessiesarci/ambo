// Un turno di Claude tramite `claude -p` (Claude Code headless), con il login dell'abbonamento.
import { CONSENTI_API, trovaClaude } from '../ambiente.ts';
import { IMPOSTAZIONI } from '../impostazioni.ts';
import { MCP_MEMORIA, STRUMENTI_MEMORIA } from '../memoria.ts';
import { ambientePulito, codaStderr, ErroreAgente, esegui, SESSIONE_PERSA } from '../processo.ts';
import { descriviStrumento } from '../attivita.ts';
import type { Fase, Strumento, Uso } from '../tipi.ts';

export interface EsitoCli {
  testo: string;
  sessione: string;
  modello: string;
  uso: Uso;
  secondi: number;
  controllo: string;
}

export interface OpzioniClaude {
  prompt: string;
  sistema: string;
  sessione?: string;
  modello: string;
  ragionamento?: string;
  ricercaWeb: boolean;
  memoria?: boolean;
  cartella: string;
  timeoutMs: number;
  signal?: AbortSignal;
  suAttivita?: (fase: Fase, testo?: string, strumento?: Strumento) => void;
}

// Sopra le impostazioni dell'utente: niente hook, e un divieto esplicito degli strumenti che scrivono o
// eseguono (in più di --tools, che già non li carica).
export const IMPOSTAZIONI_AMBIENTE = {
  disableAllHooks: true,
  permissions: { deny: ['Bash', 'Write', 'Edit', 'NotebookEdit', 'WebFetch', 'Agent', 'Task'] },
};

export function turnoClaude(op: OpzioniClaude): Promise<EsitoCli> {
  const { comando, argsBase } = trovaClaude();
  // Con l'ambiente acceso (AMBO_AMBIENTE=1) Claude parte con le impostazioni utente di Claude
  // Code: CLAUDE.md, plugin e skill (strumento Skill). Senza, nessuna impostazione utente.
  // Le note (op.memoria) sono il server MCP delle note, in sola lettura.
  const ambiente = IMPOSTAZIONI.ambiente;
  const note = !!op.memoria;
  const integrati = [...(ambiente ? ['Skill'] : []), ...(op.ricercaWeb ? ['WebSearch'] : [])];
  const strumenti = [...integrati, ...(note ? STRUMENTI_MEMORIA.claude : [])];
  const serverAmmessi = note ? ['memoria'] : [];
  const args = [
    ...argsBase,
    '-p',
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    // Strumenti integrati solo quelli elencati (niente Bash, file, web fetch, sub-agenti), anche se le
    // impostazioni dell'utente li permettono: --tools li toglie del tutto. Server MCP solo la memoria:
    // quelli dell'utente possono scrivere file o usare la rete, e alcuni fanno fallire la richiesta.
    // dontAsk nega tutto ciò che non è elencato; gli hook dell'utente restano spenti.
    '--tools', integrati.join(','),
    ...(note ? ['--mcp-config', JSON.stringify({ mcpServers: { memoria: MCP_MEMORIA } })] : []),
    ...(strumenti.length ? ['--allowedTools', strumenti.join(',')] : []),
    '--permission-mode', 'dontAsk',
    '--strict-mcp-config',
    ...(ambiente
      ? ['--setting-sources', 'user', '--settings', JSON.stringify(IMPOSTAZIONI_AMBIENTE)]
      : ['--setting-sources', '', '--disable-slash-commands']),
    '--system-prompt', op.sistema,
    '--model', op.modello,
    ...(op.ragionamento ? ['--effort', op.ragionamento] : []),
    ...(op.sessione ? ['--resume', op.sessione] : []),
  ];

  const inizio = Date.now();
  let sessione = op.sessione ?? '';
  let modello = op.modello;
  let testo: string | undefined;
  let erroreRisultato: string | undefined;
  let uso: Uso = { ingresso: 0, inCache: 0, uscita: 0 };
  let limite: { tipo: string; reset?: number } | undefined;
  let parziale = '';
  let ultimoInvio = 0;

  return esegui({
    comando,
    args,
    cwd: op.cartella,
    env: ambientePulito({ CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' }),
    input: op.prompt,
    timeoutMs: op.timeoutMs,
    signal: op.signal,
    suRiga: (riga, ferma) => {
      if (!riga.startsWith('{')) return;
      const ev = JSON.parse(riga);

      if (ev.type === 'system' && ev.subtype === 'init') {
        sessione = ev.session_id ?? sessione;
        modello = ev.model ?? modello;
        // "none" = login OAuth dell'abbonamento. Qualsiasi altro valore vuol dire chiave API.
        if (ev.apiKeySource !== 'none' && !CONSENTI_API) return ferma(`Claude userebbe una chiave API (apiKeySource=${ev.apiKeySource}): turno fermato prima di consumare`);
        const extra = (ev.tools ?? []).filter((t: string) => !strumenti.includes(t));
        const serverExtra = (ev.mcp_servers ?? []).map((s: { name: string }) => s.name).filter((n: string) => !serverAmmessi.includes(n));
        if (extra.length || serverExtra.length) return ferma(`Claude è partito con strumenti non previsti (${[...extra, ...serverExtra].join(', ')})`);
        op.suAttivita?.('ragionamento');
      } else if (ev.type === 'rate_limit_event') {
        const info = ev.rate_limit_info ?? {};
        // I crediti extra si fermano sempre, anche con AMBO_CONSENTI_API: quella vale per le chiavi API.
        if (info.isUsingOverage) return ferma('Claude sta usando crediti extra a consumo: dibattito fermato. Disattiva gli "usage credits" nelle impostazioni del piano');
        if (info.status === 'rejected') {
          limite = { tipo: info.rateLimitType ?? 'abbonamento', reset: info.resetsAt };
          return ferma('limite');
        }
      } else if (ev.type === 'stream_event') {
        const e = ev.event ?? {};
        // Ogni messaggio nuovo (dopo una ricerca nelle note, per esempio) riparte da zero: il testo
        // dal vivo è quello del messaggio che sta scrivendo, che alla fine è la risposta.
        if (e.type === 'message_start') parziale = '';
        else if (e.type === 'content_block_start') {
          const tipo = e.content_block?.type;
          if (tipo === 'thinking') op.suAttivita?.('ragionamento');
          else if (tipo === 'text') op.suAttivita?.('risposta', parziale);
          else if (tipo === 'tool_use' && !strumenti.includes(e.content_block.name)) return ferma(`Claude ha provato a usare uno strumento (${e.content_block.name}): turno fermato`);
        } else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
          parziale += e.delta.text;
          if (Date.now() - ultimoInvio > 300) {
            ultimoInvio = Date.now();
            op.suAttivita?.('risposta', parziale);
          }
        }
      } else if (ev.type === 'assistant') {
        // Il messaggio completo porta l'input degli strumenti: è il momento in cui l'agente li usa.
        for (const c of ev.message?.content ?? []) {
          if (c?.type !== 'tool_use') continue;
          if (!strumenti.includes(c.name)) return ferma(`Claude ha provato a usare uno strumento (${c.name}): turno fermato`);
          const d = descriviStrumento(c.name, c.input);
          op.suAttivita?.('strumento', d.testo, d.strumento);
        }
      } else if (ev.type === 'user' && (ev.message?.content ?? []).some((c: { type?: string }) => c?.type === 'tool_result')) {
        op.suAttivita?.('ragionamento');
      } else if (ev.type === 'result') {
        sessione = ev.session_id ?? sessione;
        const u = ev.usage ?? {};
        uso = {
          ingresso: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
          inCache: u.cache_read_input_tokens ?? 0,
          uscita: u.output_tokens ?? 0,
        };
        if (ev.is_error || ev.subtype !== 'success') erroreRisultato = typeof ev.result === 'string' && ev.result ? ev.result : ev.subtype;
        else testo = ev.result;
      }
    },
  }).then(({ codice, stderr, fermato }) => {
    if (fermato === 'limite' && limite) {
      const quando = limite.reset ? new Date(limite.reset * 1000).toLocaleString('it-CH') : 'più tardi';
      throw new ErroreAgente(`Claude: limite dell'abbonamento raggiunto (${limite.tipo}), si azzera ${quando}`, 'limite', true);
    }
    if (fermato) {
      const tipo = /chiave API|consumo/.test(fermato) ? 'consumo' : /strument/.test(fermato) ? 'strumento' : /entro/.test(fermato) ? 'tempo' : 'altro';
      throw new ErroreAgente(`Claude: ${fermato}`, tipo, tipo === 'tempo');
    }
    const tutto = `${erroreRisultato ?? ''}\n${stderr}`;
    if (op.sessione && !testo && SESSIONE_PERSA.test(tutto)) throw new ErroreAgente('Claude: la sessione da riprendere non c\'è più', 'sessione', true);
    if (erroreRisultato) {
      const limiteTesto = /limit|usage/i.test(erroreRisultato);
      throw new ErroreAgente(`Claude: ${erroreRisultato}`, limiteTesto ? 'limite' : 'altro', true);
    }
    if (!testo) throw new ErroreAgente(`Claude è uscito con codice ${codice} senza risposta\n${codaStderr(stderr)}`.trim(), 'altro', true);
    return {
      testo,
      sessione,
      modello,
      uso,
      secondi: Math.round((Date.now() - inizio) / 100) / 10,
      controllo: 'claude -p, login abbonamento (apiKeySource=none), nessun credito extra',
    };
  });
}
