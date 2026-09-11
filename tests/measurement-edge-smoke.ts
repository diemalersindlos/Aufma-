import assert from "node:assert/strict";
import {
  deriveLineItems,
  measurementColor,
  nextRoomColor,
  normalizeMeasurementColors,
  openingCalculation,
  roomAreaMeters,
  type Measurement,
} from "../lib/measurements";

const createdAt = new Date().toISOString();
const measurements: Measurement[] = [
  {
    id: "area_zero",
    kind: "area",
    name: "Fläche mit Faktor 0",
    page: 1,
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    color: "#D96F39",
    quantity: 1,
    factor: 0,
    visible: true,
    createdAt,
  },
  {
    id: "line_zero",
    kind: "line",
    name: "Länge mit Menge 0",
    page: 1,
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    color: "#E79A32",
    quantity: 0,
    factor: 1,
    visible: true,
    createdAt,
  },
  {
    id: "count_without_scale",
    kind: "count",
    name: "Bauteile ohne Maßstab",
    page: 2,
    points: [{ x: 10, y: 10 }],
    color: "#6C347A",
    quantity: 3,
    factor: 2,
    visible: true,
    createdAt,
  },
];

const rows = deriveLineItems(measurements, { 1: 0.01 }, 2.5, Number.NaN);
assert.equal(rows.length, 3);
assert.equal(rows[0].gross, 0);
assert.equal(rows[1].gross, 0);
assert.equal(rows[2].gross, 6);
assert.ok(rows.every((row) => !/NaN|Infinity|∞/.test(row.formula)));
assert.match(rows[0].formula, /1,00 m² × 0,00/);
assert.match(rows[1].formula, /1,00 m × 0,00/);

const malformedOpening = openingCalculation({
  id: "invalid",
  name: "Ungültige Öffnung",
  width: Number.NaN,
  height: -2,
  quantity: Number.NaN,
  mode: "always",
}, Number.NaN);
assert.deepEqual(malformedOpening, { each: 0, gross: 0, deduct: 0, overmeasured: false, isDoor: false, revealDepth: 0, revealSides: 3, revealLength: 0, revealGross: 0, revealSeparate: false, revealResult: 0 });

const smallOpening = openingCalculation({ id: "small", name: "Fenster", openingKind: "window", width: 1, height: 2, quantity: 1, mode: "vob", revealDepth: 0.15 }, 2.5);
assert.equal(smallOpening.overmeasured, true);
assert.equal(smallOpening.revealGross, 0.75);
assert.equal(smallOpening.revealResult, 0);

const largeOpening = openingCalculation({ id: "large", name: "Fenster", openingKind: "window", width: 2, height: 2, quantity: 1, mode: "vob", revealDepth: 0.2 }, 2.5);
assert.equal(largeOpening.deduct, 4);
assert.ok(Math.abs(largeOpening.revealGross - 1.2) < 1e-9);
assert.ok(Math.abs(largeOpening.revealResult - 1.2) < 1e-9);

const doorOpening = openingCalculation({ id: "door", name: "Tür", openingKind: "door", width: 1, height: 2, quantity: 1, mode: "vob", revealDepth: 0.15 }, 2.5);
assert.equal(doorOpening.deduct, 0);
assert.equal(doorOpening.overmeasured, true);
assert.equal(doorOpening.revealGross, 0);
assert.equal(doorOpening.revealResult, 0);

const largeDoorOpening = openingCalculation({ id: "large-door", name: "Tür", openingKind: "door", width: 1.5, height: 2, quantity: 1, mode: "vob", revealDepth: 0.15 }, 2.5);
assert.equal(largeDoorOpening.deduct, 3);
assert.equal(largeDoorOpening.overmeasured, false);
assert.equal(largeDoorOpening.revealResult, 0);

const legacyDoorOverride = openingCalculation({ id: "legacy-door", name: "Tür Bestand", width: 1, height: 2, quantity: 1, mode: "always", revealDepth: 0.2 }, 2.5);
assert.equal(legacyDoorOverride.deduct, 0);
assert.equal(legacyDoorOverride.overmeasured, true);
assert.equal(legacyDoorOverride.revealResult, 0);

const invalidOverride: Measurement = {
  ...measurements[0],
  id: "invalid_override",
  kind: "room",
  areaOverride: Number.NaN,
};
assert.equal(roomAreaMeters(invalidOverride, 0.01), 0);

const revealRows = deriveLineItems([{ ...invalidOverride, id: "reveal_room", factor: 1, includeWalls: true, perimeterOverride: 10, areaOverride: 5, openings: [
  { id: "small", name: "Fenster klein", openingKind: "window", width: 1, height: 2, quantity: 1, mode: "vob", revealDepth: 0.15 },
  { id: "large", name: "Fenster groß", openingKind: "window", width: 2, height: 2, quantity: 1, mode: "vob", revealDepth: 0.2 },
] }], {}, 2.5, 2).filter((row) => row.category === "Laibungen");
assert.equal(revealRows.length, 2);
assert.equal(revealRows[0].result, 0);
assert.equal(revealRows[0].deduction, 0.75);
assert.equal(revealRows[1].result, 1.2);

const revealRowsWithoutWalls = deriveLineItems([{ ...invalidOverride, id: "reveal_without_walls", factor: 1, includeWalls: false, perimeterOverride: 10, areaOverride: 5, openings: [
  { id: "window", name: "Fenster", openingKind: "window", width: 2, height: 2, quantity: 1, mode: "vob", revealDepth: 0.2 },
] }], {}, 2.5, 2).filter((row) => row.category === "Laibungen");
assert.equal(revealRowsWithoutWalls.length, 0);

const migratedColors = normalizeMeasurementColors([
  { ...invalidOverride, id: "room_old_1", color: "#8E1E6E" },
  { ...invalidOverride, id: "room_old_2", color: "#8E1E6E" },
  { ...invalidOverride, id: "room_custom", color: "#123456" },
]);
assert.equal(migratedColors[0].color, "#8E1E6E");
assert.equal(migratedColors[1].color, "#D96F39");
assert.equal(migratedColors[2].color, "#123456");

const generatedColors = Array.from({ length: 80 }, (_, index) => measurementColor("room", index));
assert.equal(new Set(generatedColors).size, generatedColors.length);
assert.equal(nextRoomColor(generatedColors.map((color) => ({ kind: "room" as const, color }))), measurementColor("room", 80));

console.log(JSON.stringify({ rows: rows.length, formulas: rows.map((row) => row.formula), migratedColors: migratedColors.map((room) => room.color), uniqueColors: generatedColors.length }));
