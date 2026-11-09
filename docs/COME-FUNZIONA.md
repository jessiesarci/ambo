# Come funziona

## Architettura

Il programma ha tre parti, tutte sul tuo PC.

- **Il motore**: un programma Node.js. Tiene le chat e le partite, decide chi parla, controlla le risposte, salva i dati.
- **Il server**: fa parte del motore e ascolta solo su `127.0.0.1` (di serie sulla porta 4317). Serve la dashboard e le API, e manda gli aggiornamenti in tempo reale al browser.
- **La dashboard**: una pagina React con la scena 3D fatta con Three.js, nel tuo browser.

Il motore non parla con i modelli direttamente. Avvia le **CLI ufficiali come processi**:

- `claude -p` (Claude Code senza interfaccia) per Claude;
- `codex exec` per Codex.

Ogni CLI usa il login che hai già fatto e manda le richieste al proprio servizio. Se accendi la ricerca web in una partita, le CLI usano anche la loro ricerca web: è l'unico altro accesso alla rete degli agenti. Il motore legge l'output delle CLI riga per riga, mostra cosa stanno facendo e ferma il processo se qualcosa non va.

```
browser (dashboard)
   |  HTTP e aggiornamenti in tempo reale, solo 127.0.0.1
motore Node.js
   |-- claude -p  ........ processo, login del tuo account Claude
   |-- codex exec ........ processo, login del tuo account ChatGPT
   |      '-- server MCP delle note (lo avviano le CLI, sola lettura)
   |-- trascrizione voce (Python, facoltativa)
   '-- dati/  (chat, partite, documenti, cantieri, note salvate)
```

Le CLI in chat e in partita girano in una cartella temporanea vuota (la "stanza"), fuori dal repository, così non leggono file di progetto né istruzioni locali. Con l'ambiente spento (di serie) il motore passa anche a Codex `project_doc_max_bytes=0`: Codex non legge i file `AGENTS.md` di progetto, compreso quello di questo repository. Il file globale `~/.codex/AGENTS.md` dell'utente, se esiste, Codex lo legge comunque.

## Chat

- Scrivi un messaggio. Di serie rispondono tutti e due, uno dopo l'altro.
- Puoi scegliere chi risponde (**Tutti / Claude / Codex**) oppure cominciare il messaggio con `@claude`, `@codex` o `@tutti`.
- Il secondo agente riceve anche la risposta del primo. Deve aggiungere solo quello che manca o correggere quello che non regge. Se non ha niente da aggiungere risponde `PASSO` e la dashboard lo mostra come "niente da aggiungere".
- Ogni agente tiene la sua sessione della CLI. A ogni giro riceve solo i messaggi nuovi, non tutta la chat da capo.
- Il motore dice agli agenti cosa sta succedendo davvero nel programma (partite nate dalla chat, lavori in corso), così non inventano lo stato.
- Il testo di un agente che imita l'intestazione di un messaggio (tuo, dell'altro agente o del motore) viene marcato come citazione.
- In chat la ricerca web è spenta.

Sotto ogni risposta ci sono i token usati.

Comandi della chat:

- **Ferma**: interrompe le risposte in corso.
- **Fai rispondere**: dopo uno stop o un errore, fa rispondere gli agenti a quello che è rimasto senza risposta. Se un agente era stato fermato perché passava ai crediti a consumo, finché il programma resta acceso serve questo gesto esplicito per richiamarlo. Il blocco non si salva: dopo un riavvio il primo messaggio nuovo fa rispondere anche quell'agente.
- **Leggi ad alta voce**: legge una risposta con la sintesi vocale del browser, solo con le voci installate sul PC. Dal menu si può far leggere ogni risposta nuova.
- **Salva come nota**: salva la chat come nota markdown nella sottocartella `Chat` di `CONTRAPPUNTO_SALVA_IN`.
- **Trasforma in compito**: apre una finestra da riempire a mano (titolo, obiettivo, "solo il piano" o "piano, poi produzione") e avvia la partita. Se un agente ha già proposto una scheda, parte da quella, ma la cartella della scheda non passa: per una partita con il materiale di una cartella usa **Avvia** sulla scheda.

## Scheda compito

Quando dalla chat viene fuori un lavoro da fare, l'agente chiude la risposta con un blocco `compito`: titolo, obiettivo, "solo il piano" oppure "piano, poi produzione", e una cartella autorizzata se serve. Il motore toglie il blocco dal testo e lo mostra come **scheda** con il tasto **Avvia**.

