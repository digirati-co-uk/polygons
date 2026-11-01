import type { Point } from '../polygon';
import { clampPoint, clearSnapState, resolvePoint } from '../snap-utils';
import type { Modifiers, RenderState, TransitionIntent } from '../types';

/** Absolute control points of the segment starting at `index` (straight segments get their thirds). */
function segmentCurve(points: Point[], index: number): [Point, Point, Point, Point] {
  const p0 = points[index];
  const p3 = points[(index + 1) % points.length];
  const c1: Point = p0.length === 6 ? [p0[0] + p0[2]!, p0[1] + p0[3]!] : [p0[0] + (p3[0] - p0[0]) / 3, p0[1] + (p3[1] - p0[1]) / 3];
  const c2: Point =
    p0.length === 6
      ? [p0[0] + p0[4]!, p0[1] + p0[5]!]
      : [p0[0] + ((p3[0] - p0[0]) * 2) / 3, p0[1] + ((p3[1] - p0[1]) * 2) / 3];
  return [[p0[0], p0[1]], c1, c2, [p3[0], p3[1]]];
}

function cubicAt([p0, c1, c2, p3]: [Point, Point, Point, Point], t: number): Point {
  const u = 1 - t;
  const a = u * u * u,
    b = 3 * u * u * t,
    c = 3 * u * t * t,
    d = t * t * t;
  return [a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]];
}

/** Parameter along the segment whose curve point is nearest to `target`. */
function nearestT(curve: [Point, Point, Point, Point], target: Point): number {
  let best = 0.5,
    bestDistance = Infinity;
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const p = cubicAt(curve, t);
    const d = (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = t;
    }
  }
  return best;
}

export const splitLine: TransitionIntent = {
  type: 'split-line',
  label: 'Split line',
  tools: ['pen'],
  modifiers: { Alt: 'Bend line' },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean {
    const lineMode = state.slowState.currentTool === 'line';
    if (modifiers.Meta || lineMode) {
      return false;
    }

    // Are we within X pixels of a line
    if (state.closestLinePoint && state.closestLineDistance < modifiers.proximity) {
      return true;
    }

    // @todo come back to this.
    // const beforeIndex = state.closestLineIndex;
    // const afterIndex = ((state.closestLineIndex + 2) % state.polygon.points.length) - 1;
    //
    // if (state.selectedPoints.includes(beforeIndex) && state.selectedPoints.includes(afterIndex)) {
    //   return false;
    // }

    return false;
  },
  transition(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    const pointer = pointers[0];
    const starting = state.transitionOrigin || pointer;
    const origin = state.closestLinePoint;
    if (!origin) return;
    if (modifiers.Alt) {
      // Bend: instead of inserting a vertex, curve the segment so it passes through the pointer.
      // Moving both control points by the same amount shifts the curve at parameter t by 3t(1-t) times that
      // amount, so we solve for the shift that puts the grabbed spot exactly under the pointer.
      const index = state.closestLineIndex;
      const original = state.polygon.points;
      const curve = segmentCurve(original, index);
      // Keep t away from the ends, where the shift would blow up.
      const t = Math.min(0.85, Math.max(0.15, nearestT(curve, origin)));
      const grabbed = cubicAt(curve, t);
      const wanted = clampPoint(
        [grabbed[0] + pointer[0] - starting[0], grabbed[1] + pointer[1] - starting[1]],
        state
      );
      const k = 3 * t * (1 - t);
      const sx = (wanted[0] - grabbed[0]) / k,
        sy = (wanted[1] - grabbed[1]) / k;
      const [p0, c1, c2] = curve;
      const bent: Point = [
        p0[0],
        p0[1],
        c1[0] + sx - p0[0],
        c1[1] + sy - p0[1],
        c2[0] + sx - p0[0],
        c2[1] + sy - p0[1],
      ];
      clearSnapState(state);
      state.splitBend = true;
      state.activeHandle = wanted;
      state.transitionPoints = original.map((p, i) => (i === index ? bent : p));
      return;
    }
    state.splitBend = false;
    const resolved = resolvePoint([origin[0] + pointer[0] - starting[0], origin[1] + pointer[1] - starting[1]], state, {
      disableSnap: modifiers.Shift,
      excludeLineIndex: state.closestLineIndex,
    });
    state.activeHandle = resolved;
    const points = state.polygon.points;
    const transitionPoints: Point[] = [];
    const dx = resolved[0] - origin[0];
    const dy = resolved[1] - origin[1];

    for (let i = 0; i < points.length; i++) {
      // Add the new point that we are transitioning _after_ the closest line.
      if (state.closestLineIndex === i && points[i].length === 6) {
        // Splitting a curve: cut it where it was grabbed (de Casteljau) so both halves keep the curve's shape.
        const [p0, c1, c2, p3] = segmentCurve(points, i);
        const t = Math.min(0.95, Math.max(0.05, nearestT([p0, c1, c2, p3], origin)));
        const lerp = (a: Point, b: Point): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const q0 = lerp(p0, c1),
          q1 = lerp(c1, c2),
          q2 = lerp(c2, p3);
        const r0 = lerp(q0, q1),
          r1 = lerp(q1, q2);
        const split = lerp(r0, r1);
        const moved: Point = [split[0] + dx, split[1] + dy];
        // The new point's own handles travel with it; the handle belonging to the far end stays put.
        transitionPoints.push([p0[0], p0[1], q0[0] - p0[0], q0[1] - p0[1], r0[0] + dx - p0[0], r0[1] + dy - p0[1]]);
        transitionPoints.push([moved[0], moved[1], r1[0] - split[0], r1[1] - split[1], q2[0] - moved[0], q2[1] - moved[1]]);
        continue;
      }
      transitionPoints.push(points[i]);
      if (state.closestLineIndex === i) {
        const newPoint = state.closestLinePoint!;
        transitionPoints.push([newPoint[0] + dx, newPoint[1] + dy]);
      }
    }
    state.transitionPoints = transitionPoints;
  },
  commit(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    const newPoints = state.transitionPoints!;
    state.transitionPoints = null;
    state.transitionBoundingBox = null;

    if (state.splitBend) {
      state.splitBend = false;
      // Select both ends of the bent segment, matching what "Make curve"/"Straighten" act on.
      return {
        selectedPoints: [state.closestLineIndex!, (state.closestLineIndex! + 1) % newPoints.length],
        points: newPoints,
      };
    }

    return {
      selectedPoints: [state.closestLineIndex! + 1],
      points: newPoints,
    };
  },
};
