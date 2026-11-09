// Un turno di Codex tramite `codex exec`, con il login ChatGPT dell'utente.
// Isolamento: sandbox in sola lettura, strumenti spenti, configurazione utente ignorata.
import { trovaCodex } from '../ambiente.ts';
import { IMPOSTAZIONI } from '../impostazioni.ts';
import { MCP_MEMORIA } from '../memoria.ts';
import { ambientePulito, codaStderr, ErroreAgente, esegui, SESSIONE_PERSA } from '../processo.ts';
import { argomenti, descriviStrumento } from '../attivita.ts';
import type { Fase, Strumento, Uso } from '../tipi.ts';
import type { EsitoCli } from './claude.ts';

// Strumenti da agente spenti. I sub-agenti (spawn_agent) li impone il catalogo modelli e non si
// spengono: li ferma il controllo sugli item più sotto.
const SPENTI = [
  'shell_tool', 'unified_exec', 'memories', 'computer_use', 'browser_use', 'in_app_browser',
  'multi_agent', 'apps', 'plugins', 'goals', 'image_generation', 'hooks', 'view_image',
];
// Senza code_mode_host ogni chiamata allo strumento `exec` fallisce (patch, file, orologio, web).
// Web e server MCP passano da lì: con la ricerca web o con le note dell'utente si riaccende, e il
// controllo sugli item più sotto ferma comunque tutto ciò che non è web o la memoria.
const SENZA_STRUMENTI = ['code_mode_host'];
const ITEM_DA_CHAT = new Set(['agent_message', 'reasoning', 'error', 'todo_list']);

export interface OpzioniCodex {
  prompt: string;
  istruzioniFile: string;
  schemaFile?: string; // senza: risposta in testo libero (la chat)
  sessione?: string;
  modello?: string;
  ragionamento: string;
  ricercaWeb: boolean;
  memoria?: boolean;
  cartella: string;
  timeoutMs: number;
  signal?: AbortSignal;
  suAttivita?: (fase: Fase, testo?: string, strumento?: Strumento) => void;
}

