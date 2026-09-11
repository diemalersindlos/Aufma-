import type { DetectedRoom } from "@/lib/auto-detect";
import type { Point } from "@/lib/measurements";

export type PdfTextItemLike = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

export type PdfViewportLike = {
  scale?: number;
  transform?: number[];
};

export type PdfPageKind = "Grundriss" | "Schnitt" | "Ansicht" | "Planseite";

export type PdfDimension = {
  value: number;
  raw: string;
  orientation: "horizontal" | "vertical";
  anchor: Point;
};

export type PdfRoomHeight = {
  value: number;
  raw: string;
  anchor: Point;
  confidence: "explicit" | "adjacent";
};

export type PdfRoomAnchor = {
  name: string;
  reference?: string;
  anchor: Point;
};

export type PdfDrawingAnchor = {
  kind: "Grundriss" | "Schnitt" | "Ansicht";
  label: string;
  anchor: Point;
};

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

/**
 * Finds the captions of individual drawings on a mixed architectural sheet.
 * Their positions let the room detector distinguish floor plans from nearby
 * elevations and sections instead of classifying the entire PDF page at once.
 */
export function extractPdfDrawingAnchors(items: PdfTextItemLike[], viewport: PdfViewportLike): PdfDrawingAnchor[] {
  if (!viewport.transform) return [];
  const scale = viewport.scale ?? 1;
  const anchors = items.flatMap((item) => {
    const label = item.str?.replace(/\s+/g, " ").trim() ?? "";
    if (!label || !item.transform) return [];
    const kind = /\bgrundriss\b/i.test(label)
      ? "Grundriss" as const
      : /\bschnitt\b/i.test(label)
        ? "Schnitt" as const
        : /\bansicht\b/i.test(label)
          ? "Ansicht" as const
          : null;
    if (!kind) return [];
    const transform = multiplyAffine(viewport.transform!, item.transform);
    return [{
      kind,
      label,
      anchor: {
        x: transform[4] + ((item.width ?? 0) * scale) / 2,
        y: transform[5],
      },
    } satisfies PdfDrawingAnchor];
  });

  return anchors.filter((anchor, index) => !anchors.some((other, otherIndex) => (
    otherIndex < index
    && other.kind === anchor.kind
    && Math.hypot(other.anchor.x - anchor.anchor.x, other.anchor.y - anchor.anchor.y) < 18
  )));
}

function mixedDrawingSheet(anchors: PdfDrawingAnchor[]) {
  return anchors.some((anchor) => anchor.kind === "Grundriss")
    && anchors.some((anchor) => anchor.kind !== "Grundriss");
}

/**
 * Architectural drawing captions normally sit below their drawing. A strong
 * penalty for captions above the candidate prevents a facade caption above a
 * lower floor plan from stealing the floor-plan rooms on a densely laid-out
 * mixed sheet.
 */
export function pointBelongsToFloorPlanRegion(
  point: Point,
  anchors: PdfDrawingAnchor[],
  width: number,
  height: number,
) {
  if (!mixedDrawingSheet(anchors)) return true;
  const pageAnchors = anchors.filter((anchor) => (
    anchor.anchor.x >= 0
    && anchor.anchor.x <= width
    && anchor.anchor.y >= 0
    && anchor.anchor.y <= height
  ));
  if (!mixedDrawingSheet(pageAnchors)) return true;

  const nearest = pageAnchors.map((anchor) => {
    const horizontal = Math.abs(anchor.anchor.x - point.x);
    const vertical = anchor.anchor.y - point.y;
    const captionAbovePenalty = vertical < -height * 0.025 ? Math.abs(vertical) * 2.6 : 0;
    return {
      anchor,
      horizontal,
      vertical: Math.abs(vertical),
      score: Math.hypot(horizontal, vertical * 0.72) + captionAbovePenalty,
    };
  }).sort((left, right) => left.score - right.score)[0];

  return Boolean(
    nearest
    && nearest.anchor.kind === "Grundriss"
    && nearest.horizontal <= width * 0.34
    && nearest.vertical <= height * 0.52
  );
}

