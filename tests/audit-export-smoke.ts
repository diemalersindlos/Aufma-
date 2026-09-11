import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { buildArchitectExcel, buildAuditExcel, defaultMaterialSettings } from "../lib/excel-export";
import { deriveLineItems, type Measurement, type ProjectMeta } from "../lib/measurements";

const meta: ProjectMeta = {
  id: "project_test",
  title: "Prüfaufmaß Test",
  customer: "Architekturbüro Muster",
  address: "Teststraße 1",
  estimator: "Marcel Bening",
  reference: "LV-01",
  standard: "VOB/C · ATV DIN 18363 / DIN 18366:2019-09",
  deductionThreshold: 2.5,
  rounding: 2,
  updatedAt: new Date().toISOString(),
};

const measurements: Measurement[] = [
  {
    id: "room_nrf",
    kind: "room",
    name: "01 Büro",
    page: 1,
    points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }],
    color: "#8E1E6E",
    height: 2.8,
    quantity: 1,
    factor: 1,
    includeFloor: true,
    includeCeiling: true,
    includeWalls: true,
    includeSkirting: true,
    openings: [
      { id: "door", name: "Tür", width: 1, height: 2, quantity: 1, mode: "vob" },
      { id: "window", name: "Fensterband", width: 3, height: 1, quantity: 1, mode: "vob" },
    ],
    source: "auto",
    areaOverride: 12,
    perimeterOverride: 14,
    areaSource: "pdf-nrf",
    confidence: 1,
    visible: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "room_dimensions",
    kind: "room",
    name: "02 Besprechung",
    page: 2,
    points: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 0, y: 400 }],
    color: "#2E6F95",
    height: 2.8,
    quantity: 1,
    factor: 1,
    includeFloor: true,
    includeCeiling: true,
    includeWalls: true,
    includeSkirting: false,
    openings: [],
    source: "auto",
    areaOverride: 20,
    perimeterOverride: 18,
    areaSource: "pdf-dimensions",
    confidence: 0.82,
    visible: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "room_insta360",
    kind: "room",
    name: "03 Wohnzimmer 360°",
    page: 1,
    points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }],
    color: "#D96F39",
    height: 2.5,
    quantity: 1,
    factor: 1,
    includeFloor: true,
    includeCeiling: true,
    includeWalls: true,
    includeSkirting: true,
    openings: [],
    source: "manual",
    areaOverride: 20,
    perimeterOverride: 18,
    areaSource: "insta360-reference",
    captureSource: {
      type: "insta360",
      panoramaId: "pano_test",
      fileName: "INSTA360_X4_Wohnzimmer.jpg",
      cameraModel: "Insta360 X4",
      referenceMethod: "laser",
      shape: "rectangle",
      length: 5,
      width: 4,
    },
    visible: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "room_sketch",
    kind: "room",
    name: "04 Skizzenraum",
    page: 1,
    points: [],
    color: "#3A7D68",
    height: 2.5,
    quantity: 1,
    factor: 1,
    includeFloor: true,
    includeCeiling: true,
    includeWalls: true,
    includeSkirting: true,
    openings: [],
    source: "auto",
    areaOverride: 24,
    perimeterOverride: 20,
    areaSource: "freehand-sketch",
    confidence: .96,
    proCapture: {
      type: "sketch",
      label: "Freihandskizze · Rechteckiger Raum",
      formula: "Rechteckiger Raum · S1 = 6,00 m",
      capturedAt: new Date().toISOString(),
      referenceSide: 0,
      referenceMeters: 6,
      metersPerPixel: .025,
      confidence: .96,
      sketchPoints: [{ x: 40, y: 40 }, { x: 280, y: 40 }, { x: 280, y: 200 }, { x: 40, y: 200 }],
    },
    visible: true,
    createdAt: new Date().toISOString(),
  },
];

