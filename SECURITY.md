# Sicurezza

## Come segnalare una falla

Segnala le falle di sicurezza **in privato**, dalla pagina del repository su GitHub:

1. apri la scheda **Security**;
2. scegli **Report a vulnerability**;
3. descrivi il problema.

La segnalazione resta privata finché la falla non è corretta. Non c'è un indirizzo email per le segnalazioni: usa solo questo canale.

Non aprire una issue pubblica e non pubblicare dettagli prima della correzione.

Nella segnalazione aiuta avere:

- cosa succede e cosa ti aspettavi;
- i passi per riprodurlo;
- sistema operativo, versione di Node.js, versioni di Claude Code e di Codex;
- quanto è grave secondo te e chi ne è colpito.

Non mettere nella segnalazione credenziali, token o dati personali veri. Se servono per spiegare il problema, usa valori finti.

Il progetto è mantenuto da una persona sola: la risposta arriva appena possibile. Si corregge solo l'ultima versione.

## Cosa è in perimetro

Il codice di questo repository, per esempio:

- il server locale: controllo di Host e Origin, CSRF, DNS rebinding, CSP, accesso a file fuori dalla dashboard;
- il motore: un modo per far usare agli agenti strumenti non ammessi, per far scrivere Claude fuori dal cantiere, per far partire una CLI con una chiave API senza `AMBO_CONSENTI_API=1`, o per far usare a Claude i crediti extra senza che il motore si fermi;
- il filtro dei segreti: file di credenziali o segreti che arrivano agli agenti nonostante il filtro;
- il server MCP delle note: lettura di file che non sono `.md` o che stanno fuori dalle fonti scelte;
- l'iniezione di istruzioni (prompt injection) da note, cartelle, chat o risultati della ricerca web **quando aggira un controllo del programma**, per esempio facendo scrivere file o usare strumenti che non dovrebbero esserci;
- un modo per dare agli agenti accesso alla rete oltre al loro servizio e alla ricerca web della partita, o la ricerca web attiva dove dovrebbe essere spenta;
- le dipendenze npm usate dal programma, se la falla si può sfruttare nel modo in cui le usa.

## Cosa non è in perimetro

- Falle di Claude Code o di Codex CLI. Vanno segnalate ad Anthropic e a OpenAI con i loro canali di sicurezza.
- Attacchi che richiedono un PC già compromesso o qualcuno che ha già accesso al tuo account utente.
- Il programma esposto in rete di proposito (tunnel, proxy, ascolto su indirizzi diversi da 127.0.0.1): non è un uso previsto.
- Risposte sbagliate o di cattiva qualità degli agenti, e iniezioni di istruzioni che cambiano solo il testo delle risposte senza aggirare un controllo.
- Il consumo della quota degli abbonamenti, che è normale.

## Modello di sicurezza in breve

**Solo locale.** Il server ascolta solo su 127.0.0.1. Risponde solo a richieste indirizzate a sé stesso (Host) e accetta comandi solo dalle sue pagine (Origin), contro DNS rebinding e CSRF. Niente parte online, niente account del programma, niente telemetria.

**Credenziali.** Il programma non legge i file delle credenziali delle CLI. Chiede alle CLI con che tipo di login sono collegate. Il login si fa con il flusso ufficiale di ciascuna CLI.

**Niente consumo a sorpresa.** Il motore toglie dall'ambiente delle CLI le variabili di Anthropic, Claude Code, OpenAI e Codex e tutte quelle che dal nome sembrano chiavi, token o password, anche di altri servizi (`GITHUB_TOKEN`, `AWS_*`, `HF_TOKEN` e simili). Passano solo `CLAUDE_CODE_GIT_BASH_PATH` e `CLAUDE_CONFIG_DIR`, che sono configurazione. Le chiavi passate per variabile d'ambiente si tolgono sempre, anche con `AMBO_CONSENTI_API=1`. Di serie controlla che Claude non usi una chiave API (`apiKeySource`) e che Codex sia collegato con ChatGPT: se no, si ferma. Il login con chiave API, per Claude Code e per Codex, si accetta solo con `AMBO_CONSENTI_API=1`. I crediti extra di Claude (`isUsingOverage`) il motore li ferma sempre, anche con quell'opzione.

