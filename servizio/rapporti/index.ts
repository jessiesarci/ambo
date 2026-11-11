// Il servizio che riceve i rapporti d'errore di Ambo: una funzione Edge di Supabase (Deno), con la
// tabella in uno schema privato (servizio/rapporti/tabella.sql). Il codice è qui perché si possa
// controllare cosa tiene, e perché chi pubblica una sua versione di Ambo ne possa avere uno suo
// (poi AMBO_RAPPORTI_URL nel suo .env). Si pubblica senza controllo del JWT (supabase functions
// deploy ambo-rapporti --no-verify-jwt): il motore non ha login, quindi si controlla ogni campo.
// - Ogni campo ha la forma di quelli che il programma prepara: niente testo libero oltre al
//   messaggio (300 caratteri), ogni riga dello stack è un punto del codice di Ambo.
// - Gli errori uguali (stessa impronta e versione) si contano; il primo messaggio salvato non cambia.
// - Tetti: 300 errori nuovi all'ora, 1000 al giorno, 20 000 in tutto. Il conteggio e l'inserimento
//   stanno nella stessa transazione, sotto un lucchetto: le richieste in parallelo non li superano.
// - Non si salva l'indirizzo IP, né altro della richiesta oltre ai campi del rapporto.
// - 180 giorni dopo l'ultima volta che è arrivato, un errore si cancella: ogni notte (pg_cron) e a
//   ogni richiesta.
// - Con i segreti AMBO_TELEGRAM_TOKEN e AMBO_TELEGRAM_CHAT un errore nuovo arriva anche su Telegram,
//   solo con versione, dove, tipo e impronta (al massimo 20 avvisi all'ora).
import postgres from 'npm:postgres@3.4.7';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 2, prepare: false, idle_timeout: 20, connect_timeout: 10 });
const DOVE = new Set(['chat', 'riunione', 'produzione', 'server', 'dashboard']);
const MAX_CORPO = 8_000;
const MAX_NUOVI_ORA = 300;
const MAX_NUOVI_GIORNO = 1_000;
const MAX_TOTALE = 20_000;
const MAX_AVVISI_ORA = 20;
const LUCCHETTO = 52417; // un numero qualsiasi, uguale per tutte le richieste
const PUNTO = /^(?:[\w$.<>]+ )?(?:(?:motore|web\/src|strumenti)\/[\w./-]+\.(?:ts|tsx|js|mjs)|assets\/index-[\w-]+\.js):\d+:\d+$/;

const risposta = (stato: number, testo = '') => new Response(stato === 204 ? null : testo, { status: stato, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
const campo = (v: unknown, max: number, re?: RegExp): string | null => (typeof v === 'string' && v.length <= max && (!re || re.test(v)) ? v : null);

interface Valido { versione: string; impronta: string; dove: string; tipo: string; messaggio: string; sistema: string; node: string; stack: string[] }

function valida(r: Record<string, unknown>): Valido | null {
  const versione = campo(r.versione, 20, /^\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  const impronta = campo(r.impronta, 12, /^[0-9a-f]{12}$/);
  const dove = typeof r.dove === 'string' && DOVE.has(r.dove) ? r.dove : null;
  const tipo = campo(r.tipo, 60, /^[\w.:-]+$/);
  const messaggio = campo(r.messaggio, 300);
  const sistema = campo(r.sistema, 60, /^[\w .-]+$/);
  const node = campo(r.node, 20, /^[\w.-]+$/);
  const stack = Array.isArray(r.stack) && r.stack.length <= 12 && r.stack.every((x) => typeof x === 'string' && x.length <= 200 && PUNTO.test(x)) ? (r.stack as string[]) : null;
  if (!versione || !impronta || !dove || !tipo || messaggio === null || !sistema || !node || !stack) return null;
  return { versione, impronta, dove, tipo, messaggio, sistema, node, stack };
}

async function avvisa(v: Valido): Promise<void> {
  const token = Deno.env.get('AMBO_TELEGRAM_TOKEN');
  const chat = Deno.env.get('AMBO_TELEGRAM_CHAT');
  if (!token || !chat) return;
  const [{ n }] = await sql`select count(*)::int as n from ambo.errori where primo > now() - interval '1 hour'`;
  if (n > MAX_AVVISI_ORA) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: `Ambo ${v.versione} · errore nuovo\n${v.dove} · ${v.tipo}\nimpronta ${v.impronta}`, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return risposta(405, 'solo POST');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_CORPO) return risposta(413, 'rapporto troppo grande');
  const corpo = await req.text();
  if (corpo.length > MAX_CORPO) return risposta(413, 'rapporto troppo grande');
  let r: unknown;
  try {
    r = JSON.parse(corpo);
  } catch {
    return risposta(400, 'JSON non valido');
  }
  const v = r && typeof r === 'object' && !Array.isArray(r) ? valida(r as Record<string, unknown>) : null;
  if (!v) return risposta(400, 'rapporto non valido');
  try {
    const esito = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${LUCCHETTO})`;
      await tx`delete from ambo.errori where ultimo < now() - interval '180 days'`;
      const [gia] = await tx`update ambo.errori set volte = volte + 1, ultimo = now() where impronta = ${v.impronta} and versione = ${v.versione} returning 1`;
      if (gia) return 'contato';
      const [{ ora, giorno, totale }] = await tx`select
        count(*) filter (where primo > now() - interval '1 hour')::int as ora,
        count(*) filter (where primo > now() - interval '1 day')::int as giorno,
        count(*)::int as totale
        from ambo.errori`;
      if (ora >= MAX_NUOVI_ORA || giorno >= MAX_NUOVI_GIORNO || totale >= MAX_TOTALE) return 'pieno';
      await tx`insert into ambo.errori (impronta, versione, dove, tipo, messaggio, stack, sistema, node)
        values (${v.impronta}, ${v.versione}, ${v.dove}, ${v.tipo}, ${v.messaggio}, ${sql.json(v.stack)}, ${v.sistema}, ${v.node})`;
      return 'nuovo';
    });
    if (esito === 'pieno') return risposta(429, 'troppi rapporti in questo momento');
    if (esito === 'nuovo') await avvisa(v);
    return risposta(204);
  } catch (e) {
    console.error('rapporto non salvato:', (e as Error).message);
    return risposta(500, 'rapporto non salvato');
  }
});