export function filterRoomsToFloorPlanRegions<T extends DetectedRoom>(
  rooms: T[],
  anchors: PdfDrawingAnchor[],
  width: number,
  height: number,
) {
  if (!mixedDrawingSheet(anchors)) return rooms;
  return rooms.filter((room) => {
    const center = {
      x: room.points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, room.points.length),
      y: room.points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, room.points.length),
    };
    return pointBelongsToFloorPlanRegion(center, anchors, width, height);
  });
}

export function pdfText(items: PdfTextItemLike[]) {
  return items.map((item) => item.str ?? "").join(" ");
}

export function classifyPdfPage(items: PdfTextItemLike[]): PdfPageKind {
  const text = pdfText(items);
  if (/\bgrundriss\b|\bNRF\s*:/i.test(text)) return "Grundriss";
  const sectionMatches = text.match(/\bschnitt(?:e)?\b/gi)?.length ?? 0;
  const elevationMatches = text.match(/\bansicht(?:en)?\b/gi)?.length ?? 0;
  if (elevationMatches > sectionMatches) return "Ansicht";
  if (sectionMatches) return "Schnitt";
  if (elevationMatches) return "Ansicht";
  return "Planseite";
}

export function extractScaleDenominator(items: PdfTextItemLike[]) {
  const text = pdfText(items);
  const match = text.match(/(?:maßstab|massstab)[^\d]{0,12}1\s*[:/]\s*(\d{1,4})/i)
    ?? text.match(/\b1\s*[:/]\s*(\d{1,4})\b/);
  const denominator = match ? Number(match[1]) : 0;
  return denominator >= 1 && denominator <= 9999 ? denominator : null;
}

function normalizeAngle(angle: number) {
  let normalized = angle % Math.PI;
  if (normalized < 0) normalized += Math.PI;
  return normalized;
}

/**
 * Reads architectural dimension text such as 3,45 or 17,33⁵. Area labels,
 * room references and diagonal elevation annotations are intentionally
 * discarded. The resulting values are used to validate and snap raster room
 * geometry to the stated plan dimensions.
 */
export function extractPdfDimensions(items: PdfTextItemLike[], viewport: PdfViewportLike): PdfDimension[] {
  if (!viewport.transform) return [];
  const records = items.map((item, index) => ({
    index,
    item,
    str: item.str?.trim() ?? "",
    x: item.transform?.[4] ?? 0,
    y: item.transform?.[5] ?? 0,
    fontSize: item.transform ? Math.max(Math.hypot(item.transform[0], item.transform[1]), Math.hypot(item.transform[2], item.transform[3])) : 0,
  }));

  const dimensions: PdfDimension[] = [];
  records.forEach((record) => {
    if (!/^\d{1,2}[,.]\d{1,3}$/.test(record.str) || !record.item.transform || record.fontSize < 6.6) return;
    const numeric = Number(record.str.replace(",", "."));
    if (!Number.isFinite(numeric) || numeric < 0.6 || numeric > 60) return;

    const nearbyText = records
      .filter((candidate) => Math.abs(candidate.y - record.y) <= 1.6 && Math.abs(candidate.x - record.x) <= 95)
      .map((candidate) => candidate.str)
      .join(" ");
    if (/NRF\s*:|m²|BRH|Rohhöhe|Fertighöhe|Geländehöhe|ü\.?\s*NHN|ca\.?\s*:/i.test(nearbyText)) return;

    const angle = normalizeAngle(Math.atan2(record.item.transform[1], record.item.transform[0]));
    const horizontalDistance = Math.min(angle, Math.PI - angle);
    const verticalDistance = Math.abs(angle - Math.PI / 2);
    const orientation = horizontalDistance <= 0.18
      ? "horizontal"
      : verticalDistance <= 0.18
        ? "vertical"
        : null;
    if (!orientation) return;

    let value = numeric;
    const decimalCount = record.str.split(/[,.]/)[1]?.length ?? 0;
    const next = records.find((candidate) => (
      candidate.index > record.index
      && candidate.index <= record.index + 3
      && candidate.str === "5"
      && candidate.fontSize < record.fontSize * 0.85
      && Math.abs(candidate.y - record.y) <= 4
      && Math.abs(candidate.x - (record.x + (record.item.width ?? 0))) <= 5
    ));
    if (next && decimalCount === 2) value += 0.005;

    const canvasTransform = multiplyAffine(viewport.transform!, record.item.transform);
    dimensions.push({
      value,
      raw: next ? `${record.str}5` : record.str,
      orientation,
      anchor: { x: canvasTransform[4], y: canvasTransform[5] },
    });
  });

  return dimensions.filter((dimension, index) => !dimensions.some((other, otherIndex) => (
    otherIndex < index
    && other.orientation === dimension.orientation
    && Math.abs(other.value - dimension.value) < 0.0001
    && Math.hypot(other.anchor.x - dimension.anchor.x, other.anchor.y - dimension.anchor.y) < 3
  )));
}

