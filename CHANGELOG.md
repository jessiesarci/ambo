# Cosa cambia

Le versioni seguono il numero in `package.json` e i tag su GitHub (`vX.Y.Z`).

## 0.5.0 · 11 novembre 2026

Il lavoro si segue dalla chat, si vede tutto quello che produce e la produzione va più veloce.

- **Carta del lavoro.** Dopo **Avvia** la scheda compito diventa la carta del lavoro, nello stesso punto della chat: stato, tappe (riunione, sintesi, produzione, collaudo, consegna), chi lavora adesso con le ultime tre azioni, un campo per scrivere alla squadra e, alla fine, tempo, esito del collaudo, ritocchi alla sintesi, anteprima della pagina e **Cosa resta**. I messaggi del motore su quel lavoro stanno nella carta; in chat restano solo gli errori.
- **Squadra in campo.** In cima alla chat, al posto della riga "2 da decidere · 1 al lavoro", ci sono Claude, Codex e gli assistenti che lavorano adesso, con due parole su cosa fanno. Un tocco apre l'elenco dei lavori e il diario.
- **Foglio del lavoro su due colonne.** Il tasto del lavoro (**Guarda il lavoro** mentre si lavora, **Apri il lavoro** alla fine) apre tutto: sul computer a sinistra i file prodotti, uno per scheda, e a destra la conclusione, cosa resta per il collaudo, il resoconto di chi ha costruito, la squadra, la riunione in battute e gli allegati. Sul telefono una colonna sola, con i file in alto.
- **Anteprime di tutti i file.** Le pagine HTML si guardano come su un computer o come su un telefono, i documenti markdown impaginati, il resto come testo. I fogli di stile e le immagini SVG prodotti nello stesso cantiere entrano nella pagina, che resta in una cornice senza script. Non hanno anteprima i file sopra i 20 000 caratteri e quelli che vengono dopo i primi 150 000 caratteri del lavoro. La pagina ha una CSP sua: dalla cornice non esce nessuna richiesta.
- **Plancia.** Sul computer (da 1024 px) accanto alla chat una scheda per lavoro, con la copertina di quello che ha prodotto: prima i lavori della chat (anche quelli avviati con **Trasforma in compito**), poi gli ultimi altri lavori al lavoro o con una produzione. L'ufficio 3D passa in un riquadro in alto a destra e si ingrandisce con un tasto.
- **Allegati.** Immagini PNG, JPEG e WebP, PDF e file di testo dal PC, con la graffetta, trascinandoli sul campo di scrittura o incollandoli. Immagini e PDF si riconoscono dal contenuto, i testi devono essere UTF-8 con un'estensione ammessa, gli SVG si rifiutano. Le foto perdono posizione e altri metadati (anche quelli nascosti tra le scansioni di un JPEG o in blocchi privati di PNG e WebP); nei testi i valori che sembrano credenziali diventano un segnaposto. In chat e in riunione gli agenti leggono testi e descrizioni come dati; in produzione i file stanno nella cartella `allegati/` del cantiere.
- **Produzione in parallelo.** La sintesi dice da quali pacchetti dipende ognuno: quelli indipendenti si costruiscono insieme, al massimo 3 (`AMBO_INSIEME`, da 1 a 4). Se un pacchetto non riesce, la produzione si ferma con un errore: quelli che lavorano insieme a lui si interrompono (nelle statistiche della squadra non contano come falliti) e quelli in attesa non partono. Il LEGGIMI.md lo aggiorna un solo pacchetto, l'ultimo a partire. Il collaudo di Codex e le revisioni della procedura leggono i file nello stesso momento.
- **Nota durante la produzione.** Mentre la produzione lavora, una nota alla squadra arriva al prossimo pacchetto o alla prossima correzione e al collaudo di Codex, se non è già cominciato. Durante il collaudo la leggono solo le correzioni, e il programma lo dice. Durante la sintesi il campo non c'è: la nota non arriverebbe a nessuno.
- **Riepilogo di fine lavoro.** A lavoro finito chi apre la chat scrive da solo cosa è pronto, dove sono i file, cosa resta e cosa conviene fare, con i dati veri del lavoro. Ogni riepilogo è una chiamata in più: uno a fine riunione, se la produzione non parte da sola, e uno a fine produzione. **Ferma** ferma anche il riepilogo.
- **Apri la cartella.** Dalla carta o dal foglio del lavoro il programma apre la cartella del cantiere sul PC.

