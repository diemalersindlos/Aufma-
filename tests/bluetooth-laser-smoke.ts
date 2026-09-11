import assert from "node:assert/strict";
import { decodeLaserMeasurement, hasCompleteLaserSequence, type LaserMeasurementRecord } from "../lib/bluetooth-laser";

assert.equal(decodeLaserMeasurement("DIST=5.234 m\r\n")?.meters, 5.234);
assert.equal(decodeLaserMeasurement("5234 mm")?.meters, 5.234);
assert.equal(decodeLaserMeasurement("5234")?.meters, 5.234);
assert.equal(decodeLaserMeasurement("250,5 cm")?.meters, 2.505);
assert.equal(decodeLaserMeasurement("kein Messwert"), null);

const floatBytes = new ArrayBuffer(4);
new DataView(floatBytes).setFloat32(0, 4.25, true);
assert.ok(Math.abs((decodeLaserMeasurement(floatBytes)?.meters ?? 0) - 4.25) < 0.0001);

const now = new Date().toISOString();
const records: LaserMeasurementRecord[] = [
  { target: "length", meters: 5, receivedAt: now, source: "bluetooth" },
  { target: "width", meters: 4, receivedAt: now, source: "bluetooth" },
  { target: "height", meters: 2.5, receivedAt: now, source: "manual-correction", originalMeters: 2.48 },
];
assert.equal(hasCompleteLaserSequence(records), true);
assert.equal(hasCompleteLaserSequence(records.slice(0, 2)), false);

console.log(JSON.stringify({ text: 5.234, millimeters: 5.234, float: 4.25, complete: true }));
