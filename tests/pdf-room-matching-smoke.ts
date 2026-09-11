import assert from "node:assert/strict";
import { detectEnclosedRooms, type DetectedRoom } from "../lib/auto-detect";
import { deriveLineItems, measurementIsVisibleOnPlan, normalizeLegacyPdfRoomGeometry, type Measurement } from "../lib/measurements";
import { validateMeasurements } from "../lib/measurement-validation";
import {
  matchPdfRoomsToGeometry,
  combinePdfRoomCandidateSets,
  scorePdfRoomCandidateSet,
  selectBestPdfRoomCandidateSet,
  type PdfRoomLabel,
} from "../lib/pdf-room-labels";
import {
  extractPdfRoomHeights,
  filterRoomsToFloorPlanRegions,
  pointBelongsToFloorPlanRegion,
  selectPdfRoomHeight,
  type PdfDrawingAnchor,
} from "../lib/pdf-plan-analysis";

const metersPerPixel = 0.1;
const rectangle = (left: number, top: number, width: number, height: number, confidence = 0.86): DetectedRoom => ({
  points: [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ],
  pixelArea: width * height,
  confidence,
});
const label = (name: string, area: number, x: number, y: number): PdfRoomLabel => ({ name, area, anchor: { x, y } });

const planWidth = 240;
const planHeight = 160;
const planPixels = new Uint8ClampedArray(planWidth * planHeight * 4);
for (let index = 0; index < planWidth * planHeight; index += 1) {
  planPixels[index * 4] = 255;
  planPixels[index * 4 + 1] = 255;
  planPixels[index * 4 + 2] = 255;
  planPixels[index * 4 + 3] = 255;
}
const drawInk = (minimumX: number, minimumY: number, maximumX: number, maximumY: number) => {
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const offset = (y * planWidth + x) * 4;
      planPixels[offset] = 0;
      planPixels[offset + 1] = 0;
      planPixels[offset + 2] = 0;
    }
  }
};
drawInk(20, 20, 220, 25);
drawInk(20, 135, 220, 140);
drawInk(20, 20, 25, 140);
drawInk(215, 20, 220, 140);
for (let y = 25; y < 136; y += 10) drawInk(119, y, 120, Math.min(y + 5, 135));
const wallWeightRooms = detectEnclosedRooms(planPixels, planWidth, planHeight, {
  metersPerPixel: 0.1,
  minArea: 1,
  maxArea: 500,
  gapClosureMeters: 0.5,
});
assert.equal(wallWeightRooms.length, 1, "Eine dünne gestrichelte Hilfslinie darf einen von kräftigen Wänden begrenzten Raum nicht teilen.");
assert.ok(wallWeightRooms[0].pixelArea > 19_000, "Die Kontur muss den Raum innerhalb der kräftigen Außenwände vollständig erfassen.");

const exactLabel = label("Büro 1", 16, 20, 20);
const exactCandidate = rectangle(0, 0, 40, 40, 0.84);
const exact = matchPdfRoomsToGeometry([exactLabel], [exactCandidate], metersPerPixel)[0];
assert.equal(exact.geometryStatus, "matched");
assert.equal(exact.confidence, 0.84, "Die Kandidatensicherheit darf nicht künstlich erhöht werden.");
assert.deepEqual(exact.points, exactCandidate.points, "Die Kontur darf nicht auf den NRF-Flächenwert skaliert werden.");
assert.equal(exact.perimeter, 16);
assert.ok(Math.abs((exact.areaRatio ?? 0) - 1) < 1e-12);

const plausibleButNotExact = rectangle(0, 0, 42, 38, 0.9);
const plausible = matchPdfRoomsToGeometry([exactLabel], [plausibleButNotExact], metersPerPixel)[0];
assert.equal(plausible.geometryStatus, "matched");
assert.deepEqual(plausible.points, plausibleButNotExact.points, "Auch eine plausible Abweichung darf die Geometrie nicht verändern.");

const mergedLabels = [label("Büro links", 16, 20, 20), label("Büro rechts", 16, 70, 20)];
const mergedCandidate = rectangle(0, 0, 90, 40, 0.93);
const merged = matchPdfRoomsToGeometry(mergedLabels, [mergedCandidate], metersPerPixel);
assert.ok(merged.every((room) => room.geometryStatus === "uncertain"));
assert.ok(merged.every((room) => room.points.length === 0), "Eine Mehrraumkontur darf nicht als Raumform ausgegeben werden.");
assert.ok(merged.every((room) => room.perimeter === undefined), "Aus einer mehrdeutigen Kontur darf kein Wandumfang entstehen.");

