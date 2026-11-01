// # SPDX-License-Identifier: CC0-1.0
// Adapted from: https://math.stackexchange.com/questions/4079605/how-to-find-closest-point-to-polygon-shape-from-any-coordinate

export type Point =
  | [number, number]
  // This is bezier control points, the definition here REQUIRES both points. They are forward on the line.
  | [number, number, number, number, number, number];

export interface Polygon {
  points: Point[];
  boundingBox: { x: number; y: number; width: number; height: number; rotation?: number } | null;
  iedges: null | Point[];
  isBezier: null | boolean;
  bezierLines: [number, Point, Point][];
}

export function precalculate(polygon: Polygon) {
  const n = polygon.points.length;
  let isBezier = false;
  const bezierLines: [number, Point, Point][] = [];
  if (n > 1) {
    polygon.iedges = [];
    let pB = polygon.points[n - 1];

    for (let i = 0; i < n; i++) {
      const pA = pB;
      pB = polygon.points[i];
      if (pB.length === 6) {
        // These points are relative, but bezierLines is absolute.
        const c1x = pB[2];
        const c1y = pB[3];
        const c2x = pB[4];
        const c2y = pB[5];

        bezierLines.push([i, [pB[0] + c1x, pB[1] + c1y], [pB[0] + c2x, pB[1] + c2y]]);

        isBezier = true;
      }
      const pAB = [pB[0] - pA[0], pB[1] - pA[1]];
      const DD = pAB[0] * pAB[0] + pAB[1] * pAB[1];

      if (DD > 0) {
        polygon.iedges.push([pAB[0] / DD, pAB[1] / DD]);
      } else {
        polygon.iedges.push([0, 0]);
      }
    }
  } else if (n === 1) {
    polygon.iedges = [[0, 0]];
  } else {
    polygon.iedges = null;
  }

  polygon.isBezier = isBezier;
  polygon.bezierLines = bezierLines;
}

export function setPoints(polygon: Polygon, newPoints: Point[]) {
  polygon.points = newPoints;
  updateBoundingBox(polygon);
  precalculate(polygon);
}

export function closestVertex(polygon: Polygon, p: Point) {
  let nearestNormsqr = Infinity;
  let nearest: Point | null = null;
  let idx = -1;

  const n = polygon.points.length;
  if (n === 1)
    return [polygon.points[0], (polygon.points[0][0] - p[0]) ** 2 + (polygon.points[0][1] - p[1]) ** 2, 0] as const;
  if (n === 0) {
    return [null, nearestNormsqr, idx] as const;
  }

  let pB = polygon.points[n - 1];
  for (let i = 0; i < n; i++) {
    const pA = pB;
    pB = polygon.points[i];

    const dx = pA[0] - p[0];
    const dy = pA[1] - p[1];
    const normsqr = dx * dx + dy * dy;
    if (normsqr < nearestNormsqr) {
      nearest = pA;
      nearestNormsqr = normsqr;
      idx = i === 0 ? n - 1 : i - 1;
    }
  }

  return [nearest, nearestNormsqr, idx] as const;
}

export function updateBoundingBox(polygon: Polygon) {
  if (polygon.points.length > 0) {
    const x1 = Math.min(...polygon.points.map((p) => p[0]));
    const y1 = Math.min(...polygon.points.map((p) => p[1]));
    const x2 = Math.max(...polygon.points.map((p) => p[0]));
    const y2 = Math.max(...polygon.points.map((p) => p[1]));
    polygon.boundingBox = {
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
    };
    return;
  }
  polygon.boundingBox = null;
}

function normsqr(point: Point): number {
  return point[0] * point[0] + point[1] * point[1];
}

const CURVE_HIT_STEPS = 32;
export function perimeterNearestTo(polygon: Polygon, p: Point, open = false) {
  let nearestNormsqr = Infinity;
  let nearest: Point | null = null;
  let prevIdx = -1;

  let nearestPoints: Point[] = [];

  const n = polygon.points.length;
  if (n <= 1) {
    return [null, nearestNormsqr, nearestPoints, prevIdx] as const;
  }

  // Make sure the iedge vectors have been precalculated.
  if (polygon.iedges === null) {
    precalculate(polygon);
    if (!polygon.iedges) {
      return [null, nearestNormsqr, nearestPoints, prevIdx] as const;
    }
  }

  let pB = polygon.points[n - 1];
  for (let i = 0; i < n; i++) {
    const pA = pB;
    pB = polygon.points[i];

    if (open && i === 0) continue;
    if (pA.length === 6) {
      // A curved segment: hit-test the curve itself (flattened), not its chord.
      const c1x = pA[0] + pA[2]!,
        c1y = pA[1] + pA[3]!,
        c2x = pA[0] + pA[4]!,
        c2y = pA[1] + pA[5]!;
      let px = pA[0],
        py = pA[1];
      for (let k = 1; k <= CURVE_HIT_STEPS; k++) {
        const t = k / CURVE_HIT_STEPS,
          u = 1 - t;
        const x = u * u * u * pA[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * pB[0];
        const y = u * u * u * pA[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * pB[1];
        const dx = x - px,
          dy = y - py;
        const len2 = dx * dx + dy * dy;
        const along = len2 ? Math.max(0, Math.min(1, ((p[0] - px) * dx + (p[1] - py) * dy) / len2)) : 0;
        const qx = px + dx * along,
          qy = py + dy * along;
        const d2 = (qx - p[0]) ** 2 + (qy - p[1]) ** 2;
        if (d2 < nearestNormsqr) {
          nearest = [qx, qy];
          nearestNormsqr = d2;
          nearestPoints = [pA, pB];
          prevIdx = i === 0 ? n - 1 : i - 1;
        }
        px = x;
        py = y;
      }
      continue;
    }
    const t = (p[0] - pA[0]) * polygon.iedges[i][0] + (p[1] - pA[1]) * polygon.iedges[i][1];
    let q: Point;
    if (t <= 0) {
      q = pA;
    } else if (t < 1) {
      q = [(1 - t) * pA[0] + t * pB[0], (1 - t) * pA[1] + t * pB[1]];
    } else {
      q = pB;
    }

    const qq = normsqr([q[0] - p[0], q[1] - p[1]]);
    if (qq < nearestNormsqr) {
      nearest = q;
      nearestNormsqr = qq;
      nearestPoints = [pA, pB];
      prevIdx = i === 0 ? n - 1 : i - 1;
    }
  }

  // What about the two points?
  return [nearest, nearestNormsqr, nearestPoints, prevIdx] as const;
}

/**
 * A curve's second control point is stored relative to the segment's first point but belongs visually to
 * the segment's second point. After anchors move independently, shift it by however much the pair moved apart
 * so the handle travels with the point it is drawn on. `oldPoints` and `newPoints` must line up by index.
 */
export function reattachHandles(oldPoints: Point[], newPoints: Point[], open: boolean): Point[] {
  const n = newPoints.length;
  if (oldPoints.length !== n) return newPoints;
  let result: Point[] | null = null;
  for (let a = 0; a < n; a++) {
    const p = newPoints[a];
    if (p.length !== 6 || (open && a === n - 1)) continue;
    const b = (a + 1) % n;
    const dx = newPoints[b][0] - oldPoints[b][0] - (newPoints[a][0] - oldPoints[a][0]);
    const dy = newPoints[b][1] - oldPoints[b][1] - (newPoints[a][1] - oldPoints[a][1]);
    if (!dx && !dy) continue;
    result = result || newPoints.slice();
    result[a] = [p[0], p[1], p[2]!, p[3]!, p[4]! + dx, p[5]! + dy];
  }
  return result || newPoints;
}
