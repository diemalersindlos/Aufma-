"use client";

import {
  Archive,
  ArchiveRestore,
  AlertTriangle,
  Building2,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  DoorOpen,
  Download,
  Eye,
  EyeOff,
  FileDown,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  FolderPlus,
  Hash,
  History,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Maximize2,
  Move,
  MousePointer2,
  Pentagon,
  Plus,
  Printer,
  Route,
  Ruler,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  buildCsv,
  createId,
  deriveLineItems,
  distance,
  formatNumber,
  getMeasurementPrimaryValue,
  measurementIsVisibleOnPlan,
  measurementColor,
  nextRoomColor,
  normalizeLegacyPdfRoomGeometry,
  normalizeMeasurementColors,
  openingCalculation,
  polygonCentroid,
  polygonPixels,
  polylinePixels,
  type LineItem,
  type Measurement,
  type MeasurementKind,
  type Opening,
  type Point,
  type ProjectMeta,
} from "@/lib/measurements";
import { calculateOpeningRule, VOB_RULESET } from "@/lib/vob-rules";
import { detectEnclosedRooms } from "@/lib/auto-detect";
import { erasePdfTextItemsFromCanvas } from "@/lib/pdf-text-mask";
import {
  combinePdfRoomCandidateSets,
  extractPdfRoomLabelsFromItems,
  matchPdfRoomsToGeometry,
} from "@/lib/pdf-room-labels";
import {
  adjustRoomToPdfDimensions,
  attachPdfRoomNames,
  classifyPdfPage,
  extractPdfDimensions,
  extractPdfDrawingAnchors,
  extractPdfRoomHeights,
  extractPdfRoomAnchors,
  extractScaleDenominator,
  filterRoomsToFloorPlanRegions,
  pointBelongsToFloorPlanRegion,
  selectPdfRoomHeight,
  type PdfPageKind,
  type PdfTextItemLike,
} from "@/lib/pdf-plan-analysis";
import {
  buildAuditExcel,
  buildArchitectExcel,
  calculateMaterialPreview,
  defaultMaterialSettings,
  type MaterialPreview,
  type MaterialSettings,
} from "@/lib/excel-export";
import { buildAuditPdf } from "@/lib/pdf-export";
import { calculatePdfRenderMetrics } from "@/lib/pdf-render-quality";
import {
  buildInsta360RoomMeasurement,
  referenceMethodLabel,
  type Insta360RoomInput,
  type PanoramaAsset,
} from "@/lib/insta360";
import type { ProjectAuditEvent, ProjectStatus, ProjectSummary, StoredProjectResponse, StoredProjectState } from "@/lib/project-storage-types";
import Insta360Measure from "@/components/insta360-measure";
import EditableNumberInput from "@/components/editable-number-input";
import ProfessionalSuite, { type ProfessionalTab } from "@/components/professional-suite";
import PwaInstall from "@/components/pwa-install";
import StartupSplash from "@/components/startup-splash";
import UserManual from "@/components/user-manual";
import {
  buildLaserRoomMeasurement,
  buildGaebX31PreparationXml,
  buildIntegrationManifest,
  buildRebPreparationCsv,
  buildReviewCsv,
  buildSpecialAreaMeasurement,
  emptyProjectReview,
  evaluateQualityGate,
  type LaserRoomInput,
  type ProjectReviewState,
  type SpecialShapeInput,
} from "@/lib/pro-workflow";
import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Tool = "select" | "calibrate" | "room" | "area" | "line" | "opening" | "count";
type PendingGeometry = { kind: MeasurementKind; points: Point[] } | null;
type PdfViewport = { width: number; height: number; scale?: number; transform?: number[] };
type PdfRenderTask = { promise: Promise<void>; cancel: () => void };
type PdfPage = {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport; transform?: number[] }) => PdfRenderTask;
  getTextContent?: () => Promise<{ items: PdfTextItemLike[] }>;
};
type PdfDocument = { numPages: number; getPage: (page: number) => Promise<PdfPage> };
type AutoScaleSource = "pdf" | "calibrated";
type AutoSummary = { rooms: number; pages: number; area: number; method: "nrf" | "dimensions" | "geometry"; reviewRooms: number; roomHeights: number };
type AutoPageKind = PdfPageKind;
type ProjectSaveState = "idle" | "saving" | "saved" | "error";
type GeometryDrag = {
  pointerId: number;
  mode: "outline" | "vertex";
  vertexIndex?: number;
  origin: Point;
  startPoints: Point[];
};

function createInitialMeta(): ProjectMeta {
  return {
    id: createId("project"),
    title: "",
    customer: "",
    address: "",
    estimator: "",
    reference: "",
    standard: "VOB/C · ATV DIN 18363 / DIN 18366:2019-09",
    deductionThreshold: 2.5,
    vobRuleSetId: VOB_RULESET.id,
    vobRuleConfirmed: false,
    vobRuleConfirmedBy: "",
    vobRuleConfirmedAt: "",
    rounding: 2,
    updatedAt: new Date().toISOString(),
  };
}

const toolItems: { id: Tool; label: string; hint: string; icon: typeof MousePointer2 }[] = [
  { id: "select", label: "Auswahl", hint: "Position auswählen", icon: MousePointer2 },
  { id: "calibrate", label: "Maßstab", hint: "Bekannte Strecke messen", icon: Ruler },
  { id: "room", label: "Raum", hint: "Boden, Decke und Wände", icon: Pentagon },
  { id: "area", label: "Fläche", hint: "Freie Fläche messen", icon: Layers3 },
  { id: "line", label: "Länge", hint: "Freie Länge messen", icon: Route },
  { id: "opening", label: "Abzug", hint: "Fenster oder Tür", icon: DoorOpen },
  { id: "count", label: "Stück", hint: "Bauteile zählen", icon: Hash },
];

const areaCategories = ["Wand", "Decke", "Boden", "Fassade", "Leibung", "Holzfläche", "Metallfläche", "Sonstige Fläche"];
const lineCategories = ["Sockelleiste", "Fuge", "Kante", "Anschluss", "Abklebung", "Geländer", "Sonstige Länge"];

function arrayBufferCopy(content: Uint8Array) {
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  return copy.buffer;
}

function downloadBlob(content: BlobPart | Uint8Array, name: string, type: string) {
  const part: BlobPart = content instanceof Uint8Array ? arrayBufferCopy(content) : content;
  const url = URL.createObjectURL(new Blob([part], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeFileName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, "-").replace(/-+/g, "-") || "Aufmass";
}

function measurementSourceSummary(measurement: Measurement) {
  if (measurement.areaSource === "insta360-reference") return `Insta360 · ${referenceMethodLabel(measurement.captureSource?.referenceMethod ?? "manual")}`;
  if (measurement.areaSource === "laser-reference") return measurement.proCapture?.label || "Laser-Aufmaß";
  if (measurement.areaSource === "special-geometry") return measurement.proCapture?.label || "Sondergeometrie";
  if (measurement.areaSource === "freehand-sketch") return measurement.proCapture?.label || "Automatisch erkannte Freihandskizze";
  const geometrySummary = measurement.geometryStatus === "manual"
    ? " · Kontur manuell"
    : measurement.geometryStatus === "matched"
      ? " · Kontur zugeordnet"
      : measurement.geometryStatus === "uncertain"
        ? " · Kontur unsicher"
        : measurement.geometryStatus === "missing"
          ? " · Kontur fehlt"
          : "";
  return `S. ${measurement.page}${measurement.areaSource === "pdf-nrf" ? " · PDF-NRF übernommen" : measurement.areaSource === "pdf-dimensions" ? " · PDF-Maße verwendet" : measurement.areaSource === "pdf-scale" ? " · Planmaßstab" : measurement.source === "auto" ? " · Auto erkannt" : ""}${geometrySummary}`;
}

function compactPlanLabel(name: string, maximum = 21) {
  const clean = name.replace(/\s+/g, " ").trim();
  return clean.length <= maximum ? clean : `${clean.slice(0, maximum - 1).trimEnd()}…`;
}

function validOutlinePoints(points: Point[] | undefined) {
  return (points ?? []).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function calculatedRoomOutlinePoints(measurement: Measurement) {
  if (measurement.geometryStatus === "missing" || measurement.geometryStatus === "uncertain") return [];

  if (measurement.areaSource === "freehand-sketch") {
    const sketchPoints = validOutlinePoints(measurement.proCapture?.sketchPoints);
    return sketchPoints.length >= 3 ? sketchPoints : [];
  }

  const rectangle = (length: number | undefined, width: number | undefined) => {
    if (!Number.isFinite(length) || !Number.isFinite(width) || Number(length) <= 0 || Number(width) <= 0) return [];
    return [
      { x: 0, y: 0 },
      { x: Number(length), y: 0 },
      { x: Number(length), y: Number(width) },
      { x: 0, y: Number(width) },
    ];
  };

  if (measurement.areaSource === "laser-reference") {
    return rectangle(measurement.proCapture?.length, measurement.proCapture?.width);
  }
  if (measurement.areaSource === "insta360-reference" && measurement.captureSource?.shape === "rectangle") {
    return rectangle(measurement.captureSource.length, measurement.captureSource.width);
  }
  if (["insta360-reference", "laser-reference", "special-geometry"].includes(measurement.areaSource ?? "")) return [];

  const planPoints = validOutlinePoints(measurement.points);
  return planPoints.length >= 3 ? planPoints : [];
}

function fitRoomOutline(points: Point[]) {
  if (points.length < 3) return [];
  const width = 220;
  const height = 116;
  const padding = 14;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumY = Math.min(...ys);
  const maximumY = Math.max(...ys);
  const rangeX = maximumX - minimumX;
  const rangeY = maximumY - minimumY;
  if (rangeX <= 0 || rangeY <= 0) return [];
  const outlineScale = Math.min((width - padding * 2) / rangeX, (height - padding * 2) / rangeY);
  const offsetX = (width - rangeX * outlineScale) / 2;
  const offsetY = (height - rangeY * outlineScale) / 2;
  return points.map((point) => ({
    x: offsetX + (point.x - minimumX) * outlineScale,
    y: offsetY + (point.y - minimumY) * outlineScale,
  }));
}

function RoomOutlinePreview({ measurement, scale }: { measurement: Measurement; scale?: number }) {
  const rawPoints = calculatedRoomOutlinePoints(measurement);
  const outline = fitRoomOutline(rawPoints);
  const area = measurement.areaOverride
    ?? (Number.isFinite(scale) && Number(scale) > 0 ? polygonPixels(measurement.points) * Number(scale) * Number(scale) : 0);
  const perimeter = measurement.perimeterOverride
    ?? (Number.isFinite(scale) && Number(scale) > 0 ? polylinePixels(measurement.points, true) * Number(scale) : 0);
  const source = measurement.areaSource === "freehand-sketch"
    ? "Erkannte und begradigte Skizzenkontur"
    : measurement.areaSource === "laser-reference"
      ? "Rechteck aus den Lasermesswerten"
      : measurement.areaSource === "insta360-reference"
        ? "Raumform aus dem 360°-Aufmaß"
        : "Berechnete Kontur im Grundriss";

  return (
    <section className="selected-room-outline-card" aria-label={`Berechneter Umriss von ${measurement.name}`}>
      <header>
        <i style={{ backgroundColor: measurement.color }} />
        <span><small>BERECHNETER UMRISS</small><strong>{measurement.name}</strong></span>
      </header>
      {outline.length >= 3 ? (
        <svg viewBox="0 0 220 116" role="img" aria-label={`Umriss von ${measurement.name}`}>
          <polygon
            points={outline.map((point) => `${point.x},${point.y}`).join(" ")}
            fill={measurement.color}
            fillOpacity="0.16"
            stroke={measurement.color}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {outline.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="3.5" fill="#fff" stroke={measurement.color} strokeWidth="2" />)}
        </svg>
      ) : (
        <div className="selected-room-outline-missing">
          <AlertTriangle size={18} />
          <span><strong>Kein belastbarer Umriss</strong><small>Die Fläche ist berechnet, die Raumkontur muss noch gezeichnet oder bestätigt werden.</small></span>
        </div>
      )}
      <footer>
        <span><small>Grundfläche</small><strong>{formatNumber(area)} m²</strong></span>
        <span><small>Umfang</small><strong>{perimeter > 0 ? `${formatNumber(perimeter)} m` : "nicht bestimmt"}</strong></span>
      </footer>
      <p>{outline.length >= 3 ? source : "Es wird keine Form erfunden oder geschätzt."}</p>
    </section>
  );
}

function cloneMaterials(settings: MaterialSettings = defaultMaterialSettings): MaterialSettings {
  return {
    paint: { ...settings.paint },
    filler: { ...settings.filler },
    wallpaper: { ...settings.wallpaper },
  };
}

function cloneReview(review: ProjectReviewState = emptyProjectReview): ProjectReviewState {
  return {
    reviewer: review.reviewer ?? "",
    office: review.office ?? "",
    entries: { ...(review.entries ?? {}) },
    updatedAt: review.updatedAt ?? "",
    workflowStatus: review.workflowStatus ?? "open",
    revision: review.revision ?? 1,
    releasedAt: review.releasedAt ?? "",
    releaseCode: review.releaseCode ?? "",
    signatureName: review.signatureName ?? "",
  };
}

async function inspectPdfPages(document: PdfDocument) {
  const scales: Record<number, number | null> = {};
  const kinds: Record<number, AutoPageKind> = {};
  const dimensionCounts: Record<number, number> = {};
  const textItems: Record<number, PdfTextItemLike[]> = {};

  // Deliberately sequential: several simultaneous getTextContent calls can be
  // unreliable on memory-constrained mobile Safari tabs.
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    let items: PdfTextItemLike[] = [];
    try {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent?.();
      items = content?.items ?? [];
    } catch {
      // A page with unreadable text can still be evaluated from its raster
      // geometry and an entered or calibrated scale.
    }
    textItems[pageNumber] = items;
    scales[pageNumber] = extractScaleDenominator(items);
    kinds[pageNumber] = classifyPdfPage(items);
    if (items.length) {
      try {
        const page = await document.getPage(pageNumber);
        dimensionCounts[pageNumber] = extractPdfDimensions(items, page.getViewport({ scale: 1 })).length;
      } catch {
        dimensionCounts[pageNumber] = 0;
      }
    } else dimensionCounts[pageNumber] = 0;
  }
  return { scales, kinds, dimensionCounts, textItems };
}

