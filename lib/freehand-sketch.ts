import { createId, formatNumber, type Measurement, type Point } from "@/lib/measurements";

export type SketchShape = "rectangle" | "l-shape" | "orthogonal" | "polygon";

export type SketchSide = {
  index: number;
  start: Point;
  end: Point;
  center: Point;
  pixels: number;
};

export type RecognizedSketch = {
  points: Point[];
  sides: SketchSide[];
  shape: SketchShape;
  label: string;
  confidence: number;
  pixelArea: number;
  pixelPerimeter: number;
  automaticallyClosed: boolean;
  automaticallyStraightened: boolean;
  crossingsRepaired: number;
  manuallyCorrected: boolean;
};

export type SketchInputMethod = "apple-pencil" | "touch" | "mouse";

export type SketchRoomInput = {
  name: string;
  recognition: RecognizedSketch;
  referenceSide: number;
  referenceMeters: number;
  height: number;
  quantity: number;
  includeWalls: boolean;
  includeCeiling: boolean;
  includeFloor: boolean;
  includeSkirting: boolean;
  exactArea?: number;
  exactPerimeter?: number;
  inputMethod?: SketchInputMethod;
};

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointSegmentDistance(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return distance(point, start);
  const position = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + position * dx, y: start.y + position * dy });
}

function simplifyOpen(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  let furthestIndex = 0;
  let furthestDistance = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const currentDistance = pointSegmentDistance(points[index], points[0], points.at(-1)!);
    if (currentDistance > furthestDistance) {
      furthestDistance = currentDistance;
      furthestIndex = index;
    }
  }
  if (furthestDistance <= tolerance) return [points[0], points.at(-1)!];
  const left = simplifyOpen(points.slice(0, furthestIndex + 1), tolerance);
  const right = simplifyOpen(points.slice(furthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function simplifyClosed(points: Point[], tolerance: number) {
  let split = 1;
  let maximum = 0;
  for (let index = 1; index < points.length; index += 1) {
    const current = distance(points[0], points[index]);
    if (current > maximum) {
      maximum = current;
      split = index;
    }
  }
  const firstHalf = simplifyOpen(points.slice(0, split + 1), tolerance);
  const secondHalf = simplifyOpen([...points.slice(split), points[0]], tolerance);
  return [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
}

function removeNearlyCollinear(points: Point[]) {
  let current = [...points];
  let changed = true;
  while (changed && current.length > 3) {
    changed = false;
    const next = current.filter((point, index) => {
      const previous = current[(index - 1 + current.length) % current.length];
      const following = current[(index + 1) % current.length];
      const first = { x: point.x - previous.x, y: point.y - previous.y };
      const second = { x: following.x - point.x, y: following.y - point.y };
      const firstLength = Math.hypot(first.x, first.y);
      const secondLength = Math.hypot(second.x, second.y);
      if (firstLength < 3 || secondLength < 3) {
        changed = true;
        return false;
      }
      const cosine = Math.max(-1, Math.min(1, (first.x * second.x + first.y * second.y) / (firstLength * secondLength)));
      const turn = Math.acos(cosine) * 180 / Math.PI;
      if (turn < 17) {
        changed = true;
        return false;
      }
      return true;
    });
    current = next;
  }
  return current;
}

function polygonArea(points: Point[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    sum += points[index].x * next.y - next.x * points[index].y;
  }
  return Math.abs(sum) / 2;
}

function polygonPerimeter(points: Point[]) {
  return points.reduce((sum, point, index) => sum + distance(point, points[(index + 1) % points.length]), 0);
}

function orientation(a: Point, b: Point, c: Point) {
  return Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  return orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);
}

function firstSelfIntersection(points: Point[]) {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) return { first, second };
    }
  }
  return null;
}

/**
 * Removes crossed edges with a 2-opt untangling pass. This retains all detected
 * corners while changing only their traversal order, so a crossed rectangle or
 * room outline becomes a simple, measurable polygon instead of being rejected.
 */
function untangleSelfIntersections(points: Point[]) {
  let current = [...points];
  let crossingsRepaired = 0;
  const maximumPasses = Math.max(8, current.length * current.length);
  for (let pass = 0; pass < maximumPasses; pass += 1) {
    const crossing = firstSelfIntersection(current);
    if (!crossing) return { points: current, crossingsRepaired, complete: true };
    current = [
      ...current.slice(0, crossing.first + 1),
      ...current.slice(crossing.first + 1, crossing.second + 1).reverse(),
      ...current.slice(crossing.second + 1),
    ];
    crossingsRepaired += 1;
  }
  return { points: current, crossingsRepaired, complete: !firstSelfIntersection(current) };
}