export function turnoCodex(op: OpzioniCodex): Promise<EsitoCli> {
  const { comando, argsBase } = trovaCodex();
  // --strict-config: se un aggiornamento di Codex non riconosce più una chiave, meglio un errore
  // che una sandbox ignorata in silenzio.
  const comuni = [
    '--json', '--skip-git-repo-check', '--ignore-user-config', '--strict-config',
    // Senza l'ambiente acceso niente AGENTS.md di progetto: risalendo dalla cartella di lavoro Codex
    // troverebbe quello del repository di questo programma (regole per chi lo sviluppa).
    ...(IMPOSTAZIONI.ambiente ? [] : ['-c', 'project_doc_max_bytes=0']),
    '-c', `model_instructions_file=${JSON.stringify(op.istruzioniFile)}`,
    '-c', `model_reasoning_effort="${op.ragionamento}"`,
    '-c', `web_search="${op.ricercaWeb ? 'live' : 'disabled'}"`,
    ...[...SPENTI, ...(op.ricercaWeb || op.memoria ? [] : SENZA_STRUMENTI)].flatMap((f) => ['--disable', f]),
    ...(op.schemaFile ? ['--output-schema', op.schemaFile] : []),
    // Le note dell'utente: l'unico server MCP, in sola lettura, scritto in questo progetto.
    ...(op.memoria ? [
      '-c', `mcp_servers.memoria.command=${JSON.stringify(MCP_MEMORIA.command)}`,
      '-c', `mcp_servers.memoria.args=${JSON.stringify(MCP_MEMORIA.args)}`,
    ] : []),
  ];
  if (op.modello) comuni.push('-m', op.modello);
  const ammessi = new Set([...ITEM_DA_CHAT, ...(op.ricercaWeb ? ['web_search'] : []), ...(op.memoria ? ['mcp_tool_call'] : [])]);
  // `resume` non accetta -s né -C: la sandbox va come config e la cartella come cwd.
  const args = op.sessione
    ? [...argsBase, 'exec', 'resume', op.sessione, '-', ...comuni, '-c', 'sandbox_mode="read-only"']
    : [...argsBase, 'exec', '-', ...comuni, '-s', 'read-only', '-C', op.cartella];

  const inizio = Date.now();
  let sessione = op.sessione ?? '';
  const testi: string[] = [];
  const avvisi: string[] = [];
  let errore: string | undefined;
  let uso: Uso = { ingresso: 0, inCache: 0, uscita: 0 };

  return esegui({
    comando,
    args,
    cwd: op.cartella,
    env: ambientePulito(),
    input: op.prompt,
    timeoutMs: op.timeoutMs,
    signal: op.signal,
    suRiga: (riga, ferma) => {
      if (!riga.trim().startsWith('{')) return;
      const ev = JSON.parse(riga);
      const item = ev.item;
      if ((ev.type === 'item.started' || ev.type === 'item.completed') && item?.type && !ammessi.has(item.type)) {
        return ferma(`Codex ha provato a usare uno strumento (${item.type}): turno fermato`);
      }
      // Strumenti MCP: solo quelli del server della memoria.
      if (item?.type === 'mcp_tool_call' && item.server !== 'memoria') return ferma(`Codex ha provato a usare il server MCP ${item.server}: turno fermato`);
      if (ev.type === 'thread.started') sessione = ev.thread_id;
      else if (ev.type === 'turn.started') op.suAttivita?.('ragionamento');
      else if (ev.type === 'item.started' && item?.type === 'reasoning') op.suAttivita?.('ragionamento');
      else if (ev.type === 'item.started' && item?.type === 'mcp_tool_call') {
        const d = descriviStrumento(String(item.tool ?? item.name ?? ''), argomenti(item.arguments ?? item.args));
        op.suAttivita?.('strumento', d.testo, d.strumento);
      } else if (ev.type === 'item.started' && item?.type === 'web_search') {
        const d = descriviStrumento('web_search', { query: item.query });
        op.suAttivita?.('strumento', d.testo, d.strumento);
      } else if (ev.type === 'item.completed' && (item?.type === 'mcp_tool_call' || item?.type === 'web_search')) op.suAttivita?.('ragionamento');
      else if (ev.type === 'item.completed' && item?.type === 'agent_message' && item.text) {
        testi.push(item.text);
        op.suAttivita?.('risposta');
      } else if (ev.type === 'turn.completed') {
        const u = ev.usage ?? {};
        uso = { ingresso: u.input_tokens ?? 0, inCache: u.cached_input_tokens ?? 0, uscita: (u.output_tokens ?? 0) + (u.reasoning_output_tokens ?? 0) };
      } else if (ev.type === 'turn.failed') errore = ev.error?.message ?? 'turno fallito';
      else if (ev.type === 'error' && ev.message) avvisi.push(ev.message); // es. "Reconnecting... 1/5", non fatale
    },
  }).then(({ codice, stderr, fermato }) => {
    if (fermato) {
      const tipo = /strument/.test(fermato) ? 'strumento' : /entro/.test(fermato) ? 'tempo' : 'altro';
      throw new ErroreAgente(`Codex: ${fermato}`, tipo, tipo === 'tempo');
    }
    const ultimo = testi.at(-1);
    if (op.sessione && !ultimo && SESSIONE_PERSA.test([errore ?? '', ...avvisi, stderr].join('\n'))) {
      throw new ErroreAgente('Codex: la sessione da riprendere non c\'è più', 'sessione', true);
    }
    if (errore || !ultimo) {
      const dettaglio = errore ?? avvisi.at(-1) ?? `Codex è uscito con codice ${codice} senza risposta`;
      const limite = /usage limit|rate limit|quota|too many requests/i.test(dettaglio);
      throw new ErroreAgente(`Codex: ${dettaglio}\n${codaStderr(stderr)}`.trim(), limite ? 'limite' : 'altro', true);
    }
    return {
      testo: ultimo,
      sessione,
      modello: op.modello ?? 'predefinito di Codex',
      uso,
      secondi: Math.round((Date.now() - inizio) / 100) / 10,
      controllo: 'codex exec, login ChatGPT, sandbox read-only, strumenti spenti',
    };
  });
}
