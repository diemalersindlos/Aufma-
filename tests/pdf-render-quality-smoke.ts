import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculatePdfRenderMetrics } from "../lib/pdf-render-quality";

const normal = calculatePdfRenderMetrics({ baseWidth: 1000, baseHeight: 1400, zoom: 2, devicePixelRatio: 2, compact: false });
assert.equal(normal.cssWidth, 2000);
assert.equal(normal.cssHeight, 2800);
assert.equal(normal.outputScale, 2);
assert.equal(normal.bitmapWidth, 4000);
assert.equal(normal.bitmapHeight, 5600);

const enlarged = calculatePdfRenderMetrics({ baseWidth: 1180, baseHeight: 1669, zoom: 4, devicePixelRatio: 2, compact: false });
assert.equal(enlarged.cssWidth, 4720);
assert.equal(enlarged.cssHeight, 6676);
assert.ok(enlarged.outputScale >= 1, "Auch bei 400 % muss mindestens ein Bildpunkt je sichtbarem CSS-Pixel gerendert werden.");
assert.ok(enlarged.bitmapWidth <= 8192 && enlarged.bitmapHeight <= 8192, "Die Canvas-Grenzen müssen eingehalten werden.");

const mobile = calculatePdfRenderMetrics({ baseWidth: 760, baseHeight: 1075, zoom: 4, devicePixelRatio: 3, compact: true });
assert.ok(mobile.outputScale >= 1, "Die mobile 400-Prozent-Darstellung muss mindestens in sichtbarer Auflösung gerendert werden.");
assert.ok(mobile.bitmapWidth <= 6144 && mobile.bitmapHeight <= 6144, "Die mobilen Canvas-Grenzen müssen eingehalten werden.");

const viewerSource = readFileSync(new URL("../components/measure-app.tsx", import.meta.url), "utf8");
assert.match(viewerSource, /transform: \[scaleX, 0, 0, scaleY, 0, 0\]/, "PDF.js muss die hochauflösende Ausgabetransformation direkt erhalten.");
assert.doesNotMatch(viewerSource, /transform: `scale\(\$\{zoom\}\)`/, "Der PDF-Plan darf nicht mehr als bereits gerasterte Ebene hochskaliert werden.");
assert.match(viewerSource, /highPrecisionAnalysisWidth = window\.innerWidth >= 900 \? 1600 : 1180/, "Die Desktop-Raumerkennung muss den Plan mit erhöhter Analyseauflösung auswerten.");
assert.doesNotMatch(viewerSource, /Math\.min\(1, 1000 \/ fullViewport\.width\)/, "Die Raumerkennung darf digitale Pläne nicht mehr pauschal auf 1000 Pixel verkleinern.");

console.log(JSON.stringify({ normal, enlarged, mobile }));
