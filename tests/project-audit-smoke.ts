import assert from "node:assert/strict";
import { buildProjectChanges, lifecycleChange } from "../lib/project-audit";
import { defaultMaterialSettings } from "../lib/excel-export";
import type { StoredProjectState } from "../lib/project-storage-types";

function state(): StoredProjectState {
  return {
    version: 3,
    status: "draft",
    meta: {
      id: "project_audit_test",
      title: "Bürogebäude",
      customer: "Altbau GmbH",
      address: "Musterstraße 1",
      estimator: "Marcel",
      reference: "2026-001",
      standard: "Freies Aufmaß",
      deductionThreshold: 2.5,
      rounding: 2,
      updatedAt: "2026-08-23T10:00:00.000Z",
    },
    fileName: "grundriss.pdf",
    pageCount: 1,
    includedPages: [1],
    scales: { 1: 0.01 },
    measurements: [{
      id: "room_living",
      kind: "room",
      name: "Wohnzimmer",
      page: 1,
      points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }],
      color: "#8E1E6E",
      height: 2.5,
      quantity: 1,
      factor: 1,
      includeWalls: true,
      includeCeiling: true,
      visible: true,
      createdAt: "2026-08-23T10:00:00.000Z",
      openings: [{ id: "door_1", name: "Tür 1", width: 0.88, height: 2.01, quantity: 1, mode: "vob", openingKind: "door", revealDepth: 0.2 }],
    }],
    materials: structuredClone(defaultMaterialSettings),
    autoSettings: { roomHeight: 2.5, minRoomArea: 1, includeWalls: true, includeCeiling: true, includeFloor: false, includeSkirting: false },
  };
}

const previous = state();
const next = structuredClone(previous);
next.meta.customer = "Neubau GmbH";
next.meta.updatedAt = "2026-08-23T11:00:00.000Z";
next.measurements[0].height = 2.6;
next.measurements[0].points[1].x = 435;
next.measurements[0].openings![0].width = 1;
next.measurements.push({
  id: "line_skirting",
  kind: "line",
  name: "Sockelleiste Flur",
  page: 1,
  points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
  color: "#E79A32",
  quantity: 1,
  factor: 1,
  visible: true,
  createdAt: "2026-08-23T11:00:00.000Z",
});

const changes = buildProjectChanges(previous, next);
assert.ok(changes.some((change) => change.path === "meta.customer" && change.before === "Altbau GmbH" && change.after === "Neubau GmbH"));
assert.ok(changes.some((change) => change.path === "measurements.room_living.height" && change.before === 2.5 && change.after === 2.6));
assert.ok(changes.some((change) => change.path === "measurements.room_living.points" && change.label.includes("Kontur")));
assert.ok(changes.some((change) => change.path === "measurements.room_living.openings.door_1.width" && change.before === 0.88 && change.after === 1));
assert.ok(changes.some((change) => change.path === "measurements.line_skirting" && change.label.includes("hinzugefügt")));
assert.ok(!changes.some((change) => change.path === "meta.updatedAt"), "Technische Speicherzeitpunkte gehören nicht in das fachliche Feldprotokoll.");

const created = buildProjectChanges(null, next);
assert.equal(created.length, 3);
assert.equal(created[0].label, "Projektakte");
assert.deepEqual(lifecycleChange("Projektablage", "Aktiv", "Papierkorb"), [{ path: "lifecycle", label: "Projektablage", before: "Aktiv", after: "Papierkorb" }]);

console.log(JSON.stringify({ fieldChanges: changes.length, creationSummary: created.length, lifecycle: true }));
