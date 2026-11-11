// I file prodotti da una produzione: che tipo sono, in che ordine si mostrano, e la pagina con dentro
// i suoi fogli di stile e le sue immagini SVG. Solo funzioni pure, senza DOM: le provano i test.
import type { Dibattito } from '../../motore/tipi.ts';

export type FileProdotto = NonNullable<Dibattito['produzione']>['file'][number];
export type TipoFile = 'pagina' | 'documento' | 'stile' | 'script' | 'dati' | 'testo';

export function tipoDi(percorso: string): TipoFile {
  if (/\.html?$/i.test(percorso)) return 'pagina';
  if (/\.(md|markdown)$/i.test(percorso)) return 'documento';
  if (/\.(css|scss|less)$/i.test(percorso)) return 'stile';
  if (/\.(m?js|cjs|jsx|tsx?)$/i.test(percorso)) return 'script';
  if (/\.(json|ya?ml|toml|csv|xml|svg)$/i.test(percorso)) return 'dati';
  return 'testo';
}

const ORDINE: Record<TipoFile, number> = { pagina: 0, documento: 1, stile: 2, script: 3, dati: 4, testo: 5 };
export const nomeFile = (percorso: string) => percorso.split('/').pop() ?? percorso;
const principale = (p: string) => /^(index\.html?|leggimi\.md|readme\.md)$/i.test(nomeFile(p));

// Prima le pagine (index in testa), poi i documenti (LEGGIMI in testa), poi stili, script e dati.
export function fileInOrdine(file: FileProdotto[]): FileProdotto[] {
  const chiave = (f: FileProdotto) => [ORDINE[tipoDi(f.percorso)], principale(f.percorso) ? 0 : 1, f.percorso.split('/').length] as const;
  return [...file].sort((a, b) => {
    const [x, y] = [chiave(a), chiave(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.percorso.localeCompare(b.percorso);
  });
}

// La copertina di un lavoro: la prima pagina o il primo documento che si possono mostrare.
export const copertinaDi = (file: FileProdotto[]) =>
  fileInOrdine(file).find((f) => f.anteprima !== undefined && (tipoDi(f.percorso) === 'pagina' || tipoDi(f.percorso) === 'documento'));

// Un riferimento della pagina portato a un percorso del cantiere. Indirizzi veri, percorsi assoluti
// e percorsi che escono dal cantiere non si risolvono: restano come sono e la cornice non li carica.
function risolvi(base: string, rif: string): string | null {
  if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(rif)) return null;
  const parti = base ? base.split('/') : [];
  for (const x of rif.split(/[?#]/)[0]!.split('/')) {
    if (x === '' || x === '.') continue;
    if (x !== '..') parti.push(x);
    else if (!parti.length) return null;
    else parti.pop();
  }
  return parti.join('/');
}

// La pagina con dentro i suoi fogli di stile e le sue immagini SVG, presi dagli altri file prodotti.
// La pagina come va nella cornice: in testa una CSP sua che non lascia uscire nessuna richiesta, né
// verso fuori né verso il server del programma (la cornice srcdoc erediterebbe l'origine della
// dashboard). Restano gli stili scritti nella pagina e le immagini già dentro come dati.
const CSP_CORNICE = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:\">";
export function inCornice(html: string): string {
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)?.[0] ?? '';
  return doctype + CSP_CORNICE + html.slice(doctype.length);
}

export function componiPagina(file: FileProdotto[], pagina: FileProdotto): string {
  const html = pagina.anteprima ?? '';
  const base = pagina.percorso.includes('/') ? pagina.percorso.slice(0, pagina.percorso.lastIndexOf('/')) : '';
  const testo = (rif: string) => {
    const p = risolvi(base, rif);
    return p === null ? undefined : file.find((f) => f.percorso === p)?.anteprima;
  };
  return html
    .replace(/<link\b[^>]*>/gi, (tag) => {
      if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
      const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
      const css = href ? testo(href[1] ?? href[2] ?? href[3] ?? '') : undefined;
      return css === undefined ? tag : `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
    })
    .replace(/(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+\.svg)\2/gi, (tutto, prima: string, q: string, src: string) => {
      const svg = testo(src);
      return svg === undefined ? tutto : `${prima}${q}data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg).replace(/'/g, '%27')}${q}`;
    });
}
