import assert from "node:assert/strict";
import { buildSketchRoomMeasurement, calculateSketchRoom, recognizeFreehandSketch, updateRecognizedSketchPoints } from "../lib/freehand-sketch";
import { deriveLineItems } from "../lib/measurements";

type TestPoint = { x: number; y: number };
function line(start: TestPoint, end: TestPoint, steps: number) {
  return Array.from({ length: steps }, (_, index) => {
    const position = index / steps;
    const wobble = index % 2 ? 0.7 : -0.5;
    return { x: start.x + (end.x - start.x) * position + wobble, y: start.y + (end.y - start.y) * position - wobble };
  });
}

const raw = [
  ...line({ x: 50, y: 45 }, { x: 290, y: 45 }, 25),
  ...line({ x: 290, y: 45 }, { x: 290, y: 205 }, 18),
  ...line({ x: 290, y: 205 }, { x: 50, y: 205 }, 25),
  ...line({ x: 50, y: 205 }, { x: 50, y: 45 }, 18),
  { x: 51, y: 46 },
];

const recognized = recognizeFreehandSketch(raw);
assert.equal(recognized.shape, "rectangle");
assert.equal(recognized.points.length, 4);
assert.equal(recognized.sides.length, 4);
assert.equal(recognized.automaticallyStraightened, true);
assert.ok(recognized.confidence > 0.8);

const lCorners = [
  { x: 40, y: 35 }, { x: 310, y: 35 }, { x: 310, y: 125 },
  { x: 175, y: 125 }, { x: 175, y: 230 }, { x: 40, y: 230 }, { x: 40, y: 35 },
];
const lRaw = lCorners.slice(0, -1).flatMap((start, index) => line(start, lCorners[index + 1], 18));
lRaw.push(lCorners[0]);
const recognizedLShape = recognizeFreehandSketch(lRaw);
assert.equal(recognizedLShape.shape, "l-shape");
assert.equal(recognizedLShape.points.length, 6);
assert.equal(recognizedLShape.automaticallyStraightened, true);
const dominantAngle = Math.atan2(recognizedLShape.sides[0].end.y - recognizedLShape.sides[0].start.y, recognizedLShape.sides[0].end.x - recognizedLShape.sides[0].start.x);
recognizedLShape.sides.forEach((side) => {
  const angle = Math.atan2(side.end.y - side.start.y, side.end.x - side.start.x);
  const axisError = Math.abs(Math.sin(2 * (angle - dominantAngle)));
  assert.ok(axisError < 1e-8, "Jede automatisch erkannte L-Raum-Seite muss parallel oder rechtwinklig zur Hauptachse verlaufen.");
});

const crossedCorners = [
  { x: 45, y: 40 }, { x: 305, y: 215 }, { x: 305, y: 40 },
  { x: 45, y: 215 }, { x: 45, y: 40 },
];
const crossedRaw = crossedCorners.slice(0, -1).flatMap((start, index) => line(start, crossedCorners[index + 1], 22));
crossedRaw.push(crossedCorners[0]);
const recognizedCrossedShape = recognizeFreehandSketch(crossedRaw);
assert.equal(recognizedCrossedShape.shape, "rectangle");
assert.equal(recognizedCrossedShape.crossingsRepaired, 1);
assert.ok(recognizedCrossedShape.confidence >= 0.8);

const longest = [...recognized.sides].sort((left, right) => right.pixels - left.pixels)[0];
const result = calculateSketchRoom({ recognition: recognized, referenceSide: longest.index, referenceMeters: 6 });
assert.ok(Math.abs(result.area - 24) < 0.3);
assert.ok(Math.abs(result.perimeter - 20) < 0.3);

const corrected = updateRecognizedSketchPoints(recognized, recognized.points.map((point, index) => index === 0 ? { ...point, x: point.x + 10 } : point));
assert.equal(corrected.manuallyCorrected, true);
assert.equal(corrected.points.length, 4);
assert.notEqual(corrected.pixelArea, recognized.pixelArea);

const measurement = buildSketchRoomMeasurement({
  name: "Skizzenraum",
  recognition: corrected,
  referenceSide: longest.index,
  referenceMeters: 6,
  height: 2.5,
  quantity: 1,
  includeWalls: true,
  includeCeiling: true,
  includeFloor: true,
  includeSkirting: true,
  inputMethod: "apple-pencil",
}, 1, "#8E1E6E");
const rows = deriveLineItems([measurement], {}, 2.5, 2);
assert.equal(rows.length, 4);
assert.equal(measurement.areaSource, "freehand-sketch");
assert.equal(measurement.proCapture?.type, "sketch");
assert.equal(measurement.proCapture?.inputMethod, "apple-pencil");
assert.equal(measurement.proCapture?.automaticallyStraightened, false, "Eine manuell korrigierte Kontur darf nicht fälschlich als automatisch begradigt gelten.");
assert.match(measurement.proCapture?.formula ?? "", /Apple Pencil/);
assert.match(measurement.proCapture?.formula ?? "", /Kontur manuell korrigiert/);
assert.equal(measurement.proCapture?.manuallyCorrected, true);
assert.ok((measurement.proCapture?.sketchPoints?.length ?? 0) >= 4);

console.log(JSON.stringify({ shape: recognized.shape, lShape: recognizedLShape.shape, crossedShape: recognizedCrossedShape.shape, repaired: recognizedCrossedShape.crossingsRepaired, confidence: recognized.confidence, area: result.area, perimeter: result.perimeter, rows: rows.length }));