function angleDifference(left: number, right: number) {
  let difference = Math.abs(left - right) % Math.PI;
  if (difference > Math.PI / 2) difference = Math.PI - difference;
  return Math.abs(difference);
}

function orthogonalScore(points: Point[]) {
  const segments = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return { angle: Math.atan2(next.y - point.y, next.x - point.x), length: distance(point, next) };
  });
  const reference = [...segments].sort((left, right) => right.length - left.length)[0]?.angle ?? 0;
  const tolerance = 18 * Math.PI / 180;
  const aligned = segments.filter((segment) => {
    const parallel = angleDifference(segment.angle, reference);
    const perpendicular = Math.abs(parallel - Math.PI / 2);
    return Math.min(parallel, perpendicular) <= tolerance;
  }).length;
  return { score: aligned / Math.max(1, segments.length), reference };
}

function rectangleFrom(points: Point[], angle: number) {
  const cosine = Math.cos(-angle);
  const sine = Math.sin(-angle);
  const rotated = points.map((point) => ({ x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine }));
  const minX = Math.min(...rotated.map((point) => point.x));
  const maxX = Math.max(...rotated.map((point) => point.x));
  const minY = Math.min(...rotated.map((point) => point.y));
  const maxY = Math.max(...rotated.map((point) => point.y));
  const corners = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
  const backCosine = Math.cos(angle);
  const backSine = Math.sin(angle);
  return corners.map((point) => ({ x: point.x * backCosine - point.y * backSine, y: point.x * backSine + point.y * backCosine }));
}

/**
 * Fits every edge of an orthogonal room to one of the two dominant room axes.
 * The line levels are averaged from the hand-drawn endpoints and intersected
 * again afterwards. This keeps L- and multi-corner rooms recognizable while
 * replacing the wobbly stroke with a closed, straight room polygon.
 */
function straightenOrthogonalPoints(points: Point[], angle: number) {
  const cosine = Math.cos(-angle);
  const sine = Math.sin(-angle);
  const rotated = points.map((point) => ({
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  }));
  const directions = rotated.map((point, index) => {
    const next = rotated[(index + 1) % rotated.length];
    return Math.abs(next.x - point.x) >= Math.abs(next.y - point.y) ? "horizontal" as const : "vertical" as const;
  });

  const alternates = directions.every((direction, index) => direction !== directions[(index + 1) % directions.length]);
  if (!alternates) return { points, applied: false };

  const levels = rotated.map((point, index) => {
    const next = rotated[(index + 1) % rotated.length];
    return directions[index] === "horizontal" ? (point.y + next.y) / 2 : (point.x + next.x) / 2;
  });
  const straightenedRotated = rotated.map((_, index) => {
    const incoming = (index - 1 + rotated.length) % rotated.length;
    const outgoing = index;
    const x = directions[incoming] === "vertical" ? levels[incoming] : levels[outgoing];
    const y = directions[incoming] === "horizontal" ? levels[incoming] : levels[outgoing];
    return { x, y };
  });
  const backCosine = Math.cos(angle);
  const backSine = Math.sin(angle);
  const straightened = straightenedRotated.map((point) => ({
    x: point.x * backCosine - point.y * backSine,
    y: point.x * backSine + point.y * backCosine,
  }));
  const diagonal = Math.hypot(
    Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)),
    Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)),
  );
  const maximumShift = Math.max(...points.map((point, index) => distance(point, straightened[index])));
  const valid = !firstSelfIntersection(straightened)
    && polygonArea(straightened) >= 500
    && polygonPerimeter(straightened) >= 80
    && maximumShift <= Math.max(14, diagonal * 0.12);
  return valid ? { points: straightened, applied: true } : { points, applied: false };
}

function sides(points: Point[]): SketchSide[] {
  return points.map((point, index) => {
    const end = points[(index + 1) % points.length];
    return {
      index,
      start: point,
      end,
      center: { x: (point.x + end.x) / 2, y: (point.y + end.y) / 2 },
      pixels: distance(point, end),
    };
  });
}

