import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildAuditPdf } from "../lib/pdf-export";
import { deriveLineItems, measurementColor, type Measurement, type ProjectMeta } from "../lib/measurements";

const meta: ProjectMeta = {
  id: "project_pdf_test",
  title: "Prüfaufmaß Architekten-Test",
  customer: "Architekturbüro Muster",
  address: "Bauvorhaben Musterstraße 12, 18273 Güstrow",
  estimator: "Malermeisterbetrieb Marcus Schwan",
  reference: "LV 03 - Malerarbeiten",
  standard: "VOB/C · ATV DIN 18363 / DIN 18366:2019-09",
  deductionThreshold: 2.5,
  rounding: 2,
  updatedAt: new Date().toISOString(),
};

const source = await PDFDocument.create();
const sourceFont = await source.embedFont(StandardFonts.HelveticaBold);
for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
  const page = source.addPage([842, 595]);
  page.drawText(`GRUNDRISS - TESTSEITE ${pageNumber}`, { x: 50, y: 540, size: 22, font: sourceFont, color: rgb(.2, .2, .2) });
  for (let room = 0; room < 4; room += 1) {
    const x = 70 + (room % 2) * 330;
    const y = 300 - Math.floor(room / 2) * 205;
    page.drawRectangle({ x, y, width: 260, height: 160, borderWidth: 2, borderColor: rgb(.25, .25, .25) });
    page.drawText(`${pageNumber}.${room + 1} Raum`, { x: x + 90, y: y + 78, size: 12, font: sourceFont, color: rgb(.25, .25, .25) });
  }
}
const sourceBytes = await source.save();

const measurements: Measurement[] = Array.from({ length: 12 }, (_, index) => {
  const roomOnPage = index % 4;
  const column = roomOnPage % 2;
  const row = Math.floor(roomOnPage / 2);
  const x = 70 + column * 330;
  const pdfBottom = 300 - row * 205;
  const top = 595 - (pdfBottom + 160);
  const canvasScale = 1180 / 842;
  return {
    id: `room_${index + 1}`,
    kind: "room",
    name: `${String(index + 1).padStart(2, "0")} ${index % 3 === 0 ? "Büro" : index % 3 === 1 ? "Flur" : "Besprechung"}`,
    page: Math.floor(index / 4) + 1,
    points: [
      { x: x * canvasScale, y: top * canvasScale },
      { x: (x + 260) * canvasScale, y: top * canvasScale },
      { x: (x + 260) * canvasScale, y: (top + 160) * canvasScale },
      { x: x * canvasScale, y: (top + 160) * canvasScale },
    ],
    color: measurementColor("room", index),
    height: 2.8,
    quantity: 1,
    factor: 1,
    includeFloor: true,
    includeCeiling: true,
    includeWalls: true,
    includeSkirting: true,
    openings: [{ id: `opening_${index}`, name: "Tür", width: 1.01, height: 2.135, quantity: 1, mode: "vob" }],
    source: "auto",
    areaOverride: 18 + index * .75,
    perimeterOverride: 17 + index * .3,
    areaSource: index % 2 === 0 ? "pdf-dimensions" : "pdf-scale",
    confidence: .86,
    visible: true,
    createdAt: new Date().toISOString(),
  } satisfies Measurement;
});

const scales = { 1: 1, 2: 1, 3: 1 };
const rows = deriveLineItems(measurements, scales, meta.deductionThreshold, meta.rounding);
const bytes = await buildAuditPdf({
  meta,
  fileName: "grundriss-test.pdf",
  pageCount: 3,
  selectedPages: [1, 2, 3],
  rows,
  measurements,
  scales,
  status: "completed",
  sourcePdfBytes: sourceBytes,
});

const outputPath = "/tmp/maler-aufmass-pruefbericht-smoke.pdf";
await writeFile(outputPath, bytes);
const report = await PDFDocument.load(bytes);
assert.ok(report.getPageCount() >= 7, "Mehrseitiger Bericht mit drei Plananlagen erwartet");
assert.match(report.getTitle() ?? "", /Prüfbares Aufmaß/);
assert.equal(report.getAuthor(), "Die Maler sind los - Malermeisterbetrieb Marcus Schwan");
assert.ok(bytes.byteLength > 20_000);

console.log(JSON.stringify({ outputPath, pages: report.getPageCount(), positions: rows.length, bytes: bytes.byteLength }));
