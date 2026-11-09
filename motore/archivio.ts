// Un file JSON per dibattito, riscritto per intero a ogni passo (scrittura su file temporaneo e
// rinomina, così un'interruzione non lascia un file a metà).
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import type { Dibattito } from './tipi.ts';

const FORMATO_ID = /^\d{8}-\d{4}-[0-9a-f]{6}$/;

export function nuovoId(ora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const giorno = `${ora.getFullYear()}${p(ora.getMonth() + 1)}${p(ora.getDate())}`;
  return `${giorno}-${p(ora.getHours())}${p(ora.getMinutes())}-${randomBytes(3).toString('hex')}`;
}

// Su Windows antivirus e indicizzatore tengono aperti i file per qualche istante.
function riprova<T>(fn: () => T): T {
  for (let i = 0; ; i++) {
    try {
      return fn();
    } catch (e) {
      const codice = (e as NodeJS.ErrnoException).code;
      if (i >= 10 || !['EBUSY', 'EPERM', 'EACCES'].includes(codice ?? '')) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

// I lucchetti tenuti da questo processo: se ne rinnova la data ogni 30 secondi.
const SCADENZA_LUCCHETTO = 120_000;
const tenuti = new Set<string>();
let rinnovo: ReturnType<typeof setInterval> | undefined;
function rinnova(): void {
  if (rinnovo) return;
  rinnovo = setInterval(() => {
    const ora = new Date();
    for (const f of tenuti) {
      try {
        utimesSync(f, ora, ora);
      } catch {
        tenuti.delete(f);
      }
    }
    if (!tenuti.size) {
      clearInterval(rinnovo);
      rinnovo = undefined;
    }
  }, 30_000);
  rinnovo.unref();
}

export function creaArchivio(cartellaDati: string) {
  const dir = join(cartellaDati, 'dibattiti');
  const esportazioni = join(cartellaDati, 'esportazioni');
  mkdirSync(dir, { recursive: true });
  mkdirSync(esportazioni, { recursive: true });
  const segnalati = new Set<string>();
  const file = (id: string) => {
    if (!FORMATO_ID.test(id)) throw new Error(`id di dibattito non valido: ${id}`);
    return join(dir, `${id}.json`);
  };

  return {
    salva(d: Dibattito): void {
      d.aggiornato = new Date().toISOString();
      const dest = file(d.id);
      const tmp = `${dest}.tmp`;
      // fsync prima della rinomina: dopo un'interruzione di corrente il file è vecchio o nuovo, mai vuoto.
      riprova(() => {
        const fd = openSync(tmp, 'w');
        try {
          writeSync(fd, JSON.stringify(d, null, 2), null, 'utf8');
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
      });
      riprova(() => renameSync(tmp, dest));
    },
    carica(id: string): Dibattito | undefined {
      const f = file(id);
      if (!existsSync(f)) return undefined;
      return JSON.parse(riprova(() => readFileSync(f, 'utf8'))) as Dibattito;
    },
    // Un file estraneo o rovinato (una copia fatta a mano, un file vuoto) non deve bloccare il resto.
    elenco(): Dibattito[] {
      const voci: Dibattito[] = [];
      for (const f of readdirSync(dir)) {
        const id = f.slice(0, -5);
        if (!f.endsWith('.json') || !FORMATO_ID.test(id)) continue;
        try {
          const d = this.carica(id);
          if (d) voci.push(d);
        } catch (e) {
          if (!segnalati.has(f)) console.error(`archivio: salto ${f} (${(e as Error).message})`);
          segnalati.add(f);
        }
      }
      return voci.sort((a, b) => b.aggiornato.localeCompare(a.aggiornato));
    },
    // Un dibattito lo esegue un solo processo alla volta (server o CLI): il lucchetto è un file
    // con il pid. Se quel processo non esiste più, il lucchetto è scaduto e si riprende.
    blocca(id: string): boolean {
      const f = `${file(id)}.lock`;
      for (let i = 0; i < 2; i++) {
        try {
          const fd = openSync(f, 'wx');
          writeSync(fd, String(process.pid));
          closeSync(fd);
          tenuti.add(f);
          rinnova();
          return true;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
          if (this.bloccatoDa(id) !== null) return false;
          try { unlinkSync(f); } catch { /* già tolto */ }
        }
      }
      return false;
    },
    sblocca(id: string): void {
      tenuti.delete(`${file(id)}.lock`);
      try {
        if (Number(readFileSync(`${file(id)}.lock`, 'utf8')) === process.pid) unlinkSync(`${file(id)}.lock`);
      } catch { /* niente lucchetto */ }
    },
    // Il pid di un ALTRO processo vivo che tiene il dibattito, oppure null.
    bloccatoDa(id: string): number | null {
      let pid: number;
      try {
        pid = Number(readFileSync(`${file(id)}.lock`, 'utf8'));
      } catch {
        return null;
      }
      if (!pid || pid === process.pid) return null;
      // Un lucchetto non rinnovato da oltre 2 minuti è di un processo morto (il pid può essere
      // stato riusato da un altro programma).
      try {
        if (Date.now() - statSync(`${file(id)}.lock`).mtimeMs > SCADENZA_LUCCHETTO) return null;
      } catch {
        return null;
      }
      try {
        process.kill(pid, 0);
        return pid;
      } catch (e) {
        return (e as NodeJS.ErrnoException).code === 'EPERM' ? pid : null;
      }
    },
    salvaMarkdown(id: string, testo: string): string {
      file(id);
      const dest = join(esportazioni, `${id}.md`);
      riprova(() => writeFileSync(dest, testo, 'utf8'));
      return dest;
    },
  };
}

export type Archivio = ReturnType<typeof creaArchivio>;
