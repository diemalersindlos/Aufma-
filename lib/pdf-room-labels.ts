import type { DetectedRoom } from "@/lib/auto-detect";
import type { Point } from "@/lib/measurements";
import type { PdfTextItemLike, PdfViewportLike } from "@/lib/pdf-plan-analysis";

type PdfTextPage = {
  getTextContent?: () => Promise<{ items: PdfTextItemLike[] }>;
};

export type PdfRoomLabel = {
  name: string;
  reference?: string;
  area: number;
  anchor: Point;
};

export type MatchedPdfRoom = PdfRoomLabel & {
  points: Point[];
  perimeter?: number;
  confidence: number;
  geometryStatus: "matched" | "uncertain" | "missing";
  geometryReason: string;
  areaRatio?: number;
};

export type PdfRoomCandidateScore = {
  matched: number;
  uncertain: number;
  missing: number;
  areaError: number;
  confidence: number;
};

const MIN_GEOMETRY_CONFIDENCE = 0.7;
const MIN_AREA_RATIO = 0.8;
const MAX_AREA_RATIO = 1.2;

function multiplyAffine(left: number[], right: number[]) {
  const [a, b, c, d, e, f] = left;
  const [g, h, i, j, k, l] = right;
  return [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ];
}

function polygonArea(points: Point[]) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function polygonPerimeter(points: Point[]) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    const intersects = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 0.0001) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function cleanName(parts: string[]) {
  return parts.join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*-\s*/g, "-")
    .trim();
}

export function extractPdfRoomLabelsFromItems(items: PdfTextItemLike[], viewport: PdfViewportLike) {
  if (!viewport.transform) return [];
  const viewportScale = viewport.scale ?? Math.hypot(viewport.transform[0] ?? 1, viewport.transform[1] ?? 0);
  const records = items.map((item, index) => {
    const transform = item.transform?.length === 6
      ? multiplyAffine(viewport.transform!, item.transform)
      : null;
    return {
      index,
      item,
      str: item.str?.trim() ?? "",
      pdfX: item.transform?.[4] ?? 0,
      pdfY: item.transform?.[5] ?? 0,
      canvasX: transform?.[4] ?? 0,
      canvasY: transform?.[5] ?? 0,
      fontHeight: transform ? Math.max(1, Math.hypot(transform[2], transform[3])) : 1,
      canvasWidth: (item.width ?? 0) * viewportScale,
    };
  });

  const labels: PdfRoomLabel[] = [];
  records.forEach((record) => {
    if (!/^NRF\s*:/i.test(record.str)) return;
    const sameLine = records
      .filter((candidate) => (
        candidate.str
        && Math.abs(candidate.pdfY - record.pdfY) <= 1.5
        && candidate.pdfX >= record.pdfX - 2
        && candidate.pdfX <= record.pdfX + 150
      ))
      .sort((left, right) => left.pdfX - right.pdfX)
      .map((candidate) => candidate.str)
      .join(" ");
    const areaMatch = sameLine.match(/NRF\s*:\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (!areaMatch) return;
    const area = Number(areaMatch[1].replace(",", "."));
    if (!Number.isFinite(area) || area <= 0 || area > 9999) return;

    const nameParts: string[] = [];
    let reference = "";
    for (let index = record.index - 1; index >= Math.max(0, record.index - 10); index -= 1) {
      const candidate = records[index];
      if (!candidate.str) continue;
      const deltaY = candidate.pdfY - record.pdfY;
      if (deltaY < 3 || deltaY > 34) continue;
      if (Math.abs(candidate.pdfX - record.pdfX) > 12) continue;
      if (/^\d{2}\.\d{2}$/.test(candidate.str)) {
        reference = candidate.str;
        continue;
      }
      if (/^(?:NRF:?|m²?|2|ca\.:?)$/i.test(candidate.str)) continue;
      nameParts.unshift(candidate.str);
    }

    const name = cleanName(nameParts) || `Raum ${labels.length + 1}`;
    labels.push({
      name,
      reference: reference || undefined,
      area,
      anchor: {
        x: record.canvasX + Math.max(record.canvasWidth, record.fontHeight * 5) / 2,
        y: record.canvasY - record.fontHeight * 1.5,
      },
    });
  });

  return labels.filter((label, index) => !labels.some((other, otherIndex) => (
    otherIndex < index
    && other.name === label.name
    && Math.abs(other.area - label.area) < 0.001
    && Math.hypot(other.anchor.x - label.anchor.x, other.anchor.y - label.anchor.y) < 4
  )));
}

export async function extractPdfRoomLabels(page: PdfTextPage, viewport: PdfViewportLike) {
  if (!page.getTextContent) return [];
  const content = await page.getTextContent();
  return extractPdfRoomLabelsFromItems(content.items, viewport);
}

export function matchPdfRoomsToGeometry(
  labels: PdfRoomLabel[],
  candidates: DetectedRoom[],
  metersPerPixel: number,
) {
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
    return labels.map((label) => ({
      ...label,
      points: [],
      confidence: 0,
      geometryStatus: "missing",
      geometryReason: "Maßstab für die Konturprüfung fehlt.",
    } satisfies MatchedPdfRoom));
  }

  const containingByLabel = labels.map((label) => candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.points.length >= 3 && pointInPolygon(label.anchor, candidate.points))
    .map(({ index }) => index));
  const labelCountByCandidate = candidates.map((_, candidateIndex) => containingByLabel
    .reduce((count, candidateIndexes) => count + (candidateIndexes.includes(candidateIndex) ? 1 : 0), 0));

  const possiblePairs = labels.flatMap((label, labelIndex) => containingByLabel[labelIndex].flatMap((candidateIndex) => {
    const candidate = candidates[candidateIndex];
    const areaMeters = polygonArea(candidate.points) * metersPerPixel ** 2;
    const areaRatio = areaMeters / label.area;
    if (
      labelCountByCandidate[candidateIndex] !== 1
      || candidate.confidence < MIN_GEOMETRY_CONFIDENCE
      || areaRatio < MIN_AREA_RATIO
      || areaRatio > MAX_AREA_RATIO
    ) return [];
    return [{
      labelIndex,
      candidateIndex,
      areaRatio,
      score: Math.abs(Math.log(areaRatio)) + (1 - candidate.confidence) * 0.3,
    }];
  })).sort((left, right) => left.score - right.score);

  const assignedLabels = new Map<number, { candidateIndex: number; areaRatio: number }>();
  const assignedCandidates = new Set<number>();
  possiblePairs.forEach((pair) => {
    if (assignedLabels.has(pair.labelIndex) || assignedCandidates.has(pair.candidateIndex)) return;
    assignedLabels.set(pair.labelIndex, { candidateIndex: pair.candidateIndex, areaRatio: pair.areaRatio });
    assignedCandidates.add(pair.candidateIndex);
  });

  return labels.map((label, labelIndex) => {
    const assigned = assignedLabels.get(labelIndex);
    if (assigned) {
      const candidate = candidates[assigned.candidateIndex];
      return {
        ...label,
        // The detected contour is deliberately kept unchanged. Scaling it to
        // the NRF value invents wall lengths and was the cause of oversized,
        // misplaced polygons in real plans.
        points: candidate.points.map((point) => ({ ...point })),
        perimeter: polygonPerimeter(candidate.points) * metersPerPixel,
        confidence: candidate.confidence,
        geometryStatus: "matched",
        geometryReason: "Raumstempel liegt in genau einer flächenplausiblen, geschlossenen Kontur.",
        areaRatio: assigned.areaRatio,
      } satisfies MatchedPdfRoom;
    }

    const containing = containingByLabel[labelIndex];
    if (!containing.length) {
      return {
        ...label,
        points: [],
        confidence: 0.35,
        geometryStatus: "missing",
        geometryReason: "Am Raumstempel wurde keine eindeutig geschlossene Raumkontur gefunden.",
      } satisfies MatchedPdfRoom;
    }

    const containsMultipleLabels = containing.some((candidateIndex) => labelCountByCandidate[candidateIndex] > 1);
    const hasAreaMismatch = containing.some((candidateIndex) => {
      const areaRatio = polygonArea(candidates[candidateIndex].points) * metersPerPixel ** 2 / label.area;
      return areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO;
    });
    const bestConfidence = Math.max(...containing.map((candidateIndex) => candidates[candidateIndex].confidence));
    const geometryReason = containsMultipleLabels
      ? "Die gefundene Kontur umfasst mehrere Raumstempel und ist deshalb nicht eindeutig."
      : hasAreaMismatch
        ? "Die gefundene Kontur weicht zu stark von der ausgewiesenen NRF-Fläche ab."
        : "Die gefundene Kontur erreicht nicht die erforderliche Erkennungssicherheit.";
    return {
      ...label,
      points: [],
      confidence: Math.min(0.69, bestConfidence),
      geometryStatus: "uncertain",
      geometryReason,
    } satisfies MatchedPdfRoom;
  });
}