- **Avvia** crea una partita con l'obiettivo della scheda e con le ultime battute della chat come contesto.
- Una scheda avvia **una partita sola**: se premi di nuovo, ritrovi quella già creata.
- La chat riceve le notizie della partita: avviata, conclusa, produzione pronta o ferma.
- Con **"piano, poi produzione"** e l'**accordo pieno**, la produzione parte da sola. Senza accordo pieno non parte: decidi tu.

## Partita

### Come si svolge

1. Uno dei due apre (si sceglie chi).
2. Parlano a turni. Un **round** è un intervento ciascuno.
3. Ogni intervento è un messaggio in markdown più un riepilogo strutturato:
   - `stato`: `proposta`, `accordo`, `accordo_parziale` o `disaccordo`;
   - `posizione`: la posizione attuale in poche frasi;
   - `punti_aperti`: cosa resta da risolvere;
   - `cambi_di_posizione`: cosa ha cambiato rispetto all'intervento precedente.
4. Il motore corregge solo quello che contraddice le regole e lo annota:
   - il primo intervento conta sempre come `proposta`;
   - una `proposta` dopo il primo intervento conta come `disaccordo`;
   - un `accordo` con punti aperti conta come `accordo_parziale`.
5. Se una risposta non rispetta il formato, il motore chiede di correggerla, al massimo due volte. Poi si ferma con un errore.

### Modi di lavoro

- **Insieme** (di serie): i due costruiscono la soluzione verso il tuo obiettivo. Il disaccordo serve solo quando c'è un motivo concreto.
- **Confronto**: valutano le alternative in modo critico, finché si vede qual è la scelta migliore.

### Ricerca web

È un'opzione della singola partita ("Ricerca web" quando crei la partita), spenta di serie. Se la accendi:

