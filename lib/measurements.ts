import type { LaserMeasurementRecord } from "@/lib/bluetooth-laser";
import { calculateOpeningRule } from "@/lib/vob-rules";

export type Point = { x: number; y: number };

export type MeasurementKind = "room" | "area" | "line" | "count";
export type RoomGeometryStatus = "matched" | "uncertain" | "missing" | "manual";

export type Opening = {
  id: string;
  name: string;
  width: number;
  height: number;
  quantity: number;
  mode: "vob" | "always" | "never";
  openingKind?: "door" | "window" | "other";
  revealDepth?: number;
  marker?: Point;
};

export type Measurement = {
  id: string;
  kind: MeasurementKind;
  name: string;
  page: number;
  points: Point[];
  color: string;
  height?: number;
  heightSource?: "pdf-room" | "project-default" | "manual";
  heightNote?: string;
  quantity: number;
  factor: number;
  includeFloor?: boolean;
  includeCeiling?: boolean;
  includeWalls?: boolean;
  includeSkirting?: boolean;
  areaCategory?: string;
  lineCategory?: string;
  openings?: Opening[];
  source?: "manual" | "auto";
  areaOverride?: number;
  perimeterOverride?: number;
  lengthOverride?: number;
  geometryStatus?: RoomGeometryStatus;
  geometryNote?: string;
  labelAnchor?: Point;
  requestedIncludeWalls?: boolean;
  requestedIncludeSkirting?: boolean;
  manualFormula?: string;
  areaSource?: "pdf-nrf" | "pdf-dimensions" | "pdf-scale" | "insta360-reference" | "laser-reference" | "special-geometry" | "freehand-sketch";
  captureSource?: {
    type: "insta360";
    panoramaId: string;
    fileName: string;
    cameraModel: string;
    referenceMethod: "laser" | "known" | "manual";
    shape: "rectangle" | "free";
    length?: number;
    width?: number;
  };
  proCapture?: {
    type: "laser" | "special-shape" | "sketch";
    label: string;
    formula: string;
    capturedAt: string;
    device?: string;
    measurementMode?: "manual" | "bluetooth";
    laserMeasurements?: LaserMeasurementRecord[];
    shape?: string;
    length?: number;
    width?: number;
    height?: number;
    referenceSide?: number;
    referenceMeters?: number;
    metersPerPixel?: number;
    sketchPoints?: Point[];
    confidence?: number;
    automaticallyStraightened?: boolean;
    crossingsRepaired?: number;
    manuallyCorrected?: boolean;
    inputMethod?: "apple-pencil" | "touch" | "mouse";
  };
  confidence?: number;
  visible: boolean;
  createdAt: string;
};

export type ProjectMeta = {
  id: string;
  title: string;
  customer: string;
  address: string;
  estimator: string;
  reference: string;
  standard: string;
  deductionThreshold: number;
  vobRuleSetId?: string;
  vobRuleConfirmed?: boolean;
  vobRuleConfirmedBy?: string;
  vobRuleConfirmedAt?: string;
  rounding: number;
  updatedAt: string;
  serverUpdatedAt?: string;
};

export type ProjectData = {
  meta: ProjectMeta;
  fileName: string;
  sourceFileNames?: string[];
  pageCount: number;
  includedPages?: number[];
  scales: Record<number, number>;
  measurements: Measurement[];
};

export type LineItem = {
  id: string;
  measurementId: string;
  room: string;
  description: string;
  formula: string;
  gross: number;
  deduction: number;
  result: number;
  unit: "m²" | "m" | "Stk";
  category: string;
};

export const measurementColors: Record<MeasurementKind, string> = {
  room: "#8E1E6E",
  area: "#D96F39",
  line: "#E79A32",
  count: "#6C347A",
};

