"use client";

import { AlertTriangle, ArrowRight, Check, Mic, MicOff, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { describeAiMeasureCommand, parseAiMeasureInput, type AiMeasureCommand, type AiMeasureTarget } from "@/lib/ai-measure-input";

type MobileAiMeasureInputProps = {
  context: AiMeasureTarget;
  onApply: (command: AiMeasureCommand) => void;
};

type SpeechResult = { 0: { transcript: string }; isFinal: boolean };
type SpeechRecognitionEventLike = Event & { results: { length: number; [index: number]: SpeechResult } };
type SpeechRecognitionErrorLike = Event & { error?: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const examples: Record<AiMeasureTarget, string[]> = {
  room: [
    "Wohnzimmer 5 mal 4 Meter, Höhe 2,60, Wände und Decke",
    "Bad Länge 3,20, Breite 2,80, Höhe 2,50, alles",
  ],
  sketch: [
    "Freihand Seite 2 ist 6 Meter, Höhe 2,50, Wand Decke und Fußleisten",
    "Skizze Kontrollmaß 4,80 Meter, Grundfläche 22 Quadratmeter",
  ],
  special: [
    "Giebel 6 Meter breit und Höhe 2 Meter",
    "Kreisfläche Radius 1,50 Meter, Anzahl 2",
  ],
  opening: [
    "Fenster 1,20 mal 1,50 Meter, Anzahl 2 im Wohnzimmer",
    "Tür 1,01 mal 2,135 Meter im Flur",
  ],
};

function contextLabel(context: AiMeasureTarget) {
  if (context === "sketch") return "Freihandskizze";
  if (context === "special") return "Sonderfläche";
  if (context === "opening") return "Tür / Fenster";
  return "Raumaufmaß";
}

function recognitionConstructor() {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function hasSpeechRecognition() {
  return typeof window !== "undefined" && Boolean(recognitionConstructor());
}

export default function MobileAiMeasureInput({ context, onApply }: MobileAiMeasureInputProps) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const speechSupported = hasSpeechRecognition();
  const parsed = useMemo(() => text.trim() ? parseAiMeasureInput(text, context) : null, [context, text]);
  const preview = useMemo(() => parsed ? describeAiMeasureCommand(parsed) : [], [parsed]);

  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  function close() {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
    setOpen(false);
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setSpeechError("Spracheingabe wird von diesem Browser nicht unterstützt. Die Maße können weiterhin geschrieben werden.");
      return;
    }
    const recognition = new Constructor();
    recognition.lang = "de-DE";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index]?.[0]?.transcript ?? "").join(" ").trim();
      if (transcript) setText(transcript);
    };
    recognition.onerror = (event) => {
      setListening(false);
      setSpeechError(event.error === "not-allowed" ? "Mikrofonzugriff wurde nicht erlaubt. Bitte die Freigabe in den Geräteeinstellungen prüfen." : "Das Diktat konnte nicht vollständig verstanden werden. Bitte erneut sprechen oder den Text ergänzen.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setSpeechError("");
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setSpeechError("Das Mikrofon konnte nicht gestartet werden.");
    }
  }

  function apply() {
    if (!parsed) return;
    onApply(parsed);
    setText("");
    close();
  }

  return <>
    <button type="button" className="mobile-ai-fab" onClick={() => { setOpen(true); setSpeechError(""); }} aria-label="KI-Maßassistent öffnen">
      <Sparkles size={20} /><span>KI Maße</span>
    </button>

    {open && <div className="mobile-ai-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="mobile-ai-sheet" role="dialog" aria-modal="true" aria-label="KI-Maßassistent">
        <header><span><i><Sparkles size={20} /></i><b>KI-Maßassistent</b><small>Sprechen oder schreiben – Werte werden passend einsortiert.</small></span><button type="button" onClick={close} aria-label="KI-Maßassistent schließen"><X size={18} /></button></header>
        <div className="mobile-ai-context"><span>AKTUELLER BEREICH</span><strong>{contextLabel(context)}</strong><em>Die KI kann bei Bedarf automatisch in einen anderen Bereich wechseln.</em></div>

        <label className="mobile-ai-input"><span>Maße natürlich eingeben</span><textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder={examples[context][0]} autoFocus /></label>
        <div className="mobile-ai-actions"><button type="button" className={`mobile-ai-mic ${listening ? "listening" : ""}`} onClick={toggleListening}>{listening ? <MicOff size={18} /> : <Mic size={18} />} {listening ? "Diktat beenden" : speechSupported ? "Maße diktieren" : "Mikrofon prüfen"}</button><span>{listening ? <><i /> Ich höre zu …</> : "Deutsch · Meter und Zentimeter als Dezimalzahl"}</span></div>
        {speechError && <div className="mobile-ai-error"><AlertTriangle size={15} /><span>{speechError}</span></div>}

        {!text.trim() && <div className="mobile-ai-examples"><strong>Beispiele antippen</strong>{examples[context].map((example) => <button type="button" key={example} onClick={() => setText(example)}><span>{example}</span><ArrowRight size={15} /></button>)}</div>}

        {parsed && <div className="mobile-ai-result">
          <div className="mobile-ai-result-head"><span><Check size={17} /><b>Erkannte Angaben</b></span><em>{Math.round(parsed.confidence * 100)} %</em></div>
          <div className="mobile-ai-result-grid">{preview.map((row) => <span key={`${row.label}-${row.value}`}><small>{row.label}</small><strong>{row.value}</strong></span>)}</div>
          {parsed.missing.length > 0 && <div className="mobile-ai-missing"><AlertTriangle size={15} /><span><b>Noch prüfen oder ergänzen:</b> {parsed.missing.join(" · ")}</span></div>}
        </div>}

        <div className="mobile-ai-footer"><small>Die KI trägt Werte ein, speichert aber erst nach deiner Kontrolle.</small><button type="button" className="mobile-primary" onClick={apply} disabled={!parsed || parsed.understood.length < 2}><Sparkles size={17} /> Werte in Aufmaß übernehmen</button></div>
      </section>
    </div>}
  </>;
}