const scales = { 1: 0.01, 2: 0.01 };
const rows = deriveLineItems(measurements, scales, meta.deductionThreshold, meta.rounding);
const bytes = await buildAuditExcel({ meta, fileName: "testgrundriss.pdf", pageCount: 2, selectedPages: [1, 2], rows, measurements, scales });
const outputPath = "/tmp/maler-aufmass-pruefexcel-smoke.xlsx";
await writeFile(outputPath, bytes);

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Prüfübersicht", "Rechenprüfung", "Raumgrundlagen", "Farbzuordnung", "VOB-Abzüge"]);
assert.equal(workbook.getWorksheet("Rechenprüfung")?.getCell("K8").value, "PDF-WERT");
assert.equal(workbook.getWorksheet("Rechenprüfung")?.getCell("K10").value, "UMFANG PRÜFEN");
assert.equal(workbook.getWorksheet("Rechenprüfung")?.getCell("K15").value, "MASSE PRÜFEN");
assert.equal(workbook.getWorksheet("Rechenprüfung")?.getCell("K19").value, "SKIZZE PRÜFEN");
assert.equal((workbook.getWorksheet("Rechenprüfung")?.getCell("I8").value as { formula: string }).formula, "MAX(0,G8-H8)");
assert.equal(workbook.getWorksheet("Rechenprüfung")?.getCell("A8").fill.type, "pattern");
assert.equal((workbook.getWorksheet("Rechenprüfung")?.getCell("A8").fill as ExcelJS.FillPattern).fgColor?.argb, "FF8E1E6E");
assert.equal((workbook.getWorksheet("Rechenprüfung")?.getCell("A12").fill as ExcelJS.FillPattern).fgColor?.argb, "FF2E6F95");
assert.equal(workbook.getWorksheet("VOB-Abzüge")?.getCell("L8").value, "TÜR ÜBERMESSEN · ZARGE · KEINE LAIBUNG");
assert.equal(workbook.getWorksheet("VOB-Abzüge")?.getCell("L9").value, "ABZIEHEN");
assert.equal((workbook.getWorksheet("Raumgrundlagen")?.getCell("J8").value as { formula: string }).formula, "F8*G8*H8*I8");
assert.match(String(workbook.getWorksheet("Raumgrundlagen")?.getCell("D10").value), /Insta360/);
assert.match(String(workbook.getWorksheet("Raumgrundlagen")?.getCell("D11").value), /Freihandskizze/);
assert.equal(workbook.getWorksheet("Farbzuordnung")?.getCell("B8").value, "#8E1E6E");
assert.equal(workbook.getWorksheet("Farbzuordnung")?.getCell("B9").value, "#2E6F95");
assert.equal((workbook.getWorksheet("Farbzuordnung")?.getCell("A9").fill as ExcelJS.FillPattern).fgColor?.argb, "FF2E6F95");
assert.match(String(workbook.getWorksheet("Farbzuordnung")?.getCell("F10").value), /Insta360/);
assert.ok(bytes.byteLength > 10_000);

const architectBytes = await buildArchitectExcel({
  meta,
  fileName: "testgrundriss.pdf",
  pageCount: 2,
  selectedPages: [1, 2],
  rows,
  measurements,
  scales,
  materials: {
    paint: { ...defaultMaterialSettings.paint },
    filler: { ...defaultMaterialSettings.filler },
    wallpaper: { ...defaultMaterialSettings.wallpaper },
  },
});
const architectPath = "/tmp/maler-aufmass-architektenexcel-smoke.xlsx";
await writeFile(architectPath, architectBytes);
const architectWorkbook = new ExcelJS.Workbook();
await architectWorkbook.xlsx.load(architectBytes.buffer as ArrayBuffer);
assert.deepEqual(architectWorkbook.worksheets.map((sheet) => sheet.name), ["Übersicht", "Aufmaß nach VOB", "Raumgeometrie", "Farbzuordnung", "Materialbedarf"]);
assert.equal((architectWorkbook.getWorksheet("Aufmaß nach VOB")?.getCell("A8").fill as ExcelJS.FillPattern).fgColor?.argb, "FF8E1E6E");
assert.equal((architectWorkbook.getWorksheet("Aufmaß nach VOB")?.getCell("A12").fill as ExcelJS.FillPattern).fgColor?.argb, "FF2E6F95");
assert.equal(architectWorkbook.getWorksheet("Farbzuordnung")?.getCell("B9").value, "#2E6F95");
assert.match(String(architectWorkbook.getWorksheet("Raumgeometrie")?.getCell("D10").value), /Insta360/);
assert.match(String(architectWorkbook.getWorksheet("Raumgeometrie")?.getCell("D11").value), /Freihandskizze/);
assert.ok(architectBytes.byteLength > 10_000);

console.log(JSON.stringify({
  outputPath,
  architectPath,
  sheets: workbook.worksheets.length,
  positions: rows.length,
  bytes: bytes.byteLength,
  architectBytes: architectBytes.byteLength,
}));
