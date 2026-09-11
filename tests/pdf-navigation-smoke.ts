import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const viewerSource = readFileSync(new URL("../components/measure-app.tsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

assert.match(viewerSource, /\["touch", "mouse", "pen"\]\.includes\(event\.pointerType\)/, "Plan-Navigation muss Maus, Touch und Stift unterstützen.");
assert.match(viewerSource, /event\.currentTarget\.scrollLeft = gesture\.scrollLeft/, "Ziehen muss den Grundriss waagerecht verschieben.");
assert.match(viewerSource, /event\.currentTarget\.scrollTop = gesture\.scrollTop/, "Ziehen muss den Grundriss senkrecht verschieben.");
assert.match(viewerSource, /event\.ctrlKey \|\| event\.metaKey/, "Mausrad-Zoom muss Strg und Befehlstaste unterstützen.");
assert.match(viewerSource, /aria-label="Ermittelte Maße, scrollbar"/, "Die rechte Maßliste muss als eigener Scrollbereich ausgezeichnet sein.");
assert.ok((viewerSource.match(/measurementIsVisibleOnPlan\(measurement, selectedId\)/g) ?? []).length >= 2, "Sichere und unsichere Raumkonturen dürfen nur nach Auswahl in der Seitenliste erscheinen.");
assert.match(viewerSource, /if \(measurement\.page !== pageNumber\) changePage\(measurement\.page\)/, "Ein Raumklick muss automatisch auf die zugehörige PDF-Seite wechseln.");
assert.match(viewerSource, /setSelectedId\(null\);\s*setExpandedId\(null\);\s*setListMode\("positions"\)/, "Nach dem Auto-Aufmaß darf kein Raum ungefragt den Grundriss überdecken.");
assert.match(viewerSource, /function RoomOutlinePreview/, "Ein angeklickter Raum muss seinen berechneten Umriss sofort in einer Vorschau zeigen.");
assert.match(viewerSource, /measurement\.proCapture\?\.sketchPoints/, "Die Umrissvorschau muss die tatsächlich erkannte Freihandskizzenkontur verwenden.");
assert.match(viewerSource, /selected\?\.kind === "room"[\s\S]*?<RoomOutlinePreview measurement=\{selected\}/, "Die Umrissvorschau muss unmittelbar an die aktuelle Raumauswahl gekoppelt sein.");
assert.match(viewerSource, /Kein belastbarer Umriss[\s\S]*?keine Form erfunden oder geschätzt/, "Ohne bestätigte Kontur darf die Vorschau keinen Raumumriss erfinden.");
assert.match(viewerSource, /measurement\.source === "auto"[\s\S]*?\["pdf-nrf", "pdf-dimensions", "pdf-scale"\][\s\S]*?Kontur korrigieren/, "Jeder automatisch erkannte PDF-Raum muss nach dem Anklicken korrigierbar sein.");
assert.match(viewerSource, /heightSource: detectedRoomHeight \? "pdf-room" : "project-default"/, "Automatisch erkannte und ersatzweise verwendete Raumhöhen müssen unterscheidbar gespeichert werden.");
assert.match(viewerSource, /type="file"[^>]*multiple[^>]*onChange=\{handleFile\}/, "Der Grundriss-Upload muss mehrere PDF-Dateien auf einmal annehmen.");
assert.match(viewerSource, /PdfLibDocument\.create\(\)[\s\S]*?copyPages\(source, source\.getPageIndices\(\)\)/, "Mehrere PDFs müssen in Auswahlreihenfolge zu einem Plansatz verbunden werden.");
assert.match(viewerSource, /beginGeometryDrag\(event, "outline"\)/, "Eine erkannte Raumkontur muss als Ganzes verschiebbar sein.");
assert.match(viewerSource, /beginGeometryDrag\(event, "vertex", index\)/, "Einzelne Eckpunkte einer Raumkontur müssen verschiebbar sein.");

assert.match(stylesheet, /\.results-panel \{[^}]*min-height: 0;[^}]*overflow: hidden;/, "Die rechte Spalte muss auf die verfügbare Ansichtshöhe begrenzt sein.");
assert.match(stylesheet, /\.results-list, \.totals-view \{[^}]*min-height: 0;[^}]*overflow-y: auto;/, "Positionen und Summen brauchen eigene vertikale Scrollbereiche.");
assert.match(stylesheet, /\.selected-room-outline-layer \{[^}]*position: sticky;[^}]*pointer-events: none;/, "Die Umrissvorschau muss über dem Plan sichtbar bleiben, ohne die Planbedienung zu blockieren.");
assert.match(stylesheet, /@media \(max-width: 920px\)[\s\S]*?body \{ overflow: hidden; \}/, "Browser-Skalierung darf nicht die gesamte Arbeitsoberfläche wegscrollen.");
assert.match(stylesheet, /@media \(max-width: 920px\)[\s\S]*?\.floating-zoom-controls \{ left: 12px; right: auto; \}/, "Zoomtasten müssen neben der eingeblendeten Maßliste sichtbar bleiben.");
assert.match(stylesheet, /\.geometry-editor polygon \{[^}]*cursor: move;/, "Die verschiebbare Kontur muss als solche bedienbar sein.");

console.log(JSON.stringify({ mousePan: true, wheelZoom: true, planScroll: true, resultsScroll: true, selectedRoomOutline: true }));