const wrongArea = matchPdfRoomsToGeometry([exactLabel], [rectangle(15, 15, 10, 10, 0.95)], metersPerPixel)[0];
assert.equal(wrongArea.geometryStatus, "uncertain");
assert.equal(wrongArea.points.length, 0);
assert.equal(wrongArea.perimeter, undefined);

const twentyFourPercentTooLarge = matchPdfRoomsToGeometry([exactLabel], [rectangle(0, 0, 44, 45, 0.95)], metersPerPixel)[0];
assert.equal(twentyFourPercentTooLarge.geometryStatus, "uncertain", "Ein optisch ähnlicher, aber flächenunplausibler Nachbarbereich darf nicht übernommen werden.");
assert.equal(twentyFourPercentTooLarge.points.length, 0);

const missing = matchPdfRoomsToGeometry([exactLabel], [], metersPerPixel)[0];
assert.equal(missing.geometryStatus, "missing");
assert.equal(missing.points.length, 0, "Ohne Kontur darf kein Ersatzrechteck erfunden werden.");

const noScale = matchPdfRoomsToGeometry([exactLabel], [exactCandidate], 0)[0];
assert.equal(noScale.geometryStatus, "missing");
assert.equal(noScale.confidence, 0);

const lowConfidence = matchPdfRoomsToGeometry([exactLabel], [rectangle(0, 0, 40, 40, 0.61)], metersPerPixel)[0];
assert.equal(lowConfidence.geometryStatus, "uncertain");
assert.equal(lowConfidence.points.length, 0);

const noisyLargeSet = [rectangle(-10, -10, 100, 80, 0.95)];
const goodSet = [exactCandidate];
const selected = selectBestPdfRoomCandidateSet([exactLabel], [noisyLargeSet, goodSet], metersPerPixel);
assert.equal(selected, goodSet, "Nicht die größte, sondern die am Raumstempel plausibelste Kandidatenmenge muss gewählt werden.");
const selectedScore = scorePdfRoomCandidateSet([exactLabel], selected, metersPerPixel);
assert.equal(selectedScore.matched, 1);
assert.equal(selectedScore.uncertain, 0);
assert.equal(selectedScore.missing, 0);
assert.ok(selectedScore.areaError < 1e-12);
assert.equal(selectedScore.confidence, 0.84);

const secondLabel = label("Büro 2", 16, 80, 20);
const firstClosureRun = [exactCandidate];
const secondClosureRun = [rectangle(60, 0, 40, 40, 0.88)];
const combinedMatches = matchPdfRoomsToGeometry(
  [exactLabel, secondLabel],
  combinePdfRoomCandidateSets([firstClosureRun, secondClosureRun]),
  metersPerPixel,
);
assert.deepEqual(combinedMatches.map((room) => room.geometryStatus), ["matched", "matched"], "Räume dürfen ihre beste Kontur aus unterschiedlichen Lückenschließungen erhalten.");

const mixedSheetAnchors: PdfDrawingAnchor[] = [
  { kind: "Ansicht", label: "ANSICHT WEST", anchor: { x: 200, y: 280 } },
  { kind: "Ansicht", label: "ANSICHT NORD", anchor: { x: 520, y: 280 } },
  { kind: "Schnitt", label: "SCHNITT A-A", anchor: { x: 800, y: 300 } },
  { kind: "Grundriss", label: "GRUNDRISS EG", anchor: { x: 200, y: 730 } },
  { kind: "Grundriss", label: "GRUNDRISS OG", anchor: { x: 520, y: 730 } },
];
const mixedSheetRooms = [
  rectangle(170, 130, 60, 60),
  rectangle(170, 470, 60, 80),
  rectangle(730, 130, 60, 70),
  rectangle(730, 470, 60, 80),
  rectangle(920, 610, 60, 80),
];
const floorPlanRooms = filterRoomsToFloorPlanRegions(mixedSheetRooms, mixedSheetAnchors, 1000, 800);
assert.deepEqual(floorPlanRooms, [mixedSheetRooms[1], mixedSheetRooms[3]], "Auf einem Mischblatt dürfen Ansichten, Schnitt und Schriftfeld nicht als Räume erkannt werden.");
assert.equal(pointBelongsToFloorPlanRegion({ x: 760, y: 510 }, mixedSheetAnchors, 1000, 800), true);
assert.equal(pointBelongsToFloorPlanRegion({ x: 200, y: 160 }, mixedSheetAnchors, 1000, 800), false);
assert.deepEqual(filterRoomsToFloorPlanRegions(mixedSheetRooms, mixedSheetAnchors.filter((anchor) => anchor.kind === "Grundriss"), 1000, 800), mixedSheetRooms, "Reine Grundrissseiten dürfen nicht unnötig beschnitten werden.");