// Raumfarben werden im Grundriss und in den Excel-Dateien identisch verwendet.
// Die Palette ist bewusst kontrastreich, damit benachbarte Räume unterscheidbar
// bleiben und die Kennfarbe auch in einer großen Aufmaßliste schnell auffällt.
export const roomColorPalette = [
  "#8E1E6E", "#D96F39", "#2E6F95", "#3A7D68", "#7B5AA6", "#B44D5E",
  "#397D88", "#9A681E", "#4F7846", "#A13F77", "#4968A8", "#8A5A44",
  "#5E3F8C", "#C45B35", "#217A6B", "#A23B4F", "#33658A", "#6F7F2F",
  "#9B4F96", "#3E7C59", "#B36A22", "#585A9C", "#A64762", "#35727A",
] as const;

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sector = hue / 60;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] = sector < 1
    ? [chroma, secondary, 0]
    : sector < 2
      ? [secondary, chroma, 0]
      : sector < 3
        ? [0, chroma, secondary]
        : sector < 4
          ? [0, secondary, chroma]
          : sector < 5
            ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const match = l - chroma / 2;
  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

export function measurementColor(kind: MeasurementKind, index = 0) {
  if (kind !== "room") return measurementColors[kind];
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
  if (safeIndex < roomColorPalette.length) return roomColorPalette[safeIndex];
  const hue = (safeIndex * 137.508 + 318) % 360;
  const saturation = 56 + (safeIndex % 4) * 6;
  const lightness = 37 + (Math.floor(safeIndex / 4) % 3) * 7;
  return hslToHex(hue, saturation, lightness);
}

function validHexColor(value: string | undefined) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** Migrates older drafts in which every room used the same default color. */
export function normalizeMeasurementColors(measurements: Measurement[]) {
  const usedRoomColors = new Set<string>();
  return measurements.map((measurement) => {
    if (measurement.kind !== "room") {
      return validHexColor(measurement.color)
        ? measurement
        : { ...measurement, color: measurementColors[measurement.kind] };
    }
    const currentColor = validHexColor(measurement.color) ? measurement.color.toUpperCase() : "";
    let color = currentColor && !usedRoomColors.has(currentColor) ? measurement.color : "";
    if (!color) {
      let index = 0;
      do {
        color = measurementColor("room", index);
        index += 1;
      } while (usedRoomColors.has(color.toUpperCase()));
    }
    usedRoomColors.add(color.toUpperCase());
    return color === measurement.color ? measurement : { ...measurement, color };
  });
}

/**
 * Older PDF-NRF drafts could contain a generated, rescaled perimeter without
 * an explicit review status. Preserve the stored points for traceability, but
 * block perimeter-dependent quantities until the contour is confirmed again.
 */
export function normalizeLegacyPdfRoomGeometry(measurements: Measurement[]) {
  return measurements.map((measurement) => {
    if (
      measurement.kind !== "room"
      || measurement.source !== "auto"
      || measurement.areaSource !== "pdf-nrf"
      || measurement.geometryStatus
    ) return measurement;
    return {
      ...measurement,
      geometryStatus: "uncertain" as const,
      geometryNote: "Ältere automatische Kontur: Raumumfang vor weiterer Berechnung neu kontrollieren.",
      labelAnchor: measurement.labelAnchor ?? polygonCentroid(measurement.points),
      requestedIncludeWalls: measurement.requestedIncludeWalls ?? Boolean(measurement.includeWalls),
      requestedIncludeSkirting: measurement.requestedIncludeSkirting ?? Boolean(measurement.includeSkirting),
      includeWalls: false,
      includeSkirting: false,
    };
  });
}

export function nextRoomColor(measurements: Pick<Measurement, "kind" | "color">[]) {
  const used = new Set(
    measurements
      .filter((measurement) => measurement.kind === "room" && validHexColor(measurement.color))
      .map((measurement) => measurement.color.toUpperCase()),
  );
  let index = 0;
  while (index < 10_000) {
    const candidate = measurementColor("room", index);
    if (!used.has(candidate.toUpperCase())) return candidate;
    index += 1;
  }
  return measurementColor("room", measurements.length);
}

/** Rooms stay out of the plan until the user selects one in the side list. */
export function measurementIsVisibleOnPlan(measurement: Pick<Measurement, "id" | "kind">, selectedId: string | null) {
  return measurement.kind !== "room" || measurement.id === selectedId;
}

