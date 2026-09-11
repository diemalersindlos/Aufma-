"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  AlertTriangle,
  Building2,
  Bluetooth,
  Check,
  ChevronRight,
  CircleHelp,
  CirclePlus,
  Cloud,
  CloudOff,
  Copy,
  DoorOpen,
  Download,
  FileCheck2,
  FolderOpen,
  House,
  Hand,
  Layers3,
  History,
  LoaderCircle,
  Mic,
  Monitor,
  PenLine,
  Pencil,
  Plus,
  Ruler,
  Save,
  Share2,
  ShieldCheck,
  LockKeyhole,
  Unlock,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import MobileAiMeasureInput from "@/components/mobile-ai-measure-input";
import MobileLaserCapture from "@/components/mobile-laser-capture";
import MobileSketchMeasure, { type MobileSketchMeasureHandle } from "@/components/mobile-sketch-measure";
import { MobileVoiceLabel } from "@/components/mobile-voice-input";
import UserManual from "@/components/user-manual";
import type { AiMeasureCommand, AiMeasureTarget } from "@/lib/ai-measure-input";
import { hasCompleteLaserSequence, type LaserMeasurementRecord, type LaserMeasureTarget } from "@/lib/bluetooth-laser";
import { createMobileProjectState, normalizeMobileProjectState } from "@/lib/mobile-project";
import {
  createId,
  deriveLineItems,
  formatNumber,
  measurementColor,
  nextRoomColor,
  openingCalculation,
  type Measurement,
  type Opening,
} from "@/lib/measurements";
import {
  buildGaebX31PreparationXml,
  buildIntegrationManifest,
  buildLaserRoomMeasurement,
  buildReviewCsv,
  buildSpecialAreaMeasurement,
  calculateSpecialShape,
  emptyProjectReview,
  evaluateQualityGate,
  type ProjectReviewState,
  type ReviewDecision,
  type SpecialShape,
} from "@/lib/pro-workflow";
import type { ProjectSummary, StoredProjectResponse, StoredProjectState } from "@/lib/project-storage-types";
import { VOB_RULESET } from "@/lib/vob-rules";

type MobileTab = "project" | "rooms" | "sketch" | "special" | "review" | "transfer";
type SaveState = "idle" | "saving" | "saved" | "queued" | "error";
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type RoomDraft = {
  name: string;
  device: string;
  captureMode: "manual" | "bluetooth";
  length: string;
  width: string;
  height: string;
  quantity: string;
  includeWalls: boolean;
  includeCeiling: boolean;
  includeFloor: boolean;
  includeSkirting: boolean;
};

type OpeningDraft = {
  name: string;
  openingKind: NonNullable<Opening["openingKind"]>;
  width: string;
  height: string;
  quantity: string;
  mode: Opening["mode"];
  revealDepth: string;
};

type SpecialDraft = {
  name: string;
  category: string;
  shape: SpecialShape;
  a: string;
  b: string;
  height: string;
  radius: string;
  quantity: string;
};

const roomDefaults = (index = 1): RoomDraft => {
  void index;
  return {
    name: "",
    device: "",
    captureMode: "manual",
    length: "",
    width: "",
    height: "",
    quantity: "",
    includeWalls: false,
    includeCeiling: false,
    includeFloor: false,
    includeSkirting: false,
  };
};

const openingDefaults = (): OpeningDraft => ({ name: "", openingKind: "door", width: "", height: "", quantity: "", mode: "vob", revealDepth: "" });
const specialDefaults = (): SpecialDraft => ({ name: "", category: "Sonderfläche", shape: "rectangle", a: "", b: "", height: "", radius: "", quantity: "" });

function numberValue(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function aiInputValue(value: number | undefined, fallback: string) {
  return value === undefined ? fallback : String(value).replace(".", ",");
}

function cloneState(state: StoredProjectState) {
  return JSON.parse(JSON.stringify(state)) as StoredProjectState;
}

const MOBILE_DRAFT_KEY = "maleraufmass-pro-mobile-draft-v2";

type MobileDraftEnvelope = {
  state: StoredProjectState;
  savedAt: string;
  pendingSync: boolean;
};

function readMobileDraft(): MobileDraftEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MOBILE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MobileDraftEnvelope>;
    if (!parsed.state?.meta?.id || !Array.isArray(parsed.state.measurements)) return null;
    return { state: normalizeMobileProjectState(parsed.state), savedAt: parsed.savedAt ?? "", pendingSync: Boolean(parsed.pendingSync) };
  } catch {
    return null;
  }
}

function writeMobileDraft(state: StoredProjectState, pendingSync: boolean) {
  try {
    window.localStorage.setItem(MOBILE_DRAFT_KEY, JSON.stringify({ state, savedAt: new Date().toISOString(), pendingSync } satisfies MobileDraftEnvelope));
    return true;
  } catch {
    return false;
  }
}

