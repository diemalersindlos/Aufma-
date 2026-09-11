import type { Measurement, Opening, Point } from "@/lib/measurements";
import type { ProjectAuditChange, ProjectAuditValue, StoredProjectState } from "@/lib/project-storage-types";

const MAX_CHANGES = 500;

type ChangeWriter = (path: string, label: string, before: unknown, after: unknown) => void;

function auditValue(value: unknown): ProjectAuditValue {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "boolean") return value;
  return JSON.stringify(value).slice(0, 500);
}

function sameValue(before: unknown, after: unknown) {
  return JSON.stringify(before ?? null) === JSON.stringify(after ?? null);
}

function pointSummary(points: Point[]) {
  const coordinates = points.slice(0, 8).map((point) => `${Number(point.x.toFixed(2))}/${Number(point.y.toFixed(2))}`).join("; ");
  return `${points.length} Punkte${coordinates ? ` · ${coordinates}${points.length > 8 ? " …" : ""}` : ""}`;
}

function measurementLabel(measurement: Measurement) {
  return `${measurement.kind === "room" ? "Raum" : "Position"} „${measurement.name || measurement.id}“`;
}

function openingLabel(measurement: Measurement, opening: Opening) {
  return `${measurementLabel(measurement)} · Öffnung „${opening.name || opening.id}“`;
}

function compareOpening(write: ChangeWriter, measurement: Measurement, before: Opening, after: Opening) {
  const prefix = `measurements.${measurement.id}.openings.${after.id}`;
  const label = openingLabel(measurement, after);
  const fields: Array<[keyof Opening, string]> = [
    ["name", "Bezeichnung"], ["openingKind", "Art"], ["width", "Breite"], ["height", "Höhe"],
    ["quantity", "Anzahl"], ["mode", "Abzugsregel"], ["revealDepth", "Laibungstiefe"],
  ];
  for (const [key, fieldLabel] of fields) write(`${prefix}.${key}`, `${label} · ${fieldLabel}`, before[key], after[key]);
}

function compareMeasurement(write: ChangeWriter, before: Measurement, after: Measurement) {
  const prefix = `measurements.${after.id}`;
  const label = measurementLabel(after);
  const fields: Array<[keyof Measurement, string]> = [
    ["kind", "Bauteilart"], ["name", "Bezeichnung"], ["page", "PDF-Seite"], ["height", "Höhe"],
    ["quantity", "Anzahl"], ["factor", "Faktor"], ["includeWalls", "Wände"], ["includeCeiling", "Decke"],
    ["includeFloor", "Boden"], ["includeSkirting", "Sockelleiste"], ["areaCategory", "Flächenart"],
    ["lineCategory", "Längenart"], ["areaOverride", "Fläche"], ["perimeterOverride", "Umfang"],
    ["lengthOverride", "Länge"], ["manualFormula", "Formel"], ["visible", "Sichtbar"], ["source", "Quelle"],
    ["areaSource", "Flächenquelle"], ["confidence", "Erkennungssicherheit"],
  ];
  for (const [key, fieldLabel] of fields) write(`${prefix}.${key}`, `${label} · ${fieldLabel}`, before[key], after[key]);
  if (!sameValue(before.points, after.points)) write(`${prefix}.points`, `${label} · Kontur`, pointSummary(before.points), pointSummary(after.points));

  const beforeOpenings = new Map((before.openings ?? []).map((opening) => [opening.id, opening]));
  const afterOpenings = new Map((after.openings ?? []).map((opening) => [opening.id, opening]));
  for (const opening of afterOpenings.values()) {
    const previous = beforeOpenings.get(opening.id);
    if (!previous) write(`${prefix}.openings.${opening.id}`, `${openingLabel(after, opening)} · hinzugefügt`, null, `${opening.width} × ${opening.height} m · ${opening.quantity} Stk`);
    else compareOpening(write, after, previous, opening);
  }
  for (const opening of beforeOpenings.values()) {
    if (!afterOpenings.has(opening.id)) write(`${prefix}.openings.${opening.id}`, `${openingLabel(before, opening)} · entfernt`, `${opening.width} × ${opening.height} m · ${opening.quantity} Stk`, null);
  }
}

