"use client";

import { Mic, MicOff } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { normalizeVoiceFieldValue, type VoiceFieldKind } from "@/lib/voice-field";

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

type MobileVoiceInputProps = {
  label: string;
  kind?: VoiceFieldKind;
  onValue: (value: string) => void;
};

type MobileVoiceLabelProps = MobileVoiceInputProps & { children: ReactNode };

function recognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export default function MobileVoiceInput({ label, kind = "text", onValue }: MobileVoiceInputProps) {
  const id = useId();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState("");

  function stop() {
    recognitionRef.current?.stop();
  }

  function scheduleHintClear() {
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => setHint(""), 2600);
  }

  function start() {
    if (listening) {
      stop();
      return;
    }
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setHint("Spracheingabe wird von diesem Browser nicht unterstützt.");
      scheduleHintClear();
      return;
    }
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    window.dispatchEvent(new CustomEvent("maleraufmass:voice-input-started", { detail: { id } }));
    const recognition = new Constructor();
    recognition.lang = "de-DE";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index]?.[0]?.transcript ?? "").join(" ").trim();
      if (!transcript) return;
      setHint(`Erkannt: ${transcript}`);
      const lastResult = event.results[event.results.length - 1];
      if (!lastResult?.isFinal) return;
      const normalized = normalizeVoiceFieldValue(transcript, kind);
      if (normalized === null) {
        setHint(kind === "text" ? "Die Eingabe wurde nicht verstanden." : "Keine eindeutige Zahl erkannt. Bitte zum Beispiel „zwei Komma fünf Meter“ sprechen.");
        return;
      }
      onValue(normalized);
      setHint(`Übernommen: ${normalized}${kind === "measurement" ? " m" : ""}`);
    };
    recognition.onerror = (event) => {
      setListening(false);
      setHint(event.error === "not-allowed" ? "Mikrofonzugriff wurde nicht erlaubt." : "Spracheingabe nicht verstanden. Bitte erneut versuchen.");
      scheduleHintClear();
    };
    recognition.onend = () => {
      setListening(false);
      scheduleHintClear();
    };
    recognitionRef.current = recognition;
    setHint(`Jetzt ${label} sprechen …`);
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setHint("Das Mikrofon konnte nicht gestartet werden.");
      scheduleHintClear();
    }
  }

  useEffect(() => {
    const stopOtherInput = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id !== id) recognitionRef.current?.abort();
    };
    window.addEventListener("maleraufmass:voice-input-started", stopOtherInput);
    return () => {
      window.removeEventListener("maleraufmass:voice-input-started", stopOtherInput);
      recognitionRef.current?.abort();
      if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    };
  }, [id]);

  return <span className={`mobile-voice-input ${listening ? "listening" : ""}`}>
    <button type="button" onClick={start} aria-label={`${label} per Sprache eingeben`} title={`${label} sprechen`}>{listening ? <MicOff size={14} /> : <Mic size={14} />}</button>
    {(listening || hint) && <em role="status" aria-live="polite">{hint}</em>}
  </span>;
}

export function MobileVoiceLabel({ children, label, kind = "text", onValue }: MobileVoiceLabelProps) {
  return <span className="mobile-label-with-voice"><b>{children}</b><MobileVoiceInput label={label} kind={kind} onValue={onValue} /></span>;
}
