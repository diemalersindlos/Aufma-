"use client";

import {
  AlertTriangle,
  Camera,
  Check,
  FileImage,
  Info,
  LoaderCircle,
  Maximize2,
  Move,
  Plus,
  Ruler,
  ScanLine,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  calculateInsta360RoomGeometry,
  panoramaAspectStatus,
  type Insta360OpeningInput,
  type Insta360RoomInput,
  type PanoramaAsset,
  type ReferenceMethod,
  type RoomShape,
} from "@/lib/insta360";
import { createId, formatNumber } from "@/lib/measurements";
import EditableNumberInput from "@/components/editable-number-input";
import { type ChangeEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, useEffect, useMemo, useRef, useState } from "react";

type RoomDraft = Omit<Insta360RoomInput, "panorama" | "page" | "color">;

type Insta360MeasureProps = {
  panoramas: PanoramaAsset[];
  getPanoramaUrl: (panorama: PanoramaAsset) => string;
  onImport: (panorama: PanoramaAsset, file: File) => void;
  onCreateRoom: (draft: RoomDraft, panorama: PanoramaAsset) => void;
  onClose: () => void;
};

const MAX_IMAGE_BYTES = 80 * 1024 * 1024;

async function imageSize(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    } catch {
      // Safari versions without reliable createImageBitmap support use the image fallback below.
    }
  }
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      reject(new Error("Das Bild konnte nicht gelesen werden."));
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

function inferredCameraModel(fileName: string) {
  const normalized = fileName.toUpperCase();
  const models = ["X5", "X4 AIR", "X4", "X3", "X2", "ONE RS", "ONE R", "ONE X"];
  return `Insta360 ${models.find((model) => normalized.includes(model.replace(/\s/g, "")) || normalized.includes(model)) ?? "360°"}`;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL-Shader konnte nicht erstellt werden.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "WebGL-Shaderfehler");
  return shader;
}

