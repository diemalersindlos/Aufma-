import type { Cell, Row, Workbook, Worksheet } from "exceljs";
import {
  getMeasurementPrimaryValue,
  measurementMultiplier,
  openingCalculation,
  roomAreaMeters,
  roomHeightMeters,
  roomPerimeterMeters,
  type LineItem,
  type Measurement,
  type ProjectMeta,
} from "@/lib/measurements";

export type PaintCalculationMode = "coverage" | "consumption";
export type WallpaperMatch = "none" | "straight" | "offset";

export type MaterialSettings = {
  paint: {
    enabled: boolean;
    name: string;
    includeWalls: boolean;
    includeCeilings: boolean;
    mode: PaintCalculationMode;
    coverage: number;
    consumption: number;
    coats: number;
    reserve: number;
    containerSize: number;
  };
  filler: {
    enabled: boolean;
    name: string;
    includeWalls: boolean;
    includeCeilings: boolean;
    consumption: number;
    thickness: number;
    reserve: number;
    packageSize: number;
  };
  wallpaper: {
    enabled: boolean;
    name: string;
    rollWidth: number;
    rollLength: number;
    match: WallpaperMatch;
    repeat: number;
    allowance: number;
    reserve: number;
  };
};

export type MaterialPreview = {
  paint: { area: number; liters: number; containers: number };
  filler: { area: number; kilograms: number; packages: number };
  wallpaper: { rooms: number; rolls: number };
};

export const defaultMaterialSettings: MaterialSettings = {
  paint: {
    enabled: true,
    name: "Innenwandfarbe / Dispersionsfarbe",
    includeWalls: true,
    includeCeilings: true,
    mode: "coverage",
    coverage: 7,
    consumption: 145,
    coats: 2,
    reserve: 10,
    containerSize: 12.5,
  },
  filler: {
    enabled: true,
    name: "Spachtelmasse",
    includeWalls: true,
    includeCeilings: false,
    consumption: 1.2,
    thickness: 1,
    reserve: 10,
    packageSize: 20,
  },
  wallpaper: {
    enabled: false,
    name: "Tapete",
    rollWidth: 0.53,
    rollLength: 10.05,
    match: "none",
    repeat: 0.64,
    allowance: 0.1,
    reserve: 10,
  },
};

type ExportInput = {
  meta: ProjectMeta;
  fileName: string;
  pageCount: number;
  selectedPages: number[];
  rows: LineItem[];
  measurements: Measurement[];
  scales: Record<number, number>;
  materials: MaterialSettings;
  status?: "draft" | "completed";
};

const BRAND = "FF8E1E6E";
const BRAND_DARK = "FF5E164C";
const ORANGE = "FFD96F39";
const INK = "FF2B2730";
const MUTED = "FF6F6872";
const LINE = "FFE4DEE3";
const PALE = "FFF8EDF5";
const INPUT = "FFFFF4D6";
const RESULT = "FFEAF7F2";
const WHITE = "FFFFFFFF";

function solid(argb: string) {
  return { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } };
}

function measurementArgb(measurement: Measurement | undefined) {
  const raw = measurement?.color?.trim().replace(/^#/, "").toUpperCase();
  if (raw && /^[0-9A-F]{6}$/.test(raw)) return `FF${raw}`;
  if (raw && /^[0-9A-F]{8}$/.test(raw)) return raw;
  return BRAND;
}

function measurementHex(measurement: Measurement | undefined) {
  return `#${measurementArgb(measurement).slice(-6)}`;
}

function contrastColor(argb: string) {
  const hex = argb.slice(-6);
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness > 158 ? INK : WHITE;
}

function styleMeasurementKeyCell(cell: Cell, measurement: Measurement | undefined, value?: string | number) {
  const argb = measurementArgb(measurement);
  if (value !== undefined) cell.value = value;
  cell.fill = solid(argb);
  cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: contrastColor(argb) } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = thinBorder(argb);
}

function thinBorder(argb = LINE) {
  const edge = { style: "thin" as const, color: { argb } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function titleBand(sheet: Worksheet, title: string, subtitle: string, endColumn: string) {
  sheet.mergeCells(`A1:${endColumn}2`);
  const titleCell = sheet.getCell("A1");
  titleCell.value = title;
  titleCell.fill = solid(BRAND);
  titleCell.font = { name: "Aptos Display", size: 21, bold: true, color: { argb: WHITE } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 26;
  sheet.getRow(2).height = 13;
  sheet.mergeCells(`A3:${endColumn}3`);
  const subtitleCell = sheet.getCell("A3");
  subtitleCell.value = subtitle;
  subtitleCell.fill = solid(ORANGE);
  subtitleCell.font = { name: "Aptos", size: 10, bold: true, color: { argb: WHITE } };
  subtitleCell.alignment = { vertical: "middle" };
  sheet.getRow(3).height = 20;
}

function sectionBand(sheet: Worksheet, rowNumber: number, title: string, endColumn: string) {
  sheet.mergeCells(`A${rowNumber}:${endColumn}${rowNumber}`);
  const cell = sheet.getCell(`A${rowNumber}`);
  cell.value = title;
  cell.fill = solid(PALE);
  cell.font = { name: "Aptos", size: 11, bold: true, color: { argb: BRAND_DARK } };
  cell.alignment = { vertical: "middle" };
  cell.border = { bottom: { style: "medium", color: { argb: BRAND } } };
  sheet.getRow(rowNumber).height = 23;
}

function styleTableHeader(row: Row) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.fill = solid(BRAND_DARK);
    cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder(BRAND_DARK);
  });
}

function styleDataCell(cell: Cell, numeric = false) {
  cell.font = { name: "Aptos", size: 9, color: { argb: INK } };
  cell.alignment = { vertical: "top", horizontal: numeric ? "right" : "left", wrapText: true };
  cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
}

function setInputCell(cell: Cell, value: string | number, numberFormat?: string) {
  cell.value = value;
  cell.fill = solid(INPUT);
  cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: INK } };
  cell.alignment = { vertical: "middle", horizontal: typeof value === "number" ? "right" : "left", wrapText: true };
  cell.border = thinBorder("FFE4C76C");
  if (numberFormat) cell.numFmt = numberFormat;
}

function setResultCell(cell: Cell, formula: string, result: number, numberFormat: string) {
  cell.value = { formula, result };
  cell.fill = solid(RESULT);
  cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FF087D5B" } };
  cell.border = thinBorder("FFB8DED0");
  cell.numFmt = numberFormat;
}

function dateLabel() {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
}

function nonNegativeNumber(value: number | undefined, fallback = 0) {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : fallback;
}

function positiveNumber(value: number | undefined, fallback = 0.001) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function hasUsableScale(value: number | undefined) {
  return Number.isFinite(value) && Number(value) > 0;
}

function hasRoomBasis(measurement: Measurement, scales: Record<number, number>) {
  return hasUsableScale(scales[measurement.page])
    || (measurement.areaOverride !== undefined && measurement.perimeterOverride !== undefined);
}

function sumCategory(rows: LineItem[], categories: string[]) {
  return rows.reduce((sum, row) => row.unit === "m²" && categories.includes(row.category) ? sum + nonNegativeNumber(row.result) : sum, 0);
}

function wallpaperMatchLabel(match: WallpaperMatch) {
  if (match === "straight") return "Gerader Ansatz";
  if (match === "offset") return "Versetzter Ansatz (1/2 Rapport)";
  return "Ansatzfrei / ohne Versatz";
}

function measurementKindLabel(measurement: Measurement) {
  if (measurement.kind === "room") return "Raum";
  if (measurement.kind === "area") return "Freie Fläche";
  if (measurement.kind === "line") return "Freie Länge";
  return "Stückzahl";
}

function measurementSourceLabel(measurement: Measurement) {
  if (measurement.areaSource === "pdf-nrf") return measurement.geometryStatus === "missing" || measurement.geometryStatus === "uncertain"
    ? "PDF-Raumstempel (NRF) · Kontur fehlt"
    : "PDF-Raumstempel (NRF)";
  if (measurement.areaSource === "pdf-dimensions") return "PDF-Maßketten + Geometrie";
  if (measurement.areaSource === "pdf-scale") return "Planmaßstab + Geometrie";
  if (measurement.areaSource === "insta360-reference") return `Insta360 + ${measurement.captureSource?.referenceMethod === "laser" ? "Laser-Kontrollmaß" : measurement.captureSource?.referenceMethod === "known" ? "bekanntes Kontrollmaß" : "manuelle Maße"}`;
  if (measurement.areaSource === "laser-reference") return measurement.proCapture?.label || "Laser-Aufmaß";
  if (measurement.areaSource === "special-geometry") return measurement.proCapture?.label || "Sondergeometrie";
  if (measurement.areaSource === "freehand-sketch") return measurement.proCapture?.label || "Automatisch erkannte Freihandskizze";
  return measurement.source === "auto" ? "Automatisch erkannt" : "Manuell gemessen";
}

