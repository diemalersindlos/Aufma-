import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createMobileProjectState } from "../lib/mobile-project";

const mobile = createMobileProjectState();
assert.equal(mobile.meta.title, "");
assert.equal(mobile.meta.customer, "");
assert.equal(mobile.meta.address, "");
assert.equal(mobile.meta.estimator, "");
assert.equal(mobile.meta.reference, "");
assert.equal(mobile.measurements.length, 0);
assert.equal(mobile.panoramas?.length, 0);
assert.deepEqual(mobile.scales, {});
assert.equal(mobile.meta.vobRuleConfirmed, false);

const desktopSource = await readFile(new URL("../components/measure-app.tsx", import.meta.url), "utf8");
for (const emptyMetaField of ["title", "customer", "address", "estimator", "reference"]) {
  assert.match(desktopSource, new RegExp(`${emptyMetaField}:\\s*\"\"`), `Das Desktop-Projektfeld ${emptyMetaField} muss leer beginnen.`);
}
for (const resetCall of [
  "setMeasurements([])",
  "setPanoramas([])",
  "setScales({})",
  "setCalibrationDistance(\"\")",
  "setDrawingPoints([])",
  "setAutoRoomHeight(2.5)",
  "setAutoMinRoomArea(1)",
]) {
  assert.ok(desktopSource.includes(resetCall), `Beim neuen Projekt fehlt der Reset ${resetCall}.`);
}

const mobileSource = await readFile(new URL("../components/mobile-measure-app.tsx", import.meta.url), "utf8");
assert.match(mobileSource, /const roomDefaults = \(index = 1\): RoomDraft => \{[\s\S]*?name: "",[\s\S]*?height: "",[\s\S]*?quantity: ""/);
assert.match(mobileSource, /sketchMeasureRef\.current\?\.reset\(\)/);

const desktopCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
assert.match(desktopCss, /\.project-library-list\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(desktopCss, /\.project-sheet-tab-stack\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);

console.log(JSON.stringify({ emptyProjectMeta: true, desktopReset: true, mobileReset: true, verticalProjects: true }));