export function buildProjectChanges(previous: StoredProjectState | null, next: StoredProjectState): ProjectAuditChange[] {
  if (!previous) {
    return [
      { path: "project", label: "Projektakte", before: null, after: next.meta.title || "Neues Projekt" },
      { path: "measurements", label: "Aufmaßpositionen", before: null, after: next.measurements.length },
      { path: "fileName", label: "Grundriss-PDF", before: null, after: next.fileName || null },
    ];
  }

  const changes: ProjectAuditChange[] = [];
  const write: ChangeWriter = (path, label, before, after) => {
    if (changes.length >= MAX_CHANGES || sameValue(before, after)) return;
    changes.push({ path, label, before: auditValue(before), after: auditValue(after) });
  };

  const projectFields: Array<[keyof StoredProjectState["meta"], string]> = [
    ["title", "Projektname"], ["customer", "Kunde"], ["address", "Baustellenadresse"],
    ["estimator", "Bearbeiter"], ["reference", "Projektnummer / Referenz"], ["standard", "Abrechnungsgrundlage"],
    ["deductionThreshold", "VOB-Übermessungsgrenze"], ["rounding", "Rundung"],
    ["vobRuleSetId", "VOB-Regelsatz"], ["vobRuleConfirmed", "VOB-Regel bestätigt"],
    ["vobRuleConfirmedBy", "VOB-Regel bestätigt durch"], ["vobRuleConfirmedAt", "VOB-Regel bestätigt am"],
  ];
  for (const [key, label] of projectFields) write(`meta.${key}`, label, previous.meta[key], next.meta[key]);
  write("status", "Projektstatus", previous.status, next.status);
  write("fileName", "Grundriss-PDF", previous.fileName, next.fileName);
  write("pageCount", "PDF-Seiten", previous.pageCount, next.pageCount);
  write("includedPages", "Zusammengerechnete PDF-Seiten", previous.includedPages ?? [], next.includedPages ?? []);
  write("scales", "PDF-Maßstäbe", previous.scales, next.scales);

  const materialFields: Array<[string, string]> = [
    ["paint", "Farbe"], ["filler", "Spachtelmasse"], ["wallpaper", "Tapete"],
  ];
  for (const [key, label] of materialFields) {
    const typedKey = key as keyof StoredProjectState["materials"];
    write(`materials.${key}`, `Materialeinstellung · ${label}`, previous.materials[typedKey], next.materials[typedKey]);
  }

  const beforeMeasurements = new Map(previous.measurements.map((measurement) => [measurement.id, measurement]));
  const afterMeasurements = new Map(next.measurements.map((measurement) => [measurement.id, measurement]));
  for (const measurement of afterMeasurements.values()) {
    const before = beforeMeasurements.get(measurement.id);
    if (!before) write(`measurements.${measurement.id}`, `${measurementLabel(measurement)} · hinzugefügt`, null, `${measurement.kind} · Seite ${measurement.page}`);
    else compareMeasurement(write, before, measurement);
  }
  for (const measurement of beforeMeasurements.values()) {
    if (!afterMeasurements.has(measurement.id)) write(`measurements.${measurement.id}`, `${measurementLabel(measurement)} · entfernt`, `${measurement.kind} · Seite ${measurement.page}`, null);
  }

  const previousReview = previous.professional?.review;
  const nextReview = next.professional?.review;
  write("professional.review.workflowStatus", "Prüfstatus", previousReview?.workflowStatus, nextReview?.workflowStatus);
  write("professional.review.revision", "Prüfrevision", previousReview?.revision, nextReview?.revision);
  write("professional.review.reviewer", "Prüfer", previousReview?.reviewer, nextReview?.reviewer);
  write("professional.review.releaseCode", "Freigabecode", previousReview?.releaseCode, nextReview?.releaseCode);

  if (changes.length === MAX_CHANGES) changes.push({ path: "audit.truncated", label: "Weitere Änderungen", before: null, after: "Protokollauszug auf 500 Änderungen begrenzt" });
  return changes;
}

export function lifecycleChange(label: string, before: ProjectAuditValue, after: ProjectAuditValue): ProjectAuditChange[] {
  return [{ path: "lifecycle", label, before, after }];
}
