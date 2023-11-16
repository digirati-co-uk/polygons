import { Modifiers, RenderState, TransitionIntent } from '../types';
import { closestVertex, Point } from '../polygon';

export const movePoint: TransitionIntent = {
  type: 'move-point',
  label: 'Move point',
  modifiers: {
    Shift: 'Constrain to axis',
  },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean {
    // Are we in proximity of any selected points?
    // if (state.selectedPoints.length === 0) {
    //   return false;
    // }

    const threshold = modifiers.proximity * 0.7;

    const [x, y] = pointers[0];
    const points = state.polygon.points;
    const selected = state.selectedPoints;
    // if (selected.length > 1) {
    //   for (let i = 0; i < selected.length; i++) {
    //     const idx = selected[i];
    //     const point = points[idx];
    //     const dx = point[0] - x;
    //     const dy = point[1] - y;
    //     if (dx * dx + dy * dy < threshold * threshold) {
    //       return true;
    //     }
    //   }
    // } else {
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const dx = point[0] - x;
      const dy = point[1] - y;
      if (dx * dx + dy * dy < threshold * threshold) {
        return true;
      }
    }
    // }

    return false;
  },
  start(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    if (state.selectedPoints.length < 2) {
      // We select the closest point.
      const [a, b, idx] = closestVertex(state.polygon, pointers[0]);

      return {
        selectedPoints: [idx],
      };
    }

    if (state.slowState.closestPoint && !state.selectedPoints.includes(state.slowState.closestPoint)) {
      // We select the closest point.
      const idx = state.slowState.closestPoint;

      return {
        selectedPoints: [idx],
      };
    }
  },
  transition(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    // Translate the selected points
    const starting = state.transitionOrigin!;
    const [x, y] = pointers[0];
    const points = state.polygon.points;
    let selectedPoints = state.selectedPoints;

    if (state.slowState.closestPoint) {
      const idx = state.slowState.closestPoint;
      if (selectedPoints.indexOf(idx) === -1) {
        selectedPoints = [idx];
      }
    }

    const transitionPoints: Point[] = [];

    let dx = x - starting[0];
    let dy = y - starting[1];

    if (modifiers.Shift) {
      if (Math.abs(dx) > Math.abs(dy)) {
        dy = 0;
      } else {
        dx = 0;
      }
    }

    for (let i = 0; i < points.length; i++) {
      const selected = selectedPoints.indexOf(i) !== -1;
      if (selected) {
        transitionPoints.push([points[i][0] + dx, points[i][1] + dy]);
      } else {
        transitionPoints.push(points[i]);
      }
    }
    state.transitionPoints = transitionPoints;
  },
  commit(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    const newPoints = state.transitionPoints!;

    state.transitionPoints = null;
    state.transitionBoundingBox = null;

    return { points: newPoints };
  },
};
