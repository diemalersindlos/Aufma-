import type { StoredProjectState } from "@/lib/project-storage-types";

export const PROJECT_STATE_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxMeasurements: 10_000,
  maxPointsPerMeasurement: 50_000,
  maxTotalPoints: 250_000,
  maxOpeningsPerMeasurement: 2_000,
  maxPanoramas: 2_000,
  maxPages: 10_000,
} as const;

export type ProjectStateValidationResult =
  | { ok: true; state: StoredProjectState }
  | { ok: false; error: string };

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalNonNegativeNumber(value: unknown) {
  return value === undefined || (finiteNumber(value) && value >= 0);
}

function safeId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{6,120}$/.test(value);
}

function textWithin(value: unknown, max: number, required = false) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return (!required || trimmed.length > 0) && value.length <= max;
}

export function validateStoredProjectState(value: unknown): ProjectStateValidationResult {
  if (!record(value)) return { ok: false, error: "Die Projektdatei besitzt keine gültige Struktur." };
  if (value.version !== 2 && value.version !== 3) return { ok: false, error: "Die Projektversion wird nicht unterstützt." };
  if (value.status !== "draft" && value.status !== "completed") return { ok: false, error: "Der Projektstatus ist ungültig." };
  if (!record(value.meta)) return { ok: false, error: "Die Projektstammdaten fehlen." };
  if (!safeId(value.meta.id)) return { ok: false, error: "Die Projekt-ID ist ungültig." };
  if (!textWithin(value.meta.title, 300, true)) return { ok: false, error: "Die Projektbezeichnung fehlt oder ist zu lang." };
  if (!textWithin(value.meta.customer ?? "", 300)) return { ok: false, error: "Der Kundenname ist zu lang." };
  if (!textWithin(value.meta.address ?? "", 600)) return { ok: false, error: "Die Baustellenadresse ist zu lang." };
  if (!textWithin(value.meta.reference ?? "", 200)) return { ok: false, error: "Die Projektreferenz ist zu lang." };
  if (!textWithin(value.meta.estimator ?? "", 300)) return { ok: false, error: "Der Bearbeitername ist zu lang." };
  if (!textWithin(value.meta.standard ?? "", 500, true)) return { ok: false, error: "Die Abrechnungsgrundlage fehlt oder ist zu lang." };
  if (!finiteNumber(value.meta.deductionThreshold) || value.meta.deductionThreshold < 0) return { ok: false, error: "Die Übermessungsgrenze ist ungültig." };
  if (!Number.isInteger(value.meta.rounding) || value.meta.rounding < 0 || value.meta.rounding > 6) return { ok: false, error: "Die Rundung ist ungültig." };

  if (!Number.isInteger(value.pageCount) || value.pageCount < 0 || value.pageCount > PROJECT_STATE_LIMITS.maxPages) {
    return { ok: false, error: "Die PDF-Seitenanzahl ist ungültig oder zu groß." };
  }
  if (typeof value.fileName !== "string" || value.fileName.length > 500) return { ok: false, error: "Der PDF-Dateiname ist ungültig." };
  if (value.sourceFileNames !== undefined && (
    !Array.isArray(value.sourceFileNames)
    || value.sourceFileNames.length > 100
    || value.sourceFileNames.some((name) => typeof name !== "string" || name.length < 1 || name.length > 500)
  )) return { ok: false, error: "Die Liste der PDF-Dateien ist ungültig." };
  if (!record(value.scales)) return { ok: false, error: "Die PDF-Maßstäbe sind ungültig." };
  for (const scale of Object.values(value.scales)) {
    if (!finiteNumber(scale) || scale <= 0) return { ok: false, error: "Mindestens ein PDF-Maßstab ist ungültig." };
  }

  if (!Array.isArray(value.measurements)) return { ok: false, error: "Die Aufmaßpositionen fehlen." };
  if (value.measurements.length > PROJECT_STATE_LIMITS.maxMeasurements) return { ok: false, error: `Ein Projekt darf höchstens ${PROJECT_STATE_LIMITS.maxMeasurements.toLocaleString("de-DE")} Aufmaßpositionen enthalten.` };

  const measurementIds = new Set<string>();
  let totalPoints = 0;
  for (const rawMeasurement of value.measurements) {
    if (!record(rawMeasurement) || !safeId(rawMeasurement.id)) return { ok: false, error: "Mindestens eine Aufmaßpositions-ID ist ungültig." };
    if (measurementIds.has(rawMeasurement.id)) return { ok: false, error: `Die Aufmaßpositions-ID „${rawMeasurement.id}“ ist doppelt vorhanden.` };
    measurementIds.add(rawMeasurement.id);
    if (!["room", "area", "line", "count"].includes(String(rawMeasurement.kind))) return { ok: false, error: `Die Positionsart von „${rawMeasurement.id}“ ist ungültig.` };
    if (!textWithin(rawMeasurement.name, 500, true)) return { ok: false, error: `Die Bezeichnung von „${rawMeasurement.id}“ fehlt oder ist zu lang.` };
    if (!Number.isInteger(rawMeasurement.page) || rawMeasurement.page < 1 || rawMeasurement.page > PROJECT_STATE_LIMITS.maxPages) return { ok: false, error: `Die PDF-Seite von „${rawMeasurement.name}“ ist ungültig.` };
    if (!finiteNumber(rawMeasurement.quantity) || rawMeasurement.quantity < 0) return { ok: false, error: `Die Anzahl von „${rawMeasurement.name}“ darf nicht negativ sein.` };
    if (!finiteNumber(rawMeasurement.factor) || rawMeasurement.factor < 0) return { ok: false, error: `Der Faktor von „${rawMeasurement.name}“ darf nicht negativ sein.` };
    if (!optionalNonNegativeNumber(rawMeasurement.height)
      || !optionalNonNegativeNumber(rawMeasurement.areaOverride)
      || !optionalNonNegativeNumber(rawMeasurement.perimeterOverride)
      || !optionalNonNegativeNumber(rawMeasurement.lengthOverride)) {
      return { ok: false, error: `Mindestens ein Maß von „${rawMeasurement.name}“ ist ungültig.` };
    }
    if (rawMeasurement.geometryStatus !== undefined && !["matched", "uncertain", "missing", "manual"].includes(String(rawMeasurement.geometryStatus))) {
      return { ok: false, error: `Der Konturstatus von „${rawMeasurement.name}“ ist ungültig.` };
    }
    if (rawMeasurement.geometryNote !== undefined && !textWithin(rawMeasurement.geometryNote, 1_000)) {
      return { ok: false, error: `Der Konturhinweis von „${rawMeasurement.name}“ ist zu lang.` };
    }
    if (rawMeasurement.heightSource !== undefined && !["pdf-room", "project-default", "manual"].includes(String(rawMeasurement.heightSource))) {
      return { ok: false, error: `Die Herkunft der Raumhöhe von „${rawMeasurement.name}“ ist ungültig.` };
    }
    if (rawMeasurement.heightNote !== undefined && !textWithin(rawMeasurement.heightNote, 1_000)) {
      return { ok: false, error: `Der Hinweis zur Raumhöhe von „${rawMeasurement.name}“ ist zu lang.` };
    }
    if (rawMeasurement.labelAnchor !== undefined && (!record(rawMeasurement.labelAnchor) || !finiteNumber(rawMeasurement.labelAnchor.x) || !finiteNumber(rawMeasurement.labelAnchor.y))) {
      return { ok: false, error: `Der Raumstempel-Anker von „${rawMeasurement.name}“ ist ungültig.` };
    }
    if (rawMeasurement.requestedIncludeWalls !== undefined && typeof rawMeasurement.requestedIncludeWalls !== "boolean") {
      return { ok: false, error: `Der vorgemerkte Wandansatz von „${rawMeasurement.name}“ ist ungültig.` };
    }
    if (rawMeasurement.requestedIncludeSkirting !== undefined && typeof rawMeasurement.requestedIncludeSkirting !== "boolean") {
      return { ok: false, error: `Der vorgemerkte Sockelansatz von „${rawMeasurement.name}“ ist ungültig.` };
    }
    if (!Array.isArray(rawMeasurement.points) || rawMeasurement.points.length > PROJECT_STATE_LIMITS.maxPointsPerMeasurement) return { ok: false, error: `Die Geometrie von „${rawMeasurement.name}“ ist ungültig oder zu groß.` };
    totalPoints += rawMeasurement.points.length;
    if (totalPoints > PROJECT_STATE_LIMITS.maxTotalPoints) return { ok: false, error: "Das Projekt enthält zu viele Geometriepunkte." };
    for (const point of rawMeasurement.points) {
      if (!record(point) || !finiteNumber(point.x) || !finiteNumber(point.y)) return { ok: false, error: `Die Geometrie von „${rawMeasurement.name}“ enthält einen ungültigen Punkt.` };
    }

    const openings = rawMeasurement.openings ?? [];
    if (!Array.isArray(openings) || openings.length > PROJECT_STATE_LIMITS.maxOpeningsPerMeasurement) return { ok: false, error: `„${rawMeasurement.name}“ enthält zu viele oder ungültige Öffnungen.` };
    const openingIds = new Set<string>();
    for (const opening of openings) {
      if (!record(opening) || !safeId(opening.id) || openingIds.has(opening.id)) return { ok: false, error: `„${rawMeasurement.name}“ enthält eine ungültige oder doppelte Öffnungs-ID.` };
      openingIds.add(opening.id);
      if (!textWithin(opening.name, 500, true)) return { ok: false, error: `Eine Öffnungsbezeichnung in „${rawMeasurement.name}“ fehlt oder ist zu lang.` };
      if (!finiteNumber(opening.width) || opening.width < 0 || !finiteNumber(opening.height) || opening.height < 0 || !finiteNumber(opening.quantity) || opening.quantity < 0) return { ok: false, error: `Die Öffnung „${opening.name}“ besitzt negative oder ungültige Maße.` };
      if (!optionalNonNegativeNumber(opening.revealDepth)) return { ok: false, error: `Die Laibungstiefe von „${opening.name}“ ist ungültig.` };
      if (!["vob", "always", "never"].includes(String(opening.mode))) return { ok: false, error: `Die Abzugsart von „${opening.name}“ ist ungültig.` };
    }
  }

  const panoramas = value.panoramas ?? [];
  if (!Array.isArray(panoramas) || panoramas.length > PROJECT_STATE_LIMITS.maxPanoramas) return { ok: false, error: "Die 360°-Anlagen sind ungültig oder zu zahlreich." };
  if (!record(value.materials) || !record(value.autoSettings)) return { ok: false, error: "Material- oder Auto-Aufmaß-Einstellungen fehlen." };

  return { ok: true, state: value as unknown as StoredProjectState };
}

export function parseStoredProjectState(raw: string): ProjectStateValidationResult {
  if (new TextEncoder().encode(raw).byteLength > PROJECT_STATE_LIMITS.maxBytes) {
    return { ok: false, error: "Die Projektdaten überschreiten die zulässige Größe von 5 MB." };
  }
  try {
    return validateStoredProjectState(JSON.parse(raw));
  } catch {
    return { ok: false, error: "Die Projektdaten sind kein gültiges JSON-Dokument." };
  }
}
