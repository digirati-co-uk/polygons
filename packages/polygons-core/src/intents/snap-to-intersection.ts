import type { Point } from '../polygon';
import type { Modifiers, RenderState, SnapGuide, SnapTarget, TransitionIntent } from '../types';

const SNAP_THRESHOLD = 15;

function lineIntersection(line1Start: Point, line1End: Point, line2Start: Point, line2End: Point): Point | null {
  const [x1, y1] = line1Start;
  const [x2, y2] = line1End;
  const [x3, y3] = line2Start;
  const [x4, y4] = line2End;

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  // Lines are parallel
  if (Math.abs(denominator) < 1e-10) {
    return null;
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;

  // Check if intersection is within both line segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    const intersectionX = x1 + t * (x2 - x1);
    const intersectionY = y1 + t * (y2 - y1);
    return [intersectionX, intersectionY];
  }

  return null;
}

function findIntersectionSnapTargets(pointer: Point, state: RenderState, threshold: number): SnapTarget[] {
  const targets: SnapTarget[] = [];
  const [px, py] = pointer;
  const points = state.polygon.points;

  // Check all possible line intersections
  for (let i = 0; i < points.length; i++) {
    const nextI = (i + 1) % points.length;
    const line1Start = points[i];
    const line1End = points[nextI];

    for (let j = i + 2; j < points.length; j++) {
      const nextJ = (j + 1) % points.length;

      // Skip adjacent lines and avoid checking the same line twice
      if (j === nextI || nextJ === i) continue;

      const line2Start = points[j];
      const line2End = points[nextJ];

      const intersection = lineIntersection(line1Start, line1End, line2Start, line2End);

      if (intersection) {
        const [ix, iy] = intersection;
        const distance = Math.sqrt((px - ix) ** 2 + (py - iy) ** 2);

        if (distance <= threshold) {
          targets.push({
            type: 'intersection',
            point: intersection,
            source: {
              lineIndex: i,
              polygon: state.polygon,
            },
            distance,
          });
        }
      }
    }
  }

  // Sort by distance (closest first)
  return targets.sort((a, b) => a.distance - b.distance);
}

function createIntersectionSnapGuides(targets: SnapTarget[], _state: RenderState): SnapGuide[] {
  return targets.map((target) => ({
    type: 'cross' as const,
    points: [target.point], // Just the intersection point
    target,
  }));
}

export const snapToIntersection: TransitionIntent = {
  type: 'snap-to-intersection',
  label: 'Snap to intersection',
  tools: ['pointer', 'pen', 'line'],
  modifiers: {
    Shift: 'Disable snapping',
  },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean {
    // Don't snap if Shift is pressed (allows precise positioning)
    if (modifiers.Shift || !state.slowState.snapEnabled || !state.slowState.snapToIntersections) {
      return false;
    }

    // Don't snap if we're already transitioning another intent
    if (state.slowState.transitioning && state.slowState.transitionIntentType !== 'snap-to-intersection') {
      return false;
    }

    // Need at least 4 points to have intersections
    if (state.polygon.points.length < 4) {
      return false;
    }

    const snapTargets = findIntersectionSnapTargets(pointers[0], state, state.snapThreshold || SNAP_THRESHOLD);
    return snapTargets.length > 0;
  },
  start(pointers: Point[], state: RenderState, _modifiers: Modifiers) {
    const snapTargets = findIntersectionSnapTargets(pointers[0], state, state.snapThreshold || SNAP_THRESHOLD);

    if (snapTargets.length === 0) {
      return;
    }

    // Store snap targets and activate snapping
    state.snapTargets = [...(state.snapTargets || []), ...snapTargets];
    state.activeSnapGuides = [
      ...(state.activeSnapGuides || []),
      ...createIntersectionSnapGuides(snapTargets.slice(0, 3), state), // Show up to 3 closest intersections
    ];
    state.isSnapping = true;

    // Update snap point to closest overall target
    const allTargets = state.snapTargets.sort((a, b) => a.distance - b.distance);
    state.snapPoint = allTargets[0].point;
  },
  transition(pointers: Point[], state: RenderState, _modifiers: Modifiers) {
    const snapTargets = findIntersectionSnapTargets(pointers[0], state, state.snapThreshold || SNAP_THRESHOLD);

    if (snapTargets.length === 0) {
      // No intersection snap targets, but keep other snap targets
      const existingTargets = (state.snapTargets || []).filter((t) => t.type !== 'intersection');
      const existingGuides = (state.activeSnapGuides || []).filter((g) => g.target.type !== 'intersection');

      state.snapTargets = existingTargets;
      state.activeSnapGuides = existingGuides;

      if (existingTargets.length === 0) {
        state.isSnapping = false;
        state.snapPoint = null;
      } else {
        const allTargets = existingTargets.sort((a, b) => a.distance - b.distance);
        state.snapPoint = allTargets[0].point;
      }
      return;
    }

    // Update snap targets and guides, keeping existing non-intersection targets
    const existingNonIntersectionTargets = (state.snapTargets || []).filter((t) => t.type !== 'intersection');
    const existingNonIntersectionGuides = (state.activeSnapGuides || []).filter(
      (g) => g.target.type !== 'intersection',
    );

    const allTargets = [...existingNonIntersectionTargets, ...snapTargets];
    allTargets.sort((a, b) => a.distance - b.distance);

    state.snapTargets = allTargets;
    state.activeSnapGuides = [
      ...existingNonIntersectionGuides,
      ...createIntersectionSnapGuides(snapTargets.slice(0, 3), state),
    ];
    state.isSnapping = true;
    state.snapPoint = allTargets[0].point; // Snap to closest target overall
  },
  commit(_pointers: Point[], state: RenderState, _modifiers: Modifiers) {
    // Clear intersection-specific snapping state but keep other types
    const existingTargets = (state.snapTargets || []).filter((t) => t.type !== 'intersection');
    const existingGuides = (state.activeSnapGuides || []).filter((g) => g.target.type !== 'intersection');

    state.snapTargets = existingTargets;
    state.activeSnapGuides = existingGuides;

    if (existingTargets.length === 0) {
      state.isSnapping = false;
      state.snapPoint = null;
    }
  },
};