export function scorePdfRoomCandidateSet(
  labels: PdfRoomLabel[],
  candidates: DetectedRoom[],
  metersPerPixel: number,
): PdfRoomCandidateScore {
  const rooms = matchPdfRoomsToGeometry(labels, candidates, metersPerPixel);
  const matchedRooms = rooms.filter((room) => room.geometryStatus === "matched");
  return {
    matched: matchedRooms.length,
    uncertain: rooms.filter((room) => room.geometryStatus === "uncertain").length,
    missing: rooms.filter((room) => room.geometryStatus === "missing").length,
    areaError: matchedRooms.reduce((sum, room) => sum + Math.abs(Math.log(room.areaRatio ?? 1)), 0),
    confidence: matchedRooms.reduce((sum, room) => sum + room.confidence, 0),
  };
}

export function selectBestPdfRoomCandidateSet(
  labels: PdfRoomLabel[],
  candidateSets: DetectedRoom[][],
  metersPerPixel: number,
) {
  return candidateSets.map((candidates) => ({
    candidates,
    score: scorePdfRoomCandidateSet(labels, candidates, metersPerPixel),
  })).sort((left, right) => (
    right.score.matched - left.score.matched
    || left.score.uncertain - right.score.uncertain
    || left.score.areaError - right.score.areaError
    || right.score.confidence - left.score.confidence
  ))[0]?.candidates ?? [];
}

/**
 * Door gaps and thin CAD walls close differently from room to room. Combining
 * the independently detected closure variants lets every room use its best
 * plausible contour instead of forcing the whole page to use one variant.
 */
export function combinePdfRoomCandidateSets(candidateSets: DetectedRoom[][]) {
  return candidateSets.flat();
}