export default function MeasureApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomFrameRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourcePdfBytesRef = useRef<Uint8Array | null>(null);
  const pdfNeedsUploadRef = useRef(false);
  const panoramaFilesRef = useRef(new Map<string, File>());
  const panoramaObjectUrlsRef = useRef(new Map<string, string>());
  const undoStack = useRef<Measurement[][]>([]);
  const renderTask = useRef<{ cancel: () => void } | null>(null);
  const pdfTextItemsRef = useRef<Record<number, PdfTextItemLike[]>>({});
  const navigationPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const renderedDocumentRef = useRef<PdfDocument | null>(null);
  const renderedPageNumberRef = useRef(0);
  const renderGenerationRef = useRef(0);
  const navigationGestureRef = useRef<
    | { mode: "pan"; pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number }
    | { mode: "pinch"; startDistance: number; startZoom: number }
    | null
  >(null);
  const geometryDragRef = useRef<GeometryDrag | null>(null);

  const [meta, setMeta] = useState<ProjectMeta>(() => createInitialMeta());
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [fileName, setFileName] = useState("");
  const [sourceFileNames, setSourceFileNames] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [includedPages, setIncludedPages] = useState<number[]>([]);
  const [stageSize, setStageSize] = useState({ width: 900, height: 640 });
  const [zoom, setZoom] = useState(1);
  const [renderQualityRevision, setRenderQualityRevision] = useState(0);
  const [tool, setTool] = useState<Tool>("select");
  const [scales, setScales] = useState<Record<number, number>>({});
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [cursorPoint, setCursorPoint] = useState<Point | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingGeometry, setPendingGeometry] = useState<PendingGeometry>(null);
  const [pendingOpeningPoint, setPendingOpeningPoint] = useState<Point | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [calibrationDistance, setCalibrationDistance] = useState("");
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [showInsta360, setShowInsta360] = useState(false);
  const [showProfessional, setShowProfessional] = useState(false);
  const [professionalTab, setProfessionalTab] = useState<ProfessionalTab>("laser");
  const [resumeAutoAfterCalibration, setResumeAutoAfterCalibration] = useState(false);
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingAudit, setIsExportingAudit] = useState(false);
  const [materialInputsConfirmed, setMaterialInputsConfirmed] = useState(false);
  const [materials, setMaterials] = useState<MaterialSettings>(() => cloneMaterials());
  const [showSettings, setShowSettings] = useState(false);
  const [showProject, setShowProject] = useState(false);
  const [showProjectLibrary, setShowProjectLibrary] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [autoProgress, setAutoProgress] = useState("");
  const [autoSummary, setAutoSummary] = useState<AutoSummary | null>(null);
  const [autoScaleSource, setAutoScaleSource] = useState<AutoScaleSource>("pdf");
  const [autoScaleDenominators, setAutoScaleDenominators] = useState<Record<number, number>>({});
  const [autoScaleDetectedPages, setAutoScaleDetectedPages] = useState<Record<number, boolean>>({});
  const [autoPageKinds, setAutoPageKinds] = useState<Record<number, AutoPageKind>>({});
  const [autoDimensionCounts, setAutoDimensionCounts] = useState<Record<number, number>>({});
  const [autoRoomHeight, setAutoRoomHeight] = useState(2.5);
  const [autoMinRoomArea, setAutoMinRoomArea] = useState(1);
  const [autoIncludeWalls, setAutoIncludeWalls] = useState(true);
  const [autoIncludeCeiling, setAutoIncludeCeiling] = useState(true);
  const [autoIncludeFloor, setAutoIncludeFloor] = useState(false);
  const [autoIncludeSkirting, setAutoIncludeSkirting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState("");
  const [listMode, setListMode] = useState<"positions" | "totals">("positions");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [geometryEditingId, setGeometryEditingId] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>("draft");
  const [projectSaveState, setProjectSaveState] = useState<ProjectSaveState>("idle");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [projectLibraryError, setProjectLibraryError] = useState("");
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [panoramas, setPanoramas] = useState<PanoramaAsset[]>([]);
  const [projectReview, setProjectReview] = useState<ProjectReviewState>(() => cloneReview());
  const isProjectSaving = projectSaveState === "saving";

  useEffect(() => () => {
    panoramaObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    panoramaObjectUrlsRef.current.clear();
  }, []);

  const pageScale = scales[pageNumber];
  const includedPageSet = useMemo(() => new Set(includedPages), [includedPages]);
  const includedMeasurements = useMemo(
    () => measurements.filter((measurement) => includedPageSet.has(measurement.page)),
    [includedPageSet, measurements],
  );
  const rows = useMemo(
    () => deriveLineItems(includedMeasurements, scales, meta.deductionThreshold, meta.rounding),
    [includedMeasurements, scales, meta.deductionThreshold, meta.rounding],
  );
  const quality = useMemo(
    () => evaluateQualityGate(meta, rows, includedMeasurements, scales, projectReview),
    [includedMeasurements, meta, projectReview, rows, scales],
  );
  const selected = measurements.find((measurement) => measurement.id === selectedId) ?? null;
  const pageMeasurements = measurements.filter((measurement) => measurement.page === pageNumber && measurement.visible);
  const totals = useMemo(() => {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.unit] = (acc[row.unit] ?? 0) + row.result;
      return acc;
    }, {});
  }, [rows]);
  const materialPreview = useMemo(
    () => calculateMaterialPreview(rows, includedMeasurements, scales, materials),
    [includedMeasurements, materials, rows, scales],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3300);
  }, []);

  const commitMeasurements = useCallback((next: Measurement[] | ((current: Measurement[]) => Measurement[])) => {
    setProjectStatus("draft");
    setProjectSaveState("idle");
    setProjectReview((current) => current.workflowStatus === "released" ? { ...current, workflowStatus: "in-review", revision: (current.revision ?? 1) + 1, releasedAt: "", releaseCode: "", updatedAt: new Date().toISOString() } : current);
    setMeasurements((current) => {
      undoStack.current.push(current);
      if (undoStack.current.length > 40) undoStack.current.shift();
      return typeof next === "function" ? next(current) : next;
    });
  }, []);

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (previous) {
      setProjectStatus("draft");
      setProjectSaveState("idle");
      setProjectReview((current) => current.workflowStatus === "released" ? { ...current, workflowStatus: "in-review", revision: (current.revision ?? 1) + 1, releasedAt: "", releaseCode: "", updatedAt: new Date().toISOString() } : current);
      setMeasurements(previous);
      setSelectedId(null);
    }
  }, []);

  const cancelDrawing = useCallback(() => {
    geometryDragRef.current = null;
    setDrawingPoints([]);
    setCursorPoint(null);
    setCalibrationPoints([]);
    setGeometryEditingId(null);
  }, []);

  const selectTool = useCallback(
    (nextTool: Tool) => {
      cancelDrawing();
      if (nextTool !== "select" && nextTool !== "calibrate" && !pdfDocument) {
        showToast("Bitte zuerst einen PDF-Grundriss laden.");
        fileInputRef.current?.click();
        return;
      }
      if (!["select", "calibrate"].includes(nextTool) && !pageScale) {
        setTool("calibrate");
        showToast("Vor dem Messen bitte den Maßstab dieser Seite kalibrieren.");
        return;
      }
      setTool(nextTool);
    },
    [cancelDrawing, pageScale, pdfDocument, showToast],
  );

  const applyZoom = useCallback((requestedZoom: number, anchor?: { clientX: number; clientY: number }) => {
    const nextZoom = Math.min(4, Math.max(.35, Math.round(requestedZoom * 100) / 100));
    if (nextZoom === zoom) return;

    const viewport = viewportRef.current;
    const frame = zoomFrameRef.current;
    let anchorX = 0;
    let anchorY = 0;
    let relativeX = .5;
    let relativeY = .5;

    if (viewport && frame) {
      const viewportRect = viewport.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      anchorX = anchor?.clientX ?? viewportRect.left + viewport.clientWidth / 2;
      anchorY = anchor?.clientY ?? viewportRect.top + viewport.clientHeight / 2;
      relativeX = frameRect.width ? Math.min(1, Math.max(0, (anchorX - frameRect.left) / frameRect.width)) : .5;
      relativeY = frameRect.height ? Math.min(1, Math.max(0, (anchorY - frameRect.top) / frameRect.height)) : .5;
    }

    setZoom(nextZoom);

    if (viewport && frame) {
      window.requestAnimationFrame(() => {
        const nextFrameRect = frame.getBoundingClientRect();
        viewport.scrollLeft += nextFrameRect.left + relativeX * nextFrameRect.width - anchorX;
        viewport.scrollTop += nextFrameRect.top + relativeY * nextFrameRect.height - anchorY;
      });
    }
  }, [zoom]);

  const handleViewportWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (!pdfDocument) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      applyZoom(zoom + (event.deltaY < 0 ? .15 : -.15), {
        clientX: event.clientX,
        clientY: event.clientY,
      });
      return;
    }
    if (event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      event.currentTarget.scrollLeft += event.deltaY;
    }
  }, [applyZoom, pdfDocument, zoom]);

  const handleViewportKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!pdfDocument || event.ctrlKey || event.metaKey) return;
    const viewport = event.currentTarget;
    const lineStep = event.shiftKey ? 180 : 80;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      viewport.scrollBy({
        left: event.key === "ArrowLeft" ? -lineStep : event.key === "ArrowRight" ? lineStep : 0,
        top: event.key === "ArrowUp" ? -lineStep : event.key === "ArrowDown" ? lineStep : 0,
      });
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      viewport.scrollBy({ top: (event.key === "PageUp" ? -1 : 1) * viewport.clientHeight * .8 });
      return;
    }
    if (["+", "=", "-", "0"].includes(event.key)) {
      event.preventDefault();
      applyZoom(event.key === "0" ? 1 : zoom + (["+", "="].includes(event.key) ? .15 : -.15));
    }
  }, [applyZoom, pdfDocument, zoom]);

  const beginViewportNavigation = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pdfDocument || tool !== "select" || !["touch", "mouse", "pen"].includes(event.pointerType)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button, input, select, textarea, a")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    navigationPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...navigationPointsRef.current.entries()];

    if (points.length === 1) {
      navigationGestureRef.current = {
        mode: "pan",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: event.currentTarget.scrollLeft,
        scrollTop: event.currentTarget.scrollTop,
      };
      return;
    }

    const [, first] = points[0];
    const [, second] = points[1];
    navigationGestureRef.current = {
      mode: "pinch",
      startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      startZoom: zoom,
    };
  }, [pdfDocument, tool, zoom]);

  const continueViewportNavigation = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!navigationPointsRef.current.has(event.pointerId) || tool !== "select") return;
    event.preventDefault();
    navigationPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...navigationPointsRef.current.values()];
    const gesture = navigationGestureRef.current;

    if (points.length >= 2) {
      const [first, second] = points;
      const distanceNow = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const center = { clientX: (first.x + second.x) / 2, clientY: (first.y + second.y) / 2 };
      const pinch = gesture?.mode === "pinch"
        ? gesture
        : { mode: "pinch" as const, startDistance: distanceNow, startZoom: zoom };
      navigationGestureRef.current = pinch;
      applyZoom(pinch.startZoom * (distanceNow / pinch.startDistance), center);
      return;
    }

    if (gesture?.mode === "pan" && gesture.pointerId === event.pointerId) {
      event.currentTarget.scrollLeft = gesture.scrollLeft - (event.clientX - gesture.startX);
      event.currentTarget.scrollTop = gesture.scrollTop - (event.clientY - gesture.startY);
    }
  }, [applyZoom, tool, zoom]);

  const endViewportNavigation = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!navigationPointsRef.current.has(event.pointerId)) return;
    navigationPointsRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const remaining = [...navigationPointsRef.current.entries()];
    if (remaining.length === 1) {
      const [pointerId, point] = remaining[0];
      navigationGestureRef.current = {
        mode: "pan",
        pointerId,
        startX: point.x,
        startY: point.y,
        scrollLeft: event.currentTarget.scrollLeft,
        scrollTop: event.currentTarget.scrollTop,
      };
    } else if (!remaining.length) {
      navigationGestureRef.current = null;
    }
  }, []);

  const renderPage = useCallback(async (requestedZoom: number, fitToViewport: boolean) => {
    if (!pdfDocument || !canvasRef.current) return;
    const renderGeneration = ++renderGenerationRef.current;
    renderTask.current?.cancel();
    const page = await pdfDocument.getPage(pageNumber);
    if (renderGeneration !== renderGenerationRef.current || !canvasRef.current) return;
    const unscaled = page.getViewport({ scale: 1 });
    const targetWidth = Math.min(1180, Math.max(760, unscaled.width * 1.55));
    const baseScale = targetWidth / unscaled.width;
    const baseViewport = page.getViewport({ scale: baseScale });
    let displayZoom = Math.min(4, Math.max(.35, requestedZoom));
    const canvasViewport = viewportRef.current;
    if (fitToViewport && canvasViewport) {
      const availableWidth = Math.max(1, canvasViewport.clientWidth - 52);
      const availableHeight = Math.max(1, canvasViewport.clientHeight - 52);
      displayZoom = Math.max(.35, Math.min(1, availableWidth / baseViewport.width, availableHeight / baseViewport.height));
      setZoom(displayZoom);
    }
    setStageSize({ width: baseViewport.width, height: baseViewport.height });

    const displayViewport = page.getViewport({ scale: baseScale * displayZoom });
    const canvas = canvasRef.current;
    const metrics = calculatePdfRenderMetrics({
      baseWidth: baseViewport.width,
      baseHeight: baseViewport.height,
      zoom: displayZoom,
      devicePixelRatio: window.devicePixelRatio || 1,
      compact: window.matchMedia("(max-width: 900px)").matches,
    });
    canvas.width = metrics.bitmapWidth;
    canvas.height = metrics.bitmapHeight;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    const context = canvas.getContext("2d");
    if (!context) return;
    const scaleX = canvas.width / Math.max(1, displayViewport.width);
    const scaleY = canvas.height / Math.max(1, displayViewport.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const task = page.render({ canvasContext: context, viewport: displayViewport, transform: [scaleX, 0, 0, scaleY, 0, 0] });
    renderTask.current = task;
    try {
      await task.promise;
    } catch (error: unknown) {
      if (!(error instanceof Error) || error.name !== "RenderingCancelledException") throw error;
    }
  }, [pageNumber, pdfDocument]);

  useEffect(() => {
    if (!pdfDocument) return;
    const fitToViewport = renderedDocumentRef.current !== pdfDocument || renderedPageNumberRef.current !== pageNumber;
    renderedDocumentRef.current = pdfDocument;
    renderedPageNumberRef.current = pageNumber;
    const timer = window.setTimeout(() => {
      renderPage(zoom, fitToViewport).catch(() => showToast("Die PDF-Seite konnte nicht dargestellt werden."));
    }, fitToViewport ? 0 : 140);
    return () => window.clearTimeout(timer);
  }, [pageNumber, pdfDocument, renderPage, renderQualityRevision, showToast, zoom]);

  useEffect(() => () => {
    renderGenerationRef.current += 1;
    renderTask.current?.cancel();
  }, [pageNumber, pdfDocument]);

  useEffect(() => {
    let resizeTimer = 0;
    const refreshRenderQuality = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => setRenderQualityRevision((current) => current + 1), 120);
    };
    window.addEventListener("resize", refreshRenderQuality);
    window.visualViewport?.addEventListener("resize", refreshRenderQuality);
    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", refreshRenderQuality);
      window.visualViewport?.removeEventListener("resize", refreshRenderQuality);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "Escape") cancelDrawing();
      if (event.key === "Enter" && drawingPoints.length) finishDrawing();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
      if ((event.metaKey || event.ctrlKey) && ["+", "=", "-", "0"].includes(event.key)) {
        event.preventDefault();
        if (event.key === "0") applyZoom(1);
        else applyZoom(zoom + (["+", "="].includes(event.key) ? .15 : -.15));
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        commitMeasurements((current) => current.filter((measurement) => measurement.id !== selectedId));
        setSelectedId(null);
      }
      if (event.key === "Backspace" && drawingPoints.length) {
        event.preventDefault();
        setDrawingPoints((points) => points.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function loadPdf(file: File, restoredState?: StoredProjectState, selectedFileNames: string[] = [file.name]) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Bitte eine PDF-Datei auswählen.");
      return;
    }
    setIsLoading(true);
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const sourceBytes = new Uint8Array(await file.arrayBuffer());
      const document = (await pdfjs.getDocument({ data: sourceBytes.slice() }).promise) as unknown as PdfDocument;
      const inspection = await inspectPdfPages(document);
      const detectedPlanScales = inspection.scales;
      const detectedPageKinds = inspection.kinds;
      const allPages = Array.from({ length: document.numPages }, (_, index) => index + 1);
      const classifiedFloorPlans = allPages.filter((page) => detectedPageKinds[page] === "Grundriss");
      const dimensionedPlanPages = allPages.filter((page) => (
        detectedPageKinds[page] === "Planseite" && inspection.dimensionCounts[page] >= 3
      ));
      const suggestedPages = classifiedFloorPlans.length
        ? classifiedFloorPlans
        : dimensionedPlanPages.length
          ? dimensionedPlanPages
          : [1];
      const scaleDenominators = Object.fromEntries(
        allPages.map((page) => [page, detectedPlanScales[page] ?? 0]),
      ) as Record<number, number>;
      const detectedPages = Object.fromEntries(
        allPages.map((page) => [page, Boolean(detectedPlanScales[page])]),
      ) as Record<number, boolean>;
      const detectedCount = allPages.filter((page) => detectedPages[page]).length;
      sourcePdfBytesRef.current = sourceBytes;
      pdfNeedsUploadRef.current = !restoredState;
      setPdfDocument(document);
      pdfTextItemsRef.current = inspection.textItems;
      setFileName(file.name);
      setSourceFileNames(restoredState?.sourceFileNames?.length ? restoredState.sourceFileNames : selectedFileNames);
      if (!restoredState) {
        const suggestedTitle = file.name.replace(/\.pdf$/i, "").trim();
        setMeta((current) => !current.title.trim() && suggestedTitle
          ? { ...current, title: suggestedTitle, updatedAt: new Date().toISOString() }
          : current);
      }
      setPageCount(document.numPages);
      setPageNumber(1);
      setZoom(1);
      setSelectedId(null);
      setTool("select");
      setAutoSummary(null);
      setAutoScaleDenominators(scaleDenominators);
      setAutoScaleDetectedPages(detectedPages);
      setAutoPageKinds(detectedPageKinds);
      setAutoDimensionCounts(inspection.dimensionCounts);
      setAutoScaleSource("pdf");
      if (restoredState) {
        panoramaFilesRef.current.clear();
        panoramaObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        panoramaObjectUrlsRef.current.clear();
        setMeta(restoredState.meta);
        setIncludedPages(restoredState.includedPages?.length ? restoredState.includedPages : allPages);
        setScales(restoredState.scales ?? {});
        setMeasurements(normalizeMeasurementColors(normalizeLegacyPdfRoomGeometry(Array.isArray(restoredState.measurements) ? restoredState.measurements : [])));
        setMaterials(restoredState.materials ? cloneMaterials(restoredState.materials) : cloneMaterials());
        setPanoramas(restoredState.panoramas ?? []);
        setAutoRoomHeight(restoredState.autoSettings?.roomHeight ?? 2.5);
        setAutoMinRoomArea(restoredState.autoSettings?.minRoomArea ?? 1);
        setAutoIncludeWalls(restoredState.autoSettings?.includeWalls ?? true);
        setAutoIncludeCeiling(restoredState.autoSettings?.includeCeiling ?? true);
        setAutoIncludeFloor(restoredState.autoSettings?.includeFloor ?? false);
        setAutoIncludeSkirting(restoredState.autoSettings?.includeSkirting ?? false);
        setProjectStatus(restoredState.status ?? "draft");
        setProjectSaveState("saved");
        setShowAutoModal(false);
        showToast("Projekt und zugehörige Grundriss-PDF wurden geladen.");
      } else {
        setIncludedPages(suggestedPages.length ? suggestedPages : allPages);
        setScales({});
        setMeasurements((current) => current.filter((measurement) => ["insta360-reference", "laser-reference", "special-geometry", "freehand-sketch"].includes(measurement.areaSource ?? "")));
        setProjectStatus("draft");
        setProjectSaveState("idle");
        setShowAutoModal(true);
        const fileSummary = selectedFileNames.length > 1 ? `${selectedFileNames.length} PDF-Dateien zusammengeführt · ` : "";
        showToast(detectedCount === document.numPages
          ? `${fileSummary}${suggestedPages.length} relevante ${suggestedPages.length === 1 ? "Seite" : "Seiten"} vorausgewählt.`
          : `${fileSummary}${suggestedPages.length} Plan-${suggestedPages.length === 1 ? "Seite" : "Seiten"} vorausgewählt, Maßstab bitte prüfen.`);
      }
    } catch (error) {
      console.error("PDF öffnen", error);
      showToast("Die PDF konnte nicht geöffnet werden.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPdfSelection(selectedFiles: File[]) {
    const files = selectedFiles.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (!files.length) {
      showToast("Bitte mindestens eine PDF-Datei auswählen.");
      return;
    }
    if (files.length !== selectedFiles.length) {
      showToast("Es können nur PDF-Dateien gemeinsam geladen werden.");
      return;
    }
    if (files.length === 1) {
      await loadPdf(files[0], undefined, [files[0].name]);
      return;
    }

    setIsLoading(true);
    try {
      const { PDFDocument: PdfLibDocument } = await import("pdf-lib");
      const merged = await PdfLibDocument.create();
      for (const file of files) {
        const source = await PdfLibDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      }
      const bytes = await merged.save({ useObjectStreams: true });
      const firstName = files[0].name.replace(/\.pdf$/i, "").trim() || "Grundriss";
      const mergedName = `${firstName} + ${files.length - 1} weitere.pdf`;
      await loadPdf(new File([bytes], mergedName, { type: "application/pdf" }), undefined, files.map((file) => file.name));
    } catch (error) {
      console.error("PDF-Dateien zusammenführen", error);
      showToast("Die ausgewählten PDF-Dateien konnten nicht gemeinsam geöffnet werden.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length) void loadPdfSelection(files);
    event.target.value = "";
  }

  function openPdfSelection() {
    if (pdfDocument && measurements.length) {
      const proceed = window.confirm("Neue PDF-Dateien öffnen? Automatisch erkannte und manuell im Plan gesetzte Positionen werden für den neuen Plansatz zurückgesetzt.");
      if (!proceed) return;
    }
    fileInputRef.current?.click();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length) void loadPdfSelection(files);
  }

  async function runAutoMeasurement() {
    if (!pdfDocument) return;
    if (!autoIncludeWalls && !autoIncludeCeiling && !autoIncludeFloor && !autoIncludeSkirting) {
      showToast("Bitte mindestens eine Mengenart auswählen.");
      return;
    }
    if (!Number.isFinite(autoRoomHeight) || autoRoomHeight <= 0) {
      showToast("Bitte eine gültige Raumhöhe eingeben.");
      return;
    }
    if (autoScaleSource === "calibrated" && !pageScale) {
      setShowAutoModal(false);
      setTool("calibrate");
      showToast("Für das Auto-Aufmaß zuerst zwei Punkte einer bekannten Strecke anklicken.");
      return;
    }

    const targetPages = autoScaleSource === "calibrated"
      ? [pageNumber]
      : [...includedPages].sort((left, right) => left - right);
    if (!targetPages.length) {
      showToast("Bitte mindestens eine PDF-Seite für das Aufmaß auswählen.");
      return;
    }
    if (autoScaleSource === "pdf") {
      const missingScalePage = targetPages.find((page) => !Number.isFinite(autoScaleDenominators[page]) || autoScaleDenominators[page] <= 0);
      if (missingScalePage) {
        showToast(`Bitte den Planmaßstab für Seite ${missingScalePage} eingeben.`);
        return;
      }
    }
    setIsAutoDetecting(true);
    setAutoProgress("Grundriss wird vorbereitet …");

    try {
      const generated: Measurement[] = [];
      const generatedScales: Record<number, number> = {};
      let detectedArea = 0;
      let processedPages = 0;
      let nrfRoomCount = 0;
      let dimensionRoomCount = 0;
      let geometryReviewRoomCount = 0;
      let detectedRoomHeightCount = 0;
      const failedPages: number[] = [];
      const skippedDrawingPages: number[] = [];

      for (let pageIndex = 0; pageIndex < targetPages.length; pageIndex += 1) {
        const currentPageNumber = targetPages[pageIndex];
        setAutoProgress(`Räume werden erkannt · Seite ${pageIndex + 1} von ${targetPages.length}`);
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        try {
          if (["Schnitt", "Ansicht"].includes(autoPageKinds[currentPageNumber])) {
            skippedDrawingPages.push(currentPageNumber);
            continue;
          }

          const page = await pdfDocument.getPage(currentPageNumber);
          const unscaled = page.getViewport({ scale: 1 });
          const targetWidth = Math.min(1180, Math.max(760, unscaled.width * 1.55));
          const baseScale = targetWidth / unscaled.width;
          const fullViewport = page.getViewport({ scale: baseScale });
          const highPrecisionAnalysisWidth = window.innerWidth >= 900 ? 1600 : 1180;
          const analysisScale = Math.max(1, Math.min(1.6, highPrecisionAnalysisWidth / fullViewport.width));
          const analysisViewport = page.getViewport({ scale: baseScale * analysisScale });
          const metersPerCssPixel = autoScaleSource === "calibrated"
            ? scales[currentPageNumber]
            : autoScaleDenominators[currentPageNumber] * 0.0254 / 72 / baseScale;
          if (!metersPerCssPixel) {
            failedPages.push(currentPageNumber);
            continue;
          }
          const metersPerAnalysisPixel = metersPerCssPixel / analysisScale;
          const imageWidth = Math.max(1, Math.floor(analysisViewport.width));
          const imageHeight = Math.max(1, Math.floor(analysisViewport.height));

          let items = pdfTextItemsRef.current[currentPageNumber] ?? [];
          if (!items.length) {
            try {
              items = (await page.getTextContent?.())?.items ?? [];
              pdfTextItemsRef.current[currentPageNumber] = items;
            } catch {
              items = [];
            }
          }
          const drawingAnchors = extractPdfDrawingAnchors(items, analysisViewport);
          const pdfRoomLabels = extractPdfRoomLabelsFromItems(items, analysisViewport)
            .filter((label) => label.area >= Math.max(0.25, autoMinRoomArea))
            .filter((label) => pointBelongsToFloorPlanRegion(label.anchor, drawingAnchors, imageWidth, imageHeight));
          const pdfDimensions = extractPdfDimensions(items, analysisViewport)
            .filter((dimension) => pointBelongsToFloorPlanRegion(dimension.anchor, drawingAnchors, imageWidth, imageHeight));
          const pdfRoomHeights = extractPdfRoomHeights(items, analysisViewport)
            .filter((height) => pointBelongsToFloorPlanRegion(height.anchor, drawingAnchors, imageWidth, imageHeight));
          const pdfRoomAnchors = pdfRoomLabels.length ? [] : extractPdfRoomAnchors(items, analysisViewport)
            .filter((anchor) => !/\b(?:Freisitz|Balkon|Terrasse|Loggia|Außenbereich)\b|^ca\.?\s*:/i.test(anchor.name))
            .filter((anchor) => pointBelongsToFloorPlanRegion(anchor.anchor, drawingAnchors, imageWidth, imageHeight));

          let detectedRooms: ReturnType<typeof detectEnclosedRooms> = [];
          try {
            const analysisCanvas = document.createElement("canvas");
            analysisCanvas.width = imageWidth;
            analysisCanvas.height = imageHeight;
            const analysisContext = analysisCanvas.getContext("2d", { willReadFrequently: true })
              ?? analysisCanvas.getContext("2d");
            if (!analysisContext) throw new Error("Canvas-Kontext nicht verfügbar");
            analysisContext.fillStyle = "#ffffff";
            analysisContext.fillRect(0, 0, imageWidth, imageHeight);
            await page.render({ canvasContext: analysisContext, viewport: analysisViewport }).promise;
            erasePdfTextItemsFromCanvas(items, analysisViewport, analysisContext);
            const image = analysisContext.getImageData(0, 0, imageWidth, imageHeight);
            const roomCandidates = [0.45, 0.6, 0.72].map((gapClosureMeters) => filterRoomsToFloorPlanRegions(
              detectEnclosedRooms(
                image.data,
                image.width,
                image.height,
                {
                  metersPerPixel: metersPerAnalysisPixel,
                  minArea: Math.max(0.25, autoMinRoomArea),
                  gapClosureMeters,
                },
              ),
              drawingAnchors,
              image.width,
              image.height,
            ));
            detectedRooms = pdfRoomLabels.length
              ? combinePdfRoomCandidateSets(roomCandidates)
              : roomCandidates.sort((left, right) => {
                const area = (rooms: typeof left) => rooms.reduce((sum, room) => sum + room.pixelArea, 0);
                return area(right) - area(left) || right.length - left.length;
              })[0] ?? [];
            analysisCanvas.width = 1;
            analysisCanvas.height = 1;
          } catch {
            // Digital NRF labels can still produce a complete floor/ceiling
            // takeoff when raster geometry is unavailable on the device.
          }

          const matchedRooms = pdfRoomLabels.length
            ? matchPdfRoomsToGeometry(
              pdfRoomLabels,
              detectedRooms,
              metersPerAnalysisPixel,
            )
            : [];
          const dimensionAdjustedRooms = !matchedRooms.length
            ? detectedRooms.map((room) => adjustRoomToPdfDimensions(
              room,
              pdfDimensions,
              metersPerAnalysisPixel,
              imageWidth,
              imageHeight,
            ))
            : [];
          const namedDimensionRooms = pdfRoomAnchors.length
            ? attachPdfRoomNames(dimensionAdjustedRooms, pdfRoomAnchors, metersPerAnalysisPixel)
            : dimensionAdjustedRooms;
          const pageRooms = matchedRooms.length
            ? matchedRooms
            : namedDimensionRooms;
          if (!pageRooms.length) {
            failedPages.push(currentPageNumber);
            continue;
          }

          generatedScales[currentPageNumber] = metersPerCssPixel;
          processedPages += 1;
          pageRooms.forEach((room, roomIndex) => {
            const exactLabelRoom = "area" in room;
            const usesDimensions = "dimensionMatches" in room && room.dimensionMatches > 0;
            const roomReference = "reference" in room && typeof room.reference === "string" ? room.reference : "";
            const roomArea = exactLabelRoom
              ? room.area
              : room.pixelArea * metersPerAnalysisPixel * metersPerAnalysisPixel;
            const geometryStatus = exactLabelRoom && "geometryStatus" in room ? room.geometryStatus : undefined;
            const hasUsableRoomContour = !exactLabelRoom || geometryStatus === "matched";
            const detectedRoomHeight = selectPdfRoomHeight(room, pdfRoomHeights, metersPerAnalysisPixel);
            detectedArea += roomArea;
            if (exactLabelRoom) nrfRoomCount += 1;
            else if (usesDimensions) dimensionRoomCount += 1;
            if (exactLabelRoom && !hasUsableRoomContour) geometryReviewRoomCount += 1;
            if (detectedRoomHeight) detectedRoomHeightCount += 1;
            generated.push({
              id: createId("auto-room"),
              kind: "room",
              name: exactLabelRoom
                ? `${roomReference ? `${roomReference} · ` : ""}${room.name}`
                : "name" in room
                  ? `${roomReference ? `${roomReference} · ` : ""}${String(room.name)}`
                : pageCount > 1
                  ? `Raum ${currentPageNumber}.${String(roomIndex + 1).padStart(2, "0")}`
                  : `Raum ${String(roomIndex + 1).padStart(2, "0")}`,
              page: currentPageNumber,
              points: room.points.map((point) => ({ x: point.x / analysisScale, y: point.y / analysisScale })),
              color: nextRoomColor([...measurements, ...generated]),
              height: detectedRoomHeight?.value ?? autoRoomHeight,
              heightSource: detectedRoomHeight ? "pdf-room" : "project-default",
              heightNote: detectedRoomHeight
                ? `Automatisch aus der Grundrissangabe „${detectedRoomHeight.raw}“ erkannt.`
                : `Keine eindeutige Höhenangabe im Raum gefunden; Standardhöhe ${formatNumber(autoRoomHeight)} m verwendet.`,
              quantity: 1,
              factor: 1,
              includeFloor: autoIncludeFloor,
              includeCeiling: autoIncludeCeiling,
              includeWalls: hasUsableRoomContour ? autoIncludeWalls : false,
              includeSkirting: hasUsableRoomContour ? autoIncludeSkirting : false,
              requestedIncludeWalls: exactLabelRoom && !hasUsableRoomContour ? autoIncludeWalls : undefined,
              requestedIncludeSkirting: exactLabelRoom && !hasUsableRoomContour ? autoIncludeSkirting : undefined,
              openings: [],
              source: "auto",
              areaOverride: exactLabelRoom ? room.area : undefined,
              perimeterOverride: exactLabelRoom ? room.perimeter : usesDimensions && "perimeterMeters" in room ? room.perimeterMeters : undefined,
              geometryStatus: exactLabelRoom ? geometryStatus : undefined,
              geometryNote: exactLabelRoom && "geometryReason" in room ? room.geometryReason : undefined,
              labelAnchor: exactLabelRoom && "anchor" in room
                ? { x: room.anchor.x / analysisScale, y: room.anchor.y / analysisScale }
                : undefined,
              areaSource: exactLabelRoom ? "pdf-nrf" : usesDimensions ? "pdf-dimensions" : "pdf-scale",
              confidence: room.confidence,
              visible: true,
              createdAt: new Date().toISOString(),
            });
          });
        } catch (error) {
          console.error(`Auto-Aufmaß Seite ${currentPageNumber}`, error);
          failedPages.push(currentPageNumber);
        }
      }

      if (!generated.length) {
        const pageHint = failedPages.length ? ` auf Seite ${failedPages.join(", ")}` : "";
        showToast(`Keine auswertbare Raumgeometrie${pageHint} erkannt. Maßstab prüfen oder Seite kalibrieren.`);
        return;
      }

      const targetPageSet = new Set(targetPages);
      setScales((current) => ({ ...current, ...generatedScales }));
      commitMeasurements((current) => [
        ...current.filter((measurement) => !(measurement.source === "auto" && targetPageSet.has(measurement.page))),
        ...generated,
      ]);
      setSelectedId(null);
      setExpandedId(null);
      setListMode("positions");
      setTool("select");
      setAutoSummary({
        rooms: generated.length,
        pages: processedPages,
        area: detectedArea,
        method: nrfRoomCount ? "nrf" : dimensionRoomCount ? "dimensions" : "geometry",
        reviewRooms: geometryReviewRoomCount,
        roomHeights: detectedRoomHeightCount,
      });
      setShowAutoModal(false);
      setMaterialInputsConfirmed(false);
      setShowExcelModal(true);
      const sourceText = nrfRoomCount
        ? `${nrfRoomCount} NRF-Flächen übernommen`
        : dimensionRoomCount
          ? `${dimensionRoomCount} Räume an PDF-Maße angepasst`
          : `${generated.length} Räume aus Planmaßstab ermittelt`;
      const warning = failedPages.length || skippedDrawingPages.length
        ? ` · nicht ausgewertet: ${[...new Set([...failedPages, ...skippedDrawingPages])].join(", ")}`
        : "";
      const geometryWarning = geometryReviewRoomCount
        ? ` · ${geometryReviewRoomCount} Kontur${geometryReviewRoomCount === 1 ? "" : "en"} manuell prüfen; Wand/Sockel noch nicht berechnet`
        : "";
      const heightSummary = detectedRoomHeightCount
        ? ` · ${detectedRoomHeightCount} Raumhöhe${detectedRoomHeightCount === 1 ? "" : "n"} aus PDF erkannt`
        : " · keine eindeutige Raumhöhe im Grundriss; Standardwert verwendet";
      showToast(`${sourceText}${heightSummary}${geometryWarning} · Excel vorbereitet${warning}`);
    } catch (error) {
      console.error("Auto-Aufmaß", error);
      showToast("Das Auto-Aufmaß wurde beendet. Bitte Maßstab und Seitenauswahl prüfen.");
    } finally {
      setIsAutoDetecting(false);
      setAutoProgress("");
    }
  }

  function pointFromClient(clientX: number, clientY: number): Point {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) / zoom,
      y: (clientY - rect.top) / zoom,
    };
  }

  function pointFromEvent(event: ReactPointerEvent<SVGSVGElement>): Point {
    return pointFromClient(event.clientX, event.clientY);
  }

  function saveGeometryCorrection(points: Point[]) {
    if (!geometryEditingId) return false;
    const target = measurements.find((measurement) => measurement.id === geometryEditingId);
    if (!target || target.kind !== "room" || points.length < 3) {
      showToast("Die Raumkontur konnte nicht gespeichert werden. Bitte erneut auswählen.");
      return false;
    }
    commitMeasurements((current) => current.map((measurement) => measurement.id === geometryEditingId
      ? {
        ...measurement,
        points: points.map((point) => ({ ...point })),
        labelAnchor: polygonCentroid(points),
        perimeterOverride: undefined,
        geometryStatus: "manual",
        geometryNote: "Raumkontur wurde manuell im PDF-Grundriss verschoben oder an ihren Eckpunkten korrigiert.",
        confidence: 1,
        includeWalls: measurement.requestedIncludeWalls ?? measurement.includeWalls,
        includeSkirting: measurement.requestedIncludeSkirting ?? measurement.includeSkirting,
        requestedIncludeWalls: undefined,
        requestedIncludeSkirting: undefined,
      }
      : measurement));
    setDrawingPoints([]);
    geometryDragRef.current = null;
    setGeometryEditingId(null);
    setTool("select");
    setSelectedId(target.id);
    setExpandedId(target.id);
    showToast(`${target.name}: Kontur übernommen; Umfang und Wandansatz werden neu berechnet.`);
    return true;
  }

  function startGeometryCorrection(measurement: Measurement) {
    if (measurement.kind !== "room") return;
    if (measurement.page !== pageNumber) changePage(measurement.page);
    const existingPoints = validOutlinePoints(measurement.points);
    setGeometryEditingId(measurement.id);
    setDrawingPoints(existingPoints.length >= 3 ? existingPoints.map((point) => ({ ...point })) : []);
    setCursorPoint(null);
    setSelectedId(measurement.id);
    setExpandedId(measurement.id);
    setTool("room");
    showToast(existingPoints.length >= 3
      ? `${measurement.name}: Konturfläche verschieben oder einzelne Eckpunkte ziehen; danach „Abschließen“ wählen.`
      : `${measurement.name}: Raumecken im Grundriss anklicken und anschließend „Abschließen“ wählen.`);
  }

  function beginGeometryDrag(event: ReactPointerEvent<SVGElement>, mode: GeometryDrag["mode"], vertexIndex?: number) {
    if (!geometryEditingId || drawingPoints.length < 3 || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    geometryDragRef.current = {
      pointerId: event.pointerId,
      mode,
      vertexIndex,
      origin: pointFromClient(event.clientX, event.clientY),
      startPoints: drawingPoints.map((point) => ({ ...point })),
    };
    overlayRef.current?.setPointerCapture(event.pointerId);
  }

  function continueGeometryDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = geometryDragRef.current;
    const current = pointFromEvent(event);
    setCursorPoint(current);
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const clamped = (value: number, maximum: number) => Math.max(0, Math.min(maximum, value));
    if (drag.mode === "vertex" && drag.vertexIndex !== undefined) {
      setDrawingPoints(drag.startPoints.map((point, index) => index === drag.vertexIndex
        ? { x: clamped(current.x, stageSize.width), y: clamped(current.y, stageSize.height) }
        : point));
      return;
    }

    const minimumX = Math.min(...drag.startPoints.map((point) => point.x));
    const maximumX = Math.max(...drag.startPoints.map((point) => point.x));
    const minimumY = Math.min(...drag.startPoints.map((point) => point.y));
    const maximumY = Math.max(...drag.startPoints.map((point) => point.y));
    const requestedX = current.x - drag.origin.x;
    const requestedY = current.y - drag.origin.y;
    const offsetX = Math.max(-minimumX, Math.min(stageSize.width - maximumX, requestedX));
    const offsetY = Math.max(-minimumY, Math.min(stageSize.height - maximumY, requestedY));
    setDrawingPoints(drag.startPoints.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY })));
  }

  function endGeometryDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (geometryDragRef.current?.pointerId !== event.pointerId) return;
    geometryDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleStagePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const point = pointFromEvent(event);

    if (tool === "select") {
      setSelectedId(null);
      return;
    }

    if (geometryEditingId && drawingPoints.length >= 3) return;

    if (tool === "calibrate") {
      const next = [...calibrationPoints, point];
      setCalibrationPoints(next);
      if (next.length === 2) {
        setCalibrationDistance("5.00");
        setShowCalibrationModal(true);
      }
      return;
    }

    if (tool === "opening") {
      const rooms = measurements.filter((measurement) => measurement.kind === "room" && measurement.page === pageNumber);
      if (!rooms.length) {
        showToast("Lege zuerst einen Raum an, dem der Abzug zugeordnet wird.");
        return;
      }
      setPendingOpeningPoint(point);
      return;
    }

    if (tool === "count") {
      setPendingGeometry({ kind: "count", points: [point] });
      return;
    }

    const isPolygon = tool === "room" || tool === "area";
    if (isPolygon && drawingPoints.length >= 3 && distance(point, drawingPoints[0]) * zoom < 14) {
      if (!(tool === "room" && saveGeometryCorrection(drawingPoints))) {
        setPendingGeometry({ kind: tool, points: drawingPoints });
        setDrawingPoints([]);
      }
      return;
    }
    setDrawingPoints((points) => [...points, point]);
  }

  function finishDrawing() {
    if (tool === "room" || tool === "area") {
      if (drawingPoints.length < 3) {
        showToast("Für eine Fläche werden mindestens drei Punkte benötigt.");
        return;
      }
      if (tool === "room" && saveGeometryCorrection(drawingPoints)) return;
      setPendingGeometry({ kind: tool, points: drawingPoints });
      setDrawingPoints([]);
      return;
    }
    if (tool === "line") {
      if (drawingPoints.length < 2) {
        showToast("Für eine Länge werden mindestens zwei Punkte benötigt.");
        return;
      }
      setPendingGeometry({ kind: "line", points: drawingPoints });
      setDrawingPoints([]);
    }
  }

  function saveCalibration() {
    const known = Number(calibrationDistance.replace(",", "."));
    if (!Number.isFinite(known) || known <= 0 || calibrationPoints.length !== 2) return;
    const pixels = distance(calibrationPoints[0], calibrationPoints[1]);
    setScales((current) => ({ ...current, [pageNumber]: known / pixels }));
    setShowCalibrationModal(false);
    setCalibrationPoints([]);
    if (resumeAutoAfterCalibration) {
      setResumeAutoAfterCalibration(false);
      setAutoScaleSource("calibrated");
      setIncludedPages([pageNumber]);
      setShowAutoModal(true);
      setTool("select");
      showToast(`Seite ${pageNumber} ist kalibriert · Auto-Aufmaß kann starten.`);
    } else {
      setTool("room");
      showToast(`Seite ${pageNumber} ist kalibriert – du kannst jetzt messen.`);
    }
  }

  function saveMeasurement(values: {
    name: string;
    height: number;
    quantity: number;
    factor: number;
    includeFloor: boolean;
    includeCeiling: boolean;
    includeWalls: boolean;
    includeSkirting: boolean;
    category: string;
  }) {
    if (!pendingGeometry) return;
    const kind = pendingGeometry.kind;
    const measurement: Measurement = {
      id: createId(kind),
      kind,
      name: values.name,
      page: pageNumber,
      points: pendingGeometry.points,
      color: kind === "room" ? nextRoomColor(measurements) : measurementColor(kind),
      height: kind === "room" ? values.height : undefined,
      heightSource: kind === "room" ? "manual" : undefined,
      heightNote: kind === "room" ? "Raumhöhe bei der manuellen Erfassung eingetragen." : undefined,
      quantity: values.quantity,
      factor: values.factor,
      includeFloor: kind === "room" ? values.includeFloor : undefined,
      includeCeiling: kind === "room" ? values.includeCeiling : undefined,
      includeWalls: kind === "room" ? values.includeWalls : undefined,
      includeSkirting: kind === "room" ? values.includeSkirting : undefined,
      areaCategory: kind === "area" ? values.category : undefined,
      lineCategory: kind === "line" ? values.category : undefined,
      openings: kind === "room" ? [] : undefined,
      source: "manual",
      visible: true,
      createdAt: new Date().toISOString(),
    };
    commitMeasurements((current) => [...current, measurement]);
    setSelectedId(measurement.id);
    setExpandedId(measurement.id);
    setPendingGeometry(null);
    showToast(`${values.name} wurde ins Aufmaß übernommen.`);
  }

  function saveOpening(values: {
    roomId: string;
    name: string;
    width: number;
    height: number;
    quantity: number;
    mode: Opening["mode"];
    openingKind: NonNullable<Opening["openingKind"]>;
    revealDepth: number;
  }) {
    if (!pendingOpeningPoint) return;
    const opening: Opening = {
      id: createId("opening"),
      name: values.name,
      width: values.width,
      height: values.height,
      quantity: values.quantity,
      mode: values.mode,
      openingKind: values.openingKind,
      revealDepth: values.revealDepth,
      marker: pendingOpeningPoint,
    };
    commitMeasurements((current) =>
      current.map((measurement) =>
        measurement.id === values.roomId
          ? { ...measurement, openings: [...(measurement.openings ?? []), opening] }
          : measurement,
      ),
    );
    setSelectedId(values.roomId);
    setExpandedId(values.roomId);
    setPendingOpeningPoint(null);
    showToast("Abzug wurde geprüft und dem Raum zugeordnet.");
  }

  function updateMeasurement(id: string, patch: Partial<Measurement>) {
    commitMeasurements((current) =>
      current.map((measurement) => (measurement.id === id ? { ...measurement, ...patch } : measurement)),
    );
  }

  function removeMeasurement(id: string) {
    commitMeasurements((current) => current.filter((measurement) => measurement.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function removeOpening(roomId: string, openingId: string) {
    commitMeasurements((current) =>
      current.map((measurement) =>
        measurement.id === roomId
          ? { ...measurement, openings: (measurement.openings ?? []).filter((opening) => opening.id !== openingId) }
          : measurement,
      ),
    );
  }

  function exportCsv() {
    if (!rows.length) {
      showToast("Es sind noch keine Aufmaßpositionen vorhanden.");
      return;
    }
    downloadBlob(buildCsv(meta, rows), `${safeFileName(meta.title)}.csv`, "text/csv;charset=utf-8");
  }

  function openExcelExport() {
    if (!rows.length) {
      showToast(includedPages.length ? "Auf den ausgewählten Seiten sind noch keine Aufmaßpositionen vorhanden." : "Bitte eine PDF-Seite oder ein Insta360-Aufmaß erfassen.");
      return;
    }
    setMaterialInputsConfirmed(false);
    setShowExcelModal(true);
  }

  function openAudit() {
    if (!rows.length) {
      showToast(includedPages.length ? "Auf den ausgewählten Seiten sind noch keine Aufmaßpositionen vorhanden." : "Bitte zuerst ein PDF- oder Insta360-Aufmaß erfassen.");
      return;
    }
    setShowAuditModal(true);
  }

  async function exportAuditExcel() {
    if (!rows.length) {
      showToast("Es sind noch keine Aufmaßpositionen für die Prüfung vorhanden.");
      return;
    }
    setIsExportingAudit(true);
    try {
      const file = await buildAuditExcel({
        meta,
        fileName,
        pageCount,
        selectedPages: [...includedPages].sort((left, right) => left - right),
        rows,
        measurements: includedMeasurements,
        scales,
        status: projectStatus,
      });
      downloadBlob(file, `${safeFileName(meta.title)}-Pruefaufmass.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      showToast("Die Prüf-Excel wurde erstellt.");
    } catch {
      showToast("Die Prüf-Excel konnte nicht erstellt werden.");
    } finally {
      setIsExportingAudit(false);
    }
  }

  async function exportAuditPdf() {
    if (!rows.length) {
      showToast("Es sind noch keine Aufmaßpositionen für den PDF-Prüfbericht vorhanden.");
      return;
    }
    setIsExportingPdf(true);
    try {
      const file = await buildAuditPdf({
        meta,
        fileName,
        pageCount,
        selectedPages: [...includedPages].sort((left, right) => left - right),
        rows,
        measurements: includedMeasurements,
        scales,
        status: projectStatus,
        sourcePdfBytes: sourcePdfBytesRef.current,
      });
      downloadBlob(file, `${safeFileName(meta.title)}-Pruefaufmass.pdf`, "application/pdf");
      showToast("Der PDF-Prüfbericht mit farbigen Plananlagen wurde erstellt.");
    } catch {
      showToast("Der PDF-Prüfbericht konnte nicht erstellt werden.");
    } finally {
      setIsExportingPdf(false);
    }
  }

  function inspectMeasurement(measurement: Measurement) {
    if (measurement.areaSource === "insta360-reference") {
      setShowAuditModal(false);
      setShowInsta360(true);
      return;
    }
    if (measurement.areaSource === "laser-reference" || measurement.areaSource === "special-geometry") {
      setShowAuditModal(false);
      openProfessional(measurement.areaSource === "laser-reference" ? "laser" : "special");
      return;
    }
    if (measurement.areaSource === "freehand-sketch") {
      showToast(`Skizzennachweis · ${measurement.proCapture?.formula || "Kontrollmaß und Raumform prüfen"}`);
      return;
    }
    setPageNumber(measurement.page);
    setDrawingPoints([]);
    setCalibrationPoints([]);
    setZoom(1);
    setSelectedId(measurement.id);
    setExpandedId(measurement.id);
    setListMode("positions");
    setShowAuditModal(false);
  }

  async function exportExcel() {
    if (!materialInputsConfirmed) {
      showToast("Bitte die Materialangaben vor dem Export bestätigen.");
      return;
    }
    const positive = (value: number) => Number.isFinite(value) && value > 0;
    if (materials.paint.enabled) {
      const validRate = materials.paint.mode === "coverage" ? positive(materials.paint.coverage) : positive(materials.paint.consumption);
      if (!materials.paint.name.trim() || !validRate || !positive(materials.paint.coats) || !positive(materials.paint.containerSize)) {
        showToast("Bitte Verbrauch, Anstriche und Gebindegröße der Farbe vollständig eingeben.");
        return;
      }
      if (!materials.paint.includeWalls && !materials.paint.includeCeilings) {
        showToast("Bitte für die Farbe Wand- und/oder Deckenflächen auswählen.");
        return;
      }
      if (materialPreview.paint.area <= 0) {
        showToast("Im Aufmaß sind keine passenden Farbflächen vorhanden.");
        return;
      }
    }
    if (materials.filler.enabled) {
      if (!materials.filler.name.trim() || !positive(materials.filler.consumption) || !positive(materials.filler.thickness) || !positive(materials.filler.packageSize)) {
        showToast("Bitte Verbrauch, Schichtdicke und Gebindegröße der Spachtelmasse vollständig eingeben.");
        return;
      }
      if (!materials.filler.includeWalls && !materials.filler.includeCeilings) {
        showToast("Bitte für die Spachtelmasse Wand- und/oder Deckenflächen auswählen.");
        return;
      }
      if (materialPreview.filler.area <= 0) {
        showToast("Im Aufmaß sind keine passenden Spachtelflächen vorhanden.");
        return;
      }
    }
    if (materials.wallpaper.enabled) {
      if (!materials.wallpaper.name.trim() || !positive(materials.wallpaper.rollWidth) || !positive(materials.wallpaper.rollLength) || !positive(materials.wallpaper.allowance)) {
        showToast("Bitte Rollenbreite, Rollenlänge und Zugabe der Tapete vollständig eingeben.");
        return;
      }
      if (materials.wallpaper.match !== "none" && !positive(materials.wallpaper.repeat)) {
        showToast("Bei Tapete mit Ansatz bitte den Rapport eingeben.");
        return;
      }
      if (materialPreview.wallpaper.rooms <= 0) {
        showToast("Für die Tapetenberechnung werden Räume mit aktivierter Wandfläche benötigt.");
        return;
      }
    }

    setIsExportingExcel(true);
    try {
      const file = await buildArchitectExcel({ meta, fileName, pageCount, selectedPages: [...includedPages].sort((left, right) => left - right), rows, measurements: includedMeasurements, scales, materials, status: projectStatus });
      downloadBlob(file, `${safeFileName(meta.title)}-VOB-Aufmass.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      setShowExcelModal(false);
      showToast("Excel-Aufmaß und Materialbedarf wurden erstellt.");
    } catch {
      showToast("Die Excel-Datei konnte nicht erstellt werden.");
    } finally {
      setIsExportingExcel(false);
    }
  }

  function exportProject() {
    const data = storedProjectState(meta, projectStatus);
    downloadBlob(JSON.stringify(data, null, 2), `${safeFileName(meta.title)}.aufmass.json`, "application/json");
  }

  function storedProjectState(updatedMeta: ProjectMeta, status: ProjectStatus): StoredProjectState {
    return {
      version: 3,
      status,
      meta: updatedMeta,
      fileName,
      sourceFileNames,
      pageCount,
      includedPages,
      scales,
      measurements,
      materials: cloneMaterials(materials),
      panoramas,
      professional: { review: cloneReview(projectReview) },
      autoSettings: {
        roomHeight: autoRoomHeight,
        minRoomArea: autoMinRoomArea,
        includeWalls: autoIncludeWalls,
        includeCeiling: autoIncludeCeiling,
        includeFloor: autoIncludeFloor,
        includeSkirting: autoIncludeSkirting,
      },
    };
  }

  const loadProjectList = useCallback(async () => {
    setIsProjectsLoading(true);
    setProjectLibraryError("");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const body = await response.json() as { projects?: ProjectSummary[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Die Projektliste konnte nicht geladen werden.");
      setProjects(body.projects ?? []);
    } catch (error) {
      setProjectLibraryError(error instanceof Error ? error.message : "Die Projektliste konnte nicht geladen werden.");
    } finally {
      setIsProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProjectList(), 0);
    return () => window.clearTimeout(timer);
  }, [loadProjectList]);

  function openProjectLibrary() {
    setShowProjectLibrary(true);
    void loadProjectList();
  }

  async function saveProjectSnapshot(nextStatus: ProjectStatus = projectStatus) {
    if (isProjectSaving) return false;
    if (!meta.title.trim()) {
      setShowProject(true);
      showToast("Bitte zuerst eine Projektbezeichnung eingeben.");
      return false;
    }

    const baseUpdatedAt = meta.serverUpdatedAt ?? meta.updatedAt;
    const updated = { ...meta, title: meta.title.trim(), updatedAt: new Date().toISOString() };
    const state = storedProjectState(updated, nextStatus);
    try {
      window.localStorage.setItem("maleraufmass-pro-draft", JSON.stringify(state));
    } catch {
      // Die zentrale Projektablage bleibt auch bei vollem Gerätespeicher verfügbar.
    }
    setProjectSaveState("saving");
    try {
      const form = new FormData();
      form.append("state", JSON.stringify(state));
      form.append("baseUpdatedAt", baseUpdatedAt);
      if (sourcePdfBytesRef.current && pdfNeedsUploadRef.current) {
        form.append("pdf", new Blob([arrayBufferCopy(sourcePdfBytesRef.current)], { type: "application/pdf" }), fileName || "grundriss.pdf");
      }
      const response = await fetch("/api/projects", { method: "POST", body: form });
      const body = await response.json() as { project?: ProjectSummary; error?: string; code?: string };
      if (!response.ok || !body.project) throw new Error(body.error || "Das Projekt konnte nicht gespeichert werden.");
      const canonicalMeta: ProjectMeta = { ...updated, updatedAt: body.project.updatedAt, serverUpdatedAt: body.project.updatedAt };
      setMeta(canonicalMeta);
      setProjectStatus(nextStatus);
      setProjects((current) => [body.project!, ...current.filter((project) => project.id !== body.project!.id)]);
      pdfNeedsUploadRef.current = false;
      try {
        window.localStorage.setItem("maleraufmass-pro-draft", JSON.stringify(storedProjectState(canonicalMeta, nextStatus)));
      } catch {
        // Die zentrale Speicherung war erfolgreich; die lokale Zusatzsicherung ist optional.
      }
      for (const [panoramaId, panoramaFile] of panoramaFilesRef.current) {
        const panoramaResponse = await fetch(`/api/projects/${encodeURIComponent(updated.id)}/panoramas/${encodeURIComponent(panoramaId)}`, {
          method: "PUT",
          headers: {
            "Content-Type": panoramaFile.type || "image/jpeg",
            "X-Original-Filename": encodeURIComponent(panoramaFile.name),
          },
          body: panoramaFile,
        });
        if (!panoramaResponse.ok) {
          const panoramaError = await panoramaResponse.json().catch(() => ({ error: "Die 360°-Aufnahme konnte nicht gespeichert werden." })) as { error?: string };
          throw new Error(panoramaError.error || "Die 360°-Aufnahme konnte nicht gespeichert werden.");
        }
      }
      panoramaFilesRef.current.clear();
      setProjectSaveState("saved");
      showToast(nextStatus === "completed"
        ? "Projekt fertiggestellt - Aufmaß, PDF und 360°-Aufnahmen sind gespeichert."
        : "Projekt, Aufmaß, PDF und 360°-Aufnahmen wurden gespeichert.");
      return true;
    } catch (error) {
      setProjectSaveState("error");
      showToast(error instanceof Error ? `${error.message} Eine Gerätesicherung wurde angelegt.` : "Online-Speicherung fehlgeschlagen. Eine Gerätesicherung wurde angelegt.");
      return false;
    }
  }

  function restoreStoredStateWithoutPdf(state: StoredProjectState) {
    renderTask.current?.cancel();
    sourcePdfBytesRef.current = null;
    pdfNeedsUploadRef.current = false;
    panoramaFilesRef.current.clear();
    panoramaObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    panoramaObjectUrlsRef.current.clear();
    setPdfDocument(null);
    setMeta(state.meta);
    setFileName(state.fileName ?? "");
    setSourceFileNames(state.sourceFileNames?.length ? state.sourceFileNames : state.fileName ? [state.fileName] : []);
    setPageCount(state.pageCount ?? 0);
    setPageNumber(1);
    setIncludedPages(state.includedPages?.length ? state.includedPages : Array.from({ length: state.pageCount ?? 0 }, (_, index) => index + 1));
    setScales(state.scales ?? {});
    setMeasurements(normalizeMeasurementColors(normalizeLegacyPdfRoomGeometry(Array.isArray(state.measurements) ? state.measurements : [])));
    setMaterials(state.materials ? cloneMaterials(state.materials) : cloneMaterials());
    setPanoramas(state.panoramas ?? []);
    setProjectReview(state.professional?.review ? cloneReview(state.professional.review) : cloneReview());
    setAutoRoomHeight(state.autoSettings?.roomHeight ?? 2.5);
    setAutoMinRoomArea(state.autoSettings?.minRoomArea ?? 1);
    setAutoIncludeWalls(state.autoSettings?.includeWalls ?? true);
    setAutoIncludeCeiling(state.autoSettings?.includeCeiling ?? true);
    setAutoIncludeFloor(state.autoSettings?.includeFloor ?? false);
    setAutoIncludeSkirting(state.autoSettings?.includeSkirting ?? false);
    setProjectStatus(state.status ?? "draft");
    setProjectSaveState("saved");
    setSelectedId(null);
    setTool("select");
  }

  async function openStoredProject(project: ProjectSummary) {
    if (project.id !== meta.id && projectSaveState !== "saved" && (measurements.length || fileName || panoramas.length)) {
      const proceed = window.confirm("Das aktuelle Projekt enthält noch nicht gespeicherte Änderungen. Trotzdem ein anderes Projekt öffnen?");
      if (!proceed) return;
    }
    setIsProjectsLoading(true);
    setProjectLibraryError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, { cache: "no-store" });
      const body = await response.json() as StoredProjectResponse & { error?: string };
      if (!response.ok || !body.state) throw new Error(body.error || "Das Projekt konnte nicht geladen werden.");
      if (body.project.hasPdf) {
        const pdfResponse = await fetch(`/api/projects/${encodeURIComponent(project.id)}/pdf`, { cache: "no-store" });
        if (!pdfResponse.ok) {
          const pdfError = await pdfResponse.json().catch(() => ({ error: "Die Projekt-PDF konnte nicht geladen werden." })) as { error?: string };
          throw new Error(pdfError.error || "Die Projekt-PDF konnte nicht geladen werden.");
        }
        const pdfBlob = await pdfResponse.blob();
        await loadPdf(new File([pdfBlob], body.state.fileName || "grundriss.pdf", { type: "application/pdf" }), body.state);
      } else {
        restoreStoredStateWithoutPdf(body.state);
        showToast("Projekt geladen. Zu diesem Projekt ist noch keine Grundriss-PDF gespeichert.");
      }
      setProjectStatus(body.project.status);
      setShowProjectLibrary(false);
    } catch (error) {
      setProjectLibraryError(error instanceof Error ? error.message : "Das Projekt konnte nicht geladen werden.");
    } finally {
      setIsProjectsLoading(false);
    }
  }

  async function openStoredProjectVersion(project: ProjectSummary, revision: number) {
    setIsProjectsLoading(true);
    setProjectLibraryError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/versions/${revision}`, { cache: "no-store" });
      const body = await response.json() as { state?: StoredProjectState; error?: string };
      if (!response.ok || !body.state) throw new Error(body.error || "Die Projektversion konnte nicht geladen werden.");
      const restoredState: StoredProjectState = {
        ...body.state,
        status: "draft",
        professional: body.state.professional?.review ? { review: { ...body.state.professional.review, workflowStatus: "in-review", revision: Math.max(revision + 1, body.state.professional.review.revision ?? 1), releasedAt: "", releaseCode: "" } } : body.state.professional,
      };
      if (project.hasPdf) {
        const pdfResponse = await fetch(`/api/projects/${encodeURIComponent(project.id)}/pdf`, { cache: "no-store" });
        if (!pdfResponse.ok) throw new Error("Die zugehörige Projekt-PDF konnte nicht geladen werden.");
        const pdfBlob = await pdfResponse.blob();
        await loadPdf(new File([pdfBlob], restoredState.fileName || "grundriss.pdf", { type: "application/pdf" }), restoredState);
      } else {
        restoreStoredStateWithoutPdf(restoredState);
      }
      setProjectStatus("draft");
      setProjectSaveState("idle");
      setShowProjectLibrary(false);
      showToast(`Revision ${revision} wurde als neuer bearbeitbarer Entwurf geöffnet.`);
    } catch (error) {
      setProjectLibraryError(error instanceof Error ? error.message : "Die Projektversion konnte nicht geladen werden.");
    } finally {
      setIsProjectsLoading(false);
    }
  }

  function resetToNewProject() {
    renderTask.current?.cancel();
    undoStack.current = [];
    sourcePdfBytesRef.current = null;
    pdfNeedsUploadRef.current = false;
    panoramaFilesRef.current.clear();
    panoramaObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    panoramaObjectUrlsRef.current.clear();
    setMeta(createInitialMeta());
    setPdfDocument(null);
    setFileName("");
    setSourceFileNames([]);
    setPageCount(0);
    setPageNumber(1);
    setIncludedPages([]);
    setZoom(1);
    setScales({});
    setMeasurements([]);
    setMaterials(cloneMaterials());
    setMaterialInputsConfirmed(false);
    setPanoramas([]);
    setProjectReview(cloneReview());
    setSelectedId(null);
    setExpandedId(null);
    setEditingId(null);
    setGeometryEditingId(null);
    setTool("select");
    setDrawingPoints([]);
    setCursorPoint(null);
    setPendingGeometry(null);
    setPendingOpeningPoint(null);
    setCalibrationPoints([]);
    setCalibrationDistance("");
    setAutoSummary(null);
    setAutoScaleSource("pdf");
    setAutoScaleDenominators({});
    setAutoScaleDetectedPages({});
    setAutoPageKinds({});
    setAutoDimensionCounts({});
    setAutoRoomHeight(2.5);
    setAutoMinRoomArea(1);
    setAutoIncludeWalls(true);
    setAutoIncludeCeiling(true);
    setAutoIncludeFloor(false);
    setAutoIncludeSkirting(false);
    setResumeAutoAfterCalibration(false);
    setShowAutoModal(false);
    setProjectStatus("draft");
    setProjectSaveState("idle");
    setShowProjectLibrary(false);
    setShowProject(true);
    showToast("Neues Projekt angelegt. Jetzt Grundriss-PDF oder Insta360-Aufnahmen erfassen.");
  }

  function startNewProject() {
    if ((measurements.length || fileName || panoramas.length) && projectSaveState !== "saved") {
      const proceed = window.confirm("Das aktuelle Projekt enthält noch nicht gespeicherte Änderungen. Neues Projekt trotzdem beginnen?");
      if (!proceed) return;
    }
    resetToNewProject();
  }

  async function setStoredProjectArchived(project: ProjectSummary, archived: boolean) {
    if (archived && project.id === meta.id && projectSaveState !== "saved") {
      setProjectLibraryError(`„${project.title}“ enthält noch nicht gespeicherte Änderungen. Bitte zuerst speichern oder die Änderungen bewusst verwerfen.`);
      return;
    }
    setIsProjectsLoading(true);
    setProjectLibraryError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      const body = await response.json() as { archivedAt?: string | null; error?: string };
      if (!response.ok) throw new Error(body.error || "Der Archivstatus konnte nicht geändert werden.");
      setProjects((current) => current.map((item) => item.id === project.id ? { ...item, archivedAt: archived ? body.archivedAt ?? new Date().toISOString() : null } : item));
      if (archived && project.id === meta.id) resetToNewProject();
      showToast(archived ? `„${project.title}“ wurde archiviert.` : `„${project.title}“ wurde aus dem Archiv wiederhergestellt.`);
    } catch (error) {
      setProjectLibraryError(error instanceof Error ? error.message : "Der Archivstatus konnte nicht geändert werden.");
    } finally {
      setIsProjectsLoading(false);
    }
  }

  async function deleteStoredProject(project: ProjectSummary) {
    if (project.id === meta.id && projectSaveState !== "saved") {
      setProjectLibraryError(`„${project.title}“ enthält noch nicht gespeicherte Änderungen. Bitte zuerst speichern oder die Änderungen bewusst verwerfen.`);
      return;
    }
    const confirmed = window.confirm(`Projekt „${project.title}“ in den Papierkorb verschieben? Die vollständige gespeicherte Projektakte bleibt mindestens 30 Tage wiederherstellbar.`);
    if (!confirmed) return;
    setIsProjectsLoading(true);
    setProjectLibraryError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
      const body = await response.json() as { deleted?: boolean; recoverable?: boolean; trashedAt?: string; deleteAfter?: string; error?: string };
      if (!response.ok || !body.deleted) throw new Error(body.error || "Das Projekt konnte nicht gelöscht werden.");
      setProjects((current) => current.map((item) => item.id === project.id ? {
        ...item,
        archivedAt: null,
        trashedAt: body.trashedAt ?? new Date().toISOString(),
        deleteAfter: body.deleteAfter ?? null,
      } : item));
      if (project.id === meta.id) resetToNewProject();
      showToast(`„${project.title}“ liegt im Papierkorb und kann wiederhergestellt werden.`);
    } catch (error) {
      setProjectLibraryError(error instanceof Error ? error.message : "Das Projekt konnte nicht in den Papierkorb verschoben werden.");
    } finally {
      setIsProjectsLoading(false);
    }
  }

  async function restoreStoredProject(project: ProjectSummary) {
    setIsProjectsLoading(true);
    setProjectLibraryError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: false }),
      });
      const body = await response.json() as { trashed?: boolean; error?: string };
      if (!response.ok || body.trashed !== false) throw new Error(body.error || "Das Projekt konnte nicht wiederhergestellt werden.");
      setProjects((current) => current.map((item) => item.id === project.id ? { ...item, archivedAt: null, trashedAt: null, deleteAfter: null } : item));
      showToast(`„${project.title}“ wurde vollständig aus dem Papierkorb wiederhergestellt.`);
    } catch (error) {
      setProjectLibraryError(error instanceof Error ? error.message : "Das Projekt konnte nicht wiederhergestellt werden.");
    } finally {
      setIsProjectsLoading(false);
    }
  }

  function importPanorama(panorama: PanoramaAsset, file: File) {
    const previousUrl = panoramaObjectUrlsRef.current.get(panorama.id);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    panoramaFilesRef.current.set(panorama.id, file);
    panoramaObjectUrlsRef.current.set(panorama.id, URL.createObjectURL(file));
    setPanoramas((current) => [...current.filter((item) => item.id !== panorama.id), panorama]);
    setProjectStatus("draft");
    setProjectSaveState("idle");
    showToast("Insta360-Aufnahme geladen. Jetzt Kontrollmaße eingeben.");
  }

  function panoramaUrl(panorama: PanoramaAsset) {
    return panoramaObjectUrlsRef.current.get(panorama.id)
      ?? `/api/projects/${encodeURIComponent(meta.id)}/panoramas/${encodeURIComponent(panorama.id)}`;
  }

  function createInsta360Room(draft: Omit<Insta360RoomInput, "panorama" | "page" | "color">, panorama: PanoramaAsset) {
    const measurement = buildInsta360RoomMeasurement({
      ...draft,
      panorama,
      page: Math.max(1, pageNumber || 1),
      color: nextRoomColor(measurements),
    });
    commitMeasurements((current) => [...current, measurement]);
    setPanoramas((current) => current.map((item) => item.id === panorama.id ? { ...item, roomName: measurement.name } : item));
    setIncludedPages((current) => current.includes(measurement.page) ? current : [...current, measurement.page].sort((left, right) => left - right));
    setSelectedId(measurement.id);
    setExpandedId(measurement.id);
    setListMode("positions");
    setShowInsta360(false);
    showToast(`${measurement.name}: 360°-Aufmaß mit ${referenceMethodLabel(draft.referenceMethod)} übernommen.`);
  }

  function openProfessional(tab: ProfessionalTab) {
    setProfessionalTab(tab);
    setShowProfessional(true);
  }

  function addLaserRoom(input: LaserRoomInput) {
    const measurement = buildLaserRoomMeasurement(input, Math.max(1, pageNumber), nextRoomColor(measurements));
    commitMeasurements((current) => [...current, measurement]);
    setIncludedPages((current) => current.includes(measurement.page) ? current : [...current, measurement.page].sort((left, right) => left - right));
    setSelectedId(measurement.id);
    setExpandedId(measurement.id);
    setListMode("positions");
    showToast(`${measurement.name}: Lasermaße und Rechenweg wurden übernommen.`);
  }

  function addSpecialArea(input: SpecialShapeInput) {
    const measurement = buildSpecialAreaMeasurement(input, Math.max(1, pageNumber), measurementColor("area"));
    commitMeasurements((current) => [...current, measurement]);
    setIncludedPages((current) => current.includes(measurement.page) ? current : [...current, measurement.page].sort((left, right) => left - right));
    setSelectedId(measurement.id);
    setExpandedId(measurement.id);
    setListMode("positions");
    showToast(`${measurement.name}: Sondergeometrie wurde ins Aufmaß übernommen.`);
  }

  function changeProjectReview(next: ProjectReviewState) {
    setProjectReview(cloneReview(next));
    setProjectStatus(next.workflowStatus === "released" ? "completed" : "draft");
    setProjectSaveState("idle");
  }

  function exportReviewProtocol() {
    if (!rows.length) {
      showToast("Für ein Prüfprotokoll fehlen noch Aufmaßpositionen.");
      return;
    }
    downloadBlob(buildReviewCsv(meta, rows, projectReview), `${safeFileName(meta.title)}-Pruefprotokoll.csv`, "text/csv;charset=utf-8");
    showToast("Das Prüfprotokoll wurde erstellt.");
  }

  function exportRebPreparation() {
    if (!rows.length) {
      showToast("Für die Übergabe fehlen noch Aufmaßpositionen.");
      return;
    }
    downloadBlob(buildRebPreparationCsv(meta, rows, includedMeasurements), `${safeFileName(meta.title)}-REB-Pruefansaetze.csv`, "text/csv;charset=utf-8");
    showToast("Die strukturierten REB-Prüfansätze wurden erstellt.");
  }

  function exportGaebPreparation() {
    if (!rows.length) {
      showToast("Für die GAEB-Vorbereitung fehlen noch Aufmaßpositionen.");
      return;
    }
    downloadBlob(buildGaebX31PreparationXml(meta, rows, includedMeasurements), `${safeFileName(meta.title)}-GAEB-X31-Vorbereitung.xml`, "application/xml;charset=utf-8");
    showToast("Die GAEB-X31-Vorbereitung wurde erstellt.");
  }

  function exportIntegrationPackage() {
    if (!rows.length) {
      showToast("Für das Übergabepaket fehlen noch Aufmaßpositionen.");
      return;
    }
    downloadBlob(buildIntegrationManifest(meta, rows, projectReview), `${safeFileName(meta.title)}-Handwerker-App-Uebergabe.json`, "application/json;charset=utf-8");
    showToast("Das Übergabepaket für die spätere Handwerker-App wurde erstellt.");
  }

  async function finishProject() {
    if (!rows.length) {
      showToast("Zum Fertigstellen muss mindestens eine Aufmaßposition vorhanden sein.");
      return;
    }
    if (!quality.releasable) {
      setShowAuditModal(false);
      openProfessional("review");
      showToast(`Fertigstellung gesperrt: ${quality.errors} Fehler, ${quality.warnings} Warnungen und ${quality.open} offene Positionen prüfen.`);
      return;
    }
    const saved = await saveProjectSnapshot("completed");
    if (saved) setShowAuditModal(true);
  }

  function changePage(next: number) {
    if (next < 1 || next > pageCount) return;
    setPageNumber(next);
    setDrawingPoints([]);
    setCalibrationPoints([]);
    setGeometryEditingId(null);
    setSelectedId(null);
    setZoom(1);
  }

  function fitPage() {
    const viewport = viewportRef.current;
    if (!viewport) {
      setZoom(1);
      return;
    }
    const availableWidth = Math.max(1, viewport.clientWidth - 52);
    const availableHeight = Math.max(1, viewport.clientHeight - 52);
    applyZoom(Math.min(1, availableWidth / stageSize.width, availableHeight / stageSize.height));
  }

  const drawingPath = drawingPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const livePoints = cursorPoint ? [...drawingPoints, cursorPoint] : drawingPoints;
  const liveLength = pageScale ? polylinePixels(livePoints) * pageScale : 0;
  const liveArea = pageScale && drawingPoints.length >= 2 && cursorPoint
    ? polygonPixels([...drawingPoints, cursorPoint]) * pageScale * pageScale
    : 0;

  return (
    <div className="app-shell">
      <StartupSplash />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="company-logo" role="img" aria-label="Die Maler sind los – Malermeisterbetrieb Marcus Schwan" />
          <span className="brand-product">AUFMASS PRO · PILOT</span>
        </div>

        <button className="project-title" onClick={() => setShowProject(true)} aria-label="Projektdaten bearbeiten">
          <span>{meta.title || "Neues Projekt"}</span>
          <small>{meta.customer || "Kunde noch nicht eingetragen"}</small>
        </button>

        <div className="topbar-actions">
          <a className="brand-email" href="mailto:info@malerbetriebguestrow.de"><Mail size={15} /><span>info@malerbetriebguestrow.de</span></a>
          <span className={`save-state ${projectSaveState} ${projectStatus}`}>
            {isProjectSaving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}
            {isProjectSaving ? "Wird gespeichert" : projectSaveState === "error" ? "Nur Gerätesicherung" : projectStatus === "completed" ? "Fertiggestellt · gespeichert" : projectSaveState === "saved" ? "Projekt gespeichert" : "Ungespeicherter Entwurf"}
          </span>
          <button className="button ghost compact" onClick={undo} disabled={!undoStack.current.length} title="Rückgängig">
            <Undo2 size={17} />
          </button>
          <button className="button ghost" onClick={openProjectLibrary}><FolderOpen size={16} /> Projekte</button>
          <button className="button ghost" onClick={() => void saveProjectSnapshot()} disabled={isProjectSaving}><Save size={16} /> {isProjectSaving ? "Speichert …" : "Speichern"}</button>
          <button className="button insta360-button" onClick={() => setShowInsta360(true)} title="360-Grad-Aufmaß mit Insta360"><Camera size={16} /><span>Insta360</span></button>
          <button className="button professional-button" onClick={() => openProfessional("laser")} title="Laser, Sonderflächen, Prüferportal und Datenaustausch"><Building2 size={16} /><span>Profi</span></button>
          <button className="button ghost compact" onClick={exportCsv} title="Einfache CSV-Liste exportieren"><FileDown size={16} /></button>
          <div className="export-menu">
            <button className="button primary" onClick={openExcelExport}><FileSpreadsheet size={16} /> Excel & Material</button>
            <button className="button primary split" onClick={() => window.print()} aria-label="Aufmaß drucken"><Printer size={16} /></button>
          </div>
          <PwaInstall />
          <button className="button icon-button help-button" onClick={() => setShowHelp(true)} title="Hilfe" aria-label="Benutzerhandbuch öffnen"><CircleHelp size={18} /></button>
          <button className="button icon-button settings-button" onClick={() => setShowSettings(true)} title="Einstellungen"><Settings2 size={18} /></button>
        </div>
      </header>

      <main className="workspace">
        <aside className="tool-rail" aria-label="Messwerkzeuge">
          <div className="tool-group-label">WERKZEUGE</div>
          {toolItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`tool-button ${tool === item.id ? "active" : ""}`}
                onClick={() => selectTool(item.id)}
                title={item.hint}
              >
                <Icon size={20} strokeWidth={1.9} />
                <span>{item.label}</span>
              </button>
            );
          })}
          <div className="tool-rail-spacer" />
          <button className="tool-button secondary-tool" onClick={() => void saveProjectSnapshot()} disabled={isProjectSaving} title="Projekt und Original-PDF speichern">
            {isProjectSaving ? <LoaderCircle className="spin" size={19} /> : <Save size={19} />}<span>Speichern</span>
          </button>
          <button className="tool-button secondary-tool" onClick={openProjectLibrary} title="Gespeicherte Projekte öffnen">
            <FolderOpen size={19} /><span>Projekte</span>
          </button>
        </aside>

        <section className="drawing-area">
          <div className="document-bar">
            <div className="document-name">
              <FileText size={17} />
              <span title={sourceFileNames.join("\n")}>{sourceFileNames.length > 1 ? `${sourceFileNames.length} PDF-Dateien` : fileName || "Noch kein Grundriss geladen"}</span>
              {fileName && <small>{pageCount} {pageCount === 1 ? "Seite" : "Seiten"}</small>}
            </div>
            <div className="document-controls">
              {pdfDocument && (
                <>
                  <button className="mini-button" onClick={openPdfSelection} title="Eine oder mehrere PDF-Dateien öffnen"><UploadCloud size={15} /> PDFs öffnen</button>
                  <button className="mini-button auto-button" onClick={() => setShowAutoModal(true)}><Sparkles size={15} /> Seiten & Mengen · {includedPages.length}/{pageCount}</button>
                  <button className="mini-button audit-mini-button" onClick={openAudit} disabled={!rows.length} title="Prüfbares Aufmaß öffnen"><ClipboardCheck size={15} /><span>Prüfbares Aufmaß</span></button>
                  <div className={`scale-status ${pageScale ? "ready" : "missing"}`}>
                    {pageScale ? <Check size={14} /> : <AlertTriangle size={14} />}
                    {pageScale ? `Kalibriert · 1 px = ${formatNumber(pageScale * 1000, 3)} mm` : "Maßstab fehlt"}
                  </div>
                  <span className="render-quality-badge" title="PDF wird bei jeder Zoomstufe in Geräteauflösung nachgerendert" aria-label="Scharfe HD-Darstellung aktiv">HD</span>
                  <button className="mini-button" onClick={() => selectTool("calibrate")}><Ruler size={15} /> Neu kalibrieren</button>
                  <span className="control-divider" />
                  <button className="mini-button square" onClick={() => applyZoom(zoom - .1)} disabled={zoom <= .35} title="Verkleinern" aria-label="PDF verkleinern"><ZoomOut size={16} /></button>
                  <button className="zoom-value" onClick={() => applyZoom(1)} title="Auf 100 % zurücksetzen" aria-label={`Zoom ${Math.round(zoom * 100)} Prozent, auf 100 Prozent zurücksetzen`}>{Math.round(zoom * 100)}%</button>
                  <button className="mini-button square" onClick={() => applyZoom(zoom + .1)} disabled={zoom >= 4} title="Vergrößern" aria-label="PDF vergrößern"><ZoomIn size={16} /></button>
                  <button className="mini-button square" onClick={fitPage} title="Ganze PDF-Seite einpassen" aria-label="Ganze PDF-Seite einpassen"><Maximize2 size={15} /></button>
                </>
              )}
            </div>
          </div>

          <div
            ref={viewportRef}
            className={`canvas-viewport ${tool === "select" && pdfDocument ? "pan-zoom-enabled" : ""} ${isDragging ? "dragging" : ""}`}
            role="region"
            aria-label="PDF-Grundriss, scrollbar und zoombar"
            tabIndex={0}
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onWheel={handleViewportWheel}
            onKeyDown={handleViewportKeyDown}
            onPointerDownCapture={beginViewportNavigation}
            onPointerMoveCapture={continueViewportNavigation}
            onPointerUpCapture={endViewportNavigation}
            onPointerCancelCapture={endViewportNavigation}
          >
            {tool === "select" && selected?.kind === "room" && (
              <div className="selected-room-outline-layer" aria-live="polite">
                <RoomOutlinePreview measurement={selected} scale={scales[selected.page]} />
              </div>
            )}
            {autoSummary && pdfDocument && (
              <div className="auto-summary-banner">
                <span className="auto-summary-icon"><Sparkles size={17} /></span>
                <span><strong>Auto-Aufmaß erstellt</strong><small>{autoSummary.rooms} Räume · {autoSummary.pages} {autoSummary.pages === 1 ? "Seite" : "Seiten"} · {formatNumber(autoSummary.area)} m² · {autoSummary.method === "nrf" ? "PDF-NRF" : autoSummary.method === "dimensions" ? "PDF-Maßketten" : "Planmaßstab"}{autoSummary.roomHeights ? ` · ${autoSummary.roomHeights}/${autoSummary.rooms} Höhen erkannt` : " · Standard-Raumhöhe"}{autoSummary.reviewRooms ? ` · ${autoSummary.reviewRooms} Konturen prüfen` : ""} · Raum rechts auswählen</small></span>
                <button className="audit-summary-button" onClick={openAudit}><ClipboardCheck size={14} /> Prüfen</button>
                <button className="summary-close-button" onClick={() => setAutoSummary(null)} aria-label="Hinweis schließen"><X size={15} /></button>
              </div>
            )}
            {!pdfDocument ? (
              <div className="empty-state">
                <div className="empty-illustration" aria-hidden="true">
                  <svg viewBox="0 0 300 196">
                    <path d="M28 24h244v148H28z" fill="#fff" stroke="#cfd5dd" strokeWidth="2" />
                    <path d="M39 36h94v62H39zM143 36h118v88H143zM39 108h72v53H39zM121 134h140v27H121z" fill="none" stroke="#85909f" strokeWidth="4" />
                    <path d="M111 109v18M143 72h18M191 124v14" stroke="#8E1E6E" strokeWidth="4" />
                    <path d="M44 113l62 43" stroke="#b6bec9" strokeDasharray="4 5" />
                    <circle cx="44" cy="113" r="5" fill="#8E1E6E" /><circle cx="106" cy="156" r="5" fill="#D96F39" />
                  </svg>
                </div>
                <div className="empty-icon"><UploadCloud size={26} /></div>
                <h1>Digitalen Grundriss öffnen</h1>
                <p>Eine oder mehrere PDF-Dateien hier ablegen oder gemeinsam vom Gerät auswählen. Alle Seiten werden zu einem Plansatz verbunden.</p>
                <div className="empty-actions">
                  <button className="button primary large" onClick={openPdfSelection}><Plus size={18} /> PDF-Dateien auswählen</button>
                  <button className="button insta360-button large" onClick={() => setShowInsta360(true)}><Camera size={18} /> Insta360-Aufmaß</button>
                  <button className="button professional-button large" onClick={() => openProfessional("laser")}><Ruler size={18} /> Laser & Sonderflächen</button>
                </div>
                <div className="empty-note"><Check size={15} /> Verarbeitung direkt im Browser</div>
              </div>
            ) : (
              <div className="page-stage-wrap">
                <div
                  ref={zoomFrameRef}
                  className="page-zoom-frame"
                  style={{ width: stageSize.width * zoom, height: stageSize.height * zoom }}
                >
                  <div className="page-stage" style={{ width: stageSize.width * zoom, height: stageSize.height * zoom }}>
                  <canvas ref={canvasRef} className="pdf-canvas" />
                  <svg
                    ref={overlayRef}
                    className={`measurement-overlay tool-${tool}`}
                    width={stageSize.width * zoom}
                    height={stageSize.height * zoom}
                    viewBox={`0 0 ${stageSize.width} ${stageSize.height}`}
                    onPointerDown={handleStagePointerDown}
                    onPointerMove={continueGeometryDrag}
                    onPointerUp={endGeometryDrag}
                    onPointerCancel={endGeometryDrag}
                    onPointerLeave={() => setCursorPoint(null)}
                    onDoubleClick={(event) => { event.preventDefault(); finishDrawing(); }}
                  >
                    {pageMeasurements.filter((measurement) => (
                      measurementIsVisibleOnPlan(measurement, selectedId)
                      && measurement.id !== geometryEditingId
                      && measurement.points.length > 0
                      && measurement.geometryStatus !== "missing"
                      && measurement.geometryStatus !== "uncertain"
                      && !["insta360-reference", "laser-reference", "special-geometry", "freehand-sketch"].includes(measurement.areaSource ?? "")
                    )).map((measurement) => {
                      const isPolygon = measurement.kind === "room" || measurement.kind === "area";
                      const points = measurement.points.map((point) => `${point.x},${point.y}`).join(" ");
                      const center = measurement.labelAnchor ?? polygonCentroid(measurement.points);
                      const value = getMeasurementPrimaryValue(measurement, scales);
                      const isSelected = selectedId === measurement.id;
                      const compactLabel = measurement.source === "auto";
                      return (
                        <g
                          key={measurement.id}
                          className={`saved-measurement ${measurement.source === "auto" ? "auto" : ""} ${measurement.geometryStatus ? `geometry-${measurement.geometryStatus}` : ""} ${isSelected ? "selected" : ""}`}
                          onPointerDown={(event) => {
                            if (tool !== "select") return;
                            event.stopPropagation();
                            setSelectedId(measurement.id);
                            setExpandedId(measurement.id);
                          }}
                        >
                          {isPolygon ? (
                            <polygon points={points} fill={measurement.color} stroke={measurement.color} />
                          ) : measurement.kind === "line" ? (
                            <polyline points={points} fill="none" stroke={measurement.color} />
                          ) : (
                            <g transform={`translate(${measurement.points[0].x} ${measurement.points[0].y})`}>
                              <circle r="12" fill={measurement.color} />
                              <text className="count-marker" textAnchor="middle" y="5">{measurement.quantity}</text>
                            </g>
                          )}
                          {measurement.kind !== "count" && (
                            <g className={`measurement-label ${compactLabel ? "compact" : ""}`} transform={`translate(${center.x} ${center.y})`}>
                              <title>{measurement.name} · {formatNumber(value.value)} {value.unit}{measurement.geometryNote ? ` · ${measurement.geometryNote}` : ""}</title>
                              <rect x={compactLabel ? -46 : -58} y={compactLabel ? -15 : -21} width={compactLabel ? 92 : 116} height={compactLabel ? 30 : 42} rx={compactLabel ? 5 : 7} />
                              <text textAnchor="middle" y={compactLabel ? -2 : -3}>{compactLabel ? compactPlanLabel(measurement.name) : measurement.name}</text>
                              <text className="label-value" textAnchor="middle" y={compactLabel ? 10 : 13}>{formatNumber(value.value)} {value.unit}</text>
                            </g>
                          )}
                          {(measurement.openings ?? []).filter((opening) => opening.marker).map((opening) => (
                            <g key={opening.id} className="opening-marker" transform={`translate(${opening.marker!.x} ${opening.marker!.y})`}>
                              <circle r="10" />
                              <path d="M-4-5v10M4-5v10M-4 0h8" />
                            </g>
                          ))}
                        </g>
                      );
                    })}

                    {pageMeasurements.filter((measurement) => (
                      measurement.kind === "room"
                      && measurementIsVisibleOnPlan(measurement, selectedId)
                      && Boolean(measurement.labelAnchor)
                      && (measurement.geometryStatus === "missing" || measurement.geometryStatus === "uncertain")
                    )).map((measurement) => {
                      const anchor = measurement.labelAnchor!;
                      const value = getMeasurementPrimaryValue(measurement, scales);
                      const isSelected = selectedId === measurement.id;
                      return (
                        <g
                          key={`${measurement.id}-marker`}
                          className={`saved-measurement auto geometry-warning ${isSelected ? "selected" : ""}`}
                          transform={`translate(${anchor.x} ${anchor.y})`}
                          onPointerDown={(event) => {
                            if (tool !== "select") return;
                            event.stopPropagation();
                            setSelectedId(measurement.id);
                            setExpandedId(measurement.id);
                          }}
                        >
                          <circle className="geometry-warning-hit" cx="-53" cy="0" r="22" />
                          <circle className="geometry-warning-pin" cx="-53" cy="0" r="8" />
                          <text className="geometry-warning-mark" x="-53" y="3" textAnchor="middle">!</text>
                          <g className="measurement-label compact geometry-warning-label">
                            <title>{measurement.geometryNote ?? "Raumkontur muss manuell kontrolliert werden."}</title>
                            <rect x="-43" y="-15" width="92" height="30" rx="5" />
                            <text textAnchor="middle" x="3" y="-2">{compactPlanLabel(measurement.name)}</text>
                            <text className="label-value" textAnchor="middle" x="3" y="10">{formatNumber(value.value)} {value.unit}</text>
                          </g>
                        </g>
                      );
                    })}

                    {calibrationPoints.length > 0 && (
                      <g className="calibration-draft">
                        {calibrationPoints.length === 2 && <line x1={calibrationPoints[0].x} y1={calibrationPoints[0].y} x2={calibrationPoints[1].x} y2={calibrationPoints[1].y} />}
                        {calibrationPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="5" />)}
                        {calibrationPoints.length === 1 && cursorPoint && <line className="preview" x1={calibrationPoints[0].x} y1={calibrationPoints[0].y} x2={cursorPoint.x} y2={cursorPoint.y} />}
                      </g>
                    )}

                    {geometryEditingId && drawingPoints.length >= 3 ? (
                      <g className="geometry-editor">
                        <polygon
                          points={drawingPath}
                          onPointerDown={(event) => beginGeometryDrag(event, "outline")}
                        />
                        {drawingPoints.map((point, index) => (
                          <circle
                            key={`${point.x}-${point.y}-${index}`}
                            cx={point.x}
                            cy={point.y}
                            r="6"
                            onPointerDown={(event) => beginGeometryDrag(event, "vertex", index)}
                          />
                        ))}
                      </g>
                    ) : drawingPoints.length > 0 && (
                      <g className="drawing-draft">
                        {tool === "line" ? (
                          <polyline points={cursorPoint ? `${drawingPath} ${cursorPoint.x},${cursorPoint.y}` : drawingPath} fill="none" />
                        ) : (
                          <polygon points={cursorPoint ? `${drawingPath} ${cursorPoint.x},${cursorPoint.y}` : drawingPath} />
                        )}
                        {drawingPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={index === 0 ? 5.5 : 4.5} />)}
                      </g>
                    )}
                  </svg>

                  {drawingPoints.length > 0 && cursorPoint && (
                    <div className="live-readout" style={{ left: cursorPoint.x + 14, top: cursorPoint.y + 14 }}>
                      {tool === "line" ? `${formatNumber(liveLength)} m` : `${formatNumber(liveArea)} m²`}
                    </div>
                  )}
                  </div>
                </div>
              </div>
            )}

            {pdfDocument && drawingPoints.length > 0 && (
              <div className="drawing-actions">
                <span>{geometryEditingId && drawingPoints.length >= 3 ? <><Move size={14} /> Fläche oder Eckpunkte ziehen</> : geometryEditingId ? "Raumkontur neu setzen" : tool === "line" ? "Weitere Punkte setzen" : "Ecken des Bereichs setzen"}</span>
                <button onClick={cancelDrawing}>Abbrechen</button>
                {geometryEditingId && drawingPoints.length >= 3 && <button onClick={() => { geometryDragRef.current = null; setDrawingPoints([]); }}>Neu zeichnen</button>}
                <button className="finish" onClick={finishDrawing}><Check size={15} /> Abschließen</button>
              </div>
            )}

            {(isLoading || isAutoDetecting) && (
              <div className="loading-overlay"><LoaderCircle className="spin" size={28} /><span>{isAutoDetecting ? autoProgress || "Auto-Aufmaß wird berechnet …" : "Grundriss wird geladen …"}</span></div>
            )}
          </div>

          {pdfDocument && (
            <div className="floating-zoom-controls" role="group" aria-label="PDF-Zoom">
              <button onClick={() => applyZoom(zoom - .15)} disabled={zoom <= .35} title="PDF verkleinern" aria-label="PDF verkleinern"><ZoomOut size={17} /></button>
              <input
                type="range"
                min="35"
                max="400"
                step="5"
                value={Math.round(zoom * 100)}
                onChange={(event) => applyZoom(Number(event.target.value) / 100)}
                aria-label={`PDF-Zoom ${Math.round(zoom * 100)} Prozent`}
              />
              <button className="floating-zoom-value" onClick={() => applyZoom(1)} title="Auf 100 Prozent zurücksetzen">{Math.round(zoom * 100)}%</button>
              <button onClick={() => applyZoom(zoom + .15)} disabled={zoom >= 4} title="PDF vergrößern" aria-label="PDF vergrößern"><ZoomIn size={17} /></button>
              <button onClick={fitPage} title="Ganze PDF-Seite einpassen" aria-label="Ganze PDF-Seite einpassen"><Maximize2 size={16} /></button>
            </div>
          )}

          <div className="page-footer">
            <span>{tool === "calibrate" ? "Zwei Punkte einer bekannten Strecke anklicken" : tool === "select" ? "Mit Mausziehen oder einem Finger verschieben · Mausrad scrollt · Strg/⌘ + Mausrad zoomt" : "Punkte setzen · Enter schließt ab · Esc bricht ab"}</span>
            {pdfDocument && (
              <div className="page-switcher">
                <button onClick={() => changePage(pageNumber - 1)} disabled={pageNumber === 1}><ChevronLeft size={16} /></button>
                <span>Seite <strong>{pageNumber}</strong> von {pageCount}</span>
                <button onClick={() => changePage(pageNumber + 1)} disabled={pageNumber === pageCount}><ChevronRight size={16} /></button>
              </div>
            )}
          </div>
        </section>

        <aside className="results-panel">
          <div className="results-header">
            <div>
              <p>AUFMASSLISTE</p>
              <h2>Ermittelte Mengen</h2>
            </div>
            <span className="position-count">{rows.length}</span>
          </div>
          <div className="results-tabs">
            <button className={listMode === "positions" ? "active" : ""} onClick={() => setListMode("positions")}>Positionen</button>
            <button className={listMode === "totals" ? "active" : ""} onClick={() => setListMode("totals")}>Summen</button>
          </div>

          {listMode === "positions" ? (
            <div className="results-list" role="region" aria-label="Ermittelte Maße, scrollbar" tabIndex={0}>
              {!includedMeasurements.length ? (
                <div className="no-results">
                  <div><Ruler size={21} /></div>
                  <h3>{measurements.length ? "Keine Positionen auf den ausgewählten Seiten" : "Noch keine Mengen"}</h3>
                  <p>{measurements.length ? "Öffne das Auto-Aufmaß und wähle die gewünschten PDF-Seiten aus." : "Lade einen Grundriss, starte das Auto-Aufmaß oder erfasse einen Raum über Insta360."}</p>
                </div>
              ) : includedMeasurements.map((measurement, index) => {
                const measurementRows = rows.filter((row) => row.measurementId === measurement.id);
                const primary = getMeasurementPrimaryValue(measurement, scales);
                const expanded = expandedId === measurement.id;
                return (
                  <article key={measurement.id} className={`result-card ${selectedId === measurement.id ? "selected" : ""}`}>
                    <button
                      className="result-summary"
                      aria-expanded={expanded}
                      title={measurement.kind === "room" ? "Raum auswählen und berechneten Umriss anzeigen" : "Position auswählen"}
                      onClick={() => {
                        if (measurement.page !== pageNumber) changePage(measurement.page);
                        cancelDrawing();
                        setTool("select");
                        setSelectedId(measurement.id);
                        setExpandedId(expanded ? null : measurement.id);
                      }}>
                      <span className="result-index" style={{ color: measurement.color, background: `${measurement.color}15` }}>{String(index + 1).padStart(2, "0")}</span>
                      <span className="result-copy">
                        <strong>{measurement.name}</strong>
                        <small>{measurement.kind === "room" ? "Raumaufmaß" : measurement.kind === "area" ? measurement.areaCategory : measurement.kind === "line" ? measurement.lineCategory : "Stückzahl"} · {measurementSourceSummary(measurement)}</small>
                      </span>
                      <span className="result-value"><strong>{formatNumber(primary.value)}</strong><small>{primary.unit}</small></span>
                    </button>
                    {expanded && (
                      <div className="result-details">
                        {(measurement.geometryStatus === "missing" || measurement.geometryStatus === "uncertain") && (
                          <div className="geometry-review-note">
                            <AlertTriangle size={15} />
                            <span><strong>Raumfläche sicher, Kontur nicht eindeutig</strong><small>{measurement.geometryNote ?? "Bitte Raumkontur im Plan kontrollieren."} Wandflächen und Fußleisten bleiben bis zur Korrektur ausgeschaltet.</small></span>
                          </div>
                        )}
                        {measurement.kind === "room" && (
                          <div className={`room-height-note ${measurement.heightSource === "pdf-room" ? "detected" : "fallback"}`}>
                            <Ruler size={15} />
                            <span>
                              <strong>Raumhöhe {formatNumber(measurement.height ?? 0)} m · {measurement.heightSource === "pdf-room" ? "automatisch erkannt" : measurement.heightSource === "manual" ? "manuell eingetragen" : "Standardwert"}</strong>
                              <small>{measurement.heightNote ?? "Raumhöhe manuell erfasst oder aus der Projektvorgabe übernommen."}</small>
                            </span>
                          </div>
                        )}
                        {measurementRows.map((row) => (
                          <div className="result-row" key={row.id}>
                            <span><strong>{row.description}</strong><small>{row.formula}</small></span>
                            <span><strong>{formatNumber(row.result)}</strong><small>{row.unit}{row.deduction > 0 ? ` · −${formatNumber(row.deduction)}` : ""}</small></span>
                          </div>
                        ))}
                        {measurement.kind === "room" && (measurement.openings ?? []).map((opening) => {
                          const calculation = openingCalculation(opening, meta.deductionThreshold);
                          return (
                            <div className="opening-row" key={opening.id}>
                              <DoorOpen size={15} />
                              <span><strong>{opening.name}</strong><small>{formatNumber(opening.width)} × {formatNumber(opening.height)} m · {opening.quantity}×{calculation.revealDepth > 0 ? ` · Laibung ${calculation.revealSides}-seitig, ${formatNumber(calculation.revealDepth)} m tief` : ""}</small></span>
                              <em className={calculation.overmeasured ? "over" : calculation.deduct ? "deduct" : "manual"}>{calculation.overmeasured ? "übermessen" : calculation.deduct ? `−${formatNumber(calculation.deduct)} m²` : "kein Abzug"}</em>
                              <button onClick={() => removeOpening(measurement.id, opening.id)}><X size={14} /></button>
                            </div>
                          );
                        })}
                        <div className="card-actions">
                          {measurement.kind === "room" && measurement.source === "auto" && ["pdf-nrf", "pdf-dimensions", "pdf-scale"].includes(measurement.areaSource ?? "") && (
                            <button className="geometry-action" onClick={() => startGeometryCorrection(measurement)}><Pentagon size={14} /> {measurement.points.length < 3 || measurement.geometryStatus === "missing" || measurement.geometryStatus === "uncertain" ? "Kontur zeichnen" : "Kontur korrigieren"}</button>
                          )}
                          <button onClick={() => setEditingId(measurement.id)}><Settings2 size={14} /> Bearbeiten</button>
                          <button onClick={() => updateMeasurement(measurement.id, { visible: !measurement.visible })}>{measurement.visible ? <EyeOff size={14} /> : <Eye size={14} />}{measurement.visible ? "Ausblenden" : "Einblenden"}</button>
                          <button className="danger" onClick={() => removeMeasurement(measurement.id)}><Trash2 size={14} /> Löschen</button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="totals-view" role="region" aria-label="Summen der ermittelten Maße, scrollbar" tabIndex={0}>
              <div className="total-hero">
                <small>Gesamtfläche</small>
                <strong>{formatNumber(totals["m²"] ?? 0)} <em>m²</em></strong>
                <span>aus {rows.filter((row) => row.unit === "m²").length} Positionen</span>
              </div>
              <div className="unit-totals">
                <div><span>Längen</span><strong>{formatNumber(totals.m ?? 0)} m</strong></div>
                <div><span>Stückzahlen</span><strong>{formatNumber(totals.Stk ?? 0)} Stk</strong></div>
                <div><span>Abzüge</span><strong>−{formatNumber(rows.reduce((sum, row) => sum + row.deduction, 0))} m²</strong></div>
              </div>
              <div className="category-totals">
                <h3>Nach Leistung</h3>
                {Object.entries(rows.reduce<Record<string, number>>((acc, row) => {
                  if (row.unit === "m²") acc[row.category] = (acc[row.category] ?? 0) + row.result;
                  return acc;
                }, {})).map(([category, value]) => (
                  <div key={category}><span>{category}</span><strong>{formatNumber(value)} m²</strong></div>
                ))}
              </div>
            </div>
          )}

          <div className="results-footer">
            <a className="company-contact" href="mailto:info@malerbetriebguestrow.de">
              <span className="company-contact-icon"><Mail size={15} /></span>
              <span><strong>Die Maler sind los</strong><small>info@malerbetriebguestrow.de</small></span>
            </a>
            <div className={`vob-chip ${meta.vobRuleConfirmed && meta.vobRuleSetId === VOB_RULESET.id ? "confirmed" : "unconfirmed"}`}><Building2 size={15} /><span><strong>{meta.vobRuleConfirmed && meta.vobRuleSetId === VOB_RULESET.id ? "Projektregel fachlich bestätigt" : "VOB-Fachprüfung offen"}</strong><small>{meta.vobRuleConfirmed ? `Bestätigte Grenze: ${formatNumber(meta.deductionThreshold)} m²` : "Vor Freigabe Vertrag und ATV prüfen"}</small></span></div>
            <button className="button primary full" onClick={openAudit} disabled={!rows.length}><ClipboardCheck size={16} /> Prüfbares Aufmaß öffnen</button>
            <button className="button professional-button full" onClick={() => openProfessional("review")}><ClipboardCheck size={16} /> Prüferportal & Freigaben</button>
            <button className="button secondary full" onClick={() => void finishProject()} disabled={!rows.length || isProjectSaving}><Check size={16} /> {projectStatus === "completed" ? "Fertiggestellt · erneut speichern" : "Projekt fertigstellen"}</button>
            <button className="button secondary full" onClick={exportProject}><Download size={16} /> Projektsicherung herunterladen</button>
          </div>
        </aside>
      </main>

      <ProjectTabs
        projects={projects}
        currentProjectId={meta.id}
        currentTitle={meta.title}
        currentStatus={projectStatus}
        currentPositionCount={rows.length}
        saveState={projectSaveState}
        loading={isProjectsLoading}
        onOpen={(project) => void openStoredProject(project)}
        onLibrary={openProjectLibrary}
        onNew={startNewProject}
      />

      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" multiple onChange={handleFile} hidden />

      {showInsta360 && (
        <Insta360Measure
          panoramas={panoramas}
          getPanoramaUrl={panoramaUrl}
          onImport={importPanorama}
          onCreateRoom={createInsta360Room}
          onClose={() => setShowInsta360(false)}
        />
      )}

      {showProfessional && (
        <ProfessionalSuite
          initialTab={professionalTab}
          rows={rows}
          measurements={includedMeasurements}
          scales={scales}
          meta={meta}
          review={projectReview}
          page={Math.max(1, pageNumber)}
          onAddLaser={addLaserRoom}
          onAddSpecial={addSpecialArea}
          onReviewChange={changeProjectReview}
          onDownloadReview={exportReviewProtocol}
          onDownloadReb={exportRebPreparation}
          onDownloadGaeb={exportGaebPreparation}
          onDownloadIntegration={exportIntegrationPackage}
          onClose={() => setShowProfessional(false)}
        />
      )}

      {showExcelModal && (
        <ExcelExportModal
          settings={materials}
          preview={materialPreview}
          selectedPages={includedPages}
          measurementSummary={{ positions: rows.length, surfaceArea: totals["m²"] ?? 0, length: totals.m ?? 0 }}
          confirmed={materialInputsConfirmed}
          isExporting={isExportingExcel}
          onChange={(next) => { setMaterials(next); setMaterialInputsConfirmed(false); }}
          onConfirm={setMaterialInputsConfirmed}
          onClose={() => { if (!isExportingExcel) setShowExcelModal(false); }}
          onExport={exportExcel}
        />
      )}

      {showAuditModal && (
        <AuditModal
          meta={meta}
          selectedPages={includedPages}
          rows={rows}
          measurements={includedMeasurements}
          scales={scales}
          isExporting={isExportingAudit}
          isExportingPdf={isExportingPdf}
          isSavingProject={isProjectSaving}
          projectStatus={projectStatus}
          onInspect={inspectMeasurement}
          onExport={exportAuditExcel}
          onExportPdf={exportAuditPdf}
          onComplete={() => void finishProject()}
          onClose={() => { if (!isExportingAudit && !isExportingPdf && !isProjectSaving) setShowAuditModal(false); }}
        />
      )}

      {showAutoModal && (
        <Modal title="Auto-Aufmaß aus PDF" subtitle="Räume erkennen und ausgewählte Mengen sofort zusammenrechnen" onClose={() => { if (!isAutoDetecting) setShowAutoModal(false); }} wide>
          <div className="auto-intro">
            <span><Sparkles size={21} /></span>
            <div><strong>Automatische Raumerkennung</strong><small>Mit NRF-Stempel wird die exakte Raumfläche übernommen. Eine Raumkontur wird nur bei eindeutiger Zuordnung verwendet; unsichere Formen werden nicht geschätzt und müssen im Plan nachgezeichnet werden.</small></div>
          </div>

          <label className="field-label with-top">Welche Mengen sollen berechnet werden?</label>
          <div className="check-grid auto-quantity-grid">
            {[
              { label: "Wandflächen", value: autoIncludeWalls, set: setAutoIncludeWalls },
              { label: "Deckenflächen", value: autoIncludeCeiling, set: setAutoIncludeCeiling },
              { label: "Bodenflächen", value: autoIncludeFloor, set: setAutoIncludeFloor },
              { label: "Fußleisten", value: autoIncludeSkirting, set: setAutoIncludeSkirting },
            ].map((item) => (
              <label key={item.label} className={item.value ? "checked" : ""}>
                <input type="checkbox" checked={item.value} onChange={(event) => item.set(event.target.checked)} />
                <span><Check size={14} /></span>{item.label}
              </label>
            ))}
          </div>

          <div className="field-grid two with-top">
            <label><span className="field-label">Standard-Raumhöhe, falls im Plan nicht eindeutig</span><div className="input-with-unit"><EditableNumberInput min="0.1" step="0.01" value={autoRoomHeight} onValueChange={setAutoRoomHeight} /><span>m</span></div></label>
            <label><span className="field-label">Kleinster Raum</span><div className="input-with-unit"><EditableNumberInput min="0.25" step="0.25" value={autoMinRoomArea} onValueChange={setAutoMinRoomArea} /><span>m²</span></div></label>
          </div>

          {pageScale && (
            <>
              <label className="field-label with-top">Maßstabsquelle</label>
              <div className="segmented two">
                <button className={autoScaleSource === "pdf" ? "active" : ""} onClick={() => setAutoScaleSource("pdf")}>PDF-Planmaßstab</button>
                <button className={autoScaleSource === "calibrated" ? "active" : ""} onClick={() => { setAutoScaleSource("calibrated"); setIncludedPages([pageNumber]); }}>Kalibrierung Seite {pageNumber}</button>
              </div>
            </>
          )}

          <div className="page-selection-toolbar with-top">
            <span><strong>Welche PDF-Seiten sollen zusammengerechnet werden?</strong><small>{includedPages.length} von {pageCount} Seiten ausgewählt</small></span>
            <div>
              <button type="button" disabled={autoScaleSource === "calibrated"} onClick={() => setIncludedPages(Array.from({ length: pageCount }, (_, index) => index + 1))}>Alle</button>
              <button type="button" onClick={() => setIncludedPages([pageNumber])}>Nur Seite {pageNumber}</button>
            </div>
          </div>
          <div className="page-selection-grid">
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => {
              const included = includedPages.includes(page);
              const denominator = autoScaleDenominators[page] || "";
              const missingScale = included && autoScaleSource === "pdf" && !denominator;
              return (
                <div key={page} className={`page-selection-card ${included ? "selected" : ""} ${missingScale ? "missing-scale" : ""}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={included}
                      disabled={autoScaleSource === "calibrated"}
                      onChange={(event) => setIncludedPages((current) => event.target.checked
                        ? Array.from(new Set([...current, page])).sort((left, right) => left - right)
                        : current.filter((item) => item !== page))}
                    />
                    <span className="material-check"><Check size={13} /></span>
                    <span className="page-card-title"><strong>Seite {page}</strong><small>{autoPageKinds[page] ?? "Planseite"}{autoPageKinds[page] && autoPageKinds[page] !== "Grundriss" ? " · nicht vorausgewählt" : ""}{autoDimensionCounts[page] ? ` · ${autoDimensionCounts[page]} Maße erkannt` : ""}</small></span>
                  </label>
                  {autoScaleSource === "pdf" ? (
                    <label className="page-scale-input">
                      <span>Maßstab {autoScaleDetectedPages[page] ? <em className="detected-chip">erkannt</em> : null}</span>
                      <div><b>1 :</b><EditableNumberInput min="1" step="1" placeholder="eingeben" value={denominator} onValueChange={(value) => {
                        setAutoScaleDenominators((current) => ({ ...current, [page]: value }));
                        setAutoScaleDetectedPages((current) => ({ ...current, [page]: false }));
                      }} /></div>
                    </label>
                  ) : <small>Kalibriert über Referenzstrecke</small>}
                </div>
              );
            })}
          </div>

          <div className="auto-notice"><AlertTriangle size={18} /><span><strong>Maßstab und PDF-Maße werden gemeinsam geprüft</strong><small>Fehlt der Maßstab, muss er eingetragen oder über eine bekannte Strecke kalibriert werden. Erkannte Maßketten werden zur Anpassung der Raumgeometrie verwendet; ohne Textstempel bleibt die Konturprüfung erforderlich.</small></span></div>

          <div className="modal-actions auto-actions">
            <button className="button ghost" disabled={isAutoDetecting} onClick={() => { setShowAutoModal(false); setResumeAutoAfterCalibration(true); setAutoScaleSource("calibrated"); setIncludedPages([pageNumber]); selectTool("calibrate"); showToast("Zwei Punkte einer bekannten Strecke anklicken."); }}><Ruler size={16} /> Manuell kalibrieren</button>
            <span className="modal-action-spacer" />
            <button className="button ghost" disabled={isAutoDetecting} onClick={() => setShowAutoModal(false)}>Abbrechen</button>
            <button className="button primary" disabled={isAutoDetecting} onClick={runAutoMeasurement}>{isAutoDetecting ? <><LoaderCircle className="spin" size={16} /> Wird berechnet …</> : <><FileSpreadsheet size={16} /> Berechnen & Excel vorbereiten</>}</button>
          </div>
        </Modal>
      )}

      {showCalibrationModal && (
        <Modal title="Maßstab kalibrieren" subtitle="Gib die tatsächliche Länge der markierten Strecke ein." onClose={() => { setShowCalibrationModal(false); setCalibrationPoints([]); setResumeAutoAfterCalibration(false); }}>
          <div className="calibration-preview"><Ruler size={20} /><span>Referenzstrecke auf Seite {pageNumber}</span><strong>{calibrationPoints.length === 2 ? `${Math.round(distance(calibrationPoints[0], calibrationPoints[1]))} px` : "–"}</strong></div>
          <label className="field-label">Tatsächliche Länge</label>
          <div className="input-with-unit"><input autoFocus inputMode="decimal" value={calibrationDistance} onChange={(event) => setCalibrationDistance(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveCalibration(); }} /><span>m</span></div>
          <p className="form-hint">Am genauesten ist eine möglichst lange, eindeutig bemaßte Strecke.</p>
          <div className="modal-actions"><button className="button ghost" onClick={() => { setShowCalibrationModal(false); setCalibrationPoints([]); setResumeAutoAfterCalibration(false); }}>Abbrechen</button><button className="button primary" onClick={saveCalibration}><Check size={16} /> Kalibrieren</button></div>
        </Modal>
      )}

      {pendingGeometry && (
        <MeasurementModal
          kind={pendingGeometry.kind}
          index={measurements.filter((measurement) => measurement.kind === pendingGeometry.kind).length + 1}
          onClose={() => setPendingGeometry(null)}
          onSave={saveMeasurement}
        />
      )}

      {pendingOpeningPoint && (
        <OpeningModal
          rooms={measurements.filter((measurement) => measurement.kind === "room" && measurement.page === pageNumber)}
          threshold={meta.deductionThreshold}
          selectedRoomId={selected?.kind === "room" ? selected.id : undefined}
          onClose={() => setPendingOpeningPoint(null)}
          onSave={saveOpening}
        />
      )}

      {editingId && measurements.find((measurement) => measurement.id === editingId) && (
        <EditMeasurementModal
          measurement={measurements.find((measurement) => measurement.id === editingId)!}
          onClose={() => setEditingId(null)}
          onSave={(patch) => {
            const current = measurements.find((measurement) => measurement.id === editingId);
            const heightChanged = current?.kind === "room"
              && patch.height !== undefined
              && Math.abs(patch.height - (current.height ?? 0)) > 0.0001;
            updateMeasurement(editingId, heightChanged
              ? { ...patch, heightSource: "manual", heightNote: "Automatisch erkannte Raumhöhe manuell korrigiert." }
              : patch);
            setEditingId(null);
            showToast("Position wurde aktualisiert.");
          }}
        />
      )}

      {showProject && <ProjectModal meta={meta} onClose={() => setShowProject(false)} onSave={(next) => { setMeta({ ...next, updatedAt: new Date().toISOString() }); setProjectStatus("draft"); setProjectSaveState("idle"); setShowProject(false); }} />}

      {showProjectLibrary && (
        <ProjectLibraryModal
          projects={projects}
          currentProjectId={meta.id}
          loading={isProjectsLoading}
          error={projectLibraryError}
          onClose={() => setShowProjectLibrary(false)}
          onRefresh={() => void loadProjectList()}
          onOpen={(project) => void openStoredProject(project)}
          onOpenVersion={(project, revision) => void openStoredProjectVersion(project, revision)}
          onArchive={(project, archived) => void setStoredProjectArchived(project, archived)}
          onDelete={(project) => void deleteStoredProject(project)}
          onRestore={(project) => void restoreStoredProject(project)}
          onNew={startNewProject}
        />
      )}

      {showSettings && (
        <Modal title="Aufmaß-Einstellungen" subtitle="Rechenregeln für dieses Projekt" onClose={() => setShowSettings(false)}>
          <label className="field-label">Abrechnungsgrundlage</label>
          <select className="text-input" value={meta.standard} onChange={(event) => setMeta((current) => ({ ...current, standard: event.target.value, vobRuleSetId: VOB_RULESET.id, vobRuleConfirmed: false, vobRuleConfirmedBy: "", vobRuleConfirmedAt: "" }))}>
            <option>VOB/C · ATV DIN 18363 / DIN 18366:2019-09</option>
            <option>VOB/C · ATV DIN 18363:2019-09</option>
            <option>Freies Aufmaß / vertragliche Regelung</option>
          </select>
          <div className="field-grid two">
            <label><span className="field-label">Übermessungsgrenze</span><div className="input-with-unit"><EditableNumberInput min="0" step="0.1" value={meta.deductionThreshold} onValueChange={(value) => setMeta((current) => ({ ...current, deductionThreshold: value, vobRuleSetId: VOB_RULESET.id, vobRuleConfirmed: false, vobRuleConfirmedBy: "", vobRuleConfirmedAt: "" }))} /><span>m²</span></div></label>
            <label><span className="field-label">Rundung</span><select className="text-input" value={meta.rounding} onChange={(event) => setMeta((current) => ({ ...current, rounding: Number(event.target.value) }))}><option value={2}>2 Stellen</option><option value={3}>3 Stellen</option></select></label>
          </div>
          <div className="rule-notice"><AlertTriangle size={18} /><span><strong>Vertragsgrundlage prüfen</strong><small>Die Software rechnet mit der hier gewählten Grenze. Maßgeblich bleiben Leistungsverzeichnis, Vertrag und die jeweils vereinbarte ATV.</small></span></div>
          {/\bVOB\b/i.test(meta.standard) && <label className="vob-rule-confirm"><input type="checkbox" checked={Boolean(meta.vobRuleConfirmed && meta.vobRuleSetId === VOB_RULESET.id)} onChange={(event) => setMeta((current) => ({ ...current, vobRuleSetId: VOB_RULESET.id, vobRuleConfirmed: event.target.checked, vobRuleConfirmedBy: event.target.checked ? current.estimator.trim() : "", vobRuleConfirmedAt: event.target.checked ? new Date().toISOString() : "" }))} /><span><strong>Regelsatz fachlich bestätigt</strong><small>Ich habe Vertragsgrundlage, vereinbarte ATV-Ausgabe und Schwellenwert für dieses Projekt geprüft.</small></span></label>}
          <div className="modal-actions"><button className="button primary" onClick={() => setShowSettings(false)}><Check size={16} /> Übernehmen</button></div>
        </Modal>
      )}

      {showHelp && (
        <div className="user-manual-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHelp(false); }}><UserManual mode="desktop" onClose={() => setShowHelp(false)} /></div>
      )}

      {toast && <div className="toast"><Check size={17} /><span>{toast}</span></div>}

      <div className="print-report">
        <div className="print-head"><div><strong>DIE MALER SIND LOS · AUFMASS PRO</strong><span>Malermeisterbetrieb Marcus Schwan · info@malerbetriebguestrow.de</span></div><div><small>Erstellt am</small><strong>{new Intl.DateTimeFormat("de-DE").format(new Date())}</strong></div></div>
        <h1>{meta.title}</h1>
        <div className="print-meta"><div><span>Kunde</span><strong>{meta.customer || "–"}</strong></div><div><span>Bauvorhaben</span><strong>{meta.address || "–"}</strong></div><div><span>Bearbeiter</span><strong>{meta.estimator || "–"}</strong></div><div><span>Grundlage</span><strong>{meta.standard}</strong></div><div><span>Ausgewertete PDF-Seiten</span><strong>{includedPages.join(", ") || "–"}</strong></div></div>
        <table><thead><tr><th>Pos.</th><th>Raum / Bereich</th><th>Leistung</th><th>Ansatz</th><th>Abzug</th><th>Ergebnis</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}><td>{String(index + 1).padStart(3, "0")}</td><td>{row.room}</td><td>{row.description}</td><td>{row.formula}</td><td>{row.deduction ? `−${formatNumber(row.deduction)} ${row.unit}` : "–"}</td><td><strong>{formatNumber(row.result)} {row.unit}</strong></td></tr>)}</tbody></table>
        <div className="print-total"><span>Gesamtflächen</span><strong>{formatNumber(totals["m²"] ?? 0)} m²</strong></div>
        <p className="print-note">Berechnung gemäß Projekteinstellung. Öffnungen bis einschließlich {formatNumber(meta.deductionThreshold)} m² werden nach bestätigter Projektregel behandelt. {meta.vobRuleConfirmed ? `Fachlich bestätigt${meta.vobRuleConfirmedBy ? ` durch ${meta.vobRuleConfirmedBy}` : ""}.` : "VOB-/Vertragsregel NICHT fachlich bestätigt – keine ungeprüfte Abrechnungsfreigabe."} Vertrags- und Leistungsvorgaben sind vor Abrechnung zu prüfen.</p>
      </div>
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button onClick={onClose} aria-label="Schließen"><X size={19} /></button></div>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