function parsedRoomHeight(value: string) {
  const match = value.match(/\d{1,4}(?:[,.]\d{1,3})?/);
  if (!match) return null;
  const numeric = Number(match[0].replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  const meters = numeric >= 150 && numeric <= 1200 ? numeric / 100 : numeric;
  return meters >= 1.5 && meters <= 12 ? meters : null;
}

/** Reads explicit room-height notes without confusing them with BRH values. */
export function extractPdfRoomHeights(items: PdfTextItemLike[], viewport: PdfViewportLike): PdfRoomHeight[] {
  if (!viewport.transform) return [];
  const heightTag = String.raw`(?:Raumh(?:ö|oe)he|lichte\s+H(?:ö|oe)he|R\.?H\.?|L\.?H\.?)`;
  const explicitPattern = new RegExp(String.raw`\b${heightTag}\s*[:=]?\s*(\d{1,4}(?:[,.]\d{1,3})?)\s*m?\b`, "i");
  const tagOnlyPattern = new RegExp(String.raw`^${heightTag}\s*[:=]?$`, "i");
  const scale = viewport.scale ?? 1;
  const records = items.flatMap((item, index) => {
    const raw = item.str?.replace(/\s+/g, " ").trim() ?? "";
    if (!raw || !item.transform) return [];
    const transform = multiplyAffine(viewport.transform!, item.transform);
    return [{
      index,
      raw,
      anchor: {
        x: transform[4] + ((item.width ?? 0) * scale) / 2,
        y: transform[5],
      },
    }];
  });

  const heights: PdfRoomHeight[] = [];
  records.forEach((record) => {
    const explicit = record.raw.match(explicitPattern);
    if (explicit) {
      const value = parsedRoomHeight(explicit[1]);
      if (value !== null) heights.push({ value, raw: record.raw, anchor: record.anchor, confidence: "explicit" });
      return;
    }
    if (!tagOnlyPattern.test(record.raw)) return;
    const numeric = records
      .filter((candidate) => (
        candidate.index !== record.index
        && Math.abs(candidate.index - record.index) <= 6
        && candidate.anchor.x >= record.anchor.x - 12
        && candidate.anchor.x <= record.anchor.x + 170
        && Math.abs(candidate.anchor.y - record.anchor.y) <= 24
      ))
      .map((candidate) => ({ candidate, value: parsedRoomHeight(candidate.raw) }))
      .filter((candidate): candidate is { candidate: typeof records[number]; value: number } => candidate.value !== null)
      .sort((left, right) => Math.hypot(left.candidate.anchor.x - record.anchor.x, left.candidate.anchor.y - record.anchor.y)
        - Math.hypot(right.candidate.anchor.x - record.anchor.x, right.candidate.anchor.y - record.anchor.y))[0];
    if (numeric) heights.push({
      value: numeric.value,
      raw: `${record.raw} ${numeric.candidate.raw}`,
      anchor: numeric.candidate.anchor,
      confidence: "adjacent",
    });
  });

  return heights.filter((height, index) => !heights.some((other, otherIndex) => (
    otherIndex < index
    && Math.abs(other.value - height.value) < 0.0001
    && Math.hypot(other.anchor.x - height.anchor.x, other.anchor.y - height.anchor.y) < 18
  )));
}

/** Reads room references and names even when an NRF/area line is absent. */
export function extractPdfRoomAnchors(items: PdfTextItemLike[], viewport: PdfViewportLike): PdfRoomAnchor[] {
  if (!viewport.transform) return [];
  const records = items.map((item, index) => ({
    index,
    item,
    str: item.str?.trim() ?? "",
    x: item.transform?.[4] ?? 0,
    y: item.transform?.[5] ?? 0,
  }));
  const anchors: PdfRoomAnchor[] = [];

  records.forEach((record) => {
    if (!/^\d{2}\.\d{2}$/.test(record.str) || !record.item.transform) return;
    const candidates = records
      .filter((candidate) => (
        candidate.str
        && candidate.y <= record.y - 2
        && candidate.y >= record.y - 28
        && Math.abs(candidate.x - record.x) <= 18
        && !/^\d{2}\.\d{2}$/.test(candidate.str)
        && !/^NRF\s*:/i.test(candidate.str)
        && !/^(?:m²?|2)$/i.test(candidate.str)
        && !/^(?:WI|WA|BRH|ZS)[-:]?\d*/i.test(candidate.str)
        && !/^F-\d+/i.test(candidate.str)
      ))
      .sort((left, right) => right.y - left.y || left.x - right.x);
    const nameParts = candidates
      .filter((candidate) => /[A-Za-zÄÖÜäöüß]/.test(candidate.str))
      .slice(0, 2)
      .map((candidate) => candidate.str);
    const name = nameParts.join(" ")
      .replace(/\s+/g, " ")
      .replace(/\s*\/\s*/g, "/")
      .trim();
    if (!name) return;
    const transform = multiplyAffine(viewport.transform!, record.item.transform);
    anchors.push({
      name,
      reference: record.str,
      anchor: { x: transform[4] + ((record.item.width ?? 0) * (viewport.scale ?? 1)) / 2, y: transform[5] + 8 },
    });
  });

  return anchors.filter((anchor, index) => !anchors.some((other, otherIndex) => (
    otherIndex < index && other.reference === anchor.reference
  )));
}

function polygonPerimeter(points: Point[]) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
}

