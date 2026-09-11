import type { Point } from "@/lib/measurements";

export type DetectedRoom = {
  points: Point[];
  pixelArea: number;
  confidence: number;
};

type DetectOptions = {
  metersPerPixel: number;
  minArea: number;
  maxArea?: number;
  gapClosureMeters?: number;
};

type Component = {
  id: number;
  count: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  touchesBorder: boolean;
};

function dilate(source: Uint8Array, width: number, height: number, radius: number) {
  if (radius <= 0) return source;
  const horizontal = new Uint8Array(source.length);
  const result = new Uint8Array(source.length);

  for (let y = 0; y < height; y += 1) {
    let active = 0;
    for (let x = 0; x <= Math.min(width - 1, radius); x += 1) active += source[y * width + x];
    for (let x = 0; x < width; x += 1) {
      horizontal[y * width + x] = active > 0 ? 1 : 0;
      const addX = x + radius + 1;
      const removeX = x - radius;
      if (addX < width) active += source[y * width + addX];
      if (removeX >= 0) active -= source[y * width + removeX];
    }
  }

  for (let x = 0; x < width; x += 1) {
    let active = 0;
    for (let y = 0; y <= Math.min(height - 1, radius); y += 1) active += horizontal[y * width + x];
    for (let y = 0; y < height; y += 1) {
      result[y * width + x] = active > 0 ? 1 : 0;
      const addY = y + radius + 1;
      const removeY = y - radius;
      if (addY < height) active += horizontal[addY * width + x];
      if (removeY >= 0) active -= horizontal[removeY * width + x];
    }
  }

  return result;
}

function retainDenseStrokes(source: Uint8Array, width: number, height: number, minNeighbours = 5) {
  const result = new Uint8Array(source.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let count = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const row = (y + offsetY) * width;
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) count += source[row + x + offsetX];
      }
      // Filled wall bodies occupy most of a 3 x 3 neighbourhood; thin CAD
      // lines usually contribute only three pixels and are discarded.
      result[y * width + x] = count >= minNeighbours ? 1 : 0;
    }
  }
  return result;
}

/**
 * Keeps strokes with a measurable wall body and removes hairlines, axes and
 * dashed construction lines. A real wall must have both cross-section weight
 * and continuous support along its direction; closing the door gaps must not
 * turn a thin dashed grid line into a room boundary.
 */
function retainWallWeight(source: Uint8Array, width: number, height: number) {
  const result = new Uint8Array(source.length);
  const crossRadius = 3;
  const spanRadius = 7;
  const minimumCrossSection = 3;
  const minimumDirectionalSupport = 24;

  const boxCount = (minimumX: number, minimumY: number, maximumX: number, maximumY: number) => {
    let count = 0;
    const startX = Math.max(0, minimumX);
    const endX = Math.min(width - 1, maximumX);
    const startY = Math.max(0, minimumY);
    const endY = Math.min(height - 1, maximumY);
    for (let y = startY; y <= endY; y += 1) {
      const row = y * width;
      for (let x = startX; x <= endX; x += 1) count += source[row + x];
    }
    return count;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!source[index]) continue;
      const horizontalThickness = boxCount(x, y - crossRadius, x, y + crossRadius);
      const verticalThickness = boxCount(x - crossRadius, y, x + crossRadius, y);
      const horizontalSupport = horizontalThickness >= minimumCrossSection
        ? boxCount(x - spanRadius, y - crossRadius, x + spanRadius, y + crossRadius)
        : 0;
      const verticalSupport = verticalThickness >= minimumCrossSection
        ? boxCount(x - crossRadius, y - spanRadius, x + crossRadius, y + spanRadius)
        : 0;
      if (horizontalSupport >= minimumDirectionalSupport || verticalSupport >= minimumDirectionalSupport) {
        result[index] = 1;
      }
    }
  }
  return result;
}

