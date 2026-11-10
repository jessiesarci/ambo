# Come funziona

## Architettura

Il programma ha tre parti, tutte sul tuo PC.

- **Il motore**: un programma Node.js. Tiene le chat e le partite, decide chi parla, lancia gli assistenti della squadra, controlla le risposte, salva i dati.
- **Il server**: fa parte del motore e ascolta solo su `127.0.0.1` (di serie sulla porta 4317). Serve la dashboard e le API, e manda gli aggiornamenti in tempo reale al browser.
- **La dashboard**: una pagina React con la scena 3D fatta con Three.js, nel tuo browser.

Il motore non parla con i modelli direttamente. Avvia le **CLI ufficiali come processi**:

- `claude -p` (Claude Code senza interfaccia) per Claude;
- `codex exec` per Codex.

Ogni CLI usa il login che hai già fatto e manda le richieste al proprio servizio. Se accendi la ricerca web in una partita, le CLI usano anche la loro ricerca web: è l'unico altro accesso alla rete degli agenti. Il motore legge l'output delle CLI riga per riga, mostra cosa stanno facendo e ferma il processo se qualcosa non va.

Anche gli assistenti della squadra sono processi delle stesse CLI: li avvia il motore, uno alla volta, ognuno con il suo messaggio di sistema. Non sono sub-agenti delle CLI (gli strumenti per crearli restano vietati).