function nearestDimension(value: number, dimensions: PdfDimension[], orientation: PdfDimension["orientation"]) {
  const match = dimensions
    .filter((dimension) => dimension.orientation === orientation && dimension.value >= 0.8)
    .map((dimension) => ({ dimension, relativeError: Math.abs(dimension.value - value) / Math.max(value, 0.01) }))
    .sort((left, right) => left.relativeError - right.relativeError)[0];
  return match && match.relativeError <= 0.075 ? match.dimension : null;
}

export type DimensionAdjustedRoom = DetectedRoom & {
  dimensionMatches: number;
  perimeterMeters: number;
};

export type DimensionNamedRoom = DimensionAdjustedRoom & PdfRoomAnchor;

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

export function selectPdfRoomHeight(
  room: Pick<DetectedRoom, "points"> & { anchor?: Point },
  heights: PdfRoomHeight[],
  metersPerPixel: number,
) {
  if (!heights.length || !Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return null;
  const center = room.anchor ?? {
    x: room.points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, room.points.length),
    y: room.points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, room.points.length),
  };
  const inside = room.points.length >= 3
    ? heights.filter((height) => pointInPolygon(height.anchor, room.points))
    : [];
  const candidates = inside.length ? inside : heights;
  const nearest = candidates.map((height) => ({
    height,
    distance: Math.hypot(height.anchor.x - center.x, height.anchor.y - center.y) * metersPerPixel,
  })).sort((left, right) => left.distance - right.distance)[0];
  if (!nearest) return null;
  if (!inside.length && nearest.distance > 2.4) return null;
  return nearest.height;
}

export function attachPdfRoomNames<T extends DetectedRoom>(rooms: T[], anchors: PdfRoomAnchor[], metersPerPixel: number) {
  const unused = new Set(anchors.map((_, index) => index));
  return rooms.map((room) => {
    const containing = [...unused].find((index) => pointInPolygon(anchors[index].anchor, room.points));
    let anchorIndex = containing;
    if (anchorIndex === undefined) {
      const center = {
        x: room.points.reduce((sum, point) => sum + point.x, 0) / room.points.length,
        y: room.points.reduce((sum, point) => sum + point.y, 0) / room.points.length,
      };
      const nearest = [...unused].map((index) => ({
        index,
        distance: Math.hypot(anchors[index].anchor.x - center.x, anchors[index].anchor.y - center.y) * metersPerPixel,
      })).sort((left, right) => left.distance - right.distance)[0];
      if (nearest?.distance <= 1.2) anchorIndex = nearest.index;
    }
    if (anchorIndex === undefined) return room;
    unused.delete(anchorIndex);
    return { ...room, name: anchors[anchorIndex].name, reference: anchors[anchorIndex].reference };
  });
}

