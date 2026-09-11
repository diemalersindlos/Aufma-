import assert from "node:assert/strict";
import { deriveLineItems, type Measurement } from "../lib/measurements";
import { validateMeasurements } from "../lib/measurement-validation";

const createdAt = "2026-08-23T12:00:00.000Z";
const baseRoom: Measurement = {
  id: "room_validation_base",
  kind: "room",
  name: "Wohnzimmer",
  page: 1,
  points: [],
  color: "#8E1E6E",
  height: 2.6,
  quantity: 1,
  factor: 1,
  includeWalls: true,
  includeCeiling: true,
  includeFloor: true,
  includeSkirting: true,
  areaOverride: 20,
  perimeterOverride: 18,
  openings: [],
  visible: true,
  createdAt,
};

function issuesFor(room: Measurement, threshold = 2.5) {
  const rows = deriveLineItems([room], {}, threshold, 2);
  return validateMeasurements([room], {}, threshold, rows);
}

assert.equal(issuesFor(baseRoom).length, 0);

const heightCases = [0, 0.3, 1.79, 1.8, 2.5, 3.5, 5, 5.01, 8];
for (const height of heightCases) {
  const issues = issuesFor({ ...baseRoom, id: `room_height_${String(height).replace(".", "_")}`, height });
  if (height === 0) assert.ok(issues.some((issue) => issue.id.startsWith("height-")));
  else if (height < 1.8 || height > 5) assert.ok(issues.some((issue) => issue.id.startsWith("height-unusual-")));
  else assert.ok(!issues.some((issue) => issue.id.startsWith("height-")));
}

const missingArea = issuesFor({ ...baseRoom, id: "room_missing_area", areaOverride: 0 });
assert.ok(missingArea.some((issue) => issue.id.startsWith("area-")));
const missingPerimeter = issuesFor({ ...baseRoom, id: "room_missing_perimeter", perimeterOverride: 0 });
assert.ok(missingPerimeter.some((issue) => issue.id.startsWith("perimeter-")));
const noSurface = issuesFor({ ...baseRoom, id: "room_no_surface", includeWalls: false, includeCeiling: false, includeFloor: false, includeSkirting: false });
assert.ok(noSurface.some((issue) => issue.id.startsWith("surfaces-")));

const duplicateOpenings: Measurement = {
  ...baseRoom,
  id: "room_duplicate_openings",
  openings: [
    { id: "opening_duplicate_1", name: "Fenster 1", openingKind: "window", width: 1.2, height: 1.4, quantity: 1, mode: "vob", revealDepth: 0.15 },
    { id: "opening_duplicate_2", name: "Fenster 1", openingKind: "window", width: 1.2, height: 1.4, quantity: 1, mode: "vob", revealDepth: 0.15 },
  ],
};
assert.ok(issuesFor(duplicateOpenings).some((issue) => issue.id.startsWith("opening-duplicate-")));

const oversizedDoor: Measurement = {
  ...baseRoom,
  id: "room_oversized_door",
  openings: [{ id: "opening_large_door", name: "Tür", openingKind: "door", width: 8.8, height: 2.01, quantity: 1, mode: "vob", revealDepth: 0 }],
};
assert.ok(issuesFor(oversizedDoor).some((issue) => issue.id.startsWith("door-unusual-")));

const deductionsExceedWall: Measurement = {
  ...baseRoom,
  id: "room_excess_deduction",
  height: 2,
  perimeterOverride: 4,
  openings: [{ id: "opening_excess", name: "Fenster groß", openingKind: "window", width: 4, height: 3, quantity: 1, mode: "always", revealDepth: 0.2 }],
};
assert.ok(issuesFor(deductionsExceedWall).some((issue) => issue.id.startsWith("openings-exceed-wall-")));

const invalidOpenings = [
  { width: 0, height: 2, quantity: 1 },
  { width: 1, height: 0, quantity: 1 },
  { width: 1, height: 2, quantity: 0 },
  { width: -1, height: 2, quantity: 1 },
  { width: 1, height: Number.NaN, quantity: 1 },
];
for (const [index, opening] of invalidOpenings.entries()) {
  const issues = issuesFor({
    ...baseRoom,
    id: `room_invalid_opening_${index}`,
    openings: [{ id: `opening_invalid_${index}`, name: `Öffnung ${index + 1}`, openingKind: "window", ...opening, mode: "vob", revealDepth: 0.15 }],
  });
  assert.ok(issues.some((issue) => issue.id.startsWith("opening-invalid-")));
}

assert.ok(issuesFor({ ...baseRoom, id: "room_zero_quantity", quantity: 0 }).some((issue) => issue.id.startsWith("quantity-")));
assert.ok(issuesFor({ ...baseRoom, id: "room_zero_factor", factor: 0 }).some((issue) => issue.id.startsWith("factor-")));
assert.ok(validateMeasurements([baseRoom], {}, -1).some((issue) => issue.id === "invalid-opening-threshold"));

console.log(JSON.stringify({ heightCases: heightCases.length, invalidOpenings: invalidOpenings.length, checks: 22 }));

