# Materiale di terze parti

Il codice di Ambo è sotto licenza MIT (vedi [LICENSE](LICENSE)). Questo file elenca il materiale di altri autori incluso nel repository o usato dal programma, con la sua licenza.

## Modelli 3D

Tutti in pubblico dominio (CC0 1.0): uso libero, anche commerciale, senza obbligo di attribuzione. L'elenco serve a sapere da dove viene ogni cosa. Fonte: `web/public/modelli/CREDITI.md` e i file di licenza nelle sottocartelle.

| Cartella | Pacchetto | Autore | Fonte | Licenza |
|---|---|---|---|---|
| `web/public/modelli/personaggi/` | Mini Characters 2.0 | Kenney | kenney.nl/assets/mini-characters | CC0 1.0, vedi `LICENSE-Kenney-Mini-Characters.txt` |
| `web/public/modelli/ufficio/` | Furniture Kit (GLB) | Kenney | poly.pizza, lista NoG1sEUD1z (copia del kit di kenney.nl) | CC0 1.0, vedi `LICENZE.txt` |
| `web/public/modelli/ufficio/printer.glb`, `web/public/modelli/ufficio/corkboard.glb` | Household Props 001 | CreativeTrio | poly.pizza, lista KsNBhP96PT | CC0 1.0, vedi `LICENZE.txt` |
| `web/public/modelli/fabbrica/` | Factory Kit 3.0 | Kenney | opengameart.org (copia caricata da Kenney) | CC0 1.0, vedi `LICENSE-Kenney-Factory-Kit.txt` |

Kenney chiede, come cortesia e non come obbligo, di citare "Kenney" o "www.kenney.nl".

La sala riunioni, lo schermo a parete, gli armadi server, la console del collaudo, i cartelli a terra, il tavolo ovale, le vetrate e la navetta robot sono costruiti nel codice del progetto. Le icone dell'app (`web/public/icona*.png`, `web/public/icona.svg`) sono generate dallo script `strumenti/icone.ts` del progetto.

## Luci (HDRI)

| File | Nome | Autore | Fonte | Licenza |
|---|---|---|---|---|
| `web/public/hdri/poly_haven_studio_1k.hdr` | Poly Haven Studio (1k) | Poly Haven | polyhaven.com | CC0 1.0 |
| `web/public/hdri/lebombo_1k.hdr` | Lebombo (1k) | Poly Haven | polyhaven.com | CC0 1.0 |

## Font

I font arrivano dai pacchetti Fontsource (dipendenze npm) e sono inclusi nella dashboard compilata.

| Font | Pacchetto | Copyright | Licenza |
|---|---|---|---|
| Chakra Petch | `@fontsource/chakra-petch` | 2018 The Chakra Petch Project Authors | SIL Open Font License 1.1 |
| IBM Plex Sans | `@fontsource/ibm-plex-sans` | 2019 IBM Corp. | SIL Open Font License 1.1 |
| IBM Plex Mono | `@fontsource/ibm-plex-mono` | 2017 IBM Corp. | SIL Open Font License 1.1 |

La SIL Open Font License permette di usare, incorporare e ridistribuire i font, anche in programmi commerciali. Non permette di vendere i font da soli. Il testo della licenza è nei pacchetti, in `node_modules/@fontsource/<nome>/LICENSE`.

## Dipendenze npm principali

Versioni e licenze lette dai `package.json` dei pacchetti installati con `npm ci` (9 novembre 2026). Sono le dipendenze dirette elencate in `package.json`.

### Usate dal programma

| Pacchetto | Versione | Licenza |
|---|---|---|
| `@fontsource/chakra-petch` | 5.3.0 | OFL-1.1 |
| `@fontsource/ibm-plex-mono` | 5.3.0 | OFL-1.1 |
| `@fontsource/ibm-plex-sans` | 5.3.0 | OFL-1.1 |
| `@react-three/drei` | 10.7.9 | MIT |
| `@react-three/fiber` | 9.8.2 | MIT |
| `lucide-react` | 1.70.0 | ISC (una parte delle icone deriva dal progetto Feather, MIT, come indicato nel file LICENSE del pacchetto) |
| `motion` | 14.10.1 | MIT |
| `react` | 19.3.1 | MIT |
| `react-dom` | 19.3.1 | MIT |
| `react-markdown` | 10.1.0 | MIT |
| `remark-gfm` | 4.0.1 | MIT |
| `three` | 0.187.0 | MIT |
| `zod` | 4.6.7 | MIT |

### Solo per lo sviluppo e la compilazione

| Pacchetto | Versione | Licenza |
|---|---|---|
| `@tailwindcss/vite` | 4.3.5 | MIT |
| `@types/node` | 24.19.2 | MIT |
| `@types/react` | 19.3.0 | MIT |
| `@types/react-dom` | 19.3.0 | MIT |
| `@types/three` | 0.187.0 | MIT |
| `@vitejs/plugin-react` | 6.2.1 | MIT |
| `tailwindcss` | 4.3.5 | MIT |
| `typescript` | 7.0.2 | Apache-2.0 |
| `vite` | 8.3.6 | MIT |

### Dipendenze indirette

Le dipendenze indirette sono quasi tutte MIT, ISC, Apache-2.0, BSD o 0BSD. Da segnalare:

- `lightningcss` (MPL-2.0), usata da Tailwind e Vite solo per compilare il CSS: non finisce nella dashboard compilata.
- `webgl-constants` (usata tramite `detect-gpu`) non dichiara la licenza nel `package.json`, ma il suo file LICENSE è MIT.

Questo elenco è stato fatto a mano: da verificare con `npx license-checker` (o uno strumento simile) prima di ogni rilascio, perché le versioni cambiano.

## Programmi esterni (non inclusi)

Il programma avvia programmi che **non** fanno parte di questo repository e che ognuno installa per conto suo, con le loro licenze e condizioni:

- Claude Code (Anthropic);
- Codex CLI (OpenAI);
- Python e faster-whisper, con il modello di trascrizione, se installi la voce con `npm run voce:installa`.
