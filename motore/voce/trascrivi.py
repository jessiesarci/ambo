# Trascrizione vocale in locale con faster-whisper (CPU, int8). Nessun servizio esterno: l'audio resta sul PC.
# Protocollo: una richiesta JSON per riga su stdin {"id", "file", "lingua"?} e una risposta per riga su stdout
# {"id", "ok", "testo"?, "errore"?, "secondi"?, "audio"?}. Il modello si carica una volta e resta in memoria
# finché il motore tiene vivo il processo.
import json
import os
import re
import sys
import time

MODELLO = os.environ.get("CONTRAPPUNTO_WHISPER_MODELLO", "small")
# Parole che Whisper sbaglia facilmente: le suggeriamo come contesto iniziale. Se ne aggiungono altre
# con CONTRAPPUNTO_WHISPER_PAROLE (nomi propri, progetti, termini tecnici di chi lo usa).
VOCABOLARIO = " ".join(
    p for p in ("Claude, Codex, ChatGPT, Obsidian, prompt, deploy, dashboard, markdown.", os.environ.get("CONTRAPPUNTO_WHISPER_PAROLE", "").strip()) if p
)


# Whisper è addestrato anche su video sottotitolati: nel silenzio a fine vocale a volte "sente" le
# righe di chiusura dei sottotitoli (per esempio "Sottotitoli a cura di QTSS").
ALLUCINAZIONI = re.compile(
    r"(\bsottotitoli[^.!?]*)?\bamara\.org\b[.!?]?"
    r"|\b(sottotitoli|sottotitolato|sottotitolazione)\b[^.!?]*(a cura di|creati|della comunit|qtss)[^.!?]*[.!?]?"
    r"|\bgrazie (a tutti )?per (la visione|l'attenzione|aver guardato)[.!?]?"
    r"|\biscriviti al (mio )?canale[^.!?]*[.!?]?"
    r"|\bthanks? (you )?for watching[.!?]?"
    r"|\bsubtitles? by\b[^.!?]*[.!?]?",
    re.IGNORECASE,
)


def ripulisci(testo):
    pulito = ALLUCINAZIONI.sub("", testo)
    return re.sub(r"\s{2,}", " ", pulito).strip(" ,;")


def segmento_vero(s):
    # Un pezzo che il modello stesso dà per silenzio, e con poca fiducia, è quasi sempre inventato.
    return not (getattr(s, "no_speech_prob", 0) > 0.6 and getattr(s, "avg_logprob", 0) < -0.8)


def rispondi(dati):
    sys.stdout.write(json.dumps(dati, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    try:
        from faster_whisper import WhisperModel

        fili = max(1, min(8, (os.cpu_count() or 4) - 2))
        modello = WhisperModel(MODELLO, device="cpu", compute_type="int8", cpu_threads=fili)
    except Exception as e:  # noqa: BLE001 - il motore deve sapere perché non parte
        rispondi({"id": None, "ok": False, "errore": f"modello non disponibile: {e}"})
        return
    rispondi({"id": None, "ok": True, "pronto": MODELLO})

    for riga in sys.stdin:
        riga = riga.strip()
        if not riga:
            continue
        try:
            richiesta = json.loads(riga)
        except json.JSONDecodeError:
            continue
        rid = richiesta.get("id")
        inizio = time.time()
        try:
            segmenti, info = modello.transcribe(
                richiesta["file"],
                language=richiesta.get("lingua") or os.environ.get("CONTRAPPUNTO_LINGUA_VOCE") or "it",
                beam_size=3,
                vad_filter=True,
                initial_prompt=VOCABOLARIO,
                condition_on_previous_text=False,
            )
            testo = ripulisci(" ".join(s.text.strip() for s in segmenti if segmento_vero(s)).strip())
            rispondi({
                "id": rid,
                "ok": True,
                "testo": testo,
                "secondi": round(time.time() - inizio, 2),
                "audio": round(float(info.duration or 0), 2),
            })
        except Exception as e:  # noqa: BLE001
            rispondi({"id": rid, "ok": False, "errore": str(e)[:300]})


if __name__ == "__main__":
    main()
