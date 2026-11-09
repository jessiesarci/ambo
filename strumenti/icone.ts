// Le icone dell'app (per "Aggiungi alla schermata Home"): disegnate qui da forme semplici, senza
// librerie, nei colori del progetto. Scrive web/public/icona.svg e i PNG 180/192/512.
//   node strumenti/icone.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { RADICE } from '../motore/ambiente.ts';

type Colore = [number, number, number];
const NERO: Colore = [0x14, 0x15, 0x18];
const LIME: Colore = [0xb5, 0xf9, 0x00];
const GRIGIO: Colore = [0x9a, 0xa3, 0xad];
const BIANCO: Colore = [0xff, 0xff, 0xff];

// Le forme in unità di 64, come l'SVG. bordo: per la versione "maskable" il fondo copre tutto.
function forme(pieno: boolean) {
  const rett = (x: number, y: number, w: number, h: number, r: number) => (px: number, py: number) => {
    const cx = Math.min(Math.max(px, x + r), x + w - r);
    const cy = Math.min(Math.max(py, y + r), y + h - r);
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
  };
  const cerchio = (x: number, y: number, r: number) => (px: number, py: number) => (px - x) ** 2 + (py - y) ** 2 <= r * r;
  return [
    { colore: NERO, dentro: pieno ? () => true : rett(0, 0, 64, 64, 14) },
    { colore: LIME, dentro: cerchio(22, 29, 9) },
    { colore: GRIGIO, dentro: cerchio(42, 29, 9) },
    { colore: BIANCO, dentro: rett(14, 43, 36, 6, 3) },
  ];
}

function png(lato: number, pieno: boolean): Buffer {
  const f = forme(pieno);
  const CAMPIONI = 4; // 4×4 campioni per pixel: bordi morbidi
  const righe = Buffer.alloc((lato * 4 + 1) * lato);
  for (let y = 0; y < lato; y++) {
    righe[y * (lato * 4 + 1)] = 0;
    for (let x = 0; x < lato; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < CAMPIONI; sy++) {
        for (let sx = 0; sx < CAMPIONI; sx++) {
          const px = ((x + (sx + 0.5) / CAMPIONI) / lato) * 64;
          const py = ((y + (sy + 0.5) / CAMPIONI) / lato) * 64;
          const sopra = [...f].reverse().find((s) => s.dentro(px, py));
          if (!sopra) continue;
          r += sopra.colore[0]; g += sopra.colore[1]; b += sopra.colore[2]; a += 255;
        }
      }
      const n = CAMPIONI * CAMPIONI;
      const copertura = a / n / 255;
      const i = y * (lato * 4 + 1) + 1 + x * 4;
      righe[i] = copertura ? Math.round(r / n / copertura) : 0;
      righe[i + 1] = copertura ? Math.round(g / n / copertura) : 0;
      righe[i + 2] = copertura ? Math.round(b / n / copertura) : 0;
      righe[i + 3] = Math.round(a / n);
    }
  }
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const pezzo = (tipo: string, dati: Buffer) => {
    const t = Buffer.from(tipo, 'ascii');
    const lung = Buffer.alloc(4); lung.writeUInt32BE(dati.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, dati])));
    return Buffer.concat([lung, t, dati, c]);
  };
  const testa = Buffer.alloc(13);
  testa.writeUInt32BE(lato, 0); testa.writeUInt32BE(lato, 4);
  testa[8] = 8; testa[9] = 6; // 8 bit, RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pezzo('IHDR', testa), pezzo('IDAT', deflateSync(righe, { level: 9 })), pezzo('IEND', Buffer.alloc(0))]);
}

const PUBBLICO = join(RADICE, 'web', 'public');
writeFileSync(join(PUBBLICO, 'icona.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#141518"/><circle cx="22" cy="29" r="9" fill="#b5f900"/><circle cx="42" cy="29" r="9" fill="#9aa3ad"/><rect x="14" y="43" width="36" height="6" rx="3" fill="#ffffff"/></svg>\n');
// iPhone arrotonda da sé: fondo pieno. Android: 192 e 512, più la versione "maskable" a fondo pieno.
writeFileSync(join(PUBBLICO, 'icona-180.png'), png(180, true));
writeFileSync(join(PUBBLICO, 'icona-192.png'), png(192, false));
writeFileSync(join(PUBBLICO, 'icona-512.png'), png(512, false));
writeFileSync(join(PUBBLICO, 'icona-maskable-512.png'), png(512, true));
console.log('icone scritte in web/public');