const roomHeights = extractPdfRoomHeights([
  { str: "RH:", transform: [1, 0, 0, 1, 125, 150], width: 18 },
  { str: "2,75", transform: [1, 0, 0, 1, 154, 150], width: 22 },
  { str: "BRH 1,20", transform: [1, 0, 0, 1, 180, 180], width: 44 },
  { str: "lichte Höhe 3.10 m", transform: [1, 0, 0, 1, 490, 150], width: 95 },
], { scale: 1, transform: [1, 0, 0, 1, 0, 0] });
assert.deepEqual(roomHeights.map((height) => height.value), [2.75, 3.1], "Eindeutige RH-/Raumhöhenangaben müssen gelesen, BRH-Werte aber ignoriert werden.");
assert.equal(selectPdfRoomHeight(rectangle(100, 100, 100, 100), roomHeights, 0.01)?.value, 2.75, "Eine Höhenangabe innerhalb des Raums muss diesem Raum zugeordnet werden.");
assert.equal(selectPdfRoomHeight(rectangle(450, 100, 160, 100), roomHeights, 0.01)?.value, 3.1, "Jeder Raum muss seine eigene PDF-Höhenangabe erhalten.");
assert.equal(selectPdfRoomHeight(rectangle(800, 600, 80, 80), roomHeights, 0.01), null, "Eine weit entfernte Höhenangabe darf nicht ungeprüft übernommen werden.");

const blockedPerimeterRoom: Measurement = {
  id: "room_missing-geometry",
  kind: "room",
  name: "Büro ohne Kontur",
  page: 1,
  points: [],
  color: "#8E1E6E",
  height: 2.8,
  quantity: 1,
  factor: 1,
  includeFloor: true,
  includeWalls: true,
  includeSkirting: true,
  requestedIncludeWalls: true,
  requestedIncludeSkirting: true,
  areaOverride: 16,
  areaSource: "pdf-nrf",
  source: "auto",
  geometryStatus: "missing",
  visible: true,
  createdAt: new Date(0).toISOString(),
};
const blockedRows = deriveLineItems([blockedPerimeterRoom], { 1: metersPerPixel }, 2.5, 2);
assert.deepEqual(blockedRows.map((row) => row.category), ["Boden"], "Fehlende Konturen dürfen selbst bei gesetztem Schalter keine Wand- oder Sockelmenge erzeugen.");
const blockedIssues = validateMeasurements([blockedPerimeterRoom], { 1: metersPerPixel }, 2.5, blockedRows);
assert.ok(blockedIssues.some((issue) => issue.id === `geometry-review-${blockedPerimeterRoom.id}` && issue.severity === "error"));

const legacyRoom: Measurement = {
  ...blockedPerimeterRoom,
  id: "room_legacy-geometry",
  points: exactCandidate.points,
  geometryStatus: undefined,
  includeWalls: true,
  includeSkirting: true,
  requestedIncludeWalls: undefined,
  requestedIncludeSkirting: undefined,
};
const migratedLegacy = normalizeLegacyPdfRoomGeometry([legacyRoom])[0];
assert.equal(migratedLegacy.geometryStatus, "uncertain");
assert.equal(migratedLegacy.includeWalls, false);
assert.equal(migratedLegacy.includeSkirting, false);
assert.equal(migratedLegacy.requestedIncludeWalls, true);
assert.equal(migratedLegacy.requestedIncludeSkirting, true);
assert.deepEqual(migratedLegacy.points, legacyRoom.points, "Die alte Kontur bleibt als Korrekturgrundlage erhalten, erzeugt aber keine Menge.");
assert.ok(migratedLegacy.labelAnchor);

assert.equal(measurementIsVisibleOnPlan(blockedPerimeterRoom, null), false, "Ohne Auswahl darf kein Raum den Grundriss verdecken.");
assert.equal(measurementIsVisibleOnPlan(blockedPerimeterRoom, blockedPerimeterRoom.id), true, "Der angeklickte Raum muss einzeln im Grundriss erscheinen.");
assert.equal(measurementIsVisibleOnPlan({ id: "line_1", kind: "line" }, null), true, "Andere bewusst gezeichnete Bauteile bleiben sichtbar.");

console.log(JSON.stringify({ exact: exact.geometryStatus, merged: merged.map((room) => room.geometryStatus), selectedScore, blockedCategories: blockedRows.map((row) => row.category) }));