function dimensionAtAnchor(
  anchor: PdfRoomAnchor,
  dimensions: PdfDimension[],
  orientation: PdfDimension["orientation"],
  metersPerPixel: number,
  rawValue?: number,
) {
  const axis = orientation === "horizontal" ? "x" : "y";
  const candidates = dimensions
    .filter((dimension) => dimension.orientation === orientation && dimension.value >= 0.8 && dimension.value <= 9.5)
    .map((dimension) => {
      const axisDistance = Math.abs(dimension.anchor[axis] - anchor.anchor[axis]);
      const rawError = rawValue ? Math.abs(dimension.value - rawValue) / Math.max(rawValue, 0.01) : 0;
      return { dimension, axisDistance, score: axisDistance / 16 + rawError * 2.2 };
    })
    .sort((left, right) => left.score - right.score);
  if (!candidates.length) return null;
  if (rawValue) {
    const best = candidates[0];
    return best.axisDistance <= Math.max(22, best.dimension.value / metersPerPixel * 0.18)
      && Math.abs(best.dimension.value - rawValue) / Math.max(rawValue, 0.01) <= 0.55
      ? best.dimension
      : null;
  }
  const nearestAxis = Math.min(...candidates.map((candidate) => candidate.axisDistance));
  const local = candidates
    .filter((candidate) => candidate.axisDistance <= nearestAxis + 8)
    .sort((left, right) => right.dimension.value - left.dimension.value);
  return local[0]?.axisDistance <= Math.max(26, local[0].dimension.value / metersPerPixel * 0.2)
    ? local[0].dimension
    : null;
}

/**
 * Builds named room geometry from room references plus adjacent dimension
 * chains. It is the fallback for digital plans that name rooms but omit NRF.
 */
