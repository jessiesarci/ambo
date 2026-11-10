# Ambo

**English summary.** Ambo is a local web app that lets you chat with Claude Code and Codex at the same time, on your own computer, using the official CLIs and your own subscriptions (no API keys by default). The two agents can also plan a goal together in a meeting, hand tasks to a team of assistants chosen for the kind of work, and, if you want, have files written in an isolated folder, one work package after the other, and then reviewed. The interface and the documentation are in Italian.

*Ambo*, in latino: tutti e due.

## Cos'è

Ambo è un programma che gira sul tuo PC e si usa dal browser. Ti fa chattare con **Claude Code** e **Codex** insieme, con i tuoi abbonamenti.

- **Chat.** Scrivi un messaggio e rispondono tutti e due, uno dopo l'altro. Il secondo legge la risposta del primo e aggiunge solo quello che manca, oppure dice che non ha niente da aggiungere.
- **Scheda compito.** Quando una cosa va fatta, un agente propone una scheda con il tasto **Avvia**.
- **Riunione.** In una partita Claude e Codex fanno da capi reparto: parlano a turno e preparano insieme il piano, finché tutti e due lo sottoscrivono. Alla fine uno scrive la sintesi e l'altro la verifica. Ottieni un documento in markdown.
- **Squadra.** Durante la riunione i capi possono affidare incarichi agli assistenti, scelti per il tipo di lavoro: 7 di serie (ricerca, analisi, architettura, testi, design, sviluppo, controllo qualità) e, se lo chiedi, i tuoi agenti di Claude Code. Ogni assistente ha un avatar, le sue skill, un livello da 1 a 10 con un titolo, i punti esperienza (XP) che guadagna lavorando e i badge dei traguardi raggiunti.
- **Procedure.** Modi di lavorare già pronti (sito web, documento, analisi, codice, su misura) che dicono quale assistente fa cosa nel piano, nella produzione e nel collaudo. Puoi aggiungere le tue.
- **Produzione.** La decisione diventa file in una cartella separata (il cantiere), come una catena di montaggio: gli assistenti costruiscono i pacchetti di lavoro uno dopo l'altro, Codex fa il collaudo e gli eventuali passi di collaudo della procedura rivedono i file. Se il collaudo non passa, si corregge.
- **Ufficio 3D.** Un ufficio diviso in reparti, con gli omini dei capi reparto e degli assistenti: vedi chi pensa, chi cerca nelle note, chi scrive, chi lavora a un incarico. Nel magazzino la catena di montaggio segue la produzione stazione per stazione.
- **Voce** (facoltativa). Detti i messaggi; la trascrizione può restare sul PC.

Il programma non ha una parte online, non ha account suoi e non raccoglie dati di uso. Il server ascolta solo sul tuo PC (127.0.0.1).

Non ci sono screenshot in questo repository.

## Requisiti

