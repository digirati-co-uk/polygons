// # SPDX-License-Identifier: CC0-1.0
// Adapted from: https://math.stackexchange.com/questions/4079605/how-to-find-closest-point-to-polygon-shape-from-any-coordinate

export type Point = [number, number];

export interface Polygon {
  points: Point[];
  boundingBox: { x: number; y: number; width: number; height: number; rotation?: number } | null;
  iedges: null | Point[];
}

export function precalculate(polygon: Polygon) {
  const n = polygon.points.length;
  if (n > 1) {
    polygon.iedges = [];
    let pB = polygon.points[n - 1];

    for (let i = 0; i < n; i++) {
      const pA = pB;
      pB = polygon.points[i];
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
  if (n <= 1) {
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
  if (polygon.points.length > 2) {
    const x1 = Math.min(...polygon.points.map((p) => p[0]));
    const y1 = Math.min(...polygon.points.map((p) => p[1]));
    const x2 = Math.max(0, ...polygon.points.map((p) => p[0]));
    const y2 = Math.max(0, ...polygon.points.map((p) => p[1]));
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

export function perimeterNearestTo(polygon: Polygon, p: Point) {
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