export function matchRoomAnchorsToDimensions(
  anchors: PdfRoomAnchor[],
  dimensions: PdfDimension[],
  candidates: DetectedRoom[],
  metersPerPixel: number,
  width: number,
  height: number,
): DimensionNamedRoom[] {
  const unused = new Set(candidates.map((_, index) => index));
  return anchors.flatMap((anchor) => {
    const containing = [...unused].filter((index) => pointInPolygon(anchor.anchor, candidates[index].points));
    let candidateIndex = containing.sort((left, right) => candidates[left].pixelArea - candidates[right].pixelArea)[0];
    if (candidateIndex === undefined) {
      const nearest = [...unused].map((index) => {
        const room = candidates[index];
        const center = {
          x: room.points.reduce((sum, point) => sum + point.x, 0) / room.points.length,
          y: room.points.reduce((sum, point) => sum + point.y, 0) / room.points.length,
        };
        return { index, distance: Math.hypot(center.x - anchor.anchor.x, center.y - anchor.anchor.y) * metersPerPixel };
      }).sort((left, right) => left.distance - right.distance)[0];
      if (nearest?.distance <= 1.8) candidateIndex = nearest.index;
    }

    let points: Point[];
    let confidence = 0.72;
    let widthDimension: PdfDimension | null;
    let heightDimension: PdfDimension | null;
    if (candidateIndex !== undefined) {
      unused.delete(candidateIndex);
      const candidate = candidates[candidateIndex];
      const minX = Math.min(...candidate.points.map((point) => point.x));
      const maxX = Math.max(...candidate.points.map((point) => point.x));
      const minY = Math.min(...candidate.points.map((point) => point.y));
      const maxY = Math.max(...candidate.points.map((point) => point.y));
      const rawWidth = Math.max(0.01, (maxX - minX) * metersPerPixel);
      const rawHeight = Math.max(0.01, (maxY - minY) * metersPerPixel);
      widthDimension = dimensionAtAnchor(anchor, dimensions, "horizontal", metersPerPixel, rawWidth);
      heightDimension = dimensionAtAnchor(anchor, dimensions, "vertical", metersPerPixel, rawHeight);
      const scaleX = widthDimension ? widthDimension.value / rawWidth : 1;
      const scaleY = heightDimension ? heightDimension.value / rawHeight : 1;
      const center = {
        x: candidate.points.reduce((sum, point) => sum + point.x, 0) / candidate.points.length,
        y: candidate.points.reduce((sum, point) => sum + point.y, 0) / candidate.points.length,
      };
      points = candidate.points.map((point) => ({
        x: Math.max(1, Math.min(width - 1, center.x + (point.x - center.x) * scaleX)),
        y: Math.max(1, Math.min(height - 1, center.y + (point.y - center.y) * scaleY)),
      }));
      confidence = Math.max(0.76, candidate.confidence - 0.05);
    } else {
      widthDimension = dimensionAtAnchor(anchor, dimensions, "horizontal", metersPerPixel);
      heightDimension = dimensionAtAnchor(anchor, dimensions, "vertical", metersPerPixel);
      if (!widthDimension && !heightDimension) return [];
      const roomWidth = (widthDimension?.value ?? Math.max(1.2, (heightDimension?.value ?? 3) * 1.2)) / metersPerPixel;
      const roomHeight = (heightDimension?.value ?? Math.max(1.2, (widthDimension?.value ?? 3) / 1.2)) / metersPerPixel;
      const halfWidth = roomWidth / 2;
      const halfHeight = roomHeight / 2;
      const center = {
        x: Math.max(halfWidth + 1, Math.min(width - halfWidth - 1, anchor.anchor.x)),
        y: Math.max(halfHeight + 1, Math.min(height - halfHeight - 1, anchor.anchor.y)),
      };
      points = [
        { x: center.x - halfWidth, y: center.y - halfHeight },
        { x: center.x + halfWidth, y: center.y - halfHeight },
        { x: center.x + halfWidth, y: center.y + halfHeight },
        { x: center.x - halfWidth, y: center.y + halfHeight },
      ];
    }

    const pixelArea = Math.abs(points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2);
    return [{
      ...anchor,
      points,
      pixelArea,
      perimeterMeters: polygonPerimeter(points) * metersPerPixel,
      dimensionMatches: Number(Boolean(widthDimension)) + Number(Boolean(heightDimension)),
      confidence,
    }];
  });
}

/** Snaps a nearly rectilinear detected room to matching written dimensions. */
export function adjustRoomToPdfDimensions(
  room: DetectedRoom,
  dimensions: PdfDimension[],
  metersPerPixel: number,
  width: number,
  height: number,
): DimensionAdjustedRoom {
  const minX = Math.min(...room.points.map((point) => point.x));
  const maxX = Math.max(...room.points.map((point) => point.x));
  const minY = Math.min(...room.points.map((point) => point.y));
  const maxY = Math.max(...room.points.map((point) => point.y));
  const rawWidth = Math.max(0.01, (maxX - minX) * metersPerPixel);
  const rawHeight = Math.max(0.01, (maxY - minY) * metersPerPixel);
  const horizontal = nearestDimension(rawWidth, dimensions, "horizontal");
  const vertical = nearestDimension(rawHeight, dimensions, "vertical");
  const scaleX = horizontal ? horizontal.value / rawWidth : 1;
  const scaleY = vertical ? vertical.value / rawHeight : 1;
  const center = {
    x: room.points.reduce((sum, point) => sum + point.x, 0) / room.points.length,
    y: room.points.reduce((sum, point) => sum + point.y, 0) / room.points.length,
  };
  const points = room.points.map((point) => ({
    x: Math.max(1, Math.min(width - 1, center.x + (point.x - center.x) * scaleX)),
    y: Math.max(1, Math.min(height - 1, center.y + (point.y - center.y) * scaleY)),
  }));
  return {
    ...room,
    points,
    pixelArea: room.pixelArea * scaleX * scaleY,
    dimensionMatches: Number(Boolean(horizontal)) + Number(Boolean(vertical)),
    perimeterMeters: polygonPerimeter(points) * metersPerPixel,
  };
}