function addColorMappingSheet(workbook: Workbook, input: Omit<ExportInput, "materials"> | ExportInput) {
  const sheet = workbook.addWorksheet("Farbzuordnung", {
    views: [{ state: "frozen", ySplit: 7, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  titleBand(sheet, "FARBZUORDNUNG ZUM GRUNDRISS", "Kennfarben für die schnelle Prüfung von Plan, Aufmaß und Excel", "I");
  sheet.columns = [
    { width: 11 }, { width: 14 }, { width: 9 }, { width: 28 }, { width: 17 },
    { width: 28 }, { width: 15 }, { width: 10 }, { width: 44 },
  ];
  sheet.mergeCells("A5:I5");
  sheet.getCell("A5").value = "Die Füllfarbe in Spalte A ist identisch mit der Kontur im PDF-Grundriss und den farbigen Positionsfeldern der übrigen Excel-Blätter. Seite und Raumbezeichnung bilden zusammen die eindeutige Zuordnung.";
  sheet.getCell("A5").font = { name: "Aptos", size: 9, italic: true, color: { argb: MUTED } };
  sheet.getCell("A5").alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(5).height = 31;
  sheet.getRow(7).values = ["Farb-ID", "Farbcode", "Seite", "Raum / Bereich", "Messart", "Herkunft", "Grundwert", "Einheit", "Prüfzuordnung"];
  styleTableHeader(sheet.getRow(7));

  const visibleMeasurements = input.measurements.filter((measurement) => measurement.visible);
  visibleMeasurements.forEach((measurement, index) => {
    const rowNumber = 8 + index;
    const primary = getMeasurementPrimaryValue(measurement, input.scales);
    const row = sheet.getRow(rowNumber);
    const colorId = `F${String(index + 1).padStart(3, "0")}`;
    row.values = [
      colorId,
      measurementHex(measurement),
      measurement.page,
      measurement.name,
      measurementKindLabel(measurement),
      measurementSourceLabel(measurement),
      primary.value,
      primary.unit || "–",
      `Gleiche Kennfarbe in Grundriss, Aufmaßpositionen und Prüflisten · PDF-Seite ${measurement.page}`,
    ];
    row.height = 29;
    row.eachCell((cell, column) => {
      styleDataCell(cell, column === 3 || column === 7);
      if (column === 7) cell.numFmt = "#,##0.00";
      if (index % 2 === 1) cell.fill = solid("FFFCFAFB");
    });
    styleMeasurementKeyCell(sheet.getCell(rowNumber, 1), measurement, colorId);
  });

  if (!visibleMeasurements.length) {
    sheet.mergeCells("A8:I10");
    const emptyCell = sheet.getCell("A8");
    emptyCell.value = "Noch keine sichtbaren Aufmaßbereiche vorhanden.";
    emptyCell.fill = solid("FFFFF7E8");
    emptyCell.font = { name: "Aptos", size: 10, color: { argb: MUTED } };
    emptyCell.alignment = { horizontal: "center", vertical: "middle" };
    emptyCell.border = thinBorder("FFE8C98A");
  } else {
    sheet.autoFilter = { from: "A7", to: `I${7 + visibleMeasurements.length}` };
  }
  return sheet;
}

export function calculateMaterialPreview(
  rows: LineItem[],
  measurements: Measurement[],
  scales: Record<number, number>,
  materials: MaterialSettings,
): MaterialPreview {
  const paintCategories = [materials.paint.includeWalls ? "Wand" : "", materials.paint.includeCeilings ? "Decke" : ""].filter(Boolean);
  const paintArea = materials.paint.enabled ? sumCategory(rows, paintCategories) : 0;
  const paintCoats = nonNegativeNumber(materials.paint.coats);
  const paintBase = materials.paint.mode === "coverage"
    ? paintArea / positiveNumber(materials.paint.coverage) * paintCoats
    : paintArea * nonNegativeNumber(materials.paint.consumption) / 1000 * paintCoats;
  const paintLiters = materials.paint.enabled ? paintBase * (1 + nonNegativeNumber(materials.paint.reserve) / 100) : 0;

  const fillerCategories = [materials.filler.includeWalls ? "Wand" : "", materials.filler.includeCeilings ? "Decke" : ""].filter(Boolean);
  const fillerArea = materials.filler.enabled ? sumCategory(rows, fillerCategories) : 0;
  const fillerKilograms = materials.filler.enabled
    ? fillerArea * nonNegativeNumber(materials.filler.consumption) * nonNegativeNumber(materials.filler.thickness) * (1 + nonNegativeNumber(materials.filler.reserve) / 100)
    : 0;

  const wallpaperRooms = measurements.filter((measurement) => measurement.visible && measurement.kind === "room" && measurement.includeWalls && hasRoomBasis(measurement, scales));
  const wallpaperRolls = materials.wallpaper.enabled ? wallpaperRooms.reduce((sum, room) => {
    const perimeter = roomPerimeterMeters(room, scales[room.page]) * measurementMultiplier(room);
    const height = roomHeightMeters(room);
    const strips = Math.ceil(perimeter / positiveNumber(materials.wallpaper.rollWidth, 0.01));
    const baseDrop = height + nonNegativeNumber(materials.wallpaper.allowance);
    const repeat = positiveNumber(materials.wallpaper.repeat);
    const drop = materials.wallpaper.match === "none"
      ? baseDrop
      : Math.ceil(baseDrop / repeat) * repeat + (materials.wallpaper.match === "offset" ? repeat / 2 : 0);
    const dropsPerRoll = Math.max(1, Math.floor(nonNegativeNumber(materials.wallpaper.rollLength) / Math.max(0.01, drop)));
    return sum + Math.ceil(Math.ceil(strips / dropsPerRoll) * (1 + nonNegativeNumber(materials.wallpaper.reserve) / 100));
  }, 0) : 0;

  return {
    paint: {
      area: paintArea,
      liters: paintLiters,
      containers: materials.paint.enabled ? Math.ceil(paintLiters / positiveNumber(materials.paint.containerSize)) : 0,
    },
    filler: {
      area: fillerArea,
      kilograms: fillerKilograms,
      packages: materials.filler.enabled ? Math.ceil(fillerKilograms / positiveNumber(materials.filler.packageSize)) : 0,
    },
    wallpaper: { rooms: wallpaperRooms.length, rolls: wallpaperRolls },
  };
}

export async function buildArchitectExcel(input: ExportInput) {
  const ExcelJS = await import("exceljs");
  const WorkbookConstructor = ExcelJS.Workbook ?? ExcelJS.default.Workbook;
  const workbook = new WorkbookConstructor();
  workbook.creator = "Die Maler sind los · MalerAufmaß Pro";
  workbook.company = "Malermeisterbetrieb Marcus Schwan";
  workbook.subject = `Prüfbares VOB-Aufmaß – ${input.meta.title}`;
  workbook.title = `${input.meta.title} · Aufmaß und Materialbedarf`;
  workbook.description = "Aufmaß, Raumgeometrie und Materialbedarf mit offen ausgewiesenen Rechenansätzen.";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const overview = workbook.addWorksheet("Übersicht", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  titleBand(overview, "DIE MALER SIND LOS · AUFMASS PRO", "Prüfbares Aufmaß und Materialermittlung", "H");
  overview.columns = [
    { width: 20 }, { width: 22 }, { width: 20 }, { width: 20 },
    { width: 20 }, { width: 24 }, { width: 20 }, { width: 18 },
  ];
  sectionBand(overview, 5, "PROJEKTDATEN", "H");
  const projectData = [
    ["Projekt", input.meta.title, "Kunde / Auftraggeber", input.meta.customer || "–", "Bearbeiter", input.meta.estimator || "–", "Stand", dateLabel()],
    ["Bauvorhaben", input.meta.address || "–", "LV / Referenz", input.meta.reference || "–", "Grundriss", input.fileName || "–", "PDF-Seiten", input.pageCount],
    ["Abrechnungsgrundlage", input.meta.standard, "VOB-Grenze Öffnungen", input.meta.deductionThreshold, "Kontakt", "info@malerbetriebguestrow.de", "Ausgewertete Seiten", input.selectedPages.join(", ")],
    ["Projektstatus", input.status === "completed" ? "FERTIGGESTELLT" : "ENTWURF", "Datenstand", new Date(input.meta.updatedAt).toLocaleString("de-DE"), "Positionen", input.rows.length, "Regelprüfung", input.meta.vobRuleConfirmed ? `Bestätigt${input.meta.vobRuleConfirmedBy ? ` · ${input.meta.vobRuleConfirmedBy}` : ""}` : "NICHT BESTÄTIGT"],
  ];
  projectData.forEach((values, index) => {
    overview.getRow(6 + index).values = values;
  });
  [6, 7, 8, 9].forEach((rowNumber) => {
    const row = overview.getRow(rowNumber);
    row.height = 28;
    row.eachCell((cell, column) => {
      styleDataCell(cell, column % 2 === 0 && typeof cell.value === "number");
      if (column % 2 === 1) {
        cell.fill = solid("FFF3F0F2");
        cell.font = { name: "Aptos", size: 8, bold: true, color: { argb: MUTED } };
      }
    });
  });

  const surfaceTotal = input.rows.filter((row) => row.unit === "m²").reduce((sum, row) => sum + row.result, 0);
  const lengthTotal = input.rows.filter((row) => row.unit === "m").reduce((sum, row) => sum + row.result, 0);
  const countTotal = input.rows.filter((row) => row.unit === "Stk").reduce((sum, row) => sum + row.result, 0);
  sectionBand(overview, 10, "MENGENÜBERSICHT", "H");
  const cards = [
    { range: "A11:B13", label: "Gesamtflächen", value: surfaceTotal, unit: "m²" },
    { range: "D11:E13", label: "Gesamtlängen", value: lengthTotal, unit: "m" },
    { range: "G11:H13", label: "Stückzahlen", value: countTotal, unit: "Stk" },
  ];
  cards.forEach((card) => {
    overview.mergeCells(card.range);
    const cell = overview.getCell(card.range.split(":")[0]);
    cell.value = `${card.label}\n${card.value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${card.unit}`;
    cell.fill = solid(RESULT);
    cell.font = { name: "Aptos Display", size: 14, bold: true, color: { argb: "FF087D5B" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder("FFB8DED0");
  });

  const categoryGroups = Array.from(new Map(input.rows.map((row) => [`${row.category}|${row.unit}`, { category: row.category, unit: row.unit }])).values());
  sectionBand(overview, 15, "SUMMEN NACH LEISTUNGSBEREICH", "H");
  overview.getRow(16).values = ["Leistungsbereich", "Einheit", "Menge", "Anzahl Positionen", "Leistungsbereich", "Einheit", "Menge", "Anzahl Positionen"];
  styleTableHeader(overview.getRow(16));
  categoryGroups.forEach((group, index) => {
    const block = index % 2;
    const rowNumber = 17 + Math.floor(index / 2);
    const startColumn = block === 0 ? 1 : 5;
    const relevant = input.rows.filter((row) => row.category === group.category && row.unit === group.unit);
    const value = relevant.reduce((sum, row) => sum + row.result, 0);
    const values = [group.category, group.unit, value, relevant.length];
    values.forEach((valueCell, offset) => {
      const cell = overview.getCell(rowNumber, startColumn + offset);
      cell.value = valueCell;
      styleDataCell(cell, offset >= 2);
      if (offset === 2) cell.numFmt = "#,##0.00";
      if (offset === 3) cell.numFmt = "#,##0";
    });
  });
  const overviewNoteRow = 18 + Math.ceil(categoryGroups.length / 2);
  sectionBand(overview, overviewNoteRow, "PRÜF- UND ABRECHNUNGSHINWEISE", "H");
  overview.mergeCells(`A${overviewNoteRow + 1}:H${overviewNoteRow + 3}`);
  const note = overview.getCell(`A${overviewNoteRow + 1}`);
  note.value = `Farbprüfung: Die Kennfarbe jeder Position entspricht der Raumkontur im Grundriss; das Blatt „Farbzuordnung“ verbindet Farbe, PDF-Seite und Raum eindeutig. PDF-Grundlage: Auslesbare NRF-Raumflächen werden unverändert aus digitalen Raumstempeln übernommen. Fehlen Raumstempel, werden geschlossene Raumkonturen aus Plan-Geometrie, Planmaßstab und erkannten Maßketten ermittelt; diese Ansätze sind vor Abrechnung zu prüfen. VOB-Hinweis: Öffnungen bis einschließlich ${input.meta.deductionThreshold.toLocaleString("de-DE")} m² werden im VOB-Modus übermessen. Größere, erfasste Öffnungen werden vollständig abgezogen. Beschichtungs- und Spachtelarbeiten werden nach der Projektgrundlage (ATV DIN 18363), Tapezierarbeiten nach ATV DIN 18366 ausgewiesen. Maßgeblich bleiben Vertrag, Leistungsverzeichnis und die vereinbarte Ausgabe der ATV. Der Materialbedarf ist eine Kalkulationshilfe und kein abrechenbares VOB-Aufmaß.`;
  note.alignment = { vertical: "top", wrapText: true };
  note.font = { name: "Aptos", size: 9, color: { argb: MUTED } };
  note.fill = solid("FFFFF7E8");
  note.border = thinBorder("FFE8C98A");

  const measureSheet = workbook.addWorksheet("Aufmaß nach VOB", {
    views: [{ state: "frozen", ySplit: 7, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  titleBand(measureSheet, "AUFMASS NACH VOB", `${input.meta.title} · ${input.meta.address || input.meta.customer || "Projekt"}`, "K");
  measureSheet.columns = [
    { width: 8 }, { width: 8 }, { width: 22 }, { width: 16 }, { width: 23 }, { width: 31 },
    { width: 13 }, { width: 13 }, { width: 13 }, { width: 9 }, { width: 39 },
  ];
  measureSheet.mergeCells("A5:K5");
  measureSheet.getCell("A5").value = `Kennfarbe in „Pos.“ = Raumkontur im Grundriss · Grundlage: ${input.meta.standard} · Übermessungsgrenze: ${input.meta.deductionThreshold.toLocaleString("de-DE")} m² · Bearbeiter: ${input.meta.estimator || "–"}`;
  measureSheet.getCell("A5").font = { name: "Aptos", size: 9, italic: true, color: { argb: MUTED } };
  measureSheet.getCell("A5").alignment = { vertical: "middle" };
  measureSheet.getRow(7).values = ["Pos.", "Seite", "Raum / Bereich", "Leistungsbereich", "Leistung", "Rechenansatz", "Brutto", "VOB-Abzug", "Netto", "Einheit", "Prüfhinweis"];
  styleTableHeader(measureSheet.getRow(7));
  const firstMeasureRow = 8;
  input.rows.forEach((line, index) => {
    const rowNumber = firstMeasureRow + index;
    const measurement = input.measurements.find((item) => item.id === line.measurementId);
    const row = measureSheet.getRow(rowNumber);
    row.values = [
      String(index + 1).padStart(3, "0"),
      measurement?.page ?? "–",
      line.room,
      line.category,
      line.description,
      line.formula,
      line.gross,
      line.deduction,
      { formula: `MAX(0,G${rowNumber}-H${rowNumber})`, result: line.result },
      line.unit,
      measurement?.areaSource === "pdf-nrf" && (line.category === "Boden" || line.category === "Decke")
        ? `Grundfläche unverändert aus digitalem PDF-Raumstempel (NRF).${measurement.geometryStatus === "missing" || measurement.geometryStatus === "uncertain" ? " Raumumfang nicht eindeutig bestimmt; Wand und Sockel nicht berechnet." : ""}`
        : measurement?.areaSource === "pdf-nrf" && (line.category === "Wand" || line.category === "Länge")
          ? "Umfang aus der dem PDF-Raumstempel zugeordneten Plangeometrie."
          : measurement?.areaSource === "pdf-dimensions"
            ? "Raumkontur aus Plan-Geometrie und erkannten PDF-Maßketten; Kontur prüfen."
            : measurement?.areaSource === "pdf-scale"
              ? "Raumkontur aus Plan-Geometrie und geprüftem Planmaßstab; Kontur prüfen."
              : measurement?.areaSource === "insta360-reference"
                ? `360°-Raumnachweis ${measurement.captureSource?.fileName || "Insta360"}; Maße gemäß ${measurement.captureSource?.referenceMethod === "laser" ? "Laser-Kontrollmaß" : measurement.captureSource?.referenceMethod === "known" ? "bekanntem Kontrollmaß" : "manueller Eingabe"}.`
              : measurement?.areaSource === "laser-reference"
                ? `${measurement.proCapture?.label || "Laser-Aufmaß"}; ${measurement.proCapture?.formula || "Kontrollmaße offen ausgewiesen"}.`
              : measurement?.areaSource === "special-geometry"
                ? `${measurement.proCapture?.label || "Sondergeometrie"}; ${measurement.proCapture?.formula || "Formel offen ausgewiesen"}.`
              : measurement?.areaSource === "freehand-sketch"
                ? `${measurement.proCapture?.label || "Freihandskizze"}; ${measurement.proCapture?.formula || "Raumform automatisch erkannt"}. Kontrollmaß, Kontur und Erkennungswert prüfen.`
          : line.deduction > 0
        ? `Öffnung(en) über ${input.meta.deductionThreshold.toLocaleString("de-DE")} m² gemäß Erfassung abgezogen.`
        : line.category === "Wand" ? `VOB-Übermessung bis ${input.meta.deductionThreshold.toLocaleString("de-DE")} m² berücksichtigt.` : "Ansatz gemäß Aufmaßgeometrie.",
    ];
    row.height = 29;
    row.eachCell((cell, column) => {
      styleDataCell(cell, column >= 7 && column <= 9);
      if (column >= 7 && column <= 9) cell.numFmt = "#,##0.00";
      if (index % 2 === 1) cell.fill = solid("FFFCFAFB");
    });
    styleMeasurementKeyCell(measureSheet.getCell(rowNumber, 1), measurement, String(index + 1).padStart(3, "0"));
  });
  const lastMeasureRow = Math.max(firstMeasureRow, firstMeasureRow + input.rows.length - 1);
  measureSheet.autoFilter = { from: "A7", to: `K${lastMeasureRow}` };
  measureSheet.getColumn(1).alignment = { horizontal: "center" };
  measureSheet.getColumn(2).alignment = { horizontal: "center" };
  measureSheet.getColumn(10).alignment = { horizontal: "center" };
  measureSheet.headerFooter.oddFooter = "&LDie Maler sind los · info@malerbetriebguestrow.de&CSeite &P von &N&RPrüfbares Aufmaß";

  const roomSheet = workbook.addWorksheet("Raumgeometrie", {
    views: [{ state: "frozen", ySplit: 7, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  titleBand(roomSheet, "RAUMGEOMETRIE", "Nachvollziehbare Grundlagen für Flächen- und Längenansätze", "L");
  roomSheet.columns = [
    { width: 8 }, { width: 8 }, { width: 23 }, { width: 13 }, { width: 14 }, { width: 13 },
    { width: 13 }, { width: 15 }, { width: 17 }, { width: 15 }, { width: 15 }, { width: 15 },
  ];
  roomSheet.mergeCells("A5:L5");
  roomSheet.getCell("A5").value = "Digitale NRF-Flächen werden aus dem PDF-Raumstempel übernommen. Ohne Stempel dienen Plan-Geometrie, Maßstab und erkannte Maßketten als Ansatz. Insta360-Aufnahmen werden mit dem dokumentierten Laser- oder Kontrollmaß verknüpft. Wandfläche = Umfang × Raumhöhe; VOB-Abzug nur für erfasste Öffnungen oberhalb der eingestellten Übermessungsgrenze.";
  roomSheet.getCell("A5").font = { name: "Aptos", size: 9, italic: true, color: { argb: MUTED } };
  roomSheet.getRow(7).values = ["Pos.", "Seite", "Raum", "Erfassung", "Grundfläche m²", "Umfang m", "Raumhöhe m", "Wand brutto m²", "VOB-Abzug m²", "Wand netto m²", "Decke m²", "Fußleiste m"];
  styleTableHeader(roomSheet.getRow(7));
  const rooms = input.measurements.filter((measurement) => measurement.visible && measurement.kind === "room" && hasRoomBasis(measurement, input.scales));
  rooms.forEach((room, index) => {
    const rowNumber = 8 + index;
    const scale = input.scales[room.page];
    const multiplier = measurementMultiplier(room);
    const area = roomAreaMeters(room, scale) * multiplier;
    const perimeter = roomPerimeterMeters(room, scale) * multiplier;
    const geometryMissing = room.geometryStatus === "missing" || room.geometryStatus === "uncertain";
    const height = roomHeightMeters(room);
    const deduction = (room.openings ?? []).reduce((sum, opening) => sum + openingCalculation(opening, input.meta.deductionThreshold).deduct, 0) * multiplier;
    const wallGross = perimeter * height;
    const row = roomSheet.getRow(rowNumber);
    row.values = [
      String(index + 1).padStart(3, "0"), room.page, room.name,
      room.areaSource === "pdf-nrf"
        ? geometryMissing ? "PDF-Raumstempel (NRF) · KONTUR FEHLT" : "PDF-Raumstempel (NRF)"
        : room.areaSource === "pdf-dimensions"
          ? "PDF-Maßketten + Geometrie"
          : room.areaSource === "pdf-scale"
            ? "Planmaßstab + Geometrie"
            : room.areaSource === "insta360-reference"
              ? `Insta360 + ${room.captureSource?.referenceMethod === "laser" ? "Lasermaß" : room.captureSource?.referenceMethod === "known" ? "Kontrollmaß" : "Maßeingabe"}`
            : room.areaSource === "laser-reference"
              ? room.proCapture?.label || "Laser-Aufmaß"
            : room.areaSource === "special-geometry"
              ? room.proCapture?.label || "Sondergeometrie"
            : room.areaSource === "freehand-sketch"
              ? room.proCapture?.label || "Freihandskizze"
            : room.source === "auto" ? "Auto erkannt" : "Manuell",
      area, geometryMissing ? "NICHT BESTIMMT" : perimeter, height,
      geometryMissing ? "NICHT BERECHNET" : { formula: `F${rowNumber}*G${rowNumber}`, result: wallGross },
      deduction,
      geometryMissing ? "NICHT BERECHNET" : { formula: `MAX(0,H${rowNumber}-I${rowNumber})`, result: Math.max(0, wallGross - deduction) },
      room.includeCeiling ? area : 0,
      room.includeSkirting && !geometryMissing ? perimeter : 0,
    ];
    row.height = 27;
    row.eachCell((cell, column) => {
      styleDataCell(cell, column >= 5);
      if (column >= 5) cell.numFmt = "#,##0.00";
      if (index % 2 === 1) cell.fill = solid("FFFCFAFB");
    });
    styleMeasurementKeyCell(roomSheet.getCell(rowNumber, 1), room, String(index + 1).padStart(3, "0"));
  });
  roomSheet.autoFilter = { from: "A7", to: `L${Math.max(8, 7 + rooms.length)}` };

  const colorSheet = addColorMappingSheet(workbook, input);

  const materialSheet = workbook.addWorksheet("Materialbedarf", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  titleBand(materialSheet, "MATERIALBEDARF", "Offene Eingaben, nachvollziehbare Formeln und aufgerundete Bestellmengen", "J");
  materialSheet.columns = [
    { width: 26 }, { width: 26 }, { width: 15 }, { width: 22 }, { width: 15 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 24 },
  ];
  materialSheet.mergeCells("A5:J6");
  const materialNote = materialSheet.getCell("A5");
  materialNote.value = "Gelb markierte Werte sind Materialannahmen und können in Excel geändert werden. Grün markierte Felder sind Formelergebnisse. Vor Bestellung sind Produktdatenblatt, Untergrund, Applikationsverfahren, Verschnitt und tatsächliche Ausführung zu prüfen.";
  materialNote.fill = solid("FFFFF7E8");
  materialNote.font = { name: "Aptos", size: 9, color: { argb: MUTED } };
  materialNote.alignment = { vertical: "middle", wrapText: true };
  materialNote.border = thinBorder("FFE8C98A");

  const orderSummary: { material: string; formula: string; result: number; unit: string; basis: string }[] = [];
  let materialRow = 8;

  if (input.materials.paint.enabled) {
    const paint = input.materials.paint;
    const paintCategories = [paint.includeWalls ? "Wand" : "", paint.includeCeilings ? "Decke" : ""].filter(Boolean);
    const paintArea = sumCategory(input.rows, paintCategories);
    const paintRate = paint.mode === "coverage" ? positiveNumber(paint.coverage) : nonNegativeNumber(paint.consumption);
    const paintCoats = nonNegativeNumber(paint.coats);
    const paintReserve = nonNegativeNumber(paint.reserve);
    const paintContainerSize = positiveNumber(paint.containerSize);
    const baseLiters = paint.mode === "coverage"
      ? paintArea / paintRate * paintCoats
      : paintArea * paintRate / 1000 * paintCoats;
    const liters = baseLiters * (1 + paintReserve / 100);
    const containers = Math.ceil(liters / paintContainerSize);
    sectionBand(materialSheet, materialRow, "FARBE / BESCHICHTUNG", "J");
    const start = materialRow + 1;
    const data: [string, string | number, string | null, string][] = [
      ["Materialbezeichnung", paint.name, null, "Eingabe"],
      ["Bezugsflächen", paintCategories.join(" + ") || "keine", null, "Aus Aufmaß"],
      ["VOB-Abrechnungsfläche", paintArea, "m²", "Aus Aufmaß nach Abzug"],
      ["Berechnungsmethode", paint.mode === "coverage" ? "Ergiebigkeit" : "Verbrauch", null, "Eingabe"],
      [paint.mode === "coverage" ? "Ergiebigkeit" : "Verbrauch", paintRate, paint.mode === "coverage" ? "m²/l je Anstrich" : "ml/m² je Anstrich", "Eingabe Produktdatenblatt"],
      ["Anzahl Anstriche", paintCoats, "Anstriche", "Eingabe"],
      ["Reserve", paintReserve / 100, "%", "Eingabe"],
      ["Gebindegröße", paintContainerSize, "l", "Eingabe"],
      ["Bedarf inkl. Reserve", 0, "l", "Formel"],
      ["Bestellmenge", 0, "Gebinde", "auf volle Gebinde gerundet"],
      ["Bestellvolumen", 0, "l", "Gebinde × Gebindegröße"],
    ];
    data.forEach((item, index) => {
      const rowNumber = start + index;
      materialSheet.getRow(rowNumber).height = 27;
      materialSheet.getCell(`A${rowNumber}`).value = item[0];
      materialSheet.getCell(`C${rowNumber}`).value = item[2];
      materialSheet.getCell(`D${rowNumber}`).value = item[3];
      [materialSheet.getCell(`A${rowNumber}`), materialSheet.getCell(`C${rowNumber}`), materialSheet.getCell(`D${rowNumber}`)].forEach((cell) => styleDataCell(cell));
      if ([0, 3, 4, 5, 6, 7].includes(index)) setInputCell(materialSheet.getCell(`B${rowNumber}`), item[1], index === 6 ? "0.0%" : typeof item[1] === "number" ? "#,##0.00" : undefined);
      else {
        materialSheet.getCell(`B${rowNumber}`).value = item[1];
        styleDataCell(materialSheet.getCell(`B${rowNumber}`), typeof item[1] === "number");
        if (typeof item[1] === "number") materialSheet.getCell(`B${rowNumber}`).numFmt = "#,##0.00";
      }
    });
    const areaCell = `B${start + 2}`;
    const rateCell = `B${start + 4}`;
    const coatsCell = `B${start + 5}`;
    const reserveCell = `B${start + 6}`;
    const packageCell = `B${start + 7}`;
    const litersCell = `B${start + 8}`;
    const packageCountCell = `B${start + 9}`;
    const orderVolumeCell = `B${start + 10}`;
    const paintFormula = paint.mode === "coverage"
      ? `${areaCell}/${rateCell}*${coatsCell}*(1+${reserveCell})`
      : `${areaCell}*${rateCell}/1000*${coatsCell}*(1+${reserveCell})`;
    setResultCell(materialSheet.getCell(litersCell), `IFERROR(${paintFormula},0)`, liters, "#,##0.00");
    setResultCell(materialSheet.getCell(packageCountCell), `IFERROR(ROUNDUP(${litersCell}/${packageCell},0),0)`, containers, "#,##0");
    setResultCell(materialSheet.getCell(orderVolumeCell), `${packageCountCell}*${packageCell}`, containers * paintContainerSize, "#,##0.00");
    orderSummary.push({ material: paint.name, formula: `='Materialbedarf'!${packageCountCell}`, result: containers, unit: "Gebinde", basis: `${paintArea.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m²` });
    materialRow = start + data.length + 2;
  }

  if (input.materials.filler.enabled) {
    const filler = input.materials.filler;
    const fillerCategories = [filler.includeWalls ? "Wand" : "", filler.includeCeilings ? "Decke" : ""].filter(Boolean);
    const fillerArea = sumCategory(input.rows, fillerCategories);
    const fillerConsumption = nonNegativeNumber(filler.consumption);
    const fillerThickness = nonNegativeNumber(filler.thickness);
    const fillerReserve = nonNegativeNumber(filler.reserve);
    const fillerPackageSize = positiveNumber(filler.packageSize);
    const kilograms = fillerArea * fillerConsumption * fillerThickness * (1 + fillerReserve / 100);
    const packages = Math.ceil(kilograms / fillerPackageSize);
    sectionBand(materialSheet, materialRow, "SPACHTELMASSE", "J");
    const start = materialRow + 1;
    const data: [string, string | number, string | null, string][] = [
      ["Materialbezeichnung", filler.name, null, "Eingabe"],
      ["Bezugsflächen", fillerCategories.join(" + ") || "keine", null, "Aus Aufmaß"],
      ["VOB-Abrechnungsfläche", fillerArea, "m²", "Aus Aufmaß nach Abzug"],
      ["Verbrauch", fillerConsumption, "kg/m²/mm", "Eingabe Produktdatenblatt"],
      ["Mittlere Schichtdicke", fillerThickness, "mm", "Eingabe"],
      ["Reserve", fillerReserve / 100, "%", "Eingabe"],
      ["Gebindegröße", fillerPackageSize, "kg", "Eingabe"],
      ["Bedarf inkl. Reserve", 0, "kg", "Formel"],
      ["Bestellmenge", 0, "Gebinde", "auf volle Gebinde gerundet"],
      ["Bestellgewicht", 0, "kg", "Gebinde × Gebindegröße"],
    ];
    data.forEach((item, index) => {
      const rowNumber = start + index;
      materialSheet.getRow(rowNumber).height = 27;
      materialSheet.getCell(`A${rowNumber}`).value = item[0];
      materialSheet.getCell(`C${rowNumber}`).value = item[2];
      materialSheet.getCell(`D${rowNumber}`).value = item[3];
      [materialSheet.getCell(`A${rowNumber}`), materialSheet.getCell(`C${rowNumber}`), materialSheet.getCell(`D${rowNumber}`)].forEach((cell) => styleDataCell(cell));
      if ([0, 3, 4, 5, 6].includes(index)) setInputCell(materialSheet.getCell(`B${rowNumber}`), item[1], index === 5 ? "0.0%" : typeof item[1] === "number" ? "#,##0.00" : undefined);
      else {
        materialSheet.getCell(`B${rowNumber}`).value = item[1];
        styleDataCell(materialSheet.getCell(`B${rowNumber}`), typeof item[1] === "number");
        if (typeof item[1] === "number") materialSheet.getCell(`B${rowNumber}`).numFmt = "#,##0.00";
      }
    });
    const areaCell = `B${start + 2}`;
    const rateCell = `B${start + 3}`;
    const thicknessCell = `B${start + 4}`;
    const reserveCell = `B${start + 5}`;
    const packageCell = `B${start + 6}`;
    const kgCell = `B${start + 7}`;
    const packageCountCell = `B${start + 8}`;
    const orderKgCell = `B${start + 9}`;
    setResultCell(materialSheet.getCell(kgCell), `${areaCell}*${rateCell}*${thicknessCell}*(1+${reserveCell})`, kilograms, "#,##0.00");
    setResultCell(materialSheet.getCell(packageCountCell), `IFERROR(ROUNDUP(${kgCell}/${packageCell},0),0)`, packages, "#,##0");
    setResultCell(materialSheet.getCell(orderKgCell), `${packageCountCell}*${packageCell}`, packages * fillerPackageSize, "#,##0.00");
    orderSummary.push({ material: filler.name, formula: `='Materialbedarf'!${packageCountCell}`, result: packages, unit: "Gebinde", basis: `${fillerArea.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m²` });
    materialRow = start + data.length + 2;
  }

  if (input.materials.wallpaper.enabled) {
    const wallpaper = input.materials.wallpaper;
    const wallpaperRollWidth = positiveNumber(wallpaper.rollWidth, 0.01);
    const wallpaperRollLength = nonNegativeNumber(wallpaper.rollLength);
    const wallpaperRepeat = positiveNumber(wallpaper.repeat);
    const wallpaperAllowance = nonNegativeNumber(wallpaper.allowance);
    const wallpaperReserve = nonNegativeNumber(wallpaper.reserve);
    sectionBand(materialSheet, materialRow, "TAPETE / ROLLENBEDARF", "J");
    const inputStart = materialRow + 1;
    const wallpaperInputs: [string, string | number, string | null][] = [
      ["Materialbezeichnung", wallpaper.name, null],
      ["Rollenbreite", wallpaperRollWidth, "m"],
      ["Rollenlänge", wallpaperRollLength, "m"],
      ["Ansatz", wallpaperMatchLabel(wallpaper.match), null],
      ["Rapport", wallpaperRepeat, "m"],
      ["Zugabe je Bahn", wallpaperAllowance, "m"],
      ["Reserve", wallpaperReserve / 100, "%"],
    ];
    wallpaperInputs.forEach((item, index) => {
      const rowNumber = inputStart + index;
      materialSheet.getRow(rowNumber).height = 27;
      materialSheet.getCell(`A${rowNumber}`).value = item[0];
      materialSheet.getCell(`C${rowNumber}`).value = item[2];
      styleDataCell(materialSheet.getCell(`A${rowNumber}`));
      styleDataCell(materialSheet.getCell(`C${rowNumber}`));
      setInputCell(materialSheet.getCell(`B${rowNumber}`), item[1], index === 6 ? "0.0%" : typeof item[1] === "number" ? "#,##0.00" : undefined);
    });
    const tableHeader = inputStart + wallpaperInputs.length + 2;
    materialSheet.getRow(tableHeader).values = ["Raum", "Seite", "Umfang m", "Höhe m", "Bahnen", "Zuschnitt/Bahn m", "Bahnen/Rolle", "Rollen netto", "Reserve", "Rollen gesamt"];
    styleTableHeader(materialSheet.getRow(tableHeader));
    const wallpaperRooms = rooms.filter((room) => room.includeWalls);
    let totalRolls = 0;
    wallpaperRooms.forEach((room, index) => {
      const rowNumber = tableHeader + 1 + index;
      const scale = input.scales[room.page];
      const perimeter = roomPerimeterMeters(room, scale) * measurementMultiplier(room);
      const height = roomHeightMeters(room);
      const strips = Math.ceil(perimeter / wallpaperRollWidth);
      const baseDrop = height + wallpaperAllowance;
      const repeat = wallpaperRepeat;
      const drop = wallpaper.match === "none"
        ? baseDrop
        : Math.ceil(baseDrop / repeat) * repeat + (wallpaper.match === "offset" ? repeat / 2 : 0);
      const dropsPerRoll = Math.max(1, Math.floor(wallpaperRollLength / Math.max(0.01, drop)));
      const netRolls = Math.ceil(strips / dropsPerRoll);
      const total = Math.ceil(netRolls * (1 + wallpaperReserve / 100));
      totalRolls += total;
      const row = materialSheet.getRow(rowNumber);
      row.values = [room.name, room.page, perimeter, height, strips, drop, dropsPerRoll, netRolls, wallpaperReserve / 100, total];
      row.height = 27;
      row.eachCell((cell, column) => {
        styleDataCell(cell, column >= 2);
        if ([3, 4, 6].includes(column)) cell.numFmt = "#,##0.00";
        if ([5, 7, 8, 10].includes(column)) cell.numFmt = "#,##0";
        if (column === 9) cell.numFmt = "0.0%";
        if (index % 2 === 1) cell.fill = solid("FFFCFAFB");
      });
      styleMeasurementKeyCell(materialSheet.getCell(rowNumber, 1), room, room.name);
    });
    const totalRow = tableHeader + Math.max(1, wallpaperRooms.length) + 1;
    materialSheet.mergeCells(`A${totalRow}:H${totalRow}`);
    materialSheet.getCell(`A${totalRow}`).value = "Gesamtbedarf Tapete";
    materialSheet.getCell(`A${totalRow}`).font = { name: "Aptos", size: 10, bold: true, color: { argb: BRAND_DARK } };
    materialSheet.getCell(`A${totalRow}`).alignment = { horizontal: "right" };
    const firstWallpaperDataRow = tableHeader + 1;
    const lastWallpaperDataRow = tableHeader + wallpaperRooms.length;
    const formula = wallpaperRooms.length ? `SUM(J${firstWallpaperDataRow}:J${lastWallpaperDataRow})` : "0";
    setResultCell(materialSheet.getCell(`J${totalRow}`), formula, totalRolls, "#,##0");
    orderSummary.push({ material: wallpaper.name, formula: `='Materialbedarf'!J${totalRow}`, result: totalRolls, unit: "Rollen", basis: `${wallpaperRooms.length} Räume` });
    materialRow = totalRow + 2;
  }

  if (!orderSummary.length) {
    sectionBand(materialSheet, materialRow, "KEINE MATERIALBERECHNUNG AUSGEWÄHLT", "J");
    materialSheet.mergeCells(`A${materialRow + 1}:J${materialRow + 2}`);
    materialSheet.getCell(`A${materialRow + 1}`).value = "Der Excel-Bericht enthält das vollständige Aufmaß. Für Materialmengen beim Export mindestens Farbe, Spachtelmasse oder Tapete aktivieren.";
    materialSheet.getCell(`A${materialRow + 1}`).alignment = { wrapText: true, vertical: "middle" };
  }

  sectionBand(materialSheet, materialRow, "BESTELLÜBERSICHT", "J");
  const orderHeaderRow = materialRow + 1;
  materialSheet.getRow(orderHeaderRow).values = ["Material", "Bestellmenge", "Einheit", "Berechnungsbasis", "Hinweis"];
  materialSheet.mergeCells(`E${orderHeaderRow}:J${orderHeaderRow}`);
  styleTableHeader(materialSheet.getRow(orderHeaderRow));
  orderSummary.forEach((entry, index) => {
    const rowNumber = materialRow + 2 + index;
    const row = materialSheet.getRow(rowNumber);
    row.values = [entry.material, { formula: entry.formula, result: entry.result }, entry.unit, entry.basis, "Auf volle Gebinde/Rollen aufgerundet; Produktdatenblatt und Baustellenbedingungen prüfen."];
    materialSheet.mergeCells(`E${rowNumber}:J${rowNumber}`);
    for (let column = 1; column <= 10; column += 1) {
      const cell = materialSheet.getCell(rowNumber, column);
      styleDataCell(cell, column === 2);
    }
    const resultCell = materialSheet.getCell(rowNumber, 2);
    resultCell.fill = solid(RESULT);
    resultCell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FF087D5B" } };
    resultCell.numFmt = "#,##0";
    materialSheet.getCell(rowNumber, 5).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    row.height = 36;
  });

  [overview, measureSheet, roomSheet, colorSheet, materialSheet].forEach((sheet) => {
    sheet.properties.defaultRowHeight = 18;
    sheet.pageSetup.margins = { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    sheet.headerFooter.oddHeader = "&LDie Maler sind los&R" + input.meta.title;
    sheet.headerFooter.oddFooter = "&Linfo@malerbetriebguestrow.de&CSeite &P von &N&RStand " + dateLabel();
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

type AuditExportInput = Omit<ExportInput, "materials">;

function auditLineState(measurement: Measurement | undefined, line: LineItem) {
  if (!measurement) return { source: "Keine Zuordnung", status: "PRÜFEN", detail: "Keine Geometriezuordnung vorhanden.", tone: "review" as const };
  if (measurement.areaSource === "pdf-nrf") {
    const geometryMissing = measurement.geometryStatus === "missing" || measurement.geometryStatus === "uncertain";
    if (line.category === "Boden" || line.category === "Decke") {
      return geometryMissing
        ? { source: "PDF-Raumstempel (NRF)", status: "PDF-WERT · KONTUR FEHLT", detail: "Grundfläche unverändert aus PDF-Raumstempel; Raumumfang nicht eindeutig bestimmt.", tone: "review" as const }
        : { source: "PDF-Raumstempel (NRF)", status: "PDF-WERT", detail: "Grundfläche unverändert aus digitalem PDF-Raumstempel.", tone: "verified" as const };
    }
    if (geometryMissing) return { source: "PDF-Raumstempel (NRF)", status: "KONTUR FEHLT", detail: "Wand- und Längenansatz erst nach manuell bestätigter Raumkontur berechnen.", tone: "review" as const };
    return { source: "PDF-NRF + Planumfang", status: "UMFANG PRÜFEN", detail: "Grundfläche aus PDF; Umfang aus zugeordneter Raumkontur.", tone: "review" as const };
  }
  if (measurement.areaSource === "pdf-dimensions") return { source: "PDF-Maßketten + Geometrie", status: "KONTUR PRÜFEN", detail: "Raumkontur mit erkannten Maßketten abgeglichen.", tone: "review" as const };
  if (measurement.areaSource === "pdf-scale") return { source: "Planmaßstab + Geometrie", status: "KONTUR PRÜFEN", detail: "Berechnung aus Raumkontur und geprüftem Planmaßstab.", tone: "review" as const };
  if (measurement.areaSource === "insta360-reference") return { source: "Insta360 + Kontrollmaß", status: "MASSE PRÜFEN", detail: `${measurement.captureSource?.fileName || "360°-Aufnahme"}; Maße aus ${measurement.captureSource?.referenceMethod === "laser" ? "Laser-Kontrollmaß" : measurement.captureSource?.referenceMethod === "known" ? "bekanntem Kontrollmaß" : "manueller Eingabe"}.`, tone: "manual" as const };
  if (measurement.areaSource === "laser-reference") return { source: measurement.proCapture?.label || "Laser-Aufmaß", status: "KONTROLLMASS PRÜFEN", detail: `${measurement.proCapture?.device || "Laser-Messgerät"}; ${measurement.proCapture?.formula || "Eingabemaße prüfen"}.`, tone: "manual" as const };
  if (measurement.areaSource === "special-geometry") return { source: measurement.proCapture?.label || "Sondergeometrie", status: "EINGABEN PRÜFEN", detail: measurement.proCapture?.formula || "Geometrieformel prüfen.", tone: "manual" as const };
  if (measurement.areaSource === "freehand-sketch") return { source: measurement.proCapture?.label || "Freihandskizze", status: "SKIZZE PRÜFEN", detail: `${measurement.proCapture?.formula || "Raumform automatisch erkannt"}; Erkennung ${Math.round((measurement.proCapture?.confidence ?? measurement.confidence ?? 0) * 100)} %.`, tone: "review" as const };
  if (measurement.source === "auto") return { source: "Automatische Geometrie", status: "KONTUR PRÜFEN", detail: "Automatisch erkannte Kontur im Grundriss kontrollieren.", tone: "review" as const };
  return { source: "Manuelle Messung", status: "EINGABE PRÜFEN", detail: "Manuell gesetzte Punkte, Mengen und Faktoren kontrollieren.", tone: "manual" as const };
}

function auditRoomSource(room: Measurement) {
  if (room.areaSource === "pdf-nrf") return room.geometryStatus === "missing" || room.geometryStatus === "uncertain"
    ? "PDF-Raumstempel (NRF) · KONTUR FEHLT"
    : "PDF-Raumstempel (NRF)";
  if (room.areaSource === "pdf-dimensions") return "PDF-Maßketten + Geometrie";
  if (room.areaSource === "pdf-scale") return "Planmaßstab + Geometrie";
  if (room.areaSource === "insta360-reference") return `Insta360 + ${room.captureSource?.referenceMethod === "laser" ? "Laser-Kontrollmaß" : room.captureSource?.referenceMethod === "known" ? "bekanntes Kontrollmaß" : "manuelle Maße"}`;
  if (room.areaSource === "laser-reference") return room.proCapture?.label || "Laser-Aufmaß";
  if (room.areaSource === "special-geometry") return room.proCapture?.label || "Sondergeometrie";
  if (room.areaSource === "freehand-sketch") return room.proCapture?.label || "Freihandskizze";
  if (room.source === "auto") return "Automatisch erkannt";
  return "Manuell gemessen";
}

export async function buildAuditExcel(input: AuditExportInput) {
  const ExcelJS = await import("exceljs");
  const WorkbookConstructor = ExcelJS.Workbook ?? ExcelJS.default.Workbook;
  const workbook = new WorkbookConstructor();
  workbook.creator = "Die Maler sind los · MalerAufmaß Pro";
  workbook.company = "Malermeisterbetrieb Marcus Schwan";
  workbook.subject = `Prüfbares Aufmaß – ${input.meta.title}`;
  workbook.title = `${input.meta.title} · Prüf- und Rechennachweis`;
  workbook.description = "Kontrollierbares Aufmaß mit Quellen, Einzelrechnungen, Raumgrundlagen und VOB-Abzügen.";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const rooms = input.measurements.filter((measurement) => measurement.visible && measurement.kind === "room" && hasRoomBasis(measurement, input.scales));
  const lineStates = input.rows.map((line) => auditLineState(input.measurements.find((measurement) => measurement.id === line.measurementId), line));
  const reviewCount = lineStates.filter((state) => state.tone !== "verified").length;
  const surfaceGross = input.rows.filter((line) => line.unit === "m²").reduce((sum, line) => sum + line.gross, 0);
  const surfaceDeduction = input.rows.filter((line) => line.unit === "m²").reduce((sum, line) => sum + line.deduction, 0);
  const surfaceNet = input.rows.filter((line) => line.unit === "m²").reduce((sum, line) => sum + line.result, 0);
  const lengthNet = input.rows.filter((line) => line.unit === "m").reduce((sum, line) => sum + line.result, 0);

  const overview = workbook.addWorksheet("Prüfübersicht", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  titleBand(overview, "DIE MALER SIND LOS · PRÜFAUFMASS", "Kontroll- und Rechennachweis", "H");
  overview.columns = Array.from({ length: 8 }, (_, index) => ({ width: [19, 24, 19, 23, 19, 23, 19, 21][index] }));
  sectionBand(overview, 5, "PROJEKT- UND PLANGRUNDLAGE", "H");
  const projectRows = [
    ["Projekt", input.meta.title, "Kunde / Auftraggeber", input.meta.customer || "–", "Bearbeiter", input.meta.estimator || "–", "Stand", dateLabel()],
    ["Bauvorhaben", input.meta.address || "–", "LV / Referenz", input.meta.reference || "–", "PDF-Datei", input.fileName || "–", "PDF-Seiten", input.pageCount],
    ["Grundlage", input.meta.standard, "VOB-Grenze", input.meta.deductionThreshold, "Ausgewertete Seiten", input.selectedPages.join(", "), "Positionen", input.rows.length],
    ["Projektstatus", input.status === "completed" ? "FERTIGGESTELLT" : "ENTWURF", "Datenstand", new Date(input.meta.updatedAt).toLocaleString("de-DE"), "Regelprüfung", input.meta.vobRuleConfirmed ? `Bestätigt${input.meta.vobRuleConfirmedBy ? ` · ${input.meta.vobRuleConfirmedBy}` : ""}` : "NICHT BESTÄTIGT", "Projekt-ID", input.meta.id],
  ];
  projectRows.forEach((values, index) => {
    const row = overview.getRow(6 + index);
    row.values = values;
    row.height = 29;
    row.eachCell((cell, column) => {
      styleDataCell(cell, column % 2 === 0 && typeof cell.value === "number");
      if (column % 2 === 1) cell.font = { name: "Aptos", size: 8, bold: true, color: { argb: MUTED } };
      if (column === 4 && typeof cell.value === "number") cell.numFmt = "#,##0.00";
    });
  });

  sectionBand(overview, 10, "KONTROLLSUMMEN", "H");
  const summaryCards = [
    { range: "A11:B13", label: "Flächen netto", value: surfaceNet, unit: "m²", color: RESULT, ink: "FF087D5B" },
    { range: "D11:E13", label: "VOB-Abzüge", value: surfaceDeduction, unit: "m²", color: "FFFFF2E8", ink: "FFA86118" },
    { range: "G11:H13", label: "Prüfpositionen", value: reviewCount, unit: "von " + input.rows.length, color: reviewCount ? "FFFFF2E8" : RESULT, ink: reviewCount ? "FFA86118" : "FF087D5B" },
  ];
  summaryCards.forEach((card) => {
    overview.mergeCells(card.range);
    const cell = overview.getCell(card.range.split(":")[0]);
    cell.value = `${card.label}\n${card.value.toLocaleString("de-DE", { minimumFractionDigits: card.label === "Prüfpositionen" ? 0 : 2, maximumFractionDigits: 2 })} ${card.unit}`;
    cell.fill = solid(card.color);
    cell.font = { name: "Aptos Display", size: 14, bold: true, color: { argb: card.ink } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder(card.ink);
  });

  sectionBand(overview, 15, "ABGLEICH NACH EINHEIT", "H");
  overview.getRow(16).values = ["Einheit", "Brutto", "Abzug", "Netto", "Einheit", "Netto", "Anzahl Räume", "PDF-Seiten"];
  styleTableHeader(overview.getRow(16));
  overview.getRow(17).values = ["m²", surfaceGross, surfaceDeduction, surfaceNet, "m", lengthNet, rooms.length, input.selectedPages.length];
  overview.getRow(17).eachCell((cell, column) => {
    styleDataCell(cell, [2, 3, 4, 6, 7, 8].includes(column));
    if ([2, 3, 4, 6].includes(column)) cell.numFmt = "#,##0.00";
    if ([7, 8].includes(column)) cell.numFmt = "#,##0";
  });

  sectionBand(overview, 20, "SO PRÜFEN SIE DAS AUFMASS", "H");
  overview.mergeCells("A21:H24");
  const overviewNote = overview.getCell("A21");
  overviewNote.value = `1. Kennfarbe im Grundriss und im Blatt „Farbzuordnung“ abgleichen.  2. PDF-Seite und Raumbezeichnung prüfen.  3. Herkunft beachten: PDF-NRF ist ein direkter Planwert; Konturen, Umfänge und manuelle Eingaben sind zu kontrollieren.  4. Rechenansatz, Brutto, VOB-Abzug und Netto in „Rechenprüfung“ nachvollziehen.  5. Raumhöhe und Umfang in „Raumgrundlagen“ prüfen.  6. Fenster und Türen in „VOB-Abzüge“ kontrollieren. Öffnungen bis einschließlich ${input.meta.deductionThreshold.toLocaleString("de-DE")} m² werden im VOB-Modus übermessen. Maßgeblich bleiben Vertrag, Leistungsverzeichnis und die vereinbarte ATV-Ausgabe.`;
  overviewNote.alignment = { vertical: "top", wrapText: true };
  overviewNote.font = { name: "Aptos", size: 10, color: { argb: INK } };
  overviewNote.fill = solid("FFFFF7E8");
  overviewNote.border = thinBorder("FFE8C98A");

  const calculationSheet = workbook.addWorksheet("Rechenprüfung", {
    views: [{ state: "frozen", ySplit: 7, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  titleBand(calculationSheet, "RECHENPRÜFUNG", "Jede Aufmaßposition mit Quelle, Ansatz, Abzug und Ergebnis", "L");
  calculationSheet.columns = [
    { width: 8 }, { width: 8 }, { width: 23 }, { width: 24 }, { width: 22 }, { width: 34 },
    { width: 13 }, { width: 13 }, { width: 13 }, { width: 9 }, { width: 17 }, { width: 43 },
  ];
  calculationSheet.mergeCells("A5:L5");
  calculationSheet.getCell("A5").value = `Kennfarbe in „Pos.“ = Raumkontur im Grundriss · Filterbar nach Seite, Raum, Herkunft und Prüfstatus · Übermessungsgrenze ${input.meta.deductionThreshold.toLocaleString("de-DE")} m²`;
  calculationSheet.getCell("A5").font = { name: "Aptos", size: 9, italic: true, color: { argb: MUTED } };
  calculationSheet.getRow(7).values = ["Pos.", "Seite", "Raum / Bereich", "Herkunft", "Leistung", "Rechenansatz", "Brutto", "VOB-Abzug", "Netto", "Einheit", "Prüfstatus", "Prüfhinweis"];
  styleTableHeader(calculationSheet.getRow(7));
  input.rows.forEach((line, index) => {
    const rowNumber = 8 + index;
    const measurement = input.measurements.find((item) => item.id === line.measurementId);
    const audit = auditLineState(measurement, line);
    const row = calculationSheet.getRow(rowNumber);
    row.values = [
      String(index + 1).padStart(3, "0"), measurement?.page ?? "–", line.room, audit.source, line.description, line.formula,
      line.gross, line.deduction, { formula: `MAX(0,G${rowNumber}-H${rowNumber})`, result: line.result }, line.unit, audit.status, audit.detail,
    ];
    row.height = 34;
    row.eachCell((cell, column) => {
      styleDataCell(cell, column >= 7 && column <= 9);
      if (column >= 7 && column <= 9) cell.numFmt = "#,##0.00";
      if (index % 2 === 1) cell.fill = solid("FFFCFAFB");
    });
    styleMeasurementKeyCell(calculationSheet.getCell(rowNumber, 1), measurement, String(index + 1).padStart(3, "0"));
    const statusCell = calculationSheet.getCell(rowNumber, 11);
    statusCell.fill = solid(audit.tone === "verified" ? RESULT : audit.tone === "manual" ? "FFEFF3FA" : "FFFFF2E8");
    statusCell.font = { name: "Aptos", size: 8, bold: true, color: { argb: audit.tone === "verified" ? "FF087D5B" : audit.tone === "manual" ? "FF526B8D" : "FFA86118" } };
    statusCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  const lastCalculationRow = Math.max(8, 7 + input.rows.length);
  calculationSheet.autoFilter = { from: "A7", to: `L${lastCalculationRow}` };

  const roomSheet = workbook.addWorksheet("Raumgrundlagen", {
    views: [{ state: "frozen", ySplit: 7, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  titleBand(roomSheet, "RAUMGRUNDLAGEN", "Grundfläche, Umfang, Höhe, Multiplikatoren und Wandberechnung", "P");
  roomSheet.columns = [
    { width: 8 }, { width: 8 }, { width: 24 }, { width: 25 }, { width: 14 }, { width: 14 }, { width: 13 }, { width: 11 },
    { width: 11 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 19 },
  ];
  roomSheet.mergeCells("A5:P5");
  roomSheet.getCell("A5").value = "Wand brutto = Umfang × Raumhöhe × Menge × Faktor · Wand netto = Wand brutto − VOB-Abzüge · Grundfläche und Umfang werden vor Multiplikatoren ausgewiesen.";
  roomSheet.getCell("A5").font = { name: "Aptos", size: 9, italic: true, color: { argb: MUTED } };
  roomSheet.getRow(7).values = ["Pos.", "Seite", "Raum", "Herkunft", "Grundfläche m²", "Umfang m", "Höhe m", "Menge", "Faktor", "Wand brutto m²", "Öffnungen Stk", "VOB-Abzug m²", "Wand netto m²", "Boden m²", "Decke m²", "Fußleiste m"];
  styleTableHeader(roomSheet.getRow(7));
  rooms.forEach((room, index) => {
    const rowNumber = 8 + index;
    const scale = input.scales[room.page];
    const area = roomAreaMeters(room, scale);
    const perimeter = roomPerimeterMeters(room, scale);
    const geometryMissing = room.geometryStatus === "missing" || room.geometryStatus === "uncertain";
    const height = roomHeightMeters(room);
    const multiplier = measurementMultiplier(room);
    const deduction = (room.openings ?? []).reduce((sum, opening) => sum + openingCalculation(opening, input.meta.deductionThreshold).deduct, 0) * multiplier;
    const wallGross = perimeter * height * multiplier;
    const row = roomSheet.getRow(rowNumber);
    row.values = [
      String(index + 1).padStart(3, "0"), room.page, room.name, auditRoomSource(room), area, geometryMissing ? "NICHT BESTIMMT" : perimeter, height,
      Number.isFinite(room.quantity) && room.quantity >= 0 ? room.quantity : 0,
      Number.isFinite(room.factor) && room.factor >= 0 ? room.factor : 0,
      geometryMissing ? "NICHT BERECHNET" : { formula: `F${rowNumber}*G${rowNumber}*H${rowNumber}*I${rowNumber}`, result: wallGross },
      (room.openings ?? []).reduce((sum, opening) => sum + nonNegativeNumber(opening.quantity), 0), deduction,
      geometryMissing ? "NICHT BERECHNET" : { formula: `MAX(0,J${rowNumber}-L${rowNumber})`, result: Math.max(0, wallGross - deduction) },
      room.includeFloor ? area * multiplier : 0, room.includeCeiling ? area * multiplier : 0, room.includeSkirting && !geometryMissing ? perimeter * multiplier : 0,
    ];
    row.height = 30;
    row.eachCell((cell, column) => {
      styleDataCell(cell, column >= 5);
      if (column >= 5) cell.numFmt = [8, 11].includes(column) ? "#,##0" : "#,##0.00";
      if (index % 2 === 1) cell.fill = solid("FFFCFAFB");
    });
    styleMeasurementKeyCell(roomSheet.getCell(rowNumber, 1), room, String(index + 1).padStart(3, "0"));
  });
  roomSheet.autoFilter = { from: "A7", to: `P${Math.max(8, 7 + rooms.length)}` };

  const colorSheet = addColorMappingSheet(workbook, input);

  const openingsSheet = workbook.addWorksheet("VOB-Abzüge", {
    views: [{ state: "frozen", ySplit: 7, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  titleBand(openingsSheet, "VOB-ABZÜGE", "Fenster, Türen und sonstige Öffnungen einzeln prüfbar", "M");
  openingsSheet.columns = [
    { width: 8 }, { width: 8 }, { width: 24 }, { width: 23 }, { width: 12 }, { width: 12 }, { width: 10 },
    { width: 15 }, { width: 15 }, { width: 17 }, { width: 15 }, { width: 24 }, { width: 15 },
  ];
  openingsSheet.mergeCells("A5:M5");
  openingsSheet.getCell("A5").value = `VOB-Modus: Öffnungen bis einschließlich ${input.meta.deductionThreshold.toLocaleString("de-DE")} m² je Einzelöffnung werden übermessen; erfasste Laibungen werden dann dokumentiert, aber nicht zusätzlich angesetzt. Bei abgezogenen Öffnungen erscheint die Laibung als eigene Rechenposition. Vertrag und LV gehen vor.`;
  openingsSheet.getCell("A5").font = { name: "Aptos", size: 9, italic: true, color: { argb: MUTED } };
  openingsSheet.getRow(7).values = ["Pos.", "Seite", "Raum", "Öffnung", "Breite m", "Höhe m", "Anzahl", "Einzelfläche m²", "Gesamt m²", "Abzugsmodus", "Grenze m²", "Bewertung", "Abzug m²"];
  styleTableHeader(openingsSheet.getRow(7));
  const openings = rooms.flatMap((room) => (room.openings ?? []).map((opening) => ({ room, opening })));
  openings.forEach(({ room, opening }, index) => {
    const rowNumber = 8 + index;
    const calculation = openingCalculation(opening, input.meta.deductionThreshold);
    const mode = opening.mode === "vob" ? "VOB prüfen" : opening.mode === "always" ? "Immer abziehen" : "Übermessen";
    const assessment = calculation.isDoor
      ? calculation.overmeasured
        ? "TÜR ÜBERMESSEN · ZARGE · KEINE LAIBUNG"
        : calculation.deduct
          ? "TÜR ABZIEHEN · ZARGE · KEINE LAIBUNG"
          : "TÜR KEIN ABZUG · KEINE LAIBUNG"
      : calculation.overmeasured
      ? `ÜBERMESSEN${calculation.revealDepth > 0 ? " · LAIBUNG NICHT ZUSÄTZLICH" : ""}`
      : calculation.deduct
        ? `ABZIEHEN${calculation.revealDepth > 0 ? ` · LAIBUNG +${calculation.revealResult.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²` : ""}`
        : "KEIN ABZUG";
    const row = openingsSheet.getRow(rowNumber);
    row.values = [
      String(index + 1).padStart(3, "0"), room.page, room.name, opening.name,
      nonNegativeNumber(opening.width), nonNegativeNumber(opening.height), nonNegativeNumber(opening.quantity),
      { formula: `E${rowNumber}*F${rowNumber}`, result: calculation.each },
      { formula: `G${rowNumber}*H${rowNumber}`, result: calculation.gross }, mode, nonNegativeNumber(input.meta.deductionThreshold, 2.5), assessment, calculation.deduct,
    ];
    row.height = 29;
    row.eachCell((cell, column) => {
      styleDataCell(cell, column >= 5 && column !== 10 && column !== 12);
      if ([5, 6, 8, 9, 11, 13].includes(column)) cell.numFmt = "#,##0.00";
      if (column === 7) cell.numFmt = "#,##0";
      if (index % 2 === 1) cell.fill = solid("FFFCFAFB");
    });
    styleMeasurementKeyCell(openingsSheet.getCell(rowNumber, 1), room, String(index + 1).padStart(3, "0"));
    const assessmentCell = openingsSheet.getCell(rowNumber, 12);
    assessmentCell.fill = solid(calculation.overmeasured ? RESULT : calculation.deduct ? "FFFFEAEA" : "FFEFF3FA");
    assessmentCell.font = { name: "Aptos", size: 8, bold: true, color: { argb: calculation.overmeasured ? "FF087D5B" : calculation.deduct ? "FFB23838" : "FF526B8D" } };
    assessmentCell.alignment = { horizontal: "center", vertical: "middle" };
  });
  if (!openings.length) {
    openingsSheet.mergeCells("A8:M10");
    const emptyCell = openingsSheet.getCell("A8");
    emptyCell.value = "Noch keine Fenster- oder Türöffnungen erfasst. Die ausgewiesenen Wandflächen enthalten deshalb keine Öffnungsabzüge.";
    emptyCell.fill = solid("FFFFF7E8");
    emptyCell.font = { name: "Aptos", size: 10, color: { argb: MUTED } };
    emptyCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    emptyCell.border = thinBorder("FFE8C98A");
  } else openingsSheet.autoFilter = { from: "A7", to: `M${7 + openings.length}` };

  [overview, calculationSheet, roomSheet, colorSheet, openingsSheet].forEach((sheet) => {
    sheet.properties.defaultRowHeight = 18;
    sheet.pageSetup.margins = { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    sheet.headerFooter.oddHeader = "&LDie Maler sind los&R" + input.meta.title;
    sheet.headerFooter.oddFooter = "&Linfo@malerbetriebguestrow.de&CSeite &P von &N&RPrüfaufmaß · " + dateLabel();
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