type AuditTone = "verified" | "review" | "manual";

function getAuditState(measurement: Measurement | undefined, line: LineItem): { tone: AuditTone; source: string; status: string; detail: string } {
  if (!measurement) return { tone: "review", source: "Keine Zuordnung", status: "Prüfen", detail: "Die Aufmaßposition ist keiner Geometrie zugeordnet." };
  if (measurement.areaSource === "pdf-nrf") {
    const geometryMissing = measurement.geometryStatus === "missing" || measurement.geometryStatus === "uncertain";
    if (line.category === "Boden" || line.category === "Decke") {
      return geometryMissing
        ? { tone: "review", source: "PDF-Raumstempel", status: "PDF-Wert · Kontur fehlt", detail: "NRF-Fläche wurde unverändert übernommen; der Raumumfang ist nicht eindeutig bestimmt." }
        : { tone: "verified", source: "PDF-Raumstempel", status: "PDF-Wert", detail: "NRF-Fläche wurde unverändert aus dem digitalen Raumstempel übernommen." };
    }
    if (geometryMissing) return { tone: "review", source: "PDF-Raumstempel", status: "Kontur fehlt", detail: "Wand- und Längenansatz dürfen erst nach einer manuell bestätigten Raumkontur berechnet werden." };
    return { tone: "review", source: "PDF-NRF + Planumfang", status: "Umfang prüfen", detail: "Die Grundfläche stammt aus dem PDF; Umfang und Wandansatz stammen aus der zugeordneten Raumkontur." };
  }
  if (measurement.areaSource === "pdf-dimensions") {
    return { tone: "review", source: "PDF-Maßketten", status: "Kontur prüfen", detail: "Geschlossene Raumkontur wurde mit erkannten Maßketten abgeglichen." };
  }
  if (measurement.areaSource === "pdf-scale") {
    return { tone: "review", source: "Planmaßstab", status: "Kontur prüfen", detail: "Wert wurde aus Raumkontur und geprüftem Planmaßstab berechnet." };
  }
  if (measurement.areaSource === "insta360-reference") {
    return { tone: "manual", source: "Insta360 + Kontrollmaß", status: "Maße prüfen", detail: `${measurement.captureSource?.fileName || "360°-Aufnahme"} · Berechnung aus ${referenceMethodLabel(measurement.captureSource?.referenceMethod ?? "manual")}.` };
  }
  if (measurement.areaSource === "laser-reference") {
    return { tone: "manual", source: measurement.proCapture?.label || "Laser-Aufmaß", status: "Kontrollmaß prüfen", detail: `${measurement.proCapture?.device || "Laser-Messgerät"} · ${measurement.proCapture?.formula || "Eingegebene Lasermaße"}.` };
  }
  if (measurement.areaSource === "special-geometry") {
    return { tone: "manual", source: measurement.proCapture?.label || "Sondergeometrie", status: "Eingaben prüfen", detail: measurement.proCapture?.formula || "Manuell berechnete Sonderfläche." };
  }
  if (measurement.areaSource === "freehand-sketch") {
    return { tone: "review", source: measurement.proCapture?.label || "Freihandskizze", status: "Skizze prüfen", detail: `${measurement.proCapture?.formula || "Automatisch erkannte Raumform"} · Erkennung ${Math.round((measurement.proCapture?.confidence ?? measurement.confidence ?? 0) * 100)} %.` };
  }
  if (measurement.source === "auto") {
    return { tone: "review", source: "Automatisch", status: "Kontur prüfen", detail: "Automatisch erkannte Geometrie bitte mit dem Grundriss vergleichen." };
  }
  return { tone: "manual", source: "Manuelle Messung", status: "Eingabe prüfen", detail: "Manuell gesetzte Punkte, Mengen und Faktoren bitte im Plan kontrollieren." };
}