export function recognizeFreehandSketch(rawPoints: Point[]): RecognizedSketch {
  const filtered = rawPoints.filter((point, index) => index === 0 || distance(point, rawPoints[index - 1]) >= 1.5);
  if (filtered.length < 12) throw new Error("Bitte den Raum mit einer zusammenhängenden Linie vollständig zeichnen.");
  const minX = Math.min(...filtered.map((point) => point.x));
  const maxX = Math.max(...filtered.map((point) => point.x));
  const minY = Math.min(...filtered.map((point) => point.y));
  const maxY = Math.max(...filtered.map((point) => point.y));
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  if (diagonal < 55) throw new Error("Die Skizze ist zu klein. Bitte den Zeichenbereich besser ausnutzen.");
  const closureDistance = distance(filtered[0], filtered.at(-1)!);
  const automaticallyClosed = closureDistance > diagonal * 0.08;
  if (closureDistance > diagonal * 0.34) throw new Error("Anfang und Ende der Raumlinie liegen zu weit auseinander. Bitte die Kontur möglichst schließen.");

  let simplified = removeNearlyCollinear(simplifyClosed(filtered, Math.max(4, diagonal * 0.025)));
  if (simplified.length > 12) simplified = removeNearlyCollinear(simplifyClosed(filtered, Math.max(7, diagonal * 0.045)));
  if (simplified.length < 3 || simplified.length > 14) throw new Error("Die Raumform konnte nicht eindeutig erkannt werden. Bitte mit klareren Ecken neu zeichnen.");
  const untangled = untangleSelfIntersections(simplified);
  simplified = removeNearlyCollinear(untangled.points);
  if (!untangled.complete || firstSelfIntersection(simplified)) throw new Error("Die gekreuzte Raumlinie konnte nicht eindeutig aufgelöst werden. Bitte die Kontur mit klareren Ecken wiederholen.");

  const orthogonal = orthogonalScore(simplified);
  let shape: SketchShape = "polygon";
  let label = `${simplified.length}-Eck-Raum`;
  let automaticallyStraightened = false;
  if (simplified.length === 4 && orthogonal.score >= 0.75) {
    simplified = rectangleFrom(simplified, orthogonal.reference);
    automaticallyStraightened = true;
    shape = "rectangle";
    label = "Rechteckiger Raum";
  } else if (simplified.length === 6 && orthogonal.score >= 0.72) {
    const straightened = straightenOrthogonalPoints(simplified, orthogonal.reference);
    simplified = straightened.points;
    automaticallyStraightened = straightened.applied;
    shape = "l-shape";
    label = "L-förmiger Raum";
  } else if (orthogonal.score >= 0.72) {
    const straightened = straightenOrthogonalPoints(simplified, orthogonal.reference);
    simplified = straightened.points;
    automaticallyStraightened = straightened.applied;
    shape = "orthogonal";
    label = `Rechtwinkliger ${simplified.length}-Eck-Raum`;
  }

  const pixelArea = polygonArea(simplified);
  const pixelPerimeter = polygonPerimeter(simplified);
  if (pixelArea < 900 || pixelPerimeter < 100) throw new Error("Die erkannte Raumfläche ist zu klein oder unplausibel.");
  const closureScore = Math.max(0, 1 - closureDistance / (diagonal * 0.34));
  const baseConfidence = 0.58 + closureScore * 0.18 + orthogonal.score * 0.16 + (simplified.length <= 8 ? 0.08 : 0);
  const confidence = Math.max(0.55, Math.min(0.99, baseConfidence - Math.min(0.24, untangled.crossingsRepaired * 0.06)));
  return { points: simplified, sides: sides(simplified), shape, label, confidence, pixelArea, pixelPerimeter, automaticallyClosed, automaticallyStraightened, crossingsRepaired: untangled.crossingsRepaired, manuallyCorrected: false };
}

export function updateRecognizedSketchPoints(recognition: RecognizedSketch, correctedPoints: Point[]): RecognizedSketch {
  if (correctedPoints.length < 3 || correctedPoints.length > 14) throw new Error("Eine korrigierte Raumkontur benötigt 3 bis 14 Eckpunkte.");
  const bounded = correctedPoints.map((point) => ({
    x: Math.max(0, Math.min(360, point.x)),
    y: Math.max(0, Math.min(270, point.y)),
  }));
  const untangled = untangleSelfIntersections(bounded);
  if (!untangled.complete || firstSelfIntersection(untangled.points)) throw new Error("Die korrigierte Kontur überschneidet sich noch. Bitte die markierten Ecken weiter auseinanderziehen.");
  const pixelArea = polygonArea(untangled.points);
  const pixelPerimeter = polygonPerimeter(untangled.points);
  if (pixelArea < 500 || pixelPerimeter < 80) throw new Error("Die korrigierte Raumform ist zu klein oder unplausibel.");

  const orthogonal = orthogonalScore(untangled.points);
  let shape: SketchShape = "polygon";
  let label = `${untangled.points.length}-Eck-Raum`;
  if (untangled.points.length === 4 && orthogonal.score >= 0.75) {
    shape = "rectangle";
    label = "Rechteckiger Raum";
  } else if (untangled.points.length === 6 && orthogonal.score >= 0.72) {
    shape = "l-shape";
    label = "L-förmiger Raum";
  } else if (orthogonal.score >= 0.72) {
    shape = "orthogonal";
    label = `Rechtwinkliger ${untangled.points.length}-Eck-Raum`;
  }

  return {
    ...recognition,
    points: untangled.points,
    sides: sides(untangled.points),
    shape,
    label,
    pixelArea,
    pixelPerimeter,
    confidence: Math.max(0.65, Math.min(0.95, recognition.confidence - 0.02)),
    automaticallyStraightened: false,
    crossingsRepaired: recognition.crossingsRepaired + untangled.crossingsRepaired,
    manuallyCorrected: true,
  };
}

