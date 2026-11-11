import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import { createRoot } from 'react-dom/client';
import { api, ErroreChiamata } from './api.ts';
import { App } from './App.tsx';
import './stile.css';

// Gli errori della pagina vanno al motore, che ne fa un rapporto d'errore solo se l'utente li vuole e
// lo ripulisce lui. Contano solo quelli del codice del programma (non delle estensioni del browser),
// non i problemi di rete o le risposte del motore, e al massimo 5 per pagina aperta.
let segnalati = 0;
function segnala(e: unknown): void {
  if (!(e instanceof Error) || e instanceof ErroreChiamata || !e.stack || !e.stack.includes(`${location.origin}/assets/`)) return;
  if (/Failed to fetch|NetworkError|Load failed|ResizeObserver loop/i.test(e.message) || ++segnalati > 5) return;
  void api.segnalaPagina({ tipo: e.name, messaggio: e.message, stack: e.stack }).catch(() => undefined);
}
window.addEventListener('error', (ev) => segnala(ev.error));
window.addEventListener('unhandledrejection', (ev) => segnala(ev.reason));

// Niente StrictMode: con React 19 il doppio montaggio smonta le etichette 3D di drei (Html) e non le rimonta.
createRoot(document.getElementById('root')!, { onUncaughtError: (e) => segnala(e) }).render(<App />);