function AuditModal({
  meta,
  selectedPages,
  rows,
  measurements,
  scales,
  isExporting,
  isExportingPdf,
  isSavingProject,
  projectStatus,
  onInspect,
  onExport,
  onExportPdf,
  onComplete,
  onClose,
}: {
  meta: ProjectMeta;
  selectedPages: number[];
  rows: LineItem[];
  measurements: Measurement[];
  scales: Record<number, number>;
  isExporting: boolean;
  isExportingPdf: boolean;
  isSavingProject: boolean;
  projectStatus: ProjectStatus;
  onInspect: (measurement: Measurement) => void;
  onExport: () => void;
  onExportPdf: () => void;
  onComplete: () => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "review">("all");
  const entries = rows.map((line, index) => {
    const measurement = measurements.find((item) => item.id === line.measurementId);
    return { line, measurement, audit: getAuditState(measurement, line), position: index + 1 };
  });
  const reviewCount = entries.filter((entry) => entry.audit.tone !== "verified").length;
  const visibleEntries = filter === "review" ? entries.filter((entry) => entry.audit.tone !== "verified") : entries;
  const surfaceTotal = rows.filter((row) => row.unit === "m²").reduce((sum, row) => sum + row.result, 0);
  const deductionTotal = rows.filter((row) => row.unit === "m²").reduce((sum, row) => sum + row.deduction, 0);
  const openings = measurements.flatMap((measurement) => (measurement.openings ?? []).map((opening) => ({ measurement, opening, calculation: openingCalculation(opening, meta.deductionThreshold) })));

  return (
    <Modal title="Prüfbares Aufmaß" subtitle="Kontrollansicht mit Herkunft, Rechenweg und VOB-Abzügen" onClose={onClose} wide>
      <div className="audit-intro">
        <span><ClipboardCheck size={22} /></span>
        <div><strong>Jede Menge ist nachvollziehbar</strong><small>PDF-Prüfbericht und Prüf-Excel enthalten dieselben Raumfarben, PDF- oder Insta360-Nachweise, Rechenansätze und VOB-Abzüge. Vorhandene Grundrissseiten werden als farbig markierte Plananlagen angefügt.</small></div>
      </div>

      <div className="audit-summary-grid">
        <span><small>Seiten / Nachweise</small><strong>{selectedPages.join(", ") || "–"}</strong></span>
        <span><small>Positionen</small><strong>{rows.length}</strong></span>
        <span><small>Flächen netto</small><strong>{formatNumber(surfaceTotal)} m²</strong></span>
        <span className={reviewCount ? "attention" : "ok"}><small>Zu kontrollieren</small><strong>{reviewCount}</strong></span>
      </div>

      <div className="audit-legend">
        <span><i className="verified" /> PDF-Wert</span>
        <span><i className="review" /> Kontur / Umfang prüfen</span>
        <span><i className="manual" /> Manuelle Eingabe prüfen</span>
      </div>

      <div className="audit-toolbar">
        <div className="segmented two">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Alle Positionen ({entries.length})</button>
          <button className={filter === "review" ? "active" : ""} onClick={() => setFilter("review")}>Nur kontrollieren ({reviewCount})</button>
        </div>
        <span>VOB-Abzüge: <strong>−{formatNumber(deductionTotal)} m²</strong></span>
      </div>

      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead><tr><th>Pos.</th><th>Seite / Nachweis</th><th>Raum / Bereich</th><th>Herkunft</th><th>Leistung</th><th>Rechenansatz</th><th>Brutto</th><th>Abzug</th><th>Ergebnis</th><th>Status</th><th /></tr></thead>
          <tbody>
            {visibleEntries.map(({ line, measurement, audit, position }) => (
              <tr key={line.id}>
                <td>{String(position).padStart(3, "0")}</td>
                <td>{measurement?.areaSource === "insta360-reference" ? "360°" : measurement?.areaSource === "laser-reference" ? "Laser" : measurement?.areaSource === "special-geometry" ? "Sonderfl." : measurement?.areaSource === "freehand-sketch" ? "Skizze" : measurement?.page ?? "–"}</td>
                <td><span className="audit-room-title"><i style={{ backgroundColor: measurement?.color ?? "#8E1E6E" }} /><strong>{line.room}</strong></span><small>{audit.detail}</small></td>
                <td>{audit.source}</td>
                <td>{line.description}</td>
                <td>{line.formula}</td>
                <td className="number">{formatNumber(line.gross)} {line.unit}</td>
                <td className="number deduction">{line.deduction ? `−${formatNumber(line.deduction)} ${line.unit}` : "–"}</td>
                <td className="number result">{formatNumber(line.result)} {line.unit}</td>
                <td><span className={`audit-status ${audit.tone}`}>{audit.status}</span></td>
                <td>{measurement && <button className="audit-plan-button" onClick={() => onInspect(measurement)}><Eye size={13} /> {measurement.areaSource === "insta360-reference" ? "360°-Bild" : measurement.areaSource === "laser-reference" ? "Laserwerte" : measurement.areaSource === "special-geometry" ? "Formel" : measurement.areaSource === "freehand-sketch" ? "Skizzenwerte" : "Im Plan"}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="audit-basis">
        <h3>Raumgrundlagen</h3>
        <div className="audit-room-grid">
          {measurements.filter((measurement) => measurement.visible && measurement.kind === "room" && (scales[measurement.page] || (measurement.areaOverride !== undefined && measurement.perimeterOverride !== undefined))).map((measurement) => {
            const scale = scales[measurement.page];
            const roomRows = rows.filter((row) => row.measurementId === measurement.id);
            const source = roomRows[0] ? getAuditState(measurement, roomRows[0]).source : "Ohne Position";
            const area = measurement.areaOverride ?? polygonPixels(measurement.points) * scale * scale;
            const geometryMissing = measurement.geometryStatus === "missing" || measurement.geometryStatus === "uncertain";
            const perimeter = geometryMissing ? null : measurement.perimeterOverride ?? polylinePixels(measurement.points, true) * scale;
            return (
              <button key={measurement.id} onClick={() => onInspect(measurement)} style={{ borderLeftColor: measurement.color }}>
                <span><strong>{measurement.name}</strong><small>{measurement.areaSource === "insta360-reference" ? `360°-Nachweis · ${measurement.captureSource?.fileName || "Insta360"}` : measurement.areaSource === "laser-reference" ? `Laser-Nachweis · ${measurement.proCapture?.device || "Kontrollmaß"}` : measurement.areaSource === "special-geometry" ? `Sonderfläche · ${measurement.proCapture?.formula || "Formel"}` : measurement.areaSource === "freehand-sketch" ? `Skizzennachweis · ${measurement.proCapture?.formula || "Kontrollmaß"}` : `Seite ${measurement.page}`} · {source}</small></span>
                <span><small>Grundfläche</small><strong>{formatNumber(area)} m²</strong></span>
                <span><small>Umfang</small><strong>{perimeter === null ? "nicht bestimmt" : `${formatNumber(perimeter)} m`}</strong></span>
                <span><small>Höhe</small><strong>{formatNumber(measurement.height ?? 2.5)} m</strong></span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="audit-openings">
        <h3>VOB-Abzüge und Übermessungen</h3>
        {openings.length ? openings.map(({ measurement, opening, calculation }) => (
          <div key={opening.id}>
            <span><strong>{measurement.name} · {opening.name}</strong><small>{formatNumber(opening.width)} × {formatNumber(opening.height)} m × {opening.quantity} = {formatNumber(calculation.gross)} m²{calculation.revealDepth > 0 ? ` · Laibung ${calculation.revealSides}-seitig: ${formatNumber(calculation.revealGross)} m² brutto` : ""}</small></span>
            <span className={calculation.overmeasured ? "over" : calculation.deduct ? "deduct" : "manual"}>{calculation.isDoor ? calculation.overmeasured ? "Tür übermessen · Zarge, keine Laibung" : `Türabzug −${formatNumber(calculation.deduct)} m² · Zarge, keine Laibung` : calculation.overmeasured ? "übermessen · Laibung nicht zusätzlich angesetzt" : calculation.deduct ? `Abzug −${formatNumber(calculation.deduct)} m²${calculation.revealDepth > 0 ? ` · Laibung +${formatNumber(calculation.revealResult)} m²` : ""}` : "kein Abzug"}</span>
          </div>
        )) : <p>Noch keine Fenster- oder Türöffnungen erfasst. Wandflächen enthalten deshalb keine Abzüge.</p>}
      </section>

      <div className="audit-note"><AlertTriangle size={16} /><span><strong>Prüfhinweis</strong><small>PDF-Raumstempel sind direkte Planwerte. Automatisch erkannte Raumkonturen, Umfänge, Raumhöhen und Öffnungen müssen vor Abrechnung mit Plan und Leistungsverzeichnis abgeglichen werden.</small></span></div>

      <div className="modal-actions audit-actions">
        <button className="button ghost" disabled={isExporting || isExportingPdf || isSavingProject} onClick={onClose}>Schließen</button>
        {projectStatus !== "completed" && <button className="button secondary" disabled={isExporting || isExportingPdf || isSavingProject} onClick={onComplete}>{isSavingProject ? <><LoaderCircle className="spin" size={16} /> Wird gespeichert …</> : <><Check size={16} /> Fertigstellen & speichern</>}</button>}
        <button className="button secondary" disabled={isExporting || isExportingPdf} onClick={onExportPdf}>{isExportingPdf ? <><LoaderCircle className="spin" size={16} /> PDF wird erstellt …</> : <><FileDown size={16} /> Prüfbericht als PDF</>}</button>
        <button className="button primary" disabled={isExporting || isExportingPdf} onClick={onExport}>{isExporting ? <><LoaderCircle className="spin" size={16} /> Prüf-Excel wird erstellt …</> : <><FileSpreadsheet size={16} /> Farbige Prüf-Excel</>}</button>
      </div>
    </Modal>
  );
}

function ExcelExportModal({
  settings,
  preview,
  selectedPages,
  measurementSummary,
  confirmed,
  isExporting,
  onChange,
  onConfirm,
  onClose,
  onExport,
}: {
  settings: MaterialSettings;
  preview: MaterialPreview;
  selectedPages: number[];
  measurementSummary: { positions: number; surfaceArea: number; length: number };
  confirmed: boolean;
  isExporting: boolean;
  onChange: (settings: MaterialSettings) => void;
  onConfirm: (confirmed: boolean) => void;
  onClose: () => void;
  onExport: () => void;
}) {
  const updatePaint = (patch: Partial<MaterialSettings["paint"]>) => onChange({ ...settings, paint: { ...settings.paint, ...patch } });
  const updateFiller = (patch: Partial<MaterialSettings["filler"]>) => onChange({ ...settings, filler: { ...settings.filler, ...patch } });
  const updateWallpaper = (patch: Partial<MaterialSettings["wallpaper"]>) => onChange({ ...settings, wallpaper: { ...settings.wallpaper, ...patch } });

  return (
    <Modal title="Excel-Aufmaß & Materialbedarf" subtitle="Prüfbarer Bericht für Architekten, Bauleitung und Abrechnung" onClose={onClose} wide>
      <div className="excel-intro">
        <span><FileSpreadsheet size={22} /></span>
        <div><strong>Professionelle Excel-Arbeitsmappe</strong><small>PDF-Seiten {selectedPages.join(", ")} · Jede Position trägt dieselbe Raumfarbe wie die Kontur im Grundriss und ist über die Farbzuordnung eindeutig auffindbar.</small></div>
      </div>

      <div className="excel-sheet-list">
        <span><Check size={14} /> Übersicht</span>
        <span><Check size={14} /> Aufmaß nach VOB</span>
        <span><Check size={14} /> Raumgeometrie</span>
        <span><Check size={14} /> Farbzuordnung</span>
        <span><Check size={14} /> Materialbedarf</span>
      </div>

      <div className="excel-measure-preview">
        <span><small>Seiten im Excel</small><strong>{selectedPages.join(", ")}</strong></span>
        <span><small>Aufmaßpositionen</small><strong>{measurementSummary.positions}</strong></span>
        <span><small>Flächen gesamt</small><strong>{formatNumber(measurementSummary.surfaceArea)} m²</strong></span>
        <span><small>Längen gesamt</small><strong>{formatNumber(measurementSummary.length)} m</strong></span>
      </div>

      <section className={`material-card ${settings.paint.enabled ? "enabled" : ""}`}>
        <label className="material-card-head">
          <input type="checkbox" checked={settings.paint.enabled} onChange={(event) => updatePaint({ enabled: event.target.checked })} />
          <span className="material-check"><Check size={14} /></span>
          <span><strong>Farbe berechnen</strong><small>Liter und volle Gebinde aus Wand- und/oder Deckenflächen</small></span>
          {settings.paint.enabled && <em>{formatNumber(preview.paint.liters)} l · {preview.paint.containers} Gebinde</em>}
        </label>
        {settings.paint.enabled && (
          <div className="material-card-body">
            <label><span className="field-label">Material / Produktbezeichnung</span><input className="text-input" value={settings.paint.name} onChange={(event) => updatePaint({ name: event.target.value })} /></label>
            <label className="field-label with-top">Zu beschichtende Flächen</label>
            <div className="check-grid">
              <label className={settings.paint.includeWalls ? "checked" : ""}><input type="checkbox" checked={settings.paint.includeWalls} onChange={(event) => updatePaint({ includeWalls: event.target.checked })} /><span><Check size={14} /></span>Wandflächen</label>
              <label className={settings.paint.includeCeilings ? "checked" : ""}><input type="checkbox" checked={settings.paint.includeCeilings} onChange={(event) => updatePaint({ includeCeilings: event.target.checked })} /><span><Check size={14} /></span>Deckenflächen</label>
            </div>
            <label className="field-label with-top">Wie steht der Verbrauch im Produktdatenblatt?</label>
            <div className="segmented two">
              <button className={settings.paint.mode === "coverage" ? "active" : ""} onClick={() => updatePaint({ mode: "coverage" })}>Ergiebigkeit m²/l</button>
              <button className={settings.paint.mode === "consumption" ? "active" : ""} onClick={() => updatePaint({ mode: "consumption" })}>Verbrauch ml/m²</button>
            </div>
            <div className="field-grid four with-top">
              <label><span className="field-label">{settings.paint.mode === "coverage" ? "Ergiebigkeit" : "Verbrauch"}</span><div className="input-with-unit"><EditableNumberInput min="0.01" step="0.1" value={settings.paint.mode === "coverage" ? settings.paint.coverage : settings.paint.consumption} onValueChange={(value) => settings.paint.mode === "coverage" ? updatePaint({ coverage: value }) : updatePaint({ consumption: value })} /><span>{settings.paint.mode === "coverage" ? "m²/l" : "ml/m²"}</span></div></label>
              <label><span className="field-label">Anstriche</span><div className="input-with-unit"><EditableNumberInput min="1" step="1" value={settings.paint.coats} onValueChange={(value) => updatePaint({ coats: value })} /><span>×</span></div></label>
              <label><span className="field-label">Reserve</span><div className="input-with-unit"><EditableNumberInput min="0" step="1" value={settings.paint.reserve} onValueChange={(value) => updatePaint({ reserve: value })} /><span>%</span></div></label>
              <label><span className="field-label">Gebindegröße</span><div className="input-with-unit"><EditableNumberInput min="0.1" step="0.5" value={settings.paint.containerSize} onValueChange={(value) => updatePaint({ containerSize: value })} /><span>l</span></div></label>
            </div>
            <div className="material-result"><span>Bezugsfläche <strong>{formatNumber(preview.paint.area)} m²</strong></span><span>Bedarf inkl. Reserve <strong>{formatNumber(preview.paint.liters)} l</strong></span><span>Bestellmenge <strong>{preview.paint.containers} Gebinde</strong></span></div>
          </div>
        )}
      </section>

      <section className={`material-card ${settings.filler.enabled ? "enabled" : ""}`}>
        <label className="material-card-head">
          <input type="checkbox" checked={settings.filler.enabled} onChange={(event) => updateFiller({ enabled: event.target.checked })} />
          <span className="material-check"><Check size={14} /></span>
          <span><strong>Spachtelmasse berechnen</strong><small>Kilogramm und volle Gebinde nach Verbrauch und Schichtdicke</small></span>
          {settings.filler.enabled && <em>{formatNumber(preview.filler.kilograms)} kg · {preview.filler.packages} Gebinde</em>}
        </label>
        {settings.filler.enabled && (
          <div className="material-card-body">
            <label><span className="field-label">Material / Produktbezeichnung</span><input className="text-input" value={settings.filler.name} onChange={(event) => updateFiller({ name: event.target.value })} /></label>
            <label className="field-label with-top">Zu spachtelnde Flächen</label>
            <div className="check-grid">
              <label className={settings.filler.includeWalls ? "checked" : ""}><input type="checkbox" checked={settings.filler.includeWalls} onChange={(event) => updateFiller({ includeWalls: event.target.checked })} /><span><Check size={14} /></span>Wandflächen</label>
              <label className={settings.filler.includeCeilings ? "checked" : ""}><input type="checkbox" checked={settings.filler.includeCeilings} onChange={(event) => updateFiller({ includeCeilings: event.target.checked })} /><span><Check size={14} /></span>Deckenflächen</label>
            </div>
            <div className="field-grid four with-top">
              <label><span className="field-label">Verbrauch</span><div className="input-with-unit"><EditableNumberInput min="0.01" step="0.1" value={settings.filler.consumption} onValueChange={(value) => updateFiller({ consumption: value })} /><span>kg/m²/mm</span></div></label>
              <label><span className="field-label">Schichtdicke</span><div className="input-with-unit"><EditableNumberInput min="0.1" step="0.1" value={settings.filler.thickness} onValueChange={(value) => updateFiller({ thickness: value })} /><span>mm</span></div></label>
              <label><span className="field-label">Reserve</span><div className="input-with-unit"><EditableNumberInput min="0" step="1" value={settings.filler.reserve} onValueChange={(value) => updateFiller({ reserve: value })} /><span>%</span></div></label>
              <label><span className="field-label">Gebindegröße</span><div className="input-with-unit"><EditableNumberInput min="0.1" step="1" value={settings.filler.packageSize} onValueChange={(value) => updateFiller({ packageSize: value })} /><span>kg</span></div></label>
            </div>
            <div className="material-result"><span>Bezugsfläche <strong>{formatNumber(preview.filler.area)} m²</strong></span><span>Bedarf inkl. Reserve <strong>{formatNumber(preview.filler.kilograms)} kg</strong></span><span>Bestellmenge <strong>{preview.filler.packages} Gebinde</strong></span></div>
          </div>
        )}
      </section>

      <section className={`material-card ${settings.wallpaper.enabled ? "enabled" : ""}`}>
        <label className="material-card-head">
          <input type="checkbox" checked={settings.wallpaper.enabled} onChange={(event) => updateWallpaper({ enabled: event.target.checked })} />
          <span className="material-check"><Check size={14} /></span>
          <span><strong>Tapete berechnen</strong><small>Rollenbedarf nach Raumumfang, Bahnen, Rapport und Versatz</small></span>
          {settings.wallpaper.enabled && <em>{preview.wallpaper.rolls} Rollen · {preview.wallpaper.rooms} Räume</em>}
        </label>
        {settings.wallpaper.enabled && (
          <div className="material-card-body">
            <label><span className="field-label">Tapetenbezeichnung / Kollektion</span><input className="text-input" value={settings.wallpaper.name} onChange={(event) => updateWallpaper({ name: event.target.value })} /></label>
            <div className="field-grid four with-top">
              <label><span className="field-label">Rollenbreite</span><div className="input-with-unit"><EditableNumberInput min="0.01" step="0.01" value={settings.wallpaper.rollWidth} onValueChange={(value) => updateWallpaper({ rollWidth: value })} /><span>m</span></div></label>
              <label><span className="field-label">Rollenlänge</span><div className="input-with-unit"><EditableNumberInput min="0.1" step="0.01" value={settings.wallpaper.rollLength} onValueChange={(value) => updateWallpaper({ rollLength: value })} /><span>m</span></div></label>
              <label><span className="field-label">Zugabe je Bahn</span><div className="input-with-unit"><EditableNumberInput min="0.01" step="1" value={Math.round(settings.wallpaper.allowance * 100)} onValueChange={(value) => updateWallpaper({ allowance: value / 100 })} /><span>cm</span></div></label>
              <label><span className="field-label">Reserve</span><div className="input-with-unit"><EditableNumberInput min="0" step="1" value={settings.wallpaper.reserve} onValueChange={(value) => updateWallpaper({ reserve: value })} /><span>%</span></div></label>
            </div>
            <label className="field-label with-top">Rapport / Musteransatz</label>
            <div className="segmented three">
              <button className={settings.wallpaper.match === "none" ? "active" : ""} onClick={() => updateWallpaper({ match: "none" })}>Ohne Ansatz</button>
              <button className={settings.wallpaper.match === "straight" ? "active" : ""} onClick={() => updateWallpaper({ match: "straight" })}>Gerader Ansatz</button>
              <button className={settings.wallpaper.match === "offset" ? "active" : ""} onClick={() => updateWallpaper({ match: "offset" })}>Versetzter Ansatz</button>
            </div>
            {settings.wallpaper.match !== "none" && <label className="rapport-field"><span className="field-label">Rapport laut Rollenetikett</span><div className="input-with-unit"><EditableNumberInput min="0.1" step="0.5" value={Math.round(settings.wallpaper.repeat * 1000) / 10} onValueChange={(value) => updateWallpaper({ repeat: value / 100 })} /><span>cm</span></div></label>}
            <div className="material-result"><span>Räume mit Wandfläche <strong>{preview.wallpaper.rooms}</strong></span><span>Ansatz <strong>{settings.wallpaper.match === "none" ? "ohne" : settings.wallpaper.match === "straight" ? "gerade" : "versetzt"}</strong></span><span>Bestellmenge <strong>{preview.wallpaper.rolls} Rollen</strong></span></div>
            <p className="form-hint">Die Rollenberechnung erfolgt bahnenweise aus Raumumfang und Raumhöhe. Bei versetztem Ansatz wird konservativ ein halber Rapport je Bahn berücksichtigt.</p>
          </div>
        )}
      </section>

      <label className={`export-confirm ${confirmed ? "checked" : ""}`}>
        <input type="checkbox" checked={confirmed} onChange={(event) => onConfirm(event.target.checked)} />
        <span><Check size={15} /></span>
        <span><strong>Materialangaben geprüft</strong><small>Verbrauch, Gebinde-/Rollengröße, Arbeitsgänge, Rapport und Reserve entsprechen den vorgesehenen Produkten.</small></span>
      </label>

      <div className="vob-export-note"><Building2 size={18} /><span><strong>VOB-Ausweisung in der Excel-Datei</strong><small>Beschichtungs- und Spachtelarbeiten werden nach ATV DIN 18363, Tapezierarbeiten nach ATV DIN 18366 gekennzeichnet. Vertrag und Leistungsverzeichnis bleiben maßgeblich.</small></span></div>

      <div className="modal-actions"><button className="button ghost" disabled={isExporting} onClick={onClose}>Abbrechen</button><button className="button primary" disabled={!confirmed || isExporting} onClick={onExport}>{isExporting ? <><LoaderCircle className="spin" size={16} /> Excel wird erstellt …</> : <><FileSpreadsheet size={16} /> Excel-Datei erstellen</>}</button></div>
    </Modal>
  );
}

function MeasurementModal({ kind, index, onClose, onSave }: { kind: MeasurementKind; index: number; onClose: () => void; onSave: (values: { name: string; height: number; quantity: number; factor: number; includeFloor: boolean; includeCeiling: boolean; includeWalls: boolean; includeSkirting: boolean; category: string }) => void }) {
  const defaultName = kind === "room" ? `Raum ${String(index).padStart(2, "0")}` : kind === "area" ? `Fläche ${String(index).padStart(2, "0")}` : kind === "line" ? `Länge ${String(index).padStart(2, "0")}` : `Bauteil ${String(index).padStart(2, "0")}`;
  const [name, setName] = useState(defaultName);
  const [height, setHeight] = useState(2.5);
  const [quantity, setQuantity] = useState(1);
  const [factor, setFactor] = useState(1);
  const [includeFloor, setIncludeFloor] = useState(false);
  const [includeCeiling, setIncludeCeiling] = useState(true);
  const [includeWalls, setIncludeWalls] = useState(true);
  const [includeSkirting, setIncludeSkirting] = useState(false);
  const [category, setCategory] = useState(kind === "area" ? "Wand" : kind === "line" ? "Sockelleiste" : "");
  const title = kind === "room" ? "Raum übernehmen" : kind === "area" ? "Fläche übernehmen" : kind === "line" ? "Länge übernehmen" : "Stückzahl übernehmen";
  const validInputs = Number.isFinite(quantity) && quantity > 0
    && Number.isFinite(factor) && factor > 0
    && (kind !== "room" || (Number.isFinite(height) && height > 0));

  return (
    <Modal title={title} subtitle="Bezeichnung und Berechnungsart festlegen" onClose={onClose}>
      <label className="field-label">Bezeichnung</label>
      <input className="text-input" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
      {kind === "room" && (
        <>
          <label className="field-label with-top">Zu berechnende Mengen</label>
          <div className="check-grid">
            {[{ label: "Wände", value: includeWalls, set: setIncludeWalls }, { label: "Decke", value: includeCeiling, set: setIncludeCeiling }, { label: "Boden", value: includeFloor, set: setIncludeFloor }, { label: "Sockelleiste", value: includeSkirting, set: setIncludeSkirting }].map((item) => (
              <label key={item.label} className={item.value ? "checked" : ""}><input type="checkbox" checked={item.value} onChange={(event) => item.set(event.target.checked)} /><span><Check size={14} /></span>{item.label}</label>
            ))}
          </div>
          <label className="field-label with-top">Raumhöhe</label>
          <div className="input-with-unit"><EditableNumberInput min="0.1" step="0.01" value={height} onValueChange={setHeight} /><span>m</span></div>
        </>
      )}
      {kind === "area" && <><label className="field-label with-top">Flächenart</label><select className="text-input" value={category} onChange={(event) => setCategory(event.target.value)}>{areaCategories.map((item) => <option key={item}>{item}</option>)}</select></>}
      {kind === "line" && <><label className="field-label with-top">Längenart</label><select className="text-input" value={category} onChange={(event) => setCategory(event.target.value)}>{lineCategories.map((item) => <option key={item}>{item}</option>)}</select></>}
      <div className="field-grid two with-top"><label><span className="field-label">Anzahl</span><EditableNumberInput className="text-input" min="1" step="1" value={quantity} onValueChange={setQuantity} /></label><label><span className="field-label">Faktor</span><EditableNumberInput className="text-input" min="0.01" step="0.1" value={factor} onValueChange={setFactor} /></label></div>
      <div className="modal-actions"><button className="button ghost" onClick={onClose}>Abbrechen</button><button className="button primary" disabled={!name.trim() || !validInputs} onClick={() => onSave({ name: name.trim(), height, quantity, factor, includeFloor, includeCeiling, includeWalls, includeSkirting, category })}><Check size={16} /> Übernehmen</button></div>
    </Modal>
  );
}

function OpeningModal({ rooms, threshold, selectedRoomId, onClose, onSave }: { rooms: Measurement[]; threshold: number; selectedRoomId?: string; onClose: () => void; onSave: (values: { roomId: string; name: string; width: number; height: number; quantity: number; mode: Opening["mode"]; openingKind: NonNullable<Opening["openingKind"]>; revealDepth: number }) => void }) {
  const [roomId, setRoomId] = useState(selectedRoomId ?? rooms[0]?.id ?? "");
  const [name, setName] = useState("Tür");
  const [width, setWidth] = useState(1.01);
  const [height, setHeight] = useState(2.01);
  const [quantity, setQuantity] = useState(1);
  const [mode, setMode] = useState<Opening["mode"]>("vob");
  const [openingKind, setOpeningKind] = useState<NonNullable<Opening["openingKind"]>>("door");
  const [revealDepth, setRevealDepth] = useState(0);
  const preview = calculateOpeningRule({ name, openingKind, width, height, quantity, mode, revealDepth }, threshold);
  const { each, deduct, isDoor, overmeasured: isOvermeasured, revealGross, revealSeparate } = preview;
  const validInputs = Boolean(roomId && name.trim())
    && Number.isFinite(width) && width > 0
    && Number.isFinite(height) && height > 0
    && Number.isFinite(quantity) && quantity > 0;


  return (
    <Modal title="Öffnung / Abzug" subtitle="Fenster, Türen und Nischen VOB-gerecht behandeln" onClose={onClose}>
      <label className="field-label">Zuordnung zum Raum</label>
      <select className="text-input" value={roomId} onChange={(event) => setRoomId(event.target.value)}>{rooms.map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}</select>
      <label className="field-label with-top">Bezeichnung</label>
      <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} />
      <label className="field-label with-top">Art der Öffnung</label>
      <select className="text-input" value={openingKind} onChange={(event) => { const kind = event.target.value as NonNullable<Opening["openingKind"]>; setOpeningKind(kind); if (kind === "door") { setName("Tür"); setMode("vob"); setRevealDepth(0); } else if (kind === "window") setName("Fenster"); }}><option value="door">Tür – VOB-Grenze prüfen, keine Laibung</option><option value="window">Fenster – VOB-Grenze prüfen</option><option value="other">Sonstige Öffnung – VOB-Grenze prüfen</option></select>
      <div className="field-grid three with-top"><label><span className="field-label">Breite</span><div className="input-with-unit"><EditableNumberInput min="0" step="0.01" value={width} onValueChange={setWidth} /><span>m</span></div></label><label><span className="field-label">Höhe</span><div className="input-with-unit"><EditableNumberInput min="0" step="0.01" value={height} onValueChange={setHeight} /><span>m</span></div></label><label><span className="field-label">Anzahl</span><EditableNumberInput className="text-input" min="1" value={quantity} onValueChange={setQuantity} /></label></div>
      {!isDoor && <div className="field-grid two with-top"><label><span className="field-label">Laibungstiefe</span><div className="input-with-unit"><EditableNumberInput min="0" step="0.01" value={revealDepth} onValueChange={(value) => setRevealDepth(Math.max(0, value))} /><span>m</span></div></label><label><span className="field-label">Laibung</span><input className="text-input" value="3-seitig: links, rechts, oben" disabled /></label></div>}
      {!isDoor && <><label className="field-label with-top">Abzugsregel</label><div className="segmented"><button className={mode === "vob" ? "active" : ""} onClick={() => setMode("vob")}>VOB prüfen</button><button className={mode === "always" ? "active" : ""} onClick={() => setMode("always")}>Immer abziehen</button><button className={mode === "never" ? "active" : ""} onClick={() => setMode("never")}>Übermessen</button></div></>}
      <div className={`calculation-box ${isOvermeasured ? "positive" : "deduction"}`}><span>{isOvermeasured ? <Check size={18} /> : <DoorOpen size={18} />}<small>Einzelfläche</small><strong>{formatNumber(each)} m²</strong></span><span><small>Behandlung</small><strong>{isOvermeasured ? "wird übermessen" : deduct ? `−${formatNumber(deduct)} m²` : "kein Abzug"}</strong></span></div>
      {!isDoor && revealDepth > 0 && <div className={`calculation-box ${revealSeparate ? "deduction" : "positive"}`}><span><DoorOpen size={18} /><small>Laibung brutto</small><strong>{formatNumber(revealGross)} m²</strong></span><span><small>Ansatz</small><strong>{revealSeparate ? `${formatNumber(revealGross)} m² separat` : "0,00 m² zusätzlich"}</strong></span></div>}
      <p className="form-hint">{isDoor ? `Türöffnung: bis einschließlich ${formatNumber(threshold)} m² übermessen, darüber vollständig abziehen. Wegen der Zarge wird keine Laibung angesetzt.` : `VOB-Grenze dieses Projekts: ${formatNumber(threshold)} m² je Öffnung. Laibungen werden immer 3-seitig (links, rechts, oben) berechnet.`}</p>
      <div className="modal-actions"><button className="button ghost" onClick={onClose}>Abbrechen</button><button className="button primary" disabled={!validInputs} onClick={() => onSave({ roomId, name: name.trim(), width, height, quantity, mode, openingKind, revealDepth: isDoor ? 0 : revealDepth })}><Check size={16} /> Öffnung übernehmen</button></div>
    </Modal>
  );
}

function EditMeasurementModal({ measurement, onClose, onSave }: { measurement: Measurement; onClose: () => void; onSave: (patch: Partial<Measurement>) => void }) {
  const [name, setName] = useState(measurement.name);
  const [height, setHeight] = useState(measurement.height ?? 2.5);
  const [quantity, setQuantity] = useState(measurement.quantity);
  const [factor, setFactor] = useState(measurement.factor);
  const [includeFloor, setIncludeFloor] = useState(measurement.includeFloor ?? false);
  const [includeCeiling, setIncludeCeiling] = useState(measurement.includeCeiling ?? false);
  const [includeWalls, setIncludeWalls] = useState(measurement.includeWalls ?? false);
  const [includeSkirting, setIncludeSkirting] = useState(measurement.includeSkirting ?? false);
  const [category, setCategory] = useState(measurement.areaCategory ?? measurement.lineCategory ?? "");
  const validInputs = Number.isFinite(quantity) && quantity > 0
    && Number.isFinite(factor) && factor > 0
    && (measurement.kind !== "room" || (Number.isFinite(height) && height > 0));

  return (
    <Modal title="Position bearbeiten" subtitle="Bezeichnung und Berechnungsansatz ändern" onClose={onClose}>
      <label className="field-label">Bezeichnung</label>
      <input className="text-input" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
      {measurement.kind === "room" && (
        <>
          <label className="field-label with-top">Zu berechnende Mengen</label>
          <div className="check-grid">
            {[{ label: "Wände", value: includeWalls, set: setIncludeWalls }, { label: "Decke", value: includeCeiling, set: setIncludeCeiling }, { label: "Boden", value: includeFloor, set: setIncludeFloor }, { label: "Sockelleiste", value: includeSkirting, set: setIncludeSkirting }].map((item) => (
              <label key={item.label} className={item.value ? "checked" : ""}><input type="checkbox" checked={item.value} onChange={(event) => item.set(event.target.checked)} /><span><Check size={14} /></span>{item.label}</label>
            ))}
          </div>
          <label className="field-label with-top">Raumhöhe</label>
          <div className="input-with-unit"><EditableNumberInput min="0.1" step="0.01" value={height} onValueChange={setHeight} /><span>m</span></div>
        </>
      )}
      {measurement.kind === "area" && <><label className="field-label with-top">Flächenart</label><select className="text-input" value={category} onChange={(event) => setCategory(event.target.value)}>{areaCategories.map((item) => <option key={item}>{item}</option>)}</select></>}
      {measurement.kind === "line" && <><label className="field-label with-top">Längenart</label><select className="text-input" value={category} onChange={(event) => setCategory(event.target.value)}>{lineCategories.map((item) => <option key={item}>{item}</option>)}</select></>}
      <div className="field-grid two with-top"><label><span className="field-label">Anzahl</span><EditableNumberInput className="text-input" min="1" step="1" value={quantity} onValueChange={setQuantity} /></label><label><span className="field-label">Faktor</span><EditableNumberInput className="text-input" min="0.01" step="0.1" value={factor} onValueChange={setFactor} /></label></div>
      <div className="modal-actions"><button className="button ghost" onClick={onClose}>Abbrechen</button><button className="button primary" disabled={!name.trim() || !validInputs} onClick={() => onSave({ name: name.trim(), height: measurement.kind === "room" ? height : measurement.height, quantity, factor, includeFloor, includeCeiling, includeWalls, includeSkirting, areaCategory: measurement.kind === "area" ? category : measurement.areaCategory, lineCategory: measurement.kind === "line" ? category : measurement.lineCategory })}><Check size={16} /> Änderungen speichern</button></div>
    </Modal>
  );
}

function ProjectTabs({
  projects,
  currentProjectId,
  currentTitle,
  currentStatus,
  currentPositionCount,
  saveState,
  loading,
  onOpen,
  onLibrary,
  onNew,
}: {
  projects: ProjectSummary[];
  currentProjectId: string;
  currentTitle: string;
  currentStatus: ProjectStatus;
  currentPositionCount: number;
  saveState: ProjectSaveState;
  loading: boolean;
  onOpen: (project: ProjectSummary) => void;
  onLibrary: () => void;
  onNew: () => void;
}) {
  const activeProjects = projects.filter((project) => !project.archivedAt && !project.trashedAt);
  const currentIsListed = activeProjects.some((project) => project.id === currentProjectId);
  return (
    <nav className="project-sheet-tabs" aria-label="Gespeicherte Projekte">
      <button className="project-tab-action new" onClick={onNew} title="Neues Projekt anlegen" aria-label="Neues Projekt anlegen"><Plus size={16} /></button>
      <button className="project-tab-action library" onClick={onLibrary}><FolderOpen size={15} /><span>Alle Projekte</span></button>
      <details className="project-sheet-picker">
        <summary className={`project-sheet-current ${currentStatus}`} title="Projektliste untereinander öffnen">
          {currentStatus === "completed" ? <LockKeyhole size={13} /> : <FileText size={13} />}
          <span>{currentTitle || "Neues Projekt"}{saveState !== "saved" ? " *" : ""}</span>
          <small>{currentPositionCount}</small>
          <em>{loading ? "Lädt …" : `${activeProjects.length} ${activeProjects.length === 1 ? "Projekt" : "Projekte"}`}</em>
        </summary>
        <div className="project-sheet-tab-stack" aria-label="Projekte untereinander">
          {!currentIsListed && (
            <button className={`project-sheet-tab active ${currentStatus}`} aria-current="page" title={currentTitle || "Neues Projekt"}>
              {currentStatus === "completed" ? <LockKeyhole size={13} /> : <FileText size={13} />}
              <span>{currentTitle || "Neues Projekt"}{saveState !== "saved" ? " *" : ""}</span>
              <small>{currentPositionCount}</small>
            </button>
          )}
          {activeProjects.map((project) => {
            const active = project.id === currentProjectId;
            return (
              <button
                key={project.id}
                className={`project-sheet-tab ${project.status} ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
                title={`${project.title} · ${project.positionCount} Positionen${project.status === "completed" ? " · fertiggestellt" : ""}`}
                disabled={loading && !active}
                onClick={(event) => {
                  if (!active) onOpen(project);
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                {project.status === "completed" ? <LockKeyhole size={13} /> : <FileText size={13} />}
                <span>{project.title}</span>
                <small>{project.positionCount}</small>
              </button>
            );
          })}
          {loading && !activeProjects.length && <span className="project-tab-loading"><LoaderCircle className="spin" size={14} /> Projekte werden geladen …</span>}
        </div>
      </details>
    </nav>
  );
}

function ProjectLibraryModal({
  projects,
  currentProjectId,
  loading,
  error,
  onClose,
  onRefresh,
  onOpen,
  onOpenVersion,
  onArchive,
  onDelete,
  onRestore,
  onNew,
}: {
  projects: ProjectSummary[];
  currentProjectId: string;
  loading: boolean;
  error: string;
  onClose: () => void;
  onRefresh: () => void;
  onOpen: (project: ProjectSummary) => void;
  onOpenVersion: (project: ProjectSummary, revision: number) => void;
  onArchive: (project: ProjectSummary, archived: boolean) => void;
  onDelete: (project: ProjectSummary) => void;
  onRestore: (project: ProjectSummary) => void;
  onNew: () => void;
}) {
  const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });
  const [versionProjectId, setVersionProjectId] = useState("");
  const [versions, setVersions] = useState<Array<{ revision: number; status: string; createdAt: string }>>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [auditProjectId, setAuditProjectId] = useState("");
  const [auditEvents, setAuditEvents] = useState<ProjectAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [view, setView] = useState<"active" | "archived" | "trash">("active");
  const activeCount = projects.filter((project) => !project.archivedAt && !project.trashedAt).length;
  const archivedCount = projects.filter((project) => Boolean(project.archivedAt) && !project.trashedAt).length;
  const trashCount = projects.filter((project) => Boolean(project.trashedAt)).length;
  const visibleProjects = projects.filter((project) => view === "trash" ? Boolean(project.trashedAt) : view === "archived" ? Boolean(project.archivedAt) && !project.trashedAt : !project.archivedAt && !project.trashedAt);

  async function toggleVersions(project: ProjectSummary) {
    if (versionProjectId === project.id) {
      setVersionProjectId("");
      return;
    }
    setVersionProjectId(project.id);
    setVersions([]);
    setVersionsLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/versions`, { cache: "no-store" });
      const body = await response.json() as { versions?: Array<{ revision: number; status: string; createdAt: string }> };
      setVersions(response.ok ? body.versions ?? [] : []);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function toggleAudit(project: ProjectSummary) {
    if (auditProjectId === project.id) {
      setAuditProjectId("");
      return;
    }
    setAuditProjectId(project.id);
    setAuditEvents([]);
    setAuditError("");
    setAuditLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/audit`, { cache: "no-store" });
      const body = await response.json() as { events?: ProjectAuditEvent[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Das Änderungsprotokoll konnte nicht geladen werden.");
      setAuditEvents(body.events ?? []);
    } catch (cause) {
      setAuditError(cause instanceof Error ? cause.message : "Das Änderungsprotokoll konnte nicht geladen werden.");
    } finally {
      setAuditLoading(false);
    }
  }

  function auditActionLabel(action: string) {
    return ({
      "project.created": "Projekt angelegt",
      "project.saved": "Projekt gespeichert",
      "project.archived": "Projekt archiviert",
      "project.unarchived": "Aus Archiv wiederhergestellt",
      "project.trashed": "In Papierkorb verschoben",
      "project.restored": "Aus Papierkorb wiederhergestellt",
    } as Record<string, string>)[action] ?? action;
  }

  function auditValue(value: ProjectAuditEvent["changes"][number]["before"]) {
    if (value === null) return "—";
    if (typeof value === "boolean") return value ? "Ja" : "Nein";
    return String(value);
  }
  return (
    <Modal title="Projektablage" subtitle="Grundriss-PDF, Insta360-Aufnahmen und vollständiges Aufmaß projektbezogen gespeichert" onClose={onClose} wide>
      <div className="project-library-intro">
        <span><FolderOpen size={23} /></span>
        <div><strong>Dauerhafte Projektablage</strong><small>Jedes Projekt enthält Projektdaten, PDF-Seiten, Insta360-Raumnachweise, Maßstäbe, Raumkonturen, VOB-Abzüge, Materialwerte und die zugehörigen Originaldateien.</small></div>
        <button className="button primary" onClick={onNew}><FolderPlus size={16} /> Neues Projekt</button>
      </div>

      <div className="project-library-toolbar">
        <div className="project-library-views" role="tablist" aria-label="Projektstatus">
          <button role="tab" aria-selected={view === "active"} className={view === "active" ? "active" : ""} onClick={() => setView("active")}><FolderOpen size={14} /> Projekte <b>{activeCount}</b></button>
          <button role="tab" aria-selected={view === "archived"} className={view === "archived" ? "active" : ""} onClick={() => setView("archived")}><Archive size={14} /> Archiv <b>{archivedCount}</b></button>
          <button role="tab" aria-selected={view === "trash"} className={view === "trash" ? "active" : ""} onClick={() => setView("trash")}><Trash2 size={14} /> Papierkorb <b>{trashCount}</b></button>
        </div>
        <button className="button ghost" disabled={loading} onClick={onRefresh}>{loading ? <LoaderCircle className="spin" size={15} /> : <FolderOpen size={15} />} Aktualisieren</button>
      </div>

      {error && <div className="project-library-error"><AlertTriangle size={17} /><span>{error}</span></div>}
      {loading && !projects.length ? (
        <div className="project-library-loading"><LoaderCircle className="spin" size={25} /><span>Projektakten werden geladen …</span></div>
      ) : visibleProjects.length ? (
        <div className="project-library-list">
          {visibleProjects.map((project) => (
            <article key={project.id} className={`project-library-card ${project.id === currentProjectId ? "current" : ""}`}>
              <span className="project-file-icon">{project.trashedAt ? <Trash2 size={20} /> : project.archivedAt ? <Archive size={20} /> : <FileText size={20} />}</span>
              <div className="project-library-copy">
                <span className="project-library-title"><strong>{project.title}</strong>{project.id === currentProjectId && <em>Aktuell geöffnet</em>}</span>
                <small>{project.customer || "Kein Auftraggeber"} · {project.address || "Keine Anschrift"}</small>
                <span className="project-library-meta">
                  <i className={project.status}>{project.status === "completed" ? "Fertiggestellt" : "Entwurf"}</i>
                  <b>{project.positionCount} Positionen</b>
                  <b>{project.pageCount} PDF-Seiten</b>
                  <b>{project.hasPdf ? "Original-PDF gespeichert" : "ohne PDF"}</b>
                  {project.deleteAfter && <b>Geschützt bis mindestens {dateTime.format(new Date(project.deleteAfter))}</b>}
                  <time>{project.trashedAt ? `Papierkorb ${dateTime.format(new Date(project.trashedAt))}` : project.archivedAt ? `Archiviert ${dateTime.format(new Date(project.archivedAt))}` : `Stand ${dateTime.format(new Date(project.updatedAt))}`}</time>
                </span>
              </div>
              <div className="project-library-actions">
                {project.trashedAt ? (
                  <button className="button secondary" disabled={loading} onClick={() => onRestore(project)}><ArchiveRestore size={15} /> Wiederherstellen</button>
                ) : project.archivedAt ? (
                  <button className="button secondary" disabled={loading} onClick={() => onArchive(project, false)}><ArchiveRestore size={15} /> Wiederherstellen</button>
                ) : (
                  <>
                    <button className="button ghost" disabled={loading} onClick={() => void toggleVersions(project)}><Route size={15} /> Versionen</button>
                    <button className="button ghost" disabled={loading} onClick={() => onArchive(project, true)}><Archive size={15} /> Archivieren</button>
                    <button className="button secondary" disabled={loading} onClick={() => onOpen(project)}>{loading ? <LoaderCircle className="spin" size={15} /> : <FolderOpen size={15} />} Öffnen</button>
                  </>
                )}
                <button className="button ghost" disabled={loading} onClick={() => void toggleAudit(project)}><History size={15} /> Änderungen</button>
                {!project.trashedAt && <button className="button danger" disabled={loading} onClick={() => onDelete(project)}><Trash2 size={15} /> Papierkorb</button>}
              </div>
              {!project.archivedAt && !project.trashedAt && versionProjectId === project.id && <div className="project-version-list">
                {versionsLoading ? <span><LoaderCircle className="spin" size={14} /> Versionen werden geladen …</span> : versions.length ? versions.map((version) => <button key={version.revision} onClick={() => onOpenVersion(project, version.revision)}><strong>Revision {version.revision}</strong><small>{version.status === "completed" ? "fertiggestellt" : "Entwurf"} · {dateTime.format(new Date(version.createdAt))}</small><span>Als Entwurf öffnen</span></button>) : <span>Noch keine ältere Serverversion vorhanden.</span>}
              </div>}
              {auditProjectId === project.id && <div className="project-audit-list">
                {auditLoading ? <span><LoaderCircle className="spin" size={14} /> Änderungsprotokoll wird geladen …</span> : auditError ? <span><AlertTriangle size={14} /> {auditError}</span> : auditEvents.length ? auditEvents.map((event) => <section key={event.id}>
                  <header><strong>{auditActionLabel(event.action)}</strong><small>{event.actor} · {dateTime.format(new Date(event.createdAt))}</small></header>
                  {event.changes.length ? <ul>{event.changes.map((change, index) => <li key={`${event.id}-${change.path}-${index}`}><b>{change.label}</b><span><del>{auditValue(change.before)}</del><em>→</em><ins>{auditValue(change.after)}</ins></span></li>)}</ul> : <p>Keine fachlich relevanten Feldänderungen.</p>}
                </section>) : <span>Noch kein serverseitiger Änderungsnachweis vorhanden.</span>}
              </div>}
            </article>
          ))}
        </div>
      ) : !error ? (
        <div className="project-library-empty">
          {view === "trash" ? <Trash2 size={27} /> : view === "archived" ? <Archive size={27} /> : <FolderPlus size={27} />}
          <strong>{view === "trash" ? "Der Papierkorb ist leer" : view === "archived" ? "Das Archiv ist leer" : "Noch keine Projektakte gespeichert"}</strong>
          <span>{view === "trash" ? "Gelöschte Projekte bleiben hier mindestens 30 Tage vollständig wiederherstellbar." : view === "archived" ? "Archivierte Projekte erscheinen hier und können jederzeit wiederhergestellt werden." : "Lege ein neues Projekt an oder speichere das aktuell geöffnete Aufmaß."}</span>
        </div>
      ) : null}

      <div className="modal-actions"><button className="button ghost" onClick={onClose}>Schließen</button><button className="button primary" onClick={onNew}><FolderPlus size={16} /> Neues Projekt anlegen</button></div>
    </Modal>
  );
}

function ProjectModal({ meta, onClose, onSave }: { meta: ProjectMeta; onClose: () => void; onSave: (meta: ProjectMeta) => void }) {
  const [draft, setDraft] = useState(meta);
  return (
    <Modal title="Projektdaten" subtitle="Kopf- und Nachweisdaten für das Aufmaß" onClose={onClose}>
      <label className="field-label">Projektbezeichnung</label><input className="text-input" autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      <div className="field-grid two with-top"><label><span className="field-label">Kunde / Auftraggeber</span><input className="text-input" value={draft.customer} onChange={(event) => setDraft({ ...draft, customer: event.target.value })} /></label><label><span className="field-label">LV / Referenz</span><input className="text-input" value={draft.reference} onChange={(event) => setDraft({ ...draft, reference: event.target.value })} /></label></div>
      <label className="field-label with-top">Bauvorhaben / Anschrift</label><input className="text-input" value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} />
      <label className="field-label with-top">Bearbeiter</label><input className="text-input" value={draft.estimator} onChange={(event) => setDraft({ ...draft, estimator: event.target.value })} />
      <div className="modal-actions"><button className="button ghost" onClick={onClose}>Abbrechen</button><button className="button primary" onClick={() => onSave(draft)}><Check size={16} /> Projektdaten speichern</button></div>
    </Modal>
  );
}
