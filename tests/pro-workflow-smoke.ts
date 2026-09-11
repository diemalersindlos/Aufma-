import assert from "node:assert/strict";
import { deriveLineItems, type ProjectMeta } from "../lib/measurements";
import {
  buildLaserRoomMeasurement,
  buildGaebX31PreparationXml,
  buildIntegrationManifest,
  buildRebPreparationCsv,
  buildReviewCsv,
  buildSpecialAreaMeasurement,
  calculateSpecialShape,
  evaluateQualityGate,
  type ProjectReviewState,
} from "../lib/pro-workflow";
import { VOB_RULESET } from "../lib/vob-rules";

const laserRoom = buildLaserRoomMeasurement({
  name: "Laserraum EG",
  device: "Leica DISTO X4",
  length: 5,
  width: 4,
  height: 2.5,
  quantity: 1,
  factor: 1,
  includeWalls: true,
  includeCeiling: true,
  includeFloor: true,
  includeSkirting: true,
  measurementMode: "bluetooth",
  laserMeasurements: [
    { target: "length", meters: 5, receivedAt: "2026-08-20T18:00:00.000Z", source: "bluetooth" },
    { target: "width", meters: 4, receivedAt: "2026-08-20T18:00:01.000Z", source: "bluetooth" },
    { target: "height", meters: 2.5, receivedAt: "2026-08-20T18:00:02.000Z", source: "bluetooth" },
  ],
}, 1, "#8E1E6E");

const gable = calculateSpecialShape({ shape: "gable", a: 6, b: 0, height: 2, radius: 0 });
assert.equal(gable.area, 6);
assert.match(gable.formula, /6,00 m × 2,00 m ÷ 2/);

const special = buildSpecialAreaMeasurement({
  name: "Giebel Süd",
  category: "Giebel",
  shape: "gable",
  a: 6,
  b: 0,
  height: 2,
  radius: 0,
  quantity: 2,
  factor: 1,
}, 1, "#D96F39");

const rows = deriveLineItems([laserRoom, special], {}, 2.5, 2);
assert.equal(rows.length, 5);
assert.deepEqual(rows.slice(0, 4).map((row) => row.result), [20, 20, 45, 18]);
assert.equal(rows[4].result, 12);
assert.match(rows[0].formula, /5,00 m × 4,00 m/);
assert.match(rows[4].formula, /6,00 m × 2,00 m ÷ 2/);
assert.equal(laserRoom.proCapture?.measurementMode, "bluetooth");
assert.equal(laserRoom.proCapture?.laserMeasurements?.length, 3);
assert.match(laserRoom.proCapture?.label ?? "", /Bluetooth-Laser-Aufmaß/);
assert.match(laserRoom.proCapture?.formula ?? "", /Messfolge L\/B\/H/);

const meta: ProjectMeta = {
  id: "project_pro_test",
  title: "Profi-Aufmaß Test",
  customer: "Architekturbüro Test",
  address: "Baustelle 1",
  estimator: "Marcel Bening",
  reference: "LV-100",
  standard: "VOB/C",
  deductionThreshold: 2.5,
  vobRuleSetId: VOB_RULESET.id,
  vobRuleConfirmed: true,
  vobRuleConfirmedBy: "A. Prüfer",
  vobRuleConfirmedAt: new Date().toISOString(),
  rounding: 2,
  updatedAt: new Date().toISOString(),
};
const review: ProjectReviewState = {
  reviewer: "A. Prüfer",
  office: "Architekturbüro Test",
  updatedAt: new Date().toISOString(),
  entries: {
    [rows[0].id]: {
      lineId: rows[0].id,
      decision: "approved",
      comment: "geprüft",
      reviewer: "A. Prüfer",
      reviewedAt: new Date().toISOString(),
    },
  },
};
const rebCsv = buildRebPreparationCsv(meta, rows, [laserRoom, special]);
const reviewCsv = buildReviewCsv(meta, rows, review);
assert.match(rebCsv, /Laser-Aufmaß/);
assert.match(rebCsv, /kein schema-validiertes DA11\/X31/);
assert.match(reviewCsv, /FREIGEGEBEN/);
assert.match(reviewCsv, /geprüft/);

const openGate = evaluateQualityGate(meta, rows, [laserRoom, special], {}, review);
assert.equal(openGate.releasable, false);
assert.equal(openGate.open, 4);
const approvedReview: ProjectReviewState = {
  ...review,
  workflowStatus: "released",
  revision: 1,
  releaseCode: "MA-TEST",
  entries: Object.fromEntries(rows.map((row) => [row.id, { lineId: row.id, decision: "approved", comment: "geprüft", reviewer: "A. Prüfer", reviewedAt: new Date().toISOString() }])),
};
const approvedGate = evaluateQualityGate(meta, rows, [laserRoom, special], {}, approvedReview);
assert.equal(approvedGate.releasable, true);
assert.equal(approvedGate.errors, 0);
const gaebXml = buildGaebX31PreparationXml(meta, rows, [laserRoom, special]);
assert.match(gaebXml, /<GaebX31Preparation version="3.3"/);
assert.match(gaebXml, /<QuantityLine/);
const integration = JSON.parse(buildIntegrationManifest(meta, rows, approvedReview));
assert.equal(integration.project.id, meta.id);
assert.equal(integration.quantities.length, rows.length);

console.log(JSON.stringify({ rows: rows.length, laserArea: laserRoom.areaOverride, specialArea: special.areaOverride }));