```
browser (dashboard)
   |  HTTP e aggiornamenti in tempo reale, solo 127.0.0.1
motore Node.js
   |-- claude -p  ........ processo, login del tuo account Claude (capo reparto o assistente)
   |-- codex exec ........ processo, login del tuo account ChatGPT (capo reparto o assistente)
   |      '-- server MCP delle note (lo avviano le CLI, sola lettura)
   |-- trascrizione voce (Python, facoltativa)
   '-- dati/  (chat, partite, documenti, cantieri, note salvate, squadra, procedure)
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

Tempi e token usati di ogni risposta si vedono con un tocco sulla risposta; dal menu (**Mostra tempi e token**) restano sempre visibili. I messaggi del motore (partita avviata, conclusa, produzione pronta) mostrano la prima frase: un tocco apre il testo intero.

Comandi della chat:

- **Ferma**: interrompe le risposte in corso.
- **Fai rispondere**: dopo uno stop o un errore, fa rispondere gli agenti a quello che è rimasto senza risposta. Se un agente era stato fermato perché passava ai crediti a consumo, finché il programma resta acceso serve questo gesto esplicito per richiamarlo. Il blocco non si salva: dopo un riavvio il primo messaggio nuovo fa rispondere anche quell'agente.
- **Leggi ad alta voce**: legge una risposta con la sintesi vocale del browser, solo con le voci installate sul PC. Dal menu si può far leggere ogni risposta nuova.
- **Salva come nota**: salva la chat come nota markdown nella sottocartella `Chat` di `AMBO_SALVA_IN`.
- **Trasforma in compito**: apre una finestra da riempire a mano (titolo, obiettivo, "solo il piano" o "piano, poi produzione") e avvia la partita. Se un agente ha già proposto una scheda, parte da quella, ma la cartella della scheda non passa: per una partita con il materiale di una cartella usa **Avvia** sulla scheda.

## Scheda compito

Quando dalla chat viene fuori un lavoro da fare, l'agente chiude la risposta con un blocco `compito`: titolo, obiettivo, "solo il piano" oppure "piano, poi produzione", e una cartella autorizzata se serve. Il motore toglie il blocco dal testo e lo mostra come **scheda** con il tasto **Avvia**.

- **Avvia** crea una partita (una riunione) con l'obiettivo della scheda e con le ultime battute della chat come contesto.
- Una scheda avvia **una partita sola**: se premi di nuovo, ritrovi quella già creata.
- La chat riceve le notizie della partita: avviata, conclusa, produzione pronta o ferma.
- Con **"piano, poi produzione"** e l'**accordo pieno**, la produzione parte da sola. Senza accordo pieno non parte: decidi tu.

## Partita: la riunione

### Come si svolge

Una partita è una riunione di pianificazione. Claude e Codex sono i due capi reparto: costruiscono insieme il piano per l'obiettivo dell'utente e possono affidare incarichi alla squadra.

1. Uno dei due apre (si sceglie chi).
2. Parlano a turno, un intervento ciascuno. Non c'è un numero fisso di interventi.
3. Ogni intervento è un messaggio in markdown più un riepilogo strutturato:
   - `stato`: `proposta`, `accordo`, `accordo_parziale` o `disaccordo`;
   - `posizione`: la posizione attuale in poche frasi;
   - `punti_aperti`: cosa resta da risolvere;
   - `cambi_di_posizione`: cosa ha cambiato rispetto all'intervento precedente;
   - `incarichi`: i lavori da affidare agli assistenti, ognuno con l'id dell'assistente e il compito. Di solito è vuoto.
4. Il motore corregge solo quello che contraddice le regole e lo annota:
   - il primo intervento conta sempre come `proposta`;
   - una `proposta` dopo il primo intervento conta come `disaccordo`;
   - un `accordo` con punti aperti conta come `accordo_parziale`.
5. Se una risposta non rispetta il formato, il motore chiede di correggerla, al massimo due volte. Poi si ferma con un errore.
6. Dopo l'intervento il motore esegue gli incarichi accettati (vedi [La squadra](#la-squadra)). Chi parla dopo riceve i rapporti.

Ogni capo reparto ha la sua sessione della CLI: dal secondo intervento riceve solo l'intervento nuovo dell'altro, i rapporti della squadra che non ha ancora letto e le note del moderatore.

### Modi di lavoro

- **Insieme** (di serie): i due costruiscono la soluzione verso il tuo obiettivo. Il disaccordo serve solo quando c'è un motivo concreto.
- **Confronto**: valutano le alternative in modo critico, finché si vede qual è la scelta migliore.

### Ricerca web

È un'opzione della singola partita ("Ricerca web" quando crei la partita), spenta di serie. Se la accendi:

- Claude riceve lo strumento `WebSearch`;
- Codex riceve la sua ricerca web (`web_search`);
- gli altri strumenti di Claude restano spenti (restano solo le note e, con l'ambiente acceso, le skill);
- vale anche per gli assistenti della squadra, in riunione; in produzione la ricerca web non c'è;
- in Codex la ricerca web e le note passano dallo stesso canale degli strumenti per file e patch, che quindi si riaccende. Li ferma il motore: se compare uno strumento non ammesso interrompe il turno, e la sandbox resta in sola lettura.

In chat la ricerca web è spenta. In produzione non c'è.

### Durante la partita

- **Pausa**: interrompe l'intervento in corso. La partita resta in pausa a quell'intervento. Se in quel momento lavora un assistente, il suo incarico torna in coda e si rifà alla ripresa.
- **Riprendi**: riparte dall'intervento (o dall'incarico) interrotto.
- **Concludi**: chiude senza aspettare l'accordo e passa alla sintesi e alla verifica. Gli incarichi non ancora finiti si annullano. L'esito è "chiusa dall'utente": il motore non registra un accordo che non c'è stato. Dopo un errore che non si può riprendere (crediti a consumo, strumento non ammesso) Concludi chiude con quello che c'è, senza richiamare gli agenti: se la sintesi non c'era, il documento esce senza, e la partita non può andare in produzione.
- **Nota del moderatore**: un'indicazione tua durante la partita. Arriva a tutti e due, a ciascuno al suo intervento successivo, come nota del moderatore con la precedenza sul resto. Se la partita si sta già chiudendo, la ricevono chi scrive la sintesi e chi la verifica.

Se il programma si chiude mentre una partita gira, al riavvio la partita risulta in pausa e si riprende da lì.

### Quando finisce

Il motore controlla dopo ogni intervento:

- **Accordo** (piano pronto): due dichiarazioni consecutive di accordo, una per agente, **senza punti aperti**. Il secondo ha letto il primo e lo sottoscrive.
- **Stallo**: solo nel modo confronto. Gli ultimi **4 interventi** sono tutti `disaccordo` e nessuno ha cambiato posizione.
- **Limite di sicurezza**: si arriva a **16 interventi** senza accordo. Il limite serve a non consumare la quota; gli agenti lo sanno solo all'ultimo intervento, quando il motore dice di chiudere. Gli incarichi chiesti nell'ultimo intervento non si eseguono.
- **Chiusa dall'utente**: hai premuto **Concludi**.

Le partite salvate con la versione 0.1.0 si aprono ancora, con il loro esito.

### Sintesi e verifica

Finita la partita:

1. Uno dei due (si sceglie chi) scrive la **sintesi**: conclusione, decisioni condivise, prossimi passi, punti rimasti in disaccordo con le due posizioni. In più:
   - `procedura`: l'id della procedura che la produzione deve seguire, oppure `su-misura`;
   - `pacchetti`: il lavoro per la produzione diviso in pacchetti, in ordine, ognuno con titolo, assistente e obiettivo (al massimo 5).
   Il motore tiene solo i pacchetti di assistenti che lavorano in produzione e una procedura che esiste: gli scarti li dice con un avviso.
2. L'altro fa la **verifica**: approva o non approva la sintesi, con un commento e le correzioni (anche su procedura e pacchetti).

Il documento finale è in markdown: domanda, interventi, sintesi, verifica, il lavoro della squadra (incarichi con i rapporti accorciati, pacchetti e revisioni della produzione), token usati. Si scarica dalla pagina della partita.

A fine partita il motore salva anche la decisione come nota markdown nella sottocartella `Decisioni` di `AMBO_SALVA_IN`, e la aggiorna quando finisce la produzione. Le partite dopo la ritrovano tra le note.

### Materiale

Una partita può ricevere in lettura una **cartella autorizzata**. Gli agenti non leggono la cartella vera: ricevono una copia del testo dei file, filtrata, letta una volta sola quando la partita nasce. Se la cartella cambia dopo, la partita non cambia.

Dalla copia si tolgono:

- cartelle di dipendenze e di build (per esempio `node_modules`, `dist`, `.git`);
- file che di solito contengono credenziali (per esempio `.env`, chiavi, keystore);
- righe che sembrano segreti (chiavi, token, password nelle stringhe di connessione).

Il materiale arriva dentro un delimitatore casuale che il testo non può imitare. Le righe che fingono di essere messaggi del motore si neutralizzano.

Le cartelle autorizzate si aggiungono e si tolgono sempre e solo dal PC: dalla dashboard (**Gestisci**, nella creazione della partita) o da terminale con `npm run dibattito -- --autorizza <nome> <percorso>` (con `npm run` il comando legge il `.env`, come `npm start`). Non si possono autorizzare un disco intero, la cartella utente intera, le cartelle delle CLI, quelle delle chiavi SSH e i dati del programma.

## La squadra

### Il catalogo

Gli assistenti che i capi reparto possono chiamare. Ci sono sempre i 7 di serie, con le istruzioni di ruolo in `motore/istruzioni/squadra/<id>.md`:

| id | Nome | Ruolo | CLI | In produzione |
|---|---|---|---|---|
| `ricerca` | Rita | Ricerca | Claude | no |
| `analisi` | Marco | Analisi | Codex | no |
| `architettura` | Elena | Architettura | Claude | no |
| `testi` | Luca | Testi | Claude | sì |
| `design` | Sara | Design | Claude | sì |
| `sviluppo` | Paolo | Sviluppo | Claude | sì |
| `controllo` | Nadia | Controllo qualità | Codex | no |

Ognuno ha una descrizione di una riga e da 3 a 5 skill scritte in modo concreto. In produzione lavorano solo assistenti con Claude, perché il cantiere esiste solo per Claude.

**Agenti dell'utente.** Con `AMBO_AMBIENTE=1` il catalogo comprende anche i file `~/.claude/agents/*.md` (o la cartella in `AMBO_AGENTI`; con `AMBO_AGENTI=0` nessuno). Con l'ambiente spento, di serie, non si leggono. Per ogni file:

- l'id è il campo `name` del frontmatter (o il nome del file), il ruolo è la prima frase di `description`, le skill sono i pezzi della descrizione (al massimo 5);
- le istruzioni sono il corpo del file, tagliato a 16.000 caratteri; vanno nel messaggio di sistema **dopo** le regole del motore, che valgono sempre prima;
- lavora con Claude;
- può costruire pacchetti solo se il campo `tools` contiene `Write` o `Edit`. A parte questo, `tools` non si usa: gli strumenti sono sempre quelli del motore;
- se l'id è uguale a quello di un assistente di serie, prende il suo posto.

Il catalogo ha al massimo 40 voci, prima gli agenti dell'utente e poi quelli di serie. Alla dashboard arrivano nome, ruolo, descrizione, skill e statistiche, mai le istruzioni.

### Gli incarichi

- Un capo reparto chiede un incarico con il campo `incarichi` del suo intervento: l'id dell'assistente (vale anche il nome) e il compito.
- Il motore ne accetta al massimo **2 per intervento** e **8 per riunione**. Gli incarichi oltre il limite, con un assistente che non c'è o con il compito vuoto si scartano, e il motore lo annota nell'intervento.
- Dopo l'intervento il motore esegue gli incarichi **uno alla volta, in ordine**. Ogni assistente:
  - lavora con la CLI del suo ruolo (Claude o Codex), in una **sessione nuova**, con gli stessi strumenti dei capi reparto: sola lettura, note e ricerca web solo se sono accese;
  - riceve come messaggio di sistema le regole comuni (`motore/istruzioni/sistema-assistente.md`) seguite dal suo ruolo;
  - riceve l'obiettivo, il compito (dentro un delimitatore casuale: l'ha scritto un altro modello) e l'eventuale materiale della cartella autorizzata. Non vede la riunione;
  - consegna un rapporto in testo libero, al massimo circa 1500 parole (oltre i 12.000 caratteri il motore lo taglia).
- Il capo reparto che parla dopo riceve i rapporti sotto "RAPPORTI DELLA SQUADRA", dentro un delimitatore casuale e con le righe che imitano il motore neutralizzate: sono dati, non istruzioni. Anche chi li ha chiesti li riceve, al suo intervento successivo, una volta sola.
- Un incarico che non riesce non ferma la riunione: va a "fallito" e i capi ricevono l'errore al posto del rapporto. Fermano tutto solo gli errori di sicurezza che non si possono riprendere (crediti a consumo, strumento o server non ammesso), come per i capi reparto.

### Le procedure

Una procedura è un modo di lavorare: un elenco di passi, ognuno con un assistente e una fase.

- `piano`: un incarico in riunione;
- `produzione`: un pacchetto nel cantiere;
- `collaudo`: una revisione in sola lettura dei file prodotti, dopo il collaudo di Codex.

Quelle di serie stanno in `motore/procedure/`: sito web, documento, analisi, codice e "su misura" (senza passi, decide la riunione). Quelle dell'utente stanno in `<cartella dati>/procedure/*.json`, fuori dal repository; con lo stesso id vincono su quelle di serie. I passi con un assistente che non è nel catalogo si tolgono, e una procedura che li perde tutti non si propone. Al massimo 20 procedure e 12 passi ciascuna.

I capi reparto ricevono l'elenco delle procedure con i loro passi e nella sintesi ne scelgono una.

### Esperienza e livelli

Le statistiche stanno in `dati/squadra.json`, per id (vale anche per gli agenti dell'utente). Il file si riscrive per intero con una scrittura atomica; se è rovinato, il motore lo mette da parte e riparte da zero.

| Cosa | XP |
|---|---|
| Rapporto consegnato in riunione | 20 |
| Revisione fatta in produzione | 20 |
| Pacchetto di produzione fatto | 30 |
| Collaudo superato | 20 a ogni assistente con un pacchetto fatto in quella produzione |
| Incarico, pacchetto o revisione fallita | 0 |

I livelli vanno da 1 a 10, con le soglie 0, 60, 160, 320, 560, 900, 1350, 1950, 2700, 3600 XP. Ogni due livelli c'è un titolo: Apprendista (1-2), Operativo (3-4), Esperto (5-6), Veterano (7-8), Leggenda (9-10). Si contano anche le chiamate, i lavori completati e falliti, i pacchetti, i pacchetti finiti in un collaudo superato e la percentuale di riuscita. Uno stop chiesto dall'utente non conta come fallimento.

I **badge** non si salvano: il motore li calcola dalle statistiche a ogni richiesta del catalogo, quindi una regola nuova vale subito anche per il passato.

| Badge | Regola |
|---|---|
| Prima consegna | il primo lavoro portato a termine |
| 10 rapporti, 25 rapporti | rapporti consegnati in riunione o revisioni al collaudo (i pacchetti contano a parte) |
| Collaudo superato, 5 collaudi | suoi pacchetti finiti in un collaudo superato; solo per chi lavora in produzione |
| Affidabile | riuscita del 90% o più su almeno 10 lavori finiti, arrotondata come nella scheda |
| Instancabile | 50 chiamate |
| Livello 5 | arrivare al livello 5 |
| Il più chiamato | il primo della squadra per chiamate (se nessuno è stato chiamato, nessuno) |

## Produzione

La produzione parte da una partita **conclusa con la sintesi**. Funziona come una catena di montaggio.

1. **Cantiere.** Il motore crea una cartella nuova in `dati/cantieri/<id>`. È vuota, oppure contiene la copia ripulita di una cartella autorizzata (con lo stesso filtro del materiale). Se su Windows la cartella dei dati sta dentro `AppData`, la produzione si ferma subito con un messaggio: il motore vieta a Claude quella cartella, quindi lì non potrebbe scrivere.
2. **Pacchetti.** I pacchetti sono quelli della sintesi, ricontrollati sul catalogo. Senza pacchetti si usano i passi di produzione della procedura scelta; senza neanche quelli c'è un solo pacchetto, "Tutta la decisione", per Paolo (sviluppo). Al massimo 5.
3. **Lavoro degli assistenti.** I pacchetti si costruiscono **uno dopo l'altro**, nello stesso cantiere. Ogni assistente riceve la decisione (obiettivo, conclusione, decisioni, prossimi passi, punti aperti, procedura, pacchetti, esito della verifica), il suo pacchetto, chi ha lavorato prima di lui con i file che ha scritto e chi viene dopo. Il messaggio di sistema è quello del cantiere (`sistema-cantiere.md`) seguito dal suo ruolo.
   - Strumenti: solo lettura e scrittura di file, limitate alla cartella del cantiere dalle regole dei permessi di Claude Code.
   - Niente comandi, niente web, nessuna impostazione o server MCP dell'utente (a parte le note in sola lettura).
   - Le cartelle delle CLI (anche se spostate con `CLAUDE_CONFIG_DIR` o `CODEX_HOME`), quella delle chiavi SSH e `AppData` sono vietate in modo esplicito.
   - Il motore ferma il lavoro se vede una scrittura fuori dal cantiere, e controlla che Claude Code non abbia creato la sua memoria automatica per il cantiere.
   - Ogni pacchetto (e ogni correzione) ha un tempo massimo di 25 minuti e al massimo 40 passaggi.
   - Se un pacchetto si ferma con un errore, la produzione si ferma: quello che è già scritto resta nel cantiere.
4. **Collaudo di Codex.** Codex riceve il resoconto del cantiere e il testo dei file prodotti, in sola lettura. Risponde se approva, con l'elenco dei problemi e un commento.
5. **Revisioni della procedura.** Se la procedura ha passi di collaudo, i loro assistenti rivedono gli stessi file dopo Codex, uno alla volta, in sola lettura, con la CLI del loro ruolo. Il collaudo del giro passa solo se lo approvano Codex e tutte le revisioni arrivate; i problemi delle revisioni entrano nell'elenco con il nome dell'assistente davanti. Una revisione che non arriva non blocca il collaudo, ma si dice.
6. **Correzione.** Se il collaudo respinge il lavoro, corregge l'assistente dei file citati più spesso nei problemi (a parità, quello dell'ultimo pacchetto fatto), nello stesso cantiere. Corregge quello che si risolve scrivendo file e dice cosa resta. Poi si ricontrolla. Si corregge **al massimo due volte**.
7. **Consegna.** La produzione è pronta: con il collaudo superato, oppure "da rivedere" con l'ultimo collaudo. I file restano nel cantiere.

La cartella originale non viene mai toccata. Se fermi la produzione o c'è un errore, quello che è già stato scritto resta nel cantiere.

## Ufficio 3D e Lavori

La scena 3D mostra gli agenti come omini. Lo stato viene dagli eventi delle CLI: ragiona, cerca nelle note, scrive la risposta, lavora nel cantiere.

L'ufficio è diviso in **reparti**, ognuno con un tappeto, un cartello a terra e le sue postazioni: Direzione (Claude e Codex), Ricerca e analisi (ricerca, analisi), Progettazione (architettura, design), Contenuti (testi), Sviluppo (sviluppo), Qualità (controllo) e Ospiti, la zona relax. Ci sono anche la sala riunioni e il magazzino della produzione.

- **Claude e Codex** stanno in sala solo durante la riunione, sintesi e verifica comprese. Il resto del tempo, anche in chat, sono alle loro scrivanie in Direzione. Codex va al banco del collaudo quando la produzione è in collaudo. Tra le loro scrivanie una lavagna mostra la partita aperta: titolo, stato e il piano (i pacchetti, le decisioni o l'ultima posizione con i punti aperti).
- **Gli assistenti** chiamati nella partita aperta siedono nel loro reparto, nell'ordine della prima chiamata. I 7 di serie hanno un posto fisso, che gli altri non prendono. Un agente dell'utente va al reparto ricavato dalla procedura (un passo di collaudo porta a Qualità), dalla produzione (Sviluppo) o da parole del suo id, ruolo e descrizione; altrimenti agli ospiti. Un reparto pieno manda agli ospiti; se sono pieni anche loro, l'assistente compare solo nei pannelli.
- Sono seduti quando sono liberi e scrivono quando lavorano a un incarico o a un pacchetto, con il fumetto "Al lavoro" e lo schermo acceso del loro colore. Il reparto dove qualcuno lavora ha il filo a terra lime. Il cartellino porta il nome, il livello e la barra dell'XP, nel colore dell'avatar. Toccandolo si apre la **scheda dell'assistente**.
- **Catena di montaggio.** Nel magazzino la linea ha le fasi vere della produzione: 1 Piano (la sintesi approvata), 2 Costruzione (una postazione per pacchetto, con l'assistente che lo costruisce), 3 Collaudo (Codex e gli assistenti di collaudo della procedura), 4 Correzioni (il cartello resta spento se non servono), 5 Consegna. La scatola del lavoro sta alla stazione dove la produzione è davvero, anche se è ferma; ogni pacchetto finito lascia una scatoletta sulla sua postazione.
- **Grafica ridotta.** Di serie sul telefono, e da sola quando il PC rallenta molto o il browser perde il contesto WebGL: niente effetti di resa, ombre aggiornate poche volte al secondo, animazioni a 15 fotogrammi e al massimo 4 assistenti animati, prima chi lavora.

Nella pagina delle partite il pannello **Squadra** mostra il podio dei tre con più XP (solo chi ne ha) e una carta per assistente: avatar, nome, livello, barra dell'XP e gli ultimi tre badge presi. L'ordine si sceglie tra esperienza, chiamate e riuscita. Sotto ci sono le procedure.

La **scheda dell'assistente** si apre da una carta, da un cartellino o da una riga del registro: avatar, nome, ruolo, titolo e livello, barra dell'XP con quanto manca al livello dopo, tutti i badge (presi e da prendere), la descrizione intera, skill, statistiche e gli ultimi lavori con il loro esito. Sul telefono occupa tutto lo schermo; si chiude con la X, con Esc o toccando fuori.

Gli avatar sono ritratti disegnati dal programma, stabili per id: per i 7 di serie scelti a mano, per gli agenti dell'utente ricavati dall'id.

Toccando un omino o il suo cartellino si apre la **scheda dell'agente**:

- cosa sta facendo adesso;
- cosa ha usato (note lette, ricerche);
- le skill in uso, solo se la CLI conferma di averle usate;
- le skill a disposizione su questo PC.

In chat i **Lavori** stanno in una riga sola ("2 da decidere · 1 al lavoro"). Un tocco apre l'elenco: prima quello che aspetta una tua decisione (fermo nelle ultime 24 ore), poi le partite e le produzioni al lavoro.

## Note e profilo

Gli agenti possono leggere alcune note tramite un piccolo **server MCP locale** (`motore/memoria-mcp.ts`). Lo avviano le CLI, con tre strumenti: `cerca`, `leggi`, `elenco`.

Le fonti, decise dal motore:

- il **profilo** (`profilo.md`, o il file in `AMBO_PROFILO`);
- la **cartella di note** in `AMBO_NOTE`, se c'è;
- la cartella delle **note salvate**, `AMBO_SALVA_IN`: lì il programma mette le decisioni delle partite (sottocartella `Decisioni`) e le chat salvate con "Salva come nota" (sottocartella `Chat`). Gli agenti leggono tutti i file `.md` della cartella, non solo quelle due: se la fai puntare alla radice del tuo vault, leggono tutto il vault. Meglio una cartella dedicata;
- con `AMBO_AMBIENTE=1`, anche le tue cartelle di Claude Code: il tuo `CLAUDE.md`, le skill, gli agenti, i comandi e la cartella dei plugin scaricati (`.claude/plugins/cache`, con tutti i loro file `.md`, anche dei plugin spenti); in più le skill di Codex.

Il server:

- legge solo file `.md` dentro le fonti;
- non segue i collegamenti;
- cancella le righe che sembrano credenziali;
- non scrive e non usa la rete.

Gli agenti trattano le note come dati, non come istruzioni.

Con `AMBO_AMBIENTE` spento (di serie) Claude parte senza le tue impostazioni utente di Claude Code: niente CLAUDE.md, plugin, skill, hook o server MCP tuoi. Acceso, Claude parte con le tue impostazioni utente, ma con gli hook spenti e con il divieto esplicito degli strumenti che scrivono o eseguono.

## Voce

- **Trascrizione sul PC**: il motore avvia un processo Python con faster-whisper (modello `small`, su CPU) alla prima richiesta, lo tiene in memoria per un po' e poi lo spegne. L'audio sta su disco solo il tempo della trascrizione. L'audio non esce dal PC.
- **Dettatura del browser**: la fa il browser, con il servizio vocale di chi lo fa (per esempio Google con Chrome o Apple con Safari). Si sceglie dal menu della chat.

La trascrizione sul PC usa la lingua di `AMBO_LINGUA_VOCE` (di serie `it`). Con `AMBO_WHISPER_PAROLE` si suggeriscono al modello altre parole che sbaglia facilmente, separate da virgole: si aggiungono a un elenco di base (Claude, Codex, ChatGPT, ...). Il programma toglie anche le frasi che Whisper a volte "sente" nel silenzio, come le righe di chiusura dei sottotitoli.

La **lettura ad alta voce** delle risposte è la sintesi vocale del browser. Il programma usa solo le voci installate sul PC: se il browser ha solo voci online, non legge e la voce del menu non compare. Toglie il markdown prima di leggere.

## Dati salvati

Tutto sta in `dati/` nella cartella del programma (o in `AMBO_DATI`):

- chat e partite, un file JSON ciascuna;
- le statistiche della squadra (`squadra.json`) e, se le scrivi, le tue procedure (`procedure/`);
- i documenti finali delle partite in markdown;
- i cantieri della produzione (`dati/cantieri/<id>`);
- le note salvate (`dati/note`, se non scegli un'altra cartella con `AMBO_SALVA_IN`), con le sottocartelle `Decisioni` e `Chat`;
- l'elenco delle cartelle autorizzate;
- l'ambiente Python della voce (`dati/voce-venv`), se lo installi.

Su Windows la cartella dei dati non deve stare dentro `AppData` (e il programma neanche): il motore vieta a Claude quella cartella, come quelle delle CLI e delle chiavi SSH, quindi ferma la produzione con un messaggio. Un percorso relativo in `AMBO_DATI` parte dalla cartella del programma.

Niente esce dal PC, salvo quello che le CLI mandano ai rispettivi servizi per rispondere. Questo include i messaggi, il contesto della chat e quello che gli agenti leggono: profilo, note, copie delle cartelle autorizzate, file del cantiere. Con la ricerca web accesa, anche le ricerche che fanno gli agenti. Con la dettatura del browser, l'audio passa dai servizi del browser.

Le CLI tengono anche la loro cronologia delle sessioni nelle proprie cartelle, come fanno sempre.

Per cancellare tutto quello che il programma ha salvato, chiudilo e cancella la cartella `dati/` (o quella di `AMBO_DATI`). Se hai messo le note in un'altra cartella con `AMBO_SALVA_IN`, lì restano le sottocartelle `Decisioni` e `Chat`. Nella cartella temporanea del sistema c'è anche una cartella di lavoro per le CLI (`ambo`), con i messaggi di sistema degli assistenti che lavorano con Codex, che puoi cancellare.
