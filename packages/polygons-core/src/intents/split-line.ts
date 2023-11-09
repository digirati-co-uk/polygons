import { Modifiers, RenderState, TransitionIntent } from '../types';
import { Point } from '../polygon';

export const splitLine: TransitionIntent = {
  type: 'split-line',
  label: 'Split line',
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean {
    if (modifiers.Meta) {
      return false;
    }
    // if (!state.isOpen) return false;

    // Are we within X pixels of a line
    if (state.closestLinePoint && state.closestLineDistance < modifiers.proximity) {
      return true;
    }

    return false;
  },
  transition(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    const starting = state.transitionOrigin!;
    const [x, y] = pointers[0];
    const points = state.polygon.points;
    const transitionPoints: Point[] = [];

    const dx = x - starting[0];
    const dy = y - starting[1];

    for (let i = 0; i < points.length; i++) {
      transitionPoints.push(points[i]);

      // Add the new point that we are transitioning _after_ the closest line.
      if (state.closestLineIndex === i) {
        const newPoint = state.closestLinePoint!;
        transitionPoints.push([newPoint[0] + dx, newPoint[1] + dy]);
      }
    }
    state.transitionPoints = transitionPoints;
  },
  commit(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    // @todo add new point after the closest line using the pointer position.
    const newPoints = state.transitionPoints!;

    state.transitionPoints = null;
    state.transitionBoundingBox = null;

    return {
      selectedPoints: [state.closestLineIndex! + 1],
      points: newPoints,
    };
  },
};
