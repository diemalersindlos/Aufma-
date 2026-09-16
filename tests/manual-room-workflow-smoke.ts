import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { polygonPixels, polylinePixels } from "../lib/measurements";

const viewerSource = readFileSync(new URL("../components/measure-app.tsx", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");

assert.doesNotMatch(viewerSource, /detectEnclosedRooms|runAutoMeasurement|Automatische Raumerkennung|Auto-Aufmaß aus PDF/, "Die automatische PDF-Raumerkennung darf nicht mehr im Programmablauf vorhanden sein.");
assert.doesNotMatch(packageSource, /pdf-room-matching-smoke/, "Der entfernte Raumdetektor darf nicht mehr von der Testsuite ausgeführt werden.");
assert.match(viewerSource, /Raum einzeichnen/, "Das manuelle Raumwerkzeug muss im PDF direkt erreichbar sein.");
assert.match(viewerSource, /areaSource: kind === "room" \? "pdf-manual"/, "Manuell eingezeichnete Räume müssen eindeutig als solche gespeichert werden.");
assert.match(viewerSource, /Raumkontur aus \{points\.length\} Eckpunkten/, "Der Raumdialog muss die eingezeichnete Kontur bestätigen.");
assert.match(viewerSource, /Vorschau des Raumaufmaßes/, "Vor dem Speichern muss das fertige Raumaufmaß sichtbar sein.");
assert.match(viewerSource, /Kontur bearbeiten/, "Gespeicherte Raumkonturen müssen weiterhin verschiebbar und korrigierbar sein.");

const points = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
const scale = 0.01;
assert.equal(polygonPixels(points) * scale * scale, 12);
assert.equal(polylinePixels(points, true) * scale, 14);

console.log(JSON.stringify({ manualRoomDrawing: true, instantTakeoffPreview: true, automaticRoomDetectionRemoved: true }));
