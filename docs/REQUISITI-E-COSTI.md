# Requisiti e costi

## Requisiti

### Obbligatori

| Cosa | Versione | Note |
|---|---|---|
| Node.js | 24 o più recente | Esegue il motore e compila la dashboard |
| Claude Code | la CLI ufficiale di Anthropic | Installata come indica Anthropic (installer nativo, oppure `npm install -g @anthropic-ai/claude-code`). Login con `claude`, poi `/login` |
| Abbonamento Claude | Pro, Max o superiore | Il piano gratuito non include Claude Code |
| Git for Windows | solo su Windows | Serve a Claude Code. https://git-scm.com/downloads/win. Per installazioni fuori standard c'è `CLAUDE_CODE_GIT_BASH_PATH` |
| Codex CLI | la CLI ufficiale di OpenAI | `npm install -g @openai/codex`. Login con `codex login` |
| Piano ChatGPT | uno che includa Codex | Quali piani lo includono lo dice OpenAI nella pagina dei prezzi di Codex |
| Browser | recente, con WebGL | Per la dashboard e l'ufficio 3D |

Sistemi: Windows, macOS e Linux, quelli supportati dalle due CLI. Anthropic indica per Claude Code almeno 4 GB di RAM.

Serve la connessione a internet: le CLI parlano con i servizi di Anthropic e di OpenAI (e, se la accendi in una partita, usano la loro ricerca web). Il programma in sé non usa la rete, salvo per installare la voce: `npm run voce:installa` scarica faster-whisper e il modello si scarica al primo uso.

### Facoltativi

| Cosa | Versione | Note |
|---|---|---|
| Python | 3.10 o più recente | Solo per la trascrizione vocale sul PC |
| faster-whisper | lo installa `npm run voce:installa` | In `dati/voce-venv` |
| Modello di trascrizione | `small` (di serie) | Si scarica la prima volta che usi la voce, circa 500 MB. Gira su CPU |

Senza Python puoi usare la dettatura del browser, che però passa dai servizi di Google o di Apple. La lettura ad alta voce delle risposte usa la sintesi vocale del browser con le voci installate sul PC: se il browser ha solo voci online, la lettura non c'è.

## Costi

### Il programma

Gratuito, licenza MIT.

### Gli abbonamenti

Non sono gratuiti. Ti servono:

- un abbonamento Claude che includa Claude Code (Pro, Max o superiore);
- un piano ChatGPT che includa Codex.

Il programma usa la quota di questi abbonamenti. Di serie rifiuta le chiavi API: con una chiave API si paga a consumo, a parte. Con `AMBO_CONSENTI_API=1` accetta anche una CLI collegata con chiave API, per Claude Code e per Codex, e allora quel consumo lo paghi a parte. Le chiavi passate per variabile d'ambiente (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` e simili) le toglie sempre: la chiave va impostata nella CLI. Se Claude passa ai crediti extra a consumo, il programma si ferma sempre, anche con quell'opzione.

Come i token pesano sulla quota lo decide ciascun fornitore, e i limiti dei piani cambiano nel tempo. Controlla le pagine ufficiali dei tuoi piani.

### Quanto consuma

I numeri qui sotto sono indicativi. Cambiano con il modello scelto, la lunghezza dei messaggi, le note lette e il materiale passato.

**Chat.** Ogni messaggio costa una o due chiamate alle CLI (una per agente che risponde).

- Una risposta di Claude con l'ambiente acceso (`AMBO_AMBIENTE=1`): circa 45 mila token in ingresso, in buona parte dalla cache.
- Una risposta di Codex: circa 7 mila token in ingresso quando risponde `PASSO`.

**Partita (riunione).** Una riunione di 6 interventi con sintesi e verifica (8 chiamate) è nell'ordine di 300-400 mila token in ingresso in tutto. La riunione non ha un numero fisso di interventi: dura finché i due capi reparto non sottoscrivono lo stesso piano, al massimo 16 interventi.

Esempio reale, con la versione 0.1.0 (6 interventi, senza squadra):

| Voce | Valore |
|---|---|
| Chiamate alle CLI | 8 |
| Token in ingresso | 388 mila |
| di cui dalla cache | 248 mila |
| Token in uscita | 23 mila |
| Durata | circa 4 minuti |

**Squadra.** Il consumo cresce con gli incarichi. Ogni incarico è una chiamata in più, in una sessione nuova: l'assistente riceve di nuovo l'obiettivo, il compito e l'eventuale materiale, e il suo rapporto entra nei messaggi dei capi reparto. I limiti: 2 incarichi per intervento, 8 per riunione. I token di ogni incarico si vedono nel documento finale, come quelli degli interventi.

**Produzione.** Costa di più di una partita. Ogni pacchetto è un lavoro di Claude che legge e scrive file (al massimo 5 pacchetti), poi c'è il collaudo di Codex e, se la procedura li prevede, una revisione per ogni assistente dei passi di collaudo. Se il collaudo respinge, si corregge e si ricontrolla, fino a 3 giri in tutto (il primo più due correzioni): collaudo e revisioni si ripetono a ogni giro.

### Dove vedere i token

- Sotto ogni risposta in chat.
- Nel documento finale di ogni partita.

### Come consumare meno

- Fai rispondere un solo agente quando basta: `@claude` o `@codex` all'inizio del messaggio, o il selettore in chat.
- Scrivi obiettivi chiari: la riunione si chiude prima, e i capi reparto chiedono meno incarichi.
- Per lavori piccoli scrivi nell'obiettivo (o in una nota del moderatore) che basta un pacchetto solo: ogni pacchetto e ogni revisione è una chiamata in più.
- Tieni spento `AMBO_AMBIENTE` se non ti servono le tue impostazioni di Claude Code: con l'ambiente acceso ogni risposta di Claude porta molto più contesto.
- Passa alle partite solo le cartelle che servono.
- Accendi la ricerca web solo nelle partite che ne hanno bisogno: i risultati delle ricerche entrano nel contesto e aumentano i token.
- Manda in produzione solo le decisioni che vuoi davvero trasformare in file.
