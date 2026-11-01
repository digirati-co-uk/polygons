import type { Point, Polygon } from './polygon';
import type { RenderState, SnapGuide, SnapTarget } from './types';

export function distancePointToLine(point: Point, start: Point, end: Point) {
  const dx = end[0] - start[0],
    dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared))
    : 0;
  const closestPoint: Point = [start[0] + t * dx, start[1] + t * dy];
  return { distance: Math.hypot(point[0] - closestPoint[0], point[1] - closestPoint[1]), closestPoint };
}

export function lineIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const denominator = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(denominator) < 1e-10) return null;
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / denominator;
  const u = -((a[0] - b[0]) * (a[1] - c[1]) - (a[1] - b[1]) * (a[0] - c[0])) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] : null;
}

const CURVE_STEPS = 32;

/** The segment starting at `index` flattened to a polyline (straight segments are just their two ends). */
export function flattenSegment(points: Point[], index: number, steps = CURVE_STEPS): Point[] {
  const a = points[index];
  const b = points[(index + 1) % points.length];
  if (a.length !== 6) return [[a[0], a[1]], [b[0], b[1]]];
  const c1x = a[0] + a[2]!,
    c1y = a[1] + a[3]!,
    c2x = a[0] + a[4]!,
    c2y = a[1] + a[5]!;
  const out: Point[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps,
      u = 1 - t;
    out.push([
      u * u * u * a[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * b[0],
      u * u * u * a[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * b[1],
    ]);
  }
  return out;
}

/** Closest point to `point` on the (possibly curved) segment starting at `index`. */
export function closestPointOnSegment(point: Point, points: Point[], index: number): Point {
  const poly = flattenSegment(points, index);
  let best: Point = poly[0];
  let bestDistance = Infinity;
  for (let k = 1; k < poly.length; k++) {
    const { distance, closestPoint } = distancePointToLine(point, poly[k - 1], poly[k]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = closestPoint;
    }
  }
  return best;
}

const intersections = new WeakMap<Point[], Map<string, Point[]>>();
export function invalidateSnapCache(points: Point[]) {
  intersections.delete(points);
}

/** Explicit thresholds are world units; the configured threshold is CSS pixels. */
export function findAllSnapTargets(
  pointer: Point,
  state: RenderState,
  threshold?: number,
  excludeLineIndex?: number | null,
  /** Only curved edges attract the pointer (what holding Shift does). Ignores the individual snap options. */
  curvesOnly = false
): SnapTarget[] {
  const radius = threshold ?? state.snapThreshold * state.scale;
  const targets: SnapTarget[] = [];
  const bounds = state.slowState.bounds;
  function add(type: SnapTarget['type'], point: Point, source?: SnapTarget['source']) {
    if (
      bounds &&
      (point[0] < bounds.x ||
        point[1] < bounds.y ||
        point[0] > bounds.x + bounds.width ||
        point[1] > bounds.y + bounds.height)
    )
      return;
    const distance = Math.hypot(pointer[0] - point[0], pointer[1] - point[1]);
    if (distance <= radius) targets.push({ type, point, source, distance });
  }
  const sources = [
    { polygon: state.polygon, open: state.isOpen, current: true },
    ...(state.snapSources || []).map((shape) => ({
      polygon: { points: shape.points, boundingBox: null, iedges: null, isBezier: null, bezierLines: [] } as Polygon,
      open: shape.open,
      current: false,
    })),
  ];
  for (const { polygon, open, current } of sources) {
    const points = polygon.points;
    const translating = ['move-shape', 'move-bounding-box', 'move-line'].includes(
      state.slowState.transitionIntentType || ''
    );
    const excluded =
      current && translating
        ? points.map((_, i) => i)
        : current &&
          (state.slowState.transitionIntentType === 'move-point' || (state.isOpen && state.selectedPoints.length === 1))
        ? state.selectedPoints
        : [];
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < points.length - (open ? 1 : 0); i++) {
      const j = (i + 1) % points.length;
      if (i === j || excluded.includes(i) || excluded.includes(j) || (current && i === excludeLineIndex)) continue;
      edges.push([i, j]);
    }
    for (let i = 0; i < points.length; i++) {
      if (excluded.includes(i)) continue;
      if (!curvesOnly && state.slowState.snapToPoints) add('point', [points[i][0], points[i][1]], { pointIndex: i, polygon });
      // Legacy "parallel" means axis alignment. It remains independently configurable.
      if (!curvesOnly && state.slowState.snapToParallel) {
        add('parallel', [pointer[0], points[i][1]], { pointIndex: i, polygon, axis: 'y' });
        add('parallel', [points[i][0], pointer[1]], { pointIndex: i, polygon, axis: 'x' });
      }
    }
    // Straight edges follow "lines"; curved edges follow "curves" (and are snapped as the curve, not its chord).
    for (const [i, j] of edges) {
      if (points[i].length === 6) {
        if (curvesOnly || state.slowState.snapToCurves)
          add('line', closestPointOnSegment(pointer, points, i), { lineIndex: i, polygon });
      } else if (!curvesOnly && state.slowState.snapToLines) {
        add('line', distancePointToLine(pointer, points[i], points[j]).closestPoint, { lineIndex: i, polygon });
      }
    }
    if (!curvesOnly && state.slowState.snapToIntersections && edges.length > 2) {
      let cache = intersections.get(points);
      if (!cache) {
        cache = new Map();
        intersections.set(points, cache);
      }
      const key = `${open}:${excluded.join(',')}:${current ? excludeLineIndex : ''}`;
      let hits = cache.get(key);
      if (!hits) {
        hits = [];
        for (let i = 0; i < edges.length; i++)
          for (let j = i + 1; j < edges.length; j++) {
            const [a, b] = edges[i],
              [c, d] = edges[j];
            if (a === c || a === d || b === c || b === d) continue;
            const hit = lineIntersection(points[a], points[b], points[c], points[d]);
            if (hit) hits.push(hit);
          }
        if (cache.size > 8) cache.clear();
        cache.set(key, hits);
      }
      for (const hit of hits) add('intersection', hit, { polygon });
    }
  }
  if (!curvesOnly && state.slowState.snapToGrid) {
    const grid = state.snapGrid || { spacing: 20 };
    const [sx, sy] = typeof grid.spacing === 'number' ? [grid.spacing, grid.spacing] : grid.spacing;
    const [ox, oy] = grid.origin || [0, 0];
    if (sx > 0 && sy > 0 && Number.isFinite(sx) && Number.isFinite(sy)) {
      add('grid', [ox + Math.round((pointer[0] - ox) / sx) * sx, oy + Math.round((pointer[1] - oy) / sy) * sy]);
    }
  }
  return targets.sort((a, b) => a.distance - b.distance);
}

export function prioritizeSnapTargets(targets: SnapTarget[]): SnapTarget[] {
  const priority = { point: 0, intersection: 1, grid: 2, parallel: 3, line: 4 };
  return targets.sort((a, b) => priority[a.type] - priority[b.type] || a.distance - b.distance);
}

export function createSnapGuides(targets: SnapTarget[], state: RenderState): SnapGuide[] {
  return targets.map((target) => {
    const polygon = target.source?.polygon || state.polygon;
    if (target.type === 'line' && target.source?.lineIndex !== undefined) {
      const i = target.source.lineIndex;
      if (polygon.points[i].length === 6) {
        // Show the curve itself being snapped to.
        return { type: 'line', points: flattenSegment(polygon.points, i), target };
      }
      return {
        type: 'line',
        points: [polygon.points[i], polygon.points[(i + 1) % polygon.points.length], target.point],
        target,
      };
    }
    if (target.type === 'parallel' && target.source?.pointIndex !== undefined) {
      return { type: 'parallel-line', points: [polygon.points[target.source.pointIndex], target.point], target };
    }
    return {
      type: target.type === 'intersection' || target.type === 'grid' ? 'cross' : 'point',
      points: [target.point],
      target,
    };
  });
}

export function updateSnapState(
  pointer: Point,
  state: RenderState,
  maxGuides = 5,
  excludeLineIndex?: number | null,
  curvesOnly = false
): Point | null {
  if (!state.slowState.snapEnabled && !curvesOnly) {
    clearSnapState(state);
    return null;
  }
  const targets = prioritizeSnapTargets(findAllSnapTargets(pointer, state, undefined, excludeLineIndex, curvesOnly));
  if (!targets.length) {
    clearSnapState(state);
    return null;
  }
  let ordered = targets;
  const top = targets[0];
  if (top.type === 'parallel' && top.source?.axis) {
    // Axis alignments each fix one coordinate, so align in both dimensions at once:
    // take x from the nearest vertical alignment and y from the nearest horizontal one.
    const other = targets.find((t) => t.type === 'parallel' && t.source?.axis && t.source.axis !== top.source!.axis);
    if (other) {
      const xTarget = top.source.axis === 'x' ? top : other;
      const yTarget = top.source.axis === 'y' ? top : other;
      const combined: Point = [xTarget.point[0], yTarget.point[1]];
      const pair = [top, other].map((t) => ({ ...t, point: combined }));
      ordered = [...pair, ...targets.filter((t) => t !== top && t !== other)];
    }
  }
  state.snapTargets = ordered;
  state.activeSnapGuides = createSnapGuides(ordered.slice(0, Math.max(maxGuides, 2)), state);
  state.isSnapping = true;
  state.snapPoint = ordered[0].point;
  return state.snapPoint;
}

export function clearSnapState(state: RenderState): void {
  state.snapTargets = [];
  state.activeSnapGuides = [];
  state.isSnapping = false;
  state.snapPoint = null;
}
export function getSnapPoint(state: RenderState) {
  return state.snapPoint;
}
export function isSnappingActive(state: RenderState) {
  return state.isSnapping && state.snapPoint !== null;
}
export function applySnapToPointer(pointer: Point, state: RenderState): Point {
  return isSnappingActive(state) ? state.snapPoint! : pointer;
}

export function clampPoint(point: Point, state: RenderState): Point {
  const b = state.slowState.bounds;
  if (!b) return point;
  const x = Math.max(b.x, Math.min(b.x + b.width, point[0]));
  const y = Math.max(b.y, Math.min(b.y + b.height, point[1]));
  return point.length === 6 ? [x, y, point[2], point[3], point[4], point[5]] : [x, y];
}

export function resolvePoint(
  point: Point,
  state: RenderState,
  options: { disableSnap?: boolean; excludeLineIndex?: number | null } = {}
): Point {
  let resolved = clampPoint(point, state);
  // `disableSnap` (Shift) suspends normal snapping but keeps curved edges active, whatever the settings.
  updateSnapState(resolved, state, 3, options.excludeLineIndex, !!options.disableSnap);
  resolved = applySnapToPointer(resolved, state);
  return resolved;
}