export function calculateSketchRoom(input: Pick<SketchRoomInput, "recognition" | "referenceSide" | "referenceMeters" | "exactArea" | "exactPerimeter">) {
  const side = input.recognition.sides[input.referenceSide];
  if (!side || !Number.isFinite(input.referenceMeters) || input.referenceMeters <= 0) {
    return { area: 0, perimeter: 0, metersPerPixel: 0 };
  }
  const metersPerPixel = input.referenceMeters / side.pixels;
  const calculatedArea = input.recognition.pixelArea * metersPerPixel * metersPerPixel;
  const calculatedPerimeter = input.recognition.pixelPerimeter * metersPerPixel;
  const exactArea = Number.isFinite(input.exactArea) && (input.exactArea ?? 0) > 0 ? input.exactArea! : calculatedArea;
  const exactPerimeter = Number.isFinite(input.exactPerimeter) && (input.exactPerimeter ?? 0) > 0 ? input.exactPerimeter! : calculatedPerimeter;
  return { area: exactArea, perimeter: exactPerimeter, metersPerPixel };
}

export function buildSketchRoomMeasurement(input: SketchRoomInput, page: number, color: string): Measurement {
  const result = calculateSketchRoom(input);
  const height = Number.isFinite(input.height) && input.height > 0 ? input.height : 2.5;
  const quantity = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 1;
  const exactSuffix = (input.exactArea ?? 0) > 0 || (input.exactPerimeter ?? 0) > 0 ? " · Kontrollwerte übernommen" : "";
  const crossingSuffix = input.recognition.crossingsRepaired > 0 ? ` · ${input.recognition.crossingsRepaired} Kreuzung${input.recognition.crossingsRepaired === 1 ? "" : "en"} bereinigt` : "";
  const straightenedSuffix = input.recognition.automaticallyStraightened ? " · Kontur automatisch begradigt" : "";
  const correctionSuffix = input.recognition.manuallyCorrected ? " · Kontur manuell korrigiert" : "";
  const inputSuffix = input.inputMethod === "apple-pencil" ? " · Apple Pencil" : "";
  const formula = `${input.recognition.label} · S${input.referenceSide + 1} = ${formatNumber(input.referenceMeters)} m${straightenedSuffix}${crossingSuffix}${correctionSuffix}${inputSuffix}${exactSuffix}`;
  return {
    id: createId("sketch-room"),
    kind: "room",
    name: input.name.trim() || "Skizzenraum",
    page: Math.max(1, Math.trunc(page) || 1),
    points: [],
    color,
    height,
    heightSource: "manual",
    heightNote: "Raumhöhe bei der Skizzenerfassung eingetragen.",
    quantity,
    factor: 1,
    includeWalls: input.includeWalls,
    includeCeiling: input.includeCeiling,
    includeFloor: input.includeFloor,
    includeSkirting: input.includeSkirting,
    openings: [],
    source: "auto",
    areaOverride: result.area,
    perimeterOverride: result.perimeter,
    areaSource: "freehand-sketch",
    confidence: input.recognition.confidence,
    proCapture: {
      type: "sketch",
      label: `Freihandskizze · ${input.recognition.label}`,
      formula,
      capturedAt: new Date().toISOString(),
      shape: input.recognition.shape,
      height,
      referenceSide: input.referenceSide,
      referenceMeters: input.referenceMeters,
      metersPerPixel: result.metersPerPixel,
      sketchPoints: input.recognition.points,
      confidence: input.recognition.confidence,
      automaticallyStraightened: input.recognition.automaticallyStraightened,
      crossingsRepaired: input.recognition.crossingsRepaired,
      manuallyCorrected: input.recognition.manuallyCorrected,
      inputMethod: input.inputMethod,
    },
    visible: true,
    createdAt: new Date().toISOString(),
  };
}
