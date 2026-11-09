# Cosa cambia

Le versioni seguono il numero in `package.json` e i tag su GitHub (`vX.Y.Z`).

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
