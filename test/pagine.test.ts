// Le anteprime dei file prodotti: tipi, ordine, copertina, e la pagina con dentro i fogli di stile e
// le immagini SVG del suo cantiere. Solo funzioni pure del web, niente DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { componiPagina, copertinaDi, fileInOrdine, inCornice, tipoDi, type FileProdotto } from '../web/src/pagine.ts';

const f = (percorso: string, anteprima?: string): FileProdotto => ({ percorso, caratteri: anteprima?.length ?? 30_000, ...(anteprima !== undefined ? { anteprima } : {}) });

test('tipi dei file e ordine: pagine con index in testa, poi documenti con LEGGIMI in testa, poi il resto', () => {
  assert.equal(tipoDi('index.HTML'), 'pagina');
  assert.equal(tipoDi('docs/note.md'), 'documento');
  assert.equal(tipoDi('stile.css'), 'stile');
  assert.equal(tipoDi('app.js'), 'script');
  assert.equal(tipoDi('dati.json'), 'dati');
  assert.equal(tipoDi('LICENSE'), 'testo');
  const ordine = fileInOrdine([f('stile.css', ''), f('note.md', ''), f('chi-siamo.html', ''), f('LEGGIMI.md', ''), f('index.html', ''), f('app.js', '')]);
  assert.deepEqual(ordine.map((x) => x.percorso), ['index.html', 'chi-siamo.html', 'LEGGIMI.md', 'note.md', 'stile.css', 'app.js']);
});

test('copertina: la prima pagina o il primo documento con anteprima, mai un file troppo lungo', () => {
  assert.equal(copertinaDi([f('index.html'), f('LEGGIMI.md', '# Ciao')])?.percorso, 'LEGGIMI.md');
  assert.equal(copertinaDi([f('LEGGIMI.md', '# Ciao'), f('index.html', '<p>x</p>')])?.percorso, 'index.html');
  assert.equal(copertinaDi([f('stile.css', 'body{}')]), undefined);
});

test('la pagina prende i fogli di stile del suo cantiere, anche da sottocartelle e risalendo', () => {
  const file = [
    f('index.html', '<link rel="stylesheet" href="stile.css"><link rel=stylesheet href=./css/altro.css?v=2>'),
    f('stile.css', 'body{color:red}'),
    f('css/altro.css', 'h1{color:blue}'),
    f('pagine/chi.html', "<link href='../stile.css' rel='stylesheet'>"),
  ];
  assert.equal(componiPagina(file, file[0]!), '<style>body{color:red}</style><style>h1{color:blue}</style>');
  assert.equal(componiPagina(file, file[3]!), '<style>body{color:red}</style>');
});

test('restano come sono: indirizzi veri, percorsi assoluti, fuori dal cantiere, file mancanti, link che non sono stili', () => {
  const file = [f('stile.css', 'body{}'), f('x/index.html', '')];
  const casi = [
    '<link rel="stylesheet" href="https://esempio.ch/a.css">',
    '<link rel="stylesheet" href="//esempio.ch/a.css">',
    '<link rel="stylesheet" href="/stile.css">',
    '<link rel="stylesheet" href="../../stile.css">',
    '<link rel="stylesheet" href="manca.css">',
    '<link rel="icon" href="../stile.css">',
  ];
  for (const html of casi) assert.equal(componiPagina(file, f('x/index.html', html)), html, html);
});

test('un foglio di stile non può chiudere il suo <style> e uscire nella pagina', () => {
  const file = [f('index.html', '<link rel="stylesheet" href="s.css">'), f('s.css', 'a{}</style><p>fuori</p><style>')];
  const pagina = componiPagina(file, file[0]!);
  assert.equal(pagina.match(/<\/style/gi)?.length, 1);
  assert.ok(pagina.endsWith('</style>'));
});

test('le immagini SVG del cantiere entrano come data URL, senza apici che rompano l\'attributo', () => {
  const svg = "<svg xmlns='http://www.w3.org/2000/svg'><rect width='4' height='4'/></svg>";
  const file = [f('index.html', '<img alt="logo" src="img/logo.svg"><img src="https://esempio.ch/x.svg">'), f('img/logo.svg', svg)];
  const pagina = componiPagina(file, file[0]!);
  const src = /src="(data:[^"]+)"/.exec(pagina)?.[1];
  assert.ok(src?.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.ok(!src!.includes("'"));
  assert.equal(decodeURIComponent(src!.slice(src!.indexOf(',') + 1)), svg);
  assert.ok(pagina.includes('src="https://esempio.ch/x.svg"'));
});

test('nella cornice la pagina ha una CSP sua che non lascia uscire richieste, dopo il doctype', () => {
  const c = inCornice('<!DOCTYPE html><html><head><link rel="stylesheet" href="/api/info"></head></html>');
  assert.match(c, /^<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; [^"]*">/);
  assert.match(inCornice('<p>ciao</p>'), /^<meta http-equiv="Content-Security-Policy"[^>]*><p>ciao<\/p>$/);
  assert.doesNotMatch(c.match(/content="([^"]*)"/)![1]!, /'self'|https?:/, 'niente richieste al programma né fuori');
});