- **Node.js 24** o più recente.
- **Claude Code**, la CLI ufficiale di Anthropic, con il login del tuo account Claude. Serve un abbonamento Claude Pro, Max o superiore.
- **Codex CLI**, la CLI ufficiale di OpenAI, con il login del tuo account ChatGPT. Serve un piano ChatGPT che includa Codex.
- Solo su Windows: **Git for Windows** (https://git-scm.com/downloads/win), che serve a Claude Code.
- Un **browser recente** con WebGL, per l'ufficio 3D.
- Facoltativo, per la voce: **Python 3.10** o più recente.

Dettagli e costi: [docs/REQUISITI-E-COSTI.md](docs/REQUISITI-E-COSTI.md).

## Installazione

I passi sono gli stessi su tutti i sistemi:

1. installa Node.js;
2. installa Claude Code e Codex CLI;
3. scarica Ambo;
4. installa le dipendenze e compila la dashboard;
5. fai il login delle due CLI (vedi [Primo avvio](#primo-avvio-e-login-delle-cli));
6. avvia il programma.

Non usare `sudo` con `npm install -g`: se npm dà errori di permessi, sistema la cartella globale di npm (o usa nvm) invece di installare come amministratore.

### Windows

Apri **PowerShell** (non serve come amministratore).

**Se PowerShell blocca `npm`.** Con i criteri di esecuzione di serie, PowerShell può rifiutare `npm` con un errore su `npm.ps1` ("l'esecuzione di script è disabilitata"). Hai tre strade, scegli tu:

- usa il **Prompt dei comandi** (`cmd`) per i comandi `npm`;
- in PowerShell scrivi `npm.cmd` al posto di `npm` (per esempio `npm.cmd ci`);
- permetti gli script locali solo per il tuo utente: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. Cambia un'impostazione di sicurezza di Windows per il tuo account: fallo solo se sai cosa comporta.

1. Node.js 24 o più recente: scarica l'installer da https://nodejs.org oppure usa winget:

   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```

   Chiudi e riapri PowerShell, poi controlla:

   ```powershell
   node --version
   ```

2. Git for Windows, che serve a Claude Code: scaricalo da https://git-scm.com/downloads/win oppure usa winget:

   ```powershell
   winget install Git.Git
   ```

   Se Git è installato in una cartella fuori standard e Claude Code non trova Git Bash, imposta la variabile `CLAUDE_CODE_GIT_BASH_PATH` con il percorso di `bash.exe`, come spiega la documentazione di Claude Code. Il programma la lascia passare alle CLI.

3. Claude Code. Su Windows consigliamo l'installer nativo indicato da Anthropic (https://code.claude.com/docs/en/setup):

   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```

   In alternativa: `npm install -g @anthropic-ai/claude-code`.

4. Codex CLI:

   ```powershell
   npm install -g @openai/codex
   ```

5. Scarica Ambo (lo zip da GitHub, poi estrailo, oppure con git) ed entra nella cartella:

   ```powershell
   git clone https://github.com/jessiesarci/ambo.git
   cd ambo
   ```

6. Dipendenze e dashboard:

   ```powershell
   npm ci
   npm run build
   ```

7. Facoltativo, configurazione e profilo:

   ```powershell
   Copy-Item .env.esempio .env
   Copy-Item profilo.esempio.md profilo.md
   ```

8. Avvio:

   ```powershell
   npm start
   ```

   Apri http://127.0.0.1:4317 nel browser.

Il programma cerca Claude Code e Codex da solo, anche nel PATH, compresi i file `.cmd` che creano npm e pnpm. Se ti dice che non li trova, indica il percorso nel file `.env` con `CLAUDE_BIN` o `CODEX_BIN` (vedi [Configurazione](#configurazione)).

### macOS

Apri il **Terminale**.

1. Node.js 24 o più recente: scarica l'installer da https://nodejs.org oppure, con Homebrew:

   ```bash
   brew install node
   node --version
   ```

2. Claude Code, con l'installer nativo (https://code.claude.com/docs/en/setup):

   ```bash
   curl -fsSL https://claude.ai/install.sh | bash
   ```

   In alternativa: `brew install --cask claude-code` oppure `npm install -g @anthropic-ai/claude-code`.

3. Codex CLI:

   ```bash
   npm install -g @openai/codex
   ```

4. Scarica Ambo ed entra nella cartella:

   ```bash
   git clone https://github.com/jessiesarci/ambo.git
   cd ambo
   ```

5. Dipendenze e dashboard:

   ```bash
   npm ci
   npm run build
   ```

6. Facoltativo, configurazione e profilo:

   ```bash
   cp .env.esempio .env
   cp profilo.esempio.md profilo.md
   ```

7. Avvio:

   ```bash
   npm start
   ```

   Apri http://127.0.0.1:4317 nel browser.

### Linux

Apri un terminale. Gli esempi sono per Debian e Ubuntu; sulle altre distribuzioni cambia solo il gestore dei pacchetti.

1. Node.js 24 o più recente. I pacchetti delle distribuzioni spesso hanno versioni vecchie: il modo più semplice è nvm (https://github.com/nvm-sh/nvm). Dopo averlo installato:

   ```bash
   nvm install 24
   node --version
   ```

2. Claude Code, con l'installer nativo (https://code.claude.com/docs/en/setup):

   ```bash
   curl -fsSL https://claude.ai/install.sh | bash
   ```

   In alternativa: `npm install -g @anthropic-ai/claude-code`, oppure i repository apt/dnf indicati nella stessa pagina.

3. Codex CLI:

   ```bash
   npm install -g @openai/codex
   ```

4. Scarica Ambo ed entra nella cartella:

   ```bash
   git clone https://github.com/jessiesarci/ambo.git
   cd ambo
   ```

5. Dipendenze e dashboard:

   ```bash
   npm ci
   npm run build
   ```

6. Facoltativo, configurazione e profilo:

   ```bash
   cp .env.esempio .env
   cp profilo.esempio.md profilo.md
   ```

7. Avvio:

   ```bash
   npm start
   ```

   Apri http://127.0.0.1:4317 nel browser.

### Voce (facoltativa, tutti i sistemi)

Per trascrivere i messaggi vocali sul PC serve Python 3.10 o più recente:

- Windows: installer da https://www.python.org (spunta "Add python.exe to PATH"), oppure `winget install Python.Python.3.12`;
- macOS: `brew install python`;
- Linux: `sudo apt install python3 python3-venv`.

Poi, nella cartella del programma:

```bash
npm run voce:installa
```

Il comando crea `dati/voce-venv` con faster-whisper. Il modello si scarica la prima volta che lo usi.

## Primo avvio e login delle CLI

Il login lo fai tu, con il flusso ufficiale di ciascuna CLI. Ambo non chiede, non legge e non salva le tue credenziali: avvia le CLI, che usano il login che hanno già.

**Claude Code.** In un terminale:

```bash
claude
```

Dentro Claude Code scrivi `/login`, scegli l'accesso con l'account Claude (l'abbonamento) e completa il login nel browser. Poi esci con `/exit`.

**Codex.** In un terminale:

```bash
codex login
```

Si apre il browser: accedi con il tuo account ChatGPT.

Cose da sapere:

- Non impostare `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` o simili per questo programma. Il motore le toglie comunque dall'ambiente delle CLI.
- Di serie il programma rifiuta il login con chiave API (che si paga a consumo). Se una CLI risulta collegata con una chiave API, la partita non parte. Con `AMBO_CONSENTI_API=1` accetta la chiave API sia per Claude Code sia per Codex.
- Se Claude passa ai crediti extra a consumo, il programma si ferma sempre, anche con `AMBO_CONSENTI_API=1`. Se non vuoi spese oltre l'abbonamento, tieni spenti i crediti extra nelle impostazioni del tuo piano Claude.
- Il programma controlla il login delle CLI da sé. Se ti dice che una CLI non è collegata, rifai il login come sopra.

Poi avvia il programma (`npm start`) e apri http://127.0.0.1:4317.

## Configurazione

Tutto è facoltativo. Senza configurazione il programma parte "vuoto": niente profilo, niente note, nessuna tua impostazione di Claude Code. In chat, nelle partite e nel collaudo le CLI lavorano in una cartella temporanea fuori dal repository; in produzione Claude lavora nel cantiere, senza impostazioni né istruzioni di progetto. Codex non legge i file `AGENTS.md` di progetto (compreso quello di questo repository). Un'eccezione: se hai un file globale `~/.codex/AGENTS.md`, Codex lo legge comunque, anche con l'ambiente spento.

La configurazione sta nel file `.env` nella cartella del programma. Copialo da [`.env.esempio`](.env.esempio), che contiene tutte le voci commentate.

**Come scrivere i percorsi nel `.env`:**

- su Windows **non** mettere i percorsi tra virgolette doppie: le virgolette trasformano `\n` in un a capo (per esempio in `C:\note`). Scrivili senza virgolette, anche se contengono spazi, oppure usa le barre `/`;
- se un percorso contiene un a capo, il programma si ferma con un messaggio;
- `~` vale come cartella utente;
- su Windows vale anche la forma `/c/...` per `C:\...`;
- i percorsi relativi partono dalla cartella del programma (vale anche per `AMBO_DATI`).

| Variabile | A cosa serve | Di serie |
|---|---|---|
| `AMBO_NOME` | Come ti chiamano gli agenti | vuoto: "l'utente" |
| `AMBO_PROFILO` | Percorso del tuo profilo | `profilo.md` nella cartella del programma |
| `AMBO_NOTE` | Una cartella di note markdown da dare in lettura agli agenti (per esempio un vault Obsidian) | nessuna |
| `AMBO_SALVA_IN` | Dove il programma salva decisioni e chat come note markdown | `dati/note` |
| `AMBO_AMBIENTE` | Con `1` Claude parte con le tue impostazioni utente di Claude Code (il tuo CLAUDE.md, i plugin, le skill), gli agenti possono leggere le tue skill e i tuoi agenti di Claude Code (`~/.claude/agents/*.md`) entrano nella squadra | spento: Claude parte vuoto, squadra solo con i 7 assistenti di serie |
| `AMBO_AGENTI` | Solo con `AMBO_AMBIENTE=1`: la cartella da cui prendere gli agenti della squadra, oppure `0` per non prenderne nessuno | `~/.claude/agents` |
| `AMBO_CONSENTI_API` | Con `1` accetta anche il login con chiave API (fatturazione a consumo), per Claude Code e per Codex. Non permette i crediti extra di Claude: quelli il programma li ferma sempre | spento |
| `AMBO_PORTA` | Porta del server | `4317` |
| `AMBO_DATI` | Cartella dei dati. Non metterla dentro `AppData` su Windows: lì Claude non può scrivere e la produzione si ferma con un messaggio (vale anche se tutto il programma sta dentro `AppData`) | `./dati` |
| `CLAUDE_BIN` | Percorso di Claude Code, se il programma non lo trova da solo: l'eseguibile, oppure (installazione npm) il `cli.js` di Claude Code nella cartella `node_modules` globale | cercato da solo |
| `CODEX_BIN` | Percorso di Codex, se il programma non lo trova da solo: l'eseguibile, oppure (installazione npm) il `codex.js` di Codex nella cartella `node_modules` globale | cercato da solo |
| `AMBO_MODELLO_CODEX` | Modello di serie di Codex, se non vuoi quello della tua configurazione di Codex | quello della configurazione di Codex |
| `AMBO_VOCE_PYTHON` | Python da usare per la voce | quello in `dati/voce-venv` |
| `AMBO_WHISPER_MODELLO` | Modello di trascrizione | `small` |
| `AMBO_LINGUA_VOCE` | Lingua della trascrizione | `it` |
| `AMBO_WHISPER_PAROLE` | Parole da suggerire alla trascrizione, separate da virgole (nomi propri, termini tecnici). Si aggiungono all'elenco di base | solo l'elenco di base (Claude, Codex, ...) |
| `AMBO_PAROLE_VIETATE` | Solo per `npm run controllo`: parole personali da cercare nei file prima di pubblicare (il tuo nome, i tuoi clienti), separate da virgole. Si può mettere nel `.env` | nessuna |

Il **profilo** è un file markdown in cui scrivi chi sei e come lavori. Parti da [`profilo.esempio.md`](profilo.esempio.md). Gli agenti lo leggono in sola lettura.

**Procedure tue.** Oltre a quelle di serie (in `motore/procedure/`) puoi scriverne di tue, un file JSON ciascuna, in `dati/procedure/` (o nella sottocartella `procedure` di `AMBO_DATI`). Il formato:

```json
{
  "id": "volantino",
  "nome": "Volantino",
  "quando": "volantini e locandine da stampare",
  "passi": [
    { "assistente": "testi", "fase": "piano" },
    { "assistente": "design", "fase": "produzione" },
    { "assistente": "controllo", "fase": "collaudo" }
  ]
}
```

La `fase` è `piano` (un incarico in riunione), `produzione` (un pacchetto nel cantiere) o `collaudo` (una revisione dei file in sola lettura, dopo quella di Codex). L'`assistente` è un id della squadra. Una procedura con lo stesso `id` di una di serie la sostituisce. I passi con un assistente che non c'è si tolgono.

**Agenti tuoi nella squadra.** Con `AMBO_AMBIENTE=1` ogni file `.md` in `~/.claude/agents` diventa un assistente: l'id è il campo `name` (o il nome del file), il ruolo la prima frase di `description`, le istruzioni il resto del file. Lavora con Claude. Può costruire pacchetti in produzione solo se il suo campo `tools` contiene `Write` o `Edit`. Gli strumenti però non li decide quel campo: un tuo agente ha sempre e solo gli strumenti degli altri assistenti (sola lettura in riunione, solo il cantiere in produzione). Se ha lo stesso id di un assistente di serie, prende il suo posto.

Dopo una modifica al file `.env`, riavvia il programma.

## Uso

### Chat

È la schermata principale. Scrivi e rispondono tutti e due, uno dopo l'altro. Il secondo legge il primo: aggiunge solo quello che manca o risponde "niente da aggiungere" (PASSO).

Scegli chi risponde con il selettore **Tutti / Claude / Codex**, oppure comincia il messaggio con `@claude` o `@codex` per far rispondere solo uno, o con `@tutti` per farli rispondere tutti e due.

Tempi e token di una risposta si vedono cliccandola; con «Mostra tempi e token» nel menu ⋯ restano sempre visibili.

Altre cose che puoi fare in chat:

- **Fai rispondere**: dopo uno stop o un errore, fa rispondere gli agenti a quello che è rimasto senza risposta.
- **Leggi ad alta voce**: il browser legge una risposta, o tutte se lo scegli dal menu. Usa solo le voci installate sul PC.
- **Salva come nota**: salva la chat come nota markdown nella cartella `Chat` dentro `AMBO_SALVA_IN`.
- **Trasforma in compito**: avvia subito una partita dalla chat, anche se nessun agente ha proposto una scheda compito. Scrivi titolo e obiettivo (se c'è già una scheda, li prende da lì). Qui non si sceglie una cartella autorizzata: per quella usa **Avvia** sulla scheda dell'agente.

In chat la ricerca web è spenta.

### Scheda compito

Quando dalla chat viene fuori una cosa da fare, l'agente propone una **scheda compito**: titolo, obiettivo, ed eventualmente una cartella autorizzata da usare. Premi **Avvia** e parte una partita. Una scheda avvia una partita sola, anche se premi due volte.

Se la scheda dice **"piano, poi produzione"** e la partita finisce con l'accordo pieno, la produzione parte da sola. Senza accordo pieno la produzione non parte da sola: decidi tu.

### Partite: la riunione

Una partita è una riunione di pianificazione. Claude e Codex sono i due capi reparto: parlano a turno, un intervento ciascuno, e costruiscono il piano per il tuo obiettivo. Non c'è un numero fisso di interventi da scegliere.

- Modo **insieme** (di serie): costruiscono la soluzione insieme.
- Modo **confronto**: valutano le alternative in modo critico.
- **Ricerca web**: facoltativa, si accende per la singola partita quando la crei. Claude, Codex e gli assistenti possono cercare sul web; tutti gli altri strumenti restano spenti.

La riunione finisce quando i due dichiarano l'accordo pieno uno dopo l'altro, quando sono in stallo (solo nel modo confronto), oppure al limite di sicurezza di 16 interventi, che serve a non consumare la quota se l'accordo non arriva. Poi uno scrive la sintesi e l'altro la verifica. Il risultato è un documento in markdown, che puoi scaricare. A fine partita la decisione si salva anche come nota, nella cartella `Decisioni` dentro `AMBO_SALVA_IN`.

Mentre la riunione gira puoi:

- **Pausa** e **Riprendi**: la fermi (l'intervento o l'incarico in corso si interrompe) e la fai ripartire da lì;
- **Concludi**: chiudi senza aspettare l'accordo e passi subito alla sintesi. Gli incarichi non ancora partiti si annullano. L'esito resta "chiusa dall'utente": non viene registrato come accordo;
- **Nota del moderatore**: scrivi un'indicazione. Arriva a tutti e due, a ciascuno al suo intervento successivo, e ha la precedenza sul resto.

Le regole precise sono in [docs/COME-FUNZIONA.md](docs/COME-FUNZIONA.md).

### La squadra

Durante la riunione un capo reparto può affidare un incarico a un assistente: un fatto da verificare, un conto, una bozza, un controllo del piano. Il motore lo esegue dopo il suo intervento, e il rapporto arriva a chi parla dopo.

| Assistente | Ruolo | Lavora con | In produzione |
|---|---|---|---|
| Rita | Ricerca | Claude | no |
| Marco | Analisi | Codex | no |
| Elena | Architettura | Claude | no |
| Luca | Testi | Claude | sì |
| Sara | Design | Claude | sì |
| Paolo | Sviluppo | Claude | sì |
| Nadia | Controllo qualità | Codex | no |

Con `AMBO_AMBIENTE=1` si aggiungono i tuoi agenti di Claude Code (vedi [Configurazione](#configurazione)).

- Ogni assistente lavora da solo, in una sessione nuova, con le stesse regole dei capi reparto: sola lettura, note e ricerca web solo se sono accese. Non vede la riunione: riceve l'obiettivo, il compito e l'eventuale materiale.
- Al massimo 2 incarichi per intervento e 8 per riunione. Gli incarichi oltre il limite, o per un assistente che non c'è, si scartano e la riunione lo dice.
- Se un incarico non riesce, la riunione va avanti e i capi ricevono l'errore al posto del rapporto. Si ferma tutto solo per i controlli di sicurezza (chiave API, crediti extra, strumento non ammesso).
- **Esperienza e livelli.** Un rapporto consegnato o una revisione fatta vale 20 XP, un pacchetto di produzione fatto 30, un collaudo superato altri 20 a ogni assistente che ha costruito un pacchetto. Un incarico fallito non dà XP. I livelli vanno da 1 a 10, con un titolo ogni due: Apprendista, Operativo, Esperto, Veterano, Leggenda. I numeri stanno in `dati/squadra.json`.
- **Badge.** Sono traguardi presi dalle statistiche: prima consegna, 10 e 25 rapporti, collaudo superato e 5 collaudi (solo per chi lavora in produzione), affidabile (riuscita del 90% o più su almeno 10 lavori), instancabile (50 chiamate), livello 5, il più chiamato della squadra. Quelli che mancano si vedono spenti, con la regola.
- **Pannello Squadra**, nella pagina Partite: in cima il podio dei tre con più XP, sotto una carta per assistente con avatar, nome, livello, barra dell'XP e gli ultimi badge presi. L'ordine si sceglie: esperienza, chiamate o riuscita. Un tocco su una carta apre la scheda completa: descrizione intera, titolo, XP che mancano al livello dopo, tutti i badge, skill, statistiche (chiamato, completati, falliti, pacchetti, collaudi superati, riuscita) e ultimi lavori. Sul telefono la scheda prende tutto lo schermo; si chiude con la X, con Esc o toccando fuori.

Nella sintesi i capi scelgono anche la **procedura** e dividono il lavoro per la produzione in **pacchetti** (al massimo 5), ognuno con il suo assistente.

### Produzione

La produzione trasforma la decisione di una partita in file, come una catena di montaggio.

1. Il programma crea il **cantiere**: una cartella nuova in `dati/cantieri/<id>`, vuota o con la copia ripulita di una cartella autorizzata.
2. Gli assistenti di produzione costruiscono i **pacchetti** decisi nella sintesi, uno dopo l'altro, nello stesso cantiere: ognuno vede i file dei precedenti. Lavorano tutti con Claude. Senza pacchetti si seguono i passi di produzione della procedura; senza neanche quelli, costruisce tutto Paolo (sviluppo). Non possono eseguire comandi, non usano il web e non possono uscire dalla cartella.
3. Codex fa il **collaudo**: legge i file e dice se il lavoro regge. Se la procedura ha passi di collaudo, dopo Codex i loro assistenti rivedono i file, in sola lettura. Il collaudo passa solo se lo approvano tutti quelli che hanno risposto.
4. Se il collaudo respinge il lavoro, corregge l'assistente dei file citati nei problemi e si ricontrolla, al massimo due volte.

I file restano nel cantiere: li copi tu dove servono. Il programma non tocca mai la cartella originale.

Una partita conclusa si può mandare in produzione anche a mano, dalla sua pagina.

### Ufficio 3D e Lavori

Nell'ufficio 3D gli omini mostrano cosa stanno facendo gli agenti: pensano, cercano nelle note, scrivono. Tocca un omino o il suo cartellino per aprire la sua scheda:

- cosa sta facendo;
- cosa ha usato (note lette, ricerche);
- le skill in uso, solo se la CLI lo conferma;
- le skill a disposizione.

L'ufficio è diviso in reparti, ognuno con il suo cartello a terra:

| Reparto | Chi ci siede |
|---|---|
| Direzione | Claude e Codex, con la lavagna del piano della partita aperta |
| Ricerca e analisi | Rita, Marco |
| Progettazione | Elena, Sara |
| Contenuti | Luca |
| Sviluppo | Paolo e i tuoi agenti che lavorano in produzione |
| Qualità | Nadia e i tuoi agenti di collaudo |
| Ospiti | i tuoi agenti che non stanno in nessun altro reparto, o che non trovano posto |

- Claude e Codex vanno in sala riunioni solo durante la riunione (sintesi e verifica comprese), poi tornano alle loro scrivanie in Direzione. In chat rispondono da lì. Codex scende al banco del collaudo quando la produzione è in collaudo.
- Gli assistenti chiamati nella partita aperta siedono nel loro reparto. Un tuo agente va nel reparto più vicino al suo ruolo, ricavato dalla procedura, dalla produzione o dalla descrizione. Se non c'è posto neanche tra gli ospiti, compare solo nei pannelli.
- Il cartellino porta il nome, il livello ("Lv") e la barra dell'XP, nel colore del suo avatar; mentre lavorano hanno il fumetto "Al lavoro" e lo schermo acceso. Un tocco apre la loro scheda: ruolo, livello, skill, statistiche, cosa stanno facendo e gli incarichi della partita.
- Nel magazzino la catena di montaggio ha cinque stazioni: **Piano** (la sintesi approvata), **Costruzione** (una postazione per pacchetto, con chi lo costruisce), **Collaudo** (Codex e gli assistenti di collaudo della procedura), **Correzioni** (solo se servono) e **Consegna**. La scatola del lavoro sta alla stazione dove la produzione è davvero.
- Con la grafica ridotta (di serie sul telefono, o quando il PC rallenta) si animano al massimo 4 assistenti: prima chi lavora.

In chat i **Lavori** stanno in una riga sola, per esempio "2 da decidere · 1 al lavoro": un tocco apre l'elenco di cosa è al lavoro adesso e di cosa aspetta una tua decisione.

### Voce

La voce è facoltativa.

- **Trascrizione sul PC** (consigliata): usa faster-whisper con il modello `small`, su CPU. L'audio non esce dal PC. Va installata con `npm run voce:installa`.
- **Dettatura del browser**: in alternativa, dal menu della chat. Passa dal servizio vocale di chi fa il browser, per esempio Google con Chrome o Apple con Safari.

La trascrizione sul PC è in italiano di serie: la lingua si cambia con `AMBO_LINGUA_VOCE`. Con `AMBO_WHISPER_PAROLE` suggerisci parole che sbaglia spesso (nomi propri, termini tecnici).

Al contrario, la **lettura ad alta voce** delle risposte usa la sintesi vocale del browser, solo con le voci installate sul PC. Se il browser ha solo voci online, il programma non legge e la voce del menu non compare.

### Cartelle autorizzate e note

**Cartelle autorizzate.** Puoi dare in lettura a una partita una tua cartella (per esempio un progetto). Gli agenti non leggono la cartella vera: ricevono una copia filtrata, senza dipendenze, build, file di credenziali e righe che sembrano segreti.

Le cartelle si aggiungono sempre e solo dal PC:

- dalla dashboard, con **Gestisci** nella creazione della partita;
- da terminale: `npm run dibattito -- --autorizza <nome> <percorso>`. Usa `npm run`: così il comando legge il `.env` come `npm start` e la cartella finisce nell'elenco che vede la dashboard.

**Note.** Gli agenti possono leggere, sempre in sola lettura:

- il tuo `profilo.md`;
- una cartella di note markdown, se la indichi in `AMBO_NOTE`;
- le note che il programma salva (decisioni e chat salvate).

Le leggono tramite un piccolo server MCP locale che legge solo file `.md`.

Attenzione: quello che gli agenti leggono (note, profilo, copie delle cartelle) finisce nei messaggi che le CLI mandano ad Anthropic e a OpenAI. Non mettere nelle note o nelle cartelle autorizzate dati che non vuoi mandare a quei servizi.

### Da terminale

Una partita si può lanciare anche senza dashboard:

```bash
npm run dibattito -- "la tua domanda"
```

che equivale a `node --env-file-if-exists=.env motore/cli.ts "la tua domanda"`. Senza `--env-file-if-exists=.env` il programma non legge il `.env`: con `AMBO_DATI` impostata, la partita finirebbe in un'altra cartella e la dashboard non la vedrebbe.

### Comandi npm

| Comando | Cosa fa |
|---|---|
| `npm start` | Avvia il programma su http://127.0.0.1:4317 |
| `npm run build` | Compila la dashboard |
| `npm run server:dev` | Avvia il motore in modalità sviluppo |
| `npm run web` | Avvia la dashboard in sviluppo (insieme a `server:dev`) |
| `npm run dibattito` | Partita da terminale |
| `npm test` | Test |
| `npm run typecheck` | Controllo dei tipi TypeScript |
| `npm run controllo` | Cerca in tutti i file di testo del repository dati personali, percorsi, chiavi e segreti, più le parole in `AMBO_PAROLE_VIETATE` (anche dal `.env`). Controlla anche che l'email di git sia quella anonima di GitHub. Va lanciato prima di pubblicare |
| `npm run voce:installa` | Installa la trascrizione vocale sul PC |

Per lo sviluppo: `npm run server:dev` in un terminale e `npm run web` in un altro.

## Cosa serve per usarlo e quanto costa

Il programma è gratuito (licenza MIT). Gli abbonamenti no: ti servono un piano Claude con Claude Code e un piano ChatGPT con Codex.

Ogni uso consuma la quota dei tuoi abbonamenti:

- un messaggio in chat costa una o due chiamate alle CLI;
- una riunione di 6 interventi con sintesi e verifica (8 chiamate) è nell'ordine di 300-400 mila token in ingresso in tutto;
- ogni incarico alla squadra è una chiamata in più, ogni pacchetto e ogni revisione della produzione anche;
- la produzione costa di più.

I token si vedono cliccando una risposta (o sempre, con «Mostra tempi e token» nel menu ⋯) e nel documento finale. Numeri ed esempi: [docs/REQUISITI-E-COSTI.md](docs/REQUISITI-E-COSTI.md).

## Sicurezza in breve

- Il server ascolta solo su 127.0.0.1 e controlla le intestazioni Host e Origin, contro DNS rebinding e CSRF.
- In chat e in partita gli agenti non hanno strumenti che scrivono file o eseguono comandi. Se una CLI prova a usare uno strumento non ammesso, il motore ferma il turno.
- Gli assistenti della squadra li lancia il motore, uno alla volta, con gli stessi strumenti e controlli dei capi reparto. Anche i tuoi agenti di Claude Code danno solo istruzioni: gli strumenti li decide il motore. Incarichi, pacchetti e revisioni hanno un numero massimo.
- La ricerca web è spenta di serie e si accende solo per la singola partita. È l'unico accesso alla rete che gli agenti hanno, oltre al loro servizio.
- Il motore toglie le chiavi API dall'ambiente delle CLI. Di serie si ferma se una CLI usa una chiave API; si ferma sempre se Claude passa ai crediti extra.
- In produzione gli assistenti scrivono solo nel cantiere: lo impongono le regole dei permessi di Claude Code e il motore ferma il lavoro se vede una scrittura fuori.
- Note e cartelle sono trattate come dati, non come istruzioni.

Non è una sandbox del sistema operativo: si appoggia ai sistemi di permessi delle CLI. Dettagli in [SECURITY.md](SECURITY.md).

## Limiti noti

- Non è una sandbox del sistema operativo. La protezione dipende dai permessi di Claude Code e dalla sandbox di Codex, più i controlli del motore.
- Il consumo della quota dei tuoi abbonamenti è reale. Le partite e la produzione ne usano parecchia, e ogni incarico, pacchetto o revisione è una chiamata in più.
- Gli assistenti non sono sub-agenti delle CLI: li lancia il motore uno alla volta, quindi una riunione con molti incarichi dura di più.
- Le risposte degli agenti possono essere sbagliate, anche quando sono d'accordo tra loro e anche dopo il collaudo.
- La produzione non esegue comandi: non installa dipendenze, non compila, non lancia test. Il collaudo è una lettura dei file.
- Il programma dipende dalle opzioni e dal formato di uscita delle CLI. Un aggiornamento di Claude Code o di Codex può cambiare qualcosa: in quel caso il programma di solito si ferma con un errore invece di andare avanti senza controlli.
- Per Codex il programma controlla (di serie) che il login sia con ChatGPT e non con chiave API. Se il tuo piano ChatGPT usa crediti aggiuntivi quando finisci i limiti, il programma non lo vede: controllalo nelle impostazioni del tuo account.
- È pensato per una persona sola, sul suo PC. Non è fatto per essere messo in rete o usato da più persone.
- Se il programma non trova una CLI (capita soprattutto su Windows, con installazioni particolari), va indicata a mano con `CLAUDE_BIN` o `CODEX_BIN`.
- La trascrizione vocale su CPU richiede qualche secondo per messaggio; la prima volta scarica il modello.
- L'ufficio 3D può essere pesante su PC vecchi o senza accelerazione grafica.
- L'interfaccia è solo in italiano.

## Condizioni d'uso

Il programma usa le CLI ufficiali con il login di ciascuno. Rispettare le condizioni di Anthropic e di OpenAI resta responsabilità di chi lo usa. Leggi [docs/CONDIZIONI-D-USO.md](docs/CONDIZIONI-D-USO.md).

## Licenza

MIT, vedi [LICENSE](LICENSE). Modelli 3D, HDRI, font e dipendenze hanno le loro licenze: vedi [THIRD_PARTY.md](THIRD_PARTY.md).

## Non affiliato

Ambo è un progetto indipendente. Non è affiliato ad Anthropic né a OpenAI, e non è approvato da loro. Claude, Claude Code, Codex e ChatGPT sono marchi dei rispettivi titolari: sono citati solo per dire con quali programmi funziona.

Autore: Jessie Sarcinella
