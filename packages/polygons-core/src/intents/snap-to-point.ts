import type { Point } from '../polygon';
import type { Modifiers, RenderState, SnapGuide, SnapTarget, TransitionIntent } from '../types';

const SNAP_THRESHOLD = 15;

function findSnapTargets(pointer: Point, state: RenderState, threshold: number): SnapTarget[] {
  const targets: SnapTarget[] = [];
  const [x, y] = pointer;
  const points = state.polygon.points;

  // Find nearby points
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const dx = point[0] - x;
    const dy = point[1] - y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= threshold) {
      targets.push({
        type: 'point',
        point: [point[0], point[1]],
        source: {
          pointIndex: i,
          polygon: state.polygon,
        },
        distance,
      });
    }
  }

  // Sort by distance (closest first)
  return targets.sort((a, b) => a.distance - b.distance);
}

function createSnapGuides(targets: SnapTarget[]): SnapGuide[] {
  return targets.map((target) => ({
    type: 'point' as const,
    points: [target.point],
    target,
  }));
}

export const snapToPoint: TransitionIntent = {
  type: 'snap-to-point',
  label: 'Snap to point',
  tools: ['pointer', 'pen', 'line'],
  modifiers: {
    Shift: 'Disable snapping',
  },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean {
    // Don't snap if Shift is pressed (allows precise positioning)
    if (modifiers.Shift || !state.slowState.snapEnabled || !state.slowState.snapToPoints) {
      return false;
    }

    // Don't snap if we're already transitioning another intent
    if (state.slowState.transitioning && state.slowState.transitionIntentType !== 'snap-to-point') {
      return false;
    }

    const snapTargets = findSnapTargets(pointers[0], state, state.snapThreshold || SNAP_THRESHOLD);
    return snapTargets.length > 0;
  },
  start(pointers: Point[], state: RenderState, _modifiers: Modifiers) {
    const snapTargets = findSnapTargets(pointers[0], state, state.snapThreshold || SNAP_THRESHOLD);

    if (snapTargets.length === 0) {
      return;
    }

    // Store snap targets and activate snapping
    state.snapTargets = snapTargets;
    state.activeSnapGuides = createSnapGuides(snapTargets.slice(0, 3)); // Show up to 3 closest
    state.isSnapping = true;
    state.snapPoint = snapTargets[0].point; // Snap to closest target
  },
  transition(pointers: Point[], state: RenderState, _modifiers: Modifiers) {
    const snapTargets = findSnapTargets(pointers[0], state, state.snapThreshold || SNAP_THRESHOLD);

    if (snapTargets.length === 0) {
      // No snap targets, clear snapping state
      state.snapTargets = [];
      state.activeSnapGuides = [];
      state.isSnapping = false;
      state.snapPoint = null;
      return;
    }

    // Update snap targets and guides
    state.snapTargets = snapTargets;
    state.activeSnapGuides = createSnapGuides(snapTargets.slice(0, 3));
    state.isSnapping = true;
    state.snapPoint = snapTargets[0].point; // Always snap to closest
  },
  commit(_pointers: Point[], state: RenderState, _modifiers: Modifiers) {
    // Clear snapping state
    state.snapTargets = [];
    state.activeSnapGuides = [];
    state.isSnapping = false;
    state.snapPoint = null;
  },
};