function signedArea(points: Point[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

function direction(from: number, to: number, stride: number) {
  const fromX = from % stride;
  const fromY = Math.floor(from / stride);
  const toX = to % stride;
  const toY = Math.floor(to / stride);
  if (toX > fromX) return 0;
  if (toY > fromY) return 1;
  if (toX < fromX) return 2;
  return 3;
}

function traceComponent(labels: Int32Array, component: Component, width: number, height: number) {
  const stride = width + 1;
  const edges: { from: number; to: number }[] = [];
  const byStart = new Map<number, number[]>();
  const addEdge = (from: number, to: number) => {
    const index = edges.length;
    edges.push({ from, to });
    const list = byStart.get(from);
    if (list) list.push(index);
    else byStart.set(from, [index]);
  };

  for (let y = component.minY; y <= component.maxY; y += 1) {
    for (let x = component.minX; x <= component.maxX; x += 1) {
      const index = y * width + x;
      if (labels[index] !== component.id) continue;
      const topLeft = y * stride + x;
      if (y === 0 || labels[index - width] !== component.id) addEdge(topLeft, topLeft + 1);
      if (x === width - 1 || labels[index + 1] !== component.id) addEdge(topLeft + 1, topLeft + stride + 1);
      if (y === height - 1 || labels[index + width] !== component.id) addEdge(topLeft + stride + 1, topLeft + stride);
      if (x === 0 || labels[index - 1] !== component.id) addEdge(topLeft + stride, topLeft);
    }
  }

  const used = new Uint8Array(edges.length);
  let largestLoop: Point[] = [];
  let largestArea = 0;
  const turnRank = [1, 0, 3, 2];

  for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
    if (used[startIndex]) continue;
    const first = edges[startIndex];
    const loop: Point[] = [{ x: first.from % stride, y: Math.floor(first.from / stride) }];
    let edgeIndex = startIndex;
    let previousDirection = direction(first.from, first.to, stride);
    let closed = false;

    for (let guard = 0; guard <= edges.length; guard += 1) {
      const edge = edges[edgeIndex];
      used[edgeIndex] = 1;
      const vertex = edge.to;
      loop.push({ x: vertex % stride, y: Math.floor(vertex / stride) });
      if (vertex === first.from) {
        closed = true;
        break;
      }
      const candidates = (byStart.get(vertex) ?? []).filter((candidate) => !used[candidate]);
      if (!candidates.length) break;
      candidates.sort((left, right) => {
        const leftTurn = (direction(edges[left].from, edges[left].to, stride) - previousDirection + 4) % 4;
        const rightTurn = (direction(edges[right].from, edges[right].to, stride) - previousDirection + 4) % 4;
        return turnRank.indexOf(leftTurn) - turnRank.indexOf(rightTurn);
      });
      edgeIndex = candidates[0];
      previousDirection = direction(edges[edgeIndex].from, edges[edgeIndex].to, stride);
    }

    if (!closed || loop.length < 4) continue;
    loop.pop();
    const area = Math.abs(signedArea(loop));
    if (area > largestArea) {
      largestArea = area;
      largestLoop = loop;
    }
  }

  return largestLoop;
}

function removeCollinear(points: Point[]) {
  if (points.length < 4) return points;
  return points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x);
  });
}

function pointLineDistance(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function simplifyOpen(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  let furthest = 0;
  let furthestIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = pointLineDistance(points[index], points[0], points.at(-1)!);
    if (current > furthest) {
      furthest = current;
      furthestIndex = index;
    }
  }
  if (furthest <= tolerance) return [points[0], points.at(-1)!];
  return [
    ...simplifyOpen(points.slice(0, furthestIndex + 1), tolerance).slice(0, -1),
    ...simplifyOpen(points.slice(furthestIndex), tolerance),
  ];
}

function simplifyClosed(points: Point[], tolerance: number) {
  const clean = removeCollinear(points);
  if (clean.length <= 8) return clean;
  let splitIndex = 1;
  let furthest = 0;
  for (let index = 1; index < clean.length; index += 1) {
    const current = Math.hypot(clean[index].x - clean[0].x, clean[index].y - clean[0].y);
    if (current > furthest) {
      furthest = current;
      splitIndex = index;
    }
  }
  const first = simplifyOpen(clean.slice(0, splitIndex + 1), tolerance);
  const second = simplifyOpen([...clean.slice(splitIndex), clean[0]], tolerance);
  return removeCollinear([...first.slice(0, -1), ...second.slice(0, -1)]);
}

function lineIntersection(a: Point, b: Point, c: Point, d: Point) {
  const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denominator) < 0.0001) return null;
  const first = a.x * b.y - a.y * b.x;
  const second = c.x * d.y - c.y * d.x;
  return {
    x: (first * (c.x - d.x) - (a.x - b.x) * second) / denominator,
    y: (first * (c.y - d.y) - (a.y - b.y) * second) / denominator,
  };
}