export function createId(prefix = "item") {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${randomId}`;
}

export function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polylinePixels(points: Point[], closed = false) {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) {
    sum += distance(points[i - 1], points[i]);
  }
  if (closed && points.length > 2) sum += distance(points.at(-1)!, points[0]);
  return sum;
}

export function polygonPixels(points: Point[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function finiteNonNegative(value: number | undefined, fallback = 0) {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : fallback;
}

function positive(value: number | undefined) {
  return Number.isFinite(value) && Number(value) > 0;
}

export function measurementMultiplier(measurement: Pick<Measurement, "quantity" | "factor">) {
  return finiteNonNegative(measurement.quantity) * finiteNonNegative(measurement.factor);
}

export function roomHeightMeters(measurement: Pick<Measurement, "height">) {
  return finiteNonNegative(measurement.height);
}

export function roomAreaMeters(measurement: Measurement, scale: number) {
  if (measurement.areaOverride !== undefined) return finiteNonNegative(measurement.areaOverride);
  return positive(scale) ? polygonPixels(measurement.points) * scale * scale : 0;
}

export function roomPerimeterMeters(measurement: Measurement, scale: number) {
  if (measurement.perimeterOverride !== undefined) return finiteNonNegative(measurement.perimeterOverride);
  return positive(scale) ? polylinePixels(measurement.points, true) * scale : 0;
}

export function polygonCentroid(points: Point[]): Point {
  if (!points.length) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

export function formatNumber(value: number, decimals = 2) {
  const safeDecimals = Number.isInteger(decimals) ? Math.min(6, Math.max(0, decimals)) : 2;
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: safeDecimals,
    maximumFractionDigits: safeDecimals,
  }).format(Number.isFinite(value) ? value : 0);
}

function round(value: number, decimals: number) {
  const safeDecimals = Number.isInteger(decimals) ? Math.min(6, Math.max(0, decimals)) : 2;
  const factor = 10 ** safeDecimals;
  const safeValue = Number.isFinite(value) ? value : 0;
  return Math.round((safeValue + Number.EPSILON) * factor) / factor;
}

export function openingCalculation(opening: Opening, threshold: number) {
  const result = calculateOpeningRule(opening, threshold);
  return {
    each: result.each,
    gross: result.gross,
    deduct: result.deduct,
    overmeasured: result.overmeasured,
    isDoor: result.isDoor,
    revealDepth: result.revealDepth,
    revealSides: result.revealSides,
    revealLength: result.revealLength,
    revealGross: result.revealGross,
    revealSeparate: result.revealSeparate,
    revealResult: result.revealResult,
  };
}

export function deriveLineItems(
  measurements: Measurement[],
  scales: Record<number, number>,
  threshold: number,
  decimals: number,
) {
  const rows: LineItem[] = [];

  measurements.forEach((measurement) => {
    if (!measurement.visible) return;
    const multiplier = measurementMultiplier(measurement);

    if (measurement.kind === "count") {
      const quantity = finiteNonNegative(measurement.quantity);
      const factor = finiteNonNegative(measurement.factor);
      rows.push({
        id: `${measurement.id}_count`,
        measurementId: measurement.id,
        room: measurement.name,
        description: "Stückzahl",
        formula: `${formatNumber(quantity, 0)} × ${formatNumber(factor)}`,
        gross: round(multiplier, decimals),
        deduction: 0,
        result: round(multiplier, decimals),
        unit: "Stk",
        category: "Stück",
      });
      return;
    }

    const scale = scales[measurement.page];
    const usesRoomOverrides = measurement.kind === "room"
      && measurement.areaOverride !== undefined
      && measurement.perimeterOverride !== undefined;
    const usesAreaOverride = measurement.kind === "area" && measurement.areaOverride !== undefined;
    const usesLengthOverride = measurement.kind === "line" && measurement.lengthOverride !== undefined;
    if (!positive(scale) && !usesRoomOverrides && !usesAreaOverride && !usesLengthOverride) return;

    if (measurement.kind === "room") {
      const area = roomAreaMeters(measurement, scale);
      const perimeter = roomPerimeterMeters(measurement, scale);
      const height = roomHeightMeters(measurement);
      const geometryBlocksPerimeter = measurement.geometryStatus === "missing" || measurement.geometryStatus === "uncertain";
      const openingDeduction = (measurement.openings ?? []).reduce(
        (sum, opening) => sum + openingCalculation(opening, threshold).deduct,
        0,
      );

      const rectangleLength = measurement.captureSource?.length ?? measurement.proCapture?.length;
      const rectangleWidth = measurement.captureSource?.width ?? measurement.proCapture?.width;
      const rectangleLengthMeters = positive(rectangleLength) ? Number(rectangleLength) : 0;
      const rectangleWidthMeters = positive(rectangleWidth) ? Number(rectangleWidth) : 0;
      const hasRectangleBasis = rectangleLengthMeters > 0 && rectangleWidthMeters > 0;

      if (measurement.includeFloor) {
        const gross = area * multiplier;
        rows.push({
          id: `${measurement.id}_floor`,
          measurementId: measurement.id,
          room: measurement.name,
          description: "Bodenfläche",
          formula: hasRectangleBasis
            ? `${formatNumber(rectangleLengthMeters)} m × ${formatNumber(rectangleWidthMeters)} m × ${formatNumber(multiplier)}`
            : `${formatNumber(area)} m² × ${formatNumber(multiplier)}`,
          gross: round(gross, decimals),
          deduction: 0,
          result: round(gross, decimals),
          unit: "m²",
          category: "Boden",
        });
      }

      if (measurement.includeCeiling) {
        const gross = area * multiplier;
        rows.push({
          id: `${measurement.id}_ceiling`,
          measurementId: measurement.id,
          room: measurement.name,
          description: "Deckenfläche",
          formula: hasRectangleBasis
            ? `${formatNumber(rectangleLengthMeters)} m × ${formatNumber(rectangleWidthMeters)} m × ${formatNumber(multiplier)}`
            : `${formatNumber(area)} m² × ${formatNumber(multiplier)}`,
          gross: round(gross, decimals),
          deduction: 0,
          result: round(gross, decimals),
          unit: "m²",
          category: "Decke",
        });
      }

      if (measurement.includeWalls && !geometryBlocksPerimeter) {
        const gross = perimeter * height * multiplier;
        const deduction = openingDeduction * multiplier;
        rows.push({
          id: `${measurement.id}_walls`,
          measurementId: measurement.id,
          room: measurement.name,
          description: "Wandfläche",
          formula: hasRectangleBasis
            ? `2 × (${formatNumber(rectangleLengthMeters)} m + ${formatNumber(rectangleWidthMeters)} m) × ${formatNumber(height)} m × ${formatNumber(multiplier)}`
            : `${formatNumber(perimeter)} m × ${formatNumber(height)} m × ${formatNumber(multiplier)}`,
          gross: round(gross, decimals),
          deduction: round(deduction, decimals),
          result: round(Math.max(0, gross - deduction), decimals),
          unit: "m²",
          category: "Wand",
        });
      }

      if (measurement.includeSkirting && !geometryBlocksPerimeter) {
        const gross = perimeter * multiplier;
        rows.push({
          id: `${measurement.id}_skirting`,
          measurementId: measurement.id,
          room: measurement.name,
          description: "Sockelleisten / Anschlusslänge",
          formula: hasRectangleBasis
            ? `2 × (${formatNumber(rectangleLengthMeters)} m + ${formatNumber(rectangleWidthMeters)} m) × ${formatNumber(multiplier)}`
            : `${formatNumber(perimeter)} m × ${formatNumber(multiplier)}`,
          gross: round(gross, decimals),
          deduction: 0,
          result: round(gross, decimals),
          unit: "m",
          category: "Länge",
        });
      }

      (measurement.openings ?? []).forEach((opening) => {
        if (!measurement.includeWalls) return;
        const calculation = openingCalculation(opening, threshold);
        if (calculation.revealDepth <= 0) return;
        const gross = calculation.revealGross * multiplier;
        const result = calculation.revealResult * multiplier;
        rows.push({
          id: `${measurement.id}_${opening.id}_reveal`,
          measurementId: measurement.id,
          room: measurement.name,
          description: calculation.revealSeparate
            ? `Laibungsfläche · ${opening.name} · separat`
            : `Laibungsfläche · ${opening.name} · nicht zusätzlich angesetzt`,
          formula: `3-seitig (links + rechts + oben): (2 × ${formatNumber(opening.height)} m + ${formatNumber(opening.width)} m) × ${formatNumber(calculation.revealDepth)} m × ${formatNumber(opening.quantity, 0)} × ${formatNumber(multiplier)}${calculation.revealSeparate ? "" : " · Öffnung wird übermessen"}`,
          gross: round(gross, decimals),
          deduction: round(Math.max(0, gross - result), decimals),
          result: round(result, decimals),
          unit: "m²",
          category: "Laibungen",
        });
      });
      return;
    }

    if (measurement.kind === "area") {
      const baseArea = measurement.areaOverride !== undefined
        ? finiteNonNegative(measurement.areaOverride)
        : polygonPixels(measurement.points) * scale * scale;
      const area = baseArea * multiplier;
      rows.push({
        id: `${measurement.id}_area`,
        measurementId: measurement.id,
        room: measurement.name,
        description: measurement.areaCategory || "Freie Fläche",
        formula: measurement.manualFormula
          ? `${measurement.manualFormula} × ${formatNumber(multiplier)}`
          : `${formatNumber(baseArea)} m² × ${formatNumber(multiplier)}`,
        gross: round(area, decimals),
        deduction: 0,
        result: round(area, decimals),
        unit: "m²",
        category: measurement.areaCategory || "Fläche",
      });
      return;
    }

    if (measurement.kind === "line") {
      const baseLength = measurement.lengthOverride !== undefined
        ? finiteNonNegative(measurement.lengthOverride)
        : polylinePixels(measurement.points) * scale;
      const length = baseLength * multiplier;
      rows.push({
        id: `${measurement.id}_line`,
        measurementId: measurement.id,
        room: measurement.name,
        description: measurement.lineCategory || "Freie Länge",
        formula: measurement.manualFormula
          ? `${measurement.manualFormula} × ${formatNumber(multiplier)}`
          : `${formatNumber(baseLength)} m × ${formatNumber(multiplier)}`,
        gross: round(length, decimals),
        deduction: 0,
        result: round(length, decimals),
        unit: "m",
        category: measurement.lineCategory || "Länge",
      });
      return;
    }
  });

  return rows;
}

export function getMeasurementPrimaryValue(
  measurement: Measurement,
  scales: Record<number, number>,
) {
  if (measurement.kind === "count") {
    return { value: measurementMultiplier(measurement), unit: "Stk" };
  }
  const scale = scales[measurement.page];
  if (!positive(scale)
    && !(measurement.kind === "room" && measurement.areaOverride !== undefined)
    && !(measurement.kind === "area" && measurement.areaOverride !== undefined)
    && !(measurement.kind === "line" && measurement.lengthOverride !== undefined)) return { value: 0, unit: "" };
  if (measurement.kind === "room" || measurement.kind === "area") {
    return {
      value: measurement.kind === "room"
        ? roomAreaMeters(measurement, scale)
        : measurement.areaOverride !== undefined
          ? finiteNonNegative(measurement.areaOverride)
          : polygonPixels(measurement.points) * scale * scale,
      unit: "m²",
    };
  }
  if (measurement.kind === "line") {
    return {
      value: measurement.lengthOverride !== undefined
        ? finiteNonNegative(measurement.lengthOverride)
        : polylinePixels(measurement.points) * scale,
      unit: "m",
    };
  }
  return { value: 0, unit: "" };
}

export function buildCsv(meta: ProjectMeta, rows: LineItem[]) {
  const header = [
    ["Aufmaß", meta.title],
    ["Kunde", meta.customer],
    ["Bauvorhaben", meta.address],
    ["Bearbeiter", meta.estimator],
    ["Grundlage", meta.standard],
    [],
    ["Pos.", "Raum/Bereich", "Leistung", "Ansatz", "Brutto", "Abzug", "Ergebnis", "Einheit"],
  ];
  const data = rows.map((row, index) => [
    String(index + 1).padStart(3, "0"),
    row.room,
    row.description,
    row.formula,
    formatNumber(row.gross),
    formatNumber(row.deduction),
    formatNumber(row.result),
    row.unit,
  ]);
  const escape = (value: string) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `\ufeff${[...header, ...data].map((line) => line.map(escape).join(";")).join("\r\n")}`;
}