function PanoramaViewer({ src, label }: { src: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<((yaw: number, pitch: number, fov: number) => void) | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; yaw: number; pitch: number } | null>(null);
  const fallbackDragRef = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [view, setView] = useState({ yaw: 0, pitch: 0, fov: 1.24 });
  const [fallbackZoom, setFallbackZoom] = useState(1.45);
  const viewRef = useRef(view);
  const [fallback, setFallback] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: true });
    if (!gl) {
      setFallback(true);
      setLoading(false);
      return;
    }

    try {
      const vertex = compileShader(gl, gl.VERTEX_SHADER, `
        attribute vec2 a_position;
        varying vec2 v_uv;
        void main() {
          v_uv = a_position * .5 + .5;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `);
      const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `
        precision highp float;
        varying vec2 v_uv;
        uniform sampler2D u_texture;
        uniform float u_yaw;
        uniform float u_pitch;
        uniform float u_fov;
        uniform float u_aspect;
        const float PI = 3.141592653589793;
        void main() {
          vec2 screen = v_uv * 2.0 - 1.0;
          float scale = tan(u_fov * .5);
          vec3 ray = normalize(vec3(screen.x * u_aspect * scale, -screen.y * scale, -1.0));
          float cp = cos(u_pitch);
          float sp = sin(u_pitch);
          ray = vec3(ray.x, ray.y * cp - ray.z * sp, ray.y * sp + ray.z * cp);
          float cy = cos(u_yaw);
          float sy = sin(u_yaw);
          ray = vec3(ray.x * cy - ray.z * sy, ray.y, ray.x * sy + ray.z * cy);
          float longitude = atan(ray.x, -ray.z);
          float latitude = asin(clamp(ray.y, -1.0, 1.0));
          vec2 panorama = vec2(fract(longitude / (2.0 * PI) + .5), clamp(.5 - latitude / PI, 0.001, .999));
          gl_FragColor = texture2D(u_texture, panorama);
        }
      `);
      const program = gl.createProgram();
      if (!program) throw new Error("WebGL-Programm konnte nicht erstellt werden.");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "WebGL-Linkfehler");

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      gl.useProgram(program);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);

      const yawLocation = gl.getUniformLocation(program, "u_yaw");
      const pitchLocation = gl.getUniformLocation(program, "u_pitch");
      const fovLocation = gl.getUniformLocation(program, "u_fov");
      const aspectLocation = gl.getUniformLocation(program, "u_aspect");
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(rect.width * ratio));
        const height = Math.max(1, Math.round(rect.height * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
      };
      drawRef.current = (yaw, pitch, fov) => {
        resize();
        gl.useProgram(program);
        gl.uniform1f(yawLocation, yaw);
        gl.uniform1f(pitchLocation, pitch);
        gl.uniform1f(fovLocation, fov);
        gl.uniform1f(aspectLocation, canvas.width / Math.max(1, canvas.height));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      };
      resizeObserver = new ResizeObserver(() => {
        const currentView = viewRef.current;
        drawRef.current?.(currentView.yaw, currentView.pitch, currentView.fov);
      });
      resizeObserver.observe(canvas);

      const image = new Image();
      image.onload = () => {
        if (disposed) return;
        const maxTexture = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, 4096);
        let source: CanvasImageSource = image;
        if (Math.max(image.naturalWidth, image.naturalHeight) > maxTexture) {
          const ratio = maxTexture / Math.max(image.naturalWidth, image.naturalHeight);
          const preview = document.createElement("canvas");
          preview.width = Math.max(1, Math.round(image.naturalWidth * ratio));
          preview.height = Math.max(1, Math.round(image.naturalHeight * ratio));
          preview.getContext("2d")?.drawImage(image, 0, 0, preview.width, preview.height);
          source = preview;
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        setLoading(false);
        drawRef.current?.(0, 0, 1.24);
      };
      image.onerror = () => {
        if (!disposed) {
          setFallback(true);
          setLoading(false);
        }
      };
      image.src = src;
    } catch {
      setFallback(true);
      setLoading(false);
    }

    return () => {
      disposed = true;
      drawRef.current = null;
      resizeObserver?.disconnect();
    };
  }, [src]);

  useEffect(() => {
    viewRef.current = view;
    drawRef.current?.(view.yaw, view.pitch, view.fov);
  }, [view]);

  function beginDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch };
  }

  function moveView(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((current) => ({
      ...current,
      yaw: drag.yaw - (event.clientX - drag.x) * .006,
      pitch: Math.max(-1.32, Math.min(1.32, drag.pitch + (event.clientY - drag.y) * .005)),
    }));
  }

  function zoom(delta: number) {
    setView((current) => ({ ...current, fov: Math.max(.52, Math.min(1.65, current.fov + delta)) }));
  }

  function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    zoom(event.deltaY > 0 ? .08 : -.08);
  }

  if (fallback) return (
    <div className="panorama-canvas-wrap panorama-fallback-wrap">
      <div
        ref={fallbackRef}
        className="panorama-fallback-scroll"
        role="img"
        aria-label={`Scroll- und zoombare 360-Grad-Aufnahme ${label}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          fallbackDragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: event.currentTarget.scrollLeft, scrollTop: event.currentTarget.scrollTop };
        }}
        onPointerMove={(event) => {
          const drag = fallbackDragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          event.currentTarget.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
          event.currentTarget.scrollTop = drag.scrollTop - (event.clientY - drag.y);
        }}
        onPointerUp={() => { fallbackDragRef.current = null; }}
        onPointerCancel={() => { fallbackDragRef.current = null; }}
      >
        {/* User-provided object URLs and protected project images cannot use Next's image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="panorama-fallback" style={{ width: `${fallbackZoom * 100}%` }} src={src} alt="" />
      </div>
      <div className="panorama-hint"><Move size={14} /> Ziehen zum Umsehen</div>
      <div className="panorama-controls" role="group" aria-label="360-Grad-Zoom">
        <button type="button" onClick={() => setFallbackZoom((current) => Math.max(1, current - .2))} aria-label="360-Grad-Ansicht verkleinern"><ZoomOut size={16} /></button>
        <strong>{formatNumber(fallbackZoom, 1)}×</strong>
        <button type="button" onClick={() => setFallbackZoom((current) => Math.min(4, current + .2))} aria-label="360-Grad-Ansicht vergrößern"><ZoomIn size={16} /></button>
        <button type="button" onClick={() => { setFallbackZoom(1.45); fallbackRef.current?.scrollTo({ left: 0, top: 0 }); }} aria-label="360-Grad-Ansicht zurücksetzen"><Maximize2 size={15} /></button>
      </div>
    </div>
  );

  return (
    <div className="panorama-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="panorama-canvas"
        role="img"
        aria-label={`Interaktive 360-Grad-Ansicht ${label}`}
        tabIndex={0}
        onPointerDown={beginDrag}
        onPointerMove={moveView}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
        onWheel={handleWheel}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setView((current) => ({ ...current, yaw: current.yaw - .12 }));
          if (event.key === "ArrowRight") setView((current) => ({ ...current, yaw: current.yaw + .12 }));
          if (event.key === "ArrowUp") setView((current) => ({ ...current, pitch: Math.max(-1.32, current.pitch - .1) }));
          if (event.key === "ArrowDown") setView((current) => ({ ...current, pitch: Math.min(1.32, current.pitch + .1) }));
          if (event.key === "+") zoom(-.08);
          if (event.key === "-") zoom(.08);
        }}
      />
      {loading && <div className="panorama-loading"><LoaderCircle className="spin" size={24} /> 360°-Ansicht wird geladen …</div>}
      <div className="panorama-hint"><Move size={14} /> Ziehen zum Umsehen</div>
      <div className="panorama-controls" role="group" aria-label="360-Grad-Zoom">
        <button type="button" onClick={() => zoom(.1)} aria-label="360-Grad-Ansicht verkleinern"><ZoomOut size={16} /></button>
        <strong>{Math.round(74 / view.fov)}×</strong>
        <button type="button" onClick={() => zoom(-.1)} aria-label="360-Grad-Ansicht vergrößern"><ZoomIn size={16} /></button>
        <button type="button" onClick={() => setView({ yaw: 0, pitch: 0, fov: 1.24 })} aria-label="360-Grad-Ansicht zurücksetzen"><Maximize2 size={15} /></button>
      </div>
    </div>
  );
}

export default function Insta360Measure({ panoramas, getPanoramaUrl, onImport, onCreateRoom, onClose }: Insta360MeasureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState(panoramas.at(-1)?.id ?? "");
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [roomName, setRoomName] = useState(panoramas.at(-1)?.roomName || "");
  const [shape, setShape] = useState<RoomShape>("rectangle");
  const [length, setLength] = useState(5);
  const [width, setWidth] = useState(4);
  const [area, setArea] = useState(20);
  const [perimeter, setPerimeter] = useState(18);
  const [height, setHeight] = useState(2.5);
  const [quantity, setQuantity] = useState(1);
  const [factor, setFactor] = useState(1);
  const [includeFloor, setIncludeFloor] = useState(false);
  const [includeCeiling, setIncludeCeiling] = useState(true);
  const [includeWalls, setIncludeWalls] = useState(true);
  const [includeSkirting, setIncludeSkirting] = useState(false);
  const [referenceMethod, setReferenceMethod] = useState<ReferenceMethod>("laser");
  const [openings, setOpenings] = useState<Insta360OpeningInput[]>([]);
  const selected = panoramas.find((panorama) => panorama.id === selectedId) ?? panoramas.at(-1) ?? null;
  const geometry = useMemo(() => calculateInsta360RoomGeometry({ shape, length, width, area, perimeter, height }), [area, height, length, perimeter, shape, width]);
  const hasQuantity = includeFloor || includeCeiling || includeWalls || includeSkirting;
  const isValid = Boolean(selected && roomName.trim() && geometry.area > 0 && geometry.perimeter > 0 && height > 0 && quantity > 0 && factor > 0 && hasQuantity);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError("");
    if (file.size > MAX_IMAGE_BYTES) {
      setImportError("Die 360°-Aufnahme darf höchstens 80 MB groß sein.");
      input.value = "";
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setImportError("Bitte das INSP-Original zuerst in der Insta360-App oder in Insta360 Studio als 360°-JPG exportieren.");
      input.value = "";
      return;
    }
    setIsImporting(true);
    try {
      const dimensions = await imageSize(file);
      const panorama: PanoramaAsset = {
        id: createId("pano360"),
        fileName: file.name,
        width: dimensions.width,
        height: dimensions.height,
        cameraModel: inferredCameraModel(file.name),
        roomName: roomName.trim(),
        createdAt: new Date().toISOString(),
      };
      onImport(panorama, file);
      setSelectedId(panorama.id);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Die Aufnahme konnte nicht importiert werden.");
    } finally {
      input.value = "";
      setIsImporting(false);
    }
  }

  function addOpening(name: string) {
    setOpenings((current) => [...current, {
      id: createId("opening360"),
      name,
      width: name === "Tür" ? .885 : 1.25,
      height: name === "Tür" ? 2.01 : 1.25,
      quantity: 1,
      mode: "vob",
    }]);
  }

  function createRoom() {
    if (!selected || !isValid) return;
    onCreateRoom({
      roomName,
      shape,
      length,
      width,
      area,
      perimeter,
      height,
      quantity,
      factor,
      includeFloor,
      includeCeiling,
      includeWalls,
      includeSkirting,
      referenceMethod,
      openings,
    }, selected);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal wide insta360-modal" role="dialog" aria-modal="true" aria-label="360-Grad-Aufmaß mit Insta360">
        <div className="modal-head">
          <div><h2>360°-Aufmaß · Insta360</h2><p>Panorama als Raumnachweis speichern und prüfbare Maße in das VOB-Aufmaß übernehmen</p></div>
          <button onClick={onClose} aria-label="Schließen"><X size={19} /></button>
        </div>
        <div className="modal-body insta360-body">
          <div className="insta360-intro">
            <span><Camera size={22} /></span>
            <div><strong>Insta360-Aufnahme mit Kontrollmaß</strong><small>INSP-Datei in der Insta360-App oder in Insta360 Studio als <b>360°-Foto (JPG)</b> exportieren. Ein Laser- oder bekanntes Kontrollmaß stellt die prüfbare Größenbasis her.</small></div>
            <button className="button primary" type="button" onClick={() => inputRef.current?.click()} disabled={isImporting}>{isImporting ? <LoaderCircle className="spin" size={16} /> : <UploadCloud size={16} />} Aufnahme importieren</button>
          </div>

          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={handleFile} hidden />
          {importError && <div className="insta360-error"><AlertTriangle size={16} /> {importError}</div>}

          <div className="insta360-workspace">
            <section className="insta360-viewer-panel">
              {selected ? (
                <>
                  <PanoramaViewer key={selected.id} src={getPanoramaUrl(selected)} label={selected.roomName || selected.fileName} />
                  <div className="panorama-filebar">
                    <span><FileImage size={16} /><span><strong>{selected.fileName}</strong><small>{selected.width} × {selected.height} px · {selected.cameraModel}</small></span></span>
                    <em className={panoramaAspectStatus(selected.width, selected.height) === "equirectangular" ? "valid" : "warning"}>{panoramaAspectStatus(selected.width, selected.height) === "equirectangular" ? "360° erkannt" : "Format prüfen"}</em>
                  </div>
                </>
              ) : (
                <button className="panorama-empty" type="button" onClick={() => inputRef.current?.click()}>
                  <span><ScanLine size={34} /></span>
                  <strong>Erste Insta360-Aufnahme laden</strong>
                  <small>Stitched 360°-Foto im JPG-Format auswählen</small>
                </button>
              )}

              {panoramas.length > 1 && (
                <div className="panorama-library" aria-label="Gespeicherte 360-Grad-Aufnahmen">
                  {panoramas.map((panorama, index) => (
                    <button key={panorama.id} type="button" className={panorama.id === selected?.id ? "active" : ""} onClick={() => { setSelectedId(panorama.id); setRoomName(panorama.roomName); }}>
                      <Camera size={15} /><span><strong>{panorama.roomName || `Aufnahme ${index + 1}`}</strong><small>{panorama.fileName}</small></span>
                    </button>
                  ))}
                </div>
              )}

              <div className="insta360-truth-note"><Info size={15} /><span><strong>Warum ein Kontrollmaß?</strong><small>Eine einzelne 360°-Aufnahme enthält keine verlässliche Tiefenskala. Die App verwendet deshalb die eingetragenen Laser- oder Kontrollmaße und führt sie im Prüfaufmaß als Herkunft auf.</small></span></div>
            </section>

            <section className="insta360-form-panel">
              <div className="insta360-step"><b>1</b><span><strong>Raum und Messgrundlage</strong><small>Bezeichnung und Herkunft werden in Excel und PDF dokumentiert.</small></span></div>
              <label><span className="field-label">Raumbezeichnung</span><input className="text-input" value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="z. B. Wohnzimmer EG" /></label>
              <div className="field-grid two with-top">
                <label><span className="field-label">Maßquelle</span><select className="text-input" value={referenceMethod} onChange={(event) => setReferenceMethod(event.target.value as ReferenceMethod)}><option value="laser">Insta360 + Lasermessgerät</option><option value="known">Insta360 + bekanntes Kontrollmaß</option><option value="manual">Insta360 + manuelle Maße</option></select></label>
                <label><span className="field-label">Raumform</span><div className="segmented two"><button type="button" className={shape === "rectangle" ? "active" : ""} onClick={() => setShape("rectangle")}>Rechteck</button><button type="button" className={shape === "free" ? "active" : ""} onClick={() => setShape("free")}>Freie Form</button></div></label>
              </div>

              <div className="insta360-step with-top"><b>2</b><span><strong>Kontrollmaße eingeben</strong><small>Die Berechnung erscheint sofort darunter.</small></span></div>
              {shape === "rectangle" ? (
                <div className="field-grid three">
                  <label><span className="field-label">Länge</span><div className="input-with-unit"><EditableNumberInput min=".01" step=".01" value={length} onValueChange={setLength} /><span>m</span></div></label>
                  <label><span className="field-label">Breite</span><div className="input-with-unit"><EditableNumberInput min=".01" step=".01" value={width} onValueChange={setWidth} /><span>m</span></div></label>
                  <label><span className="field-label">Raumhöhe</span><div className="input-with-unit"><EditableNumberInput min=".01" step=".01" value={height} onValueChange={setHeight} /><span>m</span></div></label>
                </div>
              ) : (
                <div className="field-grid three">
                  <label><span className="field-label">Grundfläche</span><div className="input-with-unit"><EditableNumberInput min=".01" step=".01" value={area} onValueChange={setArea} /><span>m²</span></div></label>
                  <label><span className="field-label">Raumumfang</span><div className="input-with-unit"><EditableNumberInput min=".01" step=".01" value={perimeter} onValueChange={setPerimeter} /><span>m</span></div></label>
                  <label><span className="field-label">Raumhöhe</span><div className="input-with-unit"><EditableNumberInput min=".01" step=".01" value={height} onValueChange={setHeight} /><span>m</span></div></label>
                </div>
              )}

              <div className="insta360-result-grid">
                <span><small>Grundfläche</small><strong>{formatNumber(geometry.area)} m²</strong></span>
                <span><small>Umfang</small><strong>{formatNumber(geometry.perimeter)} m</strong></span>
                <span><small>Wandfläche brutto</small><strong>{formatNumber(geometry.wallArea)} m²</strong></span>
              </div>

              <div className="insta360-step with-top"><b>3</b><span><strong>Gewünschte Mengen</strong><small>Öffnungen werden nach der eingestellten VOB-Grenze behandelt.</small></span></div>
              <div className="check-grid insta360-quantities">
                {[
                  { label: "Wandflächen", value: includeWalls, set: setIncludeWalls },
                  { label: "Deckenflächen", value: includeCeiling, set: setIncludeCeiling },
                  { label: "Bodenflächen", value: includeFloor, set: setIncludeFloor },
                  { label: "Fußleisten", value: includeSkirting, set: setIncludeSkirting },
                ].map((item) => <label key={item.label} className={item.value ? "checked" : ""}><input type="checkbox" checked={item.value} onChange={(event) => item.set(event.target.checked)} /><span><Check size={14} /></span>{item.label}</label>)}
              </div>
              <div className="field-grid two with-top compact-fields"><label><span className="field-label">Anzahl gleicher Räume</span><EditableNumberInput className="text-input" min="1" step="1" value={quantity} onValueChange={setQuantity} /></label><label><span className="field-label">Faktor</span><EditableNumberInput className="text-input" min=".01" step=".1" value={factor} onValueChange={setFactor} /></label></div>

              <div className="insta360-openings-head"><span><strong>Fenster und Türen</strong><small>VOB-Abzug je einzelner Öffnung</small></span><div><button type="button" onClick={() => addOpening("Fenster")}><Plus size={13} /> Fenster</button><button type="button" onClick={() => addOpening("Tür")}><Plus size={13} /> Tür</button></div></div>
              {openings.length ? <div className="insta360-openings">{openings.map((opening) => (
                <div key={opening.id}>
                  <input aria-label="Bezeichnung der Öffnung" value={opening.name} onChange={(event) => setOpenings((current) => current.map((item) => item.id === opening.id ? { ...item, name: event.target.value } : item))} />
                  <label><EditableNumberInput aria-label={`${opening.name} Breite`} min="0" step=".01" value={opening.width} onValueChange={(value) => setOpenings((current) => current.map((item) => item.id === opening.id ? { ...item, width: value } : item))} /><span>m</span></label>
                  <label><EditableNumberInput aria-label={`${opening.name} Höhe`} min="0" step=".01" value={opening.height} onValueChange={(value) => setOpenings((current) => current.map((item) => item.id === opening.id ? { ...item, height: value } : item))} /><span>m</span></label>
                  <label><EditableNumberInput aria-label={`${opening.name} Anzahl`} min="1" step="1" value={opening.quantity} onValueChange={(value) => setOpenings((current) => current.map((item) => item.id === opening.id ? { ...item, quantity: value } : item))} /><span>×</span></label>
                  <select aria-label={`${opening.name} Abzugsregel`} value={opening.mode} onChange={(event) => setOpenings((current) => current.map((item) => item.id === opening.id ? { ...item, mode: event.target.value as Insta360OpeningInput["mode"] } : item))}><option value="vob">VOB automatisch</option><option value="always">immer abziehen</option><option value="never">nicht abziehen</option></select>
                  <button type="button" onClick={() => setOpenings((current) => current.filter((item) => item.id !== opening.id))} aria-label={`${opening.name} entfernen`}><Trash2 size={14} /></button>
                </div>
              ))}</div> : <div className="insta360-no-openings">Noch keine Öffnungen erfasst – Wandfläche wird zunächst brutto übernommen.</div>}
            </section>
          </div>

          <div className="modal-actions insta360-actions">
            <button className="button ghost" type="button" onClick={onClose}>Schließen</button>
            <span><Ruler size={15} /> Berechnungsgrundlage wird im Prüfaufmaß ausgewiesen</span>
            <button className="button primary" type="button" disabled={!isValid} onClick={createRoom}><Check size={16} /> Raum ins Aufmaß übernehmen</button>
          </div>
        </div>
      </section>
    </div>
  );
}
