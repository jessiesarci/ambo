# Cosa cambia

Le versioni seguono il numero in `package.json` e i tag su GitHub (`vX.Y.Z`).

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