## 0.4.0 · 10 novembre 2026

Ambo ha un volto: Ambud.

- **Ambud.** Un personaggio bianco e tondo con in testa un germoglio di due foglie, una lime come Claude e una grigia come Codex. Il nome viene da Ambo e da *bud*, germoglio in inglese.
- **Icona nuova.** L'icona del programma è la testa di Ambud: nella scheda del browser, sul telefono e, sul computer, nella testata delle partite.
- **Nel programma.** Saluta nella chat vuota e nell'archivio delle partite ancora vuoto. Pensa nella riga "sta per rispondere". Chiede scusa, con le foglie ricadute sulla testa, quando una risposta non arriva, quando una partita si ferma per un errore e negli avvisi di errore in fondo alla chat. È contento nelle conferme in fondo alla chat, per esempio quando salvi una nota. Festeggia sopra il cartello di fine partita, se la stai guardando quando finisce con l'accordo: per un attimo le due foglie si toccano.
- **Movimento ridotto.** Se nel sistema è attivo, Ambud sta fermo e le foglie dell'accordo restano unite. Il cartello di fine partita ora resta visibile: prima, con il movimento ridotto, spariva subito.
- **Licenza.** Il codice resta MIT, tranne Ambud: il componente, le icone e l'immagine si possono ridistribuire senza modifiche dentro Ambo, anche in una versione modificata che si chiama ancora Ambo (dettagli nel README e in LICENSE).

## 0.3.0 · 10 novembre 2026

Squadra con meno testo e più gioco, ufficio diviso in reparti, catena di montaggio che segue il lavoro vero.

- **Pannello Squadra più compatto.** Carte piccole con avatar, nome, livello, barra dell'XP e gli ultimi badge presi, senza descrizioni. In cima il podio dei tre con più XP. L'ordine si sceglie: esperienza, chiamate o riuscita.
- **Avatar.** Ogni assistente ha un suo ritratto, sempre uguale, con un colore che ritrovi sul suo omino e sul cartellino nell'ufficio. Anche i tuoi agenti di Claude Code ne hanno uno.
- **Titoli e badge.** Ogni due livelli un titolo: Apprendista, Operativo, Esperto, Veterano, Leggenda. I badge sono traguardi presi dalle statistiche (prima consegna, 10 e 25 rapporti, collaudi superati, affidabile, instancabile, livello 5, il più chiamato). Quelli che mancano si vedono spenti, con la regola per prenderli.
- **Scheda completa.** Un tocco su una carta, su un cartellino o su una riga del registro apre tutta la scheda: descrizione intera, titolo, XP che mancano al livello dopo, tutti i badge, competenze, statistiche e ultimi lavori con l'esito. Sul telefono prende tutto lo schermo.
- **Ufficio a reparti.** Direzione, Ricerca e analisi, Progettazione, Contenuti, Sviluppo, Qualità e una zona per gli ospiti, ognuno con il suo cartello a terra. Ogni assistente siede nel reparto del suo ruolo; i tuoi agenti in quello più vicino, oppure tra gli ospiti. Claude e Codex vanno in sala riunioni solo durante la riunione, poi tornano alle loro scrivanie in Direzione, dove una lavagna mostra il piano della partita aperta.
- **Arredo al suo posto.** Sedie, monitor, divani e poltrone sono girati dalla parte giusta. Ci sono piante, gli schermi di chi lavora sono accesi e il reparto attivo è segnato a terra.
- **Catena di montaggio fedele.** Cinque stazioni: Piano, Costruzione (una postazione per pacchetto, con chi lo costruisce), Collaudo, Correzioni (solo se servono) e Consegna. La scatola del lavoro sta alla stazione dove la produzione è davvero.
- **Chat più pulita.** I lavori stanno in una riga sola ("2 da decidere · 1 al lavoro") che si apre con un tocco. Tempi e token sotto le risposte si vedono toccando la risposta, oppure sempre, dal menu. Dei messaggi del motore si vede la prima frase; il resto con un tocco.
- **Niente sovrapposizioni.** Sul computer e sul telefono pannelli, schede e registro non si coprono più. L'avviso del server sta sotto la testata, non sopra il modulo.
- **Grafica ridotta più leggera.** Sul telefono, o quando il PC rallenta, si animano al massimo 4 assistenti e la scheda video lavora meno. Se il browser perde la grafica 3D, la scena riparte da sola in modalità ridotta.