function offsetPolygon(points: Point[], amount: number, width: number, height: number) {
  if (points.length < 3 || amount <= 0) return points;
  const orientation = signedArea(points) >= 0 ? 1 : -1;
  const result: Point[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const previousLength = Math.max(0.001, Math.hypot(current.x - previous.x, current.y - previous.y));
    const nextLength = Math.max(0.001, Math.hypot(next.x - current.x, next.y - current.y));
    const previousNormal = {
      x: orientation * (current.y - previous.y) / previousLength,
      y: orientation * -(current.x - previous.x) / previousLength,
    };
    const nextNormal = {
      x: orientation * (next.y - current.y) / nextLength,
      y: orientation * -(next.x - current.x) / nextLength,
    };
    const previousA = { x: previous.x + previousNormal.x * amount, y: previous.y + previousNormal.y * amount };
    const previousB = { x: current.x + previousNormal.x * amount, y: current.y + previousNormal.y * amount };
    const nextA = { x: current.x + nextNormal.x * amount, y: current.y + nextNormal.y * amount };
    const nextB = { x: next.x + nextNormal.x * amount, y: next.y + nextNormal.y * amount };
    const intersection = lineIntersection(previousA, previousB, nextA, nextB);
    const fallback = {
      x: current.x + (previousNormal.x + nextNormal.x) * amount * 0.72,
      y: current.y + (previousNormal.y + nextNormal.y) * amount * 0.72,
    };
    const candidate = intersection && Math.hypot(intersection.x - current.x, intersection.y - current.y) <= amount * 3.2
      ? intersection
      : fallback;
    result.push({
      x: Math.max(1, Math.min(width - 1, candidate.x)),
      y: Math.max(1, Math.min(height - 1, candidate.y)),
    });
  }

  return result;
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

export function detectEnclosedRooms(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: DetectOptions,
) {
  const { metersPerPixel, minArea, maxArea = 250, gapClosureMeters = 0.5 } = options;
  const wallMask = new Uint8Array(width * height);
  const neutralHistogram = new Uint32Array(256);
  for (let index = 0; index < wallMask.length; index += 1) {
    const offset = index * 4;
    const alpha = pixels[offset + 3] / 255;
    if (alpha < 0.08) continue;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    wallMask[index] = luminance < 202 ? 1 : 0;
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (luminance >= 55 && luminance <= 195 && chroma <= 8) neutralHistogram[Math.round(luminance)] += 1;
  }

  let wallTone = 0;
  let wallTonePixels = 0;
  for (let tone = 55; tone <= 195; tone += 1) {
    if (neutralHistogram[tone] > wallTonePixels) {
      wallTone = tone;
      wallTonePixels = neutralHistogram[tone];
    }
  }
  const filledWallMask = new Uint8Array(width * height);
  let filledWallPixels = 0;
  if (wallTone) {
    for (let index = 0; index < wallMask.length; index += 1) {
      const offset = index * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (Math.abs(luminance - wallTone) <= 38 && chroma <= 14) {
        filledWallMask[index] = 1;
        filledWallPixels += 1;
      }
    }
  }

  // Architectural PDFs contain many dark one-pixel objects (furniture,
  // dimension lines, hatches). Keep dense wall bodies and discard isolated
  // thin strokes before door gaps are closed.
  // Many CAD plans render wall bodies with a neutral grey fill while
  // dimensions and furniture are black hairlines. Prefer that fill whenever
  // the page contains enough of it; retain the dark-stroke fallback for plain
  // black-and-white plans.
  const hasFilledWalls = filledWallPixels >= Math.max(350, width * height * 0.0012);
  const denseMask = retainDenseStrokes(
    hasFilledWalls ? filledWallMask : wallMask,
    width,
    height,
    hasFilledWalls ? 3 : 5,
  );
  const structuralMask = retainWallWeight(denseMask, width, height);
  const closureRadius = Math.max(4, Math.min(20, Math.round(gapClosureMeters / Math.max(metersPerPixel, 0.001))));
  const closedMask = dilate(structuralMask, width, height, closureRadius);
  const labels = new Int32Array(width * height);
  const queue = new Int32Array(width * height);
  const components: Component[] = [];
  let componentId = 0;

  for (let seed = 0; seed < labels.length; seed += 1) {
    if (closedMask[seed] || labels[seed]) continue;
    componentId += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    labels[seed] = componentId;
    const component: Component = {
      id: componentId,
      count: 0,
      minX: width,
      minY: height,
      maxX: 0,
      maxY: 0,
      touchesBorder: false,
    };

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      component.count += 1;
      component.minX = Math.min(component.minX, x);
      component.minY = Math.min(component.minY, y);
      component.maxX = Math.max(component.maxX, x);
      component.maxY = Math.max(component.maxY, y);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) component.touchesBorder = true;

      if (x > 0) {
        const next = index - 1;
        if (!closedMask[next] && !labels[next]) { labels[next] = componentId; queue[tail++] = next; }
      }
      if (x < width - 1) {
        const next = index + 1;
        if (!closedMask[next] && !labels[next]) { labels[next] = componentId; queue[tail++] = next; }
      }
      if (y > 0) {
        const next = index - width;
        if (!closedMask[next] && !labels[next]) { labels[next] = componentId; queue[tail++] = next; }
      }
      if (y < height - 1) {
        const next = index + width;
        if (!closedMask[next] && !labels[next]) { labels[next] = componentId; queue[tail++] = next; }
      }
    }
    components.push(component);
  }

  const candidates = components.flatMap((component) => {
    const boxWidth = component.maxX - component.minX + 1;
    const boxHeight = component.maxY - component.minY + 1;
    const boxArea = boxWidth * boxHeight;
    const area = component.count * metersPerPixel * metersPerPixel;
    const fillRatio = component.count / Math.max(1, boxArea);
    const aspect = Math.max(boxWidth / Math.max(1, boxHeight), boxHeight / Math.max(1, boxWidth));
    if (
      component.touchesBorder
      || area < minArea
      || area > maxArea
      || boxWidth * metersPerPixel < 0.65
      || boxHeight * metersPerPixel < 0.65
      || fillRatio < 0.18
      || aspect > 8
      || boxArea > width * height * 0.62
    ) return [];

    const raw = traceComponent(labels, component, width, height);
    if (raw.length < 4) return [];
    let tolerance = Math.max(1.3, closureRadius * 0.16);
    let points = simplifyClosed(raw, tolerance);
    while (points.length > 36 && tolerance < 14) {
      tolerance *= 1.55;
      points = simplifyClosed(raw, tolerance);
    }
    if (points.length > 36) {
      const stride = Math.ceil(points.length / 32);
      points = points.filter((_, index) => index % stride === 0);
    }
    // Restore the room boundary after the closing dilation. The slight raster
    // edge allowance keeps inner room dimensions true to scale; the previous
    // partial compensation systematically reduced room areas.
    points = offsetPolygon(points, closureRadius * 1.1, width, height);
    if (points.length < 3) return [];
    const polygonArea = Math.abs(signedArea(points));
    const rectilinearEdges = points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      const angle = Math.atan2(next.y - point.y, next.x - point.x);
      const alignment = Math.abs(Math.sin(angle * 2));
      return sum + (alignment < 0.24 ? 1 : 0);
    }, 0) / points.length;
    const confidence = Math.max(0.55, Math.min(0.96, 0.58 + fillRatio * 0.2 + rectilinearEdges * 0.18));
    return [{ points, pixelArea: polygonArea, confidence } satisfies DetectedRoom];
  });

  const withoutNestedArtifacts = candidates.filter((candidate) => {
    const center = {
      x: candidate.points.reduce((sum, point) => sum + point.x, 0) / candidate.points.length,
      y: candidate.points.reduce((sum, point) => sum + point.y, 0) / candidate.points.length,
    };
    return !candidates.some((other) => (
      other !== candidate
      && other.pixelArea > candidate.pixelArea * 2.5
      && pointInPolygon(center, other.points)
    ));
  });

  return withoutNestedArtifacts
    .sort((left, right) => {
      const leftY = Math.min(...left.points.map((point) => point.y));
      const rightY = Math.min(...right.points.map((point) => point.y));
      if (Math.abs(leftY - rightY) > 18) return leftY - rightY;
      return Math.min(...left.points.map((point) => point.x)) - Math.min(...right.points.map((point) => point.x));
    })
    .slice(0, 80);
}
