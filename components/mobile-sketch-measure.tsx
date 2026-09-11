"use client";

import { AlertTriangle, Check, CirclePlus, Eraser, Pencil, PenLine, Plus, RotateCcw, ScanLine, Sparkles, Trash2 } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { AiMeasureCommand } from "@/lib/ai-measure-input";
import { MobileVoiceLabel } from "@/components/mobile-voice-input";
import {
  buildSketchRoomMeasurement,
  calculateSketchRoom,
  recognizeFreehandSketch,
  updateRecognizedSketchPoints,
  type RecognizedSketch,
  type SketchInputMethod,
} from "@/lib/freehand-sketch";
import { formatNumber, type Measurement, type Point } from "@/lib/measurements";

type MobileSketchMeasureProps = {
  color: string;
  onAdd: (measurement: Measurement) => void;
};

export type MobileSketchMeasureHandle = {
  applyAiCommand: (command: AiMeasureCommand) => void;
  reset: () => void;
};

function numberValue(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function inputValue(value: number) {
  return String(value).replace(".", ",");
}

function path(points: Point[]) {
  if (!points.length) return "";
  return `M ${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" L ")}`;
}

function preventSketchViewportMove(event: TouchEvent) {
  if (event.cancelable) event.preventDefault();
}

function lockSketchViewport() {
  document.documentElement.classList.add("mobile-sketch-input-lock");
  document.addEventListener("touchmove", preventSketchViewportMove, { passive: false });
}

function unlockSketchViewport() {
  document.documentElement.classList.remove("mobile-sketch-input-lock");
  document.removeEventListener("touchmove", preventSketchViewportMove);
}

function inputMethod(pointerType: string): SketchInputMethod {
  if (pointerType === "pen") return "apple-pencil";
  if (pointerType === "mouse") return "mouse";
  return "touch";
}

function inputMethodLabel(method: SketchInputMethod | null) {
  if (method === "apple-pencil") return "Apple Pencil";
  if (method === "mouse") return "Maus";
  return "Finger";
}

const MobileSketchMeasure = forwardRef<MobileSketchMeasureHandle, MobileSketchMeasureProps>(function MobileSketchMeasure({ color, onAdd }, ref) {
  const canvasRef = useRef<SVGSVGElement>(null);
  const activePoints = useRef<Point[]>([]);
  const activePointerId = useRef<number | null>(null);
  const activeInputMethod = useRef<SketchInputMethod | null>(null);
  const drawingRef = useRef(false);
  const correctionPointerId = useRef<number | null>(null);
  const correctionCornerIndex = useRef<number | null>(null);
  const requestedAiSide = useRef<number | null>(null);
  const [rawPoints, setRawPoints] = useState<Point[]>([]);
  const [recognition, setRecognition] = useState<RecognizedSketch | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawingInput, setDrawingInput] = useState<SketchInputMethod | null>(null);
  const [editingShape, setEditingShape] = useState(false);
  const [selectedCorner, setSelectedCorner] = useState<number | null>(null);
  const [correctionOriginal, setCorrectionOriginal] = useState<RecognizedSketch | null>(null);
  const [selectedSide, setSelectedSide] = useState(0);
  const [name, setName] = useState("");
  const [referenceMeters, setReferenceMeters] = useState("");
  const [height, setHeight] = useState("");
  const [quantity, setQuantity] = useState("");
  const [exactArea, setExactArea] = useState("");
  const [exactPerimeter, setExactPerimeter] = useState("");
  const [includeWalls, setIncludeWalls] = useState(false);
  const [includeCeiling, setIncludeCeiling] = useState(false);
  const [includeFloor, setIncludeFloor] = useState(false);
  const [includeSkirting, setIncludeSkirting] = useState(false);
  const [error, setError] = useState("");

  const result = useMemo(() => recognition ? calculateSketchRoom({
    recognition,
    referenceSide: selectedSide,
    referenceMeters: numberValue(referenceMeters),
    exactArea: numberValue(exactArea),
    exactPerimeter: numberValue(exactPerimeter),
  }) : { area: 0, perimeter: 0, metersPerPixel: 0 }, [exactArea, exactPerimeter, recognition, referenceMeters, selectedSide]);

  useEffect(() => () => {
    drawingRef.current = false;
    activePointerId.current = null;
    correctionPointerId.current = null;
    correctionCornerIndex.current = null;
    unlockSketchViewport();
  }, []);

  useImperativeHandle(ref, () => ({
    applyAiCommand(command) {
      if (command.target !== "sketch") return;
      if (command.name) setName(command.name);
      if (command.referenceMeters !== undefined) setReferenceMeters(inputValue(command.referenceMeters));
      if (command.referenceSide !== undefined) {
        requestedAiSide.current = command.referenceSide;
        setSelectedSide(command.referenceSide);
      }
      if (command.height !== undefined) setHeight(inputValue(command.height));
      if (command.quantity !== undefined) setQuantity(inputValue(command.quantity));
      if (command.exactArea !== undefined) setExactArea(inputValue(command.exactArea));
      if (command.exactPerimeter !== undefined) setExactPerimeter(inputValue(command.exactPerimeter));
      if (command.includeWalls !== undefined) setIncludeWalls(command.includeWalls);
      if (command.includeCeiling !== undefined) setIncludeCeiling(command.includeCeiling);
      if (command.includeFloor !== undefined) setIncludeFloor(command.includeFloor);
      if (command.includeSkirting !== undefined) setIncludeSkirting(command.includeSkirting);
      setError("");
    },
    reset() {
      drawingRef.current = false;
      activePointerId.current = null;
      activeInputMethod.current = null;
      correctionPointerId.current = null;
      correctionCornerIndex.current = null;
      requestedAiSide.current = null;
      unlockSketchViewport();
      activePoints.current = [];
      setRawPoints([]);
      setRecognition(null);
      setDrawing(false);
      setDrawingInput(null);
      setEditingShape(false);
      setSelectedCorner(null);
      setCorrectionOriginal(null);
      setSelectedSide(0);
      setName("");
      setReferenceMeters("");
      setHeight("");
      setQuantity("");
      setExactArea("");
      setExactPerimeter("");
      setIncludeWalls(false);
      setIncludeCeiling(false);
      setIncludeFloor(false);
      setIncludeSkirting(false);
      setError("");
    },
  }), []);

  function pointFromClient(clientX: number, clientY: number) {
    const rectangle = canvasRef.current?.getBoundingClientRect();
    if (!rectangle) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(360, (clientX - rectangle.left) / rectangle.width * 360)),
      y: Math.max(0, Math.min(270, (clientY - rectangle.top) / rectangle.height * 270)),
    };
  }

  function appendPointerSamples(event: ReactPointerEvent<SVGSVGElement>) {
    const nativeEvent = event.nativeEvent;
    const coalesced = typeof nativeEvent.getCoalescedEvents === "function" ? nativeEvent.getCoalescedEvents() : [];
    const samples = coalesced.length ? coalesced : [nativeEvent];
    const minimumDistance = activeInputMethod.current === "apple-pencil" ? 0.8 : 1.5;
    const next = [...activePoints.current];
    samples.forEach((sample) => {
      const point = pointFromClient(sample.clientX, sample.clientY);
      const previous = next.at(-1);
      if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) >= minimumDistance) next.push(point);
    });
    activePoints.current = next;
    setRawPoints(next);
  }

  function startDrawing(event: ReactPointerEvent<SVGSVGElement>) {
    if (editingShape) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (event.pointerType === "touch" && !event.isPrimary) return;
    if (activePointerId.current !== null && event.pointerType !== "pen") return;
    if (activePointerId.current !== null && event.pointerType === "pen" && event.currentTarget.hasPointerCapture(activePointerId.current)) {
      event.currentTarget.releasePointerCapture(activePointerId.current);
    }
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Safari may already own the Pencil pointer. */ }
    const method = inputMethod(event.pointerType);
    const point = pointFromClient(event.clientX, event.clientY);
    activePointerId.current = event.pointerId;
    activeInputMethod.current = method;
    drawingRef.current = true;
    lockSketchViewport();
    activePoints.current = [point];
    setRawPoints([point]);
    setRecognition(null);
    setReferenceMeters("");
    setDrawing(true);
    setDrawingInput(method);
    setError("");
  }

  function continueDrawing(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drawingRef.current || event.pointerId !== activePointerId.current) return;
    event.preventDefault();
    event.stopPropagation();
    appendPointerSamples(event);
  }

  function finishDrawing(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drawingRef.current || event.pointerId !== activePointerId.current) return;
    event.preventDefault();
    event.stopPropagation();
    appendPointerSamples(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drawingRef.current = false;
    activePointerId.current = null;
    activeInputMethod.current = null;
    unlockSketchViewport();
    setDrawing(false);
    try {
      const recognized = recognizeFreehandSketch(activePoints.current);
      setRecognition(recognized);
      const longest = [...recognized.sides].sort((left, right) => right.pixels - left.pixels)[0];
      const requestedSide = requestedAiSide.current;
      setSelectedSide(requestedSide !== null && requestedSide < recognized.sides.length ? requestedSide : longest?.index ?? 0);
      requestedAiSide.current = null;
      setError("");
    } catch (cause) {
      setRecognition(null);
      setError(cause instanceof Error ? cause.message : "Die Raumform konnte nicht erkannt werden.");
    }
  }

  function startCornerCorrection(index: number, event: ReactPointerEvent<SVGCircleElement>) {
    if (!editingShape || !recognition) return;
    if (event.pointerType === "touch" && !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    correctionPointerId.current = event.pointerId;
    correctionCornerIndex.current = index;
    setSelectedCorner(index);
    setSelectedSide(Math.min(index, recognition.sides.length - 1));
    lockSketchViewport();
    try { canvasRef.current?.setPointerCapture(event.pointerId); } catch { /* Pointer remains usable without capture. */ }
  }

  function continueCornerCorrection(event: ReactPointerEvent<SVGSVGElement>) {
    const cornerIndex = correctionCornerIndex.current;
    if (!recognition || cornerIndex === null || event.pointerId !== correctionPointerId.current) return;
    event.preventDefault();
    event.stopPropagation();
    const correctedPoints = recognition.points.map((point, index) => index === cornerIndex ? pointFromClient(event.clientX, event.clientY) : point);
    try {
      setRecognition(updateRecognizedSketchPoints(recognition, correctedPoints));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Der Eckpunkt konnte an dieser Stelle nicht übernommen werden.");
    }
  }

  function finishCornerCorrection(event: ReactPointerEvent<SVGSVGElement>) {
    if (correctionPointerId.current === null || event.pointerId !== correctionPointerId.current) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    correctionPointerId.current = null;
    correctionCornerIndex.current = null;
    unlockSketchViewport();
    return true;
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (correctionPointerId.current !== null) continueCornerCorrection(event);
    else continueDrawing(event);
  }

  function handleCanvasPointerFinish(event: ReactPointerEvent<SVGSVGElement>) {
    if (!finishCornerCorrection(event)) finishDrawing(event);
  }

  function toggleShapeCorrection() {
    if (!recognition) return;
    if (editingShape) {
      correctionPointerId.current = null;
      correctionCornerIndex.current = null;
      unlockSketchViewport();
      setEditingShape(false);
      setSelectedCorner(null);
      setError("");
      return;
    }
    setCorrectionOriginal(recognition);
    setEditingShape(true);
    setSelectedCorner(0);
    setError("");
  }

  function addCorrectionCorner() {
    if (!recognition) return;
    const side = recognition.sides[Math.min(selectedSide, recognition.sides.length - 1)];
    if (!side || recognition.points.length >= 14) {
      setError("Maximal 14 Eckpunkte sind möglich.");
      return;
    }
    const insertionIndex = side.index + 1;
    const next = [...recognition.points.slice(0, insertionIndex), { ...side.center }, ...recognition.points.slice(insertionIndex)];
    try {
      setRecognition(updateRecognizedSketchPoints(recognition, next));
      setSelectedCorner(insertionIndex);
      setSelectedSide(Math.min(insertionIndex, next.length - 1));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die zusätzliche Ecke konnte nicht eingefügt werden.");
    }
  }

  function removeCorrectionCorner() {
    if (!recognition || recognition.points.length <= 3) {
      setError("Eine Raumkontur benötigt mindestens drei Eckpunkte.");
      return;
    }
    const removalIndex = selectedCorner ?? Math.min(selectedSide, recognition.points.length - 1);
    const next = recognition.points.filter((_, index) => index !== removalIndex);
    try {
      setRecognition(updateRecognizedSketchPoints(recognition, next));
      setSelectedCorner(Math.min(removalIndex, next.length - 1));
      setSelectedSide(Math.min(selectedSide, next.length - 1));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die Ecke konnte nicht entfernt werden.");
    }
  }

  function resetShapeCorrection() {
    if (!correctionOriginal) return;
    setRecognition(correctionOriginal);
    setSelectedSide(Math.min(selectedSide, correctionOriginal.sides.length - 1));
    setSelectedCorner(0);
    setError("");
  }

  function clearSketch(resetMeasures = true) {
    drawingRef.current = false;
    activePointerId.current = null;
    activeInputMethod.current = null;
    correctionPointerId.current = null;
    correctionCornerIndex.current = null;
    unlockSketchViewport();
    activePoints.current = [];
    setRawPoints([]);
    setRecognition(null);
    setDrawing(false);
    setDrawingInput(null);
    setEditingShape(false);
    setSelectedCorner(null);
    setCorrectionOriginal(null);
    if (resetMeasures) {
      setReferenceMeters("");
      setExactArea("");
      setExactPerimeter("");
    }
    setError("");
  }

  function resetSketchForm() {
    clearSketch();
    requestedAiSide.current = null;
    setSelectedSide(0);
    setName("");
    setHeight("");
    setQuantity("");
    setIncludeWalls(false);
    setIncludeCeiling(false);
    setIncludeFloor(false);
    setIncludeSkirting(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!recognition) {
      setError("Bitte zuerst eine geschlossene Raumkontur zeichnen.");
      return;
    }
    if (!name.trim() || numberValue(referenceMeters) <= 0 || numberValue(height) <= 0 || numberValue(quantity) <= 0) {
      setError("Bitte Raumname, Kontrollmaß, Raumhöhe und Anzahl vollständig eingeben.");
      return;
    }
    if (!includeWalls && !includeCeiling && !includeFloor && !includeSkirting) {
      setError("Bitte mindestens Wand, Decke, Boden oder Fußleisten auswählen.");
      return;
    }
    if (result.area <= 0 || result.perimeter <= 0) {
      setError("Aus Skizze und Kontrollmaß konnten keine plausiblen Mengen berechnet werden.");
      return;
    }
    const measurement = buildSketchRoomMeasurement({
      name,
      recognition,
      referenceSide: selectedSide,
      referenceMeters: numberValue(referenceMeters),
      height: numberValue(height),
      quantity: numberValue(quantity),
      includeWalls,
      includeCeiling,
      includeFloor,
      includeSkirting,
      exactArea: numberValue(exactArea),
      exactPerimeter: numberValue(exactPerimeter),
      inputMethod: drawingInput ?? undefined,
    }, 1, color);
    onAdd(measurement);
    resetSketchForm();
  }

  return (
    <section className="mobile-section">
      <div className="mobile-section-head"><span><PenLine size={20} /></span><div><h1>Freihandskizze</h1><p>Mit Finger oder Apple Pencil zeichnen – die App erkennt Ecken, Kreuzungen und Raumform automatisch.</p></div></div>
      <form className="mobile-card mobile-form-card mobile-sketch-card" onSubmit={submit}>
        <div className="mobile-sketch-toolbar">
          <span><ScanLine size={17} /><b>{recognition ? recognition.label : drawing ? "Kontur wird aufgenommen …" : "Zeichenfläche"}</b></span>
          <div className="mobile-sketch-toolbar-actions">{recognition && <button type="button" className={editingShape ? "active" : ""} onClick={toggleShapeCorrection}><Pencil size={15} /> {editingShape ? "Fertig" : "Berichtigen"}</button>}<button type="button" onClick={() => clearSketch(false)}>{rawPoints.length ? <RotateCcw size={16} /> : <Eraser size={16} />} Neu</button></div>
        </div>

        <div className={`mobile-sketch-canvas ${drawing ? "drawing" : ""} ${recognition ? "recognized" : ""} ${editingShape ? "editing" : ""}`}>
          <svg
            ref={canvasRef}
            viewBox="0 0 360 270"
            role="img"
            aria-label="Zeichenfläche für die Raumskizze"
            onPointerDown={startDrawing}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerFinish}
            onPointerCancel={handleCanvasPointerFinish}
            onContextMenu={(event) => event.preventDefault()}
          >
            <defs><pattern id="mobile-sketch-grid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M 18 0 L 0 0 0 18" fill="none" stroke="#eadfe6" strokeWidth="1" /></pattern></defs>
            <rect width="360" height="270" fill="url(#mobile-sketch-grid)" />
            {!rawPoints.length && <g className="mobile-sketch-placeholder"><PenLine x="165" y="96" width="30" height="30" /><text x="180" y="145" textAnchor="middle">Raumkontur in einem Zug zeichnen</text><text x="180" y="164" textAnchor="middle">am Ende zum Startpunkt zurückkehren</text></g>}
            {rawPoints.length > 0 && !recognition?.manuallyCorrected && !editingShape && <path d={path(rawPoints)} className="mobile-sketch-raw" />}
            {recognition && <>
              <polygon points={recognition.points.map((point) => `${point.x},${point.y}`).join(" ")} className="mobile-sketch-fill" />
              {recognition.sides.map((side) => <g key={side.index} onPointerDown={(event) => { event.stopPropagation(); setSelectedSide(side.index); if (editingShape) setSelectedCorner(null); }}>
                <line x1={side.start.x} y1={side.start.y} x2={side.end.x} y2={side.end.y} className={`mobile-sketch-side ${selectedSide === side.index ? "selected" : ""}`} />
                <circle cx={side.start.x} cy={side.start.y} r="4" className="mobile-sketch-corner" />
                <g className={`mobile-sketch-side-label ${selectedSide === side.index ? "selected" : ""}`}><circle cx={side.center.x} cy={side.center.y} r="11" /><text x={side.center.x} y={side.center.y + 3.2} textAnchor="middle">S{side.index + 1}</text></g>
              </g>)}
              {editingShape && recognition.points.map((point, index) => <g key={`edit-${index}`} className={`mobile-sketch-edit-corner ${selectedCorner === index ? "selected" : ""}`}>
                <circle cx={point.x} cy={point.y} r="15" className="mobile-sketch-edit-hit" onPointerDown={(event) => startCornerCorrection(index, event)} />
                <circle cx={point.x} cy={point.y} r="8" className="mobile-sketch-edit-handle" />
                <text x={point.x} y={point.y + 3.2} textAnchor="middle">{index + 1}</text>
              </g>)}
            </>}
          </svg>
        </div>

        {editingShape && <div className="mobile-sketch-correction-panel"><span><Pencil size={17} /><strong>Kontur berichtigen</strong><small>Eckpunkte mit Finger oder Apple Pencil verschieben. Eine Seite antippen, um dort eine neue Ecke einzufügen.</small></span><div><button type="button" onClick={addCorrectionCorner}><Plus size={15} /> Ecke</button><button type="button" onClick={removeCorrectionCorner}><Trash2 size={15} /> Ecke</button><button type="button" onClick={resetShapeCorrection} disabled={!correctionOriginal}><RotateCcw size={15} /> Zurück</button></div></div>}

        <div className={`mobile-sketch-input-status ${drawing || editingShape ? "active" : ""} ${drawingInput === "apple-pencil" ? "pencil" : ""}`}>
          <PenLine size={17} />
          <span><strong>{editingShape ? "Kontur-Korrektur aktiv" : drawing ? `${inputMethodLabel(drawingInput)} zeichnet` : "Finger & Apple Pencil bereit"}</strong><small>{editingShape ? "Violette Eckpunkte verschieben; Ansicht bleibt beim Ziehen gesperrt." : drawing ? "Ansicht und Scrollen sind bis zum Absetzen gesperrt." : "Während des Zeichnens bleibt die App fest stehen."}</small></span>
          <em>{editingShape ? "KORREKTUR" : drawing ? "GESPERRT" : "BEREIT"}</em>
        </div>

        {error && <div className="mobile-sketch-error"><AlertTriangle size={16} /><span>{error}</span></div>}

        {recognition && <>
          <div className="mobile-sketch-recognition"><Sparkles size={18} /><span><strong>{recognition.label} erkannt</strong><small>{recognition.points.length} Ecken · {inputMethodLabel(drawingInput)} · Erkennung {Math.round(recognition.confidence * 100)} %{recognition.automaticallyClosed ? " · Kontur automatisch geschlossen" : ""}{recognition.automaticallyStraightened ? " · Kontur automatisch begradigt" : ""}{recognition.crossingsRepaired > 0 ? ` · ${recognition.crossingsRepaired} Kreuzung${recognition.crossingsRepaired === 1 ? "" : "en"} bereinigt` : ""}{recognition.manuallyCorrected ? " · Kontur berichtigt" : ""}</small></span><em>{Math.round(recognition.confidence * 100)}%</em></div>
          {recognition.automaticallyStraightened && <div className="mobile-sketch-straightened"><Check size={16} /><span><strong>Gerade Raumskizze erstellt</strong><small>Die erkannte Form wurde auf ihre Hauptachsen ausgerichtet. Alle Wände verlaufen gerade und rechtwinklige Ecken wurden sauber rekonstruiert.</small></span></div>}
          {recognition.crossingsRepaired > 0 && <div className="mobile-sketch-repair"><Check size={16} /><span><strong>Gekreuzte Linie erkannt</strong><small>Die Linienfolge wurde automatisch entwirrt. Bitte die violette Ergebnisform und das Kontrollmaß prüfen.</small></span></div>}
          <div className="mobile-side-selector"><span>Bekannte Seite auswählen</span><div>{recognition.sides.map((side) => <button type="button" key={side.index} className={selectedSide === side.index ? "active" : ""} onClick={() => setSelectedSide(side.index)}>S{side.index + 1}<small>{Math.round(side.pixels)} px</small></button>)}</div></div>
          <div className="mobile-field-row"><label><MobileVoiceLabel label="Raumbezeichnung der Skizze" onValue={setName}>Raumbezeichnung *</MobileVoiceLabel><input value={name} onChange={(event) => setName(event.target.value)} /></label><label><MobileVoiceLabel label={`Kontrollmaß Seite S${selectedSide + 1}`} kind="measurement" onValue={setReferenceMeters}>Kontrollmaß Seite S{selectedSide + 1} *</MobileVoiceLabel><div className="mobile-input-unit"><input inputMode="decimal" value={referenceMeters} onChange={(event) => setReferenceMeters(event.target.value)} placeholder="0,00" /><i>m</i></div></label></div>
          <div className="mobile-dimension-grid">
            <label><MobileVoiceLabel label="Raumhöhe" kind="measurement" onValue={setHeight}>Raumhöhe</MobileVoiceLabel><div><input inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} /><i>m</i></div></label>
            <label><MobileVoiceLabel label="Anzahl" kind="quantity" onValue={setQuantity}>Anzahl</MobileVoiceLabel><div><input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /><i>×</i></div></label>
            <label><MobileVoiceLabel label="Exakte Fläche" kind="measurement" onValue={setExactArea}>Exakte Fläche optional</MobileVoiceLabel><div><input inputMode="decimal" value={exactArea} onChange={(event) => setExactArea(event.target.value)} placeholder="automatisch" /><i>m²</i></div></label>
            <label><MobileVoiceLabel label="Exakter Umfang" kind="measurement" onValue={setExactPerimeter}>Exakter Umfang optional</MobileVoiceLabel><div><input inputMode="decimal" value={exactPerimeter} onChange={(event) => setExactPerimeter(event.target.value)} placeholder="automatisch" /><i>m</i></div></label>
          </div>
          <div className="mobile-quantity-picks">
            <button type="button" className={includeWalls ? "active" : ""} onClick={() => setIncludeWalls(!includeWalls)}><span>{includeWalls && <Check size={14} />}</span>Wände</button>
            <button type="button" className={includeCeiling ? "active" : ""} onClick={() => setIncludeCeiling(!includeCeiling)}><span>{includeCeiling && <Check size={14} />}</span>Decke</button>
            <button type="button" className={includeFloor ? "active" : ""} onClick={() => setIncludeFloor(!includeFloor)}><span>{includeFloor && <Check size={14} />}</span>Boden</button>
            <button type="button" className={includeSkirting ? "active" : ""} onClick={() => setIncludeSkirting(!includeSkirting)}><span>{includeSkirting && <Check size={14} />}</span>Fußleisten</button>
          </div>
          <div className="mobile-sketch-result"><span><small>Erkannte Fläche</small><strong>{formatNumber(result.area * Math.max(1, numberValue(quantity)))} m²</strong></span><span><small>Erkannter Umfang</small><strong>{formatNumber(result.perimeter * Math.max(1, numberValue(quantity)))} m</strong></span><span><small>Wände brutto</small><strong>{formatNumber(result.perimeter * numberValue(height) * Math.max(1, numberValue(quantity)))} m²</strong></span></div>
          <div className="mobile-sketch-notice"><AlertTriangle size={16} /><span><strong>Kontrollmaß erforderlich</strong><small>Die App erkennt die Raumform automatisch. Für ein prüfbares Aufmaß wird mindestens eine tatsächliche Seitenlänge benötigt. Bei unmaßstäblichen Skizzen können Fläche und Umfang zusätzlich exakt eingetragen werden.</small></span></div>
          <button className="mobile-primary" type="submit"><CirclePlus size={18} /> Erkannte Skizze ins Aufmaß übernehmen</button>
        </>}
      </form>
    </section>
  );
});

export default MobileSketchMeasure;
