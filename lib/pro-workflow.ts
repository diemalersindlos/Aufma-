import {
  createId,
  formatNumber,
  type LineItem,
  type Measurement,
  type ProjectMeta,
} from "@/lib/measurements";
import type { LaserMeasurementRecord } from "@/lib/bluetooth-laser";
import { validateMeasurements } from "@/lib/measurement-validation";
import { VOB_RULESET } from "@/lib/vob-rules";

export type ReviewDecision = "open" | "approved" | "correction";

export type ReviewEntry = {
  lineId: string;
  decision: ReviewDecision;
  comment: string;
  reviewer: string;
  reviewedAt: string;
};

export type ProjectReviewState = {
  reviewer: string;
  office: string;
  entries: Record<string, ReviewEntry>;
  updatedAt: string;
  workflowStatus?: "open" | "in-review" | "released";
  revision?: number;
  releasedAt?: string;
  releaseCode?: string;
  signatureName?: string;
};

export const emptyProjectReview: ProjectReviewState = {
  reviewer: "",
  office: "",
  entries: {},
  updatedAt: "",
  workflowStatus: "open",
  revision: 1,
  releasedAt: "",
  releaseCode: "",
  signatureName: "",
};

export type QualityGateIssue = {
  id: string;
  severity: "error" | "warning";
  label: string;
  detail: string;
  lineId?: string;
  measurementId?: string;
};

export type QualityGateResult = {
  errors: number;
  warnings: number;
  approved: number;
  open: number;
  issues: QualityGateIssue[];
  releasable: boolean;
};

export function evaluateQualityGate(
  meta: ProjectMeta,
  rows: LineItem[],
  measurements: Measurement[],
  scales: Record<number, number>,
  review: ProjectReviewState,
): QualityGateResult {
  const issues: QualityGateIssue[] = [];
  if (!meta.title.trim()) issues.push({ id: "project-title", severity: "error", label: "Projektbezeichnung fehlt", detail: "Für einen prüfbaren Abschluss ist eine Projektbezeichnung erforderlich." });
  if (!meta.customer.trim()) issues.push({ id: "project-customer", severity: "warning", label: "Auftraggeber fehlt", detail: "Der Auftraggeber sollte im Prüfbericht angegeben werden." });
  if (!meta.reference.trim()) issues.push({ id: "project-reference", severity: "warning", label: "LV-/Projekt-Referenz fehlt", detail: "Eine Referenz erleichtert die eindeutige Übergabe an AVA und Handwerker-App." });
  if (!rows.length) issues.push({ id: "no-rows", severity: "error", label: "Keine Aufmaßpositionen", detail: "Mindestens eine berechnete Position ist erforderlich." });
  const usesVob = /\bVOB\b/i.test(meta.standard);
  if (usesVob && (!meta.vobRuleConfirmed || meta.vobRuleSetId !== VOB_RULESET.id)) {
    issues.push({
      id: "vob-rule-confirmation",
      severity: "error",
      label: "VOB-/Vertragsregel fachlich nicht bestätigt",
      detail: "Regelsatz und Übermessungsgrenze müssen anhand von Vertrag, Leistungsverzeichnis und vereinbarter ATV-Ausgabe geprüft und im Projekt bestätigt werden.",
    });
  }

  issues.push(...validateMeasurements(measurements, scales, meta.deductionThreshold, rows));

  measurements.filter((measurement) => measurement.visible).forEach((measurement) => {
    const usesOverride = measurement.areaOverride !== undefined || measurement.perimeterOverride !== undefined || measurement.lengthOverride !== undefined;
    if (measurement.kind !== "count" && !usesOverride && !(Number.isFinite(scales[measurement.page]) && scales[measurement.page] > 0)) {
      issues.push({ id: `scale-${measurement.id}`, severity: "error", label: `${measurement.name}: Maßstab fehlt`, detail: `PDF-Seite ${measurement.page} muss kalibriert werden.`, measurementId: measurement.id });
    }
    if ((measurement.confidence ?? 1) < 0.75) {
      issues.push({ id: `confidence-${measurement.id}`, severity: "warning", label: `${measurement.name}: KI-Erkennung unsicher`, detail: `Erkennungswert ${Math.round((measurement.confidence ?? 0) * 100)} %. Kontur und Maße kontrollieren.`, measurementId: measurement.id });
    }
    if (measurement.source === "auto" && !measurement.points.length && measurement.areaOverride === undefined) {
      issues.push({ id: `geometry-${measurement.id}`, severity: "error", label: `${measurement.name}: Geometrie fehlt`, detail: "Die automatisch erkannte Position besitzt weder Kontur noch bestätigte Fläche.", measurementId: measurement.id });
    }
  });

  let approved = 0;
  let open = 0;
  rows.forEach((row) => {
    const decision = review.entries[row.id]?.decision ?? "open";
    if (decision === "approved") approved += 1;
    else {
      open += 1;
      issues.push({
        id: `review-${row.id}`,
        severity: decision === "correction" ? "error" : "warning",
        label: `${row.room}: ${decision === "correction" ? "Korrektur erforderlich" : "Prüfung offen"}`,
        detail: review.entries[row.id]?.comment || `${row.description} wurde noch nicht freigegeben.`,
        lineId: row.id,
        measurementId: row.measurementId,
      });
    }
  });

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return { errors, warnings, approved, open, issues, releasable: rows.length > 0 && errors === 0 && open === 0 && Boolean(review.reviewer.trim()) };
}

