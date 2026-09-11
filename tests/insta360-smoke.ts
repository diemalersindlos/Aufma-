import assert from "node:assert/strict";
import { buildInsta360RoomMeasurement, calculateInsta360RoomGeometry, panoramaAspectStatus, type PanoramaAsset } from "../lib/insta360";
import { deriveLineItems } from "../lib/measurements";

const panorama: PanoramaAsset = {
  id: "pano360_test",
  fileName: "INSTA360_X4_Wohnzimmer.jpg",
  width: 7680,
  height: 3840,
  cameraModel: "Insta360 X4",
  roomName: "Wohnzimmer",
  createdAt: "2026-08-17T00:00:00.000Z",
};

assert.equal(panoramaAspectStatus(7680, 3840), "equirectangular");
assert.equal(panoramaAspectStatus(4000, 3000), "flat");
assert.deepEqual(calculateInsta360RoomGeometry({ shape: "rectangle", length: 5, width: 4, area: 0, perimeter: 0, height: 2.5 }), {
  area: 20,
  perimeter: 18,
  wallArea: 45,
});

const measurement = buildInsta360RoomMeasurement({
  panorama,
  page: 1,
  roomName: "Wohnzimmer EG",
  shape: "rectangle",
  length: 5,
  width: 4,
  area: 0,
  perimeter: 0,
  height: 2.5,
  quantity: 1,
  factor: 1,
  includeFloor: true,
  includeCeiling: true,
  includeWalls: true,
  includeSkirting: true,
  referenceMethod: "laser",
  color: "#8E1E6E",
  openings: [
    { id: "window_test", name: "Fenster", width: 1.5, height: 1.2, quantity: 1, mode: "vob" },
    { id: "door_test", name: "Tür", width: 1.2, height: 2.2, quantity: 1, mode: "vob" },
  ],
});

const rows = deriveLineItems([measurement], {}, 2.5, 2);
assert.equal(rows.length, 4);
assert.equal(rows.find((row) => row.category === "Boden")?.result, 20);
assert.equal(rows.find((row) => row.category === "Decke")?.result, 20);
assert.equal(rows.find((row) => row.category === "Wand")?.gross, 45);
assert.equal(rows.find((row) => row.category === "Wand")?.deduction, 2.64);
assert.equal(rows.find((row) => row.category === "Wand")?.result, 42.36);
assert.equal(rows.find((row) => row.category === "Länge")?.result, 18);
assert.match(rows.find((row) => row.category === "Wand")?.formula ?? "", /2 × \(5,00 m \+ 4,00 m\)/);

console.log("Insta360 geometry and VOB smoke checks passed.");