**Agenti senza mani in chat e in partita.** Claude parte con un elenco ristretto di strumenti (`--tools`) e i permessi in modalità `dontAsk`, che nega tutto quello che non è elencato. Codex parte con la sandbox in sola lettura e gli strumenti spenti. Se una CLI usa uno strumento o un server MCP non ammesso, il motore ferma il turno.

**Niente istruzioni di progetto.** In chat, nelle partite e nel collaudo le CLI lavorano in una cartella temporanea vuota, fuori dal repository. In produzione Claude lavora nel cantiere (`dati/cantieri/<id>`), che di serie sta dentro la cartella del programma, ma parte con `--setting-sources ''`: nessuna impostazione e nessun `CLAUDE.md`, né dell'utente né di progetto, anche con l'ambiente acceso. Con l'ambiente spento (di serie) Claude parte senza le impostazioni utente di Claude Code e Codex non legge i file `AGENTS.md` di progetto (`project_doc_max_bytes=0`). Il file globale `~/.codex/AGENTS.md` dell'utente, se esiste, Codex lo legge comunque.

**Rete.** Gli agenti parlano solo con il proprio servizio. L'unica eccezione è la ricerca web, spenta di serie, che si accende per la singola partita: Claude riceve `WebSearch`, Codex la sua `web_search`, e il resto resta spento. In chat la dashboard non la accende (il motore la accetta solo se una chat si crea dall'API locale con `ricercaWeb`, e le partite nate da quella chat la ereditano). In produzione la ricerca web non c'è.

**Cantiere recintato.** In produzione Claude può leggere e scrivere file solo dentro il cantiere (`dati/cantieri/<id>`), per le regole dei permessi di Claude Code. L'eccezione sono le note: se sono attive, Claude ha anche il server delle note, in sola lettura, e con quello legge i file `.md` delle fonti scelte, che stanno fuori dal cantiere. Le cartelle delle CLI (anche se spostate con `CLAUDE_CONFIG_DIR` o `CODEX_HOME`), quella delle chiavi SSH e `AppData` sono vietate in modo esplicito. Non può eseguire comandi né usare il web. Il motore ferma il lavoro se vede una scrittura fuori dalla cartella. Codex fa il collaudo in sola lettura.

**Dati, non istruzioni.** Nelle partite la copia della cartella e le battute della chat di partenza arrivano agli agenti dentro delimitatori casuali, e le righe che imitano i messaggi del motore si neutralizzano; nel collaudo vale lo stesso per i file prodotti. In produzione Claude legge la copia della cartella direttamente dai file del cantiere: lì contano le istruzioni di sistema, che dicono di trattarla come dati. Note e profilo gli agenti li leggono con il server delle note, senza delimitatori: il server e le istruzioni di sistema dicono che sono dati, non ordini, e dal testo si tolgono le righe che sembrano segreti. Il server delle note legge solo file `.md`, non segue i collegamenti, non scrive e non usa la rete. Dalle copie delle cartelle si tolgono dipendenze, build, file di credenziali e righe che sembrano segreti.

**Dashboard.** La dashboard ha una Content Security Policy stretta: carica solo risorse del server locale.

### Limiti

- Non è una sandbox del sistema operativo. Il programma si appoggia ai sistemi di permessi delle CLI e aggiunge i suoi controlli.
- Il filtro dei segreti riconosce i formati più comuni, non tutti. Non autorizzare cartelle che contengono segreti.
- Quello che gli agenti leggono va ai servizi di Anthropic e di OpenAI tramite le CLI.
- Con la ricerca web accesa, una pagina trovata sul web può contenere istruzioni ostili. Gli strumenti restano limitati (niente scrittura, niente comandi), ma il modello può esserne influenzato nelle risposte.
- La dettatura del browser passa dai servizi online del browser (Google o Apple). La trascrizione sul PC no, e la lettura ad alta voce usa solo le voci installate sul PC.- Il consumo della quota dei tuoi abbonamenti è reale.
- Le risposte degli agenti possono essere sbagliate.
