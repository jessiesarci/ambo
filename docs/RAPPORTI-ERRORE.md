# Rapporti d'errore

Quando in Ambo si rompe qualcosa, puoi mandare un rapporto tecnico a chi sviluppa il programma, così il difetto si può correggere. Il rapporto parte solo se dici sì. Qui c'è cosa contiene, chi lo riceve, dove sta e per quanto.

## Come funziona

- **Di serie il programma chiede.** Al primo errore compare una scheda: "Si è rotto qualcosa". Con **Cosa contiene** vedi il rapporto esattamente come partirebbe. Poi scegli **Manda**, **Manda sempre** o **Non mandare**. Con **Non chiedere più** non ti chiede più niente e non tiene i rapporti.
- **Puoi cambiare idea quando vuoi**, dal menu ⋯ della chat, alla voce **Rapporti d'errore**: chiedi ogni volta, manda sempre, non mandare mai.
- **Con "manda sempre"** i rapporti partono da soli, al massimo 20 al giorno, e lo stesso errore una volta sola all'ora. I limiti valgono anche se riavvii il programma.
- **Se l'invio non riesce** (il servizio non risponde, oppure oggi ne sono già partiti 20), con **Manda** il rapporto resta in attesa e la scheda lo dice; con "manda sempre" il programma lo scrive solo nel suo registro.
- **Per spegnere del tutto i rapporti**, metti `AMBO_RAPPORTI_URL=0` nel `.env`. Il programma allora non li prepara neanche e il pannello del menu lo dice.
- **Non tutto diventa un rapporto.** Restano fuori le condizioni normali e gli arresti di sicurezza:
  - CLI non collegata, crediti a consumo, limiti di quota dell'abbonamento, sessione scaduta;
  - uno strumento non ammesso, una scrittura fuori dal cantiere, la cartella dei dati dentro AppData;
  - uno stop chiesto da te, una richiesta rifiutata (per esempio un allegato non accettato), un problema di rete della pagina.

  Diventano rapporti gli errori che sembrano difetti del programma: per esempio una CLI che risponde in un formato che il programma non capisce più, un errore del server, un errore nel codice della pagina.

## Cosa contiene

Partono solo questi campi:

| Campo | Esempio |
|---|---|
| Versione di Ambo | `0.6.0` |
| Sistema | `win32 x64 10.0`, `darwin arm64 24.1` |
| Versione di Node.js | `24.12.0` |
| Dove | chat, riunione, produzione, server del programma, pagina del programma |
| Tipo di errore | `TypeError`, `agente:formato` |
| Messaggio | una riga, al massimo 300 caratteri, ripulita |
| Punti del codice | fino a 12 righe del tipo `Motore.rispondi motore/dibattito.ts:120:15`: solo file del programma, con il percorso relativo |
| Impronta | un codice di 12 caratteri, uguale per lo stesso difetto: serve a raggrupparli |

Sul tuo PC il rapporto ha anche un id a caso e l'ora in cui è nato, per sceglierlo nella scheda: quelli non partono.

**Come si fa il messaggio.**
- **Gli errori delle CLI** (Claude Code e Codex) hanno un messaggio fisso per tipo, per esempio "una CLI ha risposto in un formato che il programma non capisce". Il loro testo vero non parte mai, perché può contenere pezzi di risposte.
- **Degli altri errori** parte solo la prima riga, da cui il programma toglie:
  - ogni testo tra virgolette, di qualsiasi tipo e lunghezza, perché può venire dalla chat, da un file o da una risposta. Resta solo il nome della proprietà negli errori come `Cannot read properties of undefined (reading 'titolo')`;
  - tutto quello che segue l'inizio di un percorso (cartella utente, cartella dei dati, unità, cartelle di rete, percorsi relativi) e ogni parola con una barra. Dei file del programma resta il percorso relativo, per esempio `motore/server.ts`;
  - gli indirizzi email e i valori che sembrano chiavi, token o password.
- **Dei punti del codice** restano solo le righe che indicano un file del programma: niente righe del messaggio, niente file di altre cartelle o di estensioni del browser.

**Cosa non contiene mai:** chat, messaggi, prompt, risposte degli agenti, file del cantiere, allegati, note, profilo, nomi di cartelle autorizzate, il tuo nome, l'account delle CLI, il nome del PC. Non c'è nessun codice che identifica te o la tua installazione: due rapporti dello stesso PC non si possono collegare tra loro, se non perché descrivono lo stesso errore. Fa eccezione una versione che hai modificato e ricompilato da te: lì il nome del file della pagina (`assets/index-…js`) è diverso da quello delle versioni pubblicate.

La pulizia lavora su regole e può non prevedere ogni caso. Per questo di serie il programma ti mostra il rapporto prima di mandarlo.

## Chi lo riceve, dove sta, per quanto

- **Chi.** Lo riceve chi sviluppa Ambo (vedi [LICENSE](../LICENSE)) e lo usa solo per trovare e correggere i difetti. Non lo vende, non lo cede e non lo usa per pubblicità.
- **Dove.** In un database su Supabase, con il server a Zurigo, in Svizzera. Il codice del servizio che lo riceve è in [servizio/rapporti](../servizio/rapporti). Il servizio:
  - accetta solo campi della forma di quelli che il programma prepara;
  - conta gli errori uguali invece di ripeterli, e non riscrive il primo messaggio salvato;
  - non salva l'indirizzo IP né altro della richiesta.

  Il fornitore del servizio (Supabase) può vedere l'indirizzo IP nei suoi registri tecnici, come per qualsiasi collegamento a internet.
- **Avviso.** Quando arriva un errore mai visto prima, chi sviluppa Ambo può ricevere un avviso su Telegram (un servizio fuori dalla Svizzera). L'avviso contiene solo versione, dove, tipo di errore e impronta: niente messaggio e niente punti del codice.
- **Per quanto.** Ogni notte si cancellano gli errori arrivati per l'ultima volta più di 180 giorni prima.
- **Base.** Il tuo consenso, che puoi togliere quando vuoi dal menu. Togliendolo non si cancellano i rapporti già mandati. Visto che non portano niente che li colleghi a te, per farne cancellare uno serve la sua impronta, che vedi in **Cosa contiene**: aprila in una [issue su GitHub](https://github.com/jessiesarci/ambo/issues), senza scrivere altro di tuo.

## Per chi pubblica una sua versione di Ambo

I rapporti di Ambo vanno al servizio di chi lo sviluppa. Se pubblichi una versione modificata, hai due possibilità:
- con `AMBO_RAPPORTI_URL=0` li spegni;
- li mandi a un servizio tuo (`https://`, oppure un indirizzo locale per le prove):
  - crea la tabella con [servizio/rapporti/tabella.sql](../servizio/rapporti/tabella.sql);
  - pubblica la funzione [servizio/rapporti/index.ts](../servizio/rapporti/index.ts) su un tuo progetto Supabase, senza controllo del JWT (`supabase functions deploy ambo-rapporti --no-verify-jwt`);
  - aggiorna questa pagina.