function xmlEscape(value: unknown) {
  return String(value ?? "").replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
}

export function buildGaebX31PreparationXml(meta: ProjectMeta, rows: LineItem[], measurements: Measurement[]) {
  const positions = rows.map((row, index) => {
    const measurement = measurements.find((item) => item.id === row.measurementId);
    return `    <QuantityLine id="${xmlEscape(row.id)}" index="${index + 1}">\n      <Room>${xmlEscape(row.room)}</Room>\n      <Description>${xmlEscape(row.description)}</Description>\n      <Formula>${xmlEscape(row.formula)}</Formula>\n      <Gross>${row.gross.toFixed(meta.rounding)}</Gross>\n      <Deduction>${row.deduction.toFixed(meta.rounding)}</Deduction>\n      <Result unit="${xmlEscape(row.unit)}">${row.result.toFixed(meta.rounding)}</Result>\n      <Source>${xmlEscape(sourceLabel(measurement))}</Source>\n      <MeasurementId>${xmlEscape(row.measurementId)}</MeasurementId>\n    </QuantityLine>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<GaebX31Preparation version="3.3" projectId="${xmlEscape(meta.id)}">\n  <Project>\n    <Name>${xmlEscape(meta.title)}</Name>\n    <Customer>${xmlEscape(meta.customer)}</Customer>\n    <Reference>${xmlEscape(meta.reference)}</Reference>\n    <Standard>${xmlEscape(meta.standard)}</Standard>\n  </Project>\n  <Notice>GAEB-3.3-X31-Vorbereitung; vor produktivem AVA-Austausch gegen das offizielle GAEB-Schema prüfen.</Notice>\n  <QuantityLines>\n${positions}\n  </QuantityLines>\n</GaebX31Preparation>`;
}

export function buildIntegrationManifest(meta: ProjectMeta, rows: LineItem[], review: ProjectReviewState) {
  return JSON.stringify({
    schema: "de.maleraufmass.exchange/1.0",
    project: { id: meta.id, title: meta.title, customer: meta.customer, address: meta.address, reference: meta.reference },
    review: { status: review.workflowStatus ?? "open", revision: review.revision ?? 1, releasedAt: review.releasedAt ?? "", releaseCode: review.releaseCode ?? "" },
    quantities: rows.map((row) => ({ id: row.id, measurementId: row.measurementId, room: row.room, description: row.description, formula: row.formula, gross: row.gross, deduction: row.deduction, quantity: row.result, unit: row.unit, category: row.category })),
  }, null, 2);
}

export type LaserRoomInput = {
  name: string;
  device: string;
  length: number;
  width: number;
  height: number;
  quantity: number;
  factor: number;
  includeWalls: boolean;
  includeCeiling: boolean;
  includeFloor: boolean;
  includeSkirting: boolean;
  measurementMode?: "manual" | "bluetooth";
  laserMeasurements?: LaserMeasurementRecord[];
};

export type SpecialShape = "rectangle" | "triangle" | "trapezoid" | "gable" | "circle" | "semicircle";

export type SpecialShapeInput = {
  name: string;
  category: string;
  shape: SpecialShape;
  a: number;
  b: number;
  height: number;
  radius: number;
  quantity: number;
  factor: number;
};

function safePositive(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function buildLaserRoomMeasurement(input: LaserRoomInput, page: number, color: string): Measurement {
  const length = safePositive(input.length);
  const width = safePositive(input.width);
  const height = safePositive(input.height);
  const area = length * width;
  const perimeter = 2 * (length + width);
  const device = input.device.trim() || "Laser-Messgerät";
  const labelPrefix = input.measurementMode === "bluetooth" ? "Bluetooth-Laser-Aufmaß" : input.measurementMode === "manual" ? "Handeingabe" : "Laser-Aufmaß";
  const sequenceSuffix = input.measurementMode === "bluetooth" ? ` · Messfolge L/B/H (${input.laserMeasurements?.length ?? 0} Werte)` : "";
  return {
    id: createId("laser-room"),
    kind: "room",
    name: input.name.trim() || "Laser-Raum",
    page: Math.max(1, Math.trunc(page) || 1),
    points: [],
    color,
    height,
    heightSource: "manual",
    heightNote: "Raumhöhe beim Laser-Aufmaß eingetragen.",
    quantity: safePositive(input.quantity) || 1,
    factor: safePositive(input.factor) || 1,
    includeWalls: input.includeWalls,
    includeCeiling: input.includeCeiling,
    includeFloor: input.includeFloor,
    includeSkirting: input.includeSkirting,
    openings: [],
    source: "manual",
    areaOverride: area,
    perimeterOverride: perimeter,
    areaSource: "laser-reference",
    confidence: 1,
    proCapture: {
      type: "laser",
      label: `${labelPrefix} · ${device}`,
      formula: `${formatNumber(length)} m × ${formatNumber(width)} m · H ${formatNumber(height)} m${sequenceSuffix}`,
      capturedAt: new Date().toISOString(),
      device,
      measurementMode: input.measurementMode,
      laserMeasurements: input.laserMeasurements?.map((record) => ({ ...record })),
      shape: "rectangle",
      length,
      width,
      height,
    },
    visible: true,
    createdAt: new Date().toISOString(),
  };
}

export function calculateSpecialShape(input: Pick<SpecialShapeInput, "shape" | "a" | "b" | "height" | "radius">) {
  const a = safePositive(input.a);
  const b = safePositive(input.b);
  const height = safePositive(input.height);
  const radius = safePositive(input.radius);

  if (input.shape === "triangle" || input.shape === "gable") {
    return {
      area: a * height / 2,
      formula: `${formatNumber(a)} m × ${formatNumber(height)} m ÷ 2`,
      label: input.shape === "gable" ? "Giebeldreieck" : "Dreieck",
    };
  }
  if (input.shape === "trapezoid") {
    return {
      area: (a + b) / 2 * height,
      formula: `(${formatNumber(a)} m + ${formatNumber(b)} m) ÷ 2 × ${formatNumber(height)} m`,
      label: "Trapez",
    };
  }
  if (input.shape === "circle" || input.shape === "semicircle") {
    const divisor = input.shape === "semicircle" ? 2 : 1;
    return {
      area: Math.PI * radius * radius / divisor,
      formula: input.shape === "semicircle"
        ? `π × ${formatNumber(radius)}² m ÷ 2`
        : `π × ${formatNumber(radius)}² m`,
      label: input.shape === "semicircle" ? "Halbkreis" : "Kreis",
    };
  }
  return {
    area: a * b,
    formula: `${formatNumber(a)} m × ${formatNumber(b)} m`,
    label: "Rechteck",
  };
}

export function buildSpecialAreaMeasurement(input: SpecialShapeInput, page: number, color: string): Measurement {
  const result = calculateSpecialShape(input);
  return {
    id: createId("special-area"),
    kind: "area",
    name: input.name.trim() || `${result.label}-Fläche`,
    page: Math.max(1, Math.trunc(page) || 1),
    points: [],
    color,
    quantity: safePositive(input.quantity) || 1,
    factor: safePositive(input.factor) || 1,
    areaCategory: input.category.trim() || "Sonderfläche",
    source: "manual",
    areaOverride: result.area,
    manualFormula: result.formula,
    areaSource: "special-geometry",
    confidence: 1,
    proCapture: {
      type: "special-shape",
      label: `${input.category.trim() || "Sonderfläche"} · ${result.label}`,
      formula: result.formula,
      capturedAt: new Date().toISOString(),
      shape: input.shape,
    },
    visible: true,
    createdAt: new Date().toISOString(),
  };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function csvFile(rows: unknown[][]) {
  return `\ufeff${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

function sourceLabel(measurement: Measurement | undefined) {
  if (!measurement) return "Keine Zuordnung";
  if (measurement.areaSource === "pdf-nrf") return measurement.geometryStatus === "missing" || measurement.geometryStatus === "uncertain"
    ? "PDF-Raumstempel · Kontur nicht bestimmt"
    : "PDF-Raumstempel";
  if (measurement.areaSource === "pdf-dimensions") return "PDF-Maßketten";
  if (measurement.areaSource === "pdf-scale") return "Planmaßstab";
  if (measurement.areaSource === "insta360-reference") return "Insta360 + Kontrollmaß";
  if (measurement.areaSource === "laser-reference") return measurement.proCapture?.label || "Laser-Aufmaß";
  if (measurement.areaSource === "special-geometry") return measurement.proCapture?.label || "Sondergeometrie";
  if (measurement.areaSource === "freehand-sketch") return measurement.proCapture?.label || "Freihandskizze";
  return measurement.source === "auto" ? "Automatisch erkannt" : "Manuelle Messung";
}

export function buildRebPreparationCsv(meta: ProjectMeta, rows: LineItem[], measurements: Measurement[]) {
  const output: unknown[][] = [
    ["REB-Prüfansätze / Übergabevorbereitung"],
    ["Projekt", meta.title],
    ["LV / Referenz", meta.reference],
    ["Hinweis", "Strukturierte Prüfliste; kein schema-validiertes DA11/X31-Austauschformat."],
    [],
    ["Ansatz-ID", "Raum/Bereich", "Leistung", "Rechenansatz", "Brutto", "Abzug", "Netto", "Einheit", "Messquelle", "Projekt-ID"],
  ];
  rows.forEach((row, index) => {
    const measurement = measurements.find((item) => item.id === row.measurementId);
    output.push([
      String(index + 1).padStart(4, "0"),
      row.room,
      row.description,
      row.formula,
      row.gross.toFixed(meta.rounding),
      row.deduction.toFixed(meta.rounding),
      row.result.toFixed(meta.rounding),
      row.unit,
      sourceLabel(measurement),
      meta.id,
    ]);
  });
  return csvFile(output);
}

export function buildReviewCsv(meta: ProjectMeta, rows: LineItem[], reviews: ProjectReviewState) {
  const output: unknown[][] = [
    ["Prüfprotokoll Aufmaß"],
    ["Projekt", meta.title],
    ["Prüfer/in", reviews.reviewer],
    ["Architekturbüro / Auftraggeber", reviews.office],
    ["Stand", reviews.updatedAt ? new Date(reviews.updatedAt).toLocaleString("de-DE") : "offen"],
    ["Prüfstatus", reviews.workflowStatus === "released" ? "FREIGEGEBEN UND GESPERRT" : reviews.workflowStatus === "in-review" ? "IN PRÜFUNG" : "OFFEN"],
    ["Revision", reviews.revision ?? 1],
    ["Prüfcode", reviews.releaseCode ?? ""],
    ["Freigabe", reviews.releasedAt ? new Date(reviews.releasedAt).toLocaleString("de-DE") : ""],
    [],
    ["Pos.", "Raum/Bereich", "Leistung", "Menge", "Einheit", "Entscheidung", "Kommentar", "Prüfer/in", "Prüfdatum"],
  ];
  rows.forEach((row, index) => {
    const entry = reviews.entries[row.id];
    output.push([
      String(index + 1).padStart(3, "0"),
      row.room,
      row.description,
      row.result.toFixed(meta.rounding),
      row.unit,
      entry?.decision === "approved" ? "FREIGEGEBEN" : entry?.decision === "correction" ? "KORREKTUR" : "OFFEN",
      entry?.comment ?? "",
      entry?.reviewer || reviews.reviewer,
      entry?.reviewedAt ? new Date(entry.reviewedAt).toLocaleString("de-DE") : "",
    ]);
  });
  return csvFile(output);
}
