// L'ufficio resta sempre in scena; cambiano la fonte e l'interfaccia sopra.
//   #/                 la chat (l'ultima aperta, se è di oggi)
//   #/chat/<id>        una chat;  #/chat/nuova  una chat da cominciare
//   #/partite          partite e produzione: nuova partita e archivio
//   #/partita/<id>     partita dal vivo (o il suo stato finale)
//   #/replay/<id>      replay di una partita salvata
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NOME, type Agente } from '../../motore/tipi.ts';
import { api, type Accessi, type Info, type Riassunto } from './api.ts';
import { Avvisi, Cartello, Scheda, usaReazioni, type SchedaAperta } from './hud/Avvisi.tsx';
import { Barra } from './hud/Barra.tsx';
import { ComandiDalVivo, ComandiReplay } from './hud/Comandi.tsx';
import { Dialogo } from './hud/Dialogo.tsx';
import { Registro } from './hud/Registro.tsx';
import { Risultato } from './hud/Risultato.tsx';
import type { ScatolaArchivio } from './scena/Edificio.tsx';
import { Scena } from './scena/Scena.tsx';
import { INQUADRATURE, type Inquadratura } from './scena/Telecamera.tsx';
import { Cartelle } from './schermate/Cartelle.tsx';
import { Chat } from './schermate/Chat.tsx';
import { Lobby } from './schermate/Lobby.tsx';
import { ContestoSquadra } from './squadra.ts';
import { ETICHETTE_ESITO, ETICHETTE_STATO } from './stato.ts';
import { usaPartita, type Modo } from './usaPartita.ts';

type Schermo = 'chat' | 'partite' | 'partita' | 'replay';

function leggiRotta(): { schermo: Schermo; id?: string } {
  const [, schermata, id] = location.hash.replace(/^#/, '').split('/');
  if (schermata === 'partita' && id) return { schermo: 'partita', id };
  if (schermata === 'replay' && id) return { schermo: 'replay', id };
  if (schermata === 'partite') return { schermo: 'partite' };
  if (schermata === 'chat' && id && id !== 'nuova') return { schermo: 'chat', id };
  return { schermo: 'chat', ...(schermata === 'chat' ? { id: 'nuova' } : {}) };
}

const vai = (hash: string) => { location.hash = hash; };

// Telefono: sotto i 768 px (lo stesso confine di md: di Tailwind), seguito anche quando si gira.
function usaStretto(): boolean {
  const [s, setS] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 767px)');
    const f = () => setS(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return s;
}

// La parte di schermo davvero visibile: su iPhone la tastiera la riduce senza ridimensionare la pagina.
function usaVisibile(): { alto: number; altezza: number } | undefined {
  const [v, setV] = useState<{ alto: number; altezza: number }>();
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const f = () => setV({ alto: vv.offsetTop, altezza: vv.height });
    f();
    vv.addEventListener('resize', f);
    vv.addEventListener('scroll', f);
    return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f); };
  }, []);
  return v;
}

const DODICI_ORE = 12 * 3600_000;

