# Condizioni d'uso dei servizi

Questa pagina non è un parere legale. Riassume come funziona il programma e cosa dicono alcune pagine ufficiali, lette il 9 novembre 2026. Le condizioni dei fornitori cambiano: fa fede sempre il testo ufficiale aggiornato.

## Perché il programma usa le CLI ufficiali con il tuo login

Ambo non parla con i modelli in modo diretto. Avvia sul tuo PC le CLI ufficiali, Claude Code e Codex CLI, così come le pubblicano Anthropic e OpenAI, e queste usano il login che hai fatto tu.

In pratica:

- il programma non ha account suoi e non offre un login a Claude o a ChatGPT;
- il login lo fai tu, con il flusso ufficiale di ciascuna CLI (`claude` poi `/login`, `codex login`);
- il programma non legge, non salva e non inoltra le tue credenziali o i tuoi token;
- non modifica le CLI;
- l'uso viene conteggiato sul tuo abbonamento, a nome tuo: il programma non paga, non rivende e non fa da intermediario per nessuno;
- gira sul tuo PC e risponde solo a te (127.0.0.1).

Di serie il programma rifiuta il login con chiave API e si ferma se Claude passa ai crediti extra a consumo, così non ci sono spese oltre l'abbonamento senza che tu lo decida.

## Cosa dicono le pagine ufficiali

### Anthropic: Claude Code, aspetti legali

Pagina: https://code.claude.com/docs/en/legal-and-compliance

In sintesi:

- L'uso di Claude Code è regolato dalle Condizioni per i consumatori (piani Free, Pro, Max, Ultra) o dalle Condizioni commerciali (Team, Enterprise, API), e dalla Usage Policy di Anthropic.
- L'accesso con OAuth (il login con l'account Claude) è pensato solo per chi ha comprato un piano Claude, per l'uso ordinario di Claude Code e delle altre applicazioni di Anthropic.
- I limiti di uso pubblicizzati per i piani Pro, Max e Ultra presuppongono un uso ordinario e individuale di Claude Code e dell'Agent SDK.
- Chi sviluppa prodotti o servizi che usano Claude deve usare le chiavi API. Anthropic non permette a sviluppatori terzi di offrire il login Claude.ai nelle loro applicazioni, né di far passare richieste dalle credenziali dei piani Free, Pro, Max o Ultra per conto dei loro utenti.
- Gli sviluppatori non possono raccogliere, conservare o fare da intermediari per credenziali o token di sessione di Claude.ai: il login deve passare dal flusso di Anthropic.
- Questo non impedisce a una persona di accedere con il proprio abbonamento al programma Claude Code non modificato.
- Chi preinstalla o esegue Claude Code nei propri prodotti o servizi (per esempio su infrastrutture ospitate) deve accettare le Condizioni commerciali, non modificare Claude Code, non togliere i metodi di accesso e non pagare, rivendere o intermediare l'uso per conto degli utenti.
- Si può dire che un prodotto esegue Claude Code, ma non usare i nomi o i loghi di Claude Code o di Anthropic nel nome del proprio prodotto o in modo da far pensare a un'approvazione o a una collaborazione.
- Anthropic si riserva di far rispettare queste regole, anche senza preavviso.

Altri documenti da leggere: le Condizioni per i consumatori (https://www.anthropic.com/legal/consumer-terms) e la Usage Policy (https://www.anthropic.com/legal/aup). Le Condizioni per i consumatori, tra l'altro, vietano di condividere con altri le credenziali dell'account e vietano l'accesso ai servizi con mezzi automatici, come bot o script, salvo con una chiave API o dove Anthropic lo permette in modo esplicito.

### OpenAI: autenticazione di Codex

Pagina: https://developers.openai.com/codex/auth

In sintesi:

- Codex si usa in due modi: con il login ChatGPT, che usa l'abbonamento, oppure con una chiave API, che si paga a consumo.
- `codex login` apre il browser per il login con ChatGPT.
- Con il login ChatGPT l'uso segue le impostazioni del piano e del workspace. Con la chiave API l'uso si paga sull'account della piattaforma API, alle tariffe standard, invece che con quanto incluso nel piano ChatGPT.
- Le credenziali stanno in `~/.codex/auth.json` o nel portachiavi del sistema. Il file `auth.json` va trattato come una password: non va messo in un repository, incollato in un ticket o condiviso in chat.
- Per l'automazione la pagina indica le chiavi API come scelta predefinita consigliata. I token di accesso di Codex sono pensati per script fidati, pianificatori e runner CI privati.
- L'esecuzione di Codex non va esposta in ambienti non fidati o pubblici.
- La pagina non parla in modo esplicito dell'uso delle credenziali in programmi di terzi.

Altri documenti da leggere: le condizioni d'uso di OpenAI e del tuo piano ChatGPT, e la pagina dei prezzi di Codex per sapere quali piani lo includono.

## Cosa resta responsabilità di chi usa il programma

- **Leggere e rispettare le condizioni** di Anthropic e di OpenAI per il proprio piano. Se un uso come quello di questo programma rientri nell'uso ordinario e individuale lo stabiliscono i fornitori, non questo progetto. Se hai dubbi, chiedi a loro.
- **Usare il proprio account**, senza condividerlo e senza far usare il programma ad altre persone con i propri abbonamenti.
- **Tenerlo sul proprio PC.** Non esporre il server in rete, con tunnel o proxy: chiunque lo raggiunga userebbe i tuoi abbonamenti.
- **Controllare le impostazioni dei piani**: crediti extra, limiti, eventuali addebiti a consumo. Per Codex il programma controlla il tipo di login, non i crediti aggiuntivi del piano.
- **Scegliere cosa mandare ai servizi.** Profilo, note, cartelle autorizzate e file del cantiere che gli agenti leggono finiscono nelle richieste ad Anthropic e a OpenAI. Se contengono dati di altre persone (clienti, colleghi) o dati riservati, valuta tu se puoi mandarli, secondo le leggi sulla protezione dei dati che ti riguardano e gli accordi che hai.
- **Verificare quello che producono gli agenti** prima di usarlo: risposte, documenti e file del cantiere possono contenere errori.
- **Rispettare le regole di uso** dei fornitori anche nei contenuti che chiedi.

## Avvertenza

Questo documento è un riassunto informativo scritto da chi sviluppa il programma. Non è un parere legale e non sostituisce le condizioni ufficiali. Il programma è fornito "così com'è", senza garanzie, come dice la licenza MIT.
