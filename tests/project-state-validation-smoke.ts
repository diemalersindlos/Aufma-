import assert from "node:assert/strict";
import { createMobileProjectState } from "../lib/mobile-project";
import { parseStoredProjectState, validateStoredProjectState } from "../lib/project-state-validation";

const valid = createMobileProjectState();
valid.meta.title = "Produktionsprüfung";
assert.equal(validateStoredProjectState(valid).ok, true);
assert.equal(parseStoredProjectState(JSON.stringify(valid)).ok, true);

const multiPdf = structuredClone(valid);
multiPdf.sourceFileNames = ["Erdgeschoss.pdf", "Obergeschoss.pdf"];
assert.equal(validateStoredProjectState(multiPdf).ok, true);
const invalidMultiPdf = structuredClone(valid);
invalidMultiPdf.sourceFileNames = [""];
assert.equal(validateStoredProjectState(invalidMultiPdf).ok, false);

const duplicate = structuredClone(valid);
duplicate.measurements = [
  {
    id: "measurement_duplicate",
    kind: "count",
    name: "Bauteil",
    page: 1,
    points: [],
    color: "#6C347A",
    quantity: 1,
    factor: 1,
    visible: true,
    createdAt: "2026-08-23T12:00:00.000Z",
  },
  {
    id: "measurement_duplicate",
    kind: "count",
    name: "Bauteil 2",
    page: 1,
    points: [],
    color: "#6C347A",
    quantity: 1,
    factor: 1,
    visible: true,
    createdAt: "2026-08-23T12:00:00.000Z",
  },
];
const duplicateResult = validateStoredProjectState(duplicate);
assert.equal(duplicateResult.ok, false);
if (!duplicateResult.ok) assert.match(duplicateResult.error, /doppelt/);

const negative = structuredClone(valid);
negative.meta.deductionThreshold = -1;
assert.equal(validateStoredProjectState(negative).ok, false);

const invalidJson = parseStoredProjectState("{broken");
assert.equal(invalidJson.ok, false);

console.log(JSON.stringify({ valid: true, duplicateRejected: true, negativeRejected: true, invalidJsonRejected: true }));
