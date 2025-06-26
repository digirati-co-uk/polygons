import type { Point } from '../polygon';
import type { Modifiers, RenderState, SnapGuide, SnapTarget, TransitionIntent } from '../types';

const SNAP_THRESHOLD = 15;

function distancePointToLine(
  point: Point,
  lineStart: Point,
  lineEnd: Point,
): { distance: number; closestPoint: Point } {
  const [px, py] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) {
    // Line has no length, return distance to start point
    const dist = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    return { distance: dist, closestPoint: [x1, y1] };
  }

  // Calculate the parameter t for the closest point on the line segment
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (length * length)));

  // Calculate the closest point on the line segment
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const closestPoint: Point = [closestX, closestY];

  // Calculate distance from point to closest point on line
  const distance = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);

  return { distance, closestPoint };
}

function findLineSnapTargets(pointer: Point, state: RenderState, threshold: number): SnapTarget[] {
  const targets: SnapTarget[] = [];
  const points = state.polygon.points;

  // Check each line segment in the polygon
  for (let i = 0; i < points.length; i++) {
    const nextIndex = (i + 1) % points.length;

    // Skip if this would be a line to itself (shouldn't happen but be safe)
    if (i === nextIndex) continue;

    const lineStart = points[i];
    const lineEnd = points[nextIndex];

    const { distance, closestPoint } = distancePointToLine(pointer, lineStart, lineEnd);

    if (distance <= threshold) {
      targets.push({
        type: 'line',
        point: closestPoint,
        source: {
          lineIndex: i,
          polygon: state.polygon,
        },
        distance,
      });
    }
  }

  // Sort by distance (closest first)
  return targets.sort((a, b) => a.distance - b.distance);
}

function createLineSnapGuides(targets: SnapTarget[], state: RenderState): SnapGuide[] {
  return targets.map((target) => {
    const lineIndex = target.source?.lineIndex;
    if (lineIndex === undefined) {
      return {
        type: 'point' as const,
        points: [target.point],
        target,
      };
    }

    const points = state.polygon.points;
    const nextIndex = (lineIndex + 1) % points.length;
    const lineStart = points[lineIndex];
    const lineEnd = points[nextIndex];

    return {
      type: 'line' as const,
      points: [lineStart, lineEnd, target.point], // Line segment + snap point
      target,
    };
  });
}

export const snapToLine: TransitionIntent = {
  type: 'snap-to-line',
  label: 'Snap to line',
  tools: ['pointer', 'pen', 'line'],
  modifiers: {
    Shift: 'Disable snapping',
  },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean {
    // Don't snap if Shift is pressed (allows precise positioning)
    if (modifiers.Shift || !state.slowState.snapEnabled || !state.slowState.snapToLines) {
      return false;
    }

    // Don't snap if we're already transitioning another intent
    if (state.slowState.transitioning && state.slowState.transitionIntentType !== 'snap-to-line') {
      return false;
    }

    const snapTargets = findLineSnapTargets(pointers[0], state, state.snapThreshold || SNAP_THRESHOLD);
    return snapTargets.length > 0;
  },
  start(pointers: Point[], state: RenderState, _modifiers: Modifiers) {
    const snapTargets = findLineSnapTargets(pointers[0], state, state.snapThreshold || SNAP_THRESHOLD);

    if (snapTargets.length === 0) {
      return;
    }

    // Store snap targets and activate snapping
    state.snapTargets = [...(state.snapTargets || []), ...snapTargets];
    state.activeSnapGuides = [
      ...(state.activeSnapGuides || []),
      ...createLineSnapGuides(snapTargets.slice(0, 2), state), // Show up to 2 closest lines
    ];
    state.isSnapping = true;
    state.snapPoint = snapTargets[0].point; // Snap to closest target
  },
  transition(pointers: Point[], state: RenderState, _modifiers: Modifiers) {
    const snapTargets = findLineSnapTargets(pointers[0], state, state.snapThreshold || SNAP_THRESHOLD);

    if (snapTargets.length === 0) {
      // No line snap targets, but keep other snap targets
      const existingTargets = (state.snapTargets || []).filter((t) => t.type !== 'line');
      const existingGuides = (state.activeSnapGuides || []).filter((g) => g.target.type !== 'line');

      state.snapTargets = existingTargets;
      state.activeSnapGuides = existingGuides;

      if (existingTargets.length === 0) {
        state.isSnapping = false;
        state.snapPoint = null;
      }
      return;
    }

    // Update snap targets and guides, keeping existing non-line targets
    const existingNonLineTargets = (state.snapTargets || []).filter((t) => t.type !== 'line');
    const existingNonLineGuides = (state.activeSnapGuides || []).filter((g) => g.target.type !== 'line');

    const allTargets = [...existingNonLineTargets, ...snapTargets];
    allTargets.sort((a, b) => a.distance - b.distance);

    state.snapTargets = allTargets;
    state.activeSnapGuides = [...existingNonLineGuides, ...createLineSnapGuides(snapTargets.slice(0, 2), state)];
    state.isSnapping = true;
    state.snapPoint = allTargets[0].point; // Snap to closest target overall
  },
  commit(_pointers: Point[], state: RenderState, _modifiers: Modifiers) {
    // Clear line-specific snapping state but keep other types
    const existingTargets = (state.snapTargets || []).filter((t) => t.type !== 'line');
    const existingGuides = (state.activeSnapGuides || []).filter((g) => g.target.type !== 'line');

    state.snapTargets = existingTargets;
    state.activeSnapGuides = existingGuides;

    if (existingTargets.length === 0) {
      state.isSnapping = false;
      state.snapPoint = null;
    }
  },
};
