import assert from "node:assert/strict";
import { createMobileProjectState, normalizeMobileProjectState } from "../lib/mobile-project";
import { deriveLineItems, nextRoomColor } from "../lib/measurements";
import { buildLaserRoomMeasurement, buildSpecialAreaMeasurement } from "../lib/pro-workflow";

const state = createMobileProjectState();
const room = buildLaserRoomMeasurement({
  name: "Wohnzimmer",
  device: "Leica Disto",
  length: 5,
  width: 4,
  height: 2.5,
  quantity: 1,
  factor: 1,
  includeWalls: true,
  includeCeiling: true,
  includeFloor: true,
  includeSkirting: true,
}, 1, nextRoomColor([]));
room.openings = [{ id: "opening_test", name: "Fenster", width: 2, height: 2, quantity: 1, mode: "vob" }];

const special = buildSpecialAreaMeasurement({
  name: "Giebel",
  category: "Giebel",
  shape: "gable",
  a: 6,
  b: 0,
  height: 2,
  radius: 0,
  quantity: 1,
  factor: 1,
}, 1, "#D96F39");

state.measurements = [room, special];
const transported = normalizeMobileProjectState(JSON.parse(JSON.stringify(state)));
const rows = deriveLineItems(transported.measurements, transported.scales, transported.meta.deductionThreshold, transported.meta.rounding);

assert.equal(transported.version, 3);
assert.equal(transported.meta.id, state.meta.id);
assert.equal(transported.professional?.review.workflowStatus, "open");
assert.equal(rows.length, 5);
assert.equal(rows.find((row) => row.description === "Bodenfläche")?.result, 20);
assert.equal(rows.find((row) => row.description === "Deckenfläche")?.result, 20);
assert.equal(rows.find((row) => row.description === "Wandfläche")?.result, 41);
assert.equal(rows.find((row) => row.description === "Sockelleisten / Anschlusslänge")?.result, 18);
assert.equal(rows.find((row) => row.room === "Giebel")?.result, 6);

console.log(JSON.stringify({ projectId: transported.meta.id, positions: rows.length, wallArea: rows.find((row) => row.description === "Wandfläche")?.result }));
