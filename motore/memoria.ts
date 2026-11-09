// Come si avvia il server delle note (memoria-mcp.ts) dentro le CLI degli agenti. Le fonti stanno in
// un file scritto dal motore: le CLI non passano sempre le variabili d'ambiente ai server MCP.
import { join } from 'node:path';
import { RADICE } from './ambiente.ts';
import { FILE_FONTI } from './impostazioni.ts';

export const MCP_MEMORIA = { command: process.execPath, args: [join(RADICE, 'motore', 'memoria-mcp.ts'), FILE_FONTI] };

// Nomi degli strumenti come li vede Claude Code (mcp__<server>__<strumento>).
export const STRUMENTI_MEMORIA = {
  claude: ['mcp__memoria__cerca', 'mcp__memoria__leggi', 'mcp__memoria__elenco'],
};