function downloadMobileFile(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name.replace(/[\\/:*?"<>|]+/g, "-");
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function runsStandalone() {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || standaloneNavigator.standalone === true;
}

function projectDate(value: string) {
  try {
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "–";
  }
}

export default function MobileMeasureApp() {
  const [project, setProject] = useState<StoredProjectState>(() => readMobileDraft()?.state ?? createMobileProjectState());
  const [tab, setTab] = useState<MobileTab>("project");
  const [room, setRoom] = useState<RoomDraft>(() => roomDefaults());
  const [laserMeasurements, setLaserMeasurements] = useState<LaserMeasurementRecord[]>([]);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [openingRoomId, setOpeningRoomId] = useState<string | null>(null);
  const [opening, setOpening] = useState<OpeningDraft>(() => openingDefaults());
  const [special, setSpecial] = useState<SpecialDraft>(() => specialDefaults());
  const sketchMeasureRef = useRef<MobileSketchMeasureHandle>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectView, setProjectView] = useState<"active" | "archived" | "trash">("active");
  const [saveState, setSaveState] = useState<SaveState>(() => readMobileDraft()?.pendingSync ? "queued" : "idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [splash, setSplash] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [versions, setVersions] = useState<Array<{ revision: number; status: string; createdAt: string }>>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const includedPages = useMemo(() => new Set(project.includedPages ?? [1]), [project.includedPages]);
  const includedMeasurements = useMemo(
    () => project.measurements.filter((measurement) => includedPages.has(measurement.page)),
    [includedPages, project.measurements],
  );
  const rows = useMemo(
    () => deriveLineItems(includedMeasurements, project.scales, project.meta.deductionThreshold, project.meta.rounding),
    [includedMeasurements, project.meta.deductionThreshold, project.meta.rounding, project.scales],
  );
  const review = project.professional?.review ?? emptyProjectReview;
  const quality = useMemo(
    () => evaluateQualityGate(project.meta, rows, includedMeasurements, project.scales, review),
    [includedMeasurements, project.meta, project.scales, review, rows],
  );
  const roomMeasurements = project.measurements.filter((measurement) => measurement.kind === "room");
  const sketchMeasurements = project.measurements.filter((measurement) => measurement.areaSource === "freehand-sketch");
  const specialMeasurements = project.measurements.filter((measurement) => measurement.areaSource === "special-geometry");
  const aiContext: AiMeasureTarget = tab === "sketch" ? "sketch" : tab === "special" ? "special" : openingRoomId ? "opening" : "room";
  const roomPreview = {
    floor: numberValue(room.length) * numberValue(room.width) * Math.max(1, numberValue(room.quantity)),
    walls: 2 * (numberValue(room.length) + numberValue(room.width)) * numberValue(room.height) * Math.max(1, numberValue(room.quantity)),
    skirting: 2 * (numberValue(room.length) + numberValue(room.width)) * Math.max(1, numberValue(room.quantity)),
  };
  const specialPreview = calculateSpecialShape({
    shape: special.shape,
    a: numberValue(special.a),
    b: numberValue(special.b),
    height: numberValue(special.height),
    radius: numberValue(special.radius),
  });
  const totals = rows.reduce<Record<string, number>>((result, row) => {
    result[row.description] = (result[row.description] ?? 0) + row.result;
    return result;
  }, {});
  const activeStoredProjectCount = projects.filter((item) => !item.archivedAt && !item.trashedAt).length;
  const archivedStoredProjectCount = projects.filter((item) => Boolean(item.archivedAt) && !item.trashedAt).length;
  const trashedStoredProjectCount = projects.filter((item) => Boolean(item.trashedAt)).length;
  const visibleStoredProjects = projects.filter((item) => projectView === "trash" ? Boolean(item.trashedAt) : projectView === "archived" ? Boolean(item.archivedAt) && !item.trashedAt : !item.archivedAt && !item.trashedAt);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const body = await response.json() as { projects?: ProjectSummary[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Die Projektablage konnte nicht geladen werden.");
      setProjects(body.projects ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die Projektablage konnte nicht geladen werden.");
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setSplash(false), 1250);
    const loadTimer = window.setTimeout(() => {
      setStandalone(runsStandalone());
      setOnline(navigator.onLine);
      void loadProjects();
    }, 0);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/mobile-sw.js", { scope: "/mobil" }).catch(() => undefined);

    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setStandalone(true);
      setInstallPrompt(null);
      setInstallHelp(false);
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearTimeout(splashTimer);
      window.clearTimeout(loadTimer);
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [loadProjects]);

  useEffect(() => {
    if (saveState === "saving") return;
    writeMobileDraft(project, saveState !== "saved");
  }, [project, saveState]);

  useEffect(() => {
    if (!online || saveState !== "queued") return;
    const timer = window.setTimeout(() => void saveProject(project), 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, saveState, project]);

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  function markProject(next: StoredProjectState) {
    const currentReview = next.professional?.review ?? emptyProjectReview;
    const reopenedReview: ProjectReviewState = currentReview.workflowStatus === "released"
      ? { ...currentReview, workflowStatus: "in-review", revision: (currentReview.revision ?? 1) + 1, releasedAt: "", releaseCode: "", updatedAt: new Date().toISOString() }
      : currentReview;
    setProject({ ...next, status: "draft", professional: { review: reopenedReview }, meta: { ...next.meta, updatedAt: new Date().toISOString() } });
    setSaveState("idle");
    clearFeedback();
  }

  function updateReview(nextReview: ProjectReviewState) {
    setProject((current) => ({ ...current, status: nextReview.workflowStatus === "released" ? "completed" : "draft", professional: { review: nextReview }, meta: { ...current.meta, updatedAt: new Date().toISOString() } }));
    setSaveState("idle");
    clearFeedback();
  }

  function updateReviewEntry(lineId: string, decision: ReviewDecision) {
    const previous = review.entries[lineId] ?? { lineId, decision: "open" as const, comment: "", reviewer: review.reviewer, reviewedAt: "" };
    const now = new Date().toISOString();
    updateReview({ ...review, workflowStatus: "in-review", releasedAt: "", releaseCode: "", updatedAt: now, entries: { ...review.entries, [lineId]: { ...previous, decision, reviewer: review.reviewer, reviewedAt: decision === "open" ? "" : now } } });
  }

  async function releaseMobileProject() {
    if (!quality.releasable) {
      setError("Das Aufmaß kann erst gesperrt werden, wenn alle Positionen geprüft und freigegeben sind.");
      return;
    }
    const now = new Date();
    const checksum = rows.reduce((sum, row) => sum + Math.round(row.result * 100), 0).toString(36).toUpperCase();
    const nextReview: ProjectReviewState = { ...review, workflowStatus: "released", releasedAt: now.toISOString(), releaseCode: `MA-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${checksum}`, signatureName: review.signatureName?.trim() || review.reviewer.trim(), revision: Math.max(1, review.revision ?? 1), updatedAt: now.toISOString() };
    const nextProject: StoredProjectState = { ...project, status: "completed", professional: { review: nextReview }, meta: { ...project.meta, updatedAt: now.toISOString() } };
    setProject(nextProject);
    setSaveState("idle");
    const saved = await saveProject(nextProject);
    if (saved) setMessage("Aufmaß wurde geprüft, gesperrt und mit Prüfcode gespeichert.");
  }

  function updateMeta(field: "title" | "customer" | "address" | "reference" | "estimator", value: string) {
    markProject({ ...project, meta: { ...project.meta, [field]: value } });
  }

  function submitRoom(event: FormEvent) {
    event.preventDefault();
    const length = numberValue(room.length);
    const width = numberValue(room.width);
    const height = numberValue(room.height);
    const quantity = numberValue(room.quantity);
    if (!room.name.trim() || length <= 0 || width <= 0 || height <= 0 || quantity <= 0) {
      setError("Bitte Raumname, Länge, Breite, Höhe und Anzahl vollständig eingeben.");
      return;
    }
    if (!room.includeWalls && !room.includeCeiling && !room.includeFloor && !room.includeSkirting) {
      setError("Bitte mindestens Wand, Decke, Boden oder Fußleisten auswählen.");
      return;
    }
    if (room.captureMode === "bluetooth" && !hasCompleteLaserSequence(laserMeasurements)) {
      setError("Bitte Länge, Breite und Höhe nacheinander vom verbundenen Bluetooth-Laser übernehmen. Korrekturen sind danach möglich.");
      return;
    }

    const created = buildLaserRoomMeasurement({
      name: room.name,
      device: room.device,
      length,
      width,
      height,
      quantity,
      factor: 1,
      includeWalls: room.includeWalls,
      includeCeiling: room.includeCeiling,
      includeFloor: room.includeFloor,
      includeSkirting: room.includeSkirting,
      measurementMode: room.captureMode,
      laserMeasurements,
    }, 1, nextRoomColor(project.measurements));

    const existing = editingRoomId ? project.measurements.find((measurement) => measurement.id === editingRoomId) : null;
    const measurement = existing
      ? { ...created, id: existing.id, color: existing.color, openings: existing.openings ?? [], createdAt: existing.createdAt }
      : created;
    markProject({
      ...project,
      includedPages: project.includedPages?.includes(1) ? project.includedPages : [...(project.includedPages ?? []), 1],
      measurements: existing
        ? project.measurements.map((item) => item.id === existing.id ? measurement : item)
        : [...project.measurements, measurement],
    });
    setEditingRoomId(null);
    setRoom(roomDefaults(roomMeasurements.length + (existing ? 1 : 2)));
    setLaserMeasurements([]);
    setMessage(existing ? "Raummaße wurden aktualisiert." : "Raum wurde zum mobilen Aufmaß hinzugefügt.");
  }

  function editRoom(measurement: Measurement) {
    if (measurement.areaSource !== "laser-reference") return;
    setEditingRoomId(measurement.id);
    setRoom({
      name: measurement.name,
      device: measurement.proCapture?.device || "Handeingabe",
      captureMode: measurement.proCapture?.measurementMode === "bluetooth" ? "bluetooth" : "manual",
      length: String(measurement.proCapture?.length ?? "").replace(".", ","),
      width: String(measurement.proCapture?.width ?? "").replace(".", ","),
      height: String(measurement.proCapture?.height ?? measurement.height ?? "").replace(".", ","),
      quantity: String(measurement.quantity || 1).replace(".", ","),
      includeWalls: Boolean(measurement.includeWalls),
      includeCeiling: Boolean(measurement.includeCeiling),
      includeFloor: Boolean(measurement.includeFloor),
      includeSkirting: Boolean(measurement.includeSkirting),
    });
    setLaserMeasurements(measurement.proCapture?.laserMeasurements ?? []);
    setTab("rooms");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeMeasurement(id: string) {
    if (!window.confirm("Diese Aufmaßposition wirklich löschen?")) return;
    markProject({ ...project, measurements: project.measurements.filter((measurement) => measurement.id !== id) });
  }

  function addSketchMeasurement(measurement: Measurement) {
    markProject({
      ...project,
      includedPages: project.includedPages?.includes(1) ? project.includedPages : [...(project.includedPages ?? []), 1],
      measurements: [...project.measurements, measurement],
    });
    setMessage(`${measurement.name}: Freihandskizze erkannt und ins Aufmaß übernommen.`);
  }

  function addOpening(event: FormEvent) {
    event.preventDefault();
    if (!openingRoomId) return;
    const width = numberValue(opening.width);
    const height = numberValue(opening.height);
    const quantity = numberValue(opening.quantity);
    if (!opening.name.trim() || width <= 0 || height <= 0 || quantity <= 0) {
      setError("Bitte Bezeichnung, Breite, Höhe und Anzahl der Öffnung eingeben.");
      return;
    }
    const item: Opening = { id: createId("opening"), name: opening.name.trim(), openingKind: opening.openingKind, width, height, quantity, mode: opening.mode, revealDepth: opening.openingKind === "door" ? 0 : numberValue(opening.revealDepth) };
    markProject({
      ...project,
      measurements: project.measurements.map((measurement) => measurement.id === openingRoomId
        ? { ...measurement, openings: [...(measurement.openings ?? []), item] }
        : measurement),
    });
    setOpeningRoomId(null);
    setOpening(openingDefaults());
    setMessage("Öffnung wurde nach der gewählten VOB-Regel erfasst.");
  }

  function removeOpening(roomId: string, openingId: string) {
    markProject({
      ...project,
      measurements: project.measurements.map((measurement) => measurement.id === roomId
        ? { ...measurement, openings: (measurement.openings ?? []).filter((item) => item.id !== openingId) }
        : measurement),
    });
  }

  function submitSpecial(event: FormEvent) {
    event.preventDefault();
    if (!special.name.trim() || specialPreview.area <= 0 || numberValue(special.quantity) <= 0) {
      setError("Bitte Bezeichnung, Maße und Anzahl der Sonderfläche vollständig eingeben.");
      return;
    }
    const measurement = buildSpecialAreaMeasurement({
      name: special.name,
      category: special.category,
      shape: special.shape,
      a: numberValue(special.a),
      b: numberValue(special.b),
      height: numberValue(special.height),
      radius: numberValue(special.radius),
      quantity: numberValue(special.quantity),
      factor: 1,
    }, 1, measurementColor("area"));
    markProject({ ...project, measurements: [...project.measurements, measurement] });
    setSpecial({ ...specialDefaults(), name: `Sonderfläche ${specialMeasurements.length + 2}` });
    setMessage("Sonderfläche wurde mit Rechenweg übernommen.");
  }

  function applyAiMeasure(command: AiMeasureCommand) {
    setError("");
    if (command.target === "sketch") {
      setTab("sketch");
      window.setTimeout(() => sketchMeasureRef.current?.applyAiCommand(command), 0);
      setMessage("KI-Maße wurden in die Freihandskizze eingetragen. Bitte Kontur, Kontrollseite und Werte prüfen.");
      return;
    }
    if (command.target === "special") {
      setSpecial((current) => ({
        ...current,
        name: command.name || current.name,
        category: command.shape === "gable" ? "Giebel" : current.category,
        shape: command.shape ?? current.shape,
        a: aiInputValue(command.a, current.a),
        b: aiInputValue(command.b, current.b),
        height: aiInputValue(command.height, current.height),
        radius: aiInputValue(command.radius, current.radius),
        quantity: aiInputValue(command.quantity, current.quantity),
      }));
      setTab("special");
      setMessage("KI-Maße wurden in die Sonderfläche eingetragen. Bitte Formel und Werte prüfen.");
      return;
    }
    if (command.target === "opening") {
      const roomName = command.roomName?.toLocaleLowerCase("de-DE");
      const targetRoom = (roomName ? roomMeasurements.find((measurement) => measurement.name.toLocaleLowerCase("de-DE").includes(roomName)) : null)
        ?? roomMeasurements.find((measurement) => measurement.id === openingRoomId)
        ?? roomMeasurements.at(-1);
      if (!targetRoom) {
        setTab("rooms");
        setError("Für die KI-Öffnung muss zuerst mindestens ein Raum angelegt werden.");
        return;
      }
      setOpening({
        name: command.name || "Tür / Fenster",
        openingKind: /^tür\b/i.test(command.name || "") ? "door" : /^fenster\b/i.test(command.name || "") ? "window" : "other",
        width: aiInputValue(command.width, ""),
        height: aiInputValue(command.height, ""),
        quantity: aiInputValue(command.quantity, "1"),
        mode: "vob",
        revealDepth: "",
      });
      setOpeningRoomId(targetRoom.id);
      setTab("rooms");
      setMessage(`KI-Maße wurden bei „${targetRoom.name}“ als Öffnung vorbereitet. Bitte VOB-Behandlung prüfen.`);
      return;
    }

    setEditingRoomId(null);
    setLaserMeasurements([]);
    setRoom((current) => ({
      ...current,
      name: command.name || current.name,
      device: "KI-Maßeingabe · vom Nutzer kontrolliert",
      captureMode: "manual",
      length: aiInputValue(command.length, current.length),
      width: aiInputValue(command.width, current.width),
      height: aiInputValue(command.height, current.height),
      quantity: aiInputValue(command.quantity, current.quantity),
      includeWalls: command.includeWalls ?? current.includeWalls,
      includeCeiling: command.includeCeiling ?? current.includeCeiling,
      includeFloor: command.includeFloor ?? current.includeFloor,
      includeSkirting: command.includeSkirting ?? current.includeSkirting,
    }));
    setTab("rooms");
    setMessage("KI-Maße wurden in das Raumaufmaß eingetragen. Bitte alle Werte kontrollieren und anschließend hinzufügen.");
  }

  async function saveProject(sourceProject: StoredProjectState = project) {
    if (!sourceProject.meta.title.trim()) {
      setTab("project");
      setError("Bitte zuerst eine Projektbezeichnung eingeben.");
      return false;
    }
    const baseUpdatedAt = sourceProject.meta.serverUpdatedAt ?? sourceProject.meta.updatedAt;
    const updated: StoredProjectState = {
      ...cloneState(sourceProject),
      version: 3,
      meta: { ...sourceProject.meta, title: sourceProject.meta.title.trim(), updatedAt: new Date().toISOString() },
    };
    setProject(updated);
    if (!writeMobileDraft(updated, true)) {
      setSaveState("error");
      setError("Der lokale Baustellenentwurf konnte auf diesem Gerät nicht gesichert werden. Bitte Gerätespeicher prüfen und Projektsicherung exportieren.");
      return false;
    }
    if (!navigator.onLine || !online) {
      setSaveState("queued");
      setMessage("Offline sicher auf diesem Gerät gespeichert. Die Übertragung startet automatisch, sobald wieder Internet vorhanden ist.");
      setError("");
      return false;
    }
    setSaveState("saving");
    clearFeedback();
    try {
      const form = new FormData();
      form.append("state", JSON.stringify(updated));
      form.append("baseUpdatedAt", baseUpdatedAt);
      const response = await fetch("/api/projects", { method: "POST", body: form });
      const body = await response.json() as { project?: ProjectSummary; error?: string; code?: string };
      if (body.code === "PROJECT_CONFLICT") {
        setSaveState("error");
        setError(body.error || "Speicherkonflikt erkannt. Bitte den Serverstand neu laden und Änderungen bewusst zusammenführen.");
        return false;
      }
      if (!response.ok || !body.project) throw new Error(body.error || "Das mobile Aufmaß konnte nicht gespeichert werden.");
      const synchronized: StoredProjectState = { ...updated, meta: { ...updated.meta, updatedAt: body.project.updatedAt, serverUpdatedAt: body.project.updatedAt } };
      setProject(synchronized);
      writeMobileDraft(synchronized, false);
      setSaveState("saved");
      setProjects((current) => [body.project!, ...current.filter((item) => item.id !== body.project!.id)]);
      setMessage("Gespeichert und am PC verfügbar.");
      return true;
    } catch (cause) {
      const wentOffline = !navigator.onLine;
      setSaveState(wentOffline ? "queued" : "error");
      setError(`${cause instanceof Error ? cause.message : "Das mobile Aufmaß konnte nicht gespeichert werden."} Der lokale Geräteentwurf bleibt erhalten.`);
      return false;
    }
  }

  async function openProject(summary: ProjectSummary) {
    if (saveState === "idle" && project.measurements.length && !window.confirm("Ungespeicherte Änderungen verwerfen und dieses Projekt öffnen?")) return;
    setProjectsLoading(true);
    clearFeedback();
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(summary.id)}`, { cache: "no-store" });
      const body = await response.json() as StoredProjectResponse & { error?: string };
      if (!response.ok || !body.state) throw new Error(body.error || "Das Projekt konnte nicht geöffnet werden.");
      setProject(normalizeMobileProjectState(body.state));
      setSaveState("saved");
      setRoom(roomDefaults((body.state.measurements?.filter((measurement) => measurement.kind === "room").length ?? 0) + 1));
      setLaserMeasurements([]);
      setEditingRoomId(null);
      setOpeningRoomId(null);
      setOpening(openingDefaults());
      setSpecial(specialDefaults());
      setTab("rooms");
      setMessage("Projekt geladen. Vorhandene PDF- und Prüfdaten bleiben erhalten.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Das Projekt konnte nicht geöffnet werden.");
    } finally {
      setProjectsLoading(false);
    }
  }

  async function loadVersions() {
    if (!project.meta.id || !online) return;
    setVersionsLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.meta.id)}/versions`, { cache: "no-store" });
      const body = await response.json() as { versions?: Array<{ revision: number; status: string; createdAt: string }>; error?: string };
      if (!response.ok) throw new Error(body.error || "Die Versionen konnten nicht geladen werden.");
      setVersions(body.versions ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die Versionen konnten nicht geladen werden.");
    } finally {
      setVersionsLoading(false);
    }
  }

  async function restoreVersion(revision: number) {
    if (saveState === "idle" && project.measurements.length && !window.confirm(`Ungespeicherte Änderungen verwerfen und Revision ${revision} öffnen?`)) return;
    setVersionsLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.meta.id)}/versions/${revision}`, { cache: "no-store" });
      const body = await response.json() as { state?: StoredProjectState; error?: string };
      if (!response.ok || !body.state) throw new Error(body.error || "Die Version konnte nicht geladen werden.");
      const restored = normalizeMobileProjectState(body.state);
      const restoredReview = restored.professional?.review ?? emptyProjectReview;
      setProject({ ...restored, status: "draft", professional: { review: { ...restoredReview, workflowStatus: "in-review", revision: Math.max(revision + 1, restoredReview.revision ?? 1), releasedAt: "", releaseCode: "" } } });
      setSaveState("idle");
      setTab("review");
      setMessage(`Revision ${revision} wurde als neuer bearbeitbarer Entwurf geöffnet.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die Version konnte nicht geladen werden.");
    } finally {
      setVersionsLoading(false);
    }
  }

  function exportMobileReview() {
    downloadMobileFile(buildReviewCsv(project.meta, rows, review), `${project.meta.title}-Pruefprotokoll.csv`, "text/csv;charset=utf-8");
    setMessage("Prüfprotokoll wurde erstellt.");
  }

  function exportMobileGaeb() {
    downloadMobileFile(buildGaebX31PreparationXml(project.meta, rows, includedMeasurements), `${project.meta.title}-GAEB-X31-Vorbereitung.xml`, "application/xml;charset=utf-8");
    setMessage("GAEB-X31-Vorbereitung wurde erstellt.");
  }

  function exportMobileIntegration() {
    downloadMobileFile(buildIntegrationManifest(project.meta, rows, review), `${project.meta.title}-Handwerker-App-Uebergabe.json`, "application/json;charset=utf-8");
    setMessage("Übergabepaket wurde erstellt.");
  }

  function resetMobileProject() {
    setProject(createMobileProjectState());
    setRoom(roomDefaults());
    sketchMeasureRef.current?.reset();
    setLaserMeasurements([]);
    setSpecial(specialDefaults());
    setEditingRoomId(null);
    setOpeningRoomId(null);
    setOpening(openingDefaults());
    setSaveState("idle");
    setVersions([]);
    setVersionsLoading(false);
    setProjectView("active");
    clearFeedback();
    setTab("project");
  }

  function newProject() {
    if (saveState === "idle" && project.measurements.length && !window.confirm("Ungespeicherte Änderungen verwerfen und ein neues Projekt beginnen?")) return;
    resetMobileProject();
  }

  async function setMobileProjectArchived(summary: ProjectSummary, archived: boolean) {
    if (archived && summary.id === project.meta.id && saveState !== "saved") {
      setError(`„${summary.title}“ enthält noch nicht synchronisierte Änderungen. Bitte zuerst speichern und die Synchronisierung abwarten.`);
      return;
    }
    setProjectsLoading(true);
    clearFeedback();
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(summary.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      const body = await response.json() as { archivedAt?: string | null; error?: string };
      if (!response.ok) throw new Error(body.error || "Der Archivstatus konnte nicht geändert werden.");
      setProjects((current) => current.map((item) => item.id === summary.id
        ? { ...item, archivedAt: archived ? body.archivedAt ?? new Date().toISOString() : null }
        : item));
      if (archived && summary.id === project.meta.id) resetMobileProject();
      setMessage(archived ? `„${summary.title}“ wurde archiviert.` : `„${summary.title}“ wurde wiederhergestellt.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Der Archivstatus konnte nicht geändert werden.");
    } finally {
      setProjectsLoading(false);
    }
  }

  async function deleteMobileProject(summary: ProjectSummary) {
    if (summary.id === project.meta.id && saveState !== "saved") {
      setError(`„${summary.title}“ enthält noch nicht synchronisierte Änderungen. Bitte zuerst speichern und die Synchronisierung abwarten.`);
      return;
    }
    const confirmed = window.confirm(`Projekt „${summary.title}“ in den Papierkorb verschieben? Die vollständige gespeicherte Projektakte bleibt mindestens 30 Tage wiederherstellbar.`);
    if (!confirmed) return;
    setProjectsLoading(true);
    clearFeedback();
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(summary.id)}`, { method: "DELETE" });
      const body = await response.json() as { deleted?: boolean; trashedAt?: string; deleteAfter?: string; error?: string };
      if (!response.ok || !body.deleted) throw new Error(body.error || "Das Projekt konnte nicht gelöscht werden.");
      setProjects((current) => current.map((item) => item.id === summary.id ? { ...item, archivedAt: null, trashedAt: body.trashedAt ?? new Date().toISOString(), deleteAfter: body.deleteAfter ?? null } : item));
      if (summary.id === project.meta.id) resetMobileProject();
      setMessage(`„${summary.title}“ liegt im Papierkorb und kann wiederhergestellt werden.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Das Projekt konnte nicht in den Papierkorb verschoben werden.");
    } finally {
      setProjectsLoading(false);
    }
  }

  async function restoreMobileProject(summary: ProjectSummary) {
    setProjectsLoading(true);
    clearFeedback();
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(summary.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: false }),
      });
      const body = await response.json() as { trashed?: boolean; error?: string };
      if (!response.ok || body.trashed !== false) throw new Error(body.error || "Das Projekt konnte nicht wiederhergestellt werden.");
      setProjects((current) => current.map((item) => item.id === summary.id ? { ...item, archivedAt: null, trashedAt: null, deleteAfter: null } : item));
      setMessage(`„${summary.title}“ wurde vollständig wiederhergestellt.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Das Projekt konnte nicht wiederhergestellt werden.");
    } finally {
      setProjectsLoading(false);
    }
  }

  async function sharePcLink() {
    const url = `${window.location.origin}/`;
    try {
      const canShare = "share" in navigator && typeof navigator.share === "function";
      if (canShare) await navigator.share({ title: "MalerAufmaß Pro", text: `Projekt „${project.meta.title}“ am PC öffnen`, url });
      else await navigator.clipboard.writeText(url);
      setMessage(canShare ? "PC-Link wurde geteilt." : "PC-Link wurde kopiert.");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setMessage("PC-Link wurde kopiert.");
      } catch {
        setError("Der PC-Link konnte nicht geteilt werden.");
      }
    }
  }

  async function installApp() {
    if (!installPrompt) {
      setInstallHelp(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setStandalone(true);
    setInstallPrompt(null);
  }

  return (
    <div className="mobile-companion">
      <div className={`mobile-splash ${splash ? "" : "leaving"}`} aria-hidden={!splash}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand-logo.png" alt="Die Maler sind los" />
        <span>AUFMASS MOBIL</span>
        <i><b /></i>
      </div>

      <header className="mobile-header">
        <div className="mobile-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-logo.png" alt="Die Maler sind los" />
          <span>MOBIL · PILOT</span>
        </div>
        <div className="mobile-header-actions">
          <span className={`mobile-online ${online ? "yes" : "no"}`}>{online ? <Cloud size={14} /> : <CloudOff size={14} />}{online ? "Online" : "Offline"}</span>
          <button onClick={() => setShowManual(true)} aria-label="Benutzerhandbuch öffnen"><CircleHelp size={18} /></button>
          {!standalone && <button onClick={() => void installApp()} aria-label="App installieren"><Download size={17} /></button>}
        </div>
      </header>

      <main className="mobile-main">
        <div className="mobile-project-strip">
          <span><small>AKTUELLES PROJEKT</small><strong>{project.meta.title || "Ohne Bezeichnung"}</strong></span>
          <em className={saveState}>{saveState === "saving" ? "SPEICHERT" : saveState === "saved" ? "SYNCHRON" : saveState === "queued" ? "OFFLINE GESICHERT" : saveState === "error" ? "FEHLER" : "ENTWURF"}</em>
        </div>

        {(message || error) && <div className={`mobile-feedback ${error ? "error" : "success"}`}>{error ? <X size={17} /> : <Check size={17} />}<span>{error || message}</span><button onClick={clearFeedback} aria-label="Hinweis schließen"><X size={14} /></button></div>}

        {tab === "project" && (
          <section className="mobile-section">
            <div className="mobile-section-head"><span><Building2 size={20} /></span><div><h1>Projekt vorbereiten</h1><p>Diese Angaben erscheinen später unverändert im PC-Aufmaß.</p></div></div>
            <div className="mobile-card mobile-form-card">
              <div className="mobile-field-voice-tip"><Mic size={17} /><span><strong>Einzelfeld per Sprache</strong><small>Mikrofon am gewünschten Feld antippen und nur diesen Wert sprechen.</small></span></div>
              <label><MobileVoiceLabel label="Projektbezeichnung" onValue={(value) => updateMeta("title", value)}>Projektbezeichnung *</MobileVoiceLabel><input value={project.meta.title} onChange={(event) => updateMeta("title", event.target.value)} placeholder="z. B. Wohnhaus Müller" /></label>
              <label><MobileVoiceLabel label="Kunde oder Auftraggeber" onValue={(value) => updateMeta("customer", value)}>Kunde / Auftraggeber</MobileVoiceLabel><input value={project.meta.customer} onChange={(event) => updateMeta("customer", event.target.value)} placeholder="Name oder Architekturbüro" /></label>
              <label><MobileVoiceLabel label="Baustellenadresse" onValue={(value) => updateMeta("address", value)}>Baustellenadresse</MobileVoiceLabel><textarea rows={2} value={project.meta.address} onChange={(event) => updateMeta("address", event.target.value)} placeholder="Straße, Hausnummer, Ort" /></label>
              <div className="mobile-field-row"><label><MobileVoiceLabel label="Projektnummer" onValue={(value) => updateMeta("reference", value)}>Projekt-Nr.</MobileVoiceLabel><input value={project.meta.reference} onChange={(event) => updateMeta("reference", event.target.value)} placeholder="2026-001" /></label><label><MobileVoiceLabel label="Aufnehmer" onValue={(value) => updateMeta("estimator", value)}>Aufnehmer</MobileVoiceLabel><input value={project.meta.estimator} onChange={(event) => updateMeta("estimator", event.target.value)} /></label></div>
              <label className="mobile-vob-confirm"><input type="checkbox" checked={Boolean(project.meta.vobRuleConfirmed && project.meta.vobRuleSetId === VOB_RULESET.id)} onChange={(event) => markProject({ ...project, meta: { ...project.meta, vobRuleSetId: VOB_RULESET.id, vobRuleConfirmed: event.target.checked, vobRuleConfirmedBy: event.target.checked ? project.meta.estimator.trim() : "", vobRuleConfirmedAt: event.target.checked ? new Date().toISOString() : "" } })} /><span><strong>VOB-/Vertragsregel fachlich bestätigt</strong><small>Vertrag, vereinbarte ATV-Ausgabe und Projektgrenze {formatNumber(project.meta.deductionThreshold)} m² wurden geprüft.</small></span></label>
              <button className="mobile-primary" onClick={() => setTab("rooms")}><Ruler size={18} /> Räume aufnehmen <ChevronRight size={17} /></button>
            </div>

            <div className="mobile-list-head"><div><strong>Gespeicherte Projekte</strong><small>Dieselbe Ablage wie im Hauptprogramm</small></div><button onClick={newProject}><Plus size={16} /> Neu</button></div>
            <div className="mobile-project-views" role="tablist" aria-label="Projektstatus">
              <button role="tab" aria-selected={projectView === "active"} className={projectView === "active" ? "active" : ""} onClick={() => setProjectView("active")}><FolderOpen size={15} /> Projekte <b>{activeStoredProjectCount}</b></button>
              <button role="tab" aria-selected={projectView === "archived"} className={projectView === "archived" ? "active" : ""} onClick={() => setProjectView("archived")}><Archive size={15} /> Archiv <b>{archivedStoredProjectCount}</b></button>
              <button role="tab" aria-selected={projectView === "trash"} className={projectView === "trash" ? "active" : ""} onClick={() => setProjectView("trash")}><Trash2 size={15} /> Papierkorb <b>{trashedStoredProjectCount}</b></button>
            </div>
            <div className="mobile-project-list">
              {projectsLoading ? <div className="mobile-empty"><LoaderCircle className="spin" size={22} /><span>Projekte werden geladen …</span></div> : visibleStoredProjects.length ? visibleStoredProjects.map((item) => (
                <article key={item.id} className={item.id === project.meta.id ? "active" : ""}>
                  {!item.archivedAt && !item.trashedAt && <button className="mobile-project-open" onClick={() => void openProject(item)}>
                    <span className="mobile-project-icon"><FolderOpen size={18} /></span>
                    <span><strong>{item.title}</strong><small>{item.customer || item.address || "Ohne Kundenangabe"}</small><em>{item.positionCount} Positionen · {projectDate(item.updatedAt)}</em></span>
                    <ChevronRight size={17} />
                  </button>}
                  {(item.archivedAt || item.trashedAt) && <div className="mobile-project-archived">
                    <span className="mobile-project-icon">{item.trashedAt ? <Trash2 size={18} /> : <Archive size={18} />}</span>
                    <span><strong>{item.title}</strong><small>{item.customer || item.address || "Ohne Kundenangabe"}</small><em>{item.trashedAt ? `Papierkorb · ${projectDate(item.trashedAt)}` : `Archiviert · ${projectDate(item.archivedAt!)}`}</em></span>
                  </div>}
                  <div className="mobile-project-actions">
                    {item.trashedAt ? <button onClick={() => void restoreMobileProject(item)}><ArchiveRestore size={14} /> Wiederherstellen</button> : <button onClick={() => void setMobileProjectArchived(item, !item.archivedAt)}>{item.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}{item.archivedAt ? "Wiederherstellen" : "Archivieren"}</button>}
                    {!item.trashedAt && <button className="danger" onClick={() => void deleteMobileProject(item)}><Trash2 size={14} /> Papierkorb</button>}
                  </div>
                </article>
              )) : <div className="mobile-empty">{projectView === "trash" ? <Trash2 size={22} /> : projectView === "archived" ? <Archive size={22} /> : <FolderOpen size={22} />}<span>{projectView === "trash" ? "Der Papierkorb ist leer." : projectView === "archived" ? "Das Projektarchiv ist leer." : "Noch keine Projekte gespeichert."}</span></div>}
            </div>
          </section>
        )}

        {tab === "rooms" && (
          <section className="mobile-section">
            <div className="mobile-section-head"><span><House size={20} /></span><div><h1>{editingRoomId ? "Raum bearbeiten" : "Raum aufnehmen"}</h1><p>Handeingabe oder Bluetooth-Laser wählen und gewünschte Mengen erfassen.</p></div></div>
            <form className="mobile-card mobile-form-card" onSubmit={submitRoom}>
              <div className="mobile-capture-modes" role="radiogroup" aria-label="Art der Maßeingabe">
                <button type="button" role="radio" aria-checked={room.captureMode === "manual"} className={room.captureMode === "manual" ? "active" : ""} onClick={() => { setRoom({ ...room, captureMode: "manual", device: "Handeingabe" }); setLaserMeasurements([]); }}><i><Hand size={20} /></i><span><strong>Handeingabe</strong><small>Maße selbst eintragen</small></span>{room.captureMode === "manual" && <Check size={17} />}</button>
                <button type="button" role="radio" aria-checked={room.captureMode === "bluetooth"} className={room.captureMode === "bluetooth" ? "active" : ""} onClick={() => { setRoom({ ...room, captureMode: "bluetooth", device: "Bluetooth-Laser", length: "", width: "", height: "" }); setLaserMeasurements([]); }}><i><Bluetooth size={20} /></i><span><strong>Laser Bluetooth</strong><small>Maße nacheinander empfangen</small></span>{room.captureMode === "bluetooth" && <Check size={17} />}</button>
              </div>
              <div className="mobile-field-row"><label><MobileVoiceLabel label="Raumbezeichnung" onValue={(value) => setRoom((current) => ({ ...current, name: value }))}>Raumbezeichnung *</MobileVoiceLabel><input value={room.name} onChange={(event) => setRoom({ ...room, name: event.target.value })} /></label><label><MobileVoiceLabel label={room.captureMode === "bluetooth" ? "Lasergerät oder Modell" : "Messquelle"} onValue={(value) => setRoom((current) => ({ ...current, device: value }))}>{room.captureMode === "bluetooth" ? "Lasergerät / Modell" : "Messquelle"}</MobileVoiceLabel><input value={room.device} onChange={(event) => setRoom({ ...room, device: event.target.value })} placeholder={room.captureMode === "bluetooth" ? "z. B. Leica DISTO X4" : "Handeingabe"} /></label></div>
              {room.captureMode === "bluetooth" ? <>
                <MobileLaserCapture
                  values={{ length: room.length, width: room.width, height: room.height }}
                  records={laserMeasurements}
                  deviceName={room.device}
                  onValue={(target: LaserMeasureTarget, value) => setRoom((current) => ({ ...current, [target]: value }))}
                  onRecordsChange={setLaserMeasurements}
                  onDeviceName={(name) => setRoom((current) => ({ ...current, device: name }))}
                />
                <div className="mobile-dimension-grid mobile-quantity-only"><label><MobileVoiceLabel label="Anzahl gleicher Räume" kind="quantity" onValue={(value) => setRoom((current) => ({ ...current, quantity: value }))}>Anzahl gleicher Räume</MobileVoiceLabel><div><input inputMode="decimal" value={room.quantity} onChange={(event) => setRoom({ ...room, quantity: event.target.value })} /><i>×</i></div></label></div>
              </> : <div className="mobile-dimension-grid">
                <label><MobileVoiceLabel label="Länge" kind="measurement" onValue={(value) => setRoom((current) => ({ ...current, length: value }))}>Länge</MobileVoiceLabel><div><input inputMode="decimal" value={room.length} onChange={(event) => setRoom({ ...room, length: event.target.value })} placeholder="0,00" /><i>m</i></div></label>
                <label><MobileVoiceLabel label="Breite" kind="measurement" onValue={(value) => setRoom((current) => ({ ...current, width: value }))}>Breite</MobileVoiceLabel><div><input inputMode="decimal" value={room.width} onChange={(event) => setRoom({ ...room, width: event.target.value })} placeholder="0,00" /><i>m</i></div></label>
                <label><MobileVoiceLabel label="Höhe" kind="measurement" onValue={(value) => setRoom((current) => ({ ...current, height: value }))}>Höhe</MobileVoiceLabel><div><input inputMode="decimal" value={room.height} onChange={(event) => setRoom({ ...room, height: event.target.value })} /><i>m</i></div></label>
                <label><MobileVoiceLabel label="Anzahl" kind="quantity" onValue={(value) => setRoom((current) => ({ ...current, quantity: value }))}>Anzahl</MobileVoiceLabel><div><input inputMode="decimal" value={room.quantity} onChange={(event) => setRoom({ ...room, quantity: event.target.value })} /><i>×</i></div></label>
              </div>}
              <div className="mobile-quantity-picks">
                <button type="button" className={room.includeWalls ? "active" : ""} onClick={() => setRoom({ ...room, includeWalls: !room.includeWalls })}><span>{room.includeWalls && <Check size={14} />}</span>Wände</button>
                <button type="button" className={room.includeCeiling ? "active" : ""} onClick={() => setRoom({ ...room, includeCeiling: !room.includeCeiling })}><span>{room.includeCeiling && <Check size={14} />}</span>Decke</button>
                <button type="button" className={room.includeFloor ? "active" : ""} onClick={() => setRoom({ ...room, includeFloor: !room.includeFloor })}><span>{room.includeFloor && <Check size={14} />}</span>Boden</button>
                <button type="button" className={room.includeSkirting ? "active" : ""} onClick={() => setRoom({ ...room, includeSkirting: !room.includeSkirting })}><span>{room.includeSkirting && <Check size={14} />}</span>Fußleisten</button>
              </div>
              <div className="mobile-room-preview"><span><small>Boden / Decke</small><strong>{formatNumber(roomPreview.floor)} m²</strong></span><span><small>Wände brutto</small><strong>{formatNumber(roomPreview.walls)} m²</strong></span><span><small>Umfang</small><strong>{formatNumber(roomPreview.skirting)} m</strong></span></div>
              <div className="mobile-form-actions">{editingRoomId && <button type="button" className="mobile-secondary" onClick={() => { setEditingRoomId(null); setRoom(roomDefaults(roomMeasurements.length + 1)); setLaserMeasurements([]); }}>Abbrechen</button>}<button className="mobile-primary" type="submit"><CirclePlus size={18} /> {editingRoomId ? "Änderungen übernehmen" : "Raum hinzufügen"}</button></div>
            </form>

            <div className="mobile-list-head"><div><strong>Aufgenommene Räume</strong><small>{roomMeasurements.length} {roomMeasurements.length === 1 ? "Raum" : "Räume"} · Öffnungen nach VOB</small></div></div>
            <div className="mobile-room-list">
              {roomMeasurements.length ? roomMeasurements.map((measurement) => {
                const measurementRows = rows.filter((row) => row.measurementId === measurement.id);
                return <article key={measurement.id} className="mobile-room-card" style={{ borderLeftColor: measurement.color }}>
                  <div className="mobile-room-card-head"><span><strong>{measurement.name}</strong><small>{measurement.proCapture?.formula || `Raumaufmaß · H ${formatNumber(measurement.height ?? 0)} m`}</small></span><div>{measurement.areaSource === "laser-reference" && <button onClick={() => editRoom(measurement)} aria-label="Raum bearbeiten"><Pencil size={15} /></button>}<button onClick={() => removeMeasurement(measurement.id)} aria-label="Raum löschen"><Trash2 size={15} /></button></div></div>
                  <div className="mobile-room-values">{measurementRows.map((row) => <span key={row.id}><small>{row.description}</small><strong>{formatNumber(row.result)} {row.unit}</strong></span>)}</div>
                  {(measurement.openings ?? []).length > 0 && <div className="mobile-opening-list">{measurement.openings!.map((item) => { const calculation = openingCalculation(item, project.meta.deductionThreshold); const treatment = calculation.overmeasured ? "übermessen" : calculation.deduct ? `Abzug ${formatNumber(calculation.deduct)} m²` : "kein Abzug"; return <span key={item.id}><DoorOpen size={14} /><b>{item.name}</b><small>{item.quantity} × {formatNumber(item.width)} × {formatNumber(item.height)} m · {treatment}{calculation.isDoor ? " · Zarge, keine Laibung" : calculation.revealDepth > 0 ? ` · Laibung 3-seitig: ${calculation.revealSeparate ? `${formatNumber(calculation.revealResult)} m²` : "nicht zusätzlich"}` : ""}</small><button aria-label={`${item.name} löschen`} onClick={() => removeOpening(measurement.id, item.id)}><X size={13} /></button></span>; })}</div>}
                  {openingRoomId === measurement.id ? <form className="mobile-opening-form" onSubmit={addOpening}>
                    <div className="mobile-field-row">
                      <label><MobileVoiceLabel label="Bezeichnung der Öffnung" onValue={(value) => setOpening((current) => ({ ...current, name: value }))}>Bezeichnung</MobileVoiceLabel><input value={opening.name} onChange={(event) => setOpening({ ...opening, name: event.target.value })} /></label>
                      <label><span>Art der Öffnung</span><select value={opening.openingKind} onChange={(event) => { const openingKind = event.target.value as NonNullable<Opening["openingKind"]>; setOpening({ ...opening, openingKind, name: openingKind === "door" ? "Tür" : openingKind === "window" ? "Fenster" : "Sonstige Öffnung", mode: openingKind === "door" ? "vob" : opening.mode, revealDepth: openingKind === "door" ? "" : opening.revealDepth }); }}><option value="door">Tür – VOB-Grenze, keine Laibung</option><option value="window">Fenster – VOB prüfen</option><option value="other">Sonstige Öffnung</option></select></label>
                    </div>
                    <div className="mobile-dimension-grid three">
                      <label><MobileVoiceLabel label="Breite der Öffnung" kind="measurement" onValue={(value) => setOpening((current) => ({ ...current, width: value }))}>Breite</MobileVoiceLabel><div><input inputMode="decimal" value={opening.width} onChange={(event) => setOpening({ ...opening, width: event.target.value })} /><i>m</i></div></label>
                      <label><MobileVoiceLabel label="Höhe der Öffnung" kind="measurement" onValue={(value) => setOpening((current) => ({ ...current, height: value }))}>Höhe</MobileVoiceLabel><div><input inputMode="decimal" value={opening.height} onChange={(event) => setOpening({ ...opening, height: event.target.value })} /><i>m</i></div></label>
                      <label><MobileVoiceLabel label="Anzahl der Öffnungen" kind="quantity" onValue={(value) => setOpening((current) => ({ ...current, quantity: value }))}>Anzahl</MobileVoiceLabel><div><input inputMode="decimal" value={opening.quantity} onChange={(event) => setOpening({ ...opening, quantity: event.target.value })} /><i>×</i></div></label>
                    </div>
                    {opening.openingKind !== "door" && <div className="mobile-field-row">
                      <label><MobileVoiceLabel label="Tiefe der Laibung" kind="measurement" onValue={(value) => setOpening((current) => ({ ...current, revealDepth: value }))}>Laibungstiefe</MobileVoiceLabel><div><input inputMode="decimal" placeholder="z. B. 0,15" value={opening.revealDepth} onChange={(event) => setOpening({ ...opening, revealDepth: event.target.value })} /><i>m</i></div></label>
                      <label><span>Laibung</span><input value="3-seitig: links, rechts, oben" disabled /></label>
                    </div>}
                    {opening.openingKind !== "door" && <label><span>VOB-Behandlung</span><select value={opening.mode} onChange={(event) => setOpening({ ...opening, mode: event.target.value as Opening["mode"] })}><option value="vob">VOB-Grenze anwenden</option><option value="always">Immer abziehen</option><option value="never">Nicht abziehen</option></select></label>}
                    <div className="mobile-form-actions"><button type="button" className="mobile-secondary" onClick={() => setOpeningRoomId(null)}>Abbrechen</button><button className="mobile-primary">Öffnung übernehmen</button></div>
                  </form> : <button className="mobile-add-opening" onClick={() => { setOpeningRoomId(measurement.id); setOpening(openingDefaults()); }}><DoorOpen size={16} /> Tür oder Fenster erfassen</button>}
                </article>;
              }) : <div className="mobile-empty"><House size={24} /><span>Noch keine Räume aufgenommen.</span></div>}
            </div>
          </section>
        )}

        {tab === "sketch" && (
          <MobileSketchMeasure
            ref={sketchMeasureRef}
            color={nextRoomColor(project.measurements)}
            onAdd={addSketchMeasurement}
          />
        )}

        {tab === "special" && (
          <section className="mobile-section">
            <div className="mobile-section-head"><span><Layers3 size={20} /></span><div><h1>Sonderfläche</h1><p>Giebel, Dreieck, Trapez, Kreis oder Rechteck mit prüfbarer Formel.</p></div></div>
            <form className="mobile-card mobile-form-card" onSubmit={submitSpecial}>
              <div className="mobile-field-row"><label><MobileVoiceLabel label="Bezeichnung der Sonderfläche" onValue={(value) => setSpecial((current) => ({ ...current, name: value }))}>Bezeichnung *</MobileVoiceLabel><input value={special.name} onChange={(event) => setSpecial({ ...special, name: event.target.value })} /></label><label><span>Kategorie</span><select value={special.category} onChange={(event) => setSpecial({ ...special, category: event.target.value })}><option>Sonderfläche</option><option>Giebel</option><option>Fassade</option><option>Leibung</option><option>Nische</option><option>Holzfläche</option><option>Metallfläche</option></select></label></div>
              <div className="mobile-shape-grid">{(["rectangle", "triangle", "trapezoid", "gable", "circle", "semicircle"] as SpecialShape[]).map((shape) => <button type="button" key={shape} className={special.shape === shape ? "active" : ""} onClick={() => setSpecial({ ...special, shape })}>{shape === "rectangle" ? "Rechteck" : shape === "triangle" ? "Dreieck" : shape === "trapezoid" ? "Trapez" : shape === "gable" ? "Giebel" : shape === "circle" ? "Kreis" : "Halbkreis"}</button>)}</div>
              <div className="mobile-dimension-grid">
                {!(["circle", "semicircle"] as SpecialShape[]).includes(special.shape) && <label><MobileVoiceLabel label={special.shape === "trapezoid" ? "Seite a" : "Breite a"} kind="measurement" onValue={(value) => setSpecial((current) => ({ ...current, a: value }))}>{special.shape === "trapezoid" ? "Seite a" : "Breite a"}</MobileVoiceLabel><div><input inputMode="decimal" value={special.a} onChange={(event) => setSpecial({ ...special, a: event.target.value })} /><i>m</i></div></label>}
                {(["rectangle", "trapezoid"] as SpecialShape[]).includes(special.shape) && <label><MobileVoiceLabel label={special.shape === "trapezoid" ? "Seite b" : "Höhe b"} kind="measurement" onValue={(value) => setSpecial((current) => ({ ...current, b: value }))}>{special.shape === "trapezoid" ? "Seite b" : "Höhe b"}</MobileVoiceLabel><div><input inputMode="decimal" value={special.b} onChange={(event) => setSpecial({ ...special, b: event.target.value })} /><i>m</i></div></label>}
                {(["triangle", "trapezoid", "gable"] as SpecialShape[]).includes(special.shape) && <label><MobileVoiceLabel label="Höhe" kind="measurement" onValue={(value) => setSpecial((current) => ({ ...current, height: value }))}>Höhe</MobileVoiceLabel><div><input inputMode="decimal" value={special.height} onChange={(event) => setSpecial({ ...special, height: event.target.value })} /><i>m</i></div></label>}
                {(["circle", "semicircle"] as SpecialShape[]).includes(special.shape) && <label><MobileVoiceLabel label="Radius" kind="measurement" onValue={(value) => setSpecial((current) => ({ ...current, radius: value }))}>Radius</MobileVoiceLabel><div><input inputMode="decimal" value={special.radius} onChange={(event) => setSpecial({ ...special, radius: event.target.value })} /><i>m</i></div></label>}
                <label><MobileVoiceLabel label="Anzahl" kind="quantity" onValue={(value) => setSpecial((current) => ({ ...current, quantity: value }))}>Anzahl</MobileVoiceLabel><div><input inputMode="decimal" value={special.quantity} onChange={(event) => setSpecial({ ...special, quantity: event.target.value })} /><i>×</i></div></label>
              </div>
              <div className="mobile-special-preview"><Sparkles size={18} /><span><small>{specialPreview.formula}</small><strong>{formatNumber(specialPreview.area * Math.max(1, numberValue(special.quantity)))} m²</strong></span></div>
              <button className="mobile-primary" type="submit"><CirclePlus size={18} /> Sonderfläche hinzufügen</button>
            </form>
            <div className="mobile-room-list">{specialMeasurements.length ? specialMeasurements.map((measurement) => <article key={measurement.id} className="mobile-room-card" style={{ borderLeftColor: measurement.color }}><div className="mobile-room-card-head"><span><strong>{measurement.name}</strong><small>{measurement.proCapture?.label} · {measurement.manualFormula}</small></span><button onClick={() => removeMeasurement(measurement.id)} aria-label="Sonderfläche löschen"><Trash2 size={15} /></button></div><div className="mobile-room-values">{rows.filter((row) => row.measurementId === measurement.id).map((row) => <span key={row.id}><small>{row.description}</small><strong>{formatNumber(row.result)} {row.unit}</strong></span>)}</div></article>) : <div className="mobile-empty"><Layers3 size={24} /><span>Noch keine Sonderflächen aufgenommen.</span></div>}</div>
          </section>
        )}

        {tab === "review" && (
          <section className="mobile-section">
            <div className="mobile-section-head"><span><ShieldCheck size={20} /></span><div><h1>Prüfen & freigeben</h1><p>Alle Mengen kontrollieren, digital zeichnen und als Revision sperren.</p></div></div>
            <div className={`mobile-card mobile-quality-card ${review.workflowStatus === "released" ? "released" : quality.errors ? "blocked" : quality.releasable ? "ready" : "attention"}`}>
              <div className="mobile-quality-head"><span>{review.workflowStatus === "released" ? <LockKeyhole size={22} /> : <ShieldCheck size={22} />}</span><div><strong>{review.workflowStatus === "released" ? "Aufmaß freigegeben" : quality.releasable ? "Bereit zur Freigabe" : "Kontrolle erforderlich"}</strong><small>{review.workflowStatus === "released" ? `Revision ${review.revision ?? 1} · ${review.releaseCode}` : "Unsichere oder offene Positionen werden automatisch angezeigt."}</small></div></div>
              <div className="mobile-quality-stats"><span><small>Fehler</small><strong>{quality.errors}</strong></span><span><small>Warnungen</small><strong>{quality.warnings}</strong></span><span><small>Geprüft</small><strong>{quality.approved}/{rows.length}</strong></span></div>
            </div>

            {review.workflowStatus !== "released" && quality.issues.length > 0 && <div className="mobile-quality-issues">{quality.issues.slice(0, 6).map((issue) => <div key={issue.id} className={issue.severity}><AlertTriangle size={15} /><span><strong>{issue.label}</strong><small>{issue.detail}</small></span></div>)}</div>}

            <div className="mobile-card mobile-review-person">
              <label><MobileVoiceLabel label="Prüfer oder Prüferin" onValue={(value) => { if (review.workflowStatus !== "released") updateReview({ ...review, reviewer: value, updatedAt: new Date().toISOString() }); }}>Prüfer/in *</MobileVoiceLabel><input disabled={review.workflowStatus === "released"} value={review.reviewer} onChange={(event) => updateReview({ ...review, reviewer: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Vor- und Nachname" /></label>
              <label><MobileVoiceLabel label="Architekturbüro oder Auftraggeber" onValue={(value) => { if (review.workflowStatus !== "released") updateReview({ ...review, office: value, updatedAt: new Date().toISOString() }); }}>Büro / Auftraggeber</MobileVoiceLabel><input disabled={review.workflowStatus === "released"} value={review.office} onChange={(event) => updateReview({ ...review, office: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Firma oder Büro" /></label>
              <label><MobileVoiceLabel label="Digitale Namenszeichnung" onValue={(value) => { if (review.workflowStatus !== "released") updateReview({ ...review, signatureName: value, updatedAt: new Date().toISOString() }); }}>Digitale Namenszeichnung</MobileVoiceLabel><input disabled={review.workflowStatus === "released"} value={review.signatureName ?? ""} onChange={(event) => updateReview({ ...review, signatureName: event.target.value, updatedAt: new Date().toISOString() })} placeholder={review.reviewer || "Name für die Freigabe"} /></label>
            </div>

            <div className="mobile-review-list">{rows.length ? rows.map((row, index) => {
              const entry = review.entries[row.id];
              const decision = entry?.decision ?? "open";
              return <article key={row.id} className={`mobile-review-row ${decision}`}>
                <div><span>POS. {String(index + 1).padStart(3, "0")}</span><strong>{row.room}</strong><small>{row.description} · {row.formula}</small></div>
                <b>{formatNumber(row.result)} {row.unit}</b>
                <div className="mobile-review-decisions"><button disabled={review.workflowStatus === "released"} className={decision === "approved" ? "active approved" : ""} onClick={() => updateReviewEntry(row.id, "approved")}><Check size={14} /> Freigeben</button><button disabled={review.workflowStatus === "released"} className={decision === "correction" ? "active correction" : ""} onClick={() => updateReviewEntry(row.id, "correction")}><X size={14} /> Korrektur</button></div>
              </article>;
            }) : <div className="mobile-empty"><ShieldCheck size={23} /><span>Noch keine Positionen zum Prüfen.</span></div>}</div>

            <div className="mobile-review-actions">{review.workflowStatus === "released" ? <button className="mobile-secondary" onClick={() => updateReview({ ...review, workflowStatus: "in-review", revision: (review.revision ?? 1) + 1, releasedAt: "", releaseCode: "", updatedAt: new Date().toISOString() })}><Unlock size={17} /> Neue Revision öffnen</button> : <button className="mobile-primary" disabled={!quality.releasable || saveState === "saving"} onClick={() => void releaseMobileProject()}><LockKeyhole size={17} /> Prüfen, speichern & sperren</button>}</div>

            <div className="mobile-card mobile-version-card"><div><History size={19} /><span><strong>Projektversionen</strong><small>Ältere Speicherstände als neuen Entwurf öffnen.</small></span><button onClick={() => void loadVersions()} disabled={versionsLoading}>{versionsLoading ? <LoaderCircle className="spin" size={15} /> : <History size={15} />} Laden</button></div>{versions.length > 0 && <div className="mobile-version-list">{versions.map((version) => <button key={version.revision} onClick={() => void restoreVersion(version.revision)}><strong>Revision {version.revision}</strong><small>{version.status === "completed" ? "Fertiggestellt" : "Entwurf"} · {projectDate(version.createdAt)}</small><ChevronRight size={15} /></button>)}</div>}</div>

            <div className="mobile-export-grid"><button disabled={!rows.length} onClick={exportMobileReview}><FileCheck2 size={18} /><span><strong>Prüfprotokoll</strong><small>CSV</small></span></button><button disabled={!rows.length} onClick={exportMobileGaeb}><Building2 size={18} /><span><strong>GAEB X31</strong><small>Vorbereitung</small></span></button><button disabled={!rows.length} onClick={exportMobileIntegration}><Share2 size={18} /><span><strong>Handwerker-App</strong><small>JSON-Paket</small></span></button></div>
          </section>
        )}

        {tab === "transfer" && (
          <section className="mobile-section">
            <div className="mobile-section-head"><span><Share2 size={20} /></span><div><h1>An den PC übergeben</h1><p>Einmal speichern – danach steht dasselbe Projekt im Hauptprogramm bereit.</p></div></div>
            <div className="mobile-transfer-route"><span><Smartphone size={26} /><b>Handy</b></span><i><Cloud size={19} /><ArrowRight size={20} /></i><span><Monitor size={26} /><b>Hauptprogramm</b></span></div>
            <div className="mobile-card mobile-transfer-card">
              <div className="mobile-transfer-summary"><span><small>PROJEKT</small><strong>{project.meta.title}</strong><em>{roomMeasurements.length} Räume ({sketchMeasurements.length} aus Skizze) · {specialMeasurements.length} Sonderflächen · {rows.length} Positionen</em></span><FileCheck2 size={28} /></div>
              <div className="mobile-total-grid"><span><small>Wände</small><strong>{formatNumber(totals["Wandfläche"] ?? 0)} m²</strong></span><span><small>Decken</small><strong>{formatNumber(totals["Deckenfläche"] ?? 0)} m²</strong></span><span><small>Böden</small><strong>{formatNumber(totals["Bodenfläche"] ?? 0)} m²</strong></span><span><small>Fußleisten</small><strong>{formatNumber(totals["Sockelleisten / Anschlusslänge"] ?? 0)} m</strong></span></div>
              <button className="mobile-primary mobile-save-large" onClick={() => void saveProject()} disabled={saveState === "saving"}>{saveState === "saving" ? <LoaderCircle className="spin" size={19} /> : online ? <Save size={19} /> : <CloudOff size={19} />}{saveState === "saved" ? "Aktualisieren & erneut übertragen" : saveState === "queued" ? "Offline-Entwurf erneut sichern" : online ? "Speichern & an PC übertragen" : "Offline auf Gerät speichern"}</button>
              {saveState === "saved" && <div className="mobile-ready"><Check size={20} /><span><strong>Aufmaß ist am PC verfügbar</strong><small>Im Hauptprogramm auf „Projekte“ klicken und „{project.meta.title}“ öffnen.</small></span></div>}
              {saveState === "queued" && <div className="mobile-ready"><CloudOff size={20} /><span><strong>Aufmaß ist offline gesichert</strong><small>Die App überträgt den Entwurf automatisch, sobald wieder Internet verfügbar ist.</small></span></div>}
              <div className="mobile-pc-actions"><a href="/" target="_blank" rel="noreferrer"><Monitor size={17} /> Hauptprogramm öffnen</a><button onClick={() => void sharePcLink()}><Copy size={17} /> PC-Link senden</button></div>
            </div>
            <div className="mobile-howto"><strong>So geht es am PC weiter</strong><ol><li>Hauptprogramm am PC öffnen.</li><li>Mit demselben Konto angemeldet sein.</li><li>„Projekte“ öffnen und dieses Aufmaß auswählen.</li><li>PDF, Excel, Prüfung und Material dort weiterbearbeiten.</li></ol></div>
          </section>
        )}
      </main>

      <MobileAiMeasureInput context={aiContext} onApply={applyAiMeasure} />

      <nav className="mobile-bottom-nav" aria-label="Bereiche">
        <button className={tab === "project" ? "active" : ""} onClick={() => setTab("project")}><Building2 size={20} /><span>Projekt</span></button>
        <button className={tab === "rooms" ? "active" : ""} onClick={() => setTab("rooms")}><House size={20} /><span>Räume</span>{roomMeasurements.length > 0 && <b>{roomMeasurements.length}</b>}</button>
        <button className={tab === "sketch" ? "active" : ""} onClick={() => setTab("sketch")}><PenLine size={20} /><span>Skizze</span>{sketchMeasurements.length > 0 && <b>{sketchMeasurements.length}</b>}</button>
        <button className={tab === "special" ? "active" : ""} onClick={() => setTab("special")}><Layers3 size={20} /><span>Sonder</span></button>
        <button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}><ShieldCheck size={20} /><span>Prüfen</span>{quality.open > 0 && <b>{quality.open}</b>}</button>
        <button className={tab === "transfer" ? "active" : ""} onClick={() => setTab("transfer")}><Share2 size={20} /><span>PC</span></button>
      </nav>

      {installHelp && <div className="mobile-sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setInstallHelp(false)}><section className="mobile-install-sheet"><div><Smartphone size={25} /><span><strong>Aufmaß Mobil installieren</strong><small>Platzsparend und direkt vom Startbildschirm.</small></span><button onClick={() => setInstallHelp(false)}><X size={18} /></button></div><ol><li>Diese Seite in Safari öffnen.</li><li>Unten auf „Teilen“ tippen.</li><li>„Zum Home-Bildschirm“ wählen.</li><li>Oben rechts „Hinzufügen“.</li></ol><button className="mobile-primary" onClick={() => setInstallHelp(false)}>Verstanden</button></section></div>}
      {showManual && <div className="user-manual-backdrop mobile" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowManual(false); }}><UserManual mode="mobile" onClose={() => setShowManual(false)} /></div>}
    </div>
  );
}