export function App() {
  const [rotta, setRotta] = useState(leggiRotta);
  useEffect(() => {
    const f = () => setRotta(leggiRotta());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const stretto = usaStretto();
  const visibile = usaVisibile();

  // Tutto è locale: niente accesso da fare, il server è sullo stesso PC.
  const entrato = true;

  const inChat = rotta.schermo === 'chat';
  const idChat = inChat && rotta.id !== 'nuova' ? rotta.id : undefined;
  const modo: Modo = !entrato ? 'vuoto' : rotta.schermo === 'replay' ? 'replay' : rotta.schermo === 'partita' || idChat ? 'vivo' : 'vuoto';
  const { vista, invia, replay, errore: errorePartita, chiudiErrore } = usaPartita(modo, inChat ? idChat : rotta.id);
  const [info, setInfo] = useState<Info>();
  const [accessi, setAccessi] = useState<Accessi>();
  const [archivio, setArchivio] = useState<Riassunto[] | null>(null);
  const [segui, setSegui] = useState(true);
  const [registro, setRegistro] = useState(false);
  const [scelto, setScelto] = useState<number | null>(null);
  const [documento, setDocumento] = useState(false);
  // La scheda aperta: Claude o Codex (dalla scena o dalla chat) oppure un assistente della squadra.
  const [scheda, setScheda] = useState<SchedaAperta | null>(null);
  // Sul telefono scheda e registro sono fogli nello stesso posto: aprendone uno si chiude l'altro
  // (la scheda di Claude o Codex lascia scoperti i comandi, e il registro finiva sotto di lei).
  const apriAgente = useCallback((agente: Agente) => { setScheda({ tipo: 'agente', agente }); if (stretto) setRegistro(false); }, [stretto]);
  const apriAssistente = useCallback((id: string) => { setScheda({ tipo: 'assistente', id }); if (stretto) setRegistro(false); }, [stretto]);
  const cambiaRegistro = () => {
    if (stretto && !registro) setScheda(null);
    setRegistro(!registro);
  };
  const [errore, setErrore] = useState<string>();
  const [serverGiu, setServerGiu] = useState(false);
  const [pannelloCartelle, setPannelloCartelle] = useState(false);
  // Sul telefono la chat occupa tutto lo schermo; l'ufficio si guarda a richiesta.
  const [ufficio, setUfficio] = useState(false);
  // Sul telefono si parte dalla sala: tutto l'edificio in 375 px rende gli omini illeggibili.
  const [inquadratura, setInquadratura] = useState<Inquadratura>(() => (window.innerWidth < 768 ? 'sala' : 'tutto'));

  // Archivio e info: all'avvio, a ogni cambio di stato e ogni 10 secondi.
  // Se il server non risponde lo si dice, invece di mostrare un archivio vuoto.
  const aggiorna = useCallback(() => {
    if (!entrato) return;
    api.elenco().then((a) => { setArchivio(a); setServerGiu(false); }).catch(() => setServerGiu(true));
    api.info().then(setInfo).catch(() => setServerGiu(true));
  }, [entrato]);
  useEffect(() => {
    aggiorna();
    const t = setInterval(aggiorna, 10_000);
    return () => clearInterval(t);
  }, [aggiorna]);
  useEffect(aggiorna, [vista.dibattito?.stato, vista.dibattito?.chat?.length, aggiorna]);
  useEffect(() => {
    if (!entrato || serverGiu) return;
    // Subito, e poi ogni minuto: un abbonamento ricollegato deve sbloccare "Inizia la partita".
    const leggi = () => api.accessi().then(setAccessi).catch(() => undefined);
    leggi();
    const t = setInterval(leggi, 60_000);
    return () => clearInterval(t);
  }, [entrato, serverGiu]);

  const partite = useMemo(() => archivio?.filter((r) => r.tipo !== 'chat') ?? null, [archivio]);
  const chats = useMemo(() => (archivio ?? []).filter((r) => r.tipo === 'chat').sort((a, b) => b.aggiornato.localeCompare(a.aggiornato)), [archivio]);

  // Aprendo l'app si torna all'ultima chat, se è di oggi; altrimenti se ne comincia una.
  useEffect(() => {
    if (!inChat || rotta.id || !archivio) return;
    const ultima = chats[0];
    if (ultima && Date.now() - new Date(ultima.aggiornato).getTime() < DODICI_ORE) history.replaceState(null, '', `#/chat/${ultima.id}`);
    else history.replaceState(null, '', '#/chat/nuova');
    setRotta(leggiRotta());
  }, [inChat, rotta.id, archivio, chats]);

  // Cambiando schermata (o ricominciando un replay) si ripulisce l'interfaccia.
  const senzaDibattito = !vista.dibattito;
  useEffect(() => {
    setScelto(null);
    setDocumento(false);
    setScheda(null);
    setRegistro(false);
    setErrore(undefined);
  }, [rotta.schermo, rotta.id, senzaDibattito]);
  useEffect(() => { if (!inChat) setUfficio(false); }, [inChat]);

  const cartello = usaReazioni(vista, useCallback(() => setDocumento(true), []), rotta.schermo === 'partita');

  const scatole = useMemo<ScatolaArchivio[]>(
    () => (partite ?? []).filter((r) => r.stato === 'concluso').map((r) => ({ id: r.id, esito: r.esito, titolo: r.domanda })),
    [partite],
  );

  // Per chi usa uno screen reader si annunciano solo i fatti conclusi, non ogni lettera.
  const d = vista.dibattito;
  const ultimoTurno = d?.turni.at(-1);
  const ultimoMsg = d?.chat?.at(-1);
  const annuncio = inChat
    ? ultimoMsg && ultimoMsg.autore !== 'utente' && ultimoMsg.autore !== 'motore' && !ultimoMsg.passa ? `${NOME[ultimoMsg.autore]} ha risposto.` : ultimoMsg?.autore === 'motore' ? ultimoMsg.testo : ''
    : d?.esito
      ? `Partita finita: ${ETICHETTE_ESITO[d.esito]}.`
      : ultimoTurno ? `${NOME[ultimoTurno.agente]} ha chiuso l'intervento ${ultimoTurno.indice}: ${ETICHETTE_STATO[ultimoTurno.risposta.stato]}.` : '';

  const inPartita = rotta.schermo === 'partita' || rotta.schermo === 'replay';
  // Il catalogo della squadra con XP e livelli arriva da /api/info; in partita un tocco su un
  // assistente (in scena o nei pannelli) apre la sua scheda.
  const squadra = useMemo(
    () => ({ squadra: info?.squadra ?? [], procedure: info?.procedure ?? [], ...(inPartita ? { apri: apriAssistente } : {}) }),
    [info?.squadra, info?.procedure, inPartita, apriAssistente],
  );
  const avvisoServer = serverGiu ? 'Il server del motore non risponde: avvialo con npm start (o npm run server:dev in sviluppo).' : undefined;

  // Sul telefono con la chat a tutto schermo la scena non si vede: si ferma.
  const scenaCoperta = entrato && inChat && stretto && !ufficio;

  return (
    <ContestoSquadra.Provider value={squadra}>
    <div className="fixed inset-0">
      <Scena
        vista={vista}
        invia={invia}
        archivio={scatole}
        segui={segui && (inPartita || (inChat && !!idChat))}
        inquadratura={inquadratura}
        onScatola={(id) => vai(`#/partita/${id}`)}
        onStampante={() => d?.stato === 'concluso' && d.config.tipo !== 'chat' && setDocumento(true)}
        onAgente={inPartita || inChat ? apriAgente : undefined}
        pausa={scenaCoperta}
        margineSinistro={entrato && inChat && !stretto ? 452 : 0}
      />
      <div className="sr-only" aria-live="polite">{annuncio}</div>

      {entrato && inChat && (
        <div
          className={ufficio && stretto ? 'pointer-events-none fixed inset-x-0 bottom-0' : 'fixed inset-x-0 md:inset-y-3 md:left-3 md:right-auto md:w-[440px]'}
          style={stretto && visibile && !ufficio ? { top: visibile.alto, height: visibile.altezza } : stretto && !ufficio ? { top: 0, bottom: 0 } : undefined}
        >
          <Chat
            vista={vista}
            id={idChat}
            chats={chats}
            partite={partite ?? []}
            accessi={accessi}
            info={info}
            serverGiu={serverGiu}
            errore={errorePartita}
            onChiudiErrore={chiudiErrore}
            compatta={ufficio && stretto}
            onApri={(id) => vai(`#/chat/${id}`)}
            onNuova={() => vai('#/chat/nuova')}
            onPartite={() => vai('#/partite')}
            onUfficio={() => setUfficio(true)}
            onChat={() => setUfficio(false)}
            onPartita={(id) => vai(`#/partita/${id}`)}
            onScheda={apriAgente}
            onCartelle={() => setPannelloCartelle(true)}
          />
        </div>
      )}
      {entrato && inChat && ufficio && stretto && (
        <div className="pointer-events-auto fixed right-2 top-[max(0.5rem,env(safe-area-inset-top))] flex gap-1 pannello p-1" role="group" aria-label="Inquadratura">
          {(Object.keys(INQUADRATURE) as Inquadratura[]).map((k) => (
            <button key={k} className={`tasto !min-h-8 !px-2.5 text-[12px] md:!min-h-10 md:!px-3 md:text-[13px] ${inquadratura === k ? 'tasto-primario' : ''}`} aria-pressed={inquadratura === k} onClick={() => setInquadratura(k)}>
              {INQUADRATURE[k].etichetta}
            </button>
          ))}
        </div>
      )}

      {!inChat && (
        <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3">
          {!entrato ? null : !inPartita ? (
            <>
              {/* L'avviso del server sta nella colonna della lobby, sotto la testata: fisso in basso copriva
                  il modulo e la squadra. */}
              <Lobby info={info} accessi={accessi} archivio={partite} serverGiu={serverGiu} avviso={avvisoServer} onApri={(id) => vai(`#/partita/${id}`)} onRivedi={(id) => vai(`#/replay/${id}`)} onCartelle={() => setPannelloCartelle(true)} onChat={() => vai('#/')} />
            </>
          ) : (
            <>
              <Barra vista={vista} onIndietro={() => vai(d?.contestoChat ? `#/chat/${d.contestoChat.id}` : '#/partite')} segui={segui} setSegui={setSegui} etichetta={rotta.schermo === 'replay' ? 'Replay' : undefined} />
              <div className="flex min-h-0 flex-1 gap-2">
                <div className="hidden min-h-0 min-w-0 flex-1 flex-col items-start gap-2 md:flex">
                  {scheda && <Scheda scheda={scheda} vista={vista} info={info} onChiudi={() => setScheda(null)} className="max-h-full max-w-md" />}
                </div>
                <div className="ml-auto flex w-full flex-col items-end gap-2 md:max-w-sm">
                  <div className="pannello pointer-events-auto flex gap-1 p-1" role="group" aria-label="Inquadratura">
                    {(Object.keys(INQUADRATURE) as Inquadratura[]).map((k) => (
                      <button key={k} className={`tasto !min-h-8 !px-2.5 text-[12px] md:!min-h-10 md:!px-3 md:text-[13px] ${inquadratura === k ? 'tasto-primario' : ''}`} aria-pressed={inquadratura === k} onClick={() => setInquadratura(k)}>
                        {INQUADRATURE[k].etichetta}
                      </button>
                    ))}
                  </div>
                  <Avvisi
                    vista={vista}
                    invia={invia}
                    extra={[
                      ...(avvisoServer ? [{ testo: avvisoServer }] : []),
                      ...(errore ? [{ testo: errore, chiudi: () => setErrore(undefined) }] : []),
                      ...(errorePartita ? [{ testo: errorePartita, chiudi: chiudiErrore }] : []),
                    ]}
                  />
                  {d?.stato === 'errore' && d.errore && (
                    <div className="pannello pointer-events-auto w-full !border-[#141518] p-3 text-[13px]" role="alert">
                      <div className="etichetta !text-[#9b2626]">Partita ferma per un errore</div>
                      <p className="mt-1 break-words">{d.errore.messaggio}</p>
                      <p className="mt-1 text-grafite">{d.errore.recuperabile ? 'Si può riprendere dallo stesso intervento.' : 'Non si può riprendere: si può solo chiudere la partita.'}</p>
                    </div>
                  )}
                  {registro && (
                    <div className="hidden min-h-0 w-full flex-1 md:flex">
                      <Registro vista={vista} scelto={scelto} setScelto={setScelto} onAssistente={apriAssistente} onChiudi={() => setRegistro(false)} />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 md:flex-row md:items-end">
                <div className="min-w-0 md:max-w-3xl md:flex-1">
                  <Dialogo vista={vista} scelto={scelto} setScelto={setScelto} velocita={rotta.schermo === 'replay' ? replay.velocita : 1} />
                </div>
                <div className="flex md:ml-auto">
                  {rotta.schermo === 'replay' ? (
                    <ComandiReplay r={replay} onRegistro={cambiaRegistro} onDocumento={() => setDocumento(true)} concluso={d?.stato === 'concluso'} />
                  ) : (
                    <ComandiDalVivo vista={vista} onRegistro={cambiaRegistro} onDocumento={() => setDocumento(true)} onErrore={setErrore} />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Sul telefono la scheda di un assistente prende tutto lo schermo; quella di Claude o Codex e il
          registro sono fogli sopra la scena, a tutta larghezza. */}
      {scheda && inPartita && (
        <div className={`pointer-events-auto fixed z-40 md:hidden ${scheda.tipo === 'assistente' ? 'inset-0 flex' : 'inset-x-2 top-16'}`}>
          <Scheda scheda={scheda} vista={vista} info={info} onChiudi={() => setScheda(null)} className="!rounded-none !border-0 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]" />
        </div>
      )}
      {/* In chat la scheda dell'omino: sopra la scena a destra sul computer, in alto sul telefono. */}
      {scheda && inChat && entrato && (
        <div className="pointer-events-auto fixed inset-x-2 top-[max(3.5rem,env(safe-area-inset-top))] z-30 flex justify-center md:inset-x-auto md:right-3 md:top-3 md:w-96">
          <Scheda scheda={scheda} vista={vista} info={info} onChiudi={() => setScheda(null)} />
        </div>
      )}
      {/* Il registro sul telefono copre la scena: aprendo una scheda o un intervento si chiude. */}
      {registro && inPartita && (
        <div className="pointer-events-auto fixed inset-x-2 bottom-2 top-16 z-30 flex md:hidden">
          <Registro vista={vista} scelto={scelto} setScelto={(i) => { setScelto(i); setRegistro(false); }} onAssistente={(id) => { apriAssistente(id); setRegistro(false); }} onChiudi={() => setRegistro(false)} />
        </div>
      )}
      {documento && d && !inChat && <Risultato dibattito={d} onChiudi={() => setDocumento(false)} onRivedi={rotta.schermo !== 'replay' && d.stato === 'concluso' ? () => vai(`#/replay/${d.id}`) : undefined} cartelle={rotta.schermo === 'replay' ? [] : info?.cartelle ?? []} soloLettura={rotta.schermo === 'replay'} />}
      {!inChat && <Cartello esito={cartello} />}
      {pannelloCartelle && <Cartelle onChiudi={() => { setPannelloCartelle(false); aggiorna(); }} />}
    </div>
    </ContestoSquadra.Provider>
  );
}
