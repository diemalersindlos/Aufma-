import assert from "node:assert/strict";
import { parseAiMeasureInput } from "../lib/ai-measure-input";

const room = parseAiMeasureInput("Wohnzimmer 5 mal 4 Meter, Höhe 2,60, Wände und Decke", "room");
assert.equal(room.target, "room");
assert.equal(room.name, "Wohnzimmer");
assert.equal(room.length, 5);
assert.equal(room.width, 4);
assert.equal(room.height, 2.6);
assert.equal(room.includeWalls, true);
assert.equal(room.includeCeiling, true);
assert.equal(room.includeFloor, false);

const sketch = parseAiMeasureInput("Freihand Seite 2 ist 6 Meter, Höhe 2,50, Wand Decke und Fußleisten", "sketch");
assert.equal(sketch.target, "sketch");
assert.equal(sketch.referenceSide, 1);
assert.equal(sketch.referenceMeters, 6);
assert.equal(sketch.height, 2.5);
assert.equal(sketch.includeSkirting, true);

const opening = parseAiMeasureInput("Fenster 1,20 mal 1,50 Meter, Anzahl 2 im Wohnzimmer", "room");
assert.equal(opening.target, "opening");
assert.equal(opening.width, 1.2);
assert.equal(opening.height, 1.5);
assert.equal(opening.quantity, 2);
assert.equal(opening.roomName, "Wohnzimmer");

const gable = parseAiMeasureInput("Giebel 6 Meter breit und Höhe 2 Meter", "special");
assert.equal(gable.target, "special");
assert.equal(gable.shape, "gable");
assert.equal(gable.a, 6);
assert.equal(gable.height, 2);

console.log(JSON.stringify({ room: room.understood.length, sketch: sketch.understood.length, opening: opening.understood.length, gable: gable.understood.length }));