- Claude riceve lo strumento `WebSearch`;
- Codex riceve la sua ricerca web (`web_search`);
- gli altri strumenti di Claude restano spenti (restano solo le note e, con l'ambiente acceso, le skill);
- in Codex la ricerca web e le note passano dallo stesso canale degli strumenti per file e patch, che quindi si riaccende. Li ferma il motore: se compare uno strumento non ammesso interrompe il turno, e la sandbox resta in sola lettura.

In chat la ricerca web è spenta. In produzione non c'è.

### Durante la partita

- **Pausa**: interrompe il turno in corso. La partita resta in pausa a quel turno.
- **Riprendi**: riparte dal turno interrotto.
- **Concludi**: chiude senza aspettare l'accordo e passa alla sintesi e alla verifica. L'esito è "chiusa dall'utente": il motore non registra un accordo che non c'è stato. Dopo un errore che non si può riprendere (crediti a consumo, strumento non ammesso) Concludi chiude con quello che c'è, senza richiamare gli agenti: se la sintesi non c'era, il documento esce senza, e la partita non può andare in produzione.
- **Nota del moderatore**: un'indicazione tua durante la partita. Arriva a tutti e due, a ciascuno al suo turno successivo, come nota del moderatore con la precedenza sul resto. Se la partita si sta già chiudendo, la ricevono chi scrive la sintesi e chi la verifica.

Se il programma si chiude mentre una partita gira, al riavvio la partita risulta in pausa e si riprende da lì.

### Quando finisce

Il motore controlla dopo ogni intervento:

- **Accordo**: due dichiarazioni consecutive di accordo, una per agente, **senza punti aperti**. Il secondo ha letto il primo e lo sottoscrive.
- **Stallo**: gli ultimi **4 interventi** sono tutti `disaccordo` e nessuno ha cambiato posizione.
- **Limite di round**: si arriva al numero massimo di round (da 1 a 10, di serie 3) senza accordo.
- **Chiusa dall'utente**: hai premuto **Concludi**.

### Sintesi e verifica

Finita la partita:

1. Uno dei due (si sceglie chi) scrive la **sintesi**: conclusione, decisioni condivise, prossimi passi, punti rimasti in disaccordo con le due posizioni.
2. L'altro fa la **verifica**: approva o non approva la sintesi, con un commento e le correzioni.

Il documento finale è in markdown: domanda, interventi, sintesi, verifica, token usati. Si scarica dalla pagina della partita.

A fine partita il motore salva anche la decisione come nota markdown nella sottocartella `Decisioni` di `CONTRAPPUNTO_SALVA_IN`, e la aggiorna quando finisce la produzione. Le partite dopo la ritrovano tra le note.

### Materiale

Una partita può ricevere in lettura una **cartella autorizzata**. Gli agenti non leggono la cartella vera: ricevono una copia del testo dei file, filtrata, letta una volta sola quando la partita nasce. Se la cartella cambia dopo, la partita non cambia.

Dalla copia si tolgono:

- cartelle di dipendenze e di build (per esempio `node_modules`, `dist`, `.git`);
- file che di solito contengono credenziali (per esempio `.env`, chiavi, keystore);
- righe che sembrano segreti (chiavi, token, password nelle stringhe di connessione).

Il materiale arriva dentro un delimitatore casuale che il testo non può imitare. Le righe che fingono di essere messaggi del motore si neutralizzano.

Le cartelle autorizzate si aggiungono e si tolgono sempre e solo dal PC: dalla dashboard (**Gestisci**, nella creazione della partita) o da terminale con `npm run dibattito -- --autorizza <nome> <percorso>` (con `npm run` il comando legge il `.env`, come `npm start`). Non si possono autorizzare un disco intero, la cartella utente intera, le cartelle delle CLI, quelle delle chiavi SSH e i dati del programma.

## Produzione

La produzione parte da una partita **conclusa con la sintesi**.

1. **Cantiere.** Il motore crea una cartella nuova in `dati/cantieri/<id>`. È vuota, oppure contiene la copia ripulita di una cartella autorizzata (con lo stesso filtro del materiale). Se su Windows la cartella dei dati sta dentro `AppData`, la produzione si ferma subito con un messaggio: il motore vieta a Claude quella cartella, quindi lì non potrebbe scrivere.
2. **Lavoro di Claude.** Claude riceve la decisione (obiettivo, conclusione, decisioni, prossimi passi, punti aperti, esito della verifica) e scrive i file nel cantiere.
   - Strumenti: solo lettura e scrittura di file, limitate alla cartella del cantiere dalle regole dei permessi di Claude Code.
   - Niente comandi, niente web, nessuna impostazione o server MCP dell'utente (a parte le note in sola lettura).
   - Le cartelle delle CLI (anche se spostate con `CLAUDE_CONFIG_DIR` o `CODEX_HOME`), quella delle chiavi SSH e `AppData` sono vietate in modo esplicito.
   - Il motore ferma il lavoro se vede una scrittura fuori dal cantiere, e controlla che Claude Code non abbia creato la sua memoria automatica per il cantiere.
   - Ogni giro ha un tempo massimo e un numero massimo di passaggi.
3. **Collaudo di Codex.** Codex riceve il resoconto di Claude e il testo dei file prodotti, in sola lettura. Risponde se approva, con l'elenco dei problemi e un commento.
4. **Correzione.** Se il collaudo respinge il lavoro, Claude riparte nello stesso cantiere con i problemi trovati. Corregge quello che si risolve scrivendo file e dice cosa resta. Codex ricontrolla. Si corregge **al massimo due volte**.
5. **Consegna.** La produzione è pronta: con il collaudo superato, oppure "da rivedere" con l'ultimo collaudo. I file restano nel cantiere.

La cartella originale non viene mai toccata. Se fermi la produzione o c'è un errore, quello che è già stato scritto resta nel cantiere.

## Ufficio 3D e Lavori

La scena 3D mostra gli agenti come omini. Lo stato viene dagli eventi delle CLI: ragiona, cerca nelle note, scrive la risposta, lavora nel cantiere.

Toccando un omino o il suo cartellino si apre la **scheda dell'agente**:

- cosa sta facendo adesso;
- cosa ha usato (note lette, ricerche);
- le skill in uso, solo se la CLI conferma di averle usate;
- le skill a disposizione su questo PC.

Il pannello **Lavori** elenca le partite e le produzioni al lavoro e quelle che aspettano una tua decisione.

## Note e profilo

Gli agenti possono leggere alcune note tramite un piccolo **server MCP locale** (`motore/memoria-mcp.ts`). Lo avviano le CLI, con tre strumenti: `cerca`, `leggi`, `elenco`.

Le fonti, decise dal motore:

- il **profilo** (`profilo.md`, o il file in `CONTRAPPUNTO_PROFILO`);
- la **cartella di note** in `CONTRAPPUNTO_NOTE`, se c'è;
- la cartella delle **note salvate**, `CONTRAPPUNTO_SALVA_IN`: lì il programma mette le decisioni delle partite (sottocartella `Decisioni`) e le chat salvate con "Salva come nota" (sottocartella `Chat`). Gli agenti leggono tutti i file `.md` della cartella, non solo quelle due: se la fai puntare alla radice del tuo vault, leggono tutto il vault. Meglio una cartella dedicata;
- con `CONTRAPPUNTO_AMBIENTE=1`, anche le tue cartelle di Claude Code: il tuo `CLAUDE.md`, le skill, gli agenti, i comandi e la cartella dei plugin scaricati (`.claude/plugins/cache`, con tutti i loro file `.md`, anche dei plugin spenti); in più le skill di Codex.

Il server:

- legge solo file `.md` dentro le fonti;
- non segue i collegamenti;
- cancella le righe che sembrano credenziali;
- non scrive e non usa la rete.

Gli agenti trattano le note come dati, non come istruzioni.

Con `CONTRAPPUNTO_AMBIENTE` spento (di serie) Claude parte senza le tue impostazioni utente di Claude Code: niente CLAUDE.md, plugin, skill, hook o server MCP tuoi. Acceso, Claude parte con le tue impostazioni utente, ma con gli hook spenti e con il divieto esplicito degli strumenti che scrivono o eseguono.

## Voce

- **Trascrizione sul PC**: il motore avvia un processo Python con faster-whisper (modello `small`, su CPU) alla prima richiesta, lo tiene in memoria per un po' e poi lo spegne. L'audio sta su disco solo il tempo della trascrizione. L'audio non esce dal PC.
- **Dettatura del browser**: la fa il browser, con i servizi di Google o di Apple. Si sceglie dal menu della chat.

La trascrizione sul PC usa la lingua di `CONTRAPPUNTO_LINGUA_VOCE` (di serie `it`). Con `CONTRAPPUNTO_WHISPER_PAROLE` si suggeriscono al modello altre parole che sbaglia facilmente, separate da virgole: si aggiungono a un elenco di base (Claude, Codex, ChatGPT, ...). Il programma toglie anche le frasi che Whisper a volte "sente" nel silenzio, come le righe di chiusura dei sottotitoli.

La **lettura ad alta voce** delle risposte è la sintesi vocale del browser. Il programma usa solo le voci installate sul PC: se il browser ha solo voci online, non legge e la voce del menu non compare. Toglie il markdown prima di leggere.

## Dati salvati

Tutto sta in `dati/` nella cartella del programma (o in `CONTRAPPUNTO_DATI`):

- chat e partite, un file JSON ciascuna;
- i documenti finali delle partite in markdown;
- i cantieri della produzione (`dati/cantieri/<id>`);
- le note salvate (`dati/note`, se non scegli un'altra cartella con `CONTRAPPUNTO_SALVA_IN`), con le sottocartelle `Decisioni` e `Chat`;
- l'elenco delle cartelle autorizzate;
- l'ambiente Python della voce (`dati/voce-venv`), se lo installi.

Su Windows la cartella dei dati non deve stare dentro `AppData` (e il programma neanche): il motore vieta a Claude quella cartella, come quelle delle CLI e delle chiavi SSH, quindi ferma la produzione con un messaggio. Un percorso relativo in `CONTRAPPUNTO_DATI` parte dalla cartella del programma.

Niente esce dal PC, salvo quello che le CLI mandano ai rispettivi servizi per rispondere. Questo include i messaggi, il contesto della chat e quello che gli agenti leggono: profilo, note, copie delle cartelle autorizzate, file del cantiere. Con la ricerca web accesa, anche le ricerche che fanno gli agenti. Con la dettatura del browser, l'audio passa dai servizi del browser.

Le CLI tengono anche la loro cronologia delle sessioni nelle proprie cartelle, come fanno sempre.

Per cancellare tutto quello che il programma ha salvato, chiudilo e cancella la cartella `dati/` (o quella di `CONTRAPPUNTO_DATI`). Se hai messo le note in un'altra cartella con `CONTRAPPUNTO_SALVA_IN`, lì restano le sottocartelle `Decisioni` e `Chat`. Nella cartella temporanea del sistema c'è anche una cartella di lavoro vuota per le CLI (`contrappunto`), che puoi cancellare.
