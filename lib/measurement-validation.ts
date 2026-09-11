import {
  roomAreaMeters,
  roomHeightMeters,
  roomPerimeterMeters,
  type LineItem,
  type Measurement,
} from "@/lib/measurements";
import { calculateOpeningRule } from "@/lib/vob-rules";

export type CalculationIssue = {
  id: string;
  severity: "error" | "warning";
  label: string;
  detail: string;
  measurementId?: string;
  lineId?: string;
};

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function openingSignature(opening: NonNullable<Measurement["openings"]>[number]) {
  return [
    opening.openingKind ?? "other",
    opening.name.trim().toLocaleLowerCase("de-DE"),
    Number(opening.width).toFixed(3),
    Number(opening.height).toFixed(3),
    Number(opening.quantity).toFixed(3),
  ].join("|");
}

export function validateMeasurements(
  measurements: Measurement[],
  scales: Record<number, number>,
  threshold: number,
  rows: LineItem[] = [],
): CalculationIssue[] {
  const issues: CalculationIssue[] = [];

  if (!Number.isFinite(threshold) || threshold < 0) {
    issues.push({
      id: "invalid-opening-threshold",
      severity: "error",
      label: "Übermessungsgrenze ungültig",
      detail: "Die Öffnungsregel benötigt einen endlichen, nicht negativen Projektschwellenwert.",
    });
  }

  measurements.filter((measurement) => measurement.visible).forEach((measurement) => {
    const name = measurement.name.trim() || "Unbenannte Position";
    if (!measurement.name.trim()) {
      issues.push({ id: `name-${measurement.id}`, severity: "error", label: "Bezeichnung fehlt", detail: "Jede Aufmaßposition benötigt eine eindeutige Bezeichnung.", measurementId: measurement.id });
    }
    if (!positive(measurement.quantity)) {
      issues.push({ id: `quantity-${measurement.id}`, severity: "error", label: `${name}: Anzahl ungültig`, detail: "Die Anzahl muss größer als null sein.", measurementId: measurement.id });
    }
    if (!positive(measurement.factor)) {
      issues.push({ id: `factor-${measurement.id}`, severity: "error", label: `${name}: Faktor ungültig`, detail: "Der Berechnungsfaktor muss größer als null sein.", measurementId: measurement.id });
    }

    if (measurement.kind !== "room") return;

    const scale = scales[measurement.page];
    const area = roomAreaMeters(measurement, scale);
    const perimeter = roomPerimeterMeters(measurement, scale);
    const height = roomHeightMeters(measurement);
    const needsArea = Boolean(measurement.includeFloor || measurement.includeCeiling);
    const needsPerimeter = Boolean(measurement.includeWalls || measurement.includeSkirting);
    const geometryNeedsReview = measurement.geometryStatus === "missing" || measurement.geometryStatus === "uncertain";
    const perimeterWasRequested = Boolean(measurement.requestedIncludeWalls || measurement.requestedIncludeSkirting);

    if (geometryNeedsReview) {
      issues.push({
        id: `geometry-review-${measurement.id}`,
        severity: perimeterWasRequested ? "error" : "warning",
        label: `${name}: Raumkontur nicht eindeutig`,
        detail: perimeterWasRequested
          ? "Die NRF-Fläche ist lesbar, der Raumumfang aber nicht. Wandflächen und Fußleisten bleiben gesperrt, bis die Kontur im Grundriss manuell bestätigt wurde."
          : "Die NRF-Fläche ist lesbar; für eine spätere Umfangs-, Wand- oder Sockelberechnung muss die Raumkontur manuell bestätigt werden.",
        measurementId: measurement.id,
      });
    } else if (measurement.areaSource === "pdf-nrf" && measurement.source === "auto" && !measurement.geometryStatus) {
      issues.push({
        id: `legacy-geometry-${measurement.id}`,
        severity: "warning",
        label: `${name}: ältere automatische Kontur prüfen`,
        detail: "Diese Position wurde vor der eindeutigen Konturprüfung erzeugt. Raumumfang und Wandansatz bitte kontrollieren oder die Kontur neu zeichnen.",
        measurementId: measurement.id,
      });
    }

    if (!measurement.includeFloor && !measurement.includeCeiling && !measurement.includeWalls && !measurement.includeSkirting) {
      issues.push({ id: `surfaces-${measurement.id}`, severity: "error", label: `${name}: keine Leistung ausgewählt`, detail: "Mindestens Wand, Decke, Boden oder Sockelleiste muss ausgewählt sein.", measurementId: measurement.id });
    }
    if (needsArea && !positive(area)) {
      issues.push({ id: `area-${measurement.id}`, severity: "error", label: `${name}: Grundfläche fehlt`, detail: "Boden- oder Deckenfläche kann ohne bestätigte positive Fläche nicht berechnet werden.", measurementId: measurement.id });
    }
    if (needsPerimeter && !positive(perimeter)) {
      issues.push({ id: `perimeter-${measurement.id}`, severity: "error", label: `${name}: Umfang fehlt`, detail: "Wand oder Sockelleiste kann ohne bestätigten positiven Raumumfang nicht berechnet werden.", measurementId: measurement.id });
    }
    if (measurement.includeWalls && !positive(height)) {
      issues.push({ id: `height-${measurement.id}`, severity: "error", label: `${name}: Raumhöhe fehlt`, detail: "Es wird kein Ersatzwert eingesetzt. Bitte die tatsächliche Raumhöhe eingeben.", measurementId: measurement.id });
    } else if (measurement.includeWalls && (height < 1.8 || height > 5)) {
      issues.push({ id: `height-unusual-${measurement.id}`, severity: "warning", label: `${name}: Raumhöhe ungewöhnlich`, detail: `${height.toLocaleString("de-DE")} m liegt außerhalb des üblichen Prüfbereichs von 1,80 bis 5,00 m.`, measurementId: measurement.id });
    }

    const openings = measurement.openings ?? [];
    const seen = new Set<string>();
    let totalDeduction = 0;
    openings.forEach((opening) => {
      const result = calculateOpeningRule(opening, threshold);
      if (!result.determinate) {
        issues.push({ id: `opening-invalid-${measurement.id}-${opening.id}`, severity: "error", label: `${name}: Öffnung „${opening.name || "ohne Bezeichnung"}“ unvollständig`, detail: "Breite, Höhe, Anzahl, Laibungstiefe und Projektschwelle müssen gültig sein. Bitte Eingabe kontrollieren.", measurementId: measurement.id });
      }
      if (result.isDoor && result.determinate && (opening.width < 0.5 || opening.width > 3 || opening.height < 1.5 || opening.height > 3.2)) {
        issues.push({ id: `door-unusual-${measurement.id}-${opening.id}`, severity: "warning", label: `${name}: Türmaß ungewöhnlich`, detail: `${opening.width.toLocaleString("de-DE")} × ${opening.height.toLocaleString("de-DE")} m bitte auf Einheit und Zuordnung prüfen.`, measurementId: measurement.id });
      }
      if (!result.isDoor && result.determinate && (opening.width > 8 || opening.height > 5)) {
        issues.push({ id: `opening-unusual-${measurement.id}-${opening.id}`, severity: "warning", label: `${name}: Öffnungsmaß ungewöhnlich`, detail: `${opening.width.toLocaleString("de-DE")} × ${opening.height.toLocaleString("de-DE")} m bitte kontrollieren.`, measurementId: measurement.id });
      }
      const signature = openingSignature(opening);
      if (seen.has(signature)) {
        issues.push({ id: `opening-duplicate-${measurement.id}-${opening.id}`, severity: "warning", label: `${name}: Öffnung möglicherweise doppelt`, detail: `„${opening.name || "Öffnung"}“ mit gleichen Maßen und gleicher Anzahl wurde mehrfach erfasst.`, measurementId: measurement.id });
      }
      seen.add(signature);
      totalDeduction += result.deduct;
    });

    const wallGross = perimeter * height;
    if (measurement.includeWalls && positive(wallGross) && totalDeduction > wallGross + 1e-9) {
      issues.push({ id: `openings-exceed-wall-${measurement.id}`, severity: "error", label: `${name}: Abzüge größer als Wandfläche`, detail: `Öffnungsabzüge ${totalDeduction.toLocaleString("de-DE")} m² überschreiten die Wandbruttofläche ${wallGross.toLocaleString("de-DE")} m². Zuordnung und Einheiten prüfen.`, measurementId: measurement.id });
    }
  });

  rows.forEach((row) => {
    if (![row.gross, row.deduction, row.result].every(Number.isFinite)) {
      issues.push({ id: `line-nonfinite-${row.id}`, severity: "error", label: `${row.room}: Berechnung nicht möglich`, detail: `${row.description} enthält keinen endlichen Rechenwert.`, lineId: row.id, measurementId: row.measurementId });
    }
    if (row.gross < 0 || row.deduction < 0 || row.result < 0) {
      issues.push({ id: `line-negative-${row.id}`, severity: "error", label: `${row.room}: negative Menge`, detail: `${row.description} ergibt einen unzulässigen negativen Wert.`, lineId: row.id, measurementId: row.measurementId });
    }
  });

  return issues;
}