## 0.2.0 · 9 novembre 2026

La partita diventa una riunione, con una squadra di assistenti.

- **Riunione al posto dei round.** Claude e Codex sono i due capi reparto: parlano a turno e preparano insieme il piano. Non si sceglie più un numero di round: la riunione finisce con l'accordo pieno, con lo stallo (solo nel modo confronto) o al limite di sicurezza di 16 interventi. Il selettore "Round massimi" e l'opzione `--round` della CLI non ci sono più. Le partite salvate con la 0.1.0 si aprono ancora.
- **Squadra.** I capi reparto possono affidare incarichi a 7 assistenti di serie (Rita ricerca, Marco analisi, Elena architettura, Luca testi, Sara design, Paolo sviluppo, Nadia controllo qualità), al massimo 2 per intervento e 8 per riunione. Il motore li esegue uno alla volta, in sola lettura, con gli stessi controlli dei capi; i rapporti arrivano a chi parla dopo, come dati tra delimitatori.
- **Agenti tuoi.** Con `AMBO_AMBIENTE=1` entrano nella squadra anche i tuoi agenti di Claude Code (`~/.claude/agents`, o la cartella in `AMBO_AGENTI`). Danno solo istruzioni: gli strumenti restano quelli del motore.
- **Procedure.** Modi di lavorare già pronti (sito web, documento, analisi, codice, su misura) che dicono chi fa cosa nel piano, nella produzione e nel collaudo. Le tue vanno in `dati/procedure/`.
- **Produzione a catena.** La sintesi divide il lavoro in pacchetti (al massimo 5), costruiti uno dopo l'altro nello stesso cantiere dagli assistenti di produzione. Dopo il collaudo di Codex, i passi di collaudo della procedura rivedono i file in sola lettura; i loro problemi entrano nelle correzioni.
- **Esperienza e livelli.** Ogni assistente guadagna XP (rapporti, pacchetti, collaudi superati) e sale da livello 1 a 10. Le statistiche stanno in `dati/squadra.json`.
- **Ufficio 3D.** Gli assistenti chiamati siedono alle scrivanie della parete nord, con cartellino, livello, barra dell'XP e scheda. Pannello "Squadra" nella pagina delle partite. Resa grafica nuova: luce, ombre e materiali del plastico e, sul computer, occlusione ambientale.
- Documento finale e note delle decisioni con il lavoro della squadra (incarichi, pacchetti, revisioni).

## 0.1.0 · 9 novembre 2026

Prima versione pubblica.

- Chat con Claude Code e Codex insieme, con schede compito da avviare.
- Partite su un obiettivo: piano preparato dai due agenti, sintesi e verifica.
- Produzione in una cartella recintata, con collaudo e correzioni.
- Note in sola lettura dal profilo e da una cartella di file markdown.
- Voce con trascrizione sul PC (facoltativa) e ufficio 3D.
- Solo locale: niente account, niente parte online, niente chiavi API di serie.
